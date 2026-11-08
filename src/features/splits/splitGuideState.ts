/* WHETHER THE SPLIT GUIDE HAS BEEN OFFERED. 'done' after it builds a split,
   'later' when the athlete says not now; unset means Home asks. FRESH carries
   the new split's name to Home once, for the "your split is ready" line. */
export const SPLIT_GUIDE_KEY = 'forge-split-guide-v1';
export const SPLIT_GUIDE_FRESH_KEY = 'forge-split-guide-fresh';
export const readGuideState = (): string | null => { try { return localStorage.getItem(SPLIT_GUIDE_KEY); } catch { return null; } };
