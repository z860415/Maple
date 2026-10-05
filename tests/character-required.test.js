import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {digest} from '../worker.js';

test('all accounts require a character before other operations, including admins',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'worker.js',compatibilityDate:'2026-08-01',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB');await db.exec((await readFile('schema.sql','utf8')).replace(/CREATE TRIGGER[\s\S]*?END;/,m=>m.replace(/\n/g,' ')));
  const ids=['1','403923342404485120'];
  for(const id of ids){await db.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(id,'玩家'+id).run();await db.prepare('INSERT INTO sessions VALUES(?,?,0)').bind(await digest('required-'+id),id).run()}
  const api=async(path,method='GET',body,user='1',status=200)=>{const response=await mf.dispatchFetch('https://api.test/api'+path,{method,headers:{Authorization:'Bearer required-'+user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result};
  const profile={name:'測試角色',job:'主教',level:180,attack:100,boss:0,ignore:0};
  for(const id of ids){
   assert.equal((await api('/me','GET',null,id)).characters.length,0);
   for(const [path,method] of [['/raids','GET'],['/raids','POST'],['/raids/search','GET'],['/me/history','GET'],['/me/templates','GET'],['/me/templates','PUT'],['/me/availability','GET'],['/availability','GET'],['/admin/raids/1','DELETE']])await api(path,method,method==='GET'?null:{},id,403);
   await api('/me/characters','POST',{...profile,level:301},id,400);
   await api('/raids','GET',null,id,403);
   await api('/me/characters','POST',profile,id);
   assert.equal((await api('/me','GET',null,id)).characters.length,1);
   assert.deepEqual(await api('/raids','GET',null,id),[]);
   assert.deepEqual((await api('/me/templates','GET',null,id)).templates,[]);
  }
  await db.prepare("INSERT INTO users(id,name,profile) VALUES('3','舊帳號',?)").bind(JSON.stringify(profile)).run();
  await db.prepare('INSERT INTO sessions VALUES(?,?,0)').bind(await digest('required-3'),'3').run();
  assert.deepEqual(await api('/raids','GET',null,'3'),[]);
  assert.equal((await api('/me','GET',null,'3')).characters.length,1);
  await db.prepare("INSERT INTO users(id,name) VALUES('4','新帳號')").run();
  await db.prepare('INSERT INTO sessions VALUES(?,?,0)').bind(await digest('required-4'),'4').run();
  await api('/auth/logout','POST',{},'4');
 }finally{await mf.dispose()}
});
