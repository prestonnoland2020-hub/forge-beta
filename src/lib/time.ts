/* A CALENDAR DAY IS WHERE THE ATHLETE IS STANDING, NOT WHERE GREENWICH IS.

   Most of the app already parses stored 'YYYY-MM-DD' dates as local noon,
   which is right: bare `new Date('2026-08-30')` is parsed as UTC midnight, so
   everyone west of Greenwich reads it as the 29th. The places that forgot
   produced dates that shifted with the hour of day — today's session marked
   "Missed" every evening after 5 pm Pacific while the day was still going, a
   race countdown flickering between 11 and 12 weeks, and weekly mileage filed
   under the wrong Monday in New Zealand.

   Noon rather than midnight, so no DST transition can push the parse across a
   day boundary in either direction. */
export function parseLocalDay(iso:string){return new Date(`${String(iso).slice(0,10)}T12:00:00`)}

/* Today as the athlete's own calendar reads it. `toISOString().slice(0,10)` is
   the UTC day, which is never the right answer to "what day is it here". */
export function localDayIso(value:Date=new Date()){
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
}

/* Whole days from today to a stored date, both read in local time. */
export function daysUntil(iso:string){
  return Math.round((parseLocalDay(iso).getTime()-parseLocalDay(localDayIso()).getTime())/86400000);
}

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

/* A RACE TIME, READ THE WAY THE RUNNER MEANT IT. "3:15" on a marathon is
   three hours fifteen, not three minutes fifteen — but a goal saved with the
   unit mm:ss read it as 195 seconds, and Adam's 3:15 marathon showed as out
   of reach while Forge itself put him at about 3:07. A two-part time that
   would mean running faster than 3:00 a mile over the distance is read as
   hours and minutes instead. */
export function goalClockSeconds(target:string,unit:string|undefined,miles=0){
  const text=String(target||'').trim();
  const hoursFirst=/hh/i.test(String(unit||''));
  const seconds=clockToSeconds(text,hoursFirst);
  const twoPart=/\d+:\d+/.test(text)&&!/\d+:\d+:\d+/.test(text);
  if(!hoursFirst&&twoPart&&miles>0&&seconds>0&&seconds/miles<180)return clockToSeconds(text,true);
  return seconds;
}

export function formatGoalTarget(target:string,metric?:string,unit?:string){
  /* A PACE IS READ AS MINUTES AND SECONDS, NEVER AS A DECIMAL. An athlete who
     typed 8.5 for a min/mi goal meant eight-and-a-half minutes — showing
     "8.5" back reads as a stopwatch nobody owns. Convert to 8:30 and say the
     unit the way a runner would. */
  const unitText=String(unit||'');
  const isPace=String(metric).toLowerCase().includes('pace')&&/^min\//i.test(unitText);
  if(isPace){
    const seconds=clockToSeconds(target);
    const suffix=unitText.replace(/^min\//i,'/');
    return seconds?`${decimalMinutesToClock(seconds/60)} ${suffix}`:target;
  }
  const isTime=String(metric).toLowerCase().includes('time')||/minutes?|mm:ss|hh:mm:ss/i.test(unitText);
  if(!isTime)return target;
  const seconds=clockToSeconds(target,/hh:mm:ss/i.test(unitText));
  return seconds?decimalMinutesToClock(seconds/60):target;
}

/* A session's length as people say it: "47 min", "1 h 12 min". */
export const sessionLength=(minutes:number)=>{const total=Math.round(minutes);return total>=60?`${Math.floor(total/60)} h ${total%60} min`:`${total} min`};
