// On-demand local menu scanning. Finds independent restaurants near a point (OSM Overpass),
// politely fetches their own websites (robots.txt, identifying UA, per-host rate limit,
// concurrency cap, timeouts), and extracts clearly priced meals. Never bypasses bot checks.
const fs=require('fs'),path=require('path');
const SITE=process.env.SITE_URL||'https://mealdeal-2dig.onrender.com';
const UA=`MealDealBot/1.0 (+${SITE}/restaurants)`;
const FILE=path.join(__dirname,'data','menus.json');
const DAY=864e5,REFRESH=7*DAY,MAX_AGE=60*DAY,AREA_TTL=7*DAY,RESCAN_COOLDOWN=30*60e3;
const CONC=4,HOST_GAP=2500,TIMEOUT=10000,MAX_HTML=1.5e6,MAX_PDF=4e6,MAX_PAGES=4,MAX_PER_AREA=40;
const MI=1609.34;
let pdfParse=null;try{pdfParse=require('pdf-parse/lib/pdf-parse.js')}catch(_){}
const km=(a,b)=>{const R=6371,r=x=>x*Math.PI/180,dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))};

// ---------- storage ----------
let S={restaurants:{},areas:{}};
try{S=JSON.parse(fs.readFileSync(FILE));S.restaurants||={};S.areas||={}}catch(_){}
let saveT=null;const save=()=>{if(saveT)return;saveT=setTimeout(()=>{saveT=null;fs.writeFile(FILE,JSON.stringify(S),()=>{})},1000)};
const saveNow=()=>fs.writeFileSync(FILE,JSON.stringify(S));
function seedPilot(){const f=path.join(__dirname,'data','local-pilot.json');if(!fs.existsSync(f))return;
 const P=require(f),coords={'New Canton City':[40.59893,-112.42541]}; // 822 E Main St, Grantsville (Nominatim)
 for(const r of P.restaurants){if(!/readable|partial/.test(r.price_status)||!r.meals?.length||/unreadable/.test(r.price_status))continue;
  const id='pilot:'+r.name.toLowerCase().replace(/[^a-z0-9]+/g,'-');if(S.restaurants[id])continue;
  const [lat,lng]=r.lat!=null?[r.lat,r.lng]:(coords[r.name]||[null,null]);if(lat==null)continue;
  const t=Date.parse(r.checked+'T12:00:00-06:00');
  S.restaurants[id]={id,name:r.name,lat,lng,address:r.address,website:r.website,cuisine:r.cuisine,checked:t,status:'ok',seed:true,
   items:r.meals.map((m,i)=>({key:i,name:m.item,price:m.price,qualifier:m.price_qualifier||null,special:(m.tags||[]).includes('combo')||/combo|special|family dinner/i.test(m.item),menu_url:r.menu_url,method:'manual-pilot',checked:t}))}}
 save()}
seedPilot();

// ---------- polite fetching ----------
const hostNext=new Map(),robots=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function hostWait(h){const now=Date.now(),t=Math.max(now,hostNext.get(h)||0);hostNext.set(h,t+HOST_GAP);if(t>now)await sleep(t-now)}
async function rawGet(u,max){const h=new URL(u).host;await hostWait(h);
 const r=await fetch(u,{headers:{'User-Agent':UA,'Accept':'text/html,application/pdf,application/xhtml+xml;q=0.9,*/*;q=0.5'},redirect:'follow',signal:AbortSignal.timeout(TIMEOUT)});
 const type=r.headers.get('content-type')||'',len=+r.headers.get('content-length')||0;
 if(len>max){r.body?.cancel?.();return{status:r.status,type,headers:r.headers,url:r.url,tooBig:true,buf:Buffer.alloc(0)}}
 const chunks=[];let n=0;for await(const c of r.body||[]){n+=c.length;if(n>max){break}chunks.push(c)}
 return{status:r.status,type,headers:r.headers,url:r.url,buf:Buffer.concat(chunks),tooBig:n>max}}
function parseRobots(txt){const groups=[];let cur=null,lastUA=false;
 for(let line of txt.split(/\r?\n/)){line=line.replace(/#.*/,'').trim();const m=line.match(/^([a-z-]+)\s*:\s*(.*)$/i);if(!m)continue;const k=m[1].toLowerCase(),v=m[2].trim();
  if(k==='user-agent'){if(!lastUA){cur={ua:[],rules:[]};groups.push(cur)}cur.ua.push(v.toLowerCase());lastUA=true}
  else{lastUA=false;if(cur&&(k==='allow'||k==='disallow'))cur.rules.push({allow:k==='allow',p:v})}}
 const g=groups.find(g=>g.ua.some(u=>u&&'mealdealbot'.startsWith(u)&&u!=='*'))||groups.find(g=>g.ua.includes('*'));return g?g.rules:[]}
function robotsOk(rules,p){let best=null;for(const r of rules){if(!r.p){continue}const re=new RegExp('^'+r.p.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$'));if(re.test(p)&&(!best||r.p.length>best.p.length||(r.p.length===best.p.length&&r.allow)))best=r}return!best||best.allow}
async function allowed(u){const x=new URL(u),o=x.origin;if(!robots.has(o)){robots.set(o,(async()=>{try{const r=await rawGet(o+'/robots.txt',2e5);if(r.status>=200&&r.status<300)return parseRobots(r.buf.toString('utf8'));if(r.status===401||r.status===403)return[{allow:false,p:'/'}];return[]}catch(_){return[]}})())}
 return robotsOk(await robots.get(o),x.pathname+x.search)}
const BOT=/captcha|cf-challenge|challenge-platform|just a moment\.\.\.|attention required|vercel security checkpoint|ddos-guard|are you a robot|verify you are human|px-captcha|incapsula|perimeterx/i;
async function get(u,max=MAX_HTML){if(!/^https?:/.test(u))throw{reason:'bad url'};if(!(await allowed(u)))throw{reason:'robots.txt disallows'};
 const r=await rawGet(u,max);const h=r.headers;
 const head=r.type.includes('pdf')?'':r.buf.slice(0,20000).toString('utf8');
 if(h.get('cf-mitigated')||h.get('x-vercel-mitigated')||r.status===429||BOT.test(head)&&([202,403,503].includes(r.status)||r.status===200&&head.length<15000))throw{reason:'bot check / blocked ('+r.status+')'};
 if(r.status>=400)throw{reason:'HTTP '+r.status};return r}

// ---------- extraction ----------
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:"'",lsquo:"'",ndash:'-',mdash:'-',hellip:'...'};
const decode=s=>s.replace(/&(#x?[0-9a-f]+|\w+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):+e.slice(1)):(ENT[e.toLowerCase()]??m));
function htmlText(h){return decode(h.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/?(p|div|li|tr|td|th|h[1-6]|section|article|ul|ol|table|dt|dd|header|footer|span class="price[^"]*")[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t\u00a0]+/g,' ').split('\n').map(s=>s.trim()).filter(Boolean)}
const DRINK=/\b(soda|pop|drink|drinks|beverage|coffee|latte|espresso|tea|juice|lemonade|milk ?shake|shake|smoothie|beer|wine|margarita|cocktail|water|horchata|coke|sprite|refill|boba)\b/i;
const SIDE=/\b(side|sides|extra|add|add-on|addon|fries|chips|salsa|sauce|dressing|toppings?|cheese only|rice only|beans only|tortillas?|egg roll|soup cup|cup of|single|a la carte|dessert|cookie|brownie|ice cream|kids?|child|children|appetizers?|starter|dip|bread ?sticks?|garlic bread|per (lb|oz|piece|item)|cheese plate|charcuterie|tartare|nigiri|sashimi|kushiyaki|skewers?|bacon[- ]wrapped|oysters?|ceviche|edamame|gyoza|wontons?|calamari|bruschetta|queso|guacamole|additional|charge|rolls?|boozy|mimosa|favorites|substitut\w*|upgrade|jr\.?|junior)\b/i;
const MEAL=/\b(plate|platter|combo|combination|dinner|lunch|entree|entrée|meal|special|burrito|burger|sandwich|sub|wrap|pasta|spaghetti|lasagna|pizza|steak|chicken|enchiladas?|tacos?|fajitas?|curry|bowl|pho|ramen|noodles?|fried rice|lo mein|chow mein|teriyaki|bbq|ribs|salmon|fish|shrimp|omelet|pancakes|breakfast|basket|dish|carbonara|alfredo|biryani|tikka|pad thai|kabob|gyro|quesadilla|chimichanga|tamales?)\b/i;
const SPECIAL=/\b(special|combo|combination|deal|family (meal|dinner|pack)|value|lunch special|happy hour|bundle)\b/i;
const PRICE=/\$\s?(\d{1,3}(?:\.\d{2})?)\b|(?:^|\s)(\d{1,3}\.\d{2})(?=\s|$)/;
function cleanName(s){return s.replace(PRICE,'').replace(/[.\u2026_]{3,}/g,' ').replace(/^[\s\-–•*|:#]+|[\s\-–•*|:]+$/g,'').replace(/\s+/g,' ').trim()}
const nameOk=n=>n.length>=3&&n.length<=70&&/[a-z]{3}/i.test(n)&&!/^(price|prices|menu|order|call|tax|tip|total|from|starting|each|add|or)\b/i.test(n)&&(n.match(/\d/g)||[]).length<=4&&!/https?:|@|\b(am|pm)\b.*\d|\d.*\b(am|pm)\b|copyright|©|phone|\(\d{3}\)/i.test(n);
const SIDEHDR=/^(sides?|side orders?|extras?|add[- ]?ons?|drinks?|beverages?|desserts?|sweets|kids?|kids? menu|children'?s menu|appetizers?|starters?|a la carte|sauces?|toppings?|soups?( (&|and) salads?)?|shakes|coffee|tea|boba|bar|wine|beer|cocktails)$/i;
const strip=s=>cleanName(s.replace(/^\s*(from|starting at|starts at)\b/i,''));
function textItems(lines,method){const out=[];let skip=false;
 for(let i=0;i<lines.length;i++){const l=lines[i];if(l.length>140)continue;const m=l.match(PRICE);
  if(!m){const h=l.replace(/[:*]/g,'').trim();if(SIDEHDR.test(h))skip=true;else if(h.length<=30&&!/[,.]$/.test(h)&&(!PRICE.test(lines[i+1]||'')||h===h.toUpperCase()&&/[A-Z]{3}/.test(h)))skip=false;continue}
  if(skip)continue;const p=parseFloat(m[1]||m[2]);let name=strip(l);
  if(!name){for(const j of[i-1,i-2]){if(j<0||PRICE.test(lines[j]))break;const c=strip(lines[j]);if(nameOk(c)&&c.length<=50&&!/,/.test(c)){name=c;break}}}
  if(!nameOk(name))continue;if((l.match(/\$\s?\d/g)||[]).length>1)continue; // several prices on one line (sizes, old/new) are ambiguous
  out.push({name,price:p,qualifier:/\b(from|starting|starts at)\b/i.test(l)?'from':null,method})}return out}
function ldItems(html){const out=[];const re=/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;let m;
 const walk=(o,inMenu)=>{if(!o||typeof o!=='object')return;if(Array.isArray(o))return o.forEach(x=>walk(x,inMenu));const t=[].concat(o['@type']||[]).join(' ');
  if(/MenuItem/.test(t)&&o.name){const off=[].concat(o.offers||[])[0]||{};const p=parseFloat(off.price??off.lowPrice);if(p>0)out.push({name:decode(String(o.name)).trim(),price:p,qualifier:off.lowPrice&&!off.price?'from':null,method:'json-ld'})}
  for(const k of Object.keys(o))if(typeof o[k]==='object')walk(o[k],inMenu||/Menu/.test(t))};
 while((m=re.exec(html))){try{walk(JSON.parse(m[1].trim()))}catch(_){}}return out}
function menuLinks(html,base){const out=new Set();const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
 while((m=re.exec(html))){const href=m[1],txt=m[2].replace(/<[^>]+>/g,' ');if(!/menu/i.test(href+' '+txt)||/^(mailto|tel|javascript):/i.test(href))continue;try{const u=new URL(decode(href),base);if(/^https?:$/.test(u.protocol))out.add(u.href)}catch(_){}}
 return[...out]}
const sameSite=(a,b)=>{const h=u=>new URL(u).hostname.replace(/^www\./,'');try{return h(a)===h(b)}catch(_){return false}};
function classify(items){const seen=new Set(),ok=[];
 for(const it of items){const k=it.name.toLowerCase()+'|'+it.price;if(seen.has(k))continue;seen.add(k);
  if(!(it.price>=(SPECIAL.test(it.name)?5:7)&&it.price<=60)||!/^["'(]?[a-z0-9]/i.test(it.name))continue;if(DRINK.test(it.name)&&!MEAL.test(it.name))continue;
  const special=SPECIAL.test(it.name),meal=MEAL.test(it.name);if(SIDE.test(it.name)&&!special||/\b(kids?|child|children)\b|fruit (plate|cup)/i.test(it.name))continue;
  if(!meal&&!special&&it.price<8)continue;if(!meal&&!special)continue; // conservative: must read like a meal
  ok.push({...it,special})}
 const meals=ok.filter(x=>!x.special).sort((a,b)=>a.price-b.price).slice(0,3),sp=ok.filter(x=>x.special).sort((a,b)=>a.price-b.price).slice(0,3);return[...meals,...sp]}

async function scanRestaurant(r){const tried=[],start=r.menu||r.website;let found=[],menuUrl=null,reason=null;
 try{const home=await get(start);tried.push(start);let cands=[];
  const doPage=async(res,u)=>{if(res.type.includes('pdf')||/\.pdf($|\?)/i.test(u)){if(!pdfParse)return[];if(res.tooBig)return[];const d=await pdfParse(res.buf,{max:12});return textItems(d.text.split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean),'pdf-text')}
   const h=res.buf.toString('utf8');const ld=ldItems(h);if(ld.length)return ld;return textItems(htmlText(h),'html-text')};
  if(!home.type.includes('pdf')){const h=home.buf.toString('utf8');cands=menuLinks(h,home.url).filter(u=>(sameSite(u,home.url)||/\.pdf($|\?)/i.test(u))&&!/[?&]location/i.test(u));
   const homeItems=await doPage(home,home.url);if(classify(homeItems).length){found=homeItems;menuUrl=home.url}}
  else{found=await doPage(home,home.url);menuUrl=home.url}
  const o=new URL(home.url).origin;for(const p of['/menu','/menus','/our-menu','/food-menu'])cands.push(o+p);
  cands=[...new Set(cands)].filter(u=>u!==home.url&&!tried.includes(u)).sort((a,b)=>(/\.pdf/i.test(b)-/\.pdf/i.test(a))||(/menu/i.test(new URL(b).pathname)-/menu/i.test(new URL(a).pathname)));
  let pages=0;for(const u of cands){if(classify(found).length>=3||pages>=MAX_PAGES)break;pages++;
   try{const res=await get(u,/\.pdf/i.test(u)?MAX_PDF:MAX_HTML);const it=await doPage(res,res.url);if(classify(it).length>classify(found).length){found=it;menuUrl=res.url}}catch(e){if(e&&e.reason&&/bot/.test(e.reason))reason=e.reason}}
 }catch(e){reason=(e&&e.reason)||(e&&e.name==='TimeoutError'?'timeout':String(e&&e.message||e).slice(0,80))}
 const now=Date.now(),items=classify(found).map((x,i)=>({key:i,...x,menu_url:menuUrl,checked:now}));
 return{status:items.length?'ok':reason?'skipped':'no-prices',reason:items.length?null:(reason||(found.length?'prices found but none read clearly as full meals':'no readable prices (menu may load with JavaScript or be an image)')),items,menu_url:menuUrl,checked:now}}

// ---------- discovery ----------
async function discover(lat,lng,m,overpassPost,isChain){const q=`[out:json][timeout:25];nwr["amenity"~"^(restaurant|fast_food|cafe)$"][!"brand"][!"brand:wikidata"](around:${m},${lat},${lng});out center tags;`;
 let els=null;for(let i=0;i<3&&!els;i++){if(i)await sleep(20e3*i);els=await overpassPost(q)}if(!els)return null;
 return els.map(e=>{const g=e.tags||{},la=e.lat??e.center?.lat,ln=e.lon??e.center?.lon;const site=g.website||g['contact:website'];const menu=g['website:menu']||(/^http/.test(g.menu||'')?g.menu:null);
  if(!g.name||la==null||isChain(g.name)||!(site||menu))return null;const fix=u=>u&&(/^https?:/i.test(u)?u:'https://'+u);
  return{id:e.type+'/'+e.id,name:g.name,lat:la,lng:ln,website:fix(site)||fix(menu),menu:fix(menu),cuisine:(g.cuisine||'').split(/[;,]/).map(s=>s.trim()).filter(Boolean).slice(0,3),
   address:[[g['addr:housenumber'],g['addr:street']].filter(Boolean).join(' '),g['addr:city']].filter(Boolean).join(', ')}}).filter(Boolean)}

// ---------- area jobs ----------
const JOBS=new Map(),LASTERR=new Map();let active=0;const queue=[];
const slot=()=>new Promise(ok=>{if(active<CONC){active++;ok()}else queue.push(ok)});
const release=()=>{const n=queue.shift();if(n)n();else active--};
// an area is any earlier scan center within 3 km, so "84074", "Tooele" and GPS in town share one scan
const akey=(lat,lng)=>{for(const k of new Set([...JOBS.keys(),...Object.keys(S.areas)])){const[a,b]=k.split('_').map(Number);if(km([lat,lng],[a,b])<3)return k}return lat.toFixed(2)+'_'+lng.toFixed(2)};
function startArea(lat,lng,radius,deps,force){const k=akey(lat,lng),A=S.areas[k];
 if(JOBS.has(k))return JOBS.get(k);if(!force&&Date.now()-(LASTERR.get(k)||0)<3*60e3)return null;if(A&&!force&&Date.now()-A.t<AREA_TTL&&A.status==='done')return null;
 const job={status:'finding',total:0,done:0,started:Date.now()};JOBS.set(k,job);
 (async()=>{try{const list=await discover(lat,lng,radius,deps.overpassPost,deps.isChain);if(!list){job.status='error';LASTERR.set(k,Date.now());return}
  const here=[lat,lng],near=list.map(r=>({...r,d:km(here,[r.lat,r.lng])})).sort((a,b)=>a.d-b.d).slice(0,MAX_PER_AREA);
  job.status='scanning';job.total=near.length;
  await Promise.all(near.map(async r=>{const prev=S.restaurants[r.id];if(prev&&!force&&Date.now()-prev.checked<REFRESH&&prev.status!=='error'){job.done++;return}
   await slot();try{const res=await scanRestaurant(r);const hidden=new Set((prev?.items||[]).filter(i=>i.hidden).map(i=>i.name+'|'+i.price));res.items.forEach(i=>{if(hidden.has(i.name+'|'+i.price))i.hidden=true});
    S.restaurants[r.id]={...r,d:undefined,...res};save()}catch(e){S.restaurants[r.id]={...r,d:undefined,status:'error',reason:String(e).slice(0,80),items:[],checked:Date.now()}}finally{release();job.done++}}));
  S.areas[k]={t:Date.now(),lat,lng,radius,status:'done',ids:near.map(r=>r.id),lastScan:Date.now()};save();job.status='done'}
 catch(e){job.status='error'}finally{setTimeout(()=>JOBS.delete(k),5000).unref?.()}})();return job}
function status(lat,lng){const k=akey(lat,lng),j=JOBS.get(k),A=S.areas[k];
 if(j)return{status:j.status==='done'?'done':j.status,total:j.total,done:j.done,scanning:j.status!=='done'&&j.status!=='error'};
 if(!A&&LASTERR.has(k))return{status:'error',scanning:false};
 return A?{status:'done',total:A.ids.length,done:A.ids.length,scanned:new Date(A.t).toISOString(),scanning:false,rescan_after:new Date(A.lastScan+RESCAN_COOLDOWN).toISOString()}:{status:'none',scanning:false}}
function rescan(lat,lng,radius,deps){const k=akey(lat,lng),A=S.areas[k];if(JOBS.has(k))return{ok:true,already:true};
 if(A&&Date.now()-(A.lastScan||0)<RESCAN_COOLDOWN)return{ok:false,wait_min:Math.ceil((A.lastScan+RESCAN_COOLDOWN-Date.now())/60e3)};
 startArea(lat,lng,radius,deps,true);return{ok:true}}
// menu-checked deals within rKm of a point (visible only: not hidden, <60 days old)
function deals(lat,lng,rKm){const out=[],now=Date.now();
 const nn=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8),all=Object.values(S.restaurants).filter(r=>r.items?.length&&km([lat,lng],[r.lat,r.lng])<=rKm);
 for(const r of all){if(r.seed&&all.some(o=>!o.seed&&nn(o.name)===nn(r.name)&&km([o.lat,o.lng],[r.lat,r.lng])<1.5))continue; // fresh scan supersedes the pilot seed
  for(const it of r.items){if(it.hidden||now-it.checked>MAX_AGE)continue;
   out.push({id:'m:'+r.id+':'+it.key,restaurant:r.name,deal:it.name+(it.qualifier==='from'?' (starting price)':''),price:it.price,items:1,category:it.special?'combo':'menu',cuisine:mapCu(r.cuisine,it.name),address:r.address||'',lat:r.lat,lng:r.lng,
    verified:true,tier:'menu',source:'menu',menu_url:it.menu_url,source_url:it.menu_url,checked:new Date(it.checked).toLocaleDateString('en-CA',{timeZone:'America/Denver'}),method:it.method,special:!!it.special,note:'Price read from the restaurant\'s own online menu, not confirmed by the restaurant. Prices can change.'})}}
 return out}
const CUMAP={mexican:'mexican',tex_mex:'mexican',burger:'burger',chicken:'chicken',pizza:'pizza',italian:'other',chinese:'asian',thai:'asian',japanese:'asian',sushi:'asian',vietnamese:'asian',asian:'asian',indian:'other',breakfast:'breakfast',coffee_shop:'breakfast',sandwich:'sandwich',salad:'healthy',dessert:'dessert',ice_cream:'dessert'};
function mapCu(c,name){const s=new Set((c||[]).map(x=>CUMAP[String(x).toLowerCase()]).filter(Boolean));if(/taco|burrito|enchilada/i.test(name))s.add('mexican');if(/burger/i.test(name))s.add('burger');if(/pizza/i.test(name))s.add('pizza');if(/pasta|spaghetti|carbonara/i.test(name))s.add('other');return s.size?[...s].slice(0,3):['other']}
// admin
function adminList(){return Object.values(S.restaurants).filter(r=>r.items?.length||r.reason).sort((a,b)=>(b.items?.length?1:0)-(a.items?.length?1:0)||b.checked-a.checked).map(r=>({id:r.id,name:r.name,address:r.address,website:r.website,status:r.status,reason:r.reason,checked:new Date(r.checked).toISOString(),
 items:(r.items||[]).map(i=>({...i,stale:Date.now()-i.checked>MAX_AGE}))}))}
function setHidden(id,key,hidden){const r=S.restaurants[id];if(!r)return false;const it=r.items.find(i=>String(i.key)===String(key));if(!it)return false;it.hidden=!!hidden;saveNow();return true}
module.exports={startArea,status,rescan,deals,adminList,setHidden,UA,_test:{textItems,htmlText,ldItems,classify,parseRobots,robotsOk,scanRestaurant}};
