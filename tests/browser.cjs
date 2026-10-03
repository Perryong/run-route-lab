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
 assert.equal(await page.locator('#health-sleep-score').textContent(),'82');
 assert.equal(await page.locator('#battery-chart').count(),1,'Body Battery timeline must be available');
 for(const kind of ['battery','hrv','respiration','movement']){
   await page.locator(`#expand-${kind}`).click();
   await page.locator('#chart-dialog-chart').focus();await page.keyboard.press('ArrowRight');
   assert.match(await page.locator('#chart-dialog-readout').textContent(),/(?:ms|brpm|level|\/100)/);
   await page.keyboard.press('Escape');
 }
 assert.equal(await page.locator('#distance-history button').count(),7);
 assert.equal(await page.locator('#rest-history button').count(),7);
 assert.equal(await page.locator('#sleep-donut circle[data-stage]').count(),4);

 assert.equal(await page.locator('#heart-chart .chart-axis-unit').textContent(),'bpm');
 assert.equal(await page.locator('#stress-chart .chart-axis-unit').textContent(),'level');
 assert.equal(await page.locator('#heart-chart .chart-y-tick').count(),4);
 assert.equal(await page.locator('#heart-chart .chart-time-tick').count(),5);
 assert.match(await page.locator('#heart-chart-summary').textContent(),/Average .* bpm/);
 await page.locator('#health-date').focus();
 await page.screenshot({path:'test-results/health-desktop.png',fullPage:true});
 await page.screenshot({path:'test-results/health-overview.png'});
 assert.ok(await page.locator('#heart-chart polyline').count()>0);
 assert.equal(await page.locator('#stress-chart polyline').count(),2);
 await page.locator('#expand-heart').click();assert.equal(await page.locator('#chart-dialog').isVisible(),true);assert.equal(await page.locator('#chart-dialog-title').textContent(),'Heart rate · selected day');assert.ok(await page.locator('#chart-dialog-chart polyline').count()>0);assert.equal(await page.locator('#chart-zoom-level').textContent(),'1×');assert.equal(await page.locator('#chart-detail-samples').textContent(),'24');assert.notEqual(await page.locator('#chart-detail-min').textContent(),'—');assert.notEqual(await page.locator('#chart-detail-average').textContent(),'—');assert.notEqual(await page.locator('#chart-detail-max').textContent(),'—');
 await page.locator('#chart-dialog-chart').focus();await page.keyboard.press('ArrowRight');const firstHeart=await page.locator('#chart-dialog-readout').textContent();assert.match(firstHeart,/bpm · (Below|Near|Above) daily average/);assert.equal(await page.locator('#chart-dialog-chart .chart-inspector').getAttribute('visibility'),'visible');await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#chart-dialog-readout').textContent(),firstHeart);
 await page.locator('#chart-zoom-in').click();assert.equal(await page.locator('#chart-zoom-level').textContent(),'1.5×');assert.equal(await page.locator('#chart-dialog-chart').evaluate(el=>el.style.width),'150%');await page.screenshot({path:'test-results/chart-dialog.png'});await page.locator('#chart-zoom-out').click();assert.equal(await page.locator('#chart-zoom-level').textContent(),'1×');
 await page.locator('#chart-zoom-in').click();await page.locator('#chart-zoom-reset').click();assert.equal(await page.locator('#chart-zoom-level').textContent(),'1×');await page.locator('#chart-dialog-close').click();assert.equal(await page.locator('#chart-dialog').isVisible(),false);
 await page.locator('#expand-stress').click();assert.equal(await page.locator('#chart-dialog-title').textContent(),'Stress · selected day');await page.locator('#chart-dialog-chart').focus();await page.keyboard.press('ArrowRight');assert.match(await page.locator('#chart-dialog-readout').textContent(),/stress · (Rest|Low|Medium|High)/);await page.keyboard.press('Escape');assert.equal(await page.locator('#chart-dialog').isVisible(),false);
 assert.ok(await page.locator('#sleep-stages rect').count()>0);
 assert.equal(await page.locator('#sleep-history .health-history-bar').count(),7);
 assert.equal(await page.locator('#stress-history .health-history-bar').count(),7);
 assert.equal(await page.locator('#health-table tr').count(),7);
 await page.locator('.health-bar').first().click();assert.equal(await page.locator('#health-steps').textContent(),'8,420');assert.equal(await page.locator('#health-sleep-score').textContent(),'86');
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
 // A controlled public dataset catches wrong Body Battery column, null-as-zero,
 // stale gauge state on date changes, and incorrect stage proportions.
 await page.route('**/data/health.json',route=>route.fulfill({json:{schema_version:1,days:[
  {date:'2026-09-30',sleep:{deep_s:0,light_s:0,rem_s:0,awake_s:0},stress:{}},
  {date:'2026-10-01',sleep:{deep_s:null,light_s:null,rem_s:null,awake_s:null},stress:{}},
  {date:'2026-10-02',steps:0,resting_hr_bpm:55,heart_rate:{samples:[[1790899200000,60]]},
   sleep:{deep_s:3600,light_s:7200,rem_s:3600,awake_s:0,movement:[[1790899200000,1790902800000,1],[1790902800000,1790906400000,3]],scores:{overall:{value:80}},hrv_samples:[[1790899200000,42]],respiration_samples:[[1790899200000,14.5]]},
   stress:{average_level:0,body_battery_samples:[[1790899200000,'MEASURED',76,1],[1790902800000,'MEASURED',63,1]]}}
 ]}}));
 await page.reload();await page.locator('#view-health').click();
 assert.equal(await page.locator('#gauge-battery-value').textContent(),'63');
 assert.equal(await page.locator('#gauge-stress-value').textContent(),'0');
 assert.match(await page.locator('#battery-chart-summary').textContent(),/63–76/);
 assert.match(await page.locator('#sleep-donut').getAttribute('aria-label'),/Deep 25%.*Light 50%.*REM 25%.*Awake 0%/);
 await page.locator('#expand-hrv').click();
 assert.equal(await page.locator('#chart-detail-average').textContent(),'42 ms');
 await page.keyboard.press('Escape');
 await page.locator('#expand-movement').click();
 const movementBox=await page.locator('#chart-dialog-chart').boundingBox();
 await page.mouse.move(movementBox.x+movementBox.width*260.625/640,movementBox.y+movementBox.height*.5);
 assert.match(await page.locator('#chart-dialog-readout').textContent(),/1 level/,'A movement bar must report its own interval, not the next interval');
 await page.keyboard.press('Escape');
 await page.locator('#health-date').selectOption('2026-10-01');
 assert.equal(await page.locator('#gauge-battery-value').textContent(),'—');
 assert.match(await page.locator('#sleep-donut').textContent(),/Unavailable/);
 assert.match(await page.locator('#health-sleep-total').textContent(),/—/);
 assert.equal(await page.locator('#battery-chart').getAttribute('tabindex'),null);
 await page.locator('#health-date').selectOption('2026-09-30');
 assert.match(await page.locator('#sleep-donut').getAttribute('aria-label'),/Deep 0h 00m/);
 assert.match(await page.locator('#battery-chart').textContent(),/No readings/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 await browser.close();server.close();console.log('Browser checks passed (timelines, gauges, donut, interval inspection, missing/zero readings, zoom, day selection, routes, and mobile).');
})().catch(e=>{console.error(e);process.exit(1)});
