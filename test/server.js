// Tiny static file server for the tetris-battle folder (no deps)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 8777);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json'
};

function handleRequest(req, res) {
    let p;
    try {
        p = decodeURIComponent(req.url.split('?')[0]);
    } catch (e) {
        res.writeHead(400); res.end('bad request'); return;
    }
    // Node's fs APIs throw synchronously on NUL bytes instead of invoking the
    // callback. Reject them before path resolution so one hostile request
    // cannot terminate the test server.
    if (p.includes('\0')) {
        res.writeHead(400); res.end('bad request'); return;
    }
    if (p === '/') p = '/index.html';
    // Prefix with "." so an absolute URL path cannot discard ROOT, then
    // require separator-bounded containment (not a plain startsWith prefix).
    const file = path.resolve(ROOT, '.' + p);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
        res.writeHead(403); res.end('forbidden'); return;
    }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const headers = {
            'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'Accept-Ranges': 'bytes'
        };
        const rangeHeader = req.headers.range;
        if (rangeHeader) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
            let start;
            let end;
            if (match && (match[1] || match[2])) {
                if (!match[1]) {
                    const suffixLength = Number(match[2]);
                    start = Math.max(0, data.length - suffixLength);
                    end = data.length - 1;
                } else {
                    start = Number(match[1]);
                    end = match[2] ? Number(match[2]) : data.length - 1;
                }
            }
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
                || start < 0 || end < start || start >= data.length) {
                res.writeHead(416, { ...headers, 'Content-Range': `bytes */${data.length}` });
                res.end();
                return;
            }
            end = Math.min(end, data.length - 1);
            const body = data.subarray(start, end + 1);
            res.writeHead(206, {
                ...headers,
                'Content-Range': `bytes ${start}-${end}/${data.length}`,
                'Content-Length': body.length
            });
            res.end(body);
            return;
        }
        res.writeHead(200, { ...headers, 'Content-Length': data.length });
        res.end(data);
    });
}

const server = http.createServer(handleRequest);
if (require.main === module) {
    server.listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}`));
}

module.exports = { server, handleRequest };
