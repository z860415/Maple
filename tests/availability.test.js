import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {digest} from '../worker.js';
test('availability authentication, validation, persistence and conflict protection',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'worker.js',compatibilityDate:'2026-08-01',d1Databases:['DB']});
 try{const db=await mf.getD1Database('DB');await db.exec((await readFile('schema.sql','utf8')).replace(/CREATE TRIGGER[\s\S]*?END;/,m=>m.replace(/\n/g,' ')));
 for(const id of ['1','2']){await db.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(id,'玩家'+id).run();await db.prepare('INSERT INTO sessions VALUES(?,?,0)').bind(await digest('availability-'+id),id).run()}
 const api=async(path,method='GET',body,id='1',status=200)=>{const response=await mf.dispatchFetch('https://api.test/api'+path,{method,headers:{Authorization:'Bearer availability-'+id,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result};
 await api('/availability','GET',null,'invalid',401);
 const initial=await api('/me/availability');assert.equal(initial.version,0);assert.deepEqual(initial.weekly,Array.from({length:7},()=>[]));
 const data={...initial,weekly:[[40,41,42,43],[],[],[],[],[],[]],exceptions:{'2026-10-05':[],'2026-10-06':[0,1]}};
 assert.equal((await api('/me/availability','PUT',data)).version,1);
 const saved=await api('/me/availability');assert.deepEqual(saved.exceptions,data.exceptions);
 assert.equal((await api('/availability')).length,1);
 assert.equal((await api('/me/availability','GET',null,'2')).version,0);
 await api('/me/availability','PUT',data,'1',409);
 for(const invalid of [{...saved,weekly:[[48],[],[],[],[],[],[]]},{...saved,weekly:[[1,1],[],[],[],[],[],[]]},{...saved,exceptions:{'2026-02-30':[1]}},{...saved,exceptions:{'2026-10-05':[1.5]}},{...saved,version:-1}])await api('/me/availability','PUT',invalid,'1',400);
 const responses=await Promise.all([1,2].map(()=>mf.dispatchFetch('https://api.test/api/me/availability',{method:'PUT',headers:{Authorization:'Bearer availability-1','Content-Type':'application/json'},body:JSON.stringify({...saved,exceptions:{}})})));
 assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
 assert.equal((await api('/me/availability')).version,2);
 }finally{await mf.dispose()}
});
