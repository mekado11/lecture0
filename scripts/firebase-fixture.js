// Deterministic test double, never included in the public deployment.
(function(root){
  function createFixture(){
    const records=new Map();let serial=0,tick=Date.now();
    const fixture={records,fail:null};
    const timestamp=()=>{const time=++tick;return {toDate:()=>new Date(time),toMillis:()=>time};};
    const deleted={__delete:true};
    function ref(path){
      const id=path.split('/').at(-1);
      return {path,id,collection:name=>collection(path+'/'+name),
        async get(){const data=records.get(path);return {id,ref:ref(path),exists:records.has(path),data:()=>data};},
        async set(data,options){
          if(fixture.fail?.('set',path,data))throw new Error('Injected write failure');
          const next=options?.merge?{...records.get(path),...data}:{...data};
          Object.keys(next).forEach(k=>{if(next[k]===deleted)delete next[k];});
          records.set(path,next);
        },
        async update(data){if(!records.has(path))throw new Error('Missing document');return this.set(data,{merge:true});},
        async delete(){records.delete(path);}
      };
    }
    function collection(path,filter=null,order=null,max=Infinity){
      return {path,doc:id=>ref(path+'/'+(id||'fixture-'+(++serial))),
        where:(key,op,value)=>collection(path,{key,op,value},order,max),
        orderBy:(key,direction)=>collection(path,filter,{key,direction},max),
        limit:n=>collection(path,filter,order,n),
        async add(data){const r=this.doc();await r.set(data);return r;},
        async get(){
          await fixture.beforeQuery?.(path,filter);
          let rows=[...records].filter(([key])=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0);
          if(filter)rows=rows.filter(([,v])=>v[filter.key]===filter.value);
          if(order)rows.sort(([,a],[,b])=>{
            const x=a[order.key]?.toMillis?.()??a[order.key]??0,y=b[order.key]?.toMillis?.()??b[order.key]??0;
            return (x-y)*(order.direction==='desc'?-1:1);
          });
          const docs=await Promise.all(rows.slice(0,max).map(([key])=>ref(key).get()));
          return {docs,empty:!docs.length,size:docs.length,forEach:fn=>docs.forEach(fn)};
        }
      };
    }
    let transactionQueue=Promise.resolve();
    const db={collection,
      runTransaction(fn){
        const task=transactionQueue.catch(()=>{}).then(async()=>{
          const batch=this.batch();
          const result=await fn({get:r=>r.get(),set:batch.set,delete:batch.delete});
          await batch.commit();return result;
        });
        transactionQueue=task;return task;
      },
      batch(){
        const operations=[];
        return {set:(r,d,o)=>operations.push(()=>r.set(d,o)),delete:r=>operations.push(()=>r.delete()),
          async commit(){
            const backup=new Map(records);
            try{for(const op of operations)await op();}
            catch(error){records.clear();backup.forEach((v,k)=>records.set(k,v));throw error;}
          }};
      }
    };
    const user={uid:'test-author',email:'writer@example.test',emailVerified:true,displayName:'Test Author',getIdToken:async()=>'test-token'};
    const auth={currentUser:user,onAuthStateChanged:fn=>{queueMicrotask(()=>fn(auth.currentUser));return ()=>{};},
      signOut:async()=>{auth.currentUser=null;},sendPasswordResetEmail:async()=>{},
      signInWithEmailAndPassword:async()=>{throw Object.assign(new Error('Invalid credentials'),{code:'auth/invalid-credential'});}
    };
    const firebase={apps:[],initializeApp(){this.apps.push({});},auth:()=>auth,firestore:()=>db};
    firebase.firestore.FieldValue={serverTimestamp:timestamp,delete:()=>deleted,increment:n=>n};
    fixture.firebase=firebase;fixture.db=db;fixture.user=user;
    return fixture;
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=createFixture;
  else root.createFirebaseFixture=createFixture;
})(typeof window==='undefined'?globalThis:window);
