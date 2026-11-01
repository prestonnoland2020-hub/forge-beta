/* EVERY WATCH AND HEALTH APP FORGE MEANS TO READ, EACH BY ITS OWN DIRECT
   CONNECTION. Strava is no longer the route in for these devices, so no row
   claims a watch "works via Strava": Garmin is live (its row turns into a
   Connect button once its function secrets are set — see ProfilePage) and
   the rest wait on a developer program approval or a native build, so they
   say "Coming soon" rather than show a Connect button that cannot connect. */

export type ConnectionKind = 'watch' | 'health';

export type CatalogConnection = {
  id: string;
  name: string;
  kind: ConnectionKind;
  data: string[];
  /* Why it is not live yet, for the owner's checklist — never shown to athletes. */
  blocker: 'live' | 'partner-approval' | 'self-serve-app' | 'native-ios' | 'native-android';
};

export const connectionCatalog: CatalogConnection[] = [
  { id: 'apple-watch', name: 'Apple Watch', kind: 'watch', data: ['Workouts', 'Heart rate', 'HRV', 'Sleep'], blocker: 'native-ios' },
  { id: 'garmin', name: 'Garmin', kind: 'watch', data: ['Activities', 'Sleep', 'Stress', 'Body Battery'], blocker: 'live' },
  { id: 'fitbit', name: 'Fitbit & Pixel Watch', kind: 'watch', data: ['Activities', 'Sleep', 'HRV', 'Resting HR'], blocker: 'self-serve-app' },
  { id: 'samsung', name: 'Samsung Galaxy Watch', kind: 'watch', data: ['Exercise', 'Sleep', 'Heart rate'], blocker: 'native-android' },
  { id: 'whoop', name: 'WHOOP', kind: 'watch', data: ['Recovery', 'Strain', 'Sleep', 'HRV'], blocker: 'self-serve-app' },
  { id: 'oura', name: 'Oura Ring', kind: 'watch', data: ['Readiness', 'Sleep', 'HRV', 'Resting HR'], blocker: 'self-serve-app' },
  { id: 'polar', name: 'Polar', kind: 'watch', data: ['Training sessions', 'Sleep', 'Nightly recharge'], blocker: 'self-serve-app' },
  { id: 'coros', name: 'COROS', kind: 'watch', data: ['Activities', 'Sleep', 'Heart rate'], blocker: 'partner-approval' },
  { id: 'suunto', name: 'Suunto', kind: 'watch', data: ['Workouts', 'Sleep', 'Heart rate'], blocker: 'partner-approval' },
  { id: 'wahoo', name: 'Wahoo', kind: 'watch', data: ['Rides', 'Runs', 'Heart rate'], blocker: 'partner-approval' },
  { id: 'apple-health', name: 'Apple Health', kind: 'health', data: ['Sleep', 'HRV', 'Resting HR', 'Workouts', 'Body weight'], blocker: 'native-ios' },
  { id: 'health-connect', name: 'Health Connect', kind: 'health', data: ['Sleep', 'Resting HR', 'Exercise sessions', 'Body weight'], blocker: 'native-android' },
  { id: 'withings', name: 'Withings', kind: 'health', data: ['Body weight', 'Body composition', 'Sleep'], blocker: 'self-serve-app' },
];
