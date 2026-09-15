export function pace(metres, seconds) {
  if (!(metres>0 && seconds>0)) return '—';
  const s=Math.round(seconds/metres*1000);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}
export function duration(seconds) {
  if (seconds==null || !Number.isFinite(seconds)) return '—';
  const s=Math.round(seconds),m=Math.floor(s/60);
  return m>=60 ? `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m` : `${m}:${String(s%60).padStart(2,'0')}`;
}
export function filterRuns(runs,{query='',from='',to=''}={}) {
  return runs.filter(a=>(a.name||'').toLowerCase().includes(query.toLowerCase())&&(!from||(a.date&&a.date>=from))&&(!to||(a.date&&a.date<=to)));
}
export function weeks(runs,count=8,end=new Date().toISOString().slice(0,10)) {
  const d=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  const buckets=Array.from({length:count},(_,i)=>{
    const start=new Date(d);start.setUTCDate(start.getUTCDate()-(count-1-i)*7);
    return {date:start.toISOString().slice(0,10),km:0};
  });
  for(const a of runs){
    if(!a.date)continue;
    const date=new Date(a.date+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
    const b=buckets.find(b=>b.date===date.toISOString().slice(0,10));if(b)b.km+=(a.distance_m||0)/1000;
  }
  return buckets;
}
