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
  const d=new Date();d.setUTCDate(d.getUTCDate()-(6-i));const date=d.toISOString().slice(0,10),midnight=Date.parse(date+'T00:00:00Z'),sleepStart=midnight-90*60*1000,sleepEnd=midnight+390*60*1000;
  const heart=Array.from({length:24},(_,n)=>[midnight+n*60*60*1000,Math.round(67+9*Math.sin(n/2)+35*Math.exp(-Math.pow(n-11,2)/5))]);
  const stress=Array.from({length:24},(_,n)=>[midnight+n*60*60*1000,n===12?null:Math.round(Math.max(5,24+18*Math.sin(n/2.7)+i))]);
  const scores=[86,78,84,73,88,91,82],total=[27900,25200,27000,23400,28800,29700,26400][i];
  return {date,steps:[8420,11230,6780,12460,9130,14520,7340][i],distance_m:[6120,8400,4890,9230,6720,10560,5340][i],resting_hr_bpm:[57,56,58,55,56,54,57][i],average_hr_bpm:[74,77,73,78,75,80,72][i],max_hr_bpm:[142,166,119,172,145,176,132][i],
   heart_rate:{resting_bpm:[57,56,58,55,56,54,57][i],minimum_bpm:52,maximum_bpm:[142,166,119,172,145,176,132][i],samples:heart},
   sleep:{start_gmt:sleepStart,end_gmt:sleepEnd,total_s:total,deep_s:Math.round(total*.2),light_s:Math.round(total*.48),rem_s:Math.round(total*.25),awake_s:Math.round(total*.07),average_hr_bpm:53,average_stress:14,average_respiration_bpm:14.1,spo2_percent:97,skin_temp_c:.1,average_hrv_ms:46,body_battery_change:42,restless_moments_count:12,sleep_need:{actual_s:28800},scores:{overall:{value:scores[i],qualifier:scores[i]>84?'GOOD':'FAIR'}},levels:[[sleepStart,sleepStart+90*60*1000,1],[sleepStart+90*60*1000,sleepStart+180*60*1000,0],[sleepStart+180*60*1000,sleepStart+300*60*1000,1],[sleepStart+300*60*1000,sleepStart+390*60*1000,2],[sleepStart+390*60*1000,sleepEnd,1]],heart_rate_samples:heart.slice(0,8),stress_samples:stress.slice(0,8),body_battery_samples:stress.slice(0,8),hrv_samples:stress.slice(0,8),respiration_samples:stress.slice(0,8),movement:Array.from({length:20},(_,n)=>[sleepStart+n*20*60*1000,sleepStart+(n+1)*20*60*1000,n%3]),breathing_disruptions:[]},
   stress:{average_level:[24,32,27,41,22,19,29][i],maximum_level:[61,73,65,82,59,54,68][i],samples:stress,body_battery_samples:stress.map(([time,value])=>[time,'MEASURED',Math.max(5,90-value),1])}};
 });
}
function healthDuration(seconds){if(!(seconds>=0))return '—';const minutes=Math.round(seconds/60);return `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m`;}
function healthClock(timestamp){return Number.isFinite(Number(timestamp))?new Date(Number(timestamp)).toLocaleString('en-SG',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Singapore'}):'—';}
function healthDateTime(timestamp){return Number.isFinite(Number(timestamp))?new Date(Number(timestamp)).toLocaleString('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}):'—';}
function chartCategory(kind,value,average){if(kind==='stress')return value<=25?'Rest':value<=50?'Low':value<=75?'Medium':'High';return value<average-5?'Below daily average':value>average+5?'Above daily average':'Near daily average';}
function drawHealthLine(id,rows,colour,range,kind='heart',readoutId){
 const chart=$(id);chart.replaceChildren();const data=(rows||[]).filter(row=>Array.isArray(row)&&Number.isFinite(Number(row[0]))),values=data.map(row=>row[1]).filter(value=>value!=null).map(Number).filter(Number.isFinite);
 if(data.length<2||!values.length){const text=svg('text',{x:20,y:100,fill:'#7d9086','font-size':13});text.textContent='No readings recorded';chart.append(text);return;}
 const start=Number(data[0][0]),end=Number(data.at(-1)[0]),low=range?.[0]??Math.min(...values),high=range?.[1]??Math.max(...values),span=Math.max(1,high-low),timeSpan=Math.max(1,end-start),average=values.reduce((sum,value)=>sum+value,0)/values.length,x=time=>45+(Number(time)-start)/timeSpan*575,y=value=>150-(Number(value)-low)/span*120;
 for(let y=25;y<=145;y+=40)chart.append(svg('line',{x1:45,x2:620,y1:y,y2:y,stroke:'#e6ebe4','stroke-width':1}));
 const flush=points=>{if(points.length>1)chart.append(svg('polyline',{points:points.join(' '),fill:'none',stroke:colour,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));};let points=[];
 for(const [time,value] of data){if(value==null||!Number.isFinite(Number(value))){flush(points);points=[];continue;}points.push(`${x(time)},${y(value)}`);}flush(points);
 const left=svg('text',{x:45,y:178,fill:'#7d9086','font-size':11});left.textContent=healthClock(start).split(', ').at(-1);const right=svg('text',{x:620,y:178,fill:'#7d9086','font-size':11,'text-anchor':'end'});right.textContent=healthClock(end).split(', ').at(-1);chart.append(left,right);
 const measured=data.filter(row=>row[1]!=null&&Number.isFinite(Number(row[1]))).map(([time,value])=>({time:Number(time),value:Number(value),x:x(time),y:y(value)}));
 const inspector=svg('g',{class:'chart-inspector',visibility:'hidden','aria-hidden':'true'}),crosshair=svg('line',{y1:20,y2:150,stroke:'#6b7f76','stroke-width':1,'stroke-dasharray':'4 4'}),dot=svg('circle',{r:5,fill:'#fff',stroke:colour,'stroke-width':3}),box=svg('rect',{width:215,height:42,rx:6,fill:'#17383c'}),timeText=svg('text',{fill:'#fff','font-size':10}),valueText=svg('text',{fill:'#dce8df','font-size':11,'font-weight':700});inspector.append(crosshair,dot,box,timeText,valueText);chart.append(inspector);
 let selected=-1;
 const show=index=>{selected=Math.max(0,Math.min(measured.length-1,index));const point=measured[selected],boxX=point.x>390?point.x-225:point.x+10,label=`${Math.round(point.value*10)/10} ${kind==='heart'?'bpm':'stress'} · ${chartCategory(kind,point.value,average)}`;crosshair.setAttribute('x1',point.x);crosshair.setAttribute('x2',point.x);dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);box.setAttribute('x',boxX);box.setAttribute('y',8);timeText.setAttribute('x',boxX+10);timeText.setAttribute('y',24);timeText.textContent=healthDateTime(point.time);valueText.setAttribute('x',boxX+10);valueText.setAttribute('y',42);valueText.textContent=label;inspector.setAttribute('visibility','visible');if(readoutId)setText(readoutId,`${healthDateTime(point.time)} · ${label}`);};
 const inspect=event=>{const matrix=chart.getScreenCTM();if(!matrix)return;const cursor=chart.createSVGPoint();cursor.x=event.clientX;cursor.y=event.clientY;const local=cursor.matrixTransform(matrix.inverse());show(measured.reduce((best,point,index)=>Math.abs(point.x-local.x)<Math.abs(measured[best].x-local.x)?index:best,0));};
 chart.setAttribute('tabindex','0');chart.onpointermove=inspect;chart.onclick=inspect;chart.onpointerleave=()=>inspector.setAttribute('visibility','hidden');chart.onfocus=()=>show(selected<0?0:selected);chart.onkeydown=event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();show((selected<0?0:selected)+(event.key==='ArrowRight'?1:-1));};
}
function updateChartZoom(){
 $('chart-dialog-chart').style.width=`${chartZoom*100}%`;setText('chart-zoom-level',`${chartZoom}×`);$('chart-zoom-out').disabled=chartZoom===1;$('chart-zoom-in').disabled=chartZoom===3;if(chartZoom===1)$('chart-dialog-scroll').scrollLeft=0;
}
function changeChartZoom(direction){const levels=[1,1.5,2,3],index=levels.indexOf(chartZoom);chartZoom=levels[Math.max(0,Math.min(levels.length-1,index+direction))];updateChartZoom();}
function openHealthChart(kind){
 const rows=demo?demoHealth():actualHealth,row=rows.find(row=>row.date===healthDay)||{},heart=kind==='heart',title=heart?'Heart rate · selected day':'Stress · selected day',samples=heart?row.heart_rate?.samples:row.stress?.samples,values=(samples||[]).map(sample=>sample[1]).filter(value=>value!=null&&Number.isFinite(Number(value))).map(Number);
 setText('chart-dialog-title',title);$('chart-dialog-chart').setAttribute('aria-label',title);setText('chart-detail-min',values.length?Math.min(...values):'—');setText('chart-detail-average',values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10:'—');setText('chart-detail-max',values.length?Math.max(...values):'—');setText('chart-detail-samples',values.length);setText('chart-dialog-readout','Hover, tap, or use arrow keys for exact readings.');drawHealthLine('chart-dialog-chart',samples,heart?'#e77343':'#648876',heart?undefined:[0,100],kind,'chart-dialog-readout');chartZoom=1;updateChartZoom();$('chart-dialog').showModal();
}
function drawSleepStages(rows){
 const chart=$('sleep-stages');chart.replaceChildren();const stages=(rows||[]).filter(row=>Array.isArray(row)&&Number.isFinite(Number(row[0]))&&Number.isFinite(Number(row[1])));
 if(!stages.length){const text=svg('text',{x:20,y:48,fill:'#7d9086','font-size':13});text.textContent='No sleep stages recorded';chart.append(text);return;}
 const start=Math.min(...stages.map(row=>row[0])),end=Math.max(...stages.map(row=>row[1])),span=Math.max(1,end-start),colours=['#365c74','#91a9bd','#aa86b8','#ed9a72'];
 for(const [from,to,level] of stages)chart.append(svg('rect',{x:20+(from-start)/span*600,y:18,width:Math.max(1,(to-from)/span*600),height:38,rx:3,fill:colours[Math.max(0,Math.min(3,Math.round(level??3)))]}));
 const left=svg('text',{x:20,y:78,fill:'#7d9086','font-size':11});left.textContent=healthClock(start);const right=svg('text',{x:620,y:78,fill:'#7d9086','font-size':11,'text-anchor':'end'});right.textContent=healthClock(end);chart.append(left,right);
}
function drawHealthHistory(id,rows,value,format,colour){
 const target=$(id);target.replaceChildren();const maximum=Math.max(1,...rows.map(row=>value(row)||0));
 for(const row of rows){const button=document.createElement('button');button.className='health-history-bar';button.setAttribute('aria-pressed',String(row.date===healthDay));button.setAttribute('aria-label',`${row.date}: ${format(value(row))}`);const label=document.createElement('span');label.textContent=format(value(row));const bar=document.createElement('i');bar.style.height=Math.max(2,(value(row)||0)/maximum*105)+'px';bar.style.background=colour;const day=document.createElement('small');day.textContent=new Date(row.date+'T12:00:00Z').toLocaleDateString('en-SG',{weekday:'short',timeZone:'UTC'});button.append(label,bar,day);button.onclick=()=>{healthDay=row.date;renderHealth();};target.append(button);}
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
 setText('health-stress-average',stress.average_level??'—');setText('health-stress-max',stress.maximum_level??'—');
 setText('health-sleep-window',sleep.start_gmt==null?'—':`${healthClock(sleep.start_gmt)} – ${healthClock(sleep.end_gmt)}`);setText('health-sleep-need',healthDuration(sleep.sleep_need?.actual_s));
 setText('health-sleep-breakdown',[sleep.deep_s,sleep.light_s,sleep.rem_s,sleep.awake_s].map(healthDuration).join(' / '));setText('health-sleep-heart-stress',`${sleep.average_hr_bpm??'—'} bpm / ${sleep.average_stress??'—'}`);
 setText('health-sleep-hrv',sleep.average_hrv_ms==null?'—':`${sleep.average_hrv_ms} ms · ${sleep.hrv_status??'status unavailable'}`);setText('health-sleep-respiration',`${sleep.average_respiration_bpm??sleep.daily_respiration_bpm??'—'} brpm / ${sleep.spo2_percent??'—'}%`);
 setText('health-sleep-temperature',sleep.skin_temp_c==null?'—':`${sleep.skin_temp_c>0?'+':''}${sleep.skin_temp_c} °C`);setText('health-sleep-battery',sleep.body_battery_change==null?'—':`${sleep.body_battery_change>0?'+':''}${sleep.body_battery_change}`);setText('health-sleep-restless',sleep.restless_moments_count??'—');
 setText('health-heart-samples',`${heart.samples?.length||0} readings`);setText('health-stress-samples',`${stress.samples?.length||0} readings`);setText('health-battery-samples',`${stress.body_battery_samples?.length||0} readings`);setText('health-sleep-heart-samples',`${sleep.heart_rate_samples?.length||0} readings`);setText('health-sleep-hrv-samples',`${sleep.hrv_samples?.length||0} readings`);setText('health-sleep-respiration-samples',`${sleep.respiration_samples?.length||0} readings`);setText('health-sleep-movement-samples',`${sleep.movement?.length||0} intervals`);setText('health-sleep-disruption-samples',`${sleep.breathing_disruptions?.length||0} intervals`);
 drawHealthLine('heart-chart',heart.samples,'#e77343',undefined,'heart','heart-chart-readout');drawHealthLine('stress-chart',stress.samples,'#648876',[0,100],'stress','stress-chart-readout');drawSleepStages(sleep.levels);
 drawHealthHistory('sleep-history',rows,row=>row.sleep?.total_s??row.sleep?.daily_total_s,value=>healthDuration(value),'#718da4');drawHealthHistory('stress-history',rows,row=>row.stress?.average_level,value=>value==null?'—':String(Math.round(value)),'#d78460');
 $('health-bars').replaceChildren();$('health-table').replaceChildren();const maximum=Math.max(1,...rows.map(r=>r.steps||0));
 for(const row of rows){const button=document.createElement('button');button.className='health-bar';button.setAttribute('aria-pressed',String(row.date===healthDay));button.setAttribute('aria-label',`${row.date}: ${row.steps??'Unavailable'} steps`);const value=document.createElement('span');value.textContent=row.steps==null?'—':Math.round(row.steps).toLocaleString('en-SG');const bar=document.createElement('i');bar.style.height=Math.max(2,(row.steps||0)/maximum*120)+'px';const label=document.createElement('small');label.textContent=new Date(row.date+'T12:00:00Z').toLocaleDateString('en-SG',{weekday:'short',timeZone:'UTC'});button.append(value,bar,label);button.onclick=()=>{healthDay=row.date;renderHealth();};$('health-bars').append(button);
 const tr=document.createElement('tr');for(const text of [shortDate(row.date),row.steps==null?'—':row.steps.toLocaleString('en-SG'),row.distance_m==null?'—':(row.distance_m/1000).toFixed(2)+' km',row.resting_hr_bpm==null?'—':row.resting_hr_bpm+' bpm',row.sleep?.scores?.overall?.value??row.sleep?.daily_score??'—',row.stress?.average_level??'—']){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('health-table').prepend(tr);
 }
}
$('health-date').onchange=()=>{healthDay=$('health-date').value;renderHealth();};
$('expand-heart').onclick=()=>openHealthChart('heart');$('expand-stress').onclick=()=>openHealthChart('stress');$('chart-zoom-in').onclick=()=>changeChartZoom(1);$('chart-zoom-out').onclick=()=>changeChartZoom(-1);$('chart-zoom-reset').onclick=()=>{chartZoom=1;updateChartZoom();};$('chart-dialog-close').onclick=()=>$('chart-dialog').close();
$('view-health').onclick=()=>{stop();const showing=$('health-panel').hidden;$('health-panel').hidden=!showing;document.querySelector('.map-panel').hidden=showing;setText('view-health',showing?'View running routes':'Health overview');renderHealth();if(!showing&&map){map.invalidateSize();drawMap();}};
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
