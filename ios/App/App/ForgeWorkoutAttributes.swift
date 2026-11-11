import Foundation
#if canImport(ActivityKit)
import ActivityKit

/* THE LIVE WORKOUT TICKER, as data. Shared by the app (which starts and
   updates it) and the widget extension (which draws it on the lock screen and
   in the Dynamic Island). The clock numbers are drawn by iOS from the dates,
   so they keep counting while Forge is in the background. */
@available(iOS 16.1, *)
public struct ForgeWorkoutAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /* What she is doing now: "Goblet squat", "Rest", "Paused". */
        public var title: String
        /* The line under it: "Set 2 of 3 · 12 reps", "Next: Glute bridge". */
        public var detail: String
        /* "work", "rest" or "paused". */
        public var phase: String
        /* Rest counts down to this; nil outside rest. */
        public var restEndsAt: Date?
        /* Moves done of the whole workout, for the progress bar. */
        public var done: Int
        public var total: Int
        /* A word or two for the small Dynamic Island: "2/3", "Rest". */
        public var short: String?
    }
    /* The workout's name, and when it started (the elapsed clock). */
    public var workoutTitle: String
    public var startedAt: Date
}
#endif
