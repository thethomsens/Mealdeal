const p=require('puppeteer-core');(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const g=await b.newPage();
const B='http://localhost:3999';
for(const [vw,file] of [[1280,'light-mode.png'],[375,'light-mode-mobile.png']]){await g.setViewport({width:vw,height:1100,deviceScaleFactor:vw<500?2:1});
await g.goto(B);await g.waitForSelector('#list li');
for(const q of ['84074','Salt Lake City, UT']){await g.$eval('#zip',e=>e.value='');await g.type('#zip',q);await g.$eval('#acl',e=>e.hidden=true);await g.click('#go');await new Promise(r=>setTimeout(r,12000));
await g.$eval('#m-light',e=>e.click());await new Promise(r=>setTimeout(r,400));
console.log(vw,q,await g.$eval('#locmsg',e=>e.innerText),JSON.stringify(await g.$$eval('#list li',l=>l.slice(0,5).map(x=>x.innerText.replace(/\n/g,' | ').slice(0,170)))));
const ov=await g.$eval('.modes',e=>e.scrollWidth>e.clientWidth||[...e.children].some(c=>c.scrollWidth>c.clientWidth));console.log('overflow',ov);
if(q==='84074')await g.screenshot({path:'screenshots/'+file});}}
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
