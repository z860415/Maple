import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import worker,{calculate,digest} from '../worker.js';
test('D1: account, raid, waitlist, permission, attendance, payout, concurrency',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'worker.js',compatibilityDate:'2026-08-01',d1Databases:['DB'],bindings:{FRONTEND_URL:'https://z860415.github.io/Maple/',PUBLIC_API_URL:'https://maple-api.z860415.workers.dev',DISCORD_CLIENT_ID:'123',DISCORD_CLIENT_SECRET:'test-only'}});
 try{const db=await mf.getD1Database('DB');const schema=await readFile('schema.sql','utf8');
 // D1 exec takes one statement per line; preserve multiline trigger as a single line.
 await db.exec(schema.replace(/CREATE TRIGGER[\s\S]*?END;/,m=>m.replace(/\n/g,' ')));
 const p={name:'小楓',job:'聖騎士',level:177,attack:37000,boss:30,ignore:17};
 for(const uid of ['1','2','3','4']){await db.prepare('INSERT INTO users(id,name,profile) VALUES(?,?,?)').bind(uid,'DC '+uid,JSON.stringify(p)).run();await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest('token'+uid),uid,Date.now()+1000000).run()}
 async function api(path,method='GET',data,uid='1',expected=200){const res=await mf.dispatchFetch('https://api.test/api'+path,{method,headers:{Authorization:'Bearer token'+uid,Origin:'https://z860415.github.io',...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const out=await res.json();assert.equal(res.status,expected,JSON.stringify(out));assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://z860415.github.io');return out}
 assert.equal((await api('/config')).login_ready,true);await api('/me/profile','PUT',p);await api('/me','GET',null,'bad',401);
 const input={title:'測試王團',bosses:['炎魔'],starts:new Date(Date.now()+3600000).toISOString(),capacity:2};
 const {id}=await api('/raids','POST',input);assert.equal((await api('/raids'))[0].members.length,1);
 assert.equal((await api(`/raids/${id}/join`,'POST',{},'2')).seat,'confirmed');assert.equal((await api(`/raids/${id}/join`,'POST',{},'3')).seat,'waiting');await api(`/raids/${id}/join`,'POST',{},'3',409);
 await api(`/raids/${id}/status`,'PUT',{status:'running'},'2',403);
 await api(`/raids/${id}/join`,'DELETE',null,'2');let r=(await api('/raids'))[0];assert.equal(r.members.find(m=>m.user_id==='3').seat,'confirmed');
 await api(`/raids/${id}/status`,'PUT',{status:'running'});await api(`/raids/${id}/join`,'POST',{},'2',409);
 await api(`/raids/${id}/attendance`,'PUT',{users:['1','2']},'1',400);await api(`/raids/${id}/attendance`,'PUT',{users:['1','3']});await api(`/raids/${id}/status`,'PUT',{status:'done'});
 const loot={fee:3,rate:9000,items:[{name:'卷軸',quantity:1,price:10000000}],costs:[{name:'剪刀',quantity:2,points:900,mesos:1000000,basis:'points'}]};
 const saved=await api(`/raids/${id}/settlement`,'POST',loot);assert.equal(saved.result.each,4350000);
 await api(`/raids/${id}/attendance`,'PUT',{users:['1']},'1',409);await api(`/raids/${id}/paid/3`,'PUT',{paid:true});await api(`/raids/${id}/settlement`,'DELETE',null,'1',409);await api(`/raids/${id}/paid/3`,'PUT',{paid:false});await api(`/raids/${id}/settlement`,'DELETE');
 const race=await api('/raids','POST',input);
 const outcomes=await Promise.all(['2','3','4'].map(uid=>mf.dispatchFetch(`https://api.test/api/raids/${race.id}/join`,{method:'POST',headers:{Authorization:'Bearer token'+uid,'Content-Type':'application/json'},body:'{}'})));
 assert(outcomes.every(r=>[200,409].includes(r.status)));r=(await api('/raids')).find(r=>r.id===race.id);assert.equal(r.members.filter(m=>m.seat==='confirmed').length,2);
 const challenge=await digest('a'.repeat(64));const login=await mf.dispatchFetch('https://api.test/api/auth/login?challenge='+challenge,{redirect:'manual'});assert.equal(new URL(login.headers.get('Location')).searchParams.get('scope'),'identify');assert(login.headers.get('Set-Cookie').includes('HttpOnly'));
 await db.prepare('INSERT INTO tickets VALUES(?,?,?,?)').bind(await digest('b'.repeat(64)),'1',Date.now()+60000,challenge).run();
 await api('/auth/exchange','POST',{ticket:'b'.repeat(64),verifier:'wrong'.repeat(10)},'1',401);const ex=await api('/auth/exchange','POST',{ticket:'b'.repeat(64),verifier:'a'.repeat(64)});assert(ex.token);await api('/auth/exchange','POST',{ticket:'b'.repeat(64),verifier:'a'.repeat(64)},'1',401);
 const calls=[];const env={DB:db,FRONTEND_URL:'https://z860415.github.io/Maple/',PUBLIC_API_URL:'https://api.test',DISCORD_CLIENT_ID:'123',DISCORD_CLIENT_SECRET:'test',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/test',TEST_FETCH:async(url,opts)=>{calls.push({url,opts});return Response.json(url.endsWith('/token')?{access_token:'mock'}:url.endsWith('/@me')?{id:'999',username:'外部玩家'}:{id:'555'})}};
 const oauthState=new URL(login.headers.get('Location')).searchParams.get('state');
 const callback=await worker.fetch(new Request('https://api.test/api/auth/callback?state='+oauthState+'&code=test',{headers:{Cookie:'oauth_state='+oauthState}}),env,{waitUntil(){}});
 assert.equal(callback.status,303);assert.equal(calls.length,2);assert(calls[1].url.endsWith('/users/@me'));assert((await db.prepare('SELECT name FROM users WHERE id=?').bind('999').first()).name==='外部玩家');
 const sync=await worker.fetch(new Request(`https://api.test/api/raids/${id}/discord`,{method:'POST',headers:{Authorization:'Bearer token1'}}),env,{waitUntil(){}});assert.equal(sync.status,200);assert.equal(calls.at(-1).opts.method,'POST');
 await worker.fetch(new Request(`https://api.test/api/raids/${id}/discord`,{method:'POST',headers:{Authorization:'Bearer token1'}}),env,{waitUntil(){}});assert.equal(calls.at(-1).opts.method,'PATCH');assert.deepEqual(JSON.parse(calls.at(-1).opts.body).allowed_mentions,{parse:[]});
 await api('/auth/logout','POST');await api('/me','GET',null,'1',401);
 }finally{await mf.dispose()}
});
test('exact fractional fee and cost rounding; safe total bounds',()=>{
 const p={fee:0.1,rate:3,items:[{name:'a',quantity:1,price:10000001}],costs:[{name:'b',quantity:99,points:1,mesos:0,basis:'points'}]};
 const r=calculate(p,['1','2']);assert.equal(r.total,6656667);assert.equal(r.each,3328333);assert.equal(r.remainder,1);
 assert.throws(()=>calculate({...p,items:[{name:'a',quantity:100000,price:1e12}]},['1']));
});
