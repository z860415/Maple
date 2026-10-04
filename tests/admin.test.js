import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {digest} from '../worker.js';

test('administrator identity, edit any status, version guard and dependent deletion',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'worker.js',compatibilityDate:'2026-08-01',d1Databases:['DB']});
 try{
  const db=await mf.getD1Database('DB'),admin='403923342404485120';
  await db.exec((await readFile('schema.sql','utf8')).replace(/CREATE TRIGGER[\s\S]*?END;/,m=>m.replace(/\n/g,' ')));
  for(const id of ['1',admin]){await db.prepare('INSERT INTO users(id,name) VALUES(?,?)').bind(id,'玩家'+id).run();await db.prepare('INSERT INTO sessions VALUES(?,?,0)').bind(await digest('admin-test-'+id),id).run()}
  const api=async(path,method='GET',body,user=admin,status=200)=>{const response=await mf.dispatchFetch('https://api.test/api'+path,{method,headers:{Authorization:'Bearer admin-test-'+user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result};
  assert.equal((await api('/me')).is_admin,true);assert.equal((await api('/me','GET',null,'1')).is_admin,false);
  const data={category:'quest',title:'原團',bosses:['月妙'],starts:'2020-01-01T12:00:00Z',capacity:6,location:'原地點'};
  const {id}=await db.prepare("INSERT INTO raids(owner,data,status) VALUES('1',?,'done') RETURNING id").bind(JSON.stringify(data)).first();
  await db.prepare('INSERT INTO settlements VALUES(?,?)').bind(id,'{"users":["1"],"result":{"each":100}}').run();
  await db.prepare("INSERT INTO notifications(raid_id,kind,mode,template,created,updated) VALUES(?,'meeting','scheduled','通知',0,0)").bind(id).run();
  await api('/admin/raids/'+id,'PUT',{...data,version:0},'1',403);
  await api('/admin/raids/'+id,'DELETE',{version:0},'1',403);
  for(const status of ['done','running','cancelled','open']){
   const raid=(await api('/raids')).find(r=>r.id===id);
   await api('/admin/raids/'+id,'PUT',{...data,title:'管理修改',status,version:raid.version});
   const updated=(await api('/raids')).find(r=>r.id===id);assert.equal(updated.title,'管理修改');assert.equal(updated.status,status);assert.equal(updated.owner,'1');assert.equal(updated.settlement.result.each,100);
  }
  await api('/admin/raids/'+id,'DELETE',{version:0},admin,409);
  const raid=(await api('/raids')).find(r=>r.id===id);
  await api('/admin/raids/'+id,'PUT',{...data,capacity:0,version:raid.version},admin,400);
  await api('/admin/raids/'+id,'DELETE',{version:raid.version});
  for(const table of ['raids','signups','settlements','notifications'])assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
 }finally{await mf.dispose()}
});
