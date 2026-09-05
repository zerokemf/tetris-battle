const fs=require('node:fs'),assert=require('node:assert/strict');
const URL=process.env.E2E_GAME_URL||'https://zerokemf.github.io/tetris-battle/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function browser(port){const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(URL)}`,{method:'PUT'})).json();const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{let d=JSON.parse(e.data);if(d.id){pending.get(d.id)(d.result);pending.delete(d.id)}else if(d.method==='Runtime.exceptionThrown')errors.push(d.params)};const send=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});const js=async expression=>{let r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};await send('Runtime.enable');await send('Page.enable');await sleep(1500);return {send,js,errors,close:async()=>{ws.close();await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`)}};}
(async()=>{const a=await browser(9567),b=await browser(9568);try{
 assert(await a.js("typeof TetrisPractice==='undefined' && !!TetrisLeaderboard && !document.getElementById('practice-offer')"));
 for(const [width,height] of [[320,740],[390,844],[768,1024],[1440,900]]){await a.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});await a.js('TetrisLeaderboard.refresh()');assert(await a.js('document.documentElement.scrollWidth<=innerWidth'),'homepage overflow '+width);fs.writeFileSync(`.ekko-tmp/leaderboard-home-${width}.png`,Buffer.from((await a.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));}
 await a.js("chooseMode('solo');game.score=321;game.lines=2;");
 for(let i=0;i<20;i++){if(!await a.js('running'))break;await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' ',windowsVirtualKeyCode:32});await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32});await sleep(30)}
 await sleep(200);assert(await a.js("!running&&!document.getElementById('leaderboard-result').classList.contains('hidden')"));
 fs.writeFileSync('.ekko-tmp/leaderboard-defeat.png',Buffer.from((await a.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 if(!URL.includes('127.0.0.1')){
 await a.js("window.__scoreBody=null;window.__origFetch=window.fetch;window.fetch=(u,o)=>{if(o?.method==='POST')window.__scoreBody=JSON.parse(o.body);return window.__origFetch(u,o)};document.getElementById('leaderboard-name').value='VerifyFriends';document.getElementById('leaderboard-submit-form').requestSubmit()");
 for(let i=0;i<60;i++){await sleep(200);if(await a.js("document.getElementById('leaderboard-submit').textContent==='已登錄'"))break;}
 assert(await a.js("document.getElementById('leaderboard-submit').textContent==='已登錄'"));
 const body=await a.js('__scoreBody');fs.writeFileSync('.ekko-tmp/leaderboard-fixture.json',JSON.stringify(body));
 await b.js('TetrisLeaderboard.refresh()');assert(await b.js("document.getElementById('leaderboard-solo-rows').textContent.includes('VerifyFriends')"),'second browser reads shared score');
 await a.js("document.getElementById('leaderboard-submit-form').requestSubmit()");
 const data=await(await fetch('https://willienas.myqnapcloud.com/tetris-leaderboard/api.php')).json();assert(data.scores.filter(r=>r.name==='VerifyFriends').length===1);console.log('PASS real submission, separate-browser readback and duplicate protection');
 }
 await a.js("backMenu();chooseMode('battle');chooseDifficulty('normal')");await sleep(200);await a.js("game.over=true;endBattle()");await sleep(100);assert(await a.js("!document.getElementById('leaderboard-result').classList.contains('hidden')"));
 assert(a.errors.length===0&&b.errors.length===0);console.log('PASS removed practice, 4 responsive widths, real solo defeat form, CPU defeat form, no runtime errors');
 }finally{await a.close();await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
