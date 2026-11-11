import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/* The web app's handle on the live workout ticker. start / update / end;
   each is a no-op on phones older than iOS 16.1 or with Live Activities
   turned off in Settings, so the workout itself never depends on it. */
@objc(ForgeLiveActivityPlugin)
public class ForgeLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ForgeLiveActivityPlugin"
    public let jsName = "ForgeLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    private static func date(_ millis: Double?) -> Date? {
        guard let millis = millis, millis > 0 else { return nil }
        return Date(timeIntervalSince1970: millis / 1000)
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private func state(_ call: CAPPluginCall) -> ForgeWorkoutAttributes.ContentState {
        ForgeWorkoutAttributes.ContentState(
            title: call.getString("title") ?? "Workout",
            detail: call.getString("detail") ?? "",
            phase: call.getString("phase") ?? "work",
            restEndsAt: Self.date(call.getDouble("restEndsAt")),
            done: call.getInt("done") ?? 0,
            total: call.getInt("total") ?? 0,
            short: call.getString("short")
        )
    }
    #endif

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(["started": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["started": false]); return }
        let content = state(call)
        Task {
            /* One workout at a time: close anything left from an earlier one. */
            for activity in Activity<ForgeWorkoutAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            let attributes = ForgeWorkoutAttributes(
                workoutTitle: call.getString("workoutTitle") ?? "Workout",
                startedAt: Self.date(call.getDouble("startedAt")) ?? Date()
            )
            do {
                _ = try Activity.request(attributes: attributes, content: .init(state: content, staleDate: nil), pushType: nil)
                call.resolve(["started": true])
            } catch {
                call.resolve(["started": false, "error": error.localizedDescription])
            }
        }
        #else
        call.resolve(["started": false])
        #endif
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let content = state(call)
        Task {
            for activity in Activity<ForgeWorkoutAttributes>.activities {
                await activity.update(.init(state: content, staleDate: nil))
            }
            call.resolve()
        }
        #else
        call.resolve()
        #endif
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let finished = call.getBool("finished") ?? false
        let content = state(call)
        Task {
            for activity in Activity<ForgeWorkoutAttributes>.activities {
                /* A finished workout stays on the lock screen a few minutes as
                   "Workout done"; a quit one goes away at once. */
                await activity.end(.init(state: content, staleDate: nil),
                                   dismissalPolicy: finished ? .after(Date().addingTimeInterval(4 * 60)) : .immediate)
            }
            call.resolve()
        }
        #else
        call.resolve()
        #endif
    }
}
