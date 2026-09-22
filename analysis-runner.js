// One cancellable worker request; no unbounded listeners or wedged worker reuse.
class AnalysisRunner {
  constructor(factory,timeout=30000){this.factory=factory;this.timeout=timeout;this.worker=null;this.pending=null;this.version=0;}
  cancel(){
    if(!this.pending)return;
    const error=new Error('Analysis superseded');error.name='AbortError';
    this.pending.fail(error);
  }
  analyze(text,genreKey,modeKey){
    this.cancel();
    return new Promise((resolve,reject)=>{
      const version=++this.version;
      let worker;
      try{worker=this.worker||(this.worker=this.factory());}
      catch(error){reject(new Error('Analysis could not start: '+error.message));return;}
      const cleanup=()=>{
        clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',onError);this.pending=null;
      };
      const fail=error=>{cleanup();worker.terminate();if(this.worker===worker)this.worker=null;reject(error);};
      const message=event=>{
        if(event.data.version!==version)return;
        if(event.data.type!=='result'){fail(new Error(event.data.message||'Analysis failed'));return;}
        cleanup();resolve(event.data.data);
      };
      const onError=event=>fail(new Error(event.message||'Analysis worker failed'));
      const timer=setTimeout(()=>fail(new Error('Analysis timed out. Your draft is unchanged; retry or export it.')),this.timeout);
      this.pending={fail};
      worker.addEventListener('message',message);worker.addEventListener('error',onError);
      try{worker.postMessage({type:'analyze',text,genreKey,modeKey,version});}catch(error){fail(error);}
    });
  }
}
if(typeof window!=='undefined')window.AnalysisRunner=AnalysisRunner;
if(typeof module!=='undefined'&&module.exports)module.exports=AnalysisRunner;
