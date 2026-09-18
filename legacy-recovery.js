// One-time, explicit migration. Never restore an unowned local draft into an account.
window.LegacyRecovery = {
  keys() {
    return Object.keys(localStorage).filter(key=>/^(ml_autosave|ml_saves|ml_bookshelf|ml_versions|aic_|scan:|fixes:)/.test(key));
  },
  async offer(sameOwner) {
    const keys=this.keys();
    if(!keys.length)return true;
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');
      dialog.className='legacy-recovery';
      dialog.setAttribute('aria-labelledby','legacy-recovery-title');
      dialog.innerHTML='<h2 id="legacy-recovery-title">Protect your older drafts</h2>'+
        '<p>This browser contains data from an older version of AuthorScrolls. New drafts now save to your cloud library, not browser storage.</p>'+
        '<p id="legacy-recovery-note"></p><div class="legacy-recovery-actions"></div>';
      dialog.querySelector('#legacy-recovery-note').textContent=sameOwner?
        'Before removing the old copies, download a recovery archive and keep it somewhere private. It may contain manuscript text and AI responses. Downloading does not import it into your library.':
        'We cannot verify that the old data belongs to this account. It will not be opened or imported. You can leave it untouched and sign in to the original account, or explicitly remove it.';
      const actions=dialog.querySelector('.legacy-recovery-actions');
      const add=(text,handler)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=handler;actions.appendChild(button);return button;};
      const finish=cleared=>{dialog.close();dialog.remove();resolve(cleared);};
      if(sameOwner)add('Download recovery archive',()=>{
        const data=Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));
        const url=URL.createObjectURL(new Blob([JSON.stringify({format:'authorscrolls-legacy-recovery-v1',data},null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download='authorscrolls-private-recovery.json';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
        dialog.querySelector('#legacy-recovery-note').textContent='Check that your recovery archive downloaded successfully before removing the old copies. Store it privately; it can contain your manuscript.';
      });
      add('Remove old browser copies',()=>{
        if(!confirm('Permanently remove the old browser copies? Make sure you have a recovery archive or another copy of your work first.'))return;
        keys.forEach(key=>localStorage.removeItem(key));finish(true);
      });
      add('Leave untouched for now',()=>finish(false));
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      document.body.appendChild(dialog);dialog.showModal();
    });
  }
};
