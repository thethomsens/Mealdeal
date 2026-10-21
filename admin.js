// MealDeal moderation (/admin). Disabled entirely unless ADMIN_KEY is set.
const crypto=require('crypto'),fs=require('fs'),path=require('path');
module.exports=function(app,{DB,load,CU,MENU}){
 const KEY=process.env.ADMIN_KEY||'';const ON=KEY.length>0;
 const save=db=>fs.writeFileSync(DB,JSON.stringify(db,null,1));
 const h=s=>crypto.createHash('sha256').update(String(s)).digest();
 const keyOk=k=>ON&&typeof k==='string'&&crypto.timingSafeEqual(h(k),h(KEY));
 const sessions=new Map(),TTL=8*3600e3;
 const cookie=q=>{const m=/(?:^|;\s*)md_admin=([a-f0-9]{64})/.exec(q.headers.cookie||'');return m&&m[1]};
 const authed=q=>{if(keyOk(q.get('x-admin-key')))return true;const t=cookie(q),s=t&&sessions.get(t);if(s&&s>Date.now())return true;if(t)sessions.delete(t);return false};
 // rate limit: 5 failed logins per IP per 15 min
 const fails=new Map(),WIN=15*60e3,MAX=5;
 const limited=ip=>{const f=fails.get(ip);if(!f||f.reset<Date.now()){fails.delete(ip);return false}return f.n>=MAX};
 const fail=ip=>{const f=fails.get(ip);if(!f||f.reset<Date.now())fails.set(ip,{n:1,reset:Date.now()+WIN});else f.n++};
 const OFF='Admin is disabled: set the ADMIN_KEY environment variable on the server to enable it.';
 app.get('/admin',(q,r)=>{if(!ON)return r.status(503).type('text').send(OFF);r.set('Cache-Control','no-store').sendFile(path.join(__dirname,'admin','admin.html'))});
 app.use('/api/admin',(q,r,n)=>{r.set('Cache-Control','no-store');if(!ON)return r.status(503).json({error:OFF});n()});
 app.post('/api/admin/login',(q,r)=>{const ip=q.ip;if(limited(ip))return r.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
  if(!keyOk((q.body||{}).key)){fail(ip);return r.status(401).json({error:'Wrong password'})}
  fails.delete(ip);const t=crypto.randomBytes(32).toString('hex');sessions.set(t,Date.now()+TTL);
  r.cookie('md_admin',t,{httpOnly:true,sameSite:'strict',secure:q.secure,maxAge:TTL,path:'/'}).json({ok:true})});
 app.post('/api/admin/logout',(q,r)=>{const t=cookie(q);if(t)sessions.delete(t);r.clearCookie('md_admin',{path:'/'}).json({ok:true})});
 app.use('/api/admin',(q,r,n)=>authed(q)?n():r.status(401).json({error:'Not signed in'}));
 app.get('/api/admin/me',(q,r)=>r.json({ok:true}));
 app.get('/api/admin/items',(q,r)=>{const db=load(),by=(a,b)=>String(b.submitted||b.checked||'').localeCompare(String(a.submitted||a.checked||''))||b.id-a.id;
  r.json({pending:db.filter(d=>d.verified!==true&&d.submitted&&d.status!=='rejected').sort(by),approved:db.filter(d=>d.verified===true).sort((a,b)=>String(b.checked||'').localeCompare(String(a.checked||''))||b.id-a.id),cuisines:CU})});
 const clean=(b,d)=>{const e={};
  if(b.price!==undefined){const p=parseFloat(b.price);if(!(p>0))throw'price must be > 0';e.price=Math.round(p*100)/100}
  if(b.items!==undefined)e.items=Math.max(1,parseInt(b.items)||1);
  if(b.cuisine!==undefined){const c=[...new Set((Array.isArray(b.cuisine)?b.cuisine:String(b.cuisine).split(/[,\s]+/)).map(x=>String(x).toLowerCase()).filter(x=>CU.includes(x)))].slice(0,3);e.cuisine=c.length?c:['other']}
  for(const[k,n]of[['restaurant',80],['deal',200],['address',150],['days',80],['note',300]])if(b[k]!==undefined){e[k]=String(b[k]).slice(0,n).trim();if(['restaurant','deal','address'].includes(k)&&!e[k])throw k+' required'}
  if(b.source_url!==undefined){const u=String(b.source_url).trim();if(u&&!/^https?:\/\/\S+$/i.test(u))throw'source URL must start with http(s)://';e.source_url=u||null}
  if(b.lat!==undefined)e.lat=parseFloat(b.lat)||null;if(b.lng!==undefined)e.lng=parseFloat(b.lng)||null;return e};
 const act=fn=>(q,r)=>{const db=load(),i=db.findIndex(d=>d.id===+q.params.id);if(i<0)return r.status(404).json({error:'Not found'});
  try{const out=fn(db,i,q.body||{});save(db);r.json(out||db[i])}catch(e){r.status(400).json({error:String(e)})}};
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Denver'});
 app.post('/api/admin/items/:id/approve',act((db,i,b)=>{const d=db[i];Object.assign(d,clean(b,d));if(!(d.price>0))throw'price required';
  Object.assign(d,{verified:true,checked:today(),verified_by:'admin',status:'approved'});delete d.rejected_at;
  if(/not yet reviewed/.test(d.note||''))d.note=d.source==='restaurant'?'Restaurant-posted, verified by MealDeal':'Community submission, verified by MealDeal'}));
 app.post('/api/admin/items/:id/edit',act((db,i,b)=>{Object.assign(db[i],clean(b,db[i]))}));
 app.post('/api/admin/items/:id/reject',act((db,i)=>{const d=db.splice(i,1)[0];return{removed:d.id}}));
 app.post('/api/admin/items/:id/unverify',act((db,i)=>{const d=db[i];d.verified=false;d.status='pending';delete d.verified_by;if(!d.submitted)d.submitted=new Date().toISOString()}));
 // auto-checked menu prices: list, unverify (hide) or restore
 app.get('/api/admin/menus',(q,r)=>r.json(MENU?MENU.adminList():[]));
 app.post('/api/admin/menus/hide',(q,r)=>{const b=q.body||{};MENU&&MENU.setHidden(String(b.id),b.key,b.hidden!==false)?r.json({ok:true}):r.status(404).json({error:'Not found'})});
};
