// Dependency-free Chrome CDP acceptance for gameplay upgrades.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const URL=process.env.E2E_GAME_URL||'http://127.0.0.1:8778/index.html';
const OUT=path.join(__dirname,'../.ekko-tmp');fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const tab=await(await fetch('http://127.0.0.1:9567/json/new?'+encodeURIComponent(URL),{method:'PUT'})).json();
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map(),errors=[],results=[];
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}else if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text+JSON.stringify(d.params.exceptionDetails.exception));};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const js=async expression=>{const d=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(d.exceptionDetails)throw Error(JSON.stringify(d.exceptionDetails));return d.result.value;};
 const check=(value,name)=>{assert.ok(value,name);results.push(name);console.log('PASS '+name);};
 const key=(code,type='keyDown',autoRepeat=false)=>send('Input.dispatchKeyEvent',{type,code,key:code==='Space'?' ':code,windowsVirtualKeyCode:code==='Space'?32:0,autoRepeat});
 const shot=async name=>fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const click=async selector=>{const pos=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pos});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pos});};
 try {
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.navigate',{url:URL});
 for(let i=0;i<60;i++){await sleep(100);if(await js(`typeof InputManager==='function' && !!InputManager.ui && !!window.TetrisPractice`))break;}
 check(await js(`!!InputManager.ui && !!window.TetrisPractice`),'new assets and controls loaded');
 await js(`localStorage.removeItem('tb-input-settings-v1');chooseMode('solo');`);await sleep(250);
 check(await js('running && !isPaused'),'solo starts');
 // Observe real board locking, not a mocked callback.
 await key('Space');await sleep(30);
 const first=await js(`game.grid.flat().filter(Boolean).length`);
 for(let i=0;i<8;i++){await key('Space','keyDown',true);await sleep(250);}
 check(await js(`game.grid.flat().filter(Boolean).length`)===first && first===4,'hold Space for two seconds + OS repeats locks exactly ONE piece');
 await key('Space','keyUp');await key('Space');await key('Space','keyUp');await sleep(30);
 check(await js(`game.grid.flat().filter(Boolean).length`)===8,'release and press Space permits exactly the next piece');
 await click('#input-settings-button');check(await js('InputManager.dialogOpen && isPaused'),'settings modal pauses a live local game');
 await js(`document.querySelector('#input-das').value='180';document.querySelector('#input-arr').value='45'`);
 await click('#input-settings button[type=submit]');check(await js('inputManager.DAS===180 && inputManager.ARR===45 && !isPaused'),'saved settings apply and resume only owned pause');
 await js(`togglePause();InputManager.openSettings();InputManager.closeSettings()`);check(await js('isPaused'),'opening settings preserves an existing pause');await js('togglePause();document.body.focus()');
 await js(`game.grid=Array.from({length:20},()=>Array(10).fill(0));game.grid[10][0]='j';game.grid[18].fill('i');game.grid[19].fill('i');game.clearLines();`);
 await sleep(1000);
 await js(`game.grid[18].fill('i');game.grid[19].fill('i');game.clearLines();`);await sleep(200);
 const anim=await js(`(()=>{const e=document.getElementById('action-text');const a=e.getAnimations()[0];return {time:a?.currentTime,opacity:getComputedStyle(e).opacity};})()`);
 check(anim.time<450 && Number(anim.opacity)>.1,'successive clears restart caption animation');
 await shot('solo-caption');
 // Result comes from locking actual pieces until top-out, not a fake result overlay.
 await js(`game.grid=Array.from({length:20},()=>Array(10).fill(0));game.spawn();TetrisPractice.capture();`);
 for(let i=0;i<15;i++){if(!await js('running'))break;await key('Space');await key('Space','keyUp');await sleep(40);}
 await sleep(120);
 check(await js(`!running && document.getElementById('gameover').classList.contains('show') && !document.getElementById('practice-offer').classList.contains('hidden')`),'actual solo top-out offers retry checkpoints');
 await shot('solo-retry-offer');
 const best=await js(`localStorage.getItem('tb-high-score')`);
 await click('#practice-offer button');await sleep(150);
 check(await js(`running && TetrisPractice.active && !document.getElementById('practice-bar').classList.contains('hidden')`),'retry button restores playable practice');
 check(await js(`localStorage.getItem('tb-high-score')`)===best,'retry leaves existing high score intact');
 await click('#practice-bar button');check(await js('running && !game.over'),'repeat same checkpoint works without leaving practice');
 await js(`backMenu();chooseMode('battle');chooseDifficulty('normal')`);await sleep(250);
 await js(`game.grid=Array.from({length:20},()=>Array(10).fill(0));game.grid[10][0]='j';for(let r=16;r<20;r++)game.grid[r].fill('i');game.receiveGarbage(3,false);game.clearLines();`);
 check(await js(`document.getElementById('p-board-flow').textContent.includes('抵銷 3 → 送出 1')`),'battle HUD shows actual cancel3 / send1');
 check(await js(`aiGame.garbageQueue.reduce((s,x)=>s+x.lines,0)`)===1,'attack reaches opponent unchanged');
 await shot('desktop-battle');
 for(let i=0;i<20;i++){if(!await js('running'))break;await key('Space');await key('Space','keyUp');await sleep(40);}
 await sleep(120);
 check(await js(`!running && !document.getElementById('practice-offer').classList.contains('hidden')`),'actual CPU defeat offers whole-world retry');
 await click('#practice-offer button');await sleep(120);
 check(await js(`running && TetrisPractice.active && !game.over && !aiGame.over && !!ai && !battleEnded`),'CPU practice restores both boards and resumes AI');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await sleep(100);
 check(await js(`document.getElementById('p-board').getBoundingClientRect().bottom <= document.getElementById('practice-bar').getBoundingClientRect().top`),'mobile practice bar does not cover landing rows');await shot('mobile-practice');
 // Caption sizes and touch hit areas across requested widths.
 for(const [width,height] of [[320,740],[390,844],[430,932],[768,1024],[1024,768]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await js(`backMenu();chooseMode('battle');chooseDifficulty('normal')`);await sleep(150);
  const geometry=await js(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};return {overflow:document.documentElement.scrollWidth>innerWidth,board:r(document.getElementById('p-board')),pad:r(document.getElementById('input-touch-pad')),buttons:[...document.querySelectorAll('#input-touch-pad button')].map(r)};})()`);
  check(!geometry.overflow,`${width}: no horizontal document overflow`);
  check(geometry.buttons.every(b=>b.width>=44&&b.height>=44&&b.x>=0&&b.right<=width),`${width}: touch buttons at least44px within screen`);
  console.log('geometry',width,JSON.stringify(geometry));await shot('battle-'+width);
  check(geometry.board.bottom<=geometry.pad.y && geometry.board.y>=0 && geometry.board.height>=120,`${width}: board fully visible above touch pad`);
  await js(`game.showCombo(5);game.showActionText('T-SPIN MINI SINGLE',4)`);await sleep(300);
  const caption=await js(`(()=>{const e=document.getElementById('p-action-text'),b=e.parentElement.getBoundingClientRect(),r=e.getBoundingClientRect();return {ok:r.left>=b.left && r.right<=b.right && r.height<b.height*.35,r:r.toJSON(),b:b.toJSON(),font:getComputedStyle(e).fontSize,transform:getComputedStyle(e).transform};})()`);
  console.log('caption',width,JSON.stringify(caption));await shot('caption-'+width);
  check(caption.ok,`${width}: long caption remains inside local board`);await shot('battle-'+width);
 }
 // Actual two-finger touch dispatch exercises capture, repeat, rotation and cancellation.
 const points=await js(`['left','cw'].map((action,id)=>{const b=document.querySelector('[data-action='+action+']').getBoundingClientRect();return {id,x:b.x+b.width/2,y:b.y+b.height/2};})`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await sleep(220);
 check(await js(`inputManager.held.size===2`),'two thumbs can hold move while rotating');
 await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 check(await js(`inputManager.held.size===0`),'touch cancellation releases every held control');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await js(`game.showCombo(4);game.showActionText('TETRIS!',4)`);
 check(await js(`getComputedStyle(document.getElementById('p-combo-display')).animationName==='none' && getComputedStyle(document.getElementById('p-combo-display')).opacity==='1'`),'reduced motion keeps readable static captions');
 check(errors.length===0,'no uncaught browser exceptions');
 fs.writeFileSync(path.join(OUT,'upgrade-e2e-results.json'),JSON.stringify({url:URL,passed:results.length,results,errors},null,2));
 console.log('RESULT '+results.length+' passed');
 } finally {ws.close();await fetch('http://127.0.0.1:9567/json/close/'+tab.id);}
})().catch(e=>{console.error(e);process.exitCode=1;});
