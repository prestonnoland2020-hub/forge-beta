/* WHOSE COPY OF THE SETUP IS THE REAL ONE.

   athlete_settings is the reinstall-proof copy and localStorage is the fast
   cache, and the loader chose between them with `scoped || remoteSetup`: the
   local copy won, always, for the life of the install.

   That is fine while one device does all the writing, and wrong the moment
   anything else does. Preston answered "yes, that 5:19 was real" and the
   answer went to his account — `excludedEfforts` on the server carried
   `ok:2026-07-29|1.00|319`. His phone's cache had been written before that and
   therefore outranked it for ever, so on the phone the 5:19 was still an
   unanswered standout, the fit threw it out, and the mile projection read 5:49
   against a 5:18 he had actually run. The card said "best logged evidence
   5:18" directly above a projection that did not believe it.

   THE RULE. The local cache wins only while it is the newer of the two. Every
   local save stamps the moment it happened; the server row carries its own
   updated_at; whichever is later is the athlete's current answer. With no
   stamp — a cache written before this existed — the server wins, because a
   cache of unknown age is not evidence of anything.

   This is deliberately not a field-by-field merge. Two half-merged setups is a
   third setup neither device agreed to, and the failures it produces are far
   harder to see than a stale one. */

export type SetupChoice = 'local' | 'remote' | 'legacy' | 'none';

export function freshestSetup(input: {
  hasLocal: boolean;
  localSavedAt?: string | null;
  hasRemote: boolean;
  remoteUpdatedAt?: string | null;
  hasLegacy?: boolean;
}): SetupChoice {
  const { hasLocal, localSavedAt, hasRemote, remoteUpdatedAt, hasLegacy = false } = input;
  if (hasLocal && hasRemote) {
    /* A stamped local save is only preferred while it is genuinely later. Equal
       timestamps go to local: a save writes both, and the local one is what the
       athlete is looking at. */
    if (localSavedAt && (!remoteUpdatedAt || localSavedAt >= remoteUpdatedAt)) return 'local';
    return 'remote';
  }
  if (hasLocal) return 'local';
  if (hasRemote) return 'remote';
  return hasLegacy ? 'legacy' : 'none';
}
