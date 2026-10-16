import AVFoundation

/// Sprachausgabe über die Systemstimmen. Kostet nichts und läuft offline.
@MainActor
final class Speaker: NSObject {
    private let synthesizer = AVSpeechSynthesizer()
    private let voice: AVSpeechSynthesisVoice?

    /// Wird mit `true` aufgerufen, sobald gesprochen wird, und mit `false`,
    /// wenn die Warteschlange leer ist. Das Zuhören pausiert in der Zwischenzeit,
    /// sonst hört Jarvis sich selbst.
    var onSpeakingChanged: ((Bool) -> Void)?

    override init() {
        self.voice = Speaker.bestGermanVoice()
        super.init()
        synthesizer.delegate = self
    }

    var isSpeaking: Bool { synthesizer.isSpeaking }

    /// Hängt einen Satz an. Die Antwort wird satzweise gesprochen, während sie
    /// noch streamt — das halbiert die wahrgenommene Wartezeit.
    func enqueue(_ text: String) {
        let clean = Speaker.strippedForSpeech(text)
        guard !clean.isEmpty else { return }

        let utterance = AVSpeechUtterance(string: clean)
        utterance.voice = voice
        utterance.rate = 0.52
        utterance.pitchMultiplier = 1.0
        utterance.postUtteranceDelay = 0.05
        synthesizer.speak(utterance)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    /// Sucht die beste installierte deutsche Stimme. Nutzer können unter
    /// Einstellungen → Bedienungshilfen → Gesprochene Inhalte bessere nachladen.
    private static func bestGermanVoice() -> AVSpeechSynthesisVoice? {
        let german = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("de") }
        let ranked = german.sorted { lhs, rhs in
            rank(lhs.quality) > rank(rhs.quality)
        }
        return ranked.first ?? AVSpeechSynthesisVoice(language: "de-DE")
    }

    private static func rank(_ quality: AVSpeechSynthesisVoiceQuality) -> Int {
        switch quality {
        case .premium: return 3
        case .enhanced: return 2
        case .default: return 1
        @unknown default: return 0
        }
    }

    /// Das Modell soll kein Markdown liefern; falls doch, wird es hier entfernt,
    /// damit die Stimme keine Sternchen vorliest.
    private static func strippedForSpeech(_ text: String) -> String {
        var out = text
        for token in ["**", "__", "*", "`", "#", "- ", "•"] {
            out = out.replacingOccurrences(of: token, with: "")
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension Speaker: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didStart utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in self.onSpeakingChanged?(true) }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didFinish utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            // Erst melden, wenn nichts mehr in der Warteschlange steht.
            if !synthesizer.isSpeaking { self.onSpeakingChanged?(false) }
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didCancel utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            if !synthesizer.isSpeaking { self.onSpeakingChanged?(false) }
        }
    }
}
