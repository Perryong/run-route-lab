import {pace,duration,filterRuns,weeks} from './model.js';
import {demoRuns} from './demo.js';
const $=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};
let actual=[],all=[],filtered=[],selected=null,demo=false,playing=false,frame=0,replay=0,speed=1,lastTime=0,edges=[],totalLength=0;
let map,layer,marker,overview=false,actualHealth=[],healthDay='';
let chartZoom=1;
const colours=['#e77343','#548376','#788b4e','#ad8263','#818fb0','#bb9963'];
function initialiseMap(){
 if(!window.L){$('tile-notice').hidden=false;$('tile-notice').textContent='Map library could not load. Reload the page.';return;}
 map=L.map('map',{zoomControl:false,scrollWheelZoom:true}).setView([1.302,103.86],13);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19
 }).addTo(map);
 tiles.on('tileerror',()=>{$('tile-notice').hidden=false;});
 tiles.on('tileload',()=>{$('tile-notice').hidden=true;});
 L.control.zoom({position:'topright'}).addTo(map);layer=L.featureGroup().addTo(map);
 map.on('resize',()=>{if(selected)drawMap(false);});
}
function setText(id,text){$(id).textContent=text;}
function shortDate(date){return date?new Date(date+'T12:00:00Z').toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Undated';}
function summary(){
 const metres=filtered.reduce((s,a)=>s+(a.distance_m||0),0),seconds=filtered.reduce((s,a)=>s+(a.duration_s||0),0);
 $('total-distance').replaceChildren(document.createTextNode((metres/1000).toFixed(1)+' '));const unit=document.createElement('small');unit.textContent='km';$('total-distance').append(unit);
 setText('total-runs',filtered.length);setText('total-time',seconds?duration(seconds):'—');
 setText('result-count',`${filtered.length} run${filtered.length===1?'':'s'}`);
 $('weekly').replaceChildren();
 const buckets=weeks(filtered),max=Math.max(...buckets.map(b=>b.km),1);
 for(const b of buckets){const bar=document.createElement('div');bar.className='week';bar.style.height=`${Math.max(4,b.km/max*100)}%`;bar.title=`Week of ${b.date}: ${b.km.toFixed(1)} km`;bar.setAttribute('role','img');bar.setAttribute('aria-label',bar.title);$('weekly').append(bar);}
}
function thumb(a,index){
 const el=svg('svg',{viewBox:'0 0 50 50','aria-hidden':'true',class:'route-thumb'});
 const pts=a.segments.flat();if(pts.length<2)return el;
 const lat=pts.map(p=>p[0]),lon=pts.map(p=>p[1]);const minX=Math.min(...lon),minY=Math.min(...lat),scale=38/Math.max(Math.max(...lon)-minX,Math.max(...lat)-minY,.00001);
 for(const seg of a.segments)el.append(svg('polyline',{points:seg.map(p=>`${6+(p[1]-minX)*scale},${44-(p[0]-minY)*scale}`).join(' '),fill:'none',stroke:colours[index%colours.length],'stroke-width':2.4,'stroke-linecap':'round','stroke-linejoin':'round'}));return el;
}
function renderList(){
 $('run-list').replaceChildren();
 if(!filtered.length){const p=document.createElement('p');p.className='list-empty';p.textContent=all.length?'No runs match these filters. Try another date or reset your search.':'Your journal is waiting. Import a run or explore the demo to get started.';$('run-list').append(p);}
 filtered.forEach((a,i)=>{
 const button=document.createElement('button');button.className='run-item'+(selected?.id===a.id?' selected':'');button.setAttribute('aria-pressed',String(selected?.id===a.id));button.append(thumb(a,i));
 const label=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=a.name;sub.textContent=`${shortDate(a.date)} · ${pace(a.distance_m,a.duration_s)} /km`;label.append(title,sub);button.append(label);
 const dist=document.createElement('span');dist.className='distance';dist.textContent=a.distance_m==null?'—':(a.distance_m/1000).toFixed(1);const km=document.createElement('small');km.textContent='KM';dist.append(km);button.append(dist);
 button.onclick=()=>{overview=false;select(a);};$('run-list').append(button);
 });
}
function applyFilters(){
 filtered=filterRuns(all,{query:$('search').value,from:$('from').value,to:$('to').value});
 filtered.sort($('sort').value==='distance'?(a,b)=>(b.distance_m||0)-(a.distance_m||0):(a,b)=>(b.date||'').localeCompare(a.date||''));
 summary();overview=false;select(filtered.find(a=>a.id===selected?.id)||filtered[0]||null);
 $('empty').hidden=all.length>0;
}
function select(a){
 stop();replay=0;selected=a;renderList();$('detail').hidden=!a;
 if(!a){drawMap();return;}
 setText('run-title',a.name);setText('run-date',shortDate(a.date).toUpperCase()+' / SELECTED RUN');
 setText('run-distance',a.distance_m==null?'—':(a.distance_m/1000).toFixed(2)+' km');
 setText('run-duration',duration(a.duration_s));setText('run-pace',pace(a.distance_m,a.duration_s)+' /km');setText('run-gain',a.elevation_gain_m==null?'—':Math.round(a.elevation_gain_m)+' m');
 setText('run-heart',`Run heart rate · average ${a.average_hr_bpm??'—'} bpm · maximum ${a.max_hr_bpm??'—'} bpm`);
 setText('privacy-note',demo?'Illustrative route and metrics. Replay is accelerated, not real-time.':`${a.route_trimmed?`Endpoint areas hidden (${a.trim_m} m). `:''}Statistics describe the full run. Replay follows the visible GPS path.`);
 const visible=a.segments.flat();setText('map-subtitle',visible.length?'Select, zoom, and retrace your route':'No visible GPS route for this activity');
 drawProfile(a);drawMap();prepareReplay(a);updateReplay();
}
function drawProfile(a){
 const chart=$('elevation');chart.replaceChildren();
 const pts=a.segments.flat(),heights=pts.filter(p=>p[2]!=null).map(p=>p[2]);
 if(heights.length<2){const text=svg('text',{x:0,y:36,fill:'#899b8b','font-size':11});text.textContent='Elevation not recorded';chart.append(text);setText('elevation-label','');return;}
 const min=Math.min(...heights),max=Math.max(...heights);setText('elevation-label',`${Math.round(min)}–${Math.round(max)} M`);
 for(let y=15;y<65;y+=20)chart.append(svg('line',{x1:0,x2:320,y1:y,y2:y,stroke:'#edf0e6','stroke-width':1}));
 let i=0;
 for(const seg of a.segments){let line=[];const flush=()=>{if(line.length>1)chart.append(svg('polyline',{points:line.join(' '),fill:'none',stroke:'#729779','stroke-width':2}));line=[];};
 for(const p of seg){const x=i++/Math.max(1,pts.length-1)*320;if(p[2]==null){flush();continue;}line.push(`${x},${58-(p[2]-min)/Math.max(1,max-min)*49}`);}flush();}
}
function drawMap(fit=true){
 if(!map)return;
 layer.clearLayers();if(marker){marker.remove();marker=null;}
 const runs=overview?filtered:(selected?[selected]:[]);
 for(const a of runs){const i=filtered.findIndex(r=>r.id===a.id);for(const seg of a.segments){
   if(seg.length<2)continue;
   L.polyline(seg.map(p=>p.slice(0,2)),{color:'#fffefa',weight:9,opacity:.85,lineJoin:'round'}).addTo(layer);
   const line=L.polyline(seg.map(p=>p.slice(0,2)),{color:overview?colours[i%colours.length]:'#e77343',weight:4,opacity:.95,lineJoin:'round'}).addTo(layer);
   const tip=document.createElement('span');tip.textContent=a.name;line.bindTooltip(tip);line.on('click',()=>{overview=false;select(a);});
 }}
 if(fit&&layer.getLayers().length){const h=map.getSize().y,detail=$('detail').hidden?25:$('detail').offsetHeight+55;map.fitBounds(layer.getBounds(),{paddingTopLeft:[50,180],paddingBottomRight:[65,Math.min(detail,h*.43)],maxZoom:15,animate:false});}
 if(selected?.segments.flat().length){marker=L.marker(selected.segments[0][0].slice(0,2),{icon:L.divIcon({className:'runner',iconSize:[14,14],iconAnchor:[7,7]}),interactive:false}).addTo(map);}
}
function prepareReplay(a){
 edges=[];totalLength=0;
 for(const seg of a.segments)for(let i=1;i<seg.length;i++){
   const p=seg[i-1],q=seg[i],d=map?map.distance(p.slice(0,2),q.slice(0,2)):Math.hypot(q[0]-p[0],q[1]-p[1]);
   if(d>0){edges.push({p,q,start:totalLength,d});totalLength+=d;}
 }
 $('play').disabled=!edges.length;$('progress').disabled=!edges.length;$('speed').disabled=!edges.length;
 setText('replay-status',edges.length?`${30/speed}-second replay`:'No visible GPS route');
}
function updateReplay(){
 $('progress').value=Math.round(replay*1000);setText('percent',Math.round(replay*100)+'%');
 if(!marker||!edges.length)return;
 const target=replay*totalLength,e=edges.find(e=>e.start+e.d>=target)||edges.at(-1),t=Math.min(1,(target-e.start)/e.d);
 marker.setLatLng([e.p[0]+(e.q[0]-e.p[0])*t,e.p[1]+(e.q[1]-e.p[1])*t]);
}
function stop(){playing=false;cancelAnimationFrame(frame);setText('play','▶');$('play').setAttribute('aria-label','Play route');}
function animate(now){if(!playing)return;replay=Math.min(1,replay+(now-lastTime)/30000*speed);lastTime=now;updateReplay();if(replay>=1)stop();else frame=requestAnimationFrame(animate);}
$('play').onclick=()=>{if(playing){stop();return;}if(replay>=1)replay=0;playing=true;lastTime=performance.now();setText('play','Ⅱ');$('play').setAttribute('aria-label','Pause route');frame=requestAnimationFrame(animate);};
$('progress').oninput=()=>{stop();replay=Number($('progress').value)/1000;updateReplay();};
$('speed').onclick=()=>{speed=speed===4?1:speed*2;setText('speed',`${speed}×`);setText('replay-status',`${30/speed}-second replay`);};
$('overview').onclick=()=>{stop();overview=true;drawMap();};
for(const id of ['search','from','to','sort'])$(id).addEventListener('input',applyFilters);
function resetFilters(){for(const id of ['search','from','to'])$(id).value='';$('sort').value='date';applyFilters();}
$('reset').onclick=resetFilters;
function toggleDemo(){demo=!demo;all=demo?demoRuns():actual;setText('demo',demo?'Exit demo':'Explore demo ↗');setText('source-status',demo?'ILLUSTRATIVE DEMO':'GARMIN EXPORTS');$('demo-note').hidden=!demo;selected=null;healthDay='';resetFilters();renderHealth();}
$('demo').onclick=toggleDemo;$('empty-demo').onclick=toggleDemo;
$('help').onclick=()=>$('setup').showModal();$('close-help').onclick=$('close-setup').onclick=()=>$('setup').close();
function demoHealth(){
 return Array.from({length:7},(_,i)=>{
  const d=new Date();d.setUTCDate(d.getUTCDate()-(6-i));const date=d.toISOString().slice(0,10),midnight=Date.parse(date+'T00:00:00+08:00'),sleepStart=midnight-90*60*1000,sleepEnd=midnight+390*60*1000;
  const heart=Array.from({length:24},(_,n)=>[midnight+n*60*60*1000,Math.round(67+9*Math.sin(n/2)+35*Math.exp(-Math.pow(n-11,2)/5))]);
  const stress=Array.from({length:24},(_,n)=>[midnight+n*60*60*1000,n===12?null:Math.round(Math.max(5,24+18*Math.sin(n/2.7)+i))]);
  const scores=[86,78,84,73,88,91,82],total=[27900,25200,27000,23400,28800,29700,26400][i];
  return {date,steps:[8420,11230,6780,12460,9130,14520,7340][i],distance_m:[6120,8400,4890,9230,6720,10560,5340][i],resting_hr_bpm:[57,56,58,55,56,54,57][i],average_hr_bpm:[74,77,73,78,75,80,72][i],max_hr_bpm:[142,166,119,172,145,176,132][i],
   heart_rate:{resting_bpm:[57,56,58,55,56,54,57][i],minimum_bpm:52,maximum_bpm:[142,166,119,172,145,176,132][i],samples:heart},
   sleep:{start_gmt:sleepStart,end_gmt:sleepEnd,total_s:total,deep_s:Math.round(total*.2),light_s:Math.round(total*.48),rem_s:Math.round(total*.25),awake_s:Math.round(total*.07),average_hr_bpm:53,average_stress:14,average_respiration_bpm:14.1,spo2_percent:97,skin_temp_c:.1,average_hrv_ms:46,body_battery_change:42,restless_moments_count:12,sleep_need:{actual_s:28800},scores:{overall:{value:scores[i],qualifier:scores[i]>84?'GOOD':'FAIR'}},levels:[[sleepStart,sleepStart+90*60*1000,1],[sleepStart+90*60*1000,sleepStart+180*60*1000,0],[sleepStart+180*60*1000,sleepStart+300*60*1000,1],[sleepStart+300*60*1000,sleepStart+390*60*1000,2],[sleepStart+390*60*1000,sleepEnd,1]],heart_rate_samples:heart.slice(0,8),stress_samples:stress.slice(0,8),body_battery_samples:stress.slice(0,8),hrv_samples:Array.from({length:48},(_,n)=>[sleepStart+n*10*60*1000,Math.round(46+8*Math.sin(n/4)+3*Math.cos(n))]),respiration_samples:Array.from({length:48},(_,n)=>[sleepStart+n*10*60*1000,Math.round((14+1.2*Math.sin(n/5))*10)/10]),movement:Array.from({length:20},(_,n)=>[sleepStart+n*20*60*1000,sleepStart+(n+1)*20*60*1000,n%3]),breathing_disruptions:[]},
   stress:{average_level:[24,32,27,41,22,19,29][i],maximum_level:[61,73,65,82,59,54,68][i],samples:stress,body_battery_samples:stress.map(([time,value])=>[time,'MEASURED',Math.max(5,90-value),1])}};
 });
}
function healthDuration(seconds){if(seconds==null||!Number.isFinite(Number(seconds))||seconds<0)return '—';const minutes=Math.round(seconds/60);return `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m`;}
function healthClock(timestamp){return Number.isFinite(Number(timestamp))?new Date(Number(timestamp)).toLocaleString('en-SG',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Singapore'}):'—';}
function healthDateTime(timestamp){return Number.isFinite(Number(timestamp))?new Date(Number(timestamp)).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}):'—';}
const healthCharts = {
 heart: {title:'Heart rate · selected day', unit:'bpm', colour:'#f17689', samples:r=>r.heart_rate?.samples},
 stress: {title:'Stress · selected day', unit:'level', colour:'#e5b65b', range:[0,100], samples:r=>r.stress?.samples},
 battery: {title:'Body Battery · selected day', unit:'/100', colour:'#83c77c', range:[0,100], samples:r=>(r.stress?.body_battery_samples||[]).map(row=>[row[0],row[2]])},
 hrv: {title:'HRV · selected night', unit:'ms', colour:'#ad94ed', samples:r=>r.sleep?.hrv_samples},
 respiration: {title:'Respiration · selected night', unit:'brpm', colour:'#69bbdf', samples:r=>r.sleep?.respiration_samples},
 movement: {title:'Movement · selected night', unit:'level', colour:'#76bdba', samples:r=>(r.sleep?.movement||[]).map(row=>[row[0],row[2],row[1]])}
};
const hasReading = value => value != null && value !== '' && Number.isFinite(Number(value));
const measuredValues = rows => (rows||[]).filter(row=>hasReading(row[0])&&hasReading(row[1])).map(row=>Number(row[1]));
const chartNumber = value => Math.round(value*10)/10;
function chartCategory(kind,value,average){
 if(kind==='stress')return value<=25?'Rest':value<=50?'Low':value<=75?'Medium':'High';
 if(kind!=='heart')return '';
 return value<average-5?'Below daily average':value>average+5?'Above daily average':'Near daily average';
}
function drawHealthLine(id,rows,colour,range,kind='heart',readoutId){
 const chart=$(id),config=healthCharts[kind];
 const width=id==='chart-dialog-chart'?640:Math.max(320,chart.clientWidth||640),right=width-20;
 chart.setAttribute('viewBox',`0 0 ${width} 190`);chart.setAttribute('preserveAspectRatio','none');
 chart.replaceChildren();chart.removeAttribute('tabindex');
 chart.onpointermove=chart.onclick=chart.onpointerleave=chart.onfocus=chart.onkeydown=null;
 const data=(rows||[]).filter(row=>Array.isArray(row)&&hasReading(row[0])).slice().sort((a,b)=>a[0]-b[0]);
 const values=measuredValues(data);
 if(!values.length){const text=svg('text',{x:45,y:90,class:'chart-empty','font-size':14});text.textContent='No readings recorded';chart.append(text);return;}
 const start=Number(data[0][0]),end=Math.max(Number(data.at(-1)[0]),...data.map(row=>hasReading(row[2])?Number(row[2]):0));
 const minimum=Math.min(...values),maximum=Math.max(...values);
 const low=range?.[0]??(kind==='movement'?0:Math.max(0,minimum===maximum?minimum-5:minimum)),high=range?.[1]??(minimum===maximum?maximum+5:maximum);
 const span=Math.max(1,high-low),timeSpan=Math.max(1,end-start),average=values.reduce((sum,value)=>sum+value,0)/values.length;
 const x=time=>45+(Number(time)-start)/timeSpan*(right-45),y=value=>150-(Number(value)-low)/span*120;
 const unit=svg('text',{x:45,y:15,'font-size':11,class:'chart-axis-unit'});unit.textContent=config.unit;chart.append(unit);
 if(kind==='stress')for(let i=0;i<4;i++)chart.append(svg('rect',{x:45,y:y((i+1)*25),width:right-45,height:30,fill:['#76bdba','#8da85f','#d8ae53','#b45969'][i],opacity:.07}));
 for(let i=0;i<4;i++){
  const value=low+span*i/3,position=y(value);
  chart.append(svg('line',{x1:45,x2:right,y1:position,y2:position,class:'chart-grid-line'}));
  const label=svg('text',{x:36,y:position+4,'font-size':11,'text-anchor':'end',class:'chart-y-tick'});label.textContent=chartNumber(value);chart.append(label);
 }
 for(let i=0;i<(end===start?1:5);i++){
  const time=start+timeSpan*i/4,label=svg('text',{x:x(time),y:178,'font-size':11,'text-anchor':i===0?'start':i===4?'end':'middle',class:'chart-time-tick'});
  label.textContent=new Date(time).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Singapore'});chart.append(label);
 }
 chart.append(svg('line',{x1:45,x2:right,y1:y(average),y2:y(average),stroke:colour,'stroke-width':1,'stroke-dasharray':'4 5',opacity:.6}));
 const flush=points=>{
  if(!points.length)return;
  if(points.length===1){chart.append(svg('circle',{cx:points[0][0],cy:points[0][1],r:3,fill:colour}));return;}
  chart.append(svg('polygon',{points:[[points[0][0],150],...points,[points.at(-1)[0],150]].map(p=>p.join(',')).join(' '),fill:colour,opacity:.16}));
  chart.append(svg('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:colour,'stroke-width':2,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}));
 };
 let points=[];
 for(const [time,value,to] of data){
  if(!hasReading(value)){flush(points);points=[];continue;}
  if(kind==='movement'){
   if(hasReading(to)&&to>time)chart.append(svg('rect',{x:x(time),y:y(value),width:Math.max(1,x(to)-x(time)-1),height:Math.max(1,150-y(value)),fill:colour,opacity:.7}));
  }else points.push([x(time),y(value)]);
 }
 flush(points);
 const measured=data.filter(row=>hasReading(row[1])).map(([time,value,to])=>({time:Number(time),to:hasReading(to)?Number(to):null,value:Number(value),x:x(time),y:y(value)}));
 const inspector=svg('g',{class:'chart-inspector',visibility:'hidden','aria-hidden':'true'}),crosshair=svg('line',{y1:20,y2:150,stroke:'#a9b6c5','stroke-width':1,'stroke-dasharray':'4 4'}),dot=svg('circle',{r:4,fill:'#151b25',stroke:colour,'stroke-width':2}),box=svg('rect',{width:230,height:42,rx:5,fill:'#283343'}),timeText=svg('text',{fill:'#dce5ef','font-size':10}),valueText=svg('text',{fill:'#fff','font-size':11,'font-weight':700});
 inspector.append(crosshair,dot,box,timeText,valueText);chart.append(inspector);
 let selected=-1;
 const show=index=>{
  selected=Math.max(0,Math.min(measured.length-1,index));
  const point=measured[selected],boxX=Math.max(45,Math.min(right-230,point.x+10)),category=chartCategory(kind,point.value,average),label=`${chartNumber(point.value)} ${kind==='stress'?'stress':config.unit}${category?' · '+category:''}`;
  crosshair.setAttribute('x1',point.x);crosshair.setAttribute('x2',point.x);dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);
  box.setAttribute('x',boxX);box.setAttribute('y',8);timeText.setAttribute('x',boxX+10);timeText.setAttribute('y',24);timeText.textContent=healthDateTime(point.time);valueText.setAttribute('x',boxX+10);valueText.setAttribute('y',42);valueText.textContent=label;
  inspector.setAttribute('visibility','visible');if(readoutId)setText(readoutId,`${healthDateTime(point.time)}${kind==='movement'&&point.to!=null?' – '+healthDateTime(point.to):''} · ${label}`);
 };
 const inspect=event=>{const matrix=chart.getScreenCTM();if(!matrix)return;const cursor=chart.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;const local=cursor.matrixTransform(matrix.inverse());
  if(kind==='movement'){
   const index=measured.findIndex(point=>point.to!=null&&local.x>=point.x&&local.x<x(point.to));
   if(index<0){inspector.setAttribute('visibility','hidden');if(readoutId)setText(readoutId,'No recorded interval at this time');return;}
   show(index);return;
  }
  show(measured.reduce((best,point,index)=>Math.abs(point.x-local.x)<Math.abs(measured[best].x-local.x)?index:best,0));};
 chart.setAttribute('tabindex','0');chart.onpointermove=inspect;chart.onclick=inspect;chart.onpointerleave=()=>inspector.setAttribute('visibility','hidden');chart.onfocus=()=>show(selected<0?0:selected);chart.onkeydown=event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();show((selected<0?0:selected)+(event.key==='ArrowRight'?1:-1));};
}
function updateChartZoom(){
 $('chart-dialog-chart').style.width=`${chartZoom*100}%`;setText('chart-zoom-level',`${chartZoom}×`);$('chart-zoom-out').disabled=chartZoom===1;$('chart-zoom-in').disabled=chartZoom===3;if(chartZoom===1)$('chart-dialog-scroll').scrollLeft=0;
}
function changeChartZoom(direction){const levels=[1,1.5,2,3],index=levels.indexOf(chartZoom);chartZoom=levels[Math.max(0,Math.min(levels.length-1,index+direction))];updateChartZoom();}
function openHealthChart(kind){
 const row=(demo?demoHealth():actualHealth).find(row=>row.date===healthDay)||{},config=healthCharts[kind],samples=config.samples(row),values=measuredValues(samples);
 setText('chart-dialog-title',config.title);$('chart-dialog-chart').setAttribute('aria-label',config.title);
 for(const [id,value] of [['min',Math.min(...values)],['average',values.reduce((a,b)=>a+b,0)/values.length],['max',Math.max(...values)]])setText(`chart-detail-${id}`,values.length?`${chartNumber(value)} ${config.unit}`:'—');
 setText('chart-detail-samples',values.length);setText('chart-dialog-readout','Hover, tap, or use arrow keys for exact readings.');
 drawHealthLine('chart-dialog-chart',samples,config.colour,config.range,kind,'chart-dialog-readout');chartZoom=1;updateChartZoom();$('chart-dialog').showModal();
}
const sleepStages=[['deep_s','Deep','#597de0'],['light_s','Light','#6bbde0'],['rem_s','REM','#ad94ed'],['awake_s','Awake','#e5b65b']];
function drawGauge(kind,value,colour){
 const chart=$(`gauge-${kind}`);chart.replaceChildren();
 const path='M 28.18 81.82 A 45 45 0 1 1 91.82 81.82';
 chart.append(svg('path',{d:path,fill:'none',stroke:'#2b3442','stroke-width':9,'stroke-linecap':'round'}));
 if(hasReading(value))chart.append(svg('path',{d:path,pathLength:100,fill:'none',stroke:colour,'stroke-width':9,'stroke-linecap':'round','stroke-dasharray':`${Math.min(100,Math.max(0,Number(value)))} 100`}));
 chart.setAttribute('aria-label',`${kind==='battery'?'Body Battery':kind==='sleep'?'Sleep score':'Average stress'}: ${hasReading(value)?value+' out of 100':'unavailable'}`);
}
function drawSleepDonut(sleep){
 const chart=$('sleep-donut'),legend=$('sleep-donut-legend');chart.replaceChildren();legend.replaceChildren();
 const values=sleepStages.map(([key])=>hasReading(sleep[key])&&sleep[key]>=0?Number(sleep[key]):null),total=values.reduce((sum,value)=>sum+(value??0),0);
 chart.append(svg('circle',{cx:110,cy:110,r:78,fill:'none',stroke:'#2b3442','stroke-width':22}));
 let offset=0;const labels=[];
 sleepStages.forEach(([key,name,colour],index)=>{
  const value=values[index],percent=total>0&&value!=null?value/total*100:null;
  if(percent>0){const arc=svg('circle',{cx:110,cy:110,r:78,fill:'none',stroke:colour,'stroke-width':22,pathLength:100,'stroke-dasharray':`${percent} ${100-percent}`,'stroke-dashoffset':-offset,transform:'rotate(-90 110 110)','data-stage':name});const title=svg('title',{});title.textContent=`${name}: ${healthDuration(value)} (${Math.round(percent)}%)`;arc.append(title);chart.append(arc);offset+=percent;}
  labels.push(`${name} ${value==null?'unavailable':total>0?Math.round(percent)+'%':healthDuration(value)}`);
  const item=document.createElement('div'),dot=document.createElement('i'),label=document.createElement('span'),duration=document.createElement('strong');dot.style.background=colour;label.textContent=name;duration.textContent=value==null?'—':healthDuration(value);item.append(dot,label,duration);legend.append(item);
 });
 const centre=svg('text',{x:110,y:108,'text-anchor':'middle',class:'donut-value'});centre.textContent=values.every(v=>v==null)?'Unavailable':healthDuration(total);
 const caption=svg('text',{x:110,y:132,'text-anchor':'middle',class:'donut-caption'});caption.textContent='recorded stages';chart.append(centre,caption);chart.setAttribute('aria-label',labels.join(', '));
}
function drawSleepStages(rows){
 const chart=$('sleep-stages');chart.replaceChildren();
 const stages=(rows||[]).filter(row=>Array.isArray(row)&&hasReading(row[0])&&hasReading(row[1])&&row[1]>row[0]);
 if(!stages.length){const text=svg('text',{x:70,y:90,'font-size':14,class:'chart-empty'});text.textContent='No sleep stages recorded';chart.append(text);return;}
 const start=Math.min(...stages.map(row=>row[0])),end=Math.max(...stages.map(row=>row[1])),span=Math.max(1,end-start);
 sleepStages.forEach(([,name],i)=>{const label=svg('text',{x:62,y:39+i*31,'text-anchor':'end','font-size':11,class:'chart-y-tick'});label.textContent=name;chart.append(label,svg('line',{x1:75,x2:620,y1:36+i*31,y2:36+i*31,class:'chart-grid-line'}));});
 for(const [from,to,level] of stages){
  if(!Number.isInteger(level)||level<0||level>3)continue;
  const rect=svg('rect',{x:75+(from-start)/span*545,y:25+level*31,width:Math.max(1,(to-from)/span*545),height:22,rx:2,fill:sleepStages[level][2]});
  const title=svg('title',{});title.textContent=`${sleepStages[level][1]} · ${healthClock(from)} – ${healthClock(to)} · ${healthDuration((to-from)/1000)}`;rect.append(title);chart.append(rect);
 }
 for(const [time,position,anchor] of [[start,75,'start'],[end,620,'end']]){const label=svg('text',{x:position,y:174,'font-size':11,'text-anchor':anchor,class:'chart-time-tick'});label.textContent=healthClock(time);chart.append(label);}
}
function drawHealthHistory(id,rows,value,format,colour){
 const target=$(id);target.replaceChildren();const maximum=Math.max(1,...rows.map(row=>value(row)||0));
 for(const row of rows){const button=document.createElement('button');button.className='health-history-bar';button.setAttribute('aria-pressed',String(row.date===healthDay));button.setAttribute('aria-label',`${row.date}: ${format(value(row))}`);const label=document.createElement('span');label.textContent=format(value(row));const bar=document.createElement('i');bar.style.height=Math.max(0,(value(row)||0)/maximum*105)+'px';bar.style.background=colour;const day=document.createElement('small');day.textContent=new Date(row.date+'T12:00:00Z').toLocaleDateString('en-SG',{weekday:'short',timeZone:'UTC'});button.append(label,bar,day);button.onclick=()=>{healthDay=row.date;renderHealth();};target.append(button);}
}
function renderHealth(){
 const rows=demo?demoHealth():actualHealth;
 if(!rows.some(r=>r.date===healthDay))healthDay=rows.at(-1)?.date||'';
 const selector=$('health-date');selector.replaceChildren();
 for(const row of [...rows].reverse()){const o=document.createElement('option');o.value=row.date;o.textContent=shortDate(row.date);selector.append(o);}selector.value=healthDay;selector.disabled=!rows.length;
 const r=rows.find(r=>r.date===healthDay)||{},heart=r.heart_rate||{},sleep=r.sleep||{},stress=r.stress||{},score=sleep.scores?.overall?.value??sleep.daily_score;
 setText('health-source',demo?'DEMO · illustrative readings, not your health data':'Garmin daily readings · latest successful sync');
 $('health-empty').hidden=rows.length>0;
 setText('health-steps',r.steps==null?'—':Math.round(r.steps).toLocaleString('en-SG'));
 setText('health-distance',r.distance_m==null?'—':(r.distance_m/1000).toFixed(2)+' km');
 setText('health-rest',r.resting_hr_bpm??'—');setText('health-min',heart.minimum_bpm??'—');setText('health-average',r.average_hr_bpm??'—');setText('health-max',r.max_hr_bpm??'—');
 setText('health-sleep-score',score??'—');setText('health-sleep-quality',sleep.scores?.overall?.qualifier??sleep.score_quality??'Garmin sleep score');setText('health-sleep-total',healthDuration(sleep.total_s??sleep.daily_total_s));
 setText('gauge-stress-value',stress.average_level??'—');setText('health-stress-max',stress.maximum_level??'—');
 setText('health-sleep-window',sleep.start_gmt==null?'—':`${healthClock(sleep.start_gmt)} – ${healthClock(sleep.end_gmt)}`);setText('health-sleep-need',healthDuration(sleep.sleep_need?.actual_s));
 setText('health-sleep-breakdown',[sleep.deep_s,sleep.light_s,sleep.rem_s,sleep.awake_s].map(healthDuration).join(' / '));setText('health-sleep-heart-stress',`${sleep.average_hr_bpm??'—'} bpm / ${sleep.average_stress??'—'}`);
 setText('health-sleep-hrv',sleep.average_hrv_ms==null?'—':`${sleep.average_hrv_ms} ms · ${sleep.hrv_status??'status unavailable'}`);setText('health-sleep-respiration',`${sleep.average_respiration_bpm??sleep.daily_respiration_bpm??'—'} brpm / ${sleep.spo2_percent??'—'}%`);
 setText('health-sleep-temperature',sleep.skin_temp_c==null?'—':`${sleep.skin_temp_c>0?'+':''}${sleep.skin_temp_c} °C`);setText('health-sleep-battery',sleep.body_battery_change==null?'—':`${sleep.body_battery_change>0?'+':''}${sleep.body_battery_change}`);setText('health-sleep-restless',sleep.restless_moments_count??'—');
 setText('health-heart-samples',`${heart.samples?.length||0} readings`);setText('health-stress-samples',`${stress.samples?.length||0} readings`);setText('health-battery-samples',`${stress.body_battery_samples?.length||0} readings`);setText('health-sleep-heart-samples',`${sleep.heart_rate_samples?.length||0} readings`);setText('health-sleep-hrv-samples',`${sleep.hrv_samples?.length||0} readings`);setText('health-sleep-respiration-samples',`${sleep.respiration_samples?.length||0} readings`);setText('health-sleep-movement-samples',`${sleep.movement?.length||0} intervals`);setText('health-sleep-disruption-samples',`${sleep.breathing_disruptions?.length||0} intervals`);
 for(const [kind,config] of Object.entries(healthCharts)){
  const samples=config.samples(r),values=measuredValues(samples);
  setText(`${kind}-chart-summary`,values.length?`Average ${chartNumber(values.reduce((a,b)=>a+b,0)/values.length)} ${config.unit} · Range ${chartNumber(Math.min(...values))}–${chartNumber(Math.max(...values))} · ${values.length.toLocaleString('en-SG')} readings`:'No readings recorded');
  setText(`${kind}-chart-readout`,values.length?'Hover, tap, or use arrow keys · dashed line shows sample average':'Unavailable for this day');
  drawHealthLine(`${kind}-chart`,samples,config.colour,config.range,kind,`${kind}-chart-readout`);
 }
 const battery=healthCharts.battery.samples(r).filter(row=>hasReading(row[0])&&hasReading(row[1])).sort((a,b)=>a[0]-b[0]).at(-1)?.[1];
 setText('gauge-battery-value',battery??'—');
 drawGauge('sleep',score,'#ad94ed');drawGauge('stress',stress.average_level,'#e5b65b');drawGauge('battery',battery,'#83c77c');
 drawSleepStages(sleep.levels);drawSleepDonut(sleep);
 drawHealthHistory('distance-history',rows,row=>row.distance_m==null?null:row.distance_m/1000,value=>value==null?'—':value.toFixed(2),'#69bbdf');
 drawHealthHistory('rest-history',rows,row=>row.resting_hr_bpm,value=>value==null?'—':String(value),'#f17689');
 drawHealthHistory('score-history',rows,row=>row.sleep?.scores?.overall?.value??row.sleep?.daily_score,value=>value==null?'—':String(value),'#ad94ed');
 drawHealthHistory('sleep-history',rows,row=>row.sleep?.total_s??row.sleep?.daily_total_s,value=>healthDuration(value),'#ad94ed');drawHealthHistory('stress-history',rows,row=>row.stress?.average_level,value=>value==null?'—':String(Math.round(value)),'#e5b65b');
 $('health-bars').replaceChildren();$('health-table').replaceChildren();const maximum=Math.max(1,...rows.map(r=>r.steps||0));
 for(const row of rows){const button=document.createElement('button');button.className='health-bar';button.setAttribute('aria-pressed',String(row.date===healthDay));button.setAttribute('aria-label',`${row.date}: ${row.steps??'Unavailable'} steps`);const value=document.createElement('span');value.textContent=row.steps==null?'—':Math.round(row.steps).toLocaleString('en-SG');const bar=document.createElement('i');bar.style.height=Math.max(0,(row.steps||0)/maximum*120)+'px';const label=document.createElement('small');label.textContent=new Date(row.date+'T12:00:00Z').toLocaleDateString('en-SG',{weekday:'short',timeZone:'UTC'});button.append(value,bar,label);button.onclick=()=>{healthDay=row.date;renderHealth();};$('health-bars').append(button);
 const tr=document.createElement('tr');for(const text of [shortDate(row.date),row.steps==null?'—':row.steps.toLocaleString('en-SG'),row.distance_m==null?'—':(row.distance_m/1000).toFixed(2)+' km',row.resting_hr_bpm==null?'—':row.resting_hr_bpm+' bpm',row.sleep?.scores?.overall?.value??row.sleep?.daily_score??'—',row.stress?.average_level??'—']){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('health-table').prepend(tr);
 }
}
$('health-date').onchange=()=>{healthDay=$('health-date').value;renderHealth();};
for(const kind of Object.keys(healthCharts))$(`expand-${kind}`).onclick=()=>openHealthChart(kind);
$('chart-zoom-in').onclick=()=>changeChartZoom(1);$('chart-zoom-out').onclick=()=>changeChartZoom(-1);$('chart-zoom-reset').onclick=()=>{chartZoom=1;updateChartZoom();};$('chart-dialog-close').onclick=()=>$('chart-dialog').close();
$('view-health').onclick=()=>{stop();const showing=$('health-panel').hidden;$('health-panel').hidden=!showing;document.body.classList.toggle('health-mode',showing);document.querySelector('.map-panel').hidden=showing;setText('view-health',showing?'View running routes':'Health overview');renderHealth();if(!showing&&map){map.invalidateSize();drawMap();}};
let healthResize;
window.addEventListener('resize',()=>{clearTimeout(healthResize);healthResize=setTimeout(()=>{if(!$('health-panel').hidden)renderHealth();},150);});
async function loadData(){
 try{
   const datasets=await Promise.all(['activities','manual','health'].map(async name=>{const res=await fetch(`./data/${name}.json`,{cache:'no-store'});if(!res.ok)throw Error('Dataset unavailable');const d=await res.json();if(d.schema_version!==1||(!Array.isArray(d.activities)&&!Array.isArray(d.days)))throw Error('Unsupported dataset');return d;}));
   actual=[...new Map(datasets.flatMap(d=>d.activities||[]).map(a=>[a.id,a])).values()];
   actualHealth=datasets.find(d=>Array.isArray(d.days))?.days||[];renderHealth();
   if(!demo)all=actual;
   const dates=datasets.map(d=>d.generated_at).filter(Boolean).sort();if(dates.length)setText('updated','Updated '+new Date(dates.at(-1)).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short'}));
   if(!demo)applyFilters();
 }catch(e){setText('updated','Data could not load. Retry after deployment.');$('empty').querySelector('p').textContent='The activity dataset could not load. Reload the page or try the demo.';}
}
initialiseMap();await loadData();
