import AVFoundation
import Speech

/// Dauerhaftes Zuhören mit Weckwort, auf Basis der Systemerkennung.
///
/// Zwei Modi: im Weckwort-Modus wird der laufende Text nur nach "Jarvis"
/// durchsucht und sonst verworfen; danach gilt alles Weitere als Befehl, bis
/// eine kurze Stille ihn abschließt.
@MainActor
final class SpeechListener {
    enum Mode {
        case wakeWord
        case command
    }

    enum StartError: LocalizedError {
        case notAuthorized
        case recognizerUnavailable

        var errorDescription: String? {
            switch self {
            case .notAuthorized:
                return "Mikrofon oder Spracherkennung ist nicht erlaubt. Zu ändern in den Einstellungen."
            case .recognizerUnavailable:
                return "Die deutsche Spracherkennung ist auf diesem Gerät nicht verfügbar."
            }
        }
    }

    /// Weckwort-Varianten, weil das Diktat den Namen unterschiedlich schreibt.
    private static let wakeWords = ["jarvis", "jervis", "charvis", "dscharvis", "jarvus", "jarwis"]
    /// So lange Stille beendet einen Befehl.
    private static let silenceTimeout: Duration = .milliseconds(1_200)
    /// Erkennungsaufgaben laufen nicht beliebig lange; vorher neu aufsetzen.
    private static let recycleAfter: Duration = .seconds(45)

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "de-DE"))
    private let engine = AVAudioEngine()
    /// Wird vom Audio-Thread beschrieben (nur `append`) und auf dem
    /// Main-Actor ausgetauscht — daher bewusst außerhalb der Isolation.
    nonisolated(unsafe) private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    private var silenceTask: Task<Void, Never>?
    private var recycleTask: Task<Void, Never>?

    private(set) var mode: Mode = .wakeWord
    private(set) var isRunning = false
    /// Zeichen des laufenden Transkripts, die vor dem Befehl liegen.
    private var commandPrefixLength = 0

    /// Wird aufgerufen, sobald das Weckwort fällt.
    var onWake: (() -> Void)?
    /// Laufender Befehlstext, zum Mitlesen auf dem Bildschirm.
    var onPartialCommand: ((String) -> Void)?
    /// Fertiger Befehl nach einer Pause.
    var onCommand: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    // MARK: - Berechtigungen

    func requestAuthorization() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
        let microphone = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
        return speech && microphone
    }

    // MARK: - Steuerung

    func start() throws {
        guard !isRunning else { return }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else { throw StartError.notAuthorized }
        guard let recognizer, recognizer.isAvailable else { throw StartError.recognizerUnavailable }

        let session = AVAudioSession.sharedInstance()
        // .voiceChat schaltet die Echounterdrückung ein — ohne sie erkennt
        // Jarvis seine eigene Stimme als Befehl.
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
        )
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        isRunning = true
        mode = .wakeWord
        try startEngine()
        beginTask()
    }

    func stop() {
        isRunning = false
        cancelTimers()
        endTask()
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Hält die Erkennung an, solange Jarvis selbst spricht.
    func pause() {
        guard isRunning else { return }
        cancelTimers()
        endTask()
    }

    func resume() {
        guard isRunning else { return }
        mode = .wakeWord
        if !engine.isRunning { try? startEngine() }
        beginTask()
    }

    /// Für den Knopf: ohne Weckwort direkt in den Befehlsmodus.
    func beginCommandDirectly() {
        guard isRunning else { return }
        endTask()
        mode = .command
        commandPrefixLength = 0
        beginTask()
    }

    // MARK: - Audio und Erkennung

    private func startEngine() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { [weak self] buffer, _ in
            // Audio-Callback läuft auf einem eigenen Thread; nur anhängen, nichts anderes.
            self?.request?.append(buffer)
        }
        engine.prepare()
        try engine.start()
    }

    private func beginTask() {
        guard let recognizer, isRunning else { return }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Dauerhaftes Zuhören gehört aufs Gerät: schneller, ohne Netz, ohne
        // dass jedes Nebengeräusch an einen Server geht.
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        request.taskHint = .dictation
        self.request = request

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result {
                    self.handle(transcript: result.bestTranscription.formattedString)
                }
                if error != nil || result?.isFinal == true {
                    // Abgelaufen oder abgebrochen: im Zuhörbetrieb neu aufsetzen.
                    self.restartIfNeeded()
                }
            }
        }

        recycleTask?.cancel()
        recycleTask = Task { [weak self] in
            try? await Task.sleep(for: SpeechListener.recycleAfter)
            guard !Task.isCancelled else { return }
            await MainActor.run { self?.restartIfNeeded() }
        }
    }

    private func endTask() {
        recycleTask?.cancel()
        recycleTask = nil
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
    }

    private func restartIfNeeded() {
        guard isRunning else { return }
        endTask()
        // Im Befehlsmodus zurück aufs Weckwort — ein halber Befehl ist keiner.
        mode = .wakeWord
        commandPrefixLength = 0
        beginTask()
    }

    private func handle(transcript: String) {
        switch mode {
        case .wakeWord:
            guard let range = SpeechListener.wakeWordRange(in: transcript) else { return }
            mode = .command
            commandPrefixLength = transcript.distance(from: transcript.startIndex, to: range.upperBound)
            onWake?()
            // Was nach dem Weckwort im selben Atemzug kam, zählt schon als Befehl.
            emitPartial(from: transcript)
        case .command:
            emitPartial(from: transcript)
        }
    }

    private func emitPartial(from transcript: String) {
        let command = SpeechListener.suffix(of: transcript, droppingFirst: commandPrefixLength)
        onPartialCommand?(command)
        scheduleSilenceCheck(for: command)
    }

    /// Jede neue Silbe verschiebt den Abschluss nach hinten.
    private func scheduleSilenceCheck(for command: String) {
        silenceTask?.cancel()
        let trimmed = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        silenceTask = Task { [weak self] in
            try? await Task.sleep(for: SpeechListener.silenceTimeout)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.mode == .command else { return }
                self.mode = .wakeWord
                self.commandPrefixLength = 0
                self.onCommand?(trimmed)
                // Frisches Transkript für die nächste Runde.
                self.restartIfNeeded()
            }
        }
    }

    private func cancelTimers() {
        silenceTask?.cancel()
        silenceTask = nil
        recycleTask?.cancel()
        recycleTask = nil
    }

    // MARK: - Texthilfen

    private static func suffix(of transcript: String, droppingFirst count: Int) -> String {
        guard count < transcript.count else { return "" }
        let start = transcript.index(transcript.startIndex, offsetBy: count)
        return String(transcript[start...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Sucht die erste Weckwort-Variante, diakritik- und großschreibungsblind.
    private static func wakeWordRange(in transcript: String) -> Range<String.Index>? {
        for word in wakeWords {
            if let range = transcript.range(
                of: word,
                options: [.caseInsensitive, .diacriticInsensitive]
            ) {
                return range
            }
        }
        return nil
    }
}
