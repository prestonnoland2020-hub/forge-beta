import Foundation
import AVFoundation
import Speech
import Capacitor
import UIKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/* THE COACH'S EARS AND MOUTH, NATIVE (iPhone app).

   A web page on iPhone cannot hold the microphone open without the coach's
   voice dropping to phone-call sound, and cannot reopen it without a tap. So
   in the app the voice runs here, the way workout apps do it:

   - Listening: iPhone's own speech recognition, on the device, always on
     during a workout. No taps. It is muted while the coach talks, so it never
     hears itself. Partial words are sent to the web app as they come, so
     "done" acts at once; a phrase ends after a short pause.
   - Speaking: the coach's mp3 lines play here at full quality. AirPods stay
     in high-quality mode (the phone's own mic listens), and music ducks only
     while the coach is talking.

   Events to the web app: "heard" { text, final }. */
@objc(ForgeVoicePlugin)
public class ForgeVoicePlugin: CAPPlugin, CAPBridgedPlugin, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    public let identifier = "ForgeVoicePlugin"
    public let jsName = "ForgeVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "permission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPlaying", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setScript", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeBackground", returnType: CAPPluginReturnPromise),
    ]

    /* ---------- The background coach ----------
       While Forge is in the background iPhone pauses the web app, which is
       where the workout's decisions live. So the web app keeps a short script
       here — the next moves, sets and rests, with the coach's lines already
       recorded — and while the app is in the background this runs it: plays
       the line, listens for "done", asks how it felt, counts the rest, calls
       the next set. Everything done here is logged; when she opens Forge the
       web app takes the log and catches up (takeBackground). */
    private struct Beat {
        let id: String
        let kind: String        // card, feel, rest, end
        let line: String
        let seconds: Double     // rest length, or a timed move's length
        let timed: Bool
        let perSide: Bool
        let step: Int
        let set: Int
        let ticker: [String: Any]
    }
    private var beats: [Beat] = []
    private var beatIndex = 0
    private var entered = false
    private var restEndsAt: Date?
    private var timedEndsAt: Date?
    private var audioCache: [String: Data] = [:]
    private var autopilot = false
    private var ran = false
    private var log: [[String: Any]] = []
    private var beatTimer: Timer?
    private var tickTimer: Timer?
    private var lastLine = ""
    private var lastLineId = ""
    private var observing = false

    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var running = false
    private var listening = false
    private var hints: [String] = []
    private var lastText = ""
    private var pauseTimer: Timer?
    private var restartTimer: Timer?
    private var player: AVAudioPlayer?
    private var playCall: CAPPluginCall?
    private let synth = AVSpeechSynthesizer()

    /* ---------- Permission ---------- */

    private func micGranted() -> Bool {
        if #available(iOS 17.0, *) { return AVAudioApplication.shared.recordPermission == .granted }
        return AVAudioSession.sharedInstance().recordPermission == .granted
    }
    private func micDenied() -> Bool {
        if #available(iOS 17.0, *) { return AVAudioApplication.shared.recordPermission == .denied }
        return AVAudioSession.sharedInstance().recordPermission == .denied
    }
    private func status() -> String {
        let speech = SFSpeechRecognizer.authorizationStatus()
        if micDenied() || speech == .denied || speech == .restricted { return "denied" }
        if micGranted() && speech == .authorized { return "granted" }
        return "unknown"
    }

    @objc func permission(_ call: CAPPluginCall) { call.resolve(["status": status()]) }

    @objc func requestPermission(_ call: CAPPluginCall) {
        let askSpeech = {
            SFSpeechRecognizer.requestAuthorization { _ in
                DispatchQueue.main.async { call.resolve(["status": self.status()]) }
            }
        }
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { _ in askSpeech() }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { _ in askSpeech() }
        }
    }

    /* ---------- Audio session ---------- */

    private func configureSession(duck: Bool) {
        let session = AVAudioSession.sharedInstance()
        var options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetoothA2DP, .allowAirPlay]
        options.insert(duck ? .duckOthers : .mixWithOthers)
        try? session.setCategory(.playAndRecord, mode: .default, options: options)
        try? session.setActive(true)
    }

    /* ---------- Listening ---------- */

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.status() == "granted" else { call.resolve(["started": false, "reason": "permission"]); return }
            self.hints = call.getArray("hints", String.self) ?? []
            if self.running { call.resolve(["started": true]); return }
            let locale = Locale.current.identifier.hasPrefix("en") ? Locale.current : Locale(identifier: "en-US")
            self.recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
            guard let recognizer = self.recognizer, recognizer.isAvailable else { call.resolve(["started": false, "reason": "unavailable"]); return }
            self.configureSession(duck: false)
            let input = self.engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else { call.resolve(["started": false, "reason": "no-input"]); return }
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                guard let self = self, self.listening else { return }
                self.request?.append(buffer)
            }
            self.engine.prepare()
            do { try self.engine.start() } catch {
                call.resolve(["started": false, "reason": error.localizedDescription]); return
            }
            NotificationCenter.default.addObserver(self, selector: #selector(self.interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(self.engineChanged(_:)), name: .AVAudioEngineConfigurationChange, object: self.engine)
            self.running = true
            self.observeApp()
            self.listening = call.getBool("listen") ?? true
            self.newTask()
            call.resolve(["started": true])
        }
    }

    /* Changing the sound settings (to lower her music while the coach talks)
       can stop the mic engine without a word. Put it back whenever it is
       needed: before every listening session, and on a configuration change. */
    private func ensureEngine() {
        guard running, !engine.isRunning else { return }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { return }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self, self.listening else { return }
            self.request?.append(buffer)
        }
        engine.prepare()
        try? engine.start()
    }

    @objc private func engineChanged(_ note: Notification) {
        DispatchQueue.main.async {
            guard self.running else { return }
            self.ensureEngine()
            if self.listening { self.newTask() }
        }
    }

    @objc private func interrupted(_ note: Notification) {
        /* A call or Siri took the audio. When it gives it back, carry on. */
        guard let info = note.userInfo, let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended, running else { return }
        DispatchQueue.main.async {
            self.configureSession(duck: false)
            self.ensureEngine()
            self.newTask()
        }
    }

    private func newTask() {
        task?.cancel(); task = nil
        request?.endAudio()
        lastText = ""
        pauseTimer?.invalidate(); pauseTimer = nil
        /* No session while muted: nothing to hear, nothing to restart. */
        guard running, listening, let recognizer = recognizer else { return }
        ensureEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        request.contextualStrings = hints
        request.taskHint = .unspecified
        if #available(iOS 16.0, *) { request.addsPunctuation = false }
        self.request = request
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let result = result {
                    let text = result.bestTranscription.formattedString
                    if self.autopilot {
                        if self.listening, !text.isEmpty, text != self.lastText {
                            self.lastText = text
                            if self.autoHeard(text.lowercased()) { self.newTask() }
                        }
                        return
                    }
                    if self.listening, !text.isEmpty, text != self.lastText {
                        self.lastText = text
                        self.notifyListeners("heard", data: ["text": text, "final": false])
                        /* A short pause ends the phrase. */
                        self.pauseTimer?.invalidate()
                        self.pauseTimer = Timer.scheduledTimer(withTimeInterval: 1.1, repeats: false) { [weak self] _ in self?.finishPhrase() }
                    }
                    if result.isFinal { self.finishPhrase() }
                } else if error != nil {
                    /* Recognition sessions end on their own (silence, a minute
                       of audio); start the next one. */
                    self.restartSoon()
                }
            }
        }
    }

    private func finishPhrase() {
        pauseTimer?.invalidate(); pauseTimer = nil
        if autopilot { restartSoon(delay: 0.05); return }
        let text = lastText
        if listening, !text.isEmpty { notifyListeners("heard", data: ["text": text, "final": true]) }
        restartSoon(delay: 0.05)
    }

    private func restartSoon(delay: TimeInterval = 0.3) {
        restartTimer?.invalidate()
        restartTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in self?.newTask() }
    }

    /* Listen (true) or ignore what the mic hears (false, while the coach talks). */
    @objc func listen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.autopilot { call.resolve(); return }
            self.hints = call.getArray("hints", String.self) ?? self.hints
            let was = self.listening
            self.listening = call.getBool("on") ?? true
            if self.listening != was { self.newTask() }
            call.resolve()
        }
    }
    @objc func mute(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.autopilot { call.resolve(); return }
            self.listening = false; self.newTask(); call.resolve()
        }
    }
    /* A command was acted on: clear what was heard so it is not acted on twice. */
    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.autopilot { call.resolve(); return }
            self.newTask(); call.resolve()
        }
    }

    /* ---------- Speaking ---------- */

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.autopilot { call.resolve(["cancelled": true]); return }
            self.finishPlaying(cancelled: true)
            self.listening = false; self.newTask()
            self.configureSession(duck: true)
            self.playCall = call
            if let b64 = call.getString("audio"), let data = Data(base64Encoded: b64), let player = try? AVAudioPlayer(data: data) {
                self.player = player
                player.delegate = self
                player.prepareToPlay()
                if player.play() { return }
            }
            /* No recording for this line: say it with iPhone's voice. */
            guard let text = call.getString("text"), !text.isEmpty else { self.finishPlaying(cancelled: false); return }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.98
            self.synth.delegate = self
            self.synth.speak(utterance)
        }
    }

    @objc func stopPlaying(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.finishPlaying(cancelled: true); call.resolve() }
    }

    private func finishPlaying(cancelled: Bool) {
        player?.stop(); player = nil
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        configureSession(duck: false)
        ensureEngine()
        if let call = playCall { playCall = nil; call.resolve(["cancelled": cancelled]) }
    }

    public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { if player === self.player { self.player = nil; self.spoke() } }
    }
    /* A line ended: the background coach's next step, or the web app's promise. */
    private func spoke() {
        if let next = autoDone { autoDone = nil; configureSession(duck: false); next(); return }
        finishPlaying(cancelled: false)
        /* A line the web app started before she left: now listen for her. */
        if autopilot { autoListen() }
    }
    public func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async { if player === self.player { self.player = nil; self.spoke() } }
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.spoke() }
    }

    /* ---------- Background coach: script from the web app ---------- */

    @objc func setScript(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            /* The page can run a moment after she leaves; it must not rewind the background coach. */
            if self.autopilot { call.resolve(); return }
            let raw = call.getArray("beats", JSObject.self) ?? []
            self.beats = raw.map { item in
                Beat(id: item["id"] as? String ?? UUID().uuidString,
                     kind: item["kind"] as? String ?? "card",
                     line: item["line"] as? String ?? "",
                     seconds: (item["seconds"] as? NSNumber)?.doubleValue ?? 0,
                     timed: item["timed"] as? Bool ?? false,
                     perSide: item["perSide"] as? Bool ?? false,
                     step: (item["step"] as? NSNumber)?.intValue ?? 0,
                     set: (item["set"] as? NSNumber)?.intValue ?? 0,
                     ticker: item["ticker"] as? [String: Any] ?? [:])
            }
            let keep = Set(self.beats.map { $0.id })
            self.audioCache = self.audioCache.filter { keep.contains($0.key) || $0.key.hasPrefix("fx:") }
            self.beatIndex = 0
            self.entered = call.getBool("entered") ?? true
            self.restEndsAt = Self.date(call.getDouble("restEndsAt"))
            self.timedEndsAt = Self.date(call.getDouble("timedEndsAt"))
            call.resolve()
        }
    }

    @objc func setAudio(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let id = call.getString("id"), let b64 = call.getString("audio"), let data = Data(base64Encoded: b64) { self.audioCache[id] = data }
            call.resolve()
        }
    }

    @objc func takeBackground(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let result: [String: Any] = [
                "ran": self.ran,
                "index": self.beatIndex,
                "entered": self.entered,
                "log": self.log,
                "restEndsAt": (self.restEndsAt?.timeIntervalSince1970 ?? 0) * 1000,
                "timedEndsAt": (self.timedEndsAt?.timeIntervalSince1970 ?? 0) * 1000,
            ]
            self.ran = false; self.log = []
            call.resolve(result)
        }
    }

    private static func date(_ millis: Double?) -> Date? {
        guard let millis = millis, millis > 0 else { return nil }
        return Date(timeIntervalSince1970: millis / 1000)
    }

    private func observeApp() {
        guard !observing else { return }
        observing = true
        NotificationCenter.default.addObserver(self, selector: #selector(wentBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(cameBack), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    @objc private func wentBackground() {
        DispatchQueue.main.async {
            guard self.running, !self.beats.isEmpty, !self.autopilot else { return }
            self.autopilot = true
            self.ran = true
            self.resumeBeat()
        }
    }

    @objc private func cameBack() {
        DispatchQueue.main.async {
            guard self.autopilot else { return }
            self.autopilot = false
            self.beatTimer?.invalidate(); self.beatTimer = nil
            self.tickTimer?.invalidate(); self.tickTimer = nil
            /* The web app takes over; it decides when to listen again. */
            self.listening = false
            self.newTask()
        }
    }

    private var beat: Beat? { beatIndex < beats.count ? beats[beatIndex] : nil }

    /* Pick up wherever the web app left off. */
    private func resumeBeat() {
        guard let beat = beat else { return }
        if !entered { enterBeat(); return }
        switch beat.kind {
        case "rest":
            if let end = restEndsAt { scheduleRest(end) } else { autoListen() }
        case "card":
            if beat.timed, let end = timedEndsAt { scheduleTimed(end, beat: beat) } else if player == nil && !synth.isSpeaking { autoListen() }
        default:
            if player == nil && !synth.isSpeaking { autoListen() }
        }
    }

    private func advance() {
        beatTimer?.invalidate(); beatTimer = nil
        tickTimer?.invalidate(); tickTimer = nil
        restEndsAt = nil; timedEndsAt = nil
        beatIndex += 1; entered = false
        enterBeat()
    }

    private func enterBeat() {
        guard autopilot, let beat = beat else { return }
        entered = true
        updateTicker(beat)
        switch beat.kind {
        case "rest":
            let end = Date().addingTimeInterval(beat.seconds)
            restEndsAt = end
            updateTicker(beat)
            say(id: beat.id, beat.line) { [weak self] in self?.autoListen() }
            scheduleRest(end)
        case "end":
            say(id: beat.id, beat.line) { }
            log.append(["type": "end"])
        default:
            say(id: beat.id, beat.line) { [weak self] in self?.autoListen() }
        }
    }

    private func scheduleRest(_ end: Date) {
        beatTimer?.invalidate()
        tickTimer?.invalidate()
        let ten = end.addingTimeInterval(-10)
        if ten > Date().addingTimeInterval(1) {
            tickTimer = Timer.scheduledTimer(withTimeInterval: ten.timeIntervalSinceNow, repeats: false) { [weak self] _ in
                self?.say(id: "fx:Ten seconds.", "Ten seconds.") { [weak self] in self?.autoListen() }
            }
        }
        beatTimer = Timer.scheduledTimer(withTimeInterval: max(0.1, end.timeIntervalSinceNow), repeats: false) { [weak self] _ in self?.advance() }
        if player == nil && !synth.isSpeaking { autoListen() }
    }

    private func scheduleTimed(_ end: Date, beat: Beat) {
        beatTimer?.invalidate(); tickTimer?.invalidate()
        if beat.perSide {
            let half = end.addingTimeInterval(-beat.seconds / 2)
            if half > Date() { tickTimer = Timer.scheduledTimer(withTimeInterval: half.timeIntervalSinceNow, repeats: false) { [weak self] _ in self?.say(id: "fx:Switch sides.", "Switch sides.") { [weak self] in self?.autoListen() } } }
        }
        beatTimer = Timer.scheduledTimer(withTimeInterval: max(0.1, end.timeIntervalSinceNow), repeats: false) { [weak self] _ in
            guard let self = self else { return }
            self.timedEndsAt = nil
            /* A main move logs with its feel on the next beat; a warm-up logs here. */
            let feelNext = self.beats.indices.contains(self.beatIndex + 1) && self.beats[self.beatIndex + 1].kind == "feel"
            if !feelNext { self.log.append(["type": "set", "step": beat.step, "set": beat.set]) }
            self.say(id: "fx:Done. Nice.", "Done. Nice.") { [weak self] in self?.advance() }
        }
        autoListen()
    }

    private func autoListen() {
        guard autopilot else { return }
        listening = true
        newTask()
    }

    private func say(id: String, _ text: String, then: @escaping () -> Void) {
        lastLine = text; lastLineId = id
        listening = false; newTask()
        configureSession(duck: true)
        player?.stop(); player = nil
        if let data = audioCache[id], let player = try? AVAudioPlayer(data: data) {
            self.player = player
            autoDone = then
            player.delegate = self
            if player.play() { return }
        }
        autoDone = then
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        synth.delegate = self
        synth.speak(utterance)
    }
    private var autoDone: (() -> Void)?

    private func has(_ text: String, _ words: [String]) -> Bool {
        let padded = " " + text.replacingOccurrences(of: "[^a-z' ]", with: " ", options: .regularExpression) + " "
        return words.contains { padded.contains(" \($0) ") }
    }

    /* What she said, while the app is in the background. True = acted on. */
    private func autoHeard(_ text: String) -> Bool {
        guard let beat = beat else { return false }
        if has(text, ["repeat", "say that again"]) { say(id: lastLineId, lastLine) { [weak self] in self?.autoListen() }; return true }
        switch beat.kind {
        case "card":
            if beat.timed && timedEndsAt == nil {
                if has(text, ["go", "ready", "start", "let's go", "begin"]) {
                    let end = Date().addingTimeInterval(beat.seconds)
                    timedEndsAt = end
                    say(id: "fx:Okay, go!", "Okay, go!") { [weak self] in self?.scheduleTimed(end, beat: beat) }
                    return true
                }
                if has(text, ["skip", "next"]) { log.append(["type": "set", "step": beat.step, "set": beat.set]); advance(); return true }
                return false
            }
            if has(text, ["done", "finished", "next", "skip", "got it", "complete"]) {
                beatTimer?.invalidate(); tickTimer?.invalidate(); timedEndsAt = nil
                if beats.indices.contains(beatIndex + 1), beats[beatIndex + 1].kind == "feel" { advance() }
                else { log.append(["type": "set", "step": beat.step, "set": beat.set]); advance() }
                return true
            }
        case "feel":
            var feel: String?
            if has(text, ["too easy", "easy", "easier", "light"]) { feel = "easy" }
            else if has(text, ["too hard", "hard", "heavy", "tough", "brutal"]) { feel = "hard" }
            else if has(text, ["just right", "right", "good", "fine", "perfect", "okay", "ok"]) { feel = "right" }
            if let feel = feel { log.append(["type": "set", "step": beat.step, "set": beat.set, "feel": feel]); advance(); return true }
        case "rest":
            if has(text, ["more", "more rest", "thirty more", "more time"]) {
                let end = (restEndsAt ?? Date()).addingTimeInterval(30)
                restEndsAt = end
                updateTicker(beat)
                say(id: "fx:Sure, thirty more seconds.", "Sure, thirty more seconds.") { [weak self] in self?.scheduleRest(end) }
                return true
            }
            if has(text, ["ready", "go", "skip", "let's go", "next"]) { advance(); return true }
        default: break
        }
        return false
    }

    private func updateTicker(_ beat: Beat) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return }
        let t = beat.ticker
        let state = ForgeWorkoutAttributes.ContentState(
            title: t["title"] as? String ?? "Workout",
            detail: t["detail"] as? String ?? "",
            phase: beat.kind == "rest" ? "rest" : (beat.kind == "end" ? "done" : "work"),
            restEndsAt: beat.kind == "rest" ? restEndsAt : nil,
            done: (t["done"] as? NSNumber)?.intValue ?? 0,
            total: (t["total"] as? NSNumber)?.intValue ?? 0,
            short: t["short"] as? String)
        Task { for activity in Activity<ForgeWorkoutAttributes>.activities { await activity.update(.init(state: state, staleDate: nil)) } }
        #endif
    }

    /* ---------- Off ---------- */

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishPlaying(cancelled: true)
            self.running = false; self.listening = false
            self.autopilot = false; self.beats = []; self.beatTimer?.invalidate(); self.tickTimer?.invalidate(); self.autoDone = nil
            self.pauseTimer?.invalidate(); self.restartTimer?.invalidate()
            self.task?.cancel(); self.task = nil
            self.request?.endAudio(); self.request = nil
            self.engine.inputNode.removeTap(onBus: 0)
            if self.engine.isRunning { self.engine.stop() }
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
            NotificationCenter.default.removeObserver(self, name: .AVAudioEngineConfigurationChange, object: self.engine)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        }
    }
}
