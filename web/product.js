const presetCostPacks={'天氣':[11,3500],'AP初始化卷軸':[1,9900],'SP初始化卷軸':[1,9900],'護身符':[13,3000],'原地復活術':[13,4300],'白金神奇剪刀':[1,7100],'神奇剪刀':[1,3900]};
function updateFixedCost(row){
 const a=row.querySelectorAll('input'),pack=presetCostPacks[a[0].value],quantity=Number(a[1].value),rate=Number($('#rate').value);
 if(!pack)return;
 a[2].value=(quantity*pack[1]/pack[0]).toFixed(4);
 a[3].value=Number.isSafeInteger(quantity)&&quantity>=0&&Number.isSafeInteger(rate)&&rate>0?String(BigInt(quantity)*BigInt(pack[1])*10000000n/(BigInt(pack[0])*BigInt(rate))):'';
}
function personalRaidStatus(r){
 const member=r.members.find(m=>m.user_id===state.me?.id);if(!member)return '尚未報名';
 if(r.status==='cancelled')return '團隊已取消';
 if(r.settlement?.result.users.includes(member.user_id))return member.paid?'已領分寶':'待領分寶';
 if(r.status==='done')return member.attended?'待結算':member.seat==='waiting'?'備選未出席':'未出席';
 if(r.status==='running')return member.seat==='waiting'?'備選':member.attended?'已出席':'待確認出席';
 return r.owner===member.user_id?'團長':member.seat==='waiting'?'備選 · 等待確認':'正選 · 等待集合';
}
function renderPersonalOverview(){
 const mine=state.raids.filter(r=>r.members.some(m=>m.user_id===state.me?.id)),upcoming=mine.filter(r=>['open','running'].includes(r.status)).sort((a,b)=>Date.parse(a.starts)-Date.parse(b.starts)),unpaid=mine.filter(r=>r.settlement?.result.users.includes(state.me.id)&&!r.members.find(m=>m.user_id===state.me.id)?.paid);
 $('#personalOverview').innerHTML=`<h2>我的狀態</h2><div class="personal-counts"><span>正選 ${upcoming.filter(r=>r.members.find(m=>m.user_id===state.me.id)?.seat==='confirmed').length}</span><span>備選 ${upcoming.filter(r=>r.members.find(m=>m.user_id===state.me.id)?.seat==='waiting').length}</span><span>待領分寶 ${unpaid.length}</span></div><div class="personal-next">${[...new Map([...upcoming.slice(0,3),...unpaid.slice(0,3)].map(r=>[r.id,r])).values()].map(r=>`<button type="button" data-raid="${r.id}"><span>${esc(r.title)}</span><small>${esc(when(r.starts))} · ${esc(personalRaidStatus(r))}</small></button>`).join('')||'<p>目前沒有待集合或待領分寶的團隊</p>'}</div>`;
}
function renderRaidWorkflow(r){
 const owner=r.owner===state.me.id,payout=r.payout_owner===state.me.id;if(!owner&&!payout)return;
 const paid=r.settlement&&r.settlement.result.users.every(id=>r.members.find(m=>m.user_id===id)?.paid),step=r.status==='cancelled'?-1:r.settlement?(paid?5:4):r.status==='done'?3:r.status==='running'?2:r.roster_confirmed?1:0;
 const flow=document.createElement('div');flow.className='raid-workflow';flow.innerHTML=`<ol aria-label="團隊進度">${['招募／正選','集合','出席','結算','領取','完成'].map((label,index)=>`<li class="${index===step?'current':index<step?'finished':''}" ${index===step?'aria-current="step"':''}>${label}</li>`).join('')}</ol><p>${r.status==='cancelled'?'團隊已取消':step===0?'確認正選名單後，通知隊友集合並開始。':step===1?'正選已確認，可通知集合並開始。':step===2?'勾選實際出席人員，結束後完成團隊。':step===3?'確認出席後，輸入戰利品及成本結算。':step===4?'通知出席成員領取分寶，領取後標記已領。':'所有分寶已領取。'}</p>`;
 $('#detail .tags').after(flow);
 if($('#start'))$('#start').classList.toggle('primary',!!r.roster_confirmed);
 if($('#saveRoster'))$('#saveRoster').classList.toggle('primary',!r.roster_confirmed);
 const actions=$('#detail .actions'),more=document.createElement('details');more.className='raid-more';more.innerHTML='<summary>更多操作</summary><div class="actions"></div>';
 for(const id of ['edit','splitRaid','sync','share','duplicate','cancel','resetLoot']){const button=$('#'+id);if(button)more.querySelector('div').append(button)}
 if(more.querySelector('button'))actions.after(more);
 const save=document.createElement('button');save.id='saveTemplate';save.type='button';save.textContent='存為常用範本';save.onclick=()=>action(()=>saveRaidTemplate(r));more.querySelector('div').prepend(save);if(!more.isConnected)actions.after(more);
}
async function saveRaidTemplate(r){
 const saved=await api('/me/templates');
 modal('儲存團隊範本',`<form id="templateSaveForm"><label>範本名稱<input name="name" required maxlength="60" value="${esc(r.title.slice(0,60))}"></label><label>儲存方式<select name="replace"><option value="">新增範本</option>${saved.templates.map(t=>`<option value="${esc(t.id)}">覆蓋：${esc(t.name)}</option>`).join('')}</select></label><button class="primary" type="submit">儲存範本</button></form>`);
 formHandler('#templateSaveForm',async f=>{const id=f.get('replace')||crypto.randomUUID(),template={id,name:f.get('name'),title:r.title,category:r.category||'boss',bosses:r.bosses,capacity:r.capacity,location:r.location,requirements:r.requirements,note:r.note};await api('/me/templates','PUT',{version:saved.version,templates:[...saved.templates.filter(t=>t.id!==id),template]});toast('常用範本已儲存')});
}
async function openRaidTemplates(){
 const saved=await api('/me/templates');
 modal('常用團隊範本',`<div class="template-list">${saved.templates.map(t=>`<div class="template-row"><div><strong>${esc(t.name)}</strong><p>${esc(t.bosses.join(' / '))} · ${t.capacity} 人</p></div><button type="button" data-use-template="${esc(t.id)}">開團</button><button type="button" data-rename-template="${esc(t.id)}">更名</button><button type="button" data-delete-template="${esc(t.id)}" class="danger">刪除</button></div>`).join('')||'<p>尚無範本</p>'}</div><button id="templateNew" type="button">新增團隊</button>`);
 $('#templateNew').onclick=()=>raidForm();
 document.querySelectorAll('[data-use-template]').forEach(button=>button.onclick=()=>raidForm(saved.templates.find(t=>t.id===button.dataset.useTemplate),true));
 document.querySelectorAll('[data-delete-template]').forEach(button=>button.onclick=()=>action(async()=>{if(!confirm('確定刪除此範本？'))return;button.disabled=true;try{await api('/me/templates','PUT',{version:saved.version,templates:saved.templates.filter(t=>t.id!==button.dataset.deleteTemplate)});toast('範本已刪除');await openRaidTemplates()}finally{button.disabled=false}}));
 document.querySelectorAll('[data-rename-template]').forEach(button=>button.onclick=()=>{const t=saved.templates.find(t=>t.id===button.dataset.renameTemplate);modal('範本更名',`<form id="templateRenameForm"><label>名稱<input name="name" required maxlength="60" value="${esc(t.name)}"></label><button type="submit" class="primary">儲存</button></form>`);formHandler('#templateRenameForm',async f=>{await api('/me/templates','PUT',{version:saved.version,templates:saved.templates.map(item=>item.id===t.id?{...item,name:f.get('name')}:item)});toast('範本名稱已更新')})});
}
let archiveRequest=0;
async function searchRaidArchive(more=false){
 const account=state.me.id,query=$('#archiveQuery').value.trim(),request=++archiveRequest,button=$('#archiveSearch button');button.disabled=true;$('#archiveMore').disabled=true;
 if(query!==state.archiveQuery)more=false;
 try{const before=more?state.archiveRaids?.at(-1)?.id:null,result=await api('/raids/search?q='+encodeURIComponent(query)+(before?'&before='+before:''));if(state.me?.id!==account||request!==archiveRequest)return;state.archiveRaids=more?[...state.archiveRaids,...result.raids]:result.raids;state.archiveMore=result.more;state.archiveQuery=query;for(const raid of result.raids){const index=state.raids.findIndex(r=>r.id===raid.id);if(index<0)state.raids.push(raid);else state.raids[index]=raid}renderList();renderDetail()}finally{if(request===archiveRequest){button.disabled=false;$('#archiveMore').disabled=false}}
}
$('#archiveSearch').onsubmit=e=>{e.preventDefault();action(()=>searchRaidArchive())};
$('#archiveMore').onclick=()=>action(()=>searchRaidArchive(true));
$('#archiveReset').onclick=()=>{archiveRequest++;state.archiveRaids=null;state.archiveMore=false;$('#archiveQuery').value='';$('#archiveSearch button').disabled=false;$('#archiveMore').disabled=false;renderList()};
$('#templatesButton').onclick=()=>action(openRaidTemplates);
