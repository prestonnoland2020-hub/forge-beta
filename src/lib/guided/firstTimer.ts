/* "DID SOMETHING DIFFERENT?" HINT. On the first weighted card of a guided
   workout the coach says one short sentence: tell me the weight and reps and
   I'll log it, no typing. Said once per workout, not on every card. */
export const FIRST_TIMER_HINT = 'Did something different? Just tell me the weight and reps.';

export const wantsFirstTimerHint = (weight: number | null, setNo: number, alreadySaid: boolean) =>
  !alreadySaid && weight !== null && setNo === 0;
