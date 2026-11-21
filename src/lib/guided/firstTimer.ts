/* FIRST-TIMER HINT. On an athlete's first guided workout the first weighted
   card says, once, that they never have to type: just tell the coach what they
   did. Remembered per device so it is never said twice. */
export const FIRST_TIMER_KEY = 'forge-guided-said-hint';
export const FIRST_TIMER_HINT = "Did something different? Just tell me, like 'I did 225 for 5'.";

export const wantsFirstTimerHint = (part: string, weight: number | null, setNo: number, alreadySaid: boolean) =>
  !alreadySaid && part === 'main' && weight !== null && setNo === 0;
