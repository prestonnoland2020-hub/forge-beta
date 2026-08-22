export type MuscleStatus = {
  muscle: string;
  sessions: number;
  target: number;
  lastTrained: string;
  readiness: number;
  status: 'On target' | 'Due' | 'Recovering';
};

export const dailyRecommendation = {
  day: 'Day 3 · Lower Body',
  title: 'Lower Strength + Speed',
  confidence: 92,
  readiness: 84,
  duration: '70–80 min',
  reason: 'Your rolling split is due for lower body. Quads and glutes are recovered, your last squat top set improved, and tomorrow is unscheduled.',
  topSet: {
    exercise: 'Squat',
    weight: 460,
    reps: 3,
    calculatedMax: 506,
    priorWeight: 455,
    priorReps: 3,
    rationale: 'A 5 lb increase at the same rep count. This is based on your last comparable set—not your 500 lb goal.',
  },
  topSets: [
    { exercise:'Squat', weight:460, reps:3, calculatedMax:506, change:'+5 lb at 3 reps' },
    { exercise:'Hack Squat', weight:505, reps:3, calculatedMax:556, change:'+5 lb at 3 reps' },
    { exercise:'Romanian Deadlift', weight:315, reps:6, calculatedMax:378, change:'Repeat load · add 1 rep' },
  ],
  support: [
    { exercise: 'Hack Squat', prescription: '3 × 6–8', purpose: 'Quad volume' },
    { exercise: 'Romanian Deadlift', prescription: '3 × 8', purpose: 'Hamstrings' },
    { exercise: 'Calf Raise', prescription: '3 × 12–15', purpose: 'Lower-leg balance' },
  ],
  cardio: {
    title: 'Speed intervals',
    prescription: '6 × 600 m at 5K pace',
    detail: '2:04–2:08 per rep · 2:00 recovery · 1 mi warm-up + cooldown',
    reason: 'Supports your sub-25:00 5K goal without adding excessive fatigue before the next cycle day.',
  },
};

export const muscleFrequency: MuscleStatus[] = [
  { muscle: 'Chest', sessions: 2, target: 2, lastTrained: '2 days ago', readiness: 72, status: 'On target' },
  { muscle: 'Back', sessions: 1, target: 2, lastTrained: '4 days ago', readiness: 91, status: 'Due' },
  { muscle: 'Shoulders', sessions: 2, target: 2, lastTrained: '2 days ago', readiness: 68, status: 'On target' },
  { muscle: 'Quads', sessions: 1, target: 2, lastTrained: '5 days ago', readiness: 94, status: 'Due' },
  { muscle: 'Hamstrings', sessions: 1, target: 2, lastTrained: '5 days ago', readiness: 88, status: 'Due' },
  { muscle: 'Glutes', sessions: 1, target: 2, lastTrained: '5 days ago', readiness: 92, status: 'Due' },
  { muscle: 'Biceps', sessions: 1, target: 2, lastTrained: '3 days ago', readiness: 82, status: 'Due' },
  { muscle: 'Triceps', sessions: 2, target: 2, lastTrained: '2 days ago', readiness: 66, status: 'Recovering' },
];

export const upcomingPlan = [
  { day: 'TODAY', name: 'Lower Strength + Speed', type: 'Train', note: 'Squat progression · 6 × 600 m' },
  { day: 'TUE', name: 'Recovery', type: 'Recover', note: 'Walk + mobility · optional' },
  { day: 'WED', name: 'Upper Volume', type: 'Train', note: 'Chest + back frequency' },
  { day: 'FRI', name: 'Easy Aerobic', type: 'Cardio', note: '35 min conversational pace' },
  { day: 'SAT', name: 'Push Strength', type: 'Train', note: 'Bench progression' },
];

export const coachingSignals = [
  { label: 'Split position', value: 'Day 3 of 4', detail: 'Lower Body is next' },
  { label: 'Strength trend', value: '+1.8%', detail: 'Calculated max · 30 days' },
  { label: 'Muscle balance', value: '3 due', detail: 'Quads · Hamstrings · Back' },
  { label: 'Cardio goal', value: '26:12', detail: 'Projected 5K · −48 sec' },
];

export const recentWorkouts = [
  { id: 'lower-aug-1', date: 'Aug 1', name: 'Lower Body', detail: 'Squat · Hack Squat · 20 min easy run', muscles: ['Quads','Hamstrings','Glutes'], exercises: ['Squat','Hack Squat'] },
  { id: 'push-jul-30', date: 'Jul 30', name: 'Push Strength', detail: 'Bench · Shoulder Press · Triceps', muscles: ['Chest','Shoulders','Triceps'], exercises: ['Bench Press','Smith Machine Shoulder Press'] },
  { id: 'pull-jul-28', date: 'Jul 28', name: 'Pull Strength', detail: 'Deadlift · Pull Ups · Lat Pulldown', muscles: ['Back','Biceps','Forearms'], exercises: ['Pull Ups','Lat Pulldown'] },
];
