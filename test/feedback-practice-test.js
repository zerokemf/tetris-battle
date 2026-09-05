const assert = require('node:assert/strict');
const {S, sandbox, run, setTime, getEl, storageData} = require('./core-harness');
let passes = 0;
function test(name, fn) { try { fn(); passes++; console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name); throw e; } }
function board() {
  const g = new S.Tetris({ boardId:'p-board',fxId:'p-fx',holdId:'p-hold',nextIds:[],statIds:{},overlayIds:{combo:'p-combo-display',action:'p-action-text'},bag:new S.SeededBag7(12345) });
  g.spawn(); return g;
}
test('clear feedback reports generated, canceled and actually sent attack', () => {
  const g = board(); let sent=0; g.onAttack=n=>{sent+=n;};
  g.grid[10][0]='j'; for(let r=16;r<20;r++) g.grid[r].fill('i');
  g.receiveGarbage(3,false); g.clearLines();
  assert.equal(sent,1); assert.equal(g.score,800);
  assert.ok(g.lastClearEvent, 'clear event must be recorded by the real clearLines path');
  assert.deepEqual(JSON.parse(JSON.stringify(g.lastClearEvent)), {seq:1,label:'TETRIS!',tier:4,combo:1,cleared:4,generated:4,canceled:3,sent:1});
});
test('pressure and clear HUD derive from actual pending queue and occupied height', () => {
  const g=board(); g.grid[4][0]='j'; g.receiveGarbage(2,true);
  assert.equal(typeof g.syncCombatHUD,'function'); g.syncCombatHUD();
  assert.match(getEl('p-board-pressure').textContent, /堆高 16.*待接收 2/);
  g.grid=Array.from({length:20},()=>Array(10).fill(0));g.garbageQueue=[];
  g.lastClearEvent={cleared:2,generated:1,canceled:1,sent:0};g.syncCombatHUD();
  assert.match(getEl('p-board-flow').textContent,/消 2.*抵銷 1.*送出 0/);
  assert.match(getEl('p-board-pressure').textContent,/堆高 0.*待接收 0/);
});
test('online carries bounded clear feedback once without changing remote gameplay', () => {
  run(`currentMode='online'; game=new Tetris({...BATTLE_PLAYER_CONFIG,bag:new SeededBag7(4)}); aiGame=new Tetris({...BATTLE_AI_CONFIG,bag:new SeededBag7(4)}); game.spawn();aiGame.spawn();game.grid[10][0]='j';game.grid[18].fill('i');game.grid[19].fill('i');game.onAttack=()=>{};game.clearLines();`);
  const state=S.getOnlineLocalState(); assert.ok(state.feedback,'snapshot includes real clear feedback');
  assert.equal(S.applyOnlineRemoteState(state),true);
  assert.equal(run('aiGame.lastClearEvent.sent'),1);
  const once=run('aiGame.clearSequence'); S.applyOnlineRemoteState(state);
  assert.equal(run('aiGame.clearSequence'),once);
  state.feedback={...state.feedback,seq:99,label:'<script>alert(1)</script>'};
  S.applyOnlineRemoteState(state); assert.equal(run('aiGame.clearSequence'),once);
});
test('local pause preserves lock, pending garbage and CPU thinking countdowns', () => {
  setTime(1000);run(`currentMode='battle';running=true;isPaused=false;game=new Tetris({...BATTLE_PLAYER_CONFIG,bag:new SeededBag7(1)});aiGame=new Tetris({...BATTLE_AI_CONFIG,bag:new SeededBag7(2)});ai=new TetrisAI(aiGame,'easy');game.spawn();aiGame.spawn();game.piece.y=game.piece.getGhostY();game.isLocking=true;game.lockStartTime=850;game.garbageQueue=[{lines:2,isBomb:false,time:700}];ai.thinking=true;ai.thinkStart=800;ai.lastActionTime=900;inputManager=new InputManager(game);togglePause();`);
  setTime(10000);run('togglePause()');
  assert.equal(run('game.lockStartTime'),9850);
  assert.equal(run('game.garbageQueue[0].time'),9700);
  assert.equal(run('ai.thinkStart'),9800);
});
test('hostile numeric objects in optional peer feedback never throw', () => {
  run(`currentMode='online';game=new Tetris({...BATTLE_PLAYER_CONFIG,bag:new SeededBag7(4)});aiGame=new Tetris({...BATTLE_AI_CONFIG,bag:new SeededBag7(4)});game.spawn();aiGame.spawn();`);
  const state=S.getOnlineLocalState(),hostile={valueOf:null,toString:null};
  state.feedback={seq:1,label:'TETRIS!',tier:hostile,combo:hostile,cleared:hostile,generated:hostile,sent:hostile,canceled:hostile};state.pendingGarbage=hostile;
  assert.doesNotThrow(()=>S.applyOnlineRemoteState(state));
});
console.log(`${passes} feature tests passed`);
