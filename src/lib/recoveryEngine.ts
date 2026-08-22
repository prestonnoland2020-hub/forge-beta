export type WearableProvider='Apple Health'|'Health Connect'|'Garmin'|'Fitbit'|'Unavailable';
export type DailyHealthSnapshot={date:string;provider:WearableProvider;sleepMinutes:number;sleepEfficiency?:number;hrvRmssd?:number;restingHr?:number;respiratoryRate?:number;skinTempDeltaC?:number;steps?:number;activeCalories?:number;acuteLoad?:number;sourceUpdatedAt:string};
export type RecoveryState={date:string;readiness:number;strengthFatigue:'Low'|'Moderate'|'High';confidence:'Low'|'Medium'|'High';sleepScore:number;autonomicScore:number;loadScore:number;reasons:string[];hardTrainingAllowed:boolean};
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const percent=(value:number,baseline:number,inverse=false)=>baseline?clamp(100+(inverse?-1:1)*(value/baseline-1)*180,35,100):70;

export function deriveRecoveryState(today:DailyHealthSnapshot,history:DailyHealthSnapshot[],strengthLoad7d:number,injuryConstraint:boolean):RecoveryState{
  const strengthFatigue=strengthLoad7d>=22?'High':strengthLoad7d>=11?'Moderate':'Low';
  if(today.provider==='Unavailable')return{date:today.date,readiness:100,confidence:'Low',sleepScore:0,autonomicScore:0,loadScore:0,strengthFatigue,reasons:['No smartwatch data synced','Recovery is not being used to change coaching or training'],hardTrainingAllowed:!injuryConstraint};
  const prior=history.filter(item=>item.date<today.date).slice(-28);const hrvBase=mean(prior.map(x=>x.hrvRmssd||0).filter(Boolean));const rhrBase=mean(prior.map(x=>x.restingHr||0).filter(Boolean));const sleepBase=mean(prior.map(x=>x.sleepMinutes||0).filter(Boolean));
  const sleepDuration=clamp((today.sleepMinutes/480)*100);const sleepConsistency=sleepBase?percent(today.sleepMinutes,sleepBase):75;const sleepScore=Math.round(sleepDuration*.75+sleepConsistency*.25);
  const hrvScore=today.hrvRmssd?percent(today.hrvRmssd,hrvBase):70;const rhrScore=today.restingHr?percent(today.restingHr,rhrBase,true):70;const autonomicScore=Math.round(hrvScore*.65+rhrScore*.35);
  const acuteLoad=(today.acuteLoad||0)+strengthLoad7d;const loadScore=Math.round(clamp(100-acuteLoad*2.1,30,100));const missing=[today.hrvRmssd,today.restingHr,today.sleepMinutes].filter(value=>!value).length;const confidence=missing===0&&prior.length>=14?'High':missing<=1&&prior.length>=7?'Medium':today.sleepMinutes?'Medium':'Low';
  let readiness=missing===3?100:Math.round(sleepScore*.38+autonomicScore*.37+loadScore*.25);if(injuryConstraint)readiness=Math.min(readiness,35);const reasons=missing===3?['Smartwatch sync is missing today','Recovery is not being used to change coaching or training']:[`${Math.round(today.sleepMinutes/60*10)/10} hr sleep`,today.hrvRmssd?`HRV ${Math.round(today.hrvRmssd)} ms vs ${Math.round(hrvBase||today.hrvRmssd)} baseline`:'HRV unavailable',today.restingHr?`Resting HR ${Math.round(today.restingHr)} bpm`:'Resting HR unavailable',`${strengthLoad7d.toFixed(0)} strength-load points in 7 days`];if(injuryConstraint)reasons.unshift('Injury constraint active');
  return{date:today.date,readiness,confidence,sleepScore,autonomicScore,loadScore,strengthFatigue,reasons,hardTrainingAllowed:!injuryConstraint&&(missing===3||readiness>=60)};
}
