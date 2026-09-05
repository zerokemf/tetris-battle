/* Shared leaderboard: server persistence, per-round idempotency, no gameplay changes. */
(() => {
    'use strict';
    const ENDPOINT = 'https://willienas.myqnapcloud.com/tetris-leaderboard/api.php';
    const MODES = ['solo', 'battle'];
    const NAME = /^[A-Za-z][A-Za-z0-9 _-]{0,15}$/;
    const el = id => document.getElementById(id);
    const result = el('leaderboard-result');
    const form = el('leaderboard-submit-form');
    const input = el('leaderboard-name');
    const submitButton = el('leaderboard-submit');
    const status = el('leaderboard-submit-status');
    const versions = { solo: 0, battle: 0 };
    let round = null;
    let refreshTask = null;

    function uuid() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }

    async function request(url, options = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
            if (!response.ok) {
                const error = new Error(response.status === 429 ? '送出太頻繁，請稍候再試。' : '排行榜服務暫時無法使用，請重試。');
                throw error;
            }
            const data = await response.json();
            if (!Array.isArray(data.scores) || (options.method === 'POST' && data.ok !== true)) throw new Error('排行榜回應異常，請重試。');
            return data;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('連線逾時，請重試。');
            if (error instanceof TypeError) throw new Error('無法連線，請檢查網路後重試。');
            throw error;
        } finally { clearTimeout(timer); }
    }

    function render(mode, scores) {
        const body = el(`leaderboard-${mode}-rows`);
        body.replaceChildren();
        const valid = scores.filter(s => s && typeof s.name === 'string' && Number.isSafeInteger(s.score) && s.score >= 0 && Number.isSafeInteger(s.lines) && s.lines >= 0).slice(0, 10);
        valid.forEach((score, i) => {
            const row = document.createElement('tr');
            [String(i + 1).padStart(2, '0'), score.name.slice(0, 16), score.score.toLocaleString(), score.lines.toLocaleString()].forEach(text => {
                const cell = document.createElement('td');
                cell.textContent = text;
                row.appendChild(cell);
            });
            body.appendChild(row);
        });
        el(`leaderboard-${mode}-status`).textContent = valid.length ? '最新共享成績' : '還沒有紀錄，等你來挑戰！';
    }

    async function load(mode) {
        const version = ++versions[mode];
        const message = el(`leaderboard-${mode}-status`);
        message.textContent = '讀取中…';
        try {
            const data = await request(`${ENDPOINT}?mode=${mode}`);
            if (version === versions[mode]) render(mode, data.scores);
        } catch (error) {
            if (version === versions[mode]) message.textContent = `${error.message} 可按「重新整理」；若有舊榜，僅供參考。`;
        }
    }

    function refresh() {
        if (refreshTask) return refreshTask;
        const button = el('leaderboard-refresh');
        button.disabled = true;
        refreshTask = Promise.all(MODES.map(load)).finally(() => { button.disabled = false; refreshTask = null; });
        return refreshTask;
    }

    function closeResult() { result.classList.add('hidden'); }

    function beginRound(mode) {
        closeResult();
        round = { mode, id: null, eligible: false, pending: false, submitted: false, payload: null };
        // Generate once per round. Fail only the ranking feature if crypto is unavailable.
        if (MODES.includes(mode)) { try { round.id = uuid(); } catch (_) { /* playable without ranking */ } }
        input.disabled = false;
        input.readOnly = false;
        input.removeAttribute('aria-invalid');
        submitButton.disabled = false;
        submitButton.textContent = '登錄成績';
        status.textContent = '';
        try { input.value = localStorage.getItem('tb-leaderboard-name') || ''; } catch (_) { input.value = ''; }
    }

    function showResult({ mode, lost, score, lines }) {
        if (!round || round.mode !== mode) return;
        if (round.eligible || round.submitted) return; // repeated end callbacks cannot unlock a round
        const eligible = MODES.includes(mode) && (mode === 'battle' || lost === true);
        result.classList.toggle('hidden', !eligible && mode !== 'online');
        form.classList.toggle('hidden', !eligible);
        el('leaderboard-result-title').textContent = mode === 'online' ? 'ONLINE · 不計排名' : '登錄共享排行榜';
        el('leaderboard-result-summary').textContent = mode === 'online'
            ? '朋友房為 P2P 對戰，不納入單人或 CPU 排行榜。'
            : `${mode === 'solo' ? 'SOLO 單人' : 'BATTLE CPU 對戰'} · 分數 ${score.toLocaleString()} · 消行 ${lines.toLocaleString()}`;
        if (!eligible) return;
        round.eligible = Boolean(round.id) && Number.isSafeInteger(score) && score >= 0 && Number.isSafeInteger(lines) && lines >= 0;
        round.score = score;
        round.lines = lines;
        submitButton.disabled = !round.eligible;
        if (!round.eligible) status.textContent = '本局無法建立登錄資料；你仍可回主選單繼續遊戲。';
    }

    async function submit(event) {
        event.preventDefault();
        const current = round;
        if (!current?.eligible || current.pending || current.submitted || result.classList.contains('hidden')) return;
        const name = input.value.trim();
        if (!NAME.test(name)) {
            input.setAttribute('aria-invalid', 'true');
            status.textContent = '請以英文字母開頭，共 1–16 字元；其餘可用英文字母、數字、空格、_ 或 -。';
            input.focus();
            return;
        }
        input.removeAttribute('aria-invalid');
        // Freeze the exact payload at first send: a timeout may already have persisted it.
        current.payload ||= { id: current.id, name, mode: current.mode, score: current.score, lines: current.lines };
        current.pending = true;
        input.readOnly = true;
        submitButton.disabled = true;
        submitButton.textContent = '登錄中…';
        status.textContent = '正在送出本局成績…';
        try {
            const data = await request(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current.payload) });
            current.submitted = true;
            ++versions[current.mode]; // invalidate an older GET, which must not overwrite this result
            render(current.mode, data.scores);
            try { localStorage.setItem('tb-leaderboard-name', current.payload.name); } catch (_) { /* optional preference */ }
            if (round === current) {
                input.disabled = true;
                submitButton.textContent = '已登錄';
                status.textContent = Number.isInteger(data.rank) && data.rank <= 10
                    ? `成績已登錄！目前第 ${data.rank} 名，回首頁即可查看。`
                    : '成績已登錄，本局未進前十名；首頁只顯示前十名。';
            }
        } catch (error) {
            if (round === current) {
                submitButton.disabled = false;
                submitButton.textContent = '重試登錄';
                status.textContent = `${error.message} 重試會使用相同名字與本局編號，不會重複登錄。`;
            }
        } finally { current.pending = false; }
    }

    form.addEventListener('submit', submit);
    el('leaderboard-refresh').addEventListener('click', refresh);
    window.TetrisLeaderboard = Object.freeze({ beginRound, showResult, closeResult, refresh });
    refresh();
})();
