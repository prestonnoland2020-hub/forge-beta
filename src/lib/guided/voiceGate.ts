/* THE LOUDNESS GATE. In a gym, other people talk. A clip that is clearly
   quieter than the athlete's own voice is someone else, far away, so it is not
   sent to forge-voice (fewer false triggers, fewer paid clips).

   Conservative by design: it only drops a clip more than DROP_DB below the
   athlete's level, it does nothing until a level is known, and if it drops
   RELAX_AFTER clips in a row inside RELAX_WINDOW_MS it switches itself off for
   the rest of the session — the athlete must never be "unheard". */

export const DROP_DB = 12;
export const RELAX_AFTER = 3;
export const RELAX_WINDOW_MS = 20000;

export const toDb = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-6));

export class LoudnessGate {
  /* The athlete's own voice level in dB; null until learned. */
  level: number | null = null;
  relaxed = false;
  /* Total clips dropped this session, for the voice_events count. */
  dropped = 0;
  private streak: number[] = [];

  /* The voice check always sets the level. A command only teaches it when
     nothing has yet. */
  setLevel(db: number, force = false) { if (Number.isFinite(db) && (force || this.level === null)) this.level = db; }

  /* True when the clip should go to forge-voice. */
  allow(db: number, now: number): boolean {
    if (this.relaxed || this.level === null || !Number.isFinite(db)) { this.streak = []; return true; }
    if (db >= this.level - DROP_DB) { this.streak = []; return true; }
    this.streak = [...this.streak.filter(time => now - time <= RELAX_WINDOW_MS), now];
    this.dropped += 1;
    if (this.streak.length >= RELAX_AFTER) { this.relaxed = true; this.streak = []; }
    return false;
  }
}
