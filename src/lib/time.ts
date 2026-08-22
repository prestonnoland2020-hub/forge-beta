export function decimalMinutesToClock(value:number){
  const seconds=Math.max(0,Math.round(value*60));
  const hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),remainder=seconds%60;
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`:`${minutes}:${String(remainder).padStart(2,'0')}`;
}

export function clockToSeconds(value:string,hoursFirst=false){
  const cleaned=String(value||'').trim();
  const clock=cleaned.match(/\d+(?::\d+){1,2}/)?.[0];
  if(clock){
    const parts=clock.split(':').map(Number);
    if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];
    return hoursFirst?parts[0]*3600+parts[1]*60:parts[0]*60+parts[1];
  }
  const decimal=Number.parseFloat(cleaned);
  return Number.isFinite(decimal)?decimal*60:0;
}

export function formatGoalTarget(target:string,metric?:string,unit?:string){
  const isTime=String(metric).toLowerCase().includes('time')||/minutes?|mm:ss|hh:mm:ss/i.test(String(unit));
  if(!isTime)return target;
  const seconds=clockToSeconds(target,/hh:mm:ss/i.test(String(unit)));
  return seconds?decimalMinutesToClock(seconds/60):target;
}
