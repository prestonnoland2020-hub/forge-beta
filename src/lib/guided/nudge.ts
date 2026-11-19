/* THE "NEVER TRIED COACH ME" LINE.

   One plain sentence on Today's existing Coach me card for someone who has
   never finished a guided workout. At most once a day, gone for good after
   their first guided workout or their second dismissal. No new card, banner
   or pop-up. Pure functions so the rule is testable. */

export const NUDGE_KEY = 'forge-guided-nudge-v1';
export const NUDGE_LINE = "Want me to run today's workout for you? Tap Coach me and I'll talk you through it.";

export type NudgeState = { dismissals: number; lastDismissed?: string };

/* Shown when they have never done a guided workout, have dismissed it fewer
   than twice, and have not already dismissed it today. */
export function showNudge(state: NudgeState | null | undefined, guidedDone: number, today: string): boolean {
  if (guidedDone > 0) return false;
  const seen = state || { dismissals: 0 };
  if (seen.dismissals >= 2) return false;
  return seen.lastDismissed !== today;
}

export function dismissNudge(state: NudgeState | null | undefined, today: string): NudgeState {
  return { dismissals: (state?.dismissals || 0) + 1, lastDismissed: today };
}
