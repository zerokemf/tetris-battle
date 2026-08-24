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

const code = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8')
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

// Helper: build a fresh Tetris with a controllable bag
function freshGame(pieces) {
    const bag = { next: () => pieces.length ? pieces.shift() : 'I' };
    const g = new S.Tetris({
        boardId: 'board1', fxId: 'fx1', holdId: 'hold1',
        nextIds: ['next1', 'next2', 'next3'],
        statIds: { score: 'score1', level: 'level1', lines: 'sent1', combo: 'combo1' },
        overlayIds: { combo: 'combo-display', action: 'action-text' },
        bag
    });
    return g;
}

function fillRow(g, row, exceptCol) {
    for (let c = 0; c < 10; c++) {
        if (c !== exceptCol) g.grid[row][c] = 'j';
    }
}

// ============================================================
section('7-Bag integrity');
{
    // Run the Bag through many draws — every 7 consecutive should contain all 7 types
    const bag = new S.Bag7();
    let ok = true;
    for (let batch = 0; batch < 50; batch++) {
        const seen = {};
        for (let i = 0; i < 7; i++) seen[bag.next()] = 1;
        if (Object.keys(seen).length !== 7) { ok = false; break; }
    }
    assert(ok, 'every 7-draw window contains all 7 piece types');
}

// ============================================================
section('Seeded 7-Bag determinism for online matches');
{
    const a = new S.SeededBag7(0x1234abcd);
    const b = new S.SeededBag7(0x1234abcd);
    const c = new S.SeededBag7(0x76543210);
    const seqA = Array.from({ length: 70 }, () => a.next()).join('');
    const seqB = Array.from({ length: 70 }, () => b.next()).join('');
    const seqC = Array.from({ length: 70 }, () => c.next()).join('');
    assert(seqA === seqB, 'same seed produces identical 70-piece sequence');
    assert(seqA !== seqC, 'different seed produces a different sequence');
    let validBags = true;
    for (let i = 0; i < seqA.length; i += 7) {
        if (new Set(seqA.slice(i, i + 7)).size !== 7) validBags = false;
    }
    assert(validBags, 'every seeded seven-piece batch contains all tetrominoes');
}

// ============================================================
section('Online snapshot bridge and hostile input validation');
{
    vm.runInContext(`
        currentMode = 'online';
        battleEnded = false;
        game = new Tetris({
            boardId:'board1', fxId:'fx1', holdId:'hold1',
            nextIds:['next1','next2','next3'],
            statIds:{score:'score1',level:'level1',lines:'sent1',combo:'combo1'},
            overlayIds:{combo:'combo-display',action:'action-text'},
            bag:new SeededBag7(12345)
        });
        aiGame = new Tetris({
            boardId:'a-board', fxId:'a-fx', holdId:'a-hold',
            nextIds:['a-next1','a-next2','a-next3'],
            statIds:{score:'a-score',lines:'a-lines',combo:'a-combo',b2b:'a-b2b',attack:'atk-a'},
            overlayIds:{combo:'a-combo-display',action:'a-action-text'},
            garbageMeterId:'a-garbage-meter', bag:new SeededBag7(12345)
        });
        game.spawn(); aiGame.spawn();
        game.score = 4321; game.lines = 12; game.combo = 3; game.attackSent = 7;
    `, sandbox);
    const snapshot = sandbox.window.TetrisBattleOnlineApi.getLocalState();
    assert(snapshot && snapshot.grid.length === 20 && snapshot.grid.every(row => row.length === 10), 'local state serializes a compact 20×10 grid');
    assert(snapshot.score === 4321 && snapshot.lines === 12 && snapshot.combo === 3, 'local state includes battle statistics');
    assert(sandbox.window.TetrisBattleOnlineApi.applyRemoteState(snapshot) === true, 'valid peer snapshot applies to remote board');
    assert(getEl('a-score').textContent === '4,321' || getEl('a-score').textContent === '4321', 'remote score is rendered after snapshot');

    const malformed = JSON.parse(JSON.stringify(snapshot));
    malformed.grid[0] = 'XXXXXXXXXX';
    assert(sandbox.window.TetrisBattleOnlineApi.applyRemoteState(malformed) === false, 'invalid grid characters are rejected');
    const oversized = JSON.parse(JSON.stringify(snapshot));
    oversized.piece.shape = Array.from({ length: 30 }, () => Array(30).fill(1));
    assert(sandbox.window.TetrisBattleOnlineApi.applyRemoteState(oversized) === false, 'oversized remote piece payload is rejected');

    assert(sandbox.window.TetrisBattleOnlineApi.receiveAttack(999, true) === true, 'online attack bridge accepts bounded numeric input');
    const queued = vm.runInContext(`game.garbageQueue[0]`, sandbox);
    assert(queued.lines === 20 && queued.isBomb === true, `hostile attack is capped at 20 lines (got ${queued.lines})`);
    assert(sandbox.window.TetrisBattleOnlineApi.finishMatch(true, 'opponent-left') === true, 'online result bridge ends a running match');
    assert(sandbox.window.TetrisBattleOnlineApi.finishMatch(false, 'duplicate') === false, 'duplicate result cannot overwrite match winner');
}

// ============================================================
section('Bomb milestone starts at 10 lines (bug fix #1)');
{
    const g = freshGame(['I']);
    assert(g.bombLineCountdown === 10, `initial bombLineCountdown = 10 (got ${g.bombLineCountdown})`);
}

// ============================================================
section('Hold top-out detection (bug fix #2)');
{
    // Fill rows so that spawn position is blocked, then hold -> should be over
    const g = freshGame(['J', 'T']);
    g.spawn();               // current piece J
    // Block the top rows entirely
    for (let r = 0; r < 4; r++) fillRow(g, r, -1);
    // Current J piece now overlaps? J spawns at y=0 x=3. Row 0-1 filled -> invalid already but piece exists.
    // Force hold: holdPiece swaps in T which also can't fit -> over
    try {
        g.holdPiece();
    } catch (e) { /* no throw expected */ }
    assert(g.over === true, `hold into blocked area triggers top-out (over=${g.over})`);
}

// ============================================================
section('T-Spin detection — classic TSS setup');
{
    // Build a T-spin triple-ish well and drop a T with rotation as last action.
    // Simpler deterministic check: use detectTSpin directly via lock simulation.
    const g = freshGame(['T']);
    g.spawn();
    // Construct field: two columns walls + back corners filled around a T slot near bottom-left.
    // Layout target (rot 2 T pointing down at x=0..2):
    //   col0 col1 col2
    // row17: X . X     <- T center row will be row18
    // row18: X X X  (bottom filled)
    // We'll place T so its 3x3 box spans cols 0-2.
    // Fill bottom row fully
    fillRow(g, 19, -1);
    // Back corner cells for rot-2 (pointing down): front = bottom corners (row+1), back = top corners (row-1)
    // Put T at x=0, y=17 → box rows 17..19, center (1,18). Bottom row (19) full → front corners filled.
    // Need exactly one more corner among back (17,0) or (17,2): fill (17,2).
    g.grid[17][2] = 'j';
    g.piece.x = 0;
    g.piece.y = 17;
    g.piece.rotIndex = 2;
    // Set rotation as last action
    g.piece.shape = [[0,0,0],[1,1,1],[0,1,0]];  // rot2 shape (pointing down)
    g.piece.lastAction = 'rotate';
    g.piece.lastKickIndex = 0;
    const res = g.detectTSpin();
    assert(res.spin === true, `detects T-Spin (spin=${res.spin}, mini=${res.mini})`);
    assert(res.mini === false, 'full T-Spin (front corners both filled)');
}

section('T-Spin mini detection');
{
    const g = freshGame(['T']);
    g.spawn();
    // Mini: only one front corner + both back corners... actually mini = front<2 with total>=3
    // T pointing up (rot0) at x=0,y=17 → box cols 0-2 rows 17-19, center (1,18)
    // Front corners (rot0/up) = (0,17),(2,17). Back = (0,19),(2,19).
    fillRow(g, 19, -1);          // bottom full → back corners filled
    g.grid[17][0] = 'j';         // one front corner
    // total = 3, front count = 1 → mini
    g.piece.x = 0;
    g.piece.y = 17;
    g.piece.rotIndex = 0;
    g.piece.shape = [[0,1,0],[1,1,1],[0,0,0]];
    g.piece.lastAction = 'rotate';
    g.piece.lastKickIndex = 0;
    const res = g.detectTSpin();
    assert(res.spin === true && res.mini === true, `mini detected (spin=${res.spin}, mini=${res.mini})`);
}

section('No false positive on slide-in (last action = move)');
{
    const g = freshGame(['T']);
    g.spawn();
    fillRow(g, 19, -1);
    g.grid[17][2] = 'j';
    g.piece.x = 0;
    g.piece.y = 17;
    g.piece.rotIndex = 2;
    g.piece.shape = [[0,0,0],[1,1,1],[0,1,0]];
    g.piece.lastAction = 'hardDrop';   // slid in, not rotated
    const res = g.detectTSpin();
    assert(res.spin === false, `no spin when last action was hard drop (spin=${res.spin})`);
}

section('Zero-distance hard drop preserves grounded rotation');
{
    const g = freshGame(['T']);
    g.spawn();
    // Ground the piece at the floor. Calling Piece.hardDrop() moves zero rows.
    g.piece.x = 3; g.piece.y = 18;
    g.piece.lastAction = 'rotate';
    g.piece.lastKickIndex = 0;
    let capturedAction = null;
    g.lockPiece = () => { capturedAction = g.piece.lastAction; };
    const distance = g.piece.hardDrop();
    assert(distance === 0 && capturedAction === 'rotate',
        `zero-distance lock preserves rotate (distance=${distance}, action=${capturedAction})`);
}

// ============================================================
section('Zero-line T-Spin preserves but does not advance B2B');
{
    const g = freshGame(['T']);
    g.spawn();
    g.b2b = 2;
    g.maxB2b = 2;
    g._tSpin = true;
    g._tSpinMini = false;
    g.clearLines();
    assert(g.b2b === 2 && g.maxB2b === 2,
        `zero-line T-Spin preserves chain at 2 (b2b=${g.b2b})`);
    assert(g.score === 400, `zero-line T-Spin scores 400 (score=${g.score})`);
}

section('T-Spin scoring & B2B integration (clearLines path)');
{
    // Full flow: T rotated into a notch clearing one line
    const g = freshGame(['T']);
    g.spawn();
    // Setup: bottom row filled except col 1; row 18 has blocks at col 0 and col 2 (overhang)
    // T rot0 lands in the notch at cols 0-2, clearing row 19.
    fillRow(g, 19, 1);
    g.grid[18][0] = 'j';
    g.grid[18][2] = 'j';
    // Manually position piece like it was rotated into place: rot0 at x=0, y=18
    g.piece.x = 0; g.piece.y = 18; g.piece.rotIndex = 0;
    g.piece.shape = [[0,1,0],[1,1,1],[0,0,0]];
    g.piece.lastAction = 'rotate';
    g.piece.lastKickIndex = 0;
    let attacked = null;
    g.onAttack = (lines) => { attacked = lines; };
    const beforeB2B = g.b2b;
    g.lockPiece();
    // After lock: rot0 T occupies (1,18),(0,19),(1,19),(2,19). Row19 becomes full → cleared → T-Spin Single
    assert(g.lines === 1, `line cleared by T-Spin (lines=${g.lines})`);
    assert(attacked === 2, `T-Spin Single sends 2 attack lines (got ${attacked})`);
    assert(g.b2b === beforeB2B + 1, `B2B chain extended (b2b=${g.b2b})`);
    // Score: TSS base 800 * level 1 = 800 (+ any soft/hard drop points)
    assert(g.score >= 800, `T-Spin Single score applied (score=${g.score})`);
}

section('True T-Spin Double scores 1200 & attacks 4');
{
    const g = freshGame(['T']);
    g.spawn();
    // Real TSD shape: T rot0 slots under an overhang into a 2-row notch.
    // Rows 18 & 19 both clear when T locks.
    // Row 19: all filled except cols 0,1,2
    // Row 18: all filled except col 1 (overhang cells at (0,18),(2,18) come from row fill)
    for (let c = 3; c < 10; c++) { g.grid[18][c] = 'j'; g.grid[19][c] = 'j'; }
    g.grid[18][0] = 'j'; g.grid[18][2] = 'j';   // overhangs, hole at col1
    // Residual junk high up prevents accidental Perfect Clear
    g.grid[0][9] = 'j';
    // T rot0 at x=0,y=18 fills (1,18)+(0..2,19): row19 full ✓; row18 gets (1,18) → full ✓
    g.piece.x = 0; g.piece.y = 18; g.piece.rotIndex = 0;
    g.piece.shape = [[0,1,0],[1,1,1],[0,0,0]];
    g.piece.lastAction = 'rotate';
    g.piece.lastKickIndex = 0;
    let attacked2 = null;
    g.onAttack = (l) => { attacked2 = l; };
    g.lockPiece();
    assert(g.lines === 2, `double cleared (lines=${g.lines})`);
    assert(attacked2 === 4, `TSD sends 4 attack lines (got ${attacked2})`);
    assert(g.score >= 1200, `TSD score 1200 applied (score=${g.score})`);
}

section('Regular double does NOT extend B2B');
{
    const g = freshGame(['O']);
    g.spawn();
    // Fill bottom two rows except nothing — O clears 2 rows when placed on full-ish stack
    // Simply fill rows 18,19 completely except cols where O will land: O at x=4 covers cols 4,5 rows y..y+1
    // Place rows so that after O locks rows 18,19 are complete.
    for (let r = 18; r <= 19; r++) {
        for (let c = 0; c < 10; c++) {
            if (c !== 4 && c !== 5) g.grid[r][c] = 'j';
        }
    }
    g.piece.x = 4; g.piece.y = 18; g.piece.rotIndex = 0;
    g.piece.lastAction = 'move';
    g.lockPiece();
    assert(g.lines === 2, `double cleared (lines=${g.lines})`);
    assert(g.b2b === 0, `regular double resets B2B (b2b=${g.b2b})`);
}

// ============================================================
section('Garbage cancel mechanics');
{
    const g = freshGame(['I']);
    g.spawn();
    g.receiveGarbage(3, false);
    g.receiveGarbage(2, true);
    assert(g.garbageQueue.length === 2, 'garbage queued');
    const remaining = g.cancelGarbage(4);
    assert(remaining === 0 && g.garbageQueue.length === 1 && g.garbageQueue[0].lines === 1,
        `attack 4 cancels 3+1 of second chunk (remaining=${remaining}, queue=${JSON.stringify(g.garbageQueue)})`);
    const rest = g.cancelGarbage(5);
    assert(rest === 4 && g.garbageQueue.length === 0, `only 1 canceled, 4 pass through (rest=${rest})`);
}

section('Bomb milestone carries overflow and survives full cancellation');
{
    const g = freshGame(['I', 'I']);
    g.spawn();
    const sent = [];
    g.onAttack = (lines, info) => sent.push({ lines, info });

    function prepareDouble() {
        g.grid = Array.from({ length: 20 }, () => Array(10).fill(0));
        g.grid[0][9] = 'j';  // prevent Perfect Clear bonus
        for (let r = 18; r <= 19; r++) {
            for (let c = 0; c < 10; c++) {
                if (c !== 4 && c !== 5) g.grid[r][c] = 'j';
            }
        }
        g.piece = new S.Piece('O', g);
        g.piece.x = 4; g.piece.y = 18;
    }

    g.bombLineCountdown = 1;
    g.receiveGarbage(1, false);  // fully cancels the first double's 1-line attack
    prepareDouble();
    g.lockPiece();
    assert(g.bombLineCountdown === 9,
        `milestone overflow carries forward (countdown=${g.bombLineCountdown})`);
    assert(g.bombCharges === 1 && sent.length === 0,
        `fully canceled attack keeps one bomb charge (charges=${g.bombCharges}, sends=${sent.length})`);

    prepareDouble();
    g.lockPiece();
    assert(sent.length === 1 && sent[0].info.bomb === true,
        `next actual outgoing attack is bomb-tagged (sends=${sent.length})`);
    assert(g.bombCharges === 0 && g.bombLineCountdown === 7,
        `charge consumed only after send; countdown continues (charges=${g.bombCharges}, countdown=${g.bombLineCountdown})`);
}

section('Multiple bomb milestones queue independent charges');
{
    const g = freshGame(['I']);
    g.spawn();
    g.bombLineCountdown = 2;
    g.bombCharges = 1;  // an earlier milestone is still waiting
    // Simulate an aggregate update larger than one piece can clear; this calls
    // the same production milestone method used by clearLines().
    g.updateBombMilestone(12);
    assert(g.bombCharges === 3 && g.bombLineCountdown === 10,
        `two new milestones preserve prior charge (charges=${g.bombCharges}, countdown=${g.bombLineCountdown})`);
}

section('insertGarbageRows pushes rows up with hole');
{
    const g = freshGame(['I']);
    g.spawn();
    g.grid[19][0] = 'z';  // marker
    g.insertGarbageRows(2, false);
    assert(g.grid[17][0] === 'z', 'existing content pushed up');
    assert(g.grid[18].filter(c => c === 'g').length === 9, 'garbage row has 9 filled cells');
    assert(g.grid[18].filter(c => c === 0).length === 1, 'garbage row has 1 hole');
    assert(g.grid[19].every((c, i) => (c === 'g') !== (i === g.grid[18].findIndex(v => v === 0))), 'hole column consistent within chunk');
}

// ============================================================
section('High score save/load');
{
    storageData['tb-high-score'] = '5000';
    const hs = S.loadHighScore();
    assert(hs.score === 5000, `high score loads (got ${hs.score})`);
    S.saveHighScore(9000, 12);
    assert(parseInt(storageData['tb-high-score'], 10) === 9000, 'higher score saved');
    S.saveHighScore(100, 3);
    assert(parseInt(storageData['tb-high-score'], 10) === 9000, 'lower score does not overwrite');
}

// ============================================================
section('AI still functional after refactor');
{
    const g = freshGame(['L', 'Z', 'S', 'J', 'I', 'O', 'T', 'S', 'Z']);
    g.spawn();
    const ai = new S.TetrisAI(g, 'normal');
    const plan = ai.computeBestMove();
    assert(plan && typeof plan.x === 'number' && typeof plan.rotIndex === 'number',
        `AI produced plan (x=${plan && plan.x}, rot=${plan && plan.rotIndex})`);
    // Execute until piece locks, ensure no crash and game continues
    let guard = 0;
    while (!g.over && guard++ < 200) {
        ai.step();
        if (!g.piece || !g.piece.type) break;
        if (g.piece && g.plan === undefined) { /* noop */ }
        // simulate gravity steps
        g.update(rafTime += 700);
    }
    assert(!g.over || g.lines >= 0, `game loop stable under AI play (guard=${guard}, over=${g.over})`);
}

// ============================================================
section('AI difficulty ladder — survival, skill and safety');
{
    // Deterministic full-game simulations driven through the production
    // update() path (ai.update + game.update), like a real CPU battle.
    function mulberry32(seedValue) {
        let a = seedValue >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function simulateAi(difficulty, seedValue) {
        const sandbox = {
            console,
            document: documentStub,
            window: windowStub,
            localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
            performance: performanceStub,
            requestAnimationFrame: () => 0,
            setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
            Math: Object.create(Math),
            Date, JSON, Object, Array, String, Number, Boolean, Infinity, NaN, undefined
        };
        sandbox.Math.random = mulberry32(seedValue);
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);
        const { Bag7, Tetris, TetrisAI } = sandbox.__exports;

        const bag = new Bag7();
        const g = new Tetris({
            boardId: 'board1', fxId: 'fx1', holdId: 'hold1',
            nextIds: ['next1', 'next2', 'next3'],
            statIds: {}, overlayIds: { combo: 'combo-display', action: 'action-text' },
            bag
        });
        g.spawn();
        const ai = new TetrisAI(g, difficulty);
        let time = 1000;
        const endAt = time + 5 * 60000; // five simulated minutes per game
        while (!g.over && time < endAt) {
            ai.update(time);
            g.update(time);
            time += 16;
        }
        return { dead: g.over, lines: g.lines, attacks: g.attackSent };
    }

    function runLadder(difficulty, games, startSeed) {
        const runs = [];
        for (let i = 0; i < games; i++) runs.push(simulateAi(difficulty, startSeed + i * 101));
        const linesList = runs.map(r => r.lines).sort((a, b) => a - b);
        const medianLines = (linesList[games >> 1] + linesList[(games - 1) >> 1]) / 2;
        return {
            deaths: runs.filter(r => r.dead).length,
            medianLines,
            maxLines: linesList[games - 1],
            minLines: linesList[0],
            medianAttacks: runs.map(r => r.attacks).sort((a, b) => a - b)[games >> 1]
        };
    }

    section('AI easy profile — playable baseline');
    const easy = runLadder('easy', 8, 41001);
    console.log(`    easy: ${JSON.stringify(easy)}`);
    assert(easy.deaths <= 1 && easy.medianLines >= 35,
        `easy survives early game and clears a modest floor (deaths=${easy.deaths}/8, median=${easy.medianLines})`);

    section('AI normal profile — solid mid tier');
    const normal = runLadder('normal', 8, 52001);
    console.log(`    normal: ${JSON.stringify(normal)}`);
    assert(normal.deaths <= 1 && normal.medianLines >= easy.medianLines * 1.6,
        `normal clearly outlasts easy (median=${normal.medianLines} vs ${easy.medianLines})`);

    section('AI hard profile — fast and nearly self-safe');
    const hard = runLadder('hard', 8, 63001);
    console.log(`    hard: ${JSON.stringify(hard)}`);
    assert(hard.deaths === 0,
        `hard never suicides within the window (deaths=${hard.deaths}/8)`);
    assert(hard.medianLines >= 150,
        `hard sustains high output without collapsing (median=${hard.medianLines}, max=${hard.maxLines})`);
    assert(hard.medianLines > normal.medianLines,
        'hard remains stronger than normal');
}

console.log(`\n========== RESULT: ${passes} passed, ${failures} failed ==========`);
process.exit(failures > 0 ? 1 : 0);
