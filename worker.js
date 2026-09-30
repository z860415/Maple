// Cloudflare Workers ES module. All raid writes use D1 atomic compare-and-swap batches.
const json=(v,status=200)=>Response.json(v,{status});
const fail=(status,detail)=>{throw Object.assign(new Error(detail),{status})};
const now=()=>Date.now();
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const text=(v,max,min=0)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)fail(400,'文字欄位格式有誤');return v.trim()};
const num=(v,min,max,integer=true)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isSafeInteger(v)))fail(400,'數值欄位超出範圍');return v};
function profile(p){return {name:text(p.name,32,1),job:text(p.job,24,1),level:num(p.level,1,300),attack:num(p.attack,0,1e9),boss:num(p.boss,0,5000,false),ignore:num(p.ignore,0,100,false)}}
function raidInput(p){if(!Array.isArray(p.bosses)||!p.bosses.length||p.bosses.length>10)fail(400,'請選擇打王項目');if(typeof p.starts!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(p.starts)||!Number.isFinite(Date.parse(p.starts)))fail(400,'集合時間必須包含時區');return {title:text(p.title,80,1),bosses:p.bosses.map(b=>text(b,40,1)),starts:p.starts,location:text(p.location??'當天公告',100),capacity:num(p.capacity,1,60),requirements:text(p.requirements??'',1000),note:text(p.note??'',1000)}}
export function calculate(p,users){
 num(p.fee,0,100,false);num(p.rate,1,1e9);if(!Array.isArray(p.items)||!Array.isArray(p.costs)||p.items.length>100||p.costs.length>100)fail(400,'項目過多');
 // Fee precision: up to 4 decimal places. BigInt rational arithmetic avoids payout rounding drift.
 const fs=Math.round(p.fee*10000);if(Math.abs(fs/10000-p.fee)>1e-10)fail(400,'手續費最多四位小數');
 let gross=0n,cost=0n;const rate=BigInt(p.rate),den=1000000n*rate;
 for(const i of p.items){text(i.name,80,1);gross+=BigInt(num(i.quantity,1,100000))*BigInt(num(i.price,0,1e12))}
 for(const c of p.costs){text(c.name,80,1);num(c.quantity,1,100000);num(c.points,0,1e12);num(c.mesos,0,1e12);if(!['points','mesos'].includes(c.basis))fail(400,'成本換算欄位有誤');cost+=c.basis==='mesos'?BigInt(c.mesos)*rate:BigInt(c.points)*10000000n}
 const fee=gross*BigInt(fs)*rate,net=gross*den-fee-cost*1000000n;
 if(net<0n)fail(400,'本團淨收益為負，請確認售價或成本');const total=net/den;
 if(gross>BigInt(Number.MAX_SAFE_INTEGER)||total>BigInt(Number.MAX_SAFE_INTEGER))fail(400,'金額過大，請拆分結算');
 if(!users.length)fail(400,'請先確認實際出席名單');const each=total/BigInt(users.length);
 return {gross:Number(gross),fee:String(Number(fee)/Number(den)),cost:String(Number(cost)/Number(rate)),net:String(Number(net)/Number(den)),total:Number(total),count:users.length,each:Number(each),remainder:Number(total-each*BigInt(users.length)),users};
}
const redirect=(url,cookie)=>new Response(null,{status:303,headers:{Location:url,...(cookie?{'Set-Cookie':cookie}:{})}});
const frontendURLs=e=>[e.FRONTEND_URL,...[8000,8080].flatMap(port=>['localhost','127.0.0.1'].map(host=>`http://${host}:${port}/`))].filter(Boolean);
export default {async fetch(req,env,ctx){
 let res;try{res=await route(req,env,ctx)}catch(e){res=json({detail:e.status?e.message:'伺服器暫時無法處理，請稍後重試'},e.status||500);if(!e.status)console.error('Request failed:',e.message)}
 const h=new Headers(res.headers);h.set('Cache-Control','no-store');h.set('Referrer-Policy','no-referrer');h.set('X-Content-Type-Options','nosniff');
 h.set('Vary','Origin');const origin=req.headers.get('Origin');
 if(frontendURLs(env).some(front=>new URL(front).origin===origin)){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Headers','Authorization, Content-Type');h.set('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS')}
 return new Response(res.body,{status:res.status,headers:h});
}};
async function route(req,e,ctx){
 const url=new URL(req.url),path=url.pathname,method=req.method,db=e.DB;
 const q=(sql,...a)=>db.prepare(sql).bind(...a),one=(sql,...a)=>q(sql,...a).first(),all=async(sql,...a)=>(await q(sql,...a).all()).results;
 const body=async()=>{if(Number(req.headers.get('Content-Length'))>65536)fail(413,'內容過大');const s=await req.text();if(s.length>65536)fail(413,'內容過大');try{const p=JSON.parse(s);if(!p||typeof p!=='object'||Array.isArray(p))throw Error();return p}catch{fail(400,'JSON 格式有誤')}};
 const front=e.FRONTEND_URL,publicURL=(e.PUBLIC_API_URL||url.origin).replace(/\/$/,'');
 const ready=!!(e.DISCORD_CLIENT_ID&&e.DISCORD_CLIENT_SECRET&&front);
 if(method==='OPTIONS')return new Response(null,{status:204});
 if(path==='/api/config'&&method==='GET')return json({demo:false,login_ready:ready,discord_ready:!!e.DISCORD_WEBHOOK_URL});
 if(path==='/api/health'){await one('SELECT 1');return json({ok:true})}
 if(path==='/api/auth/login'&&method==='GET'){
  if(!ready)fail(503,'尚未設定 Discord 登入');const challenge=url.searchParams.get('challenge');if(!/^[a-f0-9]{64}$/.test(challenge||''))fail(400,'請由網站開始登入');
  const returnTo=url.searchParams.get('return_to')||front;if(!frontendURLs(e).includes(returnTo))fail(400,'不允許此登入返回網址');
  const state=random();await db.batch([q('DELETE FROM oauth WHERE expires<?',now()),q('INSERT INTO oauth VALUES(?,?,?)',await digest(state),now()+600000,JSON.stringify({challenge,front:returnTo}))]);
  const params=new URLSearchParams({client_id:e.DISCORD_CLIENT_ID,response_type:'code',redirect_uri:publicURL+'/api/auth/callback',scope:'identify',state});
  return redirect('https://discord.com/oauth2/authorize?'+params,`oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`);
 }
 if(path==='/api/auth/callback'&&method==='GET'){
  const state=url.searchParams.get('state'),cookie=(req.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('oauth_state='))?.slice(12);
  if(!state||state!==cookie)fail(400,'登入驗證失敗，請重新登入');
  const valid=await one('DELETE FROM oauth WHERE hash=? AND expires>? RETURNING challenge',await digest(state),now());
  if(!valid||url.searchParams.has('error')||!url.searchParams.get('code'))fail(400,'登入取消或已過期');
  // Existing in-flight logins stored only the challenge; new ones also bind the return URL.
  const login=valid.challenge.startsWith('{')?JSON.parse(valid.challenge):{challenge:valid.challenge,front};
  if(!frontendURLs(e).includes(login.front))fail(400,'不允許此登入返回網址');
  const fetcher=e.TEST_FETCH||fetch;
  const tr=await fetcher('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:e.DISCORD_CLIENT_ID,client_secret:e.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:publicURL+'/api/auth/callback'}),signal:AbortSignal.timeout(15000)});
  if(!tr.ok)fail(502,'Discord 驗證失敗，請重新登入');const token=await tr.json();
  const ur=await fetcher('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!ur.ok)fail(502,'Discord 暫時無法驗證');const user=await ur.json();
  if(!/^\d+$/.test(user.id))fail(502,'Discord 帳號格式有誤');const ticket=random();
  await db.batch([q("INSERT INTO users(id,name,avatar) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar",user.id,user.global_name||user.username,user.avatar||null),q('DELETE FROM tickets WHERE expires<?',now()),q('INSERT INTO tickets VALUES(?,?,?,?)',await digest(ticket),user.id,now()+60000,login.challenge)]);
  return redirect(login.front.split('#')[0]+'#ticket='+ticket,'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0');
 }
 if(path==='/api/auth/exchange'&&method==='POST'){
  const p=await body();text(p.ticket,100,20);text(p.verifier,100,32);const t=await one('DELETE FROM tickets WHERE hash=? AND expires>? AND challenge=? RETURNING user_id',await digest(p.ticket),now(),await digest(p.verifier));if(!t)fail(401,'登入連結已失效');
  const token=random();await db.batch([q('DELETE FROM sessions WHERE expires<?',now()),q('INSERT INTO sessions VALUES(?,?,?)',await digest(token),t.user_id,now()+28800000)]);return json({token});
 }
 const bearer=req.headers.get('Authorization')||'';if(!bearer.startsWith('Bearer '))fail(401,'請先使用 Discord 登入');
 const hash=await digest(bearer.slice(7)),u=await one('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND expires>?',hash,now());if(!u)fail(401,'登入已過期，請重新登入');
 if(path==='/api/auth/logout'&&method==='POST'){await q('DELETE FROM sessions WHERE hash=?',hash).run();return json({ok:true})}
 async function characters(){if(JSON.parse(u.profile).name)await q('INSERT OR IGNORE INTO characters VALUES(?,?,?,?)','legacy:'+u.id,u.id,u.profile,0).run();return (await all('SELECT * FROM characters WHERE user_id=? ORDER BY created,id',u.id)).map(c=>({...c,profile:JSON.parse(c.profile)}))}
 async function selectedProfile(p){if(!p.character_id){if(!JSON.parse(u.profile).name)fail(400,'請先填寫角色資料');return u.profile}const c=await one('SELECT profile FROM characters WHERE id=? AND user_id=?',text(p.character_id,100,1),u.id);if(!c)fail(400,'找不到你的角色');return c.profile}
 if(path==='/api/me'&&method==='GET')return json({...u,profile:JSON.parse(u.profile),characters:await characters()});
if(path==='/api/me/history'&&method==='GET')return json((await all('SELECT raids.id,raids.data,raids.status,signups.profile,signups.seat,signups.attended,signups.paid,signups.joined,settlements.data AS settlement FROM signups JOIN raids ON raids.id=signups.raid_id LEFT JOIN settlements ON settlements.raid_id=raids.id WHERE user_id=? ORDER BY raids.id DESC',u.id)).map(r=>({...r,...JSON.parse(r.data),data:undefined,profile:JSON.parse(r.profile),settlement:JSON.parse(r.settlement||'null')})));
 if(path==='/api/me/profile'&&method==='PUT'){const p=profile(await body());await db.batch([q('UPDATE users SET profile=? WHERE id=?',JSON.stringify(p),u.id),q('INSERT INTO characters VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile','legacy:'+u.id,u.id,JSON.stringify(p),0)]);return json(p)}
 if(path==='/api/me/characters'&&method==='POST'){await characters();const p=profile(await body()),id=JSON.parse(u.profile).name?random():'legacy:'+u.id;await db.batch([q('INSERT INTO characters VALUES(?,?,?,?)',id,u.id,JSON.stringify(p),now()),q("UPDATE users SET profile=? WHERE id=? AND profile='{}'",JSON.stringify(p),u.id)]);return json({id,profile:p})}
 const characterMatch=path.match(/^\/api\/me\/characters\/([^/]+)$/);
 if(characterMatch&&method==='PUT'){const id=decodeURIComponent(characterMatch[1]),p=profile(await body());const c=await one('UPDATE characters SET profile=? WHERE id=? AND user_id=? RETURNING id',JSON.stringify(p),id,u.id);if(!c)fail(404,'找不到你的角色');return json({id,profile:p})}
 async function detail(id){const r=await one('SELECT * FROM raids WHERE id=?',id);if(!r)fail(404,'找不到這個團');const members=await all('SELECT signups.*,users.name AS discord_name FROM signups JOIN users ON users.id=user_id WHERE raid_id=? ORDER BY joined,user_id',id);const s=await one('SELECT data FROM settlements WHERE raid_id=?',id);return {...JSON.parse(r.data),...r,data:undefined,members:members.map(m=>({...m,profile:JSON.parse(m.profile)})),settlement:s?JSON.parse(s.data):null}}
 if(path==='/api/raids'&&method==='GET'){
 const rows=await all('SELECT * FROM raids ORDER BY id DESC LIMIT 100');
 const ms=await all('SELECT signups.*,users.name AS discord_name FROM signups JOIN users ON users.id=user_id WHERE raid_id IN (SELECT id FROM raids ORDER BY id DESC LIMIT 100) ORDER BY joined,user_id');
 const ss=await all('SELECT * FROM settlements WHERE raid_id IN (SELECT id FROM raids ORDER BY id DESC LIMIT 100)');
 return json(rows.map(r=>({...JSON.parse(r.data),id:r.id,owner:r.owner,status:r.status,sync_error:r.sync_error,members:ms.filter(m=>m.raid_id===r.id).map(m=>({...m,profile:JSON.parse(m.profile)})),settlement:JSON.parse(ss.find(s=>s.raid_id===r.id)?.data||'null')})));
 }
 if(path==='/api/raids'&&method==='POST'){const input=await body(),snapshot=await selectedProfile(input),p=raidInput(input);if(Date.parse(p.starts)<=now())fail(400,'開團時間必須在未來');const results=await db.batch([q('INSERT INTO raids(owner,data) VALUES(?,?) RETURNING id',u.id,JSON.stringify(p)),q('UPDATE signups SET profile=? WHERE raid_id=last_insert_rowid() AND user_id=?',snapshot,u.id)]);return json(results[0].results[0])}
 const match=path.match(/^\/api\/raids\/(\d+)(?:\/(join|status|attendance|settlement|discord|paid)(?:\/(\d+))?)?$/);if(!match)fail(404,'找不到此功能');
 const id=Number(match[1]),op=match[2],uid=match[3],r=await detail(id),members=r.members;
 const leader=()=>{if(r.owner!==u.id)fail(403,'只有團長能操作')};
 async function mutate(statements){try{await db.batch([q('UPDATE raids SET version=version+1 WHERE id=? AND version=?',id,r.version),q('INSERT INTO mutation_guard(value) VALUES(changes())'),q('DELETE FROM mutation_guard'),...statements])}catch(err){if(String(err.message).includes('CHECK constraint'))fail(409,'團隊資料剛被更新，請重新整理再操作');throw err}}
 const promote=(cap,remaining)=>remaining.filter(m=>m.seat==='waiting').slice(0,Math.max(0,cap-remaining.filter(m=>m.seat==='confirmed').length)).map(m=>m.user_id);
 const promotion=(cap,remaining)=>[q("UPDATE signups SET seat='confirmed' WHERE raid_id=? AND user_id IN (SELECT value FROM json_each(?))",id,JSON.stringify(promote(cap,remaining)))];
 const refresh=()=>{if(e.DISCORD_WEBHOOK_URL&&r.message_id)ctx.waitUntil(publish(true).catch(()=>{}))};
 if(!op&&method==='PUT'){leader();if(r.status!=='open')fail(409,'只有招募中的團能修改');const p=raidInput(await body());if(p.capacity<members.filter(m=>m.seat==='confirmed').length)fail(409,'人數不可少於現有正取');await mutate([q('UPDATE raids SET data=? WHERE id=?',JSON.stringify(p),id),...promotion(p.capacity,members)]);refresh();return json({ok:true})}
 if(op==='join'&&method==='POST'){if(r.status!=='open')fail(409,'此團已停止報名');if(members.some(m=>m.user_id===u.id))fail(409,'你已經報名此團');const p=await body(),snapshot=await selectedProfile(p),seat=members.filter(m=>m.seat==='confirmed').length<r.capacity?'confirmed':'waiting';await mutate([q('INSERT INTO signups(raid_id,user_id,profile,note,available,seat,joined) VALUES(?,?,?,?,?,?,?)',id,u.id,snapshot,text(p.note??'',500),text(p.available??'',100),seat,now())]);refresh();return json({seat})}
 if(op==='join'&&method==='DELETE'){if(r.status!=='open'||r.owner===u.id)fail(409,'無法退出；團長請使用取消團隊');await mutate([q('DELETE FROM signups WHERE raid_id=? AND user_id=?',id,u.id),...promotion(r.capacity,members.filter(m=>m.user_id!==u.id))]);refresh();return json({ok:true})}
 leader();
 if(op==='status'&&method==='PUT'){const p=await body();if(!({open:['running','cancelled'],running:['done'],done:[],cancelled:[]}[r.status]||[]).includes(p.status))fail(409,'不允許這個狀態變更');await mutate([q('UPDATE raids SET status=? WHERE id=?',p.status,id)]);refresh();return json({ok:true})}
 if(op==='attendance'&&method==='PUT'){if(!['running','done'].includes(r.status)||r.settlement)fail(409,'請先開始打王，已結算則需先清除結算');const p=await body();if(!Array.isArray(p.users)||p.users.length>60||new Set(p.users).size!==p.users.length||p.users.some(id=>!members.some(m=>m.user_id===id&&m.seat==='confirmed')))fail(400,'出席只能選擇正取成員');await mutate([q('UPDATE signups SET attended=0 WHERE raid_id=?',id),q('UPDATE signups SET attended=1 WHERE raid_id=? AND user_id IN (SELECT value FROM json_each(?))',id,JSON.stringify(p.users))]);return json({ok:true})}
 if(op==='settlement'&&method==='POST'){if(r.status!=='done'||r.settlement)fail(409,'打王完成後才能結算；重算請先清除舊結算');const p=await body(),saved={input:p,result:calculate(p,members.filter(m=>m.attended).map(m=>m.user_id))};await mutate([q('INSERT INTO settlements VALUES(?,?)',id,JSON.stringify(saved))]);return json(saved)}
 if(op==='settlement'&&method==='DELETE'){if(members.some(m=>m.paid))fail(409,'請先取消已領標記再重算');await mutate([q('DELETE FROM settlements WHERE raid_id=?',id)]);return json({ok:true})}
 if(op==='paid'&&method==='PUT'){const p=await body();if(typeof p.paid!=='boolean'||!r.settlement?.result.users.includes(uid))fail(400,'此成員不在分寶名單');await mutate([q('UPDATE signups SET paid=? WHERE raid_id=? AND user_id=?',p.paid?1:0,id,uid)]);return json({ok:true})}
 if(op==='discord'&&method==='POST')return json(await publish(false));
 fail(404,'找不到此功能');
 async function publish(existing){
  const hook=e.DISCORD_WEBHOOK_URL;if(!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w.-]+$/.test(hook||''))fail(503,'尚未設定有效 Discord Webhook');
  // Persistent claim prevents duplicate initial posts across Worker isolates. Failed creates require explicit reconciliation.
  const lock=await one('UPDATE raids SET publishing=1 WHERE id=? AND publishing=0 RETURNING message_id',id);if(!lock)fail(409,'Discord 正在同步或上次結果不明；請站長確認頻道後解除同步鎖');
  let creating=false;
  try{const latest=await detail(id);if(existing&&!latest.message_id){await q('UPDATE raids SET publishing=0 WHERE id=?',id).run();return {ok:true}}
   creating=!latest.message_id;
   const embed={title:latest.title,url:front+'#raid='+id,description:`${latest.bosses.join(' / ')}\n<t:${Math.floor(Date.parse(latest.starts)/1000)}:F>\n集合：${latest.location}\n${{open:'招募中',running:'開打中',done:'已完成',cancelled:'已取消'}[latest.status]} · ${latest.members.filter(m=>m.seat==='confirmed').length}/${latest.capacity}`,fields:[{name:'報名名單',value:latest.members.map(m=>`${m.profile.name} / ${m.profile.job} Lv.${m.profile.level} / ${m.seat==='waiting'?'候補':'正取'}`).join('\n').slice(0,1024)||'無'},{name:'要求 / 備註',value:(latest.requirements+'\n'+latest.note).trim().slice(0,1024)||'無'}]};
   const res=await (e.TEST_FETCH||fetch)(hook+(creating?'?wait=true':'/messages/'+latest.message_id),{method:creating?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({embeds:[embed],allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('Discord rejected');const data=await res.json();if(!/^\d+$/.test(data.id))throw Error('Invalid message');await q('UPDATE raids SET message_id=?,publishing=0,sync_error=NULL WHERE id=?',data.id,id).run();return {ok:true};
  }catch{await q('UPDATE raids SET publishing=?,sync_error=? WHERE id=?',creating?1:0,creating?'Discord 發送結果不明；請站長確認頻道後解除同步鎖':'Discord 更新失敗，請按同步重試',id).run();fail(502,'Discord 同步失敗，網站資料已保留')}
 }
}
