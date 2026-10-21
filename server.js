const express=require('express'),fs=require('fs'),path=require('path');
const DB=path.join(__dirname,'data','db.json'),CACHE=path.join(__dirname,'data','cache');fs.mkdirSync(CACHE,{recursive:true});
if(!fs.existsSync(DB)){const s=require('./data/seed.json').map((d,i)=>({id:i+1,...d}));fs.writeFileSync(DB,JSON.stringify(s,null,1));}
const load=()=>JSON.parse(fs.readFileSync(DB));const pub=d=>{const{contact_email,...p}=d;return p};
const ZIPS=require('./data/zips.json'),PLACES=require('./data/places.json'),CAT=require('./data/catalog.json'),LINKS=require('./data/links.json');
const CU=['burger','chicken','mexican','pizza','asian','breakfast','sandwich','healthy','dessert','other'];
const norm=s=>String(s||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]/g,'');
const BYQ={},BYN={};CAT.chains.forEach(c=>{BYQ[c.qid]=c;BYN[norm(c.name)]=c});BYN[norm('Sonic Drive-In')]=BYN.sonic;BYN[norm('Dunkin Donuts')]=BYN[norm("Dunkin'")];BYN[norm('Panera')]=BYN[norm('Panera Bread')];BYN[norm("Marco's")]=BYN[norm("Marco's Pizza")];BYN[norm('Carls Jr')]=BYN[norm("Carl's Jr.")];BYN[norm('Domino’s Pizza')]=BYN[norm("Domino's")];BYN[norm("Domino's Pizza")]=BYN[norm("Domino's")];BYN[norm('Popeyes Louisiana Kitchen')]=BYN.popeyes;
const km=(a,b)=>{const R=6371,r=x=>x*Math.PI/180,dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const ST={alabama:'al',alaska:'ak',arizona:'az',arkansas:'ar',california:'ca',colorado:'co',connecticut:'ct',delaware:'de',florida:'fl',georgia:'ga',hawaii:'hi',idaho:'id',illinois:'il',indiana:'in',iowa:'ia',kansas:'ks',kentucky:'ky',louisiana:'la',maine:'me',maryland:'md',massachusetts:'ma',michigan:'mi',minnesota:'mn',mississippi:'ms',missouri:'mo',montana:'mt',nebraska:'ne',nevada:'nv','new hampshire':'nh','new jersey':'nj','new mexico':'nm','new york':'ny','north carolina':'nc','north dakota':'nd',ohio:'oh',oklahoma:'ok',oregon:'or',pennsylvania:'pa','rhode island':'ri','south carolina':'sc','south dakota':'sd',tennessee:'tn',texas:'tx',utah:'ut',vermont:'vt',virginia:'va',washington:'wa','west virginia':'wv',wisconsin:'wi',wyoming:'wy','district of columbia':'dc'};
const ALIAS={slc:'salt lake city, ut',nyc:'new york, ny','new york city':'new york, ny',la:'los angeles, ca',dc:'washington, dc',stansbury:'stansbury park, ut'};
const ZIPCITY=require('./data/zipcity.json'); // ZIP -> USPS primary city (scpike/us-state-county-zip)
const PLIST=Object.entries(PLACES).map(([k,v])=>({k,lat:v[0],lng:v[1],r:Math.max(1,Math.sqrt((v[2]||0)/1e6/Math.PI))}));
const ptitle=k=>k.replace(/\b\w/g,c=>c.toUpperCase()).replace(/, (\w+)$/,(x,s)=>', '+s.toUpperCase());
// ZIP3 prefix -> state (USPS ranges), so a ZIP never resolves across a state line
const Z3=[[5,5,'ny'],[6,9,'pr'],[10,27,'ma'],[28,29,'ri'],[30,38,'nh'],[39,49,'me'],[50,59,'vt'],[60,69,'ct'],[70,89,'nj'],[100,149,'ny'],[150,196,'pa'],[197,199,'de'],[200,200,'dc'],[201,201,'va'],[202,205,'dc'],[206,219,'md'],[220,246,'va'],[247,268,'wv'],[270,289,'nc'],[290,299,'sc'],[300,319,'ga'],[320,349,'fl'],[350,369,'al'],[370,385,'tn'],[386,397,'ms'],[398,399,'ga'],[400,427,'ky'],[430,459,'oh'],[460,479,'in'],[480,499,'mi'],[500,528,'ia'],[530,549,'wi'],[550,567,'mn'],[569,569,'dc'],[570,577,'sd'],[580,588,'nd'],[590,599,'mt'],[600,629,'il'],[630,658,'mo'],[660,679,'ks'],[680,693,'ne'],[700,714,'la'],[716,729,'ar'],[730,749,'ok'],[750,799,'tx'],[800,816,'co'],[820,831,'wy'],[832,838,'id'],[840,847,'ut'],[850,865,'az'],[870,884,'nm'],[885,885,'tx'],[889,898,'nv'],[900,961,'ca'],[967,968,'hi'],[970,979,'or'],[980,994,'wa'],[995,999,'ak']];
const zipState=z=>{const n=+String(z).slice(0,3);const e=Z3.find(([a,b])=>n>=a&&n<=b);return e&&e[2]};
// primary city for a point: nearest Census place center (optionally limited to one state)
function cityAt(lat,lng,st){let best=null,bd=1e9;for(const p of PLIST){if(Math.abs(p.lat-lat)>1.5||Math.abs(p.lng-lng)>2)continue;if(st&&!p.k.endsWith(', '+st))continue;const d=km([lat,lng],[p.lat,p.lng]);if(d<bd){bd=d;best={...p,d}}}return best||(st?cityAt(lat,lng):null)}
const cityRes=(c,src,extra)=>({lat:c.lat,lng:c.lng,label:ptitle(c.k),src,...extra});
async function geocode(q){q=String(q||'').trim().toLowerCase();if(!q)return null;
 const z=q.match(/^\d{5}/);if(z){let pt=ZIPS[z[0]];
  if(!pt){const n=await nominatim({postalcode:z[0],country:'us'});if(n)pt=[n.lat,n.lng];}
  if(!pt){const near=Object.keys(ZIPS).filter(k=>k.slice(0,3)===z[0].slice(0,3)).sort((a,b)=>Math.abs(a-z[0])-Math.abs(b-z[0]))[0];if(near)pt=ZIPS[near];}
  if(!pt)return null;const nm=ZIPCITY[z[0]],named=nm&&PLACES[nm]&&km(pt,PLACES[nm])<60?{k:nm,lat:PLACES[nm][0],lng:PLACES[nm][1]}:null;const c=named||cityAt(pt[0],pt[1],zipState(z[0]));return c?cityRes(c,'census-places-from-zip',{zip:z[0]}):null}
 q=ALIAS[q]||q;let m=q.match(/^(.+?)[,\s]+([a-z .]+)$/),key=null;
 if(m){let s=m[2].trim().replace(/\./g,'');s=ST[s]||s;if(PLACES[m[1].trim()+', '+s])key=m[1].trim()+', '+s;}
 if(!key&&PLACES[q])key=q;
 if(!key){const c=Object.keys(PLACES).filter(k=>k.slice(0,k.lastIndexOf(','))===q);if(c.length)key=c.sort((a,b)=>PLACES[b][2]-PLACES[a][2])[0];}
 if(key){const p=PLACES[key];return{lat:p[0],lng:p[1],label:key.replace(/\b\w/g,c=>c.toUpperCase()).replace(/, (\w+)$/,(x,s)=>', '+s.toUpperCase()),src:'census-places'}}
 const n=await nominatim({q:q,countrycodes:'us'});return n?{...n,src:'nominatim'}:null}
async function nominatim(p){try{const r=await fetch('https://nominatim.openstreetmap.org/search?'+new URLSearchParams({...p,format:'json',limit:1}),{headers:{'User-Agent':'MealDeal/0.1 prototype'},signal:AbortSignal.timeout(8000)});const j=await r.json();return j[0]?{lat:+j[0].lat,lng:+j[0].lon,label:j[0].display_name.split(',').slice(0,3).join(',')}:null}catch(e){return null}}
const MIRRORS=['https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
async function overpass(lat,lng,m){const qs=CAT.chains.map(c=>c.qid).join('|'),q=`[out:json][timeout:25];(nwr["brand:wikidata"~"^(${qs})$"](around:${m},${lat},${lng});nwr["amenity"="fast_food"]["brand"]["!brand:wikidata"](around:${m},${lat},${lng}););out center tags;`;
 const one=async u=>{const r=await fetch(u,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'User-Agent':'MealDeal/0.1 prototype','Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(40000)});if(!r.ok)throw 0;const j=await r.json();if(j.remark&&/error|timed out/i.test(j.remark))throw 0;return{els:j.elements,mirror:u}};
 try{return await Promise.any(MIRRORS.map(one))}catch(e){return null}}
const MI=1609.34,R1=15*MI,R2=30*MI,SLC=[40.7608,-111.891],INFLIGHT=new Map(),RETRY=new Map();
async function lookup(lat,lng,f){let res=await overpass(lat,lng,R1),radius=R1;if(res&&res.els.length<5){const r2=await overpass(lat,lng,R2);if(r2){res=r2;radius=R2}}
 if(!res)return null;
 const list=res.els.map(e=>{const t=e.tags||{},c=BYQ[t['brand:wikidata']]||BYN[norm(t.brand)]||BYN[norm(t.name)];if(!c)return null;const la=e.lat??e.center?.lat,ln=e.lon??e.center?.lon;if(la==null)return null;
  const addr=[[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' '),t['addr:city'],t['addr:state'],t['addr:postcode']].filter(Boolean).join(', ');
  return{chain:c.name,lat:la,lng:ln,address:addr||`${c.name} near ${la.toFixed(3)}, ${ln.toFixed(3)} (no street address in OSM)`,osm:`https://www.openstreetmap.org/${e.type}/${e.id}`}}).filter(Boolean);
 const out={t:Date.now(),v:2,radius,mirror:res.mirror,list};fs.writeFileSync(f,JSON.stringify(out));return out}
// one lookup per area at a time; on failure keep retrying in the background (cache warming)
function warm(lat,lng,key,f,attempt=0){if(INFLIGHT.has(key))return INFLIGHT.get(key);
 const p=lookup(lat,lng,f).catch(()=>null).then(res=>{INFLIGHT.delete(key);
  if(!res&&attempt<5&&!RETRY.has(key)){const t=setTimeout(()=>{RETRY.delete(key);warm(lat,lng,key,f,attempt+1)},Math.min(30e3*2**attempt,8*60e3));t.unref&&t.unref();RETRY.set(key,t)}
  return res});INFLIGHT.set(key,p);return p}
async function stores(lat,lng){const key=lat.toFixed(2)+'_'+lng.toFixed(2),f=path.join(CACHE,key+'.json');
 if(fs.existsSync(f)){try{const c=JSON.parse(fs.readFileSync(f));if(c.v===2&&Date.now()-c.t<14*864e5)return{...c,cached:true}}catch(_){}}
 const res=await Promise.race([warm(lat,lng,key,f),new Promise(ok=>setTimeout(()=>ok('slow'),12000))]);
 if(res==='slow')return{loading:true,list:[]};if(!res)return{error:true,list:[]};return res}
const link=(base,q,cfg)=>{let u=base.replace('{q}',encodeURIComponent(q));if(cfg.affiliateParam&&cfg.affiliateId)u+=(u.includes('?')?'&':'?')+cfg.affiliateParam+'='+encodeURIComponent(cfg.affiliateId);return u};
function orderLinks(name,near){const c=BYN[norm(name)],o=[];if(c&&c.order)o.push({label:'Order on '+name.replace(/'s$|’s$/,"'s")+' site',url:link(c.order,'',LINKS.official),kind:'official'});
 const q=name+(near?' '+near:'');o.push({label:'DoorDash',url:link(LINKS.doordash.base,name,LINKS.doordash),kind:'doordash'},{label:'Uber Eats',url:link(LINKS.ubereats.base,q,LINKS.ubereats),kind:'ubereats'});return o}
const MENU=require('./menuscan.js');
async function overpassPost(q){const one=async u=>{const r=await fetch(u,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'User-Agent':MENU.UA,'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(40000)});if(!r.ok)throw 0;const j=await r.json();if(j.remark&&/error|timed out/i.test(j.remark))throw 0;return j.elements};try{return await Promise.any(MIRRORS.map(one))}catch(e){return null}}
const EXTRA_CHAINS=['kfc','tacobell','costavida','dickeys','dickeysbarbecuepit','mobettahs','betos','redwok','subway','starbucks','dutchbros','swigg','swig','crumbl','cafe rio','caferio','pandaexpress','littlecaesars','papajohns'].map(norm);
const isChain=n=>String(n).split(/\s*[\/&+]\s*|\s+and\s+/i).concat(n).some(x=>!!BYN[norm(x)]||EXTRA_CHAINS.includes(norm(x)));
const MDEPS={overpassPost,isChain},LOCAL_R=10*MI; // local spots: 10 mi of the city center
const app=express();app.use(express.json());require('./admin.js')(app,{DB,load,CU,MENU});app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
const PKEYS=Object.keys(PLACES).map(k=>({k,n:k.slice(0,k.lastIndexOf(',')),a:PLACES[k][2]||0})).sort((a,b)=>b.a-a.a),ZKEYS=Object.keys(ZIPS).sort();
const title=k=>k.replace(/\b\w/g,c=>c.toUpperCase()).replace(/, (\w+)$/,(x,s)=>', '+s.toUpperCase());
// autocomplete: Census places have no population in the bundle, so larger land area ranks first
app.get('/api/places',(q,r)=>{const s=String(q.query.q||'').trim().toLowerCase().slice(0,60);if(!s)return r.json([]);
 if(/^\d{1,5}$/.test(s))return r.json(ZKEYS.filter(z=>z.startsWith(s)).slice(0,8).map(z=>({label:z,value:z,type:'zip'})));
 const m=s.match(/^(.+?),\s*([a-z ]*)$/),name=(m?m[1]:s).trim(),st=m?(ST[m[2].trim()]||m[2].trim()):'';
 r.json(PKEYS.filter(p=>p.n.startsWith(name)&&(!st||p.k.slice(p.k.lastIndexOf(',')+2).startsWith(st))).sort((a,b)=>(b.n===name)-(a.n===name)).slice(0,8).map(p=>({label:title(p.k),value:title(p.k),type:'city'})))});
app.get('/api/reverse',(q,r)=>{const la=parseFloat(q.query.lat),ln=parseFloat(q.query.lng);if(!isFinite(la)||!isFinite(ln))return r.status(400).json({error:'lat,lng required'});const c=cityAt(la,ln);r.json({lat:la,lng:ln,label:c&&c.d<=Math.max(8,c.r*1.5)?'Your location (near '+ptitle(c.k)+')':'Your location'})});
app.get('/api/geocode',async(q,r)=>{const g=await geocode(q.query.q);g?r.json(g):r.status(404).json({error:'Could not find that US ZIP or city'})});
const GENERIC=d=>/^Participating/.test(d.address||'');
app.get('/api/deals',async(q,r)=>{const lat=parseFloat(q.query.lat),lng=parseFloat(q.query.lng),near=String(q.query.near||'').slice(0,60);let db=load();
 const fin=d=>({...pub(d),order:orderLinks(d.restaurant,near)}),ok=d=>d.verified===true&&d.price!=null;
 if(!(lat&&lng))return r.json({deals:db.filter(ok).filter(d=>!GENERIC(d)).map(fin)});
 const here=[lat,lng],s=await stores(lat,lng),failed=!!(s.error||s.loading),radius=s.radius||R1,rKm=radius/1000;
 const inRange=d=>d.lat!=null&&d.lng!=null&&km(here,[d.lat,d.lng])<=rKm;
 const local=db.filter(d=>!GENERIC(d)&&inRange(d));
 const nearSLC=km(here,SLC)<=15*MI/1000;
 const chainsHere=new Set([...local.map(d=>d.restaurant),...s.list.filter(inRange).map(x=>x.chain)]);
 const generic=failed||!nearSLC?[]:db.filter(d=>GENERIC(d)&&!chainsHere.has(d.restaurant));
 let nid=100000;const out=[],per={};
 s.list.filter(inRange).map(x=>({...x,d:km(here,[x.lat,x.lng])})).sort((a,b)=>a.d-b.d).forEach(st=>{
  if((per[st.chain]=(per[st.chain]||0)+1)>1)return; // nearest store per chain
  if(local.some(d=>d.restaurant===st.chain&&km([d.lat,d.lng],[st.lat,st.lng])<0.4))return; // hand-verified store wins
  const c=BYN[norm(st.chain)];const base={restaurant:c.name,address:st.address,lat:st.lat,lng:st.lng,cuisine:c.cuisine,store_url:st.osm,area:'national',checked:CAT.checked,source:'chain',national:true};
  c.deals.forEach(dl=>out.push({...base,id:nid++,deal:dl.deal,price:dl.price,items:dl.items,category:'combo',days:dl.days,verified:true,source_url:dl.url,strength:dl.strength,calories:dl.calories,calSource:dl.calSource,calNote:dl.calNote,note:'National price, participation may vary.'+(dl.note?' '+dl.note:'')+(dl.strength==='third-party'?' (Third-party source, not the chain itself.)':'')}))});
 MENU.startArea(lat,lng,LOCAL_R,MDEPS); // background, never awaited
 const menu=MENU.deals(lat,lng,LOCAL_R/1000).map(d=>({...d,order:[]}));
 const all=[...local,...generic,...out].filter(ok).map(fin).concat(menu);
 const msg=failed?'Still finding stores near you, refresh in a minute':null;
 r.json({deals:all,menus:MENU.status(lat,lng),stores:{count:s.list.length,radius_mi:Math.round(radius/MI),cached:!!s.cached,loading:failed,error:msg,message:msg,source:s.mirror||null}})});
app.get('/api/menus/status',(q,r)=>{const la=parseFloat(q.query.lat),ln=parseFloat(q.query.lng);if(!isFinite(la)||!isFinite(ln))return r.status(400).json({error:'lat,lng required'});r.json(MENU.status(la,ln))});
app.post('/api/menus/rescan',(q,r)=>{const b={...q.query,...(q.body||{})},la=parseFloat(b.lat),ln=parseFloat(b.lng);if(!isFinite(la)||!isFinite(ln))return r.status(400).json({error:'lat,lng required'});const o=MENU.rescan(la,ln,LOCAL_R,MDEPS);r.status(o.ok?202:429).json(o)});
app.get('/api/catalog',(q,r)=>r.json(CAT));
app.post('/api/deals',(q,r)=>{const b=q.body||{};const price=parseFloat(b.price);
 if(!b.restaurant||!b.deal||!(price>0)||!b.address)return r.status(400).json({error:'restaurant, deal, price, address required'});
 if(b.contact_email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.contact_email))return r.status(400).json({error:'invalid email'});
 const db=load();const d={id:Math.max(0,...db.map(x=>x.id))+1,restaurant:String(b.restaurant).slice(0,80),deal:String(b.deal).slice(0,200),price,items:Math.max(1,parseInt(b.items)||1),category:b.category||'daily',cuisine:(c=>c.length?c:['other'])([...new Set(String(b.cuisine||'').toLowerCase().split(/[,\s]+/).filter(c=>CU.includes(c)))].slice(0,3)),days:String(b.days||'').slice(0,80),address:String(b.address).slice(0,150),lat:parseFloat(b.lat)||null,lng:parseFloat(b.lng)||null,source:b.source==='restaurant'?'restaurant':'user',verified:false,submitted:new Date().toISOString(),note:b.source==='restaurant'?'Restaurant-posted, not yet reviewed':'Community submission, not yet reviewed'};
 if(b.contact_email)d.contact_email=String(b.contact_email).slice(0,120);if(b.owner)d.owner_confirmed=true;
 db.push(d);fs.writeFileSync(DB,JSON.stringify(db,null,1));const{contact_email,...pub}=d;r.status(201).json(pub);});
app.set('trust proxy',1);app.listen(process.env.PORT||3000,()=>console.log('MealDeal on :'+(process.env.PORT||3000)));
