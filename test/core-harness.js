// Node unit tests for Tetris Battle core logic
// Stubs browser APIs, loads game.js, and exercises game logic headlessly.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- Minimal browser stubs ----------
function makeEl(id) {
    return {
        id: id || '',
        textContent: '0',
        innerHTML: '',
        className: '',
        style: {},
        classList: {
            _s: new Set(),
            add(c) { this._s.add(c); },
            remove(c) { this._s.delete(c); },
            toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) this._s.add(c); else this._s.delete(c); },
            contains(c) { return this._s.has(c); }
        },
        setAttribute() {}, getAttribute() { return null; },
        appendChild() {}, removeChild() {},
        addEventListener() {}, removeEventListener() {},
        getBoundingClientRect: () => ({ width: 360, height: 720 }),
        parentElement: null,
        getContext: () => ({
            setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
            createLinearGradient: () => ({ addColorStop() {} }),
            createRadialGradient: () => ({ addColorStop() {} }),
            save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
            fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over'
        }),
        width: 300, height: 150,
        focus() {}
    };
}

const elements = {};
function getEl(id) { if (!elements[id]) { const el = makeEl(id); elements[id] = el; } return elements[id]; }

const documentStub = {
    readyState: 'complete',
    hidden: false,
    getElementById: getEl,
    createElement: (tag) => makeEl('dyn-' + tag + Math.random()),
    addEventListener() {}, removeEventListener() {},
    body: makeEl('body'),
    querySelectorAll: () => []
};

const windowStub = {
    devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame() { return 0; }
};

const storageData = {};
const localStorageStub = {
    getItem: (k) => Object.prototype.hasOwnProperty.call(storageData, k) ? storageData[k] : null,
    setItem: (k, v) => { storageData[k] = String(v); },
    removeItem: (k) => { delete storageData[k]; }
};

let rafTime = 0;
const performanceStub = { now: () => rafTime };

const sandbox = {
    console,
    document: documentStub,
    window: windowStub,
    localStorage: localStorageStub,
    performance: performanceStub,
    requestAnimationFrame: () => 0,
    setTimeout: (fn) => 0,   // don't fire; we control timing manually
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Math, Date, JSON, Object, Array, String, Number, Boolean, Infinity, NaN, undefined
};
sandbox.globalThis = sandbox;

const code = fs.readFileSync(path.join(__dirname, '..', 'input-controls.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8')
    // Expose top-level const/class declarations (they don't attach to global in vm context)
    + '\n;this.__exports = { Bag7, SeededBag7, Piece, Tetris, TetrisAI, BattleManager, loadHighScore, saveHighScore, SHAPES, COLORS, SRS_KICK_DATA, getOnlineLocalState, applyOnlineRemoteState, receiveOnlineAttack, finishOnlineMatch, analyzeGrid, simulateDrop, rotateShape, AI_PROFILES };';

let failures = 0, passes = 0;
function assert(cond, msg) {
    if (cond) { passes++; console.log(`  ✓ ${msg}`); }
    else { failures++; console.log(`  ✗ FAIL: ${msg}`); }
}
function section(name) { console.log(`\n== ${name} ==`); }

try {
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
} catch (e) {
    console.error('SCRIPT LOAD ERROR:', e.message);
    process.exit(1);
}

const S = sandbox.__exports;


module.exports = {sandbox, S, getEl, run: expression => vm.runInContext(expression, sandbox), setTime: value => { rafTime = value; }, storageData};
