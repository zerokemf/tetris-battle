// Hostile-path regression tests for the dependency-free static test server.
const http = require('http');
const { server } = require('./server');

let passes = 0;
let failures = 0;

function assert(condition, message) {
    if (condition) { passes++; console.log(`  ✓ ${message}`); }
    else { failures++; console.log(`  ✗ FAIL: ${message}`); }
}

function request(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, res => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', reject);
        req.end();
    });
}

function requestDetails(port, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks)
            }));
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;

    try {
        console.log('\n== Static server hostile-path handling ==');
        assert(await request(port, '/index.html') === 200, 'normal file request succeeds');
        const range = await requestDetails(port, '/assets/attract-gameplay.webm', { Range: 'bytes=0-1023' });
        assert(range.status === 206 && range.body.length === 1024
            && /^bytes 0-1023\//.test(range.headers['content-range'] || ''),
            'media byte ranges return a bounded 206 response');
        const invalidRange = await requestDetails(port, '/assets/attract-gameplay.webm', { Range: 'bytes=9999999-' });
        assert(invalidRange.status === 416 && /^bytes \*\//.test(invalidRange.headers['content-range'] || ''),
            'invalid media byte ranges return 416');
        assert(await request(port, '/../tetris-battle-secret') === 403, 'plain traversal is blocked');
        assert(await request(port, '/%2e%2e/tetris-battle-secret') === 403, 'encoded traversal is blocked');
        assert(await request(port, '/%E0%A4%A') === 400, 'malformed URL encoding is rejected');
        assert(await request(port, '/%00') === 400, 'encoded NUL byte is rejected');
        // A second normal request proves hostile input did not crash the process.
        assert(await request(port, '/index.html?after-hostile=1') === 200,
            'server remains alive after hostile requests');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }

    console.log(`\n========== SERVER SECURITY RESULT: ${passes} passed, ${failures} failed ==========`);
    process.exit(failures ? 1 : 0);
})().catch(async error => {
    console.error('SERVER SECURITY TEST ERROR:', error);
    if (server.listening) await new Promise(resolve => server.close(resolve));
    process.exit(2);
});
