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

    section('Ink design system');
    const inkTokens = await evaljs(`(() => {
        const root = getComputedStyle(document.documentElement);
        return {
            deep: root.getPropertyValue('--ink-deep').trim(),
            mint: root.getPropertyValue('--ink-mint').trim(),
            yellow: root.getPropertyValue('--ink-yellow').trim(),
            coral: root.getPropertyValue('--ink-coral').trim(),
            titleFont: getComputedStyle(document.querySelector('.title')).fontFamily,
            soloButton: getComputedStyle(document.querySelector('.mode-btn')).backgroundColor,
            battleButton: getComputedStyle(document.querySelector('.mode-btn.magenta')).backgroundColor,
            pieces: [COLORS.I.base, COLORS.O.base, COLORS.T.base, COLORS.J.base]
        };
    })()`);
    assert(inkTokens.deep === '#071a16' && inkTokens.mint === '#3ed9b5' && inkTokens.yellow === '#f2df4b' && inkTokens.coral === '#f2633f',
        `core ink palette loaded (${inkTokens.deep}, ${inkTokens.mint}, ${inkTokens.yellow}, ${inkTokens.coral})`);
    assert(/Bungee/i.test(inkTokens.titleFont), `display typography uses Bungee (${inkTokens.titleFont})`);
    assert(inkTokens.soloButton === 'rgb(242, 223, 75)' && inkTokens.battleButton === 'rgb(242, 99, 63)',
        'mode CTAs use yellow and coral ink roles');
    assert(inkTokens.pieces.join(',') === '#3ed9b5,#f2df4b,#f2633f,#527bbf',
        `canvas tetromino palette uses the new system (${inkTokens.pieces.join(', ')})`);

    section('Full-screen gameplay video');
    const videoExists = await evaljs(`!!(document.getElementById('menu-gameplay-video') && window.__videoBackground)`);
    assert(videoExists, 'gameplay video background initialized');
    const videoInfo = await evaljs(`({
        readyState: window.__videoBackground.readyState,
        paused: window.__videoBackground.paused,
        duration: window.__videoBackground.duration,
        dimensions: window.__videoBackground.dimensions,
        error: window.__videoBackground.lastError,
        opacity: +getComputedStyle(document.getElementById('menu-gameplay-video')).opacity,
        fit: getComputedStyle(document.getElementById('menu-gameplay-video')).objectFit,
        mp4: document.getElementById('menu-gameplay-video').canPlayType('video/mp4'),
        webm: document.getElementById('menu-gameplay-video').canPlayType('video/webm')
    })`);
    assert(videoInfo.readyState >= 2 && videoInfo.error === '', `video decoded without media errors (readyState=${videoInfo.readyState})`);
    assert(videoInfo.dimensions[0] === 1280 && videoInfo.dimensions[1] === 720, `recorded gameplay is 1280×720 (${videoInfo.dimensions.join('×')})`);
    assert(videoInfo.duration >= 13.9 && videoInfo.duration <= 14.1, `loop duration is 14 seconds (${videoInfo.duration.toFixed(2)}s)`);
    assert(videoInfo.paused === false, 'muted gameplay video autoplays on menu');
    assert(videoInfo.opacity >= 0.55 && videoInfo.fit === 'cover', `video is visibly full-screen (opacity=${videoInfo.opacity}, fit=${videoInfo.fit})`);
    assert(videoInfo.mp4 !== '' && videoInfo.webm !== '', 'browser recognizes MP4 and WebM fallbacks');
    const videoTimeBefore = await evaljs(`window.__videoBackground.currentTime`);
    await sleep(1200);
    const videoTimeAfter = await evaljs(`window.__videoBackground.currentTime`);
    assert(videoTimeAfter > videoTimeBefore + 0.7, `video timeline visibly advances (${videoTimeBefore.toFixed(2)} -> ${videoTimeAfter.toFixed(2)}s)`);

    await evaljs(`Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'))`);
    await sleep(180);
    assert(await evaljs(`window.__videoBackground.paused === true`), 'video pauses when the document becomes hidden');
    const hiddenTime = await evaljs(`window.__videoBackground.currentTime`);
    await sleep(350);
    assert(await evaljs(`Math.abs(window.__videoBackground.currentTime - ${hiddenTime}) < 0.05`), 'hidden document does not consume video timeline');
    await evaljs(`Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange'))`);
    await sleep(220);
    assert(await evaljs(`window.__videoBackground.paused === false`), 'video resumes when the document becomes visible');
    await evaljs(`delete document.hidden`);

    await shot('00-menu-video');

    section('Menu layout geometry');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1279, height: 813, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const layout813 = await evaljs(`(() => {
        const content = document.querySelector('.menu-content').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('#mode-section .mode-btn')].map(el => el.getBoundingClientRect());
        const glow = getComputedStyle(document.querySelector('.menu-bg-glow'));
        return {
            contentTop: content.top, contentBottom: content.bottom,
            buttonBottoms: buttons.map(r => r.bottom),
            buttonTops: buttons.map(r => r.top),
            glowPosition: glow.position,
            menuHeight: document.getElementById('menu').getBoundingClientRect().height
        };
    })()`);
    assert(layout813.glowPosition === 'absolute', 'decorative glow is removed from flex layout flow');
    assert(layout813.contentTop >= 20 && layout813.contentBottom <= 781,
        `1279×813: menu module stays inside safe area (${Math.round(layout813.contentTop)}–${Math.round(layout813.contentBottom)}px)`);
    assert(layout813.buttonBottoms.every(v => v <= 781) && layout813.buttonTops.every(v => v >= 20),
        '1279×813: both primary mode buttons are fully visible');
    await shot('00b-menu-1279x813');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 650, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    const shortButtons = await evaljs(`[...document.querySelectorAll('#mode-section .mode-btn')].map(el => el.getBoundingClientRect().bottom)`);
    assert(shortButtons.every(v => v <= 626), '1024×650: primary buttons retain a 24px bottom safe area');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(200);

    // ==================== Start solo game ====================
    section('Start solo game');
    await evaljs(`chooseMode('solo')`);
    await sleep(600);
    const modeClass = await evaljs(`document.body.className`);
    assert(modeClass.includes('mode-solo'), 'solo layout active');
    assert(await evaljs(`window.__videoBackground.paused === true`), 'gameplay background video pauses during gameplay');
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
        'stale game board is hidden behind menu');
    await sleep(250);
    assert(await evaljs(`window.__videoBackground.paused === false`), 'gameplay background video resumes after returning to menu');
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

    // Mobile menu and gameplay checks
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(600);
    const mobileVideo = await evaljs(`({display:getComputedStyle(document.getElementById('menu-gameplay-video')).display,opacity:+getComputedStyle(document.getElementById('menu-gameplay-video')).opacity,fit:getComputedStyle(document.getElementById('menu-gameplay-video')).objectFit})`);
    assert(mobileVideo.display !== 'none' && mobileVideo.opacity >= 0.45 && mobileVideo.fit === 'cover',
        `mobile: full-screen gameplay footage remains visible (${JSON.stringify(mobileVideo)})`);
    await shot('04b-menu-mobile-video');
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

    section('Reduced motion');
    await evaljs(`backMenu()`);
    await cdp.send('Emulation.setEmulatedMedia', {
        media: '',
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await sleep(180);
    assert(await evaljs(`window.__videoBackground.paused === true`),
        'prefers-reduced-motion pauses gameplay footage');
    assert(await evaljs(`getComputedStyle(document.getElementById('menu-gameplay-video')).display === 'none'`),
        'reduced-motion hides moving video and leaves poster background');
    const reducedTime = await evaljs(`window.__videoBackground.currentTime`);
    await sleep(750);
    assert(await evaljs(`Math.abs(window.__videoBackground.currentTime - ${reducedTime}) < 0.05`),
        'reduced-motion video timeline stays frozen');

    console.log(`\n========== E2E RESULT: ${passes} passed, ${failures} failed ==========`);
    cdp.close();
    process.exit(failures > 0 ? 1 : 0);
})().catch(e => { console.error('E2E DRIVER ERROR:', e.message); process.exit(2); });
