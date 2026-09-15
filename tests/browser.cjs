const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
 const root=path.resolve('site');
 const server=http.createServer((req,res)=>{
   const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
   if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
   try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,proxy:process.env.BROWSER_PROXY?{server:process.env.BROWSER_PROXY,bypass:'127.0.0.1,localhost'}:undefined});
 const page=await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
 // Keep repeated automated tests off community tile servers. Routes still render.
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/*.json',async route=>{await new Promise(resolve=>setTimeout(resolve,800));await route.continue();});
 await page.goto(process.env.TEST_URL||`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
 await page.locator('#demo').click();
 await page.waitForTimeout(1000);
 await page.unroute('**/data/*.json');
 await page.locator('.run-item').first().waitFor({timeout:4000});
 assert.equal(await page.locator('.run-item').count(),6);
 assert.equal(await page.locator('#demo-note').isVisible(),true);
 await page.locator('#view-health').click();
 assert.equal(await page.locator('#health-panel').isVisible(),true);
 assert.equal(await page.locator('#health-steps').textContent(),'7,340');
 assert.equal(await page.locator('#health-table tr').count(),7);
 await page.locator('.health-bar').first().click();assert.equal(await page.locator('#health-steps').textContent(),'8,420');
 await page.locator('#view-health').click();
 await page.locator('#play').click();await page.waitForTimeout(500);
 assert.notEqual(await page.locator('#percent').textContent(),'0%');
 await page.locator('#play').click();
 await page.locator('#search').fill('Marina');assert.equal(await page.locator('.run-item').count(),1);
 await page.locator('#search').fill('no matching run');assert.equal(await page.locator('.run-item').count(),0);
 assert.equal(await page.locator('#detail').isVisible(),false);
 await page.locator('#reset').click();assert.equal(await page.locator('.run-item').count(),6);
 await page.locator('#from').fill('2099-01-01');assert.equal(await page.locator('.run-item').count(),0);await page.locator('#reset').click();
 await page.locator('.run-item').nth(1).click();assert.equal(await page.locator('#run-title').textContent(),'East Coast morning');await page.locator('.run-item').first().click();
 await page.locator('#overview').click();
 await page.waitForTimeout(1500);
 await page.screenshot({path:'test-results/desktop.png',fullPage:true});
 await page.locator('#help').click();assert.equal(await page.locator('#setup').isVisible(),true);await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#view-health').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'test-results/health-mobile.png',fullPage:true});
 await page.locator('#view-health').click();
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
 await page.locator('#demo').click();assert.equal(await page.locator('#empty').isVisible(),true);
 assert.deepEqual(errors,[]);
 await browser.close();server.close();console.log('Browser checks passed (including health cards, history, day selection, mobile): demo, playback, filters, reset, overview, setup, mobile, empty state.');
})().catch(e=>{console.error(e);process.exit(1)});
