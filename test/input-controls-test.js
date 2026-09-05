'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function target() {
    const listeners = new Map();
    return {
        addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
        removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
        fire(name, props = {}) { const e = { preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {}, ...props }; for (const fn of listeners.get(name) || []) fn(e); return e; }
    };
}
function harness(saved = null) {
    let now = 0;
    const window = target(), document = { ...target(), readyState: 'loading', hidden: false, activeElement: null };
    const store = new Map(saved ? [['tb-input-settings-v1', saved]] : []);
    const sandbox = { window, document, console, performance: { now: () => now }, localStorage: { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v) }, running: true, isPaused: false, currentMode: 'solo' };
    vm.createContext(sandbox);
    const filename = path.join(__dirname, '../input-controls.js');
    assert.ok(fs.existsSync(filename), 'input-controls.js implements the new InputManager');
    vm.runInContext(fs.readFileSync(filename, 'utf8') + '\nthis.Manager = InputManager;', sandbox);
    const calls = [];
    const game = { over: false, piece: { x: 5, y: 0 }, move(d) { calls.push(['move', d]); this.piece.x += d; return true; }, drop() { calls.push(['drop']); this.piece.y++; return true; }, rotate(d) { calls.push(['rotate', d]); }, hardDrop() { calls.push(['hardDrop']); }, holdPiece() { calls.push(['hold']); } };
    const manager = new sandbox.Manager(game);
    return { window, document, sandbox, store, game, manager, calls, tick(t) { now = t; manager.update(); }, time(t) { now = t; }, down(code, props = {}) { return window.fire('keydown', { code, target: null, ...props }); }, up(code) { return window.fire('keyup', { code }); } };
}
test('only movement and soft drop repeat; discrete actions and OS repeat never do', () => {
    const h = harness();
    for (const code of ['Space', 'ArrowUp', 'KeyZ', 'KeyC']) {
        const before = h.calls.length;
        h.down(code); h.down(code, { repeat: true }); h.tick(1000);
        assert.equal(h.calls.length, before + 1, code);
        h.up(code);
    }
    h.time(2000); h.down('ArrowDown'); h.tick(2130);
    assert.deepEqual(h.calls.slice(-2), [['drop'], ['drop']]);
    h.up('ArrowDown');
    const before = h.calls.length;
    h.down('ArrowLeft', { repeat: true }); h.tick(3000);
    assert.equal(h.calls.length, before);
});

test('latest direction wins and releasing it reactivates opposite with fresh DAS', () => {
    const h = harness(); h.down('ArrowLeft'); h.time(50); h.down('ArrowRight');
    h.tick(180); assert.deepEqual(h.calls, [['move', -1], ['move', 1], ['move', 1]]);
    h.up('ArrowRight'); assert.deepEqual(h.calls.at(-1), ['move', -1]);
    const n = h.calls.length; h.tick(309); assert.equal(h.calls.length, n);
    h.tick(310); assert.equal(h.calls.length, n + 1);
    h.up('ArrowLeft');
});

test('input is safely reset across UI focus, blur, pause, game end and destroy', () => {
    const h = harness();
    const control = { closest: () => ({}) };
    for (const props of [{ target: control }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
        assert.ok(!h.down('Space', props).defaultPrevented);
    }
    assert.equal(h.calls.length, 0);
    for (const event of ['blur', 'visibilitychange', 'focusin']) {
        h.down('ArrowLeft'); const n = h.calls.length;
        if (event === 'blur') h.window.fire(event);
        else { h.document.hidden = event === 'visibilitychange'; h.document.fire(event, { target: control }); h.document.hidden = false; }
        h.tick(10000); assert.equal(h.calls.length, n, event);
    }
    h.down('ArrowLeft'); h.sandbox.isPaused = true; h.tick(11000); h.sandbox.isPaused = false;
    const n = h.calls.length; h.tick(12000); assert.equal(h.calls.length, n);
    h.sandbox.running = false; h.down('Space'); assert.equal(h.calls.length, n);
    h.sandbox.running = true; h.game.over = true; h.down('Space'); assert.equal(h.calls.length, n);
    h.game.over = false; h.manager.destroy(); h.down('Space'); assert.equal(h.calls.length, n);
});

test('validated settings persist, reject conflicts/reserved keys and recover corrupt storage', () => {
    const h = harness('not-json'), M = h.sandbox.Manager;
    assert.equal(h.manager.DAS, 130); assert.equal(h.manager.ARR, 30);
    const settings = M.defaults(); settings.das = 100; settings.arr = 0; settings.bindings.left = 'KeyA';
    assert.equal(M.saveSettings(settings).ok, true);
    const h2 = harness(h.store.get('tb-input-settings-v1'));
    assert.equal(h2.manager.DAS, 100); assert.equal(h2.manager.ARR, 0);
    h2.down('KeyA'); assert.deepEqual(h2.calls, [['move', -1]]);
    for (const code of ['ArrowRight', 'KeyP', 'KeyM', 'Tab', 'Escape', '<script>']) {
        settings.bindings.left = code; assert.equal(M.saveSettings(settings).ok, false, code);
    }
    settings.bindings.left = 'KeyA';
    for (const value of [NaN, -1, 501, 'abc', null, Infinity]) { settings.das = value; assert.equal(M.saveSettings(settings).ok, false); }
    const broken = harness(JSON.stringify({ das: -9, arr: 999, bindings: { left: 'KeyP' } }));
    assert.equal(broken.manager.DAS, 130);
});

test('catch-up is bounded and ARR zero moves to wall without dropping across pieces', () => {
    const h = harness(); h.down('ArrowLeft'); h.tick(1e7);
    assert.ok(h.calls.length <= 9, 'at most eight catch-up actions');
    const n = h.calls.length; h.tick(1e7); assert.equal(h.calls.length, n);
    h.manager.reset(); h.manager.ARR = 0; h.game.piece.x = 5;
    let attempts = 0;
    h.game.move = d => { attempts++; if (h.game.piece.x === 0) return false; h.game.piece.x += d; return true; };
    h.down('ArrowLeft'); h.tick(1e7 + 130);
    assert.equal(h.game.piece.x, 0); assert.ok(attempts <= 11);
    h.manager.reset(); h.game.drop = () => { h.calls.push(['drop']); h.game.piece = { x: 5, y: 0 }; };
    const before = h.calls.length; h.down('ArrowDown'); h.tick(1e7 + 260);
    assert.equal(h.calls.length, before + 2, 'softdrop does not use zero ARR wall loop');
});

function uiDOM(h) {
    function element(tag) {
        const el = { ...target(), tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, hidden: false, disabled: false, value: '', style: {},
            append(...nodes) { for (const child of nodes) { child.parentElement = this; this.children.push(child); } },
            setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; },
            getAttribute(k) { return this.attributes[k]; },
            focus() { h.document.activeElement = this; },
            contains(node) { return this === node || this.children.some(c => c.contains(node)); },
            querySelectorAll(selector) { return this.children.flatMap(c => [c, ...c.querySelectorAll('*')]).filter(c => selector === '*' || (selector.includes('button') && c.tagName === 'BUTTON') || (selector.includes('input') && c.tagName === 'INPUT')); },
            showModal() { this.open = true; }, close() { this.open = false; this.fire('close'); },
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
        }; return el;
    }
    h.document.body = element('body');
    h.document.createElement = element;
    h.document.getElementById = id => h.document.body.querySelectorAll('*').find(e => e.id === id);
    h.document.querySelectorAll = selector => h.document.body.querySelectorAll(selector);
    h.document.body.style = { setProperty() {} };
    h.sandbox.inputManager = h.manager; h.sandbox.game = h.game;
    h.sandbox.togglePause = () => { h.sandbox.isPaused = !h.sandbox.isPaused; h.manager.reset(); };
    return element;
}
test('settings modal preserves prior pause, traps focus and denies live online editing', () => {
    const h = harness(); uiDOM(h); const M = h.sandbox.Manager;
    M.mountUI(); const dialog = h.document.getElementById('input-settings');
    assert.ok(dialog, 'settings dialog is injected');
    assert.ok(h.document.getElementById('input-settings-button'));
    assert.equal(M.openSettings(), true); assert.equal(h.sandbox.isPaused, true);
    assert.equal(M.shouldIgnoreEvent({ code: 'KeyP' }), true);
    const fields = dialog.querySelectorAll('button,input'); fields.at(-1).focus();
    dialog.fire('keydown', { key: 'Tab', target: fields.at(-1) }); assert.equal(h.document.activeElement, fields[0]);
    dialog.fire('keydown', { key: 'Escape' }); assert.equal(M.dialogOpen, false); assert.equal(h.sandbox.isPaused, false);
    h.sandbox.isPaused = true; M.openSettings(); M.closeSettings(); assert.equal(h.sandbox.isPaused, true);
    h.sandbox.currentMode = 'online'; h.sandbox.isPaused = false;
    assert.equal(M.openSettings(), false); assert.equal(h.sandbox.isPaused, false);
    h.sandbox.running = false; assert.equal(M.openSettings(), true); M.closeSettings();
    assert.equal(h.sandbox.isPaused, false);
});

test('two thumbs share repeat engine; pointer cancellation never leaves held movement', () => {
    const h = harness(); uiDOM(h); const M = h.sandbox.Manager; M.mountUI();
    const pad = h.document.getElementById('input-touch-pad'); assert.ok(pad);
    const buttons = pad.querySelectorAll('button'); assert.equal(buttons.length, 7);
    const left = buttons.find(b => b.getAttribute('data-action') === 'left');
    const rotate = buttons.find(b => b.getAttribute('data-action') === 'cw');
    left.fire('pointerdown', { pointerId: 1, button: 0 });
    rotate.fire('pointerdown', { pointerId: 2, button: 0 }); h.tick(130);
    assert.deepEqual(h.calls, [['move', -1], ['rotate', 1], ['move', -1]]);
    left.fire('pointercancel', { pointerId: 1 }); rotate.fire('lostpointercapture', { pointerId: 2 });
    const n = h.calls.length; h.tick(1000); assert.equal(h.calls.length, n);
    left.fire('pointerdown', { pointerId: 3, button: 0 }); h.manager.reset(); h.tick(2000);
    assert.equal(h.calls.length, n + 1);
});

test('Space requires release and remains single-shot across 60/120/144Hz and two-second holds', () => {
    for(const hz of [60,120,144]) {
        const h=harness();h.down('Space');h.down('Space');
        for(let i=1;i<=hz*2;i++){h.down('Space',{repeat:true});h.tick(i*1000/hz);}
        assert.equal(h.calls.length,1);h.up('Space');h.down('Space');assert.equal(h.calls.length,2);
    }
});
test('horizontal movement count is refresh-rate independent', () => {
    const counts=[60,120,144].map(hz=>{const h=harness();h.down('ArrowLeft');for(let i=1;i<=hz;i++)h.tick(i*1000/hz);return h.calls.length;});
    assert.equal(counts[0],counts[1]);assert.equal(counts[1],counts[2]);
});
test('horizontal repeat starts exactly at DAS 130 then ARR 30', () => {
    const h = harness();
    h.down('ArrowLeft'); assert.equal(h.calls.length, 1);
    h.tick(129); assert.equal(h.calls.length, 1);
    h.tick(130); assert.equal(h.calls.length, 2);
    h.tick(159); assert.equal(h.calls.length, 2);
    h.tick(190); assert.equal(h.calls.length, 4);
    h.up('ArrowLeft'); h.tick(300); assert.equal(h.calls.length, 4);
});
