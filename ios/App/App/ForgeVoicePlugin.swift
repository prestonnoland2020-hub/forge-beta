import Foundation
import AVFoundation
import Speech
import Capacitor

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
    ]

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
            self.running = true
            self.listening = call.getBool("listen") ?? true
            self.newTask()
            call.resolve(["started": true])
        }
    }

    @objc private func interrupted(_ note: Notification) {
        /* A call or Siri took the audio. When it gives it back, carry on. */
        guard let info = note.userInfo, let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended, running else { return }
        DispatchQueue.main.async {
            self.configureSession(duck: false)
            if !self.engine.isRunning { try? self.engine.start() }
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
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        request.contextualStrings = hints
        request.taskHint = .confirmation
        if #available(iOS 16.0, *) { request.addsPunctuation = false }
        self.request = request
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let result = result {
                    let text = result.bestTranscription.formattedString
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
            self.hints = call.getArray("hints", String.self) ?? self.hints
            let was = self.listening
            self.listening = call.getBool("on") ?? true
            if self.listening != was { self.newTask() }
            call.resolve()
        }
    }
    @objc func mute(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.listening = false; self.newTask(); call.resolve() }
    }
    /* A command was acted on: clear what was heard so it is not acted on twice. */
    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.newTask(); call.resolve() }
    }

    /* ---------- Speaking ---------- */

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
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
        if let call = playCall { playCall = nil; call.resolve(["cancelled": cancelled]) }
        configureSession(duck: false)
    }

    public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { if player === self.player { self.player = nil; self.finishPlaying(cancelled: false) } }
    }
    public func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async { if player === self.player { self.player = nil; self.finishPlaying(cancelled: false) } }
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.finishPlaying(cancelled: false) }
    }

    /* ---------- Off ---------- */

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finishPlaying(cancelled: true)
            self.running = false; self.listening = false
            self.pauseTimer?.invalidate(); self.restartTimer?.invalidate()
            self.task?.cancel(); self.task = nil
            self.request?.endAudio(); self.request = nil
            self.engine.inputNode.removeTap(onBus: 0)
            if self.engine.isRunning { self.engine.stop() }
            NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        }
    }
}
