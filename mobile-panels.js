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
  media.addEventListener('change',update);update();
})();
