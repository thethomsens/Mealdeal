const ZIPS={"84101":[40.7563,-111.9004],"84102":[40.7600,-111.8630],"84103":[40.7770,-111.8740],"84105":[40.7375,-111.8590],"84106":[40.7060,-111.8550],"84107":[40.6580,-111.8880],"84111":[40.7550,-111.8840],"84115":[40.7150,-111.8930],"84117":[40.6560,-111.8340],"84119":[40.6910,-111.9960],"84601":[40.2300,-111.6800],"84604":[40.2860,-111.6500],"84020":[40.5000,-111.8700],"84047":[40.6150,-111.8850],"84070":[40.5740,-111.8910],"84121":[40.6230,-111.8000],"84074":[40.5308,-112.2983],"84029":[40.5999,-112.4644]};
const CITIES={"salt lake city":[40.7608,-111.891],"slc":[40.7608,-111.891],"sugar house":[40.7233,-111.8586],"murray":[40.6669,-111.888],"west valley":[40.6916,-112.0011],"west valley city":[40.6916,-112.0011],"provo":[40.2338,-111.6585],"sandy":[40.5649,-111.8389],"draper":[40.5247,-111.8638],"west jordan":[40.6097,-111.9391],"south salt lake":[40.7188,-111.8883],"tooele":[40.5308,-112.2983],"stansbury park":[40.6377,-112.2961],"stansbury":[40.6377,-112.2961],"grantsville":[40.5999,-112.4644],"erda":[40.6125,-112.3047],"lake point":[40.6794,-112.2703]};
const CUISINES=['burger','chicken','mexican','pizza','asian','breakfast','sandwich','healthy','dessert','other'];
const SYN={taco:'mexican',tacos:'mexican',burrito:'mexican',burritos:'mexican',quesadilla:'mexican',nachos:'mexican',mexican:'mexican',
burger:'burger',burgers:'burger',cheeseburger:'burger',fries:'burger',fry:'burger',whopper:'burger',
chicken:'chicken',nuggets:'chicken',nugget:'chicken',wings:'chicken',wing:'chicken',tenders:'chicken',
pizza:'pizza',slice:'pizza',pho:'asian',ramen:'asian',sushi:'asian',chinese:'asian',thai:'asian',asian:'asian',noodles:'asian',
breakfast:'breakfast',pancakes:'breakfast',eggs:'breakfast',coffee:'breakfast',brunch:'breakfast',
sandwich:'sandwich',sandwiches:'sandwich',sub:'sandwich',subs:'sandwich',deli:'sandwich',
healthy:'healthy',salad:'healthy',bowl:'healthy',vegan:'healthy',vegetarian:'healthy',dessert:'dessert',ice:'dessert',cookie:'dessert'};
function craveMatch(x,q){const words=q.toLowerCase().split(/[^a-z]+/).filter(Boolean);if(!words.length)return true;
 const tags=x.cuisine||[],text=(x.restaurant+' '+x.deal).toLowerCase();
 return words.some(w=>{const c=SYN[w]||SYN[w.replace(/s$/,'')];return (c&&tags.includes(c))||tags.includes(w)||(w.length>2&&new RegExp('\\b'+w).test(text))})}
let crave='',sub='value',deals=[],mode='cheap',loc=[40.7608,-111.891];const $=id=>document.getElementById(id);
const km=(a,b)=>{const R=6371,r=x=>x*Math.PI/180,dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const resolveLocal=s=>{s=s.trim().toLowerCase();const z=s.match(/\b\d{5}\b/);if(z&&ZIPS[z[0]])return ZIPS[z[0]];return CITIES[s]||null};
async function resolve(s){const l=resolveLocal(s);if(l)return [l[0],l[1],s.trim()];const r=await fetch('/api/geocode?q='+encodeURIComponent(s));if(r.ok){const g=await r.json();return [g.lat,g.lng,g.label]}const p=resolveLocal(s);return p?[p[0],p[1],s]:null}
let near='Salt Lake City, UT';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function filtered(){let d=deals.map(x=>({...x,mi:x.lat?km(loc,[x.lat,x.lng])*0.621:null,vpd:x.nodeal?-1:(x.items||1)/x.price}));
 const near=new Set(d.filter(x=>x.mi!=null&&x.mi<=15&&!/^Participating/.test(x.address)).map(x=>x.restaurant+'|'+x.deal));d=d.filter(x=>!(/^Participating/.test(x.address)&&near.has(x.restaurant+'|'+x.deal)));
 d=d.filter(x=>x.verified);
 if(mode==='cheap')d=d.filter(x=>(x.items||1)>=3||x.category!=='combo'||x.price>=5); // "full meal": skip 2-item snack combos
 if(mode==='crave')d=d.filter(x=>craveMatch(x,crave));
 const dist=x=>x.mi??99,tier=x=>{const m=dist(x);return m<=15?0:m<=30?1:2},nd=(a,b)=>(a.nodeal?1:0)-(b.nodeal?1:0);const by=mode==='crave'?(sub==='cheap'?'cheap':'value'):mode;
 const f=by==='cheap'?(a,b)=>a.price-b.price:(a,b)=>b.vpd-a.vpd||a.price-b.price;d.sort((a,b)=>tier(a)-tier(b)||nd(a,b)||(a.nodeal?dist(a)-dist(b):f(a,b)||dist(a)-dist(b)));return d}
const CHK='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
function card(x){const chain=/^Participating/.test(x.address);return `<div class="top"><span>${esc(x.restaurant)}</span><span class="price">${x.nodeal?'—':'$'+x.price.toFixed(2)}</span></div>
<div class="deal">${esc(x.deal)}</div><div class="meta">${x.mi!=null&&!chain?`<span class="dist">${x.mi.toFixed(1)} mi</span>`:''}<span>${esc(x.address)}</span>${x.days?`<span>· ${esc(x.days)}</span>`:''}${x.nodeal?'':`<span>· ${x.vpd.toFixed(2)} items/$</span>`}</div>
<div class="badges">${x.verified?'<span class="tag ver">'+CHK+'Verified '+esc(x.checked)+'</span>':(x.nodeal?'<span class="tag sam">No verified deal yet</span>':'<span class="tag sam">'+(x.submitted?'Unreviewed submission':'Sample data')+'</span>')}${(x.cuisine||[]).map(c=>`<span class="tag cu">${esc(c)}</span>`).join('')}<span class="tag ${x.source==='restaurant'?'rest':''}">${x.source==='chain'?'Chain-wide':x.source==='restaurant'?'Restaurant-posted':'Community'}</span>${x.national&&!x.nodeal?'<span class="tag nat">National price</span>':''}${x.source_url?`<a href="${esc(x.source_url)}" target="_blank" rel="noopener">Source</a>`:''}${x.store_url?`<a href="${esc(x.store_url)}" target="_blank" rel="noopener">Map</a>`:''}</div>${x.note?`<div class="note">${esc(x.note)}</div>`:''}${(x.order||[]).length?`<div class="order">${x.order.map(o=>`<a class="ob ${o.kind}" href="${esc(o.url)}" target="_blank" rel="sponsored nofollow noopener">${o.kind==='official'?'Order now':esc(o.label)}</a>`).join('')}</div>`:''}`}
function render(){$('list').innerHTML=filtered().map(x=>`<li>${card(x)}</li>`).join('')||(mode==='crave'?`<li class="empty"><b>No deals for “${esc(crave)}” yet</b><span class="muted">Try another craving, or submit a ${esc(crave)} special below so others can find it.</span></li>`:'<li class="empty"><b>No deals here yet</b><span class="muted">Try a nearby ZIP or city, or check back soon.</span></li>')}
async function load(){$('list').innerHTML='<li class="loading" aria-busy="true">Finding deals near you…</li>';const j=await (await fetch('/api/deals?lat='+loc[0]+'&lng='+loc[1]+'&near='+encodeURIComponent(near))).json();deals=j.deals;
 const s=j.stores||{};$('storemsg').textContent=s.message?s.message+'. Showing verified local stores for now.':s.count!=null?`${s.count} chain locations found within ${s.radius_mi} mi (OpenStreetMap${s.cached?', cached':''})`:'';render()}
function setMode(m){mode=m;$('m-cheap').classList.toggle('on',m==='cheap');$('m-value').classList.toggle('on',m==='value');$('m-crave').classList.toggle('on',m==='crave');$('cravebox').hidden=m!=='crave';$('pick').innerHTML='';render()}
$('m-cheap').onclick=()=>setMode('cheap');$('m-value').onclick=()=>setMode('value');$('m-crave').onclick=()=>{setMode('crave');$('crave').focus()};
$('crave').oninput=e=>{crave=e.target.value;$('pick').innerHTML='';render()};
document.querySelectorAll('.chips button').forEach(b=>b.onclick=()=>{crave=$('crave').value=b.dataset.c;$('pick').innerHTML='';render()});
const setSub=v=>{sub=v;$('s-value').classList.toggle('on',v==='value');$('s-cheap').classList.toggle('on',v==='cheap');render()};$('s-value').onclick=()=>setSub('value');$('s-cheap').onclick=()=>setSub('cheap');
$('go').onclick=async()=>{const p=await resolve($('zip').value);if(!p){$('locmsg').textContent='Unknown US ZIP or city — try e.g. 10001 or "Austin, TX"';return}loc=[p[0],p[1]];near=String(p[2]).replace(/^ZIP /,'');$('locmsg').textContent='Using: '+p[2];load()};
let acItems=[],acI=-1,acT;const acl=$('acl'),zi=$('zip');
const acClose=()=>{acl.hidden=true;zi.setAttribute('aria-expanded','false');acI=-1;zi.removeAttribute('aria-activedescendant')};
const acDraw=()=>{acl.innerHTML=acItems.map((x,i)=>`<li id="ac${i}" role="option" aria-selected="${i===acI}" data-i="${i}"><span>${esc(x.label)}</span><small>${x.type==='zip'?'ZIP':'City'}</small></li>`).join('');acl.hidden=!acItems.length;zi.setAttribute('aria-expanded',String(!!acItems.length));acI>=0?zi.setAttribute('aria-activedescendant','ac'+acI):zi.removeAttribute('aria-activedescendant')};
const acPick=i=>{zi.value=acItems[i].value;acItems=[];acClose();$('go').click()};
zi.oninput=()=>{clearTimeout(acT);const v=zi.value.trim();if(v.length<2&&!/^\d/.test(v)){acItems=[];return acClose()}acT=setTimeout(async()=>{try{acItems=await (await fetch('/api/places?q='+encodeURIComponent(v))).json();if(zi.value.trim()!==v)return;acI=-1;acDraw()}catch(_){}},150)};
zi.onkeydown=e=>{const open=!acl.hidden&&acItems.length;
 if(e.key==='ArrowDown'&&open){e.preventDefault();acI=(acI+1)%acItems.length;acDraw()}
 else if(e.key==='ArrowUp'&&open){e.preventDefault();acI=(acI-1+acItems.length)%acItems.length;acDraw()}
 else if(e.key==='Escape'){acClose()}
 else if(e.key==='Enter'){e.preventDefault();if(open&&acI>=0)acPick(acI);else{acClose();$('go').click()}}};
acl.onpointerdown=e=>{const li=e.target.closest('li');if(li){e.preventDefault();acPick(+li.dataset.i)}};
zi.onblur=()=>setTimeout(acClose,100);
$('geo').onclick=()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>{loc=[p.coords.latitude,p.coords.longitude];near='';$('locmsg').textContent='Using: your location';load()},()=>$('locmsg').textContent='Location blocked — enter a ZIP'):0;
$('spin').onclick=()=>{const d=filtered();const real=d.filter(x=>!x.nodeal);if(!real.length){$('pick').innerHTML=mode==='crave'?'<div class="card empty"><b>Nothing to spin yet</b><span class="muted">Try a different craving.</span></div>':'';return}const near=real.filter(x=>(x.mi??99)<=15),src=near.length?near:real;const pool=src.slice(0,Math.min(8,src.length));const x=pool[Math.floor(Math.random()*pool.length)];$('pick').innerHTML=`<div class="card"><span class="pickhd">Your pick</span>${card(x)}</div>`};
$('f').onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));const p=(await resolve(fd.address))||[];
 const r=await fetch('/api/deals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fd,source:fd.isrest?'restaurant':'user',lat:p[0],lng:p[1]})});
 $('fmsg').textContent=r.ok?'Thanks! Added (marked unreviewed).':'Error: '+(await r.json()).error;if(r.ok){e.target.reset();load()}};
load();
