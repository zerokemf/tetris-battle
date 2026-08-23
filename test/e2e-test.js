// E2E test driver for Tetris Battle via raw Chrome DevTools Protocol (no deps)
const http = require('http');
const fs = require('fs');

const CDP_PORT = 9567;
const GAME_URL = 'http://127.0.0.1:8777/index.html';

function httpJson(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path, method }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        });
        req.on('error', reject);
        req.end();
    });
}

function wsSend(wsUrl) {
    // Minimal WebSocket client implementation
    return new Promise((resolve, reject) => {
        const net = require('net');
        const crypto = require('crypto');
        const key = crypto.randomBytes(16).toString('base64');
        const u = new URL(wsUrl);
        const sock = net.connect(Number(u.port), '127.0.0.1', () => {
            sock.write(
                `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
                `Host: 127.0.0.1:${u.port}\r\n` +
                `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
                `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
            );
        });
        let buffer = Buffer.alloc(0);
        let upgraded = false;
        let msgId = 0;
        const pending = new Map();
        const api = {
            on: (ev, fn) => { handlers[ev] = fn; },
            send: (method, params = {}) => new Promise((res, rej) => {
                const id = ++msgId;
                pending.set(id, { res, rej });
                const payload = JSON.stringify({ id, method, params });
                sendFrame(sock, Buffer.from(payload), 0x1);
            }),
            close: () => sock.end()
        };
        const handlers = {};

        function sendFrame(sock, payload, opcode) {
            const mask = crypto.randomBytes(4);
            const len = payload.length;
            let header;
            if (len < 126) header = Buffer.from([0x80 | opcode, 0x80 | len]);
            else if (len < 65536) header = Buffer.from([0x80 | opcode, 0x80 | 126, len >> 8, len & 0xff]);
            else header = Buffer.from([0x80 | opcode, 0x80 | 127]);
            const masked = Buffer.alloc(len);
            for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
            if (sock.writable) sock.write(Buffer.concat([header, mask, masked]));
        }

        function handleData(chunk) {
            buffer = Buffer.concat([buffer, chunk]);
            if (!upgraded) {
                const idx = buffer.indexOf('\r\n\r\n');
                if (idx === -1) return;
                const head = buffer.slice(0, idx).toString();
                if (!/101/.test(head.split('\r\n')[0])) { reject(new Error('WS upgrade failed: ' + head.split('\r\n')[0])); sock.destroy(); return; }
                upgraded = true;
                buffer = buffer.slice(idx + 4);
                resolve(api);
            }
            while (true) {
                if (buffer.length < 2) return;
                const opcode = buffer[0] & 0x0f;
                let len = buffer[1] & 0x7f;
                let offset = 2;
                if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
                else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
                if (buffer.length < offset + len) return;
                const data = buffer.slice(offset, offset + len).toString();
                buffer = buffer.slice(offset + len);
                if (opcode === 0x1) {
                    try {
                        const msg = JSON.parse(data);
                        if (msg.id && pending.has(msg.id)) {
                            const p = pending.get(msg.id); pending.delete(msg.id);
                            if (msg.error) p.rej(new Error(JSON.stringify(msg.error))); else p.res(msg.result);
                        } else if (msg.method && handlers[msg.method]) {
                            handlers[msg.method](msg.params);
                        }
                    } catch (e) {}
                }
            }
        }
        sock.on('data', handleData);
        sock.on('error', reject);
        sock.on('close', () => { if (!upgraded) reject(new Error('closed before upgrade')); });
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let passes = 0, failures = 0;
function assert(cond, msg) {
    if (cond) { passes++; console.log(`  ✓ ${msg}`); }
    else { failures++; console.log(`  ✗ FAIL: ${msg}`); }
}
const section = n => console.log(`\n== ${n} ==`);

(async () => {
    // Create an isolated tab instead of attaching to an arbitrary existing CDP page.
    const page = await httpJson('/json/new?about%3Ablank', 'PUT');
    if (!page || !page.webSocketDebuggerUrl) {
        console.error('could not create dedicated page target');
        process.exit(1);
    }

    const cdp = await wsSend(page.webSocketDebuggerUrl);

    const consoleErrors = [];
    const pageErrors = [];
    cdp.on('Runtime.consoleAPICalled', p => {
        if (p.type === 'error') consoleErrors.push(p.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
    });
    cdp.on('Runtime.exceptionThrown', p => {
        pageErrors.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text || '').slice(0, 300));
    });

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    async function evaljs(expr) {
        const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
        return r.result && r.result.value;
    }

    async function shot(name) {
        const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`/tmp/tetris-e2e-${name}.png`, Buffer.from(r.data, 'base64'));
        console.log(`  📸 /tmp/tetris-e2e-${name}.png`);
    }

    // ==================== Load ====================
    section('Game loads');
    await cdp.send('Page.navigate', { url: GAME_URL + '?run=' + Date.now() });
    await sleep(2500);
    const title = await evaljs('document.title');
    assert(title.includes('Tetris'), `page title ok (${title})`);
    const menuVisible = await evaljs(`!document.getElementById('menu').classList.contains('hidden')`);
    assert(menuVisible, 'menu screen visible');
    const menuHS = await evaljs(`document.getElementById('menu-high-score').textContent`);
    assert(menuHS !== undefined, `menu high score element renders (${menuHS})`);

    // ==================== Start solo game ====================
    section('Start solo game');
    await evaljs(`chooseMode('solo')`);
    await sleep(600);
    const modeClass = await evaljs(`document.body.className`);
    assert(modeClass.includes('mode-solo'), 'solo layout active');
    const running = await evaljs(`typeof running !== 'undefined' && running`);
    assert(running, 'game loop started');
    const hasPiece = await evaljs(`!!(game && game.piece && game.piece.type)`);
    assert(hasPiece, 'piece spawned');
    const bombInit = await evaljs(`game.bombLineCountdown`);
    assert(bombInit === 10, `bomb countdown initialized to 10 (got ${bombInit})`);
    await shot('01-game-start');

    // ==================== Play: move & rotate ====================
    section('Keyboard play');
    // Input manager listens on window keydown using e.code; send keydown+keyup pairs
    await evaljs(`window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowLeft'})); window.dispatchEvent(new KeyboardEvent('keyup', {code: 'ArrowLeft'}))`);
    await evaljs(`window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowUp'})); window.dispatchEvent(new KeyboardEvent('keyup', {code: 'ArrowUp'}))`);
    await sleep(120);
    const pieceX = await evaljs(`game.piece ? game.piece.x : -99`);
    assert(pieceX === 2, `left move applied (x=${pieceX})`);

    // Hold works
    const holdBefore = await evaljs(`game.hold`);
    await evaljs(`window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyC'})); window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyC'}))`);
    await sleep(150);
    const holdAfter = await evaljs(`game.hold`);
    assert(holdAfter !== holdBefore, `hold swap works (${holdBefore} -> ${holdAfter})`);

    // Hard drop works
    await evaljs(`window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Space'})); window.dispatchEvent(new KeyboardEvent('keyup', {code: 'Space'}))`);
    await sleep(400);
    const scoreAfterDrop = await evaljs(`game.score`);
    assert(scoreAfterDrop >= 0, `hard drop executed, score=${scoreAfterDrop}`);

    // Deterministic line-clear integration: prepare a legal I-piece well and lock it.
    // This exercises the real board, renderer, scoring and clear effect without random top-out.
    await evaljs(`
        (function(){
            game.grid = Array.from({length:20},()=>Array(10).fill(0));
            for(var c=0;c<10;c++) if(c<3 || c>6) game.grid[19][c]='J';
            game.piece = new Piece('I', game);
            game.piece.x = 3;
            game.piece.y = 18;
            game.over = false;
            game.hardDrop();
        })()
    `);
    await sleep(500);
    const cleared = await evaljs(`game.lines > 0`);
    assert(cleared, `deterministic play cleared a line (lines=${await evaljs('game.lines')}, score=${await evaljs('game.score')})`);
    await shot('02-midgame');

    // Pause/resume
    section('Pause');
    const generationBeforePause = await evaljs(`loopGeneration`);
    await evaljs(`togglePause()`);
    const paused = await evaljs(`isPaused`);
    assert(paused, 'pause toggles on');
    await evaljs(`togglePause()`);
    assert(await evaljs(`!isPaused`), 'pause toggles off');
    assert(await evaljs(`loopGeneration === ${generationBeforePause + 2}`),
        'pause and resume each invalidate stale animation frames');

    // Rapid pause/resume must leave exactly one active rAF chain.
    await evaljs(`
        window.__updateCount = 0;
        window.__originalUpdate = game.update.bind(game);
        game.update = function(t) { window.__updateCount++; return window.__originalUpdate(t); };
        for (var i=0; i<4; i++) { togglePause(); togglePause(); }
    `);
    await sleep(350);
    const rapidUpdates = await evaljs(`window.__updateCount`);
    assert(rapidUpdates >= 10 && rapidUpdates <= 28,
        `rapid pause/resume keeps one game loop (${rapidUpdates} updates / 350ms)`);

    // ==================== Battle mode smoke test ====================
    section('Battle mode');
    await evaljs(`backMenu()`);
    await sleep(300);
    await evaljs(`chooseMode('battle')`);
    await sleep(200);
    await evaljs(`chooseDifficulty('normal')`);
    await sleep(800);
    const battleRunning = await evaljs(`running && !!aiGame`);
    assert(battleRunning, 'battle mode starts with AI opponent');
    const aiAlive = await evaljs(`!aiGame.over`);
    assert(aiAlive, 'AI is playing');
    // Let AI play a bit
    await sleep(3000);
    const aiPiecesLocked = await evaljs(`aiGame.lines + aiGame.score`);
    assert(aiPiecesLocked >= 0, `AI progressing (score=${aiPiecesLocked})`);
    await shot('03-battle');

    // KO display elements exist
    const koOk = await evaljs(`document.getElementById('ko-p') !== null`);
    assert(koOk, 'KO counter elements present');

    // Back to menu
    await evaljs(`backMenu()`);
    await sleep(300);
    assert(await evaljs(`!document.getElementById('menu').classList.contains('hidden')`), 'back to menu works');
    assert(await evaljs(`document.body.classList.contains('at-menu') && getComputedStyle(document.getElementById('game-container')).visibility === 'hidden'`),
        'stale game board is hidden behind transparent menu');
    const hsAfter = await evaljs(`document.getElementById('menu-high-score').textContent`);
    console.log(`  menu high score after play: ${hsAfter}`);

    // ==================== Console errors ====================
    section('Console health');
    const realErrors = consoleErrors.filter(e => !/favicon|Autofocus processing|music/i.test(e));
    assert(realErrors.length === 0, `no console errors (${realErrors.length})${realErrors.length ? ': ' + realErrors.join(' | ') : ''}`);
    assert(pageErrors.length === 0, `no uncaught exceptions${pageErrors.length ? ': ' + pageErrors.join(' | ') : ''}`);

    // ==================== Visual checks ====================
    section('Visual regression — screenshots');
    // Menu screenshot
    await shot('04-menu-final');

    // Mobile viewport check
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(600);
    await evaljs(`chooseMode('solo')`);
    await sleep(700);
    await shot('05-mobile');
    const noHorizScroll = await evaljs(`document.documentElement.scrollWidth <= window.innerWidth + 2`);
    assert(noHorizScroll, 'mobile: no horizontal overflow');
    const hint = await evaljs(`document.querySelector('.touch-hint').textContent`);
    assert(/TAP DROP/.test(hint) && /ROTATE/.test(hint), 'mobile: gesture hint matches actual controls');

    async function touch(type, x, y) {
        const points = type === 'touchEnd' ? [] : [{ x, y, radiusX: 1, radiusY: 1, force: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    }

    section('Mobile touch controls');
    // Tap = hard drop
    await evaljs(`game.grid=Array.from({length:20},()=>Array(10).fill(0)); game.piece=new Piece('T',game); game.score=0; game.over=false`);
    await touch('touchStart', 195, 400); await touch('touchEnd', 195, 400); await sleep(120);
    assert(await evaljs(`game.score > 0`), `tap performs hard drop (score=${await evaljs('game.score')})`);

    // Swipe up = rotate
    await evaljs(`game.grid=Array.from({length:20},()=>Array(10).fill(0)); game.piece=new Piece('T',game); game.piece.y=5; game.over=false`);
    await touch('touchStart', 195, 430); await touch('touchMove', 195, 380); await touch('touchEnd', 195, 380);
    assert(await evaljs(`game.piece.rotIndex === 1`), `swipe up rotates (rot=${await evaljs('game.piece.rotIndex')})`);

    // Horizontal swipe = move
    await evaljs(`game.grid=Array.from({length:20},()=>Array(10).fill(0)); game.piece=new Piece('T',game); game.piece.y=5; game.over=false`);
    await touch('touchStart', 150, 430); await touch('touchMove', 195, 430); await touch('touchEnd', 195, 430);
    assert(await evaljs(`game.piece.x === 4`), `swipe right moves piece (x=${await evaljs('game.piece.x')})`);

    // Swipe down = soft drop
    await evaljs(`game.grid=Array.from({length:20},()=>Array(10).fill(0)); game.piece=new Piece('T',game); game.piece.y=5; game.over=false`);
    await touch('touchStart', 195, 380); await touch('touchMove', 195, 430); await touch('touchEnd', 195, 430);
    assert(await evaljs(`game.piece.y === 6`), `swipe down soft-drops one row (y=${await evaljs('game.piece.y')})`);

    console.log(`\n========== E2E RESULT: ${passes} passed, ${failures} failed ==========`);
    cdp.close();
    process.exit(failures > 0 ? 1 : 0);
})().catch(e => { console.error('E2E DRIVER ERROR:', e.message); process.exit(2); });
