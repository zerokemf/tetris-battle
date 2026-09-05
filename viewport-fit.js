// Fit the full desktop/tablet play layout, including headers and side panels.
// Uniform scaling preserves square cells and canvas/pointer coordinates.
(() => {
 let frame;
 function fit() {
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(() => {
   for(const id of ['game-container','battle-arena']) {
    const root=document.getElementById(id);
    root.style.zoom='';
    if(innerWidth<=768 || document.body.classList.contains('at-menu') || !root.getClientRects().length) continue;
    const touch=document.getElementById('input-touch-pad');
    const touchTop=touch && getComputedStyle(touch).display!=='none' ? touch.getBoundingClientRect().top : innerHeight;
    const availableHeight=Math.min(innerHeight,touchTop)-72;
    // scroll dimensions include overflow caused by old minimum board heights.
    const r=root.getBoundingClientRect();
    const height=Math.max(root.scrollHeight,r.height);
    const width=Math.max(root.scrollWidth,r.width);
    root.style.zoom=String(Math.min(1,Math.max(0.1,availableHeight/height),(innerWidth-32)/width));
   }
  });
 }
 window.addEventListener('resize',fit);
 window.visualViewport?.addEventListener('resize',fit);
 document.addEventListener('fullscreenchange',fit);
 new MutationObserver(fit).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.fonts?.ready.then(fit);
 fit();
})();
