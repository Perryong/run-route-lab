import {pace,duration,filterRuns,weeks} from './model.js';
import {demoRuns} from './demo.js';
const $=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};
let actual=[],all=[],filtered=[],selected=null,demo=false,playing=false,frame=0,replay=0,speed=1,lastTime=0,edges=[],totalLength=0;
let map,layer,marker,overview=false,actualHealth=[],healthDay='';
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
 return Array.from({length:7},(_,i)=>{const d=new Date();d.setUTCDate(d.getUTCDate()-(6-i));return {date:d.toISOString().slice(0,10),steps:[8420,11230,6780,12460,9130,14520,7340][i],distance_m:[6120,8400,4890,9230,6720,10560,5340][i],resting_hr_bpm:[57,56,58,55,56,54,57][i],average_hr_bpm:[74,77,73,78,75,80,72][i],max_hr_bpm:[142,166,119,172,145,176,132][i]};});
}
function renderHealth(){
 const rows=demo?demoHealth():actualHealth;
 if(!rows.some(r=>r.date===healthDay))healthDay=rows.at(-1)?.date||'';
 const selector=$('health-date');selector.replaceChildren();
 for(const row of [...rows].reverse()){const o=document.createElement('option');o.value=row.date;o.textContent=shortDate(row.date);selector.append(o);}selector.value=healthDay;selector.disabled=!rows.length;
 const r=rows.find(r=>r.date===healthDay)||{};
 setText('health-source',demo?'DEMO · illustrative readings, not your health data':'Garmin daily readings · latest successful sync');
 $('health-empty').hidden=rows.length>0;
 setText('health-steps',r.steps==null?'—':Math.round(r.steps).toLocaleString('en-SG'));
 setText('health-distance',r.distance_m==null?'—':(r.distance_m/1000).toFixed(2)+' km');
 setText('health-rest',r.resting_hr_bpm??'—');setText('health-average',r.average_hr_bpm??'—');setText('health-max',r.max_hr_bpm??'—');
 $('health-bars').replaceChildren();$('health-table').replaceChildren();const maximum=Math.max(1,...rows.map(r=>r.steps||0));
 for(const row of rows){const button=document.createElement('button');button.className='health-bar';button.setAttribute('aria-pressed',String(row.date===healthDay));button.setAttribute('aria-label',`${row.date}: ${row.steps??'Unavailable'} steps`);const value=document.createElement('span');value.textContent=row.steps==null?'—':Math.round(row.steps).toLocaleString('en-SG');const bar=document.createElement('i');bar.style.height=Math.max(2,(row.steps||0)/maximum*120)+'px';const label=document.createElement('small');label.textContent=new Date(row.date+'T12:00:00Z').toLocaleDateString('en-SG',{weekday:'short',timeZone:'UTC'});button.append(value,bar,label);button.onclick=()=>{healthDay=row.date;renderHealth();};$('health-bars').append(button);
 const tr=document.createElement('tr');for(const text of [shortDate(row.date),row.steps==null?'—':row.steps.toLocaleString('en-SG'),row.distance_m==null?'—':(row.distance_m/1000).toFixed(2)+' km',row.resting_hr_bpm==null?'—':row.resting_hr_bpm+' bpm']){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('health-table').prepend(tr);
 }
}
$('health-date').onchange=()=>{healthDay=$('health-date').value;renderHealth();};
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
