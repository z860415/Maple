import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {calculate,digest,fixedCosts} from '../worker.js';

test('fixed packs use exact consumed quantity and ignore client-supplied totals',()=>{
 for(const [name,[size,points]] of Object.entries(fixedCosts)){
  const input={fee:0,rate:9000,items:[{name:'寶物',quantity:1,price:1000000000}],costs:[{name,quantity:size,points:0,mesos:0,basis:'fixed'}]};
  assert.equal(calculate(input,['1']).cost,String(BigInt(points)*10000000n/9000n));
  assert.equal(input.costs[0].points,points);
  input.costs[0].quantity=2;
  assert.equal(calculate(input,['1']).cost,String(2n*BigInt(points)*10000000n/(BigInt(size)*9000n)));
 }
 assert.throws(()=>calculate({fee:0,rate:9000,items:[],costs:[{name:'不存在',quantity:1,basis:'fixed'}]},['1']),/固定成本/);
});

test('account templates and archive search pagination beyond latest 100 raids',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'worker.js',compatibilityDate:'2026-08-01',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await db.exec((await readFile('schema.sql','utf8')).replace(/CREATE TRIGGER[\s\S]*?END;/,m=>m.replace(/\n/g,' ')));
  for(const id of ['1','2']){await db.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(id,'玩家'+id).run();await db.prepare('INSERT INTO sessions VALUES(?,?,0)').bind(await digest('product-'+id),id).run()}
  const api=async(path,method='GET',body,user='1',status=200)=>{const response=await mf.dispatchFetch('https://api.test/api'+path,{method,headers:{Authorization:'Bearer product-'+user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result};
  const template={id:'template1',name:'週末',title:'測試團',category:'quest',bosses:['一條龍'],capacity:6,location:'入口',requirements:'140UP',note:'備註'};
  assert.deepEqual(await api('/me/templates'),{templates:[],version:0});
  await api('/me/templates','PUT',{version:0,templates:[template]});
  assert.equal((await api('/me/templates')).templates[0].category,'quest');
  assert.equal((await api('/me/templates','GET',null,'2')).templates.length,0);
  await api('/me/templates','PUT',{version:0,templates:[]},'1',409);
  await api('/me/templates','PUT',{version:1,templates:[template,template]},'1',400);
  await api('/me/templates','PUT',{version:1,templates:[]});
  for(let i=0;i<105;i++)await db.prepare("INSERT INTO raids(owner,data,status) VALUES('2',?,'done')").bind(JSON.stringify({...template,title:i===0?'古老100%團':'歷史'+i,starts:'2020-01-01T00:00:00Z'})).run();
  const page=await api('/raids/search');assert.equal(page.raids.length,10);assert.equal(page.more,true);
  const next=await api('/raids/search?before='+page.raids.at(-1).id);assert.ok(next.raids.every(raid=>raid.id<page.raids.at(-1).id));
  const old=await api('/raids/search?q='+encodeURIComponent('古老100%'));assert.equal(old.raids.length,1);assert.equal(old.raids[0].id,1);assert.equal(old.more,false);
  assert.equal((await api('/raids/1')).title,'古老100%團');
  assert.equal((await api('/raids/search?q='+encodeURIComponent('一條龍'))).raids.length,10);
  await api('/raids/search?before=abc','GET',null,'1',400);
 }finally{await mf.dispose()}
});
