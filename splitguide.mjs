/* A GUIDE FOR BUILDING A SPLIT — one question per screen, no confusion.

   Covers: the guide's steps and plain explanations, the Forge-recommends vs
   you-decide cardio choice, saving straight to Today, Home asking a new
   athlete once, the coach opening the guide, and swipe-to-delete days down to
   a one-day split. The full flow was also driven in a browser (see the PR). */
import { readFileSync } from 'node:fs';
import { localActions, parseActions, whereItGoes } from './src/lib/coachActions.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const guide = readFileSync('src/components/SplitGuide.tsx', 'utf8');
const page = readFileSync('src/pages/TrainingPlanPage.tsx', 'utf8');
const prompt = readFileSync('src/components/SplitGuidePrompt.tsx', 'utf8');
const home = readFileSync('src/pages/HomePage.tsx', 'utf8');
const CTX = { splitDays: [], goals: [], activeNoteAreas: [], exercises: [], weeklyMileage: 0, runningDays: 0, loadBiasPercent: 0 };

console.log('\nThe guide asks one thing at a time and says what it means');
check('it says what a split is before asking anything', /Your <b>split<\/b> is the set of training days you repeat/.test(guide));
check('a template or your own', /How do you want to start\?/.test(guide) && /Build my own/.test(guide));
check('how many days, and one is allowed', /How many days are in your split\?/.test(guide) && /\[1, 2, 3, 4, 5, 6, 7\]/.test(guide) && /<b>1 is fine<\/b>/.test(guide));
check('in order vs fixed weekdays, explained', /In order <em className="sg-badge">Recommended<\/em>/.test(guide) && /On fixed weekdays/.test(guide));
check('each day: what kind of day, with what each kind means', /What kind of day is it\?/.test(guide) && /says: 'Strength training/.test(guide) && /says: 'Running, biking or rowing/.test(guide));
check('lifts: the top set is explained where they are picked', /Each lift you pick gets one <b>top set<\/b>/.test(guide));
check('a lift can be created right there', /Create “\{typed\}” as a new lift/.test(guide) && /addExercise\(\{ name: liftName, kind: 'Strength'/.test(guide));
check('it will not move on from a lifting day with no lift', /Pick at least one lift/.test(guide));
check('progress shows where they are', /\['Start', 'Order', 'Your days', 'Review'\]/.test(guide) && /Day \{step\.index \+ 1\} of \{days\.length\}/.test(guide));

console.log('\nCardio: Forge recommends vs you decide, side by side');
check('two choices, each saying what it does', /Forge recommends <em className="sg-badge">Easiest<\/em>/.test(guide) && /You decide/.test(guide) && /changes it week to week as you get fitter/.test(guide) && /It stays the same every time this day comes up/.test(guide));
check('a comparison table says the difference', /Changes as you improve/.test(guide) && /Same session every time/.test(guide));
check('you decide means picking a session', /Pick a session, or let Forge recommend/.test(guide));

console.log('\nSaving goes straight to Today');
check('the last step says where it goes', /Save and see Today/.test(guide));
check('it saves now, not on a timer the page would cancel', /const planState=writeSplitLocally\(/.test(page) && /await writeSplitToServer\(result\.name,result\.days\)/.test(page));
check('and lands on Home', /navigate\('\/'\);\n  \};/.test(page));
check('what they had is kept in their saved splits', /keepCurrent\(\)\.items/.test(page.slice(page.indexOf('const finishGuide'))));
check('Home says the split is ready, once', /<SplitReadyNote dayName=\{recommendation\.splitDay\.name\}/.test(home) && /Your split “\{fresh\}” is ready\./.test(prompt));

console.log('\nNew athletes are asked; everyone can find it');
check('Home asks someone on the starter split, once', /Do you want to make your split\?/.test(prompt) && /setup\?\.splitSource !== 'Custom'/.test(prompt) && /<SplitGuidePrompt \/>/.test(home));
check('"not now" keeps the starter split and stops asking', /Not now — keep the starter split/.test(prompt) && /SPLIT_GUIDE_KEY, 'later'/.test(prompt));
check('the split page has a way in', /Build your split step by step/.test(page) && /ss-guide-entry/.test(page));
check('so does Profile', /to="\/split\?guide=1"><div><strong>Split guide/.test(readFileSync('src/pages/ProfilePage.tsx', 'utf8')));

console.log('\nThe coach can open the guide');
const asked = localActions('How do I build my split?', CTX);
check('"how do I build my split?" offers the guide', asked[0]?.type === 'open_split_guide', JSON.stringify(asked));
check('so does "walk me through making my split"', localActions('can you walk me through making my split', CTX)[0]?.type === 'open_split_guide');
check('a split question about something else does not', localActions('my split squat feels heavy', CTX).every(action => action.type !== 'open_split_guide'));
check('the server action is accepted', parseActions([{ type: 'open_split_guide' }], CTX)[0]?.type === 'open_split_guide');
check('and it leads to the guide', whereItGoes({ type: 'open_split_guide', label: '' }).to === '/split?guide=1');
const coachPage = readFileSync('src/pages/CoachPage.tsx', 'utf8');
check('tapping it closes the coach and opens the guide', /action\.type==='open_split_guide'\)\)\{setPending\(null\);window\.dispatchEvent\(new Event\('forge:close-coach'\)\);navigate\('\/split\?guide=1'\)/.test(coachPage) && /'Open the guide'/.test(coachPage));
check('the coach is told when to use it', /open_split_guide — the athlete asks how to build/.test(readFileSync('supabase/functions/forge-coach/index.ts', 'utf8')));

console.log('\nSwipe a day to delete it; a split can be one day');
check('a day row swipes left to reveal Delete', /className="ss-day-delete"/.test(page) && /setSwipeOffset\(Math\.max\(-DAY_REVEAL/.test(page));
check('deleting needs the second tap on Delete', /onClick=\{\(\)=>deleteDayAt\(index\)\}/.test(page));
check('the last day cannot be deleted, one day is a split', /const deleteDayAt=\(index:number\)=>\{if\(days\.length<=1\)return;/.test(page) && /const deletable=days\.length>1;/.test(page));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
