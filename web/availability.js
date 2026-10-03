const availabilityState={mode:'weekly',week:'',data:null,members:[],selected:new Set(),dirty:false,loading:false};
function availabilitySelectionKey(){return 'maple.availability.members.'+(state.me?.id||'')}
function readAvailabilitySelection(){try{const ids=JSON.parse(localStorage.getItem(availabilitySelectionKey())||'[]');return new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[])}catch{return new Set()}}
function saveAvailabilitySelection(){try{localStorage.setItem(availabilitySelectionKey(),JSON.stringify([...availabilityState.selected]))}catch{}}
function resetAvailabilityAccount(){const id=state.me?.id||'';if(availabilityState.account===id)return;Object.assign(availabilityState,{account:id,mode:'weekly',data:null,members:[],selected:id?readAvailabilitySelection():new Set(),dirty:false});$('#availabilityPage').hidden=true;$('#raidPage').hidden=false;$('.page-top').hidden=false}
const availabilityDays=['一','二','三','四','五','六','日'];
function availabilityDate(date,delta=0){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function availabilityMonday(date){const day=new Date(date+'T00:00:00Z').getUTCDay();return availabilityDate(date,-((day+6)%7))}
function availabilityTime(slot){return String(Math.floor(slot/2)).padStart(2,'0')+':'+(slot%2?'30':'00')}
function availabilitySlots(data,date){return Object.hasOwn(data.exceptions,date)?data.exceptions[date]:data.weekly[(new Date(date+'T00:00:00Z').getUTCDay()+6)%7]}
function availabilityCommon(members,dates,minSlots){const result=dates.map(date=>({date,slots:[],ranges:[]})),sets=dates.map(date=>members.map(member=>new Set(availabilitySlots(member,date))));let start=null;for(let index=0;index<=dates.length*48;index++){const day=Math.floor(index/48),slot=index%48,free=index<dates.length*48&&members.length>0&&sets[day].every(set=>set.has(slot));if(free&&start===null)start=index;if(!free&&start!==null){if(index-start>=minSlots){for(let cursor=start;cursor<index;){const d=Math.floor(cursor/48),end=Math.min(index,(d+1)*48);result[d].ranges.push([cursor%48,end-d*48]);for(let i=cursor;i<end;i++)result[d].slots.push(i%48);cursor=end}}start=null}}return result}
async function openAvailability(){if(availabilityState.loading)return;availabilityState.loading=true;$('#availabilityButton').disabled=true;try{const account=state.me?.id,data=await api('/me/availability'),members=await api('/availability');if(state.me?.id!==account)return;availabilityState.data=data;availabilityState.members=members;availabilityState.dirty=false;if(!availabilityState.week)availabilityState.week=availabilityMonday(new Date(Date.now()+8*3600000).toISOString().slice(0,10));$('#raidPage').hidden=true;$('.page-top').hidden=true;$('#availabilityPage').hidden=false;renderAvailability()}finally{availabilityState.loading=false;$('#availabilityButton').disabled=false}}
function renderAvailability(){
 const s=availabilityState,dates=Array.from({length:7},(_,i)=>availabilityDate(s.week,i)),common=s.mode==='common';
 $('#availabilityPage').innerHTML=`<div class="availability-heading"><h2>空閒時間</h2><button id="availabilityBack" type="button">返回團隊</button></div><div class="availability-toolbar"><div class="availability-tabs" role="tablist" aria-label="空閒時間檢視">${[['weekly','每週固定'],['dates','日期例外'],['common','共同時間']].map(([mode,label])=>`<button type="button" role="tab" aria-selected="${s.mode===mode}" data-availability-mode="${mode}">${label}</button>`).join('')}</div>${s.mode!=='weekly'?`<div class="availability-week"><button id="availabilityPrev" aria-label="上一週">←</button><input id="availabilityWeek" type="date" aria-label="日期" value="${s.week}"><button id="availabilityNext" aria-label="下一週">→</button></div>`:''}${!common?`<span id="availabilityDirty" role="status">${s.dirty?'尚未儲存':''}</span><button id="availabilityReload">重新載入</button><button class="primary" id="availabilitySave">儲存空閒時間</button>`:''}</div><div class="availability-layout ${common?'with-members':''}">${common?`<aside class="availability-members"><label>搜尋成員<input id="availabilitySearch" type="search" placeholder="名稱或 Discord ID"></label><div class="availability-member-actions"><button id="availabilitySelectAll">全選搜尋結果</button><button id="availabilityClear">清除</button></div><p id="availabilitySelected"></p><div id="availabilityMemberList"></div><label>至少連續<select id="availabilityDuration">${[1,2,3,4,6,8].map(slots=>`<option value="${slots}" ${slots===s.duration?'selected':''}>${slots/2} 小時</option>`).join('')}</select></label><div id="availabilityResults"></div></aside>`:`<div class="availability-range"><label>日期<select id="availabilityDay">${dates.map((date,i)=>`<option value="${i}">${s.mode==='weekly'?'星期'+availabilityDays[i]:date+'（'+availabilityDays[i]+'）'}</option>`).join('')}</select></label><label>開始<select id="availabilityStart">${Array.from({length:48},(_,i)=>`<option value="${i}" ${i===40?'selected':''}>${availabilityTime(i)}</option>`).join('')}</select></label><label>結束<select id="availabilityEnd">${Array.from({length:48},(_,i)=>`<option value="${i+1}" ${i+1===46?'selected':''}>${availabilityTime(i+1)}</option>`).join('')}</select></label><button id="availabilityAdd">設為空閒</button><button id="availabilityRemove">取消空閒</button>${s.mode==='dates'?'<button id="availabilityResetDay">恢復當日固定</button>':''}</div>`}<div class="availability-calendar"><div id="availabilityGrid" class="availability-grid" role="group" aria-label="半小時空閒週曆"></div></div></div>`;
 $('#availabilityBack').onclick=()=>{if(s.dirty&&!confirm('尚未儲存空閒時間，確定離開？'))return;$('#availabilityPage').hidden=true;$('#raidPage').hidden=false;$('.page-top').hidden=false};
 document.querySelectorAll('[data-availability-mode]').forEach(button=>button.onclick=()=>{s.mode=button.dataset.availabilityMode;renderAvailability()});
 if(s.mode!=='weekly'){const week=date=>{s.week=availabilityMonday(date);renderAvailability()};$('#availabilityPrev').onclick=()=>week(availabilityDate(s.week,-7));$('#availabilityNext').onclick=()=>week(availabilityDate(s.week,7));$('#availabilityWeek').onchange=e=>{if(e.target.value)week(e.target.value)}}
 if(common){
  const heading=document.createElement('h3');heading.textContent='已填寫的成員';$('#availabilityMemberList').before(heading);
  $('#availabilitySearch').placeholder='篩選 Discord 暱稱或 ID';
  const renderMembers=()=>{
   const query=$('#availabilitySearch').value.toLocaleLowerCase(),list=s.members.filter(member=>(member.name+' '+member.id).toLocaleLowerCase().includes(query));
   $('#availabilityMemberList').innerHTML=list.map(member=>`<label class="check-label" title="Discord ID：${esc(member.id)}"><input type="checkbox" data-available-member="${esc(member.id)}" ${s.selected.has(member.id)?'checked':''}><span>${esc(member.name)}</span></label>`).join('')||(s.members.length?'<p>沒有符合搜尋的成員</p>':'<p>沒有已填寫的成員</p>');
   document.querySelectorAll('[data-available-member]').forEach(input=>input.onchange=()=>{input.checked?s.selected.add(input.dataset.availableMember):s.selected.delete(input.dataset.availableMember);saveAvailabilitySelection();renderMembers();renderAvailabilityGrid()});
   const selected=s.members.filter(member=>s.selected.has(member.id));$('#availabilitySelected').textContent='已選 '+selected.length+' 人'+(selected.length?'：'+selected.map(member=>member.name).join('、'):'');
   $('#availabilitySelectAll').textContent=query?'全選搜尋結果':'全選成員';
   $('#availabilitySelectAll').onclick=()=>{list.forEach(member=>s.selected.add(member.id));saveAvailabilitySelection();renderMembers();renderAvailabilityGrid()};
  };
  $('#availabilitySearch').oninput=renderMembers;
  $('#availabilityClear').onclick=()=>{s.selected.clear();saveAvailabilitySelection();renderMembers();renderAvailabilityGrid()};
  $('#availabilityDuration').onchange=e=>{s.duration=Number(e.target.value);renderAvailabilityGrid()};renderMembers();
 }else{
  const edit=add=>{const start=Number($('#availabilityStart').value),end=Number($('#availabilityEnd').value),day=Number($('#availabilityDay').value);if(end<=start){notice('結束時間須晚於開始時間');return}const set=new Set(s.mode==='weekly'?s.data.weekly[day]:availabilitySlots(s.data,dates[day]));for(let slot=start;slot<end;slot++)add?set.add(slot):set.delete(slot);setAvailabilityDay(day,[...set])};$('#availabilityAdd').onclick=()=>edit(true);$('#availabilityRemove').onclick=()=>edit(false);if(s.mode==='dates')$('#availabilityResetDay').onclick=()=>{delete s.data.exceptions[dates[Number($('#availabilityDay').value)]];markAvailabilityDirty();renderAvailabilityGrid()};
  $('#availabilitySave').onclick=()=>action(async()=>{const button=$('#availabilitySave');button.disabled=true;try{const snapshot=structuredClone(s.data),result=await api('/me/availability','PUT',snapshot);s.data.version=result.version;s.dirty=JSON.stringify([s.data.weekly,s.data.exceptions])!==JSON.stringify([snapshot.weekly,snapshot.exceptions]);$('#availabilityDirty').textContent=s.dirty?'尚未儲存':'';toast('空閒時間已儲存');s.members=await api('/availability')}finally{button.disabled=false}});
 }
 if($('#availabilityReload'))$('#availabilityReload').onclick=()=>action(async()=>{if(s.dirty&&!confirm('放棄尚未儲存的修改並重新載入？'))return;await openAvailability()});
 renderAvailabilityGrid();
 $('.availability-calendar').scrollTop=36*31;
}
function markAvailabilityDirty(){availabilityState.dirty=true;if($('#availabilityDirty'))$('#availabilityDirty').textContent='尚未儲存'}
function setAvailabilityDay(day,slots){const s=availabilityState;slots.sort((a,b)=>a-b);if(s.mode==='weekly')s.data.weekly[day]=slots;else s.data.exceptions[availabilityDate(s.week,day)]=slots;markAvailabilityDirty();renderAvailabilityGrid()}
let availabilityDrag=null;
function paintAvailabilitySlot(button,free){
 const s=availabilityState,day=Number(button.dataset.availabilityDay),slot=Number(button.dataset.availabilitySlot),date=availabilityDate(s.week,day);
 const slots=new Set(s.mode==='weekly'?s.data.weekly[day]:availabilitySlots(s.data,date));
 if(slots.has(slot)===free)return;
 free?slots.add(slot):slots.delete(slot);
 const sorted=[...slots].sort((a,b)=>a-b);
 if(s.mode==='weekly')s.data.weekly[day]=sorted;else s.data.exceptions[date]=sorted;
 button.classList.toggle('free',free);button.setAttribute('aria-pressed',String(free));markAvailabilityDirty();
 if(s.mode==='dates'){const header=$('#availabilityGrid').children[day+1];if(!header.querySelector('small')){const label=document.createElement('small');label.textContent='日期例外';header.append(label)}}
}
document.addEventListener('mouseup',()=>{availabilityDrag=null});
window.addEventListener('blur',()=>{availabilityDrag=null});
function renderAvailabilityGrid(){const s=availabilityState,dates=Array.from({length:7},(_,i)=>availabilityDate(s.week,i)),members=s.members.filter(member=>s.selected.has(member.id)),common=s.mode==='common',matches=common?availabilityCommon(members,dates,s.duration||1):null;const days=common?matches.map(day=>day.slots):s.mode==='weekly'?s.data.weekly:dates.map(date=>availabilitySlots(s.data,date));
 let html='<div class="availability-corner"></div>'+dates.map((date,i)=>`<div class="availability-day">${s.mode==='weekly'?'星期'+availabilityDays[i]:date.slice(5)+'（'+availabilityDays[i]+'）'}${s.mode==='dates'&&Object.hasOwn(s.data.exceptions,date)?'<small>日期例外</small>':''}</div>`).join('');
 for(let slot=0;slot<48;slot++){html+=`<div class="availability-time">${availabilityTime(slot)}</div>`;for(let day=0;day<7;day++){const free=days[day].includes(slot),label=(s.mode==='weekly'?'星期'+availabilityDays[day]:dates[day])+' '+availabilityTime(slot)+'–'+availabilityTime(slot+1);html+=common?`<div class="availability-slot ${free?'free':''}" aria-label="${esc(label+(free?'共同空閒':'無共同空閒'))}" title="${esc(label)}"></div>`:`<button type="button" class="availability-slot ${free?'free':''}" data-availability-day="${day}" data-availability-slot="${slot}" aria-pressed="${free}" aria-label="${esc(label)}" title="${esc(label)}"></button>`}}
 availabilityDrag=null;
 const grid=$('#availabilityGrid');grid.innerHTML=html;
 grid.onmousedown=event=>{const button=event.target.closest('[data-availability-slot]');if(!button||event.button!==0)return;event.preventDefault();availabilityDrag={free:button.getAttribute('aria-pressed')!=='true'};button.dataset.mousePainted='true';paintAvailabilitySlot(button,availabilityDrag.free)};
 grid.onmouseover=event=>{if(!availabilityDrag)return;if(!(event.buttons&1)){availabilityDrag=null;return}const button=event.target.closest('[data-availability-slot]');if(button)paintAvailabilitySlot(button,availabilityDrag.free)};
 grid.onclick=event=>{const button=event.target.closest('[data-availability-slot]');if(!button)return;if(event.detail>0&&button.dataset.mousePainted){delete button.dataset.mousePainted;return}delete button.dataset.mousePainted;paintAvailabilitySlot(button,button.getAttribute('aria-pressed')!=='true')};
 if(common)$('#availabilityResults').innerHTML=members.length?matches.map(day=>day.ranges.length?`<h3>${esc(day.date)}</h3>${day.ranges.map(([start,end])=>`<p>${availabilityTime(start)}–${availabilityTime(end)}</p>`).join('')}`:'').join('')||'<p>沒有符合條件的共同時間</p>':'<p>尚未選擇成員</p>';
}
$('#availabilityButton').onclick=()=>action(openAvailability);
window.addEventListener('beforeunload',event=>{if(availabilityState.dirty){event.preventDefault();event.returnValue=''}});
