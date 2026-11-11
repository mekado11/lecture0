// Use the existing panel controls rather than a second competing toggle system.
(() => {
  const media=matchMedia('(max-width:700px)');
  const pairs=[['left-panel','lp-collapse-btn'],['right-panel','rp-collapse-btn']];
  function update(){
    for(const [id,buttonId] of pairs){
      const panel=document.getElementById(id),button=document.getElementById(buttonId);
      if(!panel||!button)continue;
      panel.classList.toggle('panel-collapsed',media.matches);
      button.setAttribute('aria-expanded',String(!media.matches));
      button.setAttribute('aria-label','Toggle '+(id==='left-panel'?'book navigator':'editorial feedback'));
    }
  }
  pairs.forEach(([id,buttonId])=>document.getElementById(buttonId)?.addEventListener('click',()=>{
    document.getElementById(buttonId).setAttribute('aria-expanded',String(!document.getElementById(id).classList.contains('panel-collapsed')));
  }));
  // A folding phone opened flat has two viewport segments; the narrow-width rule does not
  // apply there even when each half is phone-sized, so the panels stay open on either side.
  const segments=matchMedia('(horizontal-viewport-segments: 2)');
  function layout(){
    if(segments.matches){
      for(const [id,buttonId] of pairs){const panel=document.getElementById(id),button=document.getElementById(buttonId);if(!panel||!button)continue;panel.classList.remove('panel-collapsed');button.setAttribute('aria-expanded','true');}
      return;
    }
    update();
  }
  media.addEventListener('change',layout);segments.addEventListener('change',layout);
  // Some shells resize without firing a media-query change first; a settled resize re-applies.
  let settle;addEventListener('resize',()=>{clearTimeout(settle);settle=setTimeout(layout,120);},{passive:true});
  layout();
})();
