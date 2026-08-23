// Record actual AI-vs-AI gameplay to JPEG frames via raw Chrome CDP.
// Run with the local static server on :8777 and Chrome CDP on :9567.
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

const CDP_PORT = 9567;
const GAME_URL = 'http://127.0.0.1:8777/index.html';
const OUT_DIR = '/tmp/tetris-record-frames';
const FPS = Number(process.env.RECORD_FPS || 15);
const SECONDS = Number(process.env.RECORD_SECONDS || 14);

function httpJson(requestPath, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: requestPath, method }, res => {
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

        function sendFrame(payload) {
            const mask = crypto.randomBytes(4);
            const length = payload.length;
            let header;
            if (length < 126) header = Buffer.from([0x81, 0x80 | length]);
            else if (length < 65536) header = Buffer.from([0x81, 0x80 | 126, length >> 8, length & 0xff]);
            else throw new Error('CDP payload too large');
            const masked = Buffer.alloc(length);
            for (let i = 0; i < length; i++) masked[i] = payload[i] ^ mask[i % 4];
            socket.write(Buffer.concat([header, mask, masked]));
        }

        const api = {
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
                const split = buffer.indexOf('\r\n\r\n');
                if (split < 0) return;
                const status = buffer.slice(0, split).toString().split('\r\n')[0];
                if (!status.includes('101')) return reject(new Error(`WebSocket upgrade failed: ${status}`));
                upgraded = true;
                buffer = buffer.slice(split + 4);
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
                    if (!message.id || !pending.has(message.id)) continue;
                    const promise = pending.get(message.id);
                    pending.delete(message.id);
                    if (message.error) promise.rejectMessage(new Error(JSON.stringify(message.error)));
                    else promise.resolveMessage(message.result);
                } catch (_) {}
            }
        });
        socket.on('error', reject);
    });
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

(async () => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const target = await httpJson('/json/new?about%3Ablank', 'PUT');
    const cdp = await connectWebSocket(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280, height: 720, deviceScaleFactor: 1, mobile: false
    });
    await cdp.send('Page.navigate', { url: `${GAME_URL}?record=${Date.now()}` });
    await sleep(1800);

    const setup = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            musicEnabled = false;
            chooseMode('battle');
            chooseDifficulty('hard');
            document.getElementById('music-toggle').style.display = 'none';
            document.body.classList.add('recording-attract');
            window.__recordPlayerAI = new TetrisAI(game, 'hard');
            window.__recordAITimer = setInterval(() => {
                if (running && !isPaused && game && !game.over) {
                    window.__recordPlayerAI.update(performance.now());
                }
            }, 16);
            return { running, mode: currentMode, player: game.piece.type, cpu: aiGame.piece.type };
        })()`,
        returnByValue: true
    });
    if (!setup.result || !setup.result.value || !setup.result.value.running) {
        throw new Error(`Failed to start recording match: ${JSON.stringify(setup)}`);
    }
    console.log('match', setup.result.value);

    // Warm up so the recorded clip begins with developed stacks and activity.
    await sleep(5200);

    const totalFrames = Math.round(FPS * SECONDS);
    const frameInterval = 1000 / FPS;
    const started = Date.now();
    for (let index = 0; index < totalFrames; index++) {
        const targetTime = started + index * frameInterval;
        const wait = targetTime - Date.now();
        if (wait > 0) await sleep(wait);
        const screenshot = await cdp.send('Page.captureScreenshot', {
            format: 'jpeg', quality: 88, fromSurface: true,
            captureBeyondViewport: false
        });
        const filename = path.join(OUT_DIR, `frame_${String(index).padStart(4, '0')}.jpg`);
        fs.writeFileSync(filename, Buffer.from(screenshot.data, 'base64'));
        if ((index + 1) % FPS === 0) console.log(`captured ${(index + 1) / FPS}s / ${SECONDS}s`);
    }

    await cdp.send('Runtime.evaluate', {
        expression: `clearInterval(window.__recordAITimer); true`, returnByValue: true
    });
    cdp.close();
    console.log(JSON.stringify({ outDir: OUT_DIR, fps: FPS, seconds: SECONDS, frames: totalFrames }));
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
