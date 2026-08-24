// Tetris Battle Online P2P — static GitHub Pages + Trystero/WebRTC.
// Matchmaking uses public Nostr relays; game data travels directly between peers.
(() => {
    'use strict';

    const APP_ID = 'io.github.zerokemf.tetris-battle.online.v1';
    const PROTOCOL = 1;
    const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const ROOM_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
    const STATE_INTERVAL_MS = 100;
    const PING_INTERVAL_MS = 2000;
    const JOIN_TIMEOUT_MS = 18000;

    const ui = {};
    const state = {
        phase: 'idle',
        role: null,
        roomCode: '',
        room: null,
        actions: null,
        peerId: null,
        pendingPeerId: null,
        localReady: false,
        remoteReady: false,
        localRematch: false,
        remoteRematch: false,
        matchId: '',
        matchSeed: 0,
        sequence: 0,
        remoteSequence: -1,
        attackSequence: 0,
        remoteAttackSequence: -1,
        lastRemoteStateAt: 0,
        lastRemoteAttackAt: 0,
        clockOffset: 0,
        latency: null,
        countdownTimer: 0,
        stateTimer: 0,
        pingTimer: 0,
        joinTimer: 0,
        topoutTimer: 0,
        relayTimer: 0,
        stateSendPending: false,
        gameEnded: false,
        libraryError: '',
        module: null
    };

    const api = () => window.TetrisBattleOnlineApi;

    function cacheUi() {
        [
            'online-lobby', 'online-home', 'online-room-view', 'online-room-input',
            'online-room-code', 'online-copy-btn', 'online-network', 'online-network-text',
            'online-local-role', 'online-local-ready', 'online-remote-slot',
            'online-remote-name', 'online-remote-role', 'online-remote-ready',
            'online-ready-btn', 'online-countdown', 'online-status', 'online-error',
            'online-rematch-btn'
        ].forEach(id => { ui[id] = document.getElementById(id); });
    }

    function normalizeRoomCode(value) {
        return String(value || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .replace(/[IO01]/g, '')
            .slice(0, 6);
    }

    function generateRoomCode() {
        const bytes = new Uint8Array(6);
        crypto.getRandomValues(bytes);
        return [...bytes].map(value => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
    }

    function randomUint32() {
        const value = new Uint32Array(1);
        crypto.getRandomValues(value);
        return value[0] || 0x6d2b79f5;
    }

    function randomId(prefix = '') {
        return prefix + randomUint32().toString(36) + Date.now().toString(36);
    }

    function setHidden(element, hidden) {
        if (element) element.classList.toggle('hidden', hidden);
    }

    function setStatus(message) {
        if (ui['online-status']) ui['online-status'].textContent = message;
    }

    function showError(message) {
        if (!ui['online-error']) return;
        ui['online-error'].textContent = message;
        setHidden(ui['online-error'], !message);
    }

    function setNetwork(kind, text) {
        if (!ui['online-network']) return;
        ui['online-network'].classList.remove('connected', 'problem');
        if (kind) ui['online-network'].classList.add(kind);
        if (ui['online-network-text']) ui['online-network-text'].textContent = text;
    }

    function inviteUrl() {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('room', state.roomCode);
        return url.toString();
    }

    function updateUrlRoom(code) {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        if (code) url.searchParams.set('room', code);
        history.replaceState(null, '', url);
    }

    function renderLobby() {
        const inRoom = state.phase !== 'idle';
        setHidden(ui['online-home'], inRoom);
        setHidden(ui['online-room-view'], !inRoom);
        if (!inRoom) return;

        if (ui['online-room-code']) ui['online-room-code'].textContent = state.roomCode || '------';
        if (ui['online-local-role']) ui['online-local-role'].textContent = state.role === 'host' ? '房主' : '加入者';

        const connected = Boolean(state.peerId);
        if (ui['online-remote-slot']) ui['online-remote-slot'].classList.toggle('empty', !connected);
        if (ui['online-remote-name']) ui['online-remote-name'].textContent = connected ? 'FRIEND' : 'WAITING...';
        if (ui['online-remote-role']) ui['online-remote-role'].textContent = connected ? (state.role === 'host' ? '加入者' : '房主') : '等待朋友加入';

        const localReady = ui['online-local-ready'];
        if (localReady) {
            localReady.textContent = state.localReady ? 'READY' : '等待';
            localReady.classList.toggle('ready', state.localReady);
        }
        const remoteReady = ui['online-remote-ready'];
        if (remoteReady) {
            remoteReady.textContent = connected ? (state.remoteReady ? 'READY' : '等待') : '離線';
            remoteReady.classList.toggle('ready', connected && state.remoteReady);
        }

        if (ui['online-ready-btn']) {
            const clockReady = state.latency !== null;
            ui['online-ready-btn'].disabled = !connected || !clockReady || state.phase === 'countdown';
            ui['online-ready-btn'].textContent = state.localReady ? 'CANCEL READY' : (connected && !clockReady ? 'SYNCING...' : 'READY');
            ui['online-ready-btn'].classList.toggle('is-ready', state.localReady);
        }

        if (connected) {
            const latencyText = Number.isFinite(state.latency) ? `P2P 已連線 · ${state.latency}ms` : 'P2P 已連線';
            setNetwork('connected', latencyText);
        }
    }

    async function loadLibrary() {
        if (state.module) return state.module;
        setNetwork('', '載入 P2P 模組...');
        try {
            state.module = await import('./vendor/trystero-nostr-0.25.3.min.js');
            setNetwork('', 'P2P 模組已就緒');
            return state.module;
        } catch (error) {
            state.libraryError = String(error && error.message || error);
            setNetwork('problem', 'P2P 模組載入失敗');
            showError('無法載入線上連線模組，請重新整理後再試。');
            throw error;
        }
    }

    function validPeer(peerId) {
        return Boolean(peerId && state.peerId && peerId === state.peerId);
    }

    function sendAction(name, data) {
        const action = state.actions && state.actions[name];
        if (!action || !state.peerId) return Promise.resolve(false);
        return action.send(data, { target: state.peerId })
            .then(() => true)
            .catch(() => false);
    }

    function clearTimer(name, interval = false) {
        if (!state[name]) return;
        (interval ? clearInterval : clearTimeout)(state[name]);
        state[name] = 0;
    }

    function clearNetworkTimers() {
        clearTimer('countdownTimer', true);
        clearTimer('stateTimer', true);
        clearTimer('pingTimer', true);
        clearTimer('relayTimer', true);
        clearTimer('joinTimer');
        clearTimer('topoutTimer');
    }

    function resetMatchFlags() {
        state.localReady = false;
        state.remoteReady = false;
        state.localRematch = false;
        state.remoteRematch = false;
        state.sequence = 0;
        state.remoteSequence = -1;
        state.attackSequence = 0;
        state.remoteAttackSequence = -1;
        state.lastRemoteStateAt = 0;
        state.lastRemoteAttackAt = 0;
        state.stateSendPending = false;
        state.gameEnded = false;
        setHidden(ui['online-countdown'], true);
        renderLobby();
    }

    function handlePeerDeparture(peerId, source = 'transport') {
        if (!peerId || peerId !== state.peerId) return false;
        const priorPhase = state.phase;
        state.peerId = null;
        state.pendingPeerId = null;
        state.remoteReady = false;
        state.remoteRematch = false;
        state.latency = null;
        state.clockOffset = 0;
        clearTimer('pingTimer', true);
        clearTimer('countdownTimer', true);
        setHidden(ui['online-countdown'], true);

        if (priorPhase === 'playing') {
            api()?.finishMatch(true, 'opponent-left');
        } else {
            state.phase = 'lobby';
            const ended = priorPhase === 'ended';
            setStatus(state.role === 'host'
                ? '朋友已離開，等待新玩家加入...'
                : '房主已離線，房間已結束。');
            setNetwork('problem', source === 'explicit' ? '對手已離開' : '對手連線中斷');
            if (state.role === 'guest' && ui['online-ready-btn']) ui['online-ready-btn'].disabled = true;
            if (ended && ui['online-rematch-btn']) {
                ui['online-rematch-btn'].disabled = true;
                ui['online-rematch-btn'].textContent = 'OPPONENT LEFT';
                const sub = document.getElementById('gameover-sub');
                if (sub) sub.textContent = '對手已離線，無法再戰。';
            }
            renderLobby();
        }
        return true;
    }

    function setupActions(room) {
        const names = ['ready', 'start', 'state', 'attack', 'topout', 'result', 'rematch', 'ping', 'pong'];
        state.actions = Object.fromEntries(names.map(name => [name, room.makeAction(name)]));
        state.actions.leave = room.makeAction('leave', {
            kind: 'request',
            onRequest: (data, meta) => {
                if (!validPeer(meta.peerId) || !data || data.v !== PROTOCOL) return { v: PROTOCOL, ok: false };
                const handled = handlePeerDeparture(meta.peerId, 'explicit');
                return { v: PROTOCOL, ok: handled };
            }
        });

        state.actions.ready.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || !data || data.v !== PROTOCOL) return;
            state.remoteReady = Boolean(data.ready);
            renderLobby();
            if (state.role === 'host') maybeStartCountdown();
        };

        state.actions.start.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || state.role !== 'guest' || !data || data.v !== PROTOCOL) return;
            const seed = Number(data.seed) >>> 0;
            const hostStartAt = Number(data.startAt);
            const matchId = String(data.matchId || '').slice(0, 40);
            if (!seed || !Number.isFinite(hostStartAt) || !matchId) return;
            scheduleCountdown(seed, hostStartAt - state.clockOffset, matchId);
        };

        state.actions.state.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || state.phase !== 'playing' || !data || data.v !== PROTOCOL) return;
            if (data.matchId !== state.matchId) return;
            const sequence = Number(data.seq);
            if (!Number.isSafeInteger(sequence) || sequence <= state.remoteSequence) return;
            const now = performance.now();
            if (now - state.lastRemoteStateAt < 35) return;
            if (api()?.applyRemoteState(data.snapshot)) {
                state.remoteSequence = sequence;
                state.lastRemoteStateAt = now;
            }
        };

        state.actions.attack.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || state.phase !== 'playing' || !data || data.v !== PROTOCOL) return;
            if (data.matchId !== state.matchId) return;
            const sequence = Number(data.seq);
            if (!Number.isSafeInteger(sequence) || sequence <= state.remoteAttackSequence) return;
            const now = performance.now();
            if (now - state.lastRemoteAttackAt < 45) return;
            if (api()?.receiveAttack(data.lines, data.bomb)) {
                state.remoteAttackSequence = sequence;
                state.lastRemoteAttackAt = now;
            }
        };

        state.actions.topout.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || state.role !== 'host' || state.phase !== 'playing') return;
            if (!data || data.v !== PROTOCOL || data.matchId !== state.matchId) return;
            sendResult('host', 'topout');
            api()?.finishMatch(true, 'topout');
        };

        state.actions.result.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || state.role !== 'guest' || state.phase !== 'playing') return;
            if (!data || data.v !== PROTOCOL || data.matchId !== state.matchId) return;
            clearTimer('topoutTimer');
            api()?.finishMatch(data.winnerRole === state.role, String(data.reason || 'topout'));
        };

        state.actions.rematch.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || !data || data.v !== PROTOCOL) return;
            state.remoteRematch = Boolean(data.ready);
            if (state.role === 'host') maybeStartRematch();
            const sub = document.getElementById('gameover-sub');
            if (sub && state.remoteRematch) sub.textContent = '對手已準備再戰。';
        };

        state.actions.ping.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || !data || data.v !== PROTOCOL) return;
            sendAction('pong', { v: PROTOCOL, id: data.id, sentAt: data.sentAt, responderTime: Date.now() });
        };

        state.actions.pong.onMessage = (data, meta) => {
            if (!validPeer(meta.peerId) || !data || data.v !== PROTOCOL) return;
            const now = Date.now();
            const sentAt = Number(data.sentAt);
            const responderTime = Number(data.responderTime);
            if (!Number.isFinite(sentAt) || !Number.isFinite(responderTime)) return;
            const rtt = Math.max(0, Math.min(9999, now - sentAt));
            state.latency = Math.round(rtt);
            if (state.role === 'guest') state.clockOffset = responderTime + rtt / 2 - now;
            renderLobby();
            if (api()?.isRunning) {
                const dd = document.getElementById('difficulty-display');
                if (dd) dd.textContent = `ONLINE ${state.latency}ms`;
            }
        };
    }

    async function peerHandshake(peerId, send, receive) {
        await send({ v: PROTOCOL, role: state.role, roomCode: state.roomCode });
        const message = await receive();
        const data = message && message.data;
        if (!data || data.v !== PROTOCOL || data.roomCode !== state.roomCode) throw new Error('PROTOCOL_MISMATCH');

        const expectedRole = state.role === 'host' ? 'guest' : 'host';
        if (data.role !== expectedRole) throw new Error('ROLE_MISMATCH');
        if (state.role === 'host') {
            const full = (state.peerId && state.peerId !== peerId) || (state.pendingPeerId && state.pendingPeerId !== peerId);
            if (full) {
                await send({ v: PROTOCOL, decision: 'ROOM_FULL' });
                throw new Error('ROOM_FULL');
            }
            state.pendingPeerId = peerId;
            await send({ v: PROTOCOL, decision: 'ACCEPT' });
        } else {
            if (state.peerId && state.peerId !== peerId) throw new Error('ROOM_FULL');
            const decisionMessage = await receive();
            const decision = decisionMessage && decisionMessage.data;
            if (!decision || decision.v !== PROTOCOL || decision.decision !== 'ACCEPT') {
                throw new Error(decision && decision.decision === 'ROOM_FULL' ? 'ROOM_FULL' : 'HANDSHAKE_REJECTED');
            }
        }
    }

    function onJoinError(details) {
        if (details && details.peerId === state.pendingPeerId) state.pendingPeerId = null;
        const message = String(details && details.error && details.error.message || details && details.error || '');
        if (/ROOM_FULL/.test(message)) {
            if (state.role === 'host' && state.peerId) {
                setStatus('已拒絕第三位玩家；房間仍維持兩人。');
                return;
            }
            showError('房間已有兩位玩家，請使用其他房號。');
            setStatus('房間已滿');
        } else if (/ROLE_MISMATCH/.test(message)) {
            // Expected when two hosts accidentally generate the same code; keep waiting.
            if (state.role === 'guest') showError('找不到可加入的房主，請確認房號。');
        } else if (message) {
            setNetwork('problem', '無法建立 P2P 連線');
            showError('P2P 連線失敗。此網路可能需要 TURN Relay，請改用其他網路後再試。');
        }
    }

    async function enterRoom(role, rawCode) {
        const code = normalizeRoomCode(rawCode);
        if (!ROOM_PATTERN.test(code)) {
            showError('房號格式錯誤，請輸入 6 碼英文字母或數字。');
            return false;
        }

        await leaveRoom({ keepLobby: true, keepError: false, keepUrl: true });
        state.phase = 'loading';
        state.role = role;
        state.roomCode = code;
        state.localReady = false;
        state.remoteReady = false;
        showError('');
        setHidden(ui['online-home'], true);
        setHidden(ui['online-room-view'], false);
        renderLobby();
        setStatus(role === 'host' ? '正在建立房間...' : '正在尋找房主...');
        setNetwork('', '連接公開 Nostr signaling...');
        updateUrlRoom(code);

        try {
            const module = await loadLibrary();
            if (state.roomCode !== code || state.role !== role) return false;
            const room = module.joinRoom({
                appId: APP_ID,
                password: `tb-${code}-v1`,
                relayConfig: { redundancy: 4, warnOnRelayFailure: false }
            }, `friend-${code.toLowerCase()}`, {
                onPeerHandshake: peerHandshake,
                onJoinError,
                handshakeTimeoutMs: 12000
            });
            state.room = room;
            setupActions(room);

            room.onPeerJoin = peerId => {
                if (state.peerId && state.peerId !== peerId) return;
                state.peerId = peerId;
                state.pendingPeerId = null;
                state.phase = 'lobby';
                state.latency = null;
                state.clockOffset = 0;
                clearTimer('joinTimer');
                state.localReady = false;
                state.remoteReady = false;
                setStatus('朋友已加入，雙方按 READY 開始。');
                setNetwork('connected', 'P2P 已連線');
                startPingLoop();
                renderLobby();
            };

            room.onPeerLeave = peerId => {
                handlePeerDeparture(peerId, 'transport');
            };

            state.phase = 'lobby';
            setStatus(role === 'host' ? '房間已建立，等待朋友輸入房號。' : '正在尋找房主...');
            setNetwork('', 'Signaling 已連線，搜尋 P2P 對手...');
            renderLobby();

            if (role === 'guest') {
                state.joinTimer = setTimeout(() => {
                    if (!state.peerId && state.role === 'guest') {
                        setNetwork('problem', '找不到房間');
                        showError('找不到這個房間。請確認房號，或請房主保持頁面開啟。');
                        setStatus('加入逾時');
                    }
                }, JOIN_TIMEOUT_MS);
            }
            state.relayTimer = setInterval(updateRelayStatus, 1200);
            return true;
        } catch (error) {
            setNetwork('problem', '連線模組錯誤');
            showError('目前無法使用 P2P 配對服務，請稍後再試。');
            return false;
        }
    }

    function updateRelayStatus() {
        if (state.peerId || !state.module || typeof state.module.getRelaySockets !== 'function') return;
        try {
            const sockets = Object.values(state.module.getRelaySockets());
            const openCount = sockets.filter(socket => socket && socket.readyState === WebSocket.OPEN).length;
            if (openCount > 0) setNetwork('', `${openCount} 個 signaling relay 已連線`);
        } catch (_) {}
    }

    function startPingLoop() {
        clearTimer('pingTimer', true);
        const sendPing = () => sendAction('ping', { v: PROTOCOL, id: randomId('p'), sentAt: Date.now() });
        sendPing();
        state.pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
    }

    function toggleReady() {
        if (!state.peerId || !['lobby', 'ended'].includes(state.phase)) return;
        state.localReady = !state.localReady;
        sendAction('ready', { v: PROTOCOL, ready: state.localReady });
        renderLobby();
        setStatus(state.localReady ? '已準備，等待對手...' : '已取消準備。');
        if (state.role === 'host') maybeStartCountdown();
    }

    function maybeStartCountdown() {
        if (state.role !== 'host' || state.phase !== 'lobby' || !state.localReady || !state.remoteReady || !state.peerId) return;
        const seed = randomUint32();
        const matchId = randomId('m');
        const startAt = Date.now() + 3600;
        sendAction('start', { v: PROTOCOL, seed, matchId, startAt });
        scheduleCountdown(seed, startAt, matchId);
    }

    function scheduleCountdown(seed, localStartAt, matchId) {
        if (!state.peerId) return;
        clearTimer('countdownTimer', true);
        state.phase = 'countdown';
        state.matchSeed = seed;
        state.matchId = matchId;
        state.localReady = false;
        state.remoteReady = false;
        document.getElementById('gameover')?.classList.remove('show');
        setHidden(ui['online-lobby'], false);
        setHidden(ui['online-home'], true);
        setHidden(ui['online-room-view'], false);
        setHidden(ui['online-countdown'], false);
        if (ui['online-ready-btn']) ui['online-ready-btn'].disabled = true;
        setStatus('同步倒數中...');
        renderLobby();

        const update = () => {
            const remaining = localStartAt - Date.now();
            if (remaining > 0) {
                if (ui['online-countdown']) ui['online-countdown'].textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
                return;
            }
            clearTimer('countdownTimer', true);
            if (ui['online-countdown']) ui['online-countdown'].textContent = 'GO!';
            setTimeout(() => {
                setHidden(ui['online-countdown'], true);
                api()?.startMatch(seed);
            }, 180);
        };
        update();
        state.countdownTimer = setInterval(update, 80);
    }

    function handleGameStarted(seed) {
        state.phase = 'playing';
        state.matchSeed = seed >>> 0;
        state.sequence = 0;
        state.remoteSequence = -1;
        state.attackSequence = 0;
        state.remoteAttackSequence = -1;
        state.lastRemoteStateAt = 0;
        state.lastRemoteAttackAt = 0;
        state.stateSendPending = false;
        state.gameEnded = false;
        state.localRematch = false;
        state.remoteRematch = false;
        setHidden(ui['online-lobby'], true);
        clearTimer('stateTimer', true);
        const broadcastState = () => {
            if (state.phase !== 'playing' || !state.peerId || !api()?.isRunning || state.stateSendPending) return;
            const snapshot = api().getLocalState();
            if (!snapshot) return;
            state.stateSendPending = true;
            sendAction('state', {
                v: PROTOCOL,
                matchId: state.matchId,
                seq: ++state.sequence,
                snapshot
            }).finally(() => { state.stateSendPending = false; });
        };
        broadcastState();
        state.stateTimer = setInterval(broadcastState, STATE_INTERVAL_MS);
    }

    function handleLocalAttack(lines, info) {
        if (state.phase !== 'playing' || !state.peerId) return;
        const bomb = Boolean(info && (info.bomb || info.b2b >= 3 || info.pc));
        sendAction('attack', {
            v: PROTOCOL,
            matchId: state.matchId,
            seq: ++state.attackSequence,
            lines: Math.max(0, Math.min(20, Math.trunc(Number(lines) || 0))),
            bomb
        });
    }

    function sendResult(winnerRole, reason) {
        return sendAction('result', {
            v: PROTOCOL,
            matchId: state.matchId,
            winnerRole,
            reason
        });
    }

    function handleLocalTopOut() {
        if (state.phase !== 'playing' || state.gameEnded) return;
        if (state.role === 'host') {
            sendResult('guest', 'topout');
            api()?.finishMatch(false, 'topout');
        } else {
            setStatus('等待房主確認結果...');
            sendAction('topout', { v: PROTOCOL, matchId: state.matchId });
            clearTimer('topoutTimer');
            state.topoutTimer = setTimeout(() => api()?.finishMatch(false, 'connection-lost'), 2200);
        }
    }

    function handleGameEnded() {
        state.phase = 'ended';
        state.gameEnded = true;
        state.localRematch = false;
        state.remoteRematch = false;
        clearTimer('stateTimer', true);
        clearTimer('topoutTimer');
        if (ui['online-rematch-btn']) {
            ui['online-rematch-btn'].disabled = !state.peerId;
            ui['online-rematch-btn'].textContent = 'REMATCH';
        }
    }

    function requestRematch() {
        if (state.phase !== 'ended' || !state.peerId || state.localRematch) return;
        state.localRematch = true;
        sendAction('rematch', { v: PROTOCOL, ready: true });
        if (ui['online-rematch-btn']) {
            ui['online-rematch-btn'].disabled = true;
            ui['online-rematch-btn'].textContent = 'WAITING...';
        }
        const sub = document.getElementById('gameover-sub');
        if (sub) sub.textContent = '等待對手同意再戰...';
        if (state.role === 'host') maybeStartRematch();
    }

    function maybeStartRematch() {
        if (state.role !== 'host' || state.phase !== 'ended' || !state.localRematch || !state.remoteRematch || !state.peerId) return;
        const seed = randomUint32();
        const matchId = randomId('m');
        const startAt = Date.now() + 3600;
        sendAction('start', { v: PROTOCOL, seed, matchId, startAt });
        document.getElementById('gameover').classList.remove('show');
        setHidden(ui['online-lobby'], false);
        setHidden(ui['online-home'], true);
        setHidden(ui['online-room-view'], false);
        scheduleCountdown(seed, startAt, matchId);
    }

    async function copyInvite() {
        const text = inviteUrl();
        try {
            await navigator.clipboard.writeText(text);
        } catch (_) {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
        }
        if (ui['online-copy-btn']) {
            const old = ui['online-copy-btn'].textContent;
            ui['online-copy-btn'].textContent = '已複製';
            setTimeout(() => { if (ui['online-copy-btn']) ui['online-copy-btn'].textContent = old; }, 1200);
        }
    }

    async function leaveRoom(options = {}) {
        const departingPeer = state.peerId;
        const departingPhase = state.phase;
        clearNetworkTimers();
        if (state.room && departingPeer && state.actions?.leave) {
            try {
                await state.actions.leave.request({
                    v: PROTOCOL,
                    phase: departingPhase,
                    matchId: state.matchId
                }, {
                    target: departingPeer,
                    timeoutMs: 800
                });
            } catch (_) {}
        }
        if (state.room) {
            try { state.room.leave(); } catch (_) {}
        }
        state.phase = 'idle';
        state.role = null;
        state.roomCode = '';
        state.room = null;
        state.actions = null;
        state.peerId = null;
        state.pendingPeerId = null;
        state.localReady = false;
        state.remoteReady = false;
        state.localRematch = false;
        state.remoteRematch = false;
        state.matchId = '';
        state.latency = null;
        state.clockOffset = 0;
        if (!options.keepUrl) updateUrlRoom('');
        if (!options.keepError) showError('');
        if (!options.keepLobby) {
            setHidden(ui['online-room-view'], true);
            setHidden(ui['online-home'], false);
            setStatus('');
            setNetwork('', 'P2P 模組已就緒');
        }
        renderLobby();
    }

    async function handleBackMenu() {
        await leaveRoom();
        setHidden(ui['online-lobby'], true);
    }

    function joinFromForm(event) {
        event.preventDefault();
        enterRoom('guest', ui['online-room-input']?.value);
    }

    function createRoom() {
        enterRoom('host', generateRoomCode());
    }

    function openLobby() {
        cacheUi();
        setHidden(ui['online-lobby'], false);
        showError('');
        if (state.phase === 'idle') {
            setHidden(ui['online-home'], false);
            setHidden(ui['online-room-view'], true);
        } else {
            renderLobby();
        }
        loadLibrary().catch(() => {});
        setTimeout(() => ui['online-room-input']?.focus(), 50);
    }

    async function closeLobby() {
        if (state.phase !== 'idle') await leaveRoom();
        setHidden(ui['online-lobby'], true);
    }

    function joinFromUrl() {
        const code = normalizeRoomCode(new URL(location.href).searchParams.get('room'));
        if (!ROOM_PATTERN.test(code)) return;
        openLobby();
        if (ui['online-room-input']) ui['online-room-input'].value = code;
        enterRoom('guest', code);
    }

    cacheUi();
    if (ui['online-room-input']) {
        ui['online-room-input'].addEventListener('input', event => {
            const normalized = normalizeRoomCode(event.target.value);
            if (event.target.value !== normalized) event.target.value = normalized;
            showError('');
        });
    }

    window.openOnlineLobby = openLobby;
    window.closeOnlineLobby = closeLobby;
    window.onlineBattle = Object.freeze({
        createRoom,
        joinFromForm,
        toggleReady,
        leaveRoom,
        copyInvite,
        handleLocalAttack,
        handleLocalTopOut,
        handleGameStarted,
        handleGameEnded,
        handleBackMenu,
        requestRematch,
        get phase() { return state.phase; },
        get role() { return state.role; },
        get roomCode() { return state.roomCode; },
        get connected() { return Boolean(state.peerId); },
        get latency() { return state.latency; },
        get localReady() { return state.localReady; },
        get remoteReady() { return state.remoteReady; },
        get matchId() { return state.matchId; },
        get matchSeed() { return state.matchSeed; },
        get protocol() { return PROTOCOL; },
        get libraryVersion() { return 'trystero-0.25.3-nostr'; }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', joinFromUrl, { once: true });
    } else {
        joinFromUrl();
    }
})();
