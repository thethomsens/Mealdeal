const p=require('puppeteer-core');(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const g=await b.newPage();await g.setViewport({width:400,height:900,deviceScaleFactor:2});
const B='http://localhost:3100';
await g.goto(B);await g.waitForSelector('#list li');
const search=async q=>{await g.$eval('#zip',e=>e.value='');await g.type('#zip',q);await g.click('#go');await new Promise(r=>setTimeout(r,3500))};
await search('Grantsville, UT');await g.waitForFunction(()=>/Checking|Finding local/.test(document.querySelector('#menumsg').innerText),{timeout:20000}).catch(()=>{});
console.log('grantsville:',await g.$eval('#menumsg',e=>e.innerText));await g.screenshot({path:'screenshots/local-scan-checking.png'});
await search('Tooele, UT');await g.waitForFunction(()=>document.querySelectorAll('.tag.menu').length>0,{timeout:30000});
console.log('tooele:',await g.$eval('#menumsg',e=>e.innerText),await g.$$eval('.tag.menu',l=>l.length));
await g.$eval('#m-value',e=>e.click());
const el=await g.$$('#list li');let idx=await g.$$eval('#list li',l=>l.findIndex(x=>x.querySelector('.tag.menu')));
await g.$eval('#m-crave',e=>e.click());await g.type('#crave','pork chop pasta');await g.$eval('#acl',e=>e.hidden=true);await new Promise(r=>setTimeout(r,500));await g.setViewport({width:400,height:1500,deviceScaleFactor:2});await g.evaluate(()=>window.scrollTo(0,0));await g.screenshot({path:'screenshots/local-scan.png'});await g.setViewport({width:400,height:900,deviceScaleFactor:2});
console.log(await g.$$eval('#list li',l=>l.filter(x=>x.querySelector('.tag.menu')).map(x=>x.innerText.replace(/\n/g,' | ')).slice(0,4)));
// admin
await g.goto(B+'/admin');await g.waitForSelector('#login input');await g.type('#login input','testkey123');await g.click('#login button');await g.waitForSelector('#tm');await new Promise(r=>setTimeout(r,800));await g.click('#tm');await new Promise(r=>setTimeout(r,500));await g.screenshot({path:'screenshots/admin-menus.png'});
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
