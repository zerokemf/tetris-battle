// Real two-browser P2P acceptance test using the vendored Trystero/Nostr client.
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');

const CDP_PORT = 9567;
const GAME_URL = process.env.P2P_GAME_URL || 'http://127.0.0.1:8777/index.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function httpJson(path, method = 'GET', port = CDP_PORT) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (error) { reject(error); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function connectWebSocket(wsUrl) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const url = new URL(wsUrl);
        const socket = net.connect(Number(url.port), '127.0.0.1', () => {
            socket.write(
                `GET ${url.pathname}${url.search} HTTP/1.1\r\n` +
                `Host: 127.0.0.1:${url.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
                `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
            );
        });
        let buffer = Buffer.alloc(0);
        let upgraded = false;
        let messageId = 0;
        const pending = new Map();
        const handlers = {};

        function sendFrame(payload) {
            const mask = crypto.randomBytes(4);
            const length = payload.length;
            let header;
            if (length < 126) header = Buffer.from([0x81, 0x80 | length]);
            else if (length < 65536) header = Buffer.from([0x81, 0x80 | 126, length >> 8, length & 0xff]);
            else throw new Error('Outgoing CDP payload too large');
            const masked = Buffer.alloc(length);
            for (let i = 0; i < length; i++) masked[i] = payload[i] ^ mask[i % 4];
            socket.write(Buffer.concat([header, mask, masked]));
        }

        const api = {
            on(event, handler) { handlers[event] = handler; },
            send(method, params = {}) {
                return new Promise((resolveMessage, rejectMessage) => {
                    const id = ++messageId;
                    pending.set(id, { resolveMessage, rejectMessage });
                    sendFrame(Buffer.from(JSON.stringify({ id, method, params })));
                });
            },
            close() { socket.end(); }
        };

        socket.on('data', chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            if (!upgraded) {
                const end = buffer.indexOf('\r\n\r\n');
                if (end < 0) return;
                const status = buffer.slice(0, end).toString().split('\r\n')[0];
                if (!status.includes('101')) return reject(new Error(`WebSocket upgrade failed: ${status}`));
                upgraded = true;
                buffer = buffer.slice(end + 4);
                resolve(api);
            }
            while (buffer.length >= 2) {
                const opcode = buffer[0] & 0x0f;
                let length = buffer[1] & 0x7f;
                let offset = 2;
                if (length === 126) {
                    if (buffer.length < 4) return;
                    length = buffer.readUInt16BE(2); offset = 4;
                } else if (length === 127) {
                    if (buffer.length < 10) return;
                    length = Number(buffer.readBigUInt64BE(2)); offset = 10;
                }
                if (buffer.length < offset + length) return;
                const text = buffer.slice(offset, offset + length).toString();
                buffer = buffer.slice(offset + length);
                if (opcode !== 1) continue;
                try {
                    const message = JSON.parse(text);
                    if (message.id && pending.has(message.id)) {
                        const promise = pending.get(message.id);
                        pending.delete(message.id);
                        if (message.error) promise.rejectMessage(new Error(JSON.stringify(message.error)));
                        else promise.resolveMessage(message.result);
                    } else if (message.method && handlers[message.method]) {
                        handlers[message.method](message.params);
                    }
                } catch (_) {}
            }
        });
        socket.on('error', reject);
    });
}

async function createPage(name, width = 1280, height = 800, initialUrl = `${GAME_URL}?p2p=${name}-${Date.now()}`, cdpPort = CDP_PORT) {
    const target = await httpJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT', cdpPort);
    const cdp = await connectWebSocket(target.webSocketDebuggerUrl);
    const consoleErrors = [];
    const pageErrors = [];
    cdp.on('Runtime.consoleAPICalled', event => {
        if (event.type === 'error') {
            const text = event.args.map(arg => arg.value || arg.description || '').join(' ');
            if (!/favicon/i.test(text)) consoleErrors.push(text.slice(0, 500));
        }
    });
    cdp.on('Runtime.exceptionThrown', event => {
        pageErrors.push((event.exceptionDetails.exception?.description || event.exceptionDetails.text || '').slice(0, 500));
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    async function evaljs(expression) {
        const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(`${name} JS: ${JSON.stringify(result.exceptionDetails).slice(0, 700)}`);
        return result.result?.value;
    }

    async function waitFor(expression, timeoutMs = 30000, label = expression) {
        const start = Date.now();
        let last;
        while (Date.now() - start < timeoutMs) {
            try {
                last = await evaljs(expression);
                if (last) return last;
            } catch (_) {}
            await sleep(150);
        }
        throw new Error(`${name} timeout: ${label}; last=${JSON.stringify(last)}`);
    }

    async function screenshot(filename) {
        const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filename, Buffer.from(result.data, 'base64'));
    }

    await cdp.send('Page.navigate', { url: initialUrl });
    await waitFor(`document.readyState === 'complete' && !!window.onlineBattle && !!window.TetrisBattleOnlineApi`, 15000, 'app loaded');

    return {
        name, target, cdp, cdpPort, evaljs, waitFor, screenshot, consoleErrors, pageErrors,
        async close() {
            try { await evaljs(`onlineBattle.leaveRoom()`); } catch (_) {}
            try { await cdp.send('Page.close'); } catch (_) {}
            cdp.close();
        }
    };
}

let passes = 0;
let failures = 0;
function assert(condition, message) {
    if (condition) { passes++; console.log(`  ✓ ${message}`); }
    else { failures++; console.log(`  ✗ FAIL: ${message}`); }
}
function section(name) { console.log(`\n== ${name} ==`); }

(async () => {
    const pages = [];
    try {
        const host = await createPage('host'); pages.push(host);

        section('Vendored P2P client and lobby UI');
        assert(await host.evaljs(`onlineBattle.libraryVersion === 'trystero-0.25.3-nostr'`), 'vendored Trystero 0.25.3 Nostr strategy is loaded');
        assert(await host.evaljs(`document.querySelectorAll('#mode-section .mode-btn').length === 3`), 'ONLINE appears beside SOLO and BATTLE');
        await host.evaljs(`openOnlineLobby(); onlineBattle.createRoom()`);
        const roomCode = await host.waitFor(`onlineBattle.roomCode.length === 6 && onlineBattle.phase === 'lobby' && onlineBattle.roomCode`, 15000, 'host room created');
        assert(/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode), `host receives an unambiguous six-character code (${roomCode})`);
        assert(await host.evaljs(`new URL(location.href).searchParams.get('room') === '${roomCode}'`), 'invite room code is reflected in URL');

        const inviteUrl = `${GAME_URL}?room=${roomCode}`;
        const guest = await createPage('guest', 1280, 800, inviteUrl, 9568); pages.push(guest);
        assert(host.cdpPort === 9567 && guest.cdpPort === 9568, 'host and guest run in separate Chrome processes and profiles');
        await Promise.all([
            host.waitFor(`onlineBattle.connected`, 40000, 'host peer connected'),
            guest.waitFor(`onlineBattle.connected`, 40000, 'guest peer connected')
        ]);
        assert(await host.evaljs(`onlineBattle.role === 'host'`) && await guest.evaljs(`onlineBattle.role === 'guest'`), 'handshake assigns deterministic host and guest roles');
        assert(await guest.evaljs(`onlineBattle.roomCode === '${roomCode}'`), 'invite URL automatically joins the same room code');
        await Promise.all([
            host.waitFor(`onlineBattle.latency !== null && !document.getElementById('online-ready-btn').disabled`, 5000, 'host clock synchronized'),
            guest.waitFor(`onlineBattle.latency !== null && !document.getElementById('online-ready-btn').disabled`, 5000, 'guest clock synchronized')
        ]);
        assert(true, 'READY unlocks only after initial latency and clock synchronization');
        await host.screenshot('/tmp/tetris-p2p-lobby.png');

        section('Two-player admission and room-full rejection');
        const third = await createPage('third', 1280, 800, undefined, 9568); pages.push(third);
        await third.evaljs(`openOnlineLobby(); document.getElementById('online-room-input').value='${roomCode}'; document.getElementById('online-join-form').requestSubmit()`);
        const fullMessage = await third.waitFor(`document.getElementById('online-error').textContent.includes('房間已有兩位') && document.getElementById('online-error').textContent`, 30000, 'third peer rejected');
        assert(fullMessage.includes('房間已有兩位'), 'third player receives explicit room-full message');
        assert(await host.evaljs(`document.getElementById('online-error').classList.contains('hidden') && onlineBattle.connected`),
            'room-full rejection stays non-disruptive for the host');
        assert(await host.evaljs(`onlineBattle.connected`) && await guest.evaljs(`onlineBattle.connected`), 'third-player rejection does not disturb accepted peers');
        await third.close();
        pages.pop();

        section('Ready, synchronized countdown and fair seed');
        await guest.evaljs(`document.getElementById('online-ready-btn').click()`);
        await host.evaljs(`document.getElementById('online-ready-btn').click()`);
        await Promise.all([
            host.waitFor(`onlineBattle.phase === 'playing' && TetrisBattleOnlineApi.isRunning`, 12000, 'host match started'),
            guest.waitFor(`onlineBattle.phase === 'playing' && TetrisBattleOnlineApi.isRunning`, 12000, 'guest match started')
        ]);
        const hostMatch = await host.evaljs(`({id:onlineBattle.matchId,seed:onlineBattle.matchSeed,next:game.nextQueue.join('')})`);
        const guestMatch = await guest.evaljs(`({id:onlineBattle.matchId,seed:onlineBattle.matchSeed,next:game.nextQueue.join('')})`);
        assert(hostMatch.id === guestMatch.id && hostMatch.seed === guestMatch.seed, 'both peers start the same match ID and seed');
        assert(hostMatch.next === guestMatch.next, `seeded 7-bag starts with the same queue (${hostMatch.next})`);
        assert(await host.evaljs(`document.getElementById('battle-pause-btn').classList.contains('hidden')`), 'online match cannot be paused unilaterally');

        section('Stable battle geometry');
        await sleep(2300); // cover a live P2P latency refresh while gameplay is visible
        const stableNetworkLabel = await host.evaljs(`document.getElementById('difficulty-display').textContent`);
        assert(stableNetworkLabel === 'ONLINE P2P', `latency refresh does not rewrite the layout label (${stableNetworkLabel})`);
        const clearGeometry = await host.evaljs(`(async()=>{
            const wrapper=document.getElementById('p-board').parentElement;
            wrapper.classList.remove('shake','shake-heavy');
            const base=wrapper.getBoundingClientRect();
            const savedAttack=game.onAttack;
            game.onAttack=null;
            game.grid[18]=Array(10).fill('j');
            game.grid[19]=Array(10).fill('l');
            game.clearLines();
            game.onAttack=savedAttack;
            const points=[];
            const started=performance.now();
            while(performance.now()-started<380){
                await new Promise(resolve=>requestAnimationFrame(resolve));
                const rect=wrapper.getBoundingClientRect();
                points.push({x:rect.x-base.x,y:rect.y-base.y});
            }
            return {
                movingClass:wrapper.classList.contains('shake')||wrapper.classList.contains('shake-heavy'),
                maxShift:Math.max(...points.map(point=>Math.max(Math.abs(point.x),Math.abs(point.y))))
            };
        })()`);
        assert(!clearGeometry.movingClass && clearGeometry.maxShift <= 0.25,
            `multi-line clears keep the active board stationary (max shift=${clearGeometry.maxShift.toFixed(2)}px)`);
        const previewAttributeChurn = await host.evaljs(`(async()=>{
            const canvases=['p-hold','p-next1','p-next2','p-next3','a-hold','a-next1','a-next2','a-next3']
                .map(id=>document.getElementById(id));
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            let mutations=0;
            const observer=new MutationObserver(records=>{
                mutations+=records.filter(record=>record.attributeName==='width'||record.attributeName==='height').length;
            });
            canvases.forEach(canvas=>observer.observe(canvas,{attributes:true,attributeFilter:['width','height']}));
            await new Promise(resolve=>setTimeout(resolve,500));
            observer.disconnect();
            return mutations;
        })()`);
        assert(previewAttributeChurn === 0,
            `Hold/Next canvases keep stable backing stores during gameplay (${previewAttributeChurn} resize mutations / 500ms)`);
        await host.screenshot('/tmp/tetris-p2p-match.png');

        section('Bidirectional state and attack synchronization');
        await host.evaljs(`game.score=8765; game.lines=9; game.grid[19][0]='z'; game.piece.x=1`);
        await guest.waitFor(`aiGame.score === 8765 && aiGame.lines === 9 && aiGame.grid[19][0] === 'z' && aiGame.piece.x === 1`, 5000, 'host state reaches guest');
        assert(true, 'host board, active piece and stats reach guest display');

        await guest.evaljs(`game.score=4321; game.grid[18][9]='i'; game.piece.x=6`);
        await host.waitFor(`aiGame.score === 4321 && aiGame.grid[18][9] === 'i' && aiGame.piece.x === 6`, 5000, 'guest state reaches host');
        assert(true, 'guest board, active piece and stats reach host display');

        await host.evaljs(`onlineBattle.handleLocalAttack(4,{bomb:false,b2b:0,pc:false})`);
        const receivedGarbage = await guest.waitFor(`game.garbageQueue.reduce((sum,item)=>sum+item.lines,0) >= 4 && game.garbageQueue.reduce((sum,item)=>sum+item.lines,0)`, 5000, 'attack reaches guest');
        assert(receivedGarbage === 4, `reliable attack event queues four garbage lines (${receivedGarbage})`);

        section('Host-authoritative result and rematch');
        const firstMatchId = hostMatch.id;
        const authorityState = await host.evaljs(`(() => {
            onlineBattle.handleLocalTopOut();
            return {phase:onlineBattle.phase,currentMode,battleEnded,winnerIsOpponent:battleWinner===aiGame,apiOnline:TetrisBattleOnlineApi.isOnline};
        })()`);
        assert(authorityState.battleEnded && authorityState.winnerIsOpponent && authorityState.apiOnline,
            'host top-out sets an authoritative opponent winner');
        await Promise.all([
            host.waitFor(`document.getElementById('gameover').classList.contains('show') && document.getElementById('gameover-title').textContent === 'DEFEAT'`, 5000, 'host defeat'),
            guest.waitFor(`document.getElementById('gameover').classList.contains('show') && document.getElementById('gameover-title').textContent === 'VICTORY'`, 5000, 'guest victory')
        ]);
        assert(true, 'host adjudicates one defeat and one victory');

        const decisionUi = await host.evaljs(`(() => ({
            question:document.getElementById('online-rematch-question')?.textContent.trim()||'',
            questionVisible:!!document.getElementById('online-rematch-question')&&!document.getElementById('online-rematch-question').classList.contains('hidden'),
            continueText:document.getElementById('online-rematch-btn')?.textContent.trim()||'',
            exitText:document.getElementById('online-exit-btn')?.textContent.trim()||'',
            roomCode:onlineBattle.roomCode,
            connected:onlineBattle.connected
        }))()`);
        assert(decisionUi.questionVisible && decisionUi.question === '是否繼續對戰？',
            `online result asks whether to continue (${decisionUi.question || 'missing'})`);
        assert(decisionUi.continueText === '繼續對戰' && decisionUi.exitText === '結束並離開房間',
            `result choices prioritize rematch and make exit explicit (${decisionUi.continueText} / ${decisionUi.exitText || 'missing'})`);
        assert(decisionUi.connected && decisionUi.roomCode === roomCode,
            'result decision keeps the existing P2P room connected');
        await host.screenshot('/tmp/tetris-p2p-rematch-decision.png');
        await host.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await sleep(250);
        const mobileDecision = await host.evaljs(`(() => {
            const screen=document.getElementById('gameover');
            const question=document.getElementById('online-rematch-question').getBoundingClientRect();
            const keep=document.getElementById('online-rematch-btn').getBoundingClientRect();
            const exit=document.getElementById('online-exit-btn').getBoundingClientRect();
            return {
                overflow:document.documentElement.scrollWidth-innerWidth,
                questionTop:question.top,
                keep:{left:keep.left,right:keep.right,height:keep.height},
                exit:{left:exit.left,right:exit.right,height:exit.height},
                scrollable:screen.scrollHeight>=screen.clientHeight
            };
        })()`);
        assert(mobileDecision.overflow <= 1 && mobileDecision.questionTop >= 0
            && mobileDecision.keep.left >= 0 && mobileDecision.keep.right <= 390 && mobileDecision.keep.height >= 44
            && mobileDecision.exit.left >= 0 && mobileDecision.exit.right <= 390 && mobileDecision.exit.height >= 44,
            `mobile result keeps the question and both choices touch-safe (${JSON.stringify(mobileDecision)})`);
        await host.screenshot('/tmp/tetris-p2p-rematch-mobile.png');
        await host.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await sleep(180);

        await guest.evaljs(`document.getElementById('online-rematch-btn').click()`);
        await sleep(300);
        const awaitingDecision = await Promise.all([
            guest.evaljs(`({connected:onlineBattle.connected,status:document.getElementById('online-rematch-status')?.textContent||'',disabled:document.getElementById('online-rematch-btn').disabled})`),
            host.evaljs(`({connected:onlineBattle.connected,status:document.getElementById('online-rematch-status')?.textContent||''})`)
        ]);
        assert(awaitingDecision[0].connected && awaitingDecision[0].disabled && awaitingDecision[0].status.includes('等待對手'),
            'player choosing continue stays connected and sees a waiting state');
        assert(awaitingDecision[1].connected && awaitingDecision[1].status.includes('對手'),
            'the other player sees that the opponent wants to continue');
        await host.evaljs(`document.getElementById('online-rematch-btn').click()`);
        await Promise.all([
            host.waitFor(`onlineBattle.phase === 'playing' && onlineBattle.matchId !== '${firstMatchId}'`, 12000, 'host rematch'),
            guest.waitFor(`onlineBattle.phase === 'playing' && onlineBattle.matchId !== '${firstMatchId}'`, 12000, 'guest rematch')
        ]);
        const secondMatchId = await host.evaljs(`onlineBattle.matchId`);
        const rematchSeeds = await Promise.all([
            host.evaljs(`onlineBattle.matchSeed`), guest.evaljs(`onlineBattle.matchSeed`)
        ]);
        assert(rematchSeeds[0] === rematchSeeds[1] && rematchSeeds[0] !== hostMatch.seed, 'rematch uses a new shared seed');

        section('Guest top-out authority path');
        await guest.evaljs(`onlineBattle.handleLocalTopOut()`);
        await Promise.all([
            host.waitFor(`document.getElementById('gameover').classList.contains('show') && document.getElementById('gameover-title').textContent === 'VICTORY'`, 5000, 'host victory on guest topout'),
            guest.waitFor(`document.getElementById('gameover').classList.contains('show') && document.getElementById('gameover-title').textContent === 'DEFEAT'`, 5000, 'guest defeat confirmed by host')
        ]);
        assert(true, 'guest top-out is confirmed by host-authoritative result');

        await host.evaljs(`onlineBattle.requestRematch()`);
        await guest.evaljs(`onlineBattle.requestRematch()`);
        await Promise.all([
            host.waitFor(`onlineBattle.phase === 'playing' && onlineBattle.matchId !== '${secondMatchId}'`, 12000, 'host second rematch'),
            guest.waitFor(`onlineBattle.phase === 'playing' && onlineBattle.matchId !== '${secondMatchId}'`, 12000, 'guest second rematch')
        ]);
        assert(await host.evaljs(`onlineBattle.matchSeed`) === await guest.evaljs(`onlineBattle.matchSeed`), 'second rematch also shares one seed');

        section('Disconnect handling');
        await guest.evaljs(`backMenu()`);
        await host.waitFor(`document.getElementById('gameover').classList.contains('show') && document.getElementById('gameover-title').textContent === 'VICTORY'`, 7000, 'host wins on guest disconnect');
        assert(await host.evaljs(`document.getElementById('gameover-sub').textContent.includes('離線')`), 'remaining player receives a clear disconnect result');

        section('Countdown and ended disconnect edge cases');
        await host.evaljs(`(async()=>{ await backMenu(); openOnlineLobby(); onlineBattle.createRoom(); return true; })()`);
        const edgeCode = await host.waitFor(`onlineBattle.roomCode.length === 6 && onlineBattle.phase === 'lobby' && onlineBattle.roomCode`, 15000, 'edge room created');
        await guest.evaljs(`openOnlineLobby(); document.getElementById('online-room-input').value='${edgeCode}'; document.getElementById('online-join-form').requestSubmit()`);
        await Promise.all([
            host.waitFor(`onlineBattle.connected && onlineBattle.latency !== null`, 40000, 'edge host connected'),
            guest.waitFor(`onlineBattle.connected && onlineBattle.latency !== null`, 40000, 'edge guest connected')
        ]);
        await host.evaljs(`document.getElementById('online-ready-btn').click()`);
        await guest.evaljs(`document.getElementById('online-ready-btn').click()`);
        await host.waitFor(`onlineBattle.phase === 'countdown'`, 5000, 'countdown begins');
        await guest.evaljs(`onlineBattle.leaveRoom()`);
        const countdownDisconnectState = await host.evaljs(`({phase:onlineBattle.phase,countdownHidden:document.getElementById('online-countdown').classList.contains('hidden'),currentMode,TetrisOnline:TetrisBattleOnlineApi.isOnline})`);
        assert(countdownDisconnectState.phase === 'lobby' && countdownDisconnectState.countdownHidden,
            'peer disconnect returns room to lobby and hides countdown');
        await sleep(3900);
        assert(await host.evaljs(`onlineBattle.phase === 'lobby' && !TetrisBattleOnlineApi.isOnline`), 'disconnect cancels countdown and prevents a solo online match');

        await guest.evaljs(`openOnlineLobby(); document.getElementById('online-room-input').value='${edgeCode}'; document.getElementById('online-join-form').requestSubmit()`);
        await Promise.all([
            host.waitFor(`onlineBattle.connected && onlineBattle.latency !== null`, 40000, 'rejoin host synchronized'),
            guest.waitFor(`onlineBattle.connected && onlineBattle.latency !== null`, 40000, 'rejoin guest synchronized')
        ]);
        await host.evaljs(`document.getElementById('online-ready-btn').click()`);
        await guest.evaljs(`document.getElementById('online-ready-btn').click()`);
        await Promise.all([
            host.waitFor(`onlineBattle.phase === 'playing'`, 12000, 'edge host playing'),
            guest.waitFor(`onlineBattle.phase === 'playing'`, 12000, 'edge guest playing')
        ]);
        await host.evaljs(`onlineBattle.handleLocalTopOut()`);
        await Promise.all([
            host.waitFor(`onlineBattle.phase === 'ended'`, 5000, 'edge host ended'),
            guest.waitFor(`onlineBattle.phase === 'ended'`, 5000, 'edge guest ended')
        ]);
        const exitedThroughExplicitChoice = await guest.evaljs(`(() => {
            const button=document.getElementById('online-exit-btn');
            if (button) { button.click(); return true; }
            backMenu();
            return false;
        })()`);
        assert(exitedThroughExplicitChoice, 'post-game room exit uses the explicit end-and-leave choice');
        await host.waitFor(`document.getElementById('online-rematch-btn').disabled && document.getElementById('online-rematch-btn').textContent.includes('離線')`, 7000, 'rematch disabled after post-game disconnect');
        assert(true, 'post-game disconnect disables the rematch control');
        assert(await host.evaljs(`document.getElementById('gameover-sub').textContent.includes('無法再戰')`), 'post-game disconnect explains why rematch is unavailable');

        section('Missing room and mobile lobby');
        await host.evaljs(`(async()=>{ await backMenu(); openOnlineLobby(); return true; })()`);
        await host.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await sleep(250);
        assert(await host.evaljs(`document.documentElement.scrollWidth <= innerWidth`), 'mobile online lobby has no horizontal overflow');
        const mobileGeometry = await host.evaljs(`(() => {
            const card=document.querySelector('.online-card').getBoundingClientRect();
            const create=document.querySelector('.online-choice').getBoundingClientRect();
            const join=document.querySelector('.online-room-entry button').getBoundingClientRect();
            return {cardLeft:card.left,cardRight:card.right,createHeight:create.height,joinHeight:join.height};
        })()`);
        assert(mobileGeometry.cardLeft >= 0 && mobileGeometry.cardRight <= 390 && mobileGeometry.createHeight >= 44 && mobileGeometry.joinHeight >= 44,
            `mobile room actions stay inside viewport with touch-safe targets (${JSON.stringify(mobileGeometry)})`);
        await host.screenshot('/tmp/tetris-p2p-mobile-lobby.png');
        await host.evaljs(`closeOnlineLobby()`);

        const missing = await createPage('missing', 1280, 800, undefined, 9568); pages.push(missing);
        await missing.evaljs(`openOnlineLobby(); document.getElementById('online-room-input').value='QXQXQX'; document.getElementById('online-join-form').requestSubmit()`);
        const missingMessage = await missing.waitFor(`document.getElementById('online-error').textContent.includes('找不到這個房間') && document.getElementById('online-error').textContent`, 24000, 'missing room timeout');
        assert(missingMessage.includes('找不到這個房間'), 'nonexistent room produces a clear timeout message');

        section('Technical health');
        assert(host.consoleErrors.length === 0 && guest.consoleErrors.length === 0 && missing.consoleErrors.length === 0,
            `no console errors (host=${host.consoleErrors.length}, guest=${guest.consoleErrors.length}, missing=${missing.consoleErrors.length})`);
        assert(host.pageErrors.length === 0 && guest.pageErrors.length === 0 && missing.pageErrors.length === 0,
            `no uncaught exceptions (host=${host.pageErrors.length}, guest=${guest.pageErrors.length}, missing=${missing.pageErrors.length})`);
        assert(await host.evaljs(`document.documentElement.scrollWidth <= innerWidth`), 'online lobby remains overflow-free after room lifecycle');

        console.log(`\n========== ONLINE P2P RESULT: ${passes} passed, ${failures} failed ==========`);
        process.exitCode = failures ? 1 : 0;
    } finally {
        for (const page of pages.reverse()) await page.close();
    }
})().catch(error => {
    console.error('ONLINE P2P TEST ERROR:', error.stack || error);
    process.exit(2);
});
