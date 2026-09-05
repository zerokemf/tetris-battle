/* Load before game.js; game.js owns the game lifecycle and calls update/reset/destroy. */
document.addEventListener('DOMContentLoaded',()=>InputManager.mountUI(),{once:true});
class InputManager {
    static defaults() {
        return { das: 130, arr: 30, bindings: { left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown', cw: 'ArrowUp', ccw: 'KeyZ', hold: 'KeyC', hardDrop: 'Space' } };
    }
    constructor(game) {
        this.game = game;
        const settings = InputManager.loadSettings();
        this.DAS = settings.das;
        this.ARR = settings.arr;
        this.bindings = settings.bindings;
        this.held = new Map();
        this._kd = e => {
            if (InputManager.shouldIgnoreEvent(e) || !this.active()) return;
            if (e.repeat) { if (Object.values(this.bindings).includes(e.code)) e.preventDefault(); return; }
            const action = Object.keys(this.bindings).find(a => this.bindings[a] === e.code);
            if (!action) return;
            e.preventDefault();
            this.press(action, e.code);
        };
        this._ku = e => this.release(e.code);
        window.addEventListener('keydown', this._kd);
        window.addEventListener('keyup', this._ku);
        this._reset = () => this.reset();
        this._visibility = () => { if (document.hidden) this.reset(); };
        this._focus = e => { if (InputManager.isControl(e.target)) this.reset(); };
        window.addEventListener('blur', this._reset);
        document.addEventListener('visibilitychange', this._visibility);
        document.addEventListener('focusin', this._focus);
    }
    static current() { return typeof inputManager !== 'undefined' ? inputManager : null; }
    static onlineRunning() { return typeof running !== 'undefined' && running && typeof currentMode !== 'undefined' && currentMode === 'online'; }
    static labels() { return { left: '左移', right: '右移', down: '軟降', cw: '順時針旋轉', ccw: '逆時針旋轉', hold: '保留方塊', hardDrop: '直接落底' }; }
    static keyLabel(code) {
        return ({ ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓', ArrowUp: '↑', Space: '空白鍵', ShiftLeft: '左 Shift', ShiftRight: '右 Shift' })[code] || code.replace(/^Key|^Digit/, '');
    }
    static element(tag, text, attrs = {}) {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
        return el;
    }
    static mountUI() {
        if (InputManager.ui || !document.body) return;
        const make = InputManager.element;
        const button = make('button', '⚙ 操作設定', { id: 'input-settings-button', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'input-settings' });
        const dialog = make('dialog', '', { id: 'input-settings', 'aria-labelledby': 'input-settings-title', 'aria-describedby': 'input-settings-help' });
        const title = make('h2', '操作設定', { id: 'input-settings-title' });
        const help = make('p', '長按只會重複移動與軟降；旋轉、保留與落底每按一次觸發一次。', { id: 'input-settings-help' });
        const close = make('button', '關閉', { type: 'button', class: 'input-close', 'aria-label': '關閉操作設定' });
        const form = make('form');
        const numbers = make('div', '', { class: 'input-timing' });
        const das = make('input', '', { id: 'input-das', type: 'number', min: 0, max: 500, step: 1, required: '', inputmode: 'numeric' });
        const arr = make('input', '', { id: 'input-arr', type: 'number', min: 0, max: 100, step: 1, required: '', inputmode: 'numeric' });
        const dl = make('label', '開始連移延遲 DAS（毫秒）', { for: 'input-das' }); dl.append(das);
        const al = make('label', '連移間隔 ARR（毫秒）', { for: 'input-arr' }); al.append(arr);
        numbers.append(dl, al);
        const explanation = make('p', '預設 130／30。ARR 0 代表延遲後瞬移至牆；軟降最快每 10 毫秒一格。', { class: 'input-note' });
        const bindings = make('div', '', { class: 'input-bindings' });
        const fields = {};
        for (const [action, label] of Object.entries(InputManager.labels())) {
            const row = make('label', label, { for: 'input-key-' + action });
            const field = make('input', '', { id: 'input-key-' + action, type: 'text', readonly: '', 'aria-label': label + '：聚焦後按新按鍵', 'aria-describedby': 'input-key-help' });
            field.addEventListener('keydown', e => {
                if (e.key === 'Tab' || e.key === 'Escape') return;
                e.preventDefault(); e.stopPropagation();
                if (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
                const candidate = { ...InputManager.ui.draft, bindings: { ...InputManager.ui.draft.bindings, [action]: e.code } };
                const result = InputManager.validateSettings(candidate);
                if (!result.ok) { InputManager.ui.error.textContent = result.error; return; }
                InputManager.ui.draft = candidate; field.value = InputManager.keyLabel(e.code); InputManager.ui.error.textContent = '';
            });
            row.append(field); bindings.append(row); fields[action] = field;
        }
        const keyHelp = make('p', '點選按鍵欄後按新按鍵。P／M 保留；重複按鍵會提示，Tab 切換欄位、Esc 關閉。', { id: 'input-key-help', class: 'input-note' });
        const error = make('p', '', { id: 'input-settings-error', role: 'status', 'aria-live': 'polite' });
        const actions = make('div', '', { class: 'input-settings-actions' });
        const reset = make('button', '恢復預設', { type: 'button' });
        const save = make('button', '儲存並關閉', { type: 'submit' });
        actions.append(reset, save); form.append(numbers, explanation, bindings, keyHelp, error, actions);
        dialog.append(close, title, help, form); document.body.append(button, dialog);
        InputManager.ui = { button, dialog, das, arr, fields, error };
        button.addEventListener('click', e => { e.stopPropagation(); InputManager.openSettings(); });
        close.addEventListener('click', () => InputManager.closeSettings());
        reset.addEventListener('click', () => { InputManager.populateSettings(InputManager.defaults()); error.textContent = '已填入預設值，按「儲存並關閉」套用。'; });
        form.addEventListener('submit', e => {
            e.preventDefault();
            const result = InputManager.saveSettings({ ...InputManager.ui.draft, das: das.value === '' ? null : Number(das.value), arr: arr.value === '' ? null : Number(arr.value) });
            if (!result.ok) { error.textContent = result.error; return; }
            const manager = InputManager.current();
            if (manager) { manager.reset(); manager.DAS = result.settings.das; manager.ARR = result.settings.arr; manager.bindings = result.settings.bindings; }
            InputManager.closeSettings();
        });
        dialog.addEventListener('click', e => e.stopPropagation());
        dialog.addEventListener('cancel', e => { e.preventDefault(); InputManager.closeSettings(); });
        dialog.addEventListener('close', () => InputManager.closeSettings());
        dialog.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); InputManager.closeSettings(); }
            if (e.key === 'Tab') {
                const focusable = [...dialog.querySelectorAll('button,input')].filter(el => !el.disabled && !el.hidden);
                const first = focusable[0], last = focusable.at(-1);
                if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
                else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
            }
        });
        InputManager.mountTouch();
        InputManager.refreshUI();
    }
    static mountTouch() {
        const pad=InputManager.element('div','',{id:'input-touch-pad','aria-label':'雙拇指操作'});
        for(const [actions,groupName] of [[['left','down','right'],'移動'],[['ccw','cw','hold','hardDrop'],'旋轉與落地']]) {
            const group=InputManager.element('div','',{class:'touch-group','aria-label':groupName});
            for(const action of actions) {
                const label={left:'←',right:'→',down:'↓',cw:'↻',ccw:'↺',hold:'保留',hardDrop:'落地'}[action];
                const button=InputManager.element('button',label,{type:'button','data-action':action,'aria-label':InputManager.labels()[action]});
                button.addEventListener('pointerdown',e=>{
                    if(e.button!==0)return;
                    e.preventDefault();e.stopPropagation();
                    const manager=InputManager.current();
                    if(!manager?.active())return;
                    button.setPointerCapture?.(e.pointerId);
                    button.classList.add('pressed');manager.press(action,'touch-'+e.pointerId);
                });
                for(const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event,e=>{
                    e.preventDefault();button.classList.remove('pressed');InputManager.current()?.release('touch-'+e.pointerId);
                });
                button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
                group.append(button);
            }
            pad.append(group);
        }
        document.body.append(pad);
        // Legacy swipe/tap gestures are scoped to the local playfield only.
        let gesture=null;
        document.addEventListener('touchstart',e=>{
            const m=InputManager.current();
            if(!m?.active() || e.touches.length!==1) {gesture=null;return;}
            const local=document.getElementById(m.game.config?.boardId);
            if(!local || !local.parentElement?.contains(e.target)) {gesture=null;return;}
            const t=e.touches[0];gesture={x:t.clientX,y:t.clientY,id:t.identifier,time:performance.now(),m,moved:false};
        },{passive:true});
        document.addEventListener('touchmove',e=>{
            if(!gesture)return;
            if(e.touches.length!==1 || !gesture.m.active()){gesture=null;return;}
            const t=e.touches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
            if(Math.abs(dx)>30){gesture.m.perform(dx>0?'right':'left');gesture.x=t.clientX;gesture.moved=true;}
            if(Math.abs(dy)>30){gesture.m.perform(dy>0?'down':'cw');gesture.y=t.clientY;gesture.moved=true;}
            e.preventDefault();
        },{passive:false});
        document.addEventListener('touchend',e=>{
            const g=gesture;gesture=null;
            if(g && !e.touches.length && !g.moved && g.m.active() && performance.now()-g.time<200)g.m.perform('hardDrop');
        },{passive:true});
        document.addEventListener('touchcancel',()=>{gesture=null;},{passive:true});
    }
    static populateSettings(settings) {
        const ui = InputManager.ui; ui.draft = settings; ui.das.value = String(settings.das); ui.arr.value = String(settings.arr); ui.error.textContent = '';
        for (const [action, field] of Object.entries(ui.fields)) field.value = InputManager.keyLabel(settings.bindings[action]);
    }
    static openSettings() {
        if (InputManager.onlineRunning() || !InputManager.ui) return false;
        if (InputManager.dialogOpen) return true;
        const ui = InputManager.ui;
        ui.previousFocus = document.activeElement;
        ui.pausedManager = null;
        if (typeof running !== 'undefined' && running && typeof isPaused !== 'undefined' && !isPaused && typeof togglePause === 'function') {
            togglePause(); if (isPaused) ui.pausedManager = InputManager.current();
        }
        InputManager.current()?.reset();
        InputManager.dialogOpen = true;
        InputManager.populateSettings(InputManager.loadSettings());
        ui.dialog.showModal(); ui.dialog.querySelectorAll('button,input')[0]?.focus();
        return true;
    }
    static closeSettings() {
        if (!InputManager.dialogOpen) return;
        const ui = InputManager.ui;
        InputManager.dialogOpen = false;
        if (ui.dialog.open) ui.dialog.close();
        InputManager.current()?.reset();
        if (ui.pausedManager && ui.pausedManager === InputManager.current() && !ui.pausedManager.game.over && typeof running !== 'undefined' && running && typeof isPaused !== 'undefined' && isPaused && !InputManager.onlineRunning() && typeof togglePause === 'function') togglePause();
        ui.pausedManager = null;
        if (typeof running !== 'undefined' && running && !isPaused) document.body.focus();
        else (ui.previousFocus || ui.button)?.focus();
        InputManager.refreshUI();
    }
    static refreshUI() {
        if (!InputManager.ui) return;
        const disabled = InputManager.onlineRunning();
        InputManager.ui.button.disabled = disabled;
        InputManager.ui.button.title = disabled ? '線上對戰中無法暫停，請於開賽前設定' : '鍵盤與觸控操作設定';
        if (disabled && InputManager.dialogOpen) InputManager.closeSettings();
    }
    static validKey(code) {
        return typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Shift(Left|Right)|Numpad[0-9])$/.test(code) && !['KeyP', 'KeyM'].includes(code);
    }
    static validateSettings(value) {
        if (!value || !Number.isInteger(value.das) || value.das < 0 || value.das > 500 || !Number.isInteger(value.arr) || value.arr < 0 || value.arr > 100)
            return { ok: false, error: '延遲需為 0–500 毫秒；重複間隔需為 0–100 毫秒的整數。' };
        const bindings = {}, used = new Set();
        for (const action of Object.keys(InputManager.defaults().bindings)) {
            const code = value.bindings?.[action];
            if (!InputManager.validKey(code)) return { ok: false, error: '請選擇字母、數字、方向、空白或 Shift 鍵；P／M 保留給暫停與音樂。' };
            if (used.has(code)) return { ok: false, error: '按鍵重複：每個動作必須使用不同按鍵。' };
            bindings[action] = code; used.add(code);
        }
        return { ok: true, settings: { das: value.das, arr: value.arr, bindings } };
    }
    static loadSettings() {
        try {
            const result = InputManager.validateSettings(JSON.parse(localStorage.getItem('tb-input-settings-v1')));
            if (result.ok) return result.settings;
        } catch (_) { /* Private browsing / corrupt storage: retain working defaults. */ }
        return InputManager.defaults();
    }
    static saveSettings(value) {
        const result = InputManager.validateSettings(value);
        if (!result.ok) return result;
        try { localStorage.setItem('tb-input-settings-v1', JSON.stringify(result.settings)); }
        catch (_) { return { ok: false, error: '瀏覽器無法儲存設定，請檢查網站儲存權限。' }; }
        return result;
    }
    static isControl(target) {
        return !!(target?.isContentEditable || target?.closest?.('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="button"], [role="slider"]'));
    }
    static shouldIgnoreEvent(e) {
        return !!(e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || InputManager.isControl(e.target) || InputManager.dialogOpen);
    }
    active() {
        return !this.destroyed && !!this.game && !this.game.over && !document.hidden &&
            (typeof running === 'undefined' || running) && (typeof isPaused === 'undefined' || !isPaused) && !InputManager.dialogOpen;
    }
    reset() { this.held.clear(); document.querySelectorAll?.('#input-touch-pad .pressed').forEach(el=>el.classList.remove('pressed')); }
    destroy() {
        this.reset(); this.destroyed = true;
        window.removeEventListener('keydown', this._kd);
        window.removeEventListener('keyup', this._ku);
        window.removeEventListener('blur', this._reset);
        document.removeEventListener('visibilitychange', this._visibility);
        document.removeEventListener('focusin', this._focus);
    }
    press(action, source) {
        if (!this.active()) { this.reset(); return; }
        if (this.held.has(source)) return;
        this.held.set(source, { action, next: performance.now() + this.DAS });
        this.perform(action);
    }
    horizontal() { return [...this.held.values()].filter(s => s.action === 'left' || s.action === 'right').at(-1); }
    release(source) {
        const previous = this.horizontal();
        this.held.delete(source);
        const next = this.horizontal();
        if (next && next !== previous) {
            next.next = performance.now() + this.DAS;
            this.perform(next.action);
        }
    }
    perform(action) {
        if (!this.active()) return false;
        switch (action) {
            case 'left': return this.game.move(-1);
            case 'right': return this.game.move(1);
            case 'down': return this.game.drop();
            case 'cw': return this.game.rotate(1);
            case 'ccw': return this.game.rotate(-1);
            case 'hold': return this.game.holdPiece();
            case 'hardDrop': return this.game.hardDrop();
        }
    }
    update() {
        if (!this.active()) { this.reset(); return; }
        const now = performance.now();
        for (const state of this.held.values()) {
            if (state.action !== 'down' && state !== this.horizontal()) continue;
            if (now < state.next) continue;
            const horizontal = state.action !== 'down';
            // Zero ARR is instant horizontal travel, never repeated locks/drop spawns.
            if (horizontal && this.ARR === 0) {
                for (let i = 0; i < 20 && this.active(); i++) {
                    const piece = this.game.piece, x = piece?.x;
                    if (this.perform(state.action) === false || this.game.piece !== piece || (piece && piece.x === x)) break;
                }
                state.next = now + 1;
                continue;
            }
            const interval = Math.max(10, this.ARR);
            let count = 0;
            while (now >= state.next && count++ < 8 && this.active()) {
                const piece = this.game.piece;
                this.perform(state.action);
                state.next += interval;
                if (piece !== this.game.piece) { state.next = now + interval; break; }
            }
            if (now >= state.next) state.next = now + interval;
        }
    }
}
