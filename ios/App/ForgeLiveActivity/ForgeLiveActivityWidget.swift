import SwiftUI
import WidgetKit
import ActivityKit

/* THE LIVE WORKOUT TICKER, drawn. Lock screen banner and Dynamic Island while
   a coached workout runs and Forge is in the background. Every number that
   moves is a SwiftUI timer, so iOS keeps it counting without the app. */

private let lime = Color(red: 0.86, green: 1.0, blue: 0.31)
private let ink = Color(red: 0.043, green: 0.063, blue: 0.055)

@available(iOS 16.2, *)
private struct Clock: View {
    let context: ActivityViewContext<ForgeWorkoutAttributes>
    var body: some View {
        if context.state.phase == "rest", let end = context.state.restEndsAt, end > Date() {
            Text(timerInterval: Date()...end, countsDown: true)
                .monospacedDigit()
        } else if context.state.phase == "done" {
            Text("Done")
        } else {
            Text(context.attributes.startedAt, style: .timer)
                .monospacedDigit()
        }
    }
}

@available(iOS 16.2, *)
private struct Progress: View {
    let done: Int
    let total: Int
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.16))
                Capsule().fill(lime)
                    .frame(width: total > 0 ? geo.size.width * CGFloat(min(done, total)) / CGFloat(total) : 0)
            }
        }
        .frame(height: 5)
    }
}

@available(iOS 16.2, *)
private struct LockScreen: View {
    let context: ActivityViewContext<ForgeWorkoutAttributes>
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.phase == "rest" ? "REST" : context.attributes.workoutTitle.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(lime)
                    Text(context.state.title)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if !context.state.detail.isEmpty {
                        Text(context.state.detail)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(1)
                    }
                }
                Spacer()
                Clock(context: context)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(context.state.phase == "rest" ? lime : .white)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 120, alignment: .trailing)
            }
            Progress(done: context.state.done, total: context.state.total)
        }
        .padding(16)
        .activityBackgroundTint(ink)
        .activitySystemActionForegroundColor(lime)
    }
}

@available(iOS 16.2, *)
struct ForgeLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ForgeWorkoutAttributes.self) { context in
            LockScreen(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.phase == "rest" ? "Rest" : context.state.title)
                            .font(.headline).lineLimit(1)
                        Text(context.state.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Clock(context: context)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundStyle(lime)
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Progress(done: context.state.done, total: context.state.total).padding(.top, 6)
                }
            } compactLeading: {
                if let short = context.state.short, !short.isEmpty {
                    Text(short)
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(lime)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .frame(maxWidth: 52)
                } else {
                    Image(systemName: context.state.phase == "rest" ? "pause.circle.fill" : "figure.strengthtraining.traditional")
                        .foregroundStyle(lime)
                }
            } compactTrailing: {
                Clock(context: context)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(lime)
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "figure.strengthtraining.traditional").foregroundStyle(lime)
            }
            .keylineTint(lime)
        }
    }
}

@main
struct ForgeLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        ForgeLiveActivityWidget()
    }
}
