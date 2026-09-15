// Illustrative route sketches, never presented as the user's measurements.
export function demoRuns(){
 const sketches=[
 ['Marina Bay loop',[[1.2867,103.8545],[1.2903,103.8555],[1.293,103.8588],[1.2944,103.8618],[1.2908,103.8633],[1.288,103.8611],[1.2847,103.8594],[1.2817,103.857],[1.2802,103.8542],[1.2819,103.8516],[1.2852,103.8524],[1.2867,103.8545]],5.2,1716,22,1],
 ['East Coast morning',[[1.2988,103.9122],[1.2997,103.919],[1.3013,103.9265],[1.3026,103.9338],[1.3032,103.941],[1.3026,103.9338],[1.3013,103.9265],[1.2997,103.919],[1.2988,103.9122]],8.4,2805,15,3],
 ['Gardens by the Bay',[[1.282,103.864],[1.2838,103.866],[1.2822,103.87],[1.2796,103.872],[1.2765,103.8708],[1.2773,103.8671],[1.2795,103.8642],[1.282,103.864]],4.1,1394,19,6],
 ['Bishan park trails',[[1.362,103.831],[1.364,103.835],[1.3655,103.839],[1.3643,103.843],[1.362,103.845],[1.36,103.842],[1.361,103.837],[1.361,103.833],[1.362,103.831]],6.3,2142,36,10],
 ['Botanic Gardens easy',[[1.31,103.817],[1.312,103.8155],[1.315,103.815],[1.318,103.816],[1.3185,103.8175],[1.3155,103.8185],[1.312,103.8185],[1.31,103.817]],3.6,1320,43,17],
 ['Kallang riverside',[[1.301,103.866],[1.303,103.867],[1.306,103.868],[1.31,103.8685],[1.311,103.8705],[1.307,103.871],[1.3035,103.870],[1.301,103.866]],5.8,1940,27,24]
 ];
 return sketches.map(([name,knots,km,duration,gain,days],index)=>{
   const points=[];
   for(let j=0;j<knots.length-1;j++)for(let k=0;k<16;k++){
     const t=k/16;points.push([knots[j][0]*(1-t)+knots[j+1][0]*t,knots[j][1]*(1-t)+knots[j+1][1]*t,12+8*Math.sin((j+t)*.8)+2*Math.sin((j+t)*3),null]);
   }
   points.push([...knots.at(-1),12,null]);points.forEach((p,i)=>p[3]=i/(points.length-1)*duration);
   const date=new Date();date.setUTCDate(date.getUTCDate()-days);
   return {id:'demo-'+index,name,date:date.toISOString().slice(0,10),distance_m:km*1000,duration_s:duration,elevation_gain_m:gain,average_hr_bpm:[145,151,139,154,133,148][index],max_hr_bpm:[168,175,158,178,149,169][index],segments:[points],route_trimmed:false,trim_m:0};
 });
}
