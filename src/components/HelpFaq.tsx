import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { LEGAL } from '../lib/legal';

/* HELP, GROUPED. The FAQ was ten separate cards under a header card that
   only said it was an FAQ — no grouping, no sign that a question opened, and
   a dead end at the bottom. Now the questions sit in labelled groups of rows
   that open in place with a turning chevron, and the page ends with the two
   ways to get an answer it does not have. The answers themselves are
   unchanged. */
const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Top sets and maxes',
    items: [
      ['What is a top set?', 'The one heaviest meaningful set per lift. Warmups, back-offs and accessories are yours to train — the top set is what Forge measures progress from, and every saved one gets a calculated max.'],
      ['Why only one top set per lift, per day?', 'Because it is the cleanest measurement you can take. One hard set taken early, while you are fresh, holds almost everything else still: same lift, same position in the session, same state of fatigue. So when the number moves, the only thing that changed is you. Log every set instead and the total is polluted by how long you rested, how many sets you felt like doing, and how tired you already were — three runners in the same race, and no way to tell which one moved the time. Volume matters for building the muscle; it is a terrible ruler for measuring it. Do all the back-off and accessory work you want — Forge just will not try to read growth out of it.'],
      ['What is a calculated max?', 'An estimate of what you could lift for one rep, from any completed set — heavier or more reps means a higher number. A single (1 rep) is a real 1RM, not an estimate, and it is the only set a Real 1RM goal counts. Forge writes each week of the wave from your closest real evidence: your heavy weeks come from your heavy sets, not from stretching an 8-rep set down to a double.'],
    ],
  },
  {
    title: 'Your plan',
    items: [
      ['How does the plan pick my numbers?', 'A 10-week block of 8/6/4/2/1 waves built from your logged bests. Beat a set and the wave rises; miss one and it holds. Max week tests only lifts you hold a Real 1RM goal on — the attempt is your last real single plus 5–10 lb, and never below the heavy double you just did.'],
      ['Why is the 8/6/4/2/1 wave used on my goal lifts?', 'Because a max is a skill as much as a capacity, and you cannot test it from nowhere. The wave walks you down the rep ladder over five weeks — eight, six, four, two, one — so each week the weight climbs and the reps fall, and by the time you are pulling a single your nervous system has already rehearsed the shape of a heavy one twice. It also gives Forge real evidence at every rung: a calculated max off an 8 is a guess, a double is nearly the real thing, and a single IS the real thing. Test straight off a set of eight and you get a number that is mostly arithmetic. Walk it down and you get a lift.'],
      ['Why are my other lifts on 12/10/8/6 instead?', 'Because they have a different job. Lifts you hold no max goal on are there to build the muscle and support the ones you do test, and that is done with more reps at less weight — enough load to matter, not enough to need a deload or a spotter. Running everything at 8/6/4/2/1 would mean peaking five lifts at once, which is how you arrive at max week already cooked. Twelve down to six keeps the growth stimulus high and the fatigue cost low, so the heavy work has somewhere to go. It is also honest about what Forge will claim: these lifts get progress, not a tested one-rep max.'],
      ['What changes my split cursor?', 'Completing real training on a recommended day advances the cycle. A body-weight check-in or a note never consumes the workout you still owe.'],
    ],
  },
  {
    title: 'Running and connections',
    items: [
      ['How is my weekly running planned?', 'It ramps from what you actually run toward the ceiling you set in your split, deloading on every 2-rep week. The long run is capped at a sane share of the week and near your longest logged run.'],
      ['What does recovery data change?', 'With a Garmin connected, sleep, HRV and resting heart rate set the readiness score: a poor night softens a hard day, and two strained weeks slow the next block’s mileage ramp. Without a watch, Forge leaves recovery out entirely rather than guess.'],
      ['What does Strava add?', 'Recorded runs, rides and rows import automatically into your training log and count toward mileage and endurance goals. Strava does not supply sleep or HRV.'],
    ],
  },
];

export function HelpFaq() {
  return <div className="settings-groups help-faq">
    {GROUPS.map((group, index) => <section key={group.title} aria-labelledby={`faq-group-${index}`}>
      <h3 id={`faq-group-${index}`}>{group.title}</h3>
      <div className="simple-settings-list">
        {group.items.map(([question, answer]) => <details className="faq-row" key={question}>
          <summary><strong>{question}</strong><Icon name="chevron" size={16} stroke={2.4} className="faq-chevron" /></summary>
          <p>{answer}</p>
        </details>)}
      </div>
    </section>)}
    <section aria-labelledby="faq-more">
      <h3 id="faq-more">Still stuck?</h3>
      <div className="simple-settings-list">
        <Link to="/coach"><div><strong>Ask Forge Coach</strong><span>Questions about your own training</span></div><b>›</b></Link>
        <a href={`mailto:${LEGAL.contactEmail}`}><div><strong>Email support</strong><span>{LEGAL.contactEmail}</span></div><b>›</b></a>
      </div>
    </section>
  </div>;
}
