(function(){
  var items=document.getElementsByClassName('faq-item');
  for(var i=0;i<items.length;i++){
    (function(item){
      var q=item.getElementsByClassName('faq-q')[0];
      if(q){
        q.onclick=function(){
          if(item.className.indexOf('open')>=0){
            item.className=item.className.replace(' open','');
          }else{
            item.className=item.className+' open';
          }
        };
      }
    })(items[i]);
  }
})();
