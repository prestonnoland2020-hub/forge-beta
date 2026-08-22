import type { DailyHealthSnapshot,WearableProvider } from '../../lib/recoveryEngine';

export type WearableConnection={provider:WearableProvider;status:'Connected'|'Available'|'Requires native app'|'Partner approval required';lastSync?:string;capabilities:string[]};
export const wearableConnections:WearableConnection[]=[
  {provider:'Apple Health',status:'Requires native app',capabilities:['Sleep','HRV','Resting HR','Workouts','Heart-rate zones']},
  {provider:'Health Connect',status:'Requires native app',capabilities:['Sleep','HRV when supplied','Resting HR','Exercise sessions','Planned workouts']},
  {provider:'Garmin',status:'Partner approval required',capabilities:['Sleep','Stress','Heart rate','Activities','Body Battery']},
  {provider:'Fitbit',status:'Available',capabilities:['Sleep','HRV','Resting HR','Activities','SpO₂']},
];
export interface WearableAdapter{provider:WearableProvider;authorize():Promise<void>;sync(from:string,to:string):Promise<DailyHealthSnapshot[]>}
export const normalizeWearableDay=(provider:WearableProvider,input:Partial<DailyHealthSnapshot>&{date:string}):DailyHealthSnapshot=>({provider,date:input.date,sleepMinutes:input.sleepMinutes||0,sleepEfficiency:input.sleepEfficiency,hrvRmssd:input.hrvRmssd,restingHr:input.restingHr,respiratoryRate:input.respiratoryRate,skinTempDeltaC:input.skinTempDeltaC,steps:input.steps,activeCalories:input.activeCalories,acuteLoad:input.acuteLoad,sourceUpdatedAt:input.sourceUpdatedAt||new Date().toISOString()});
