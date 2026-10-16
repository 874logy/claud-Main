import Foundation
import Observation

/// Hält die Kette zusammen: Zuhören → Fragen → Vorlesen.
@MainActor
@Observable
final class Conversation {
    enum State: Equatable {
        case off
        case listening
        case hearing(String)
        case thinking
        case speaking
        case failed(String)

        var label: String {
            switch self {
            case .off: return "Aus"
            case .listening: return "Sag „Jarvis“"
            case .hearing(let partial): return partial.isEmpty ? "Ich höre" : partial
            case .thinking: return "Denkt"
            case .speaking: return "Spricht"
            case .failed(let message): return message
            }
        }
    }

    private(set) var state: State = .off
    private(set) var turns: [ChatTurn] = []
    var settings: ClaudeSettings {
        didSet { Task { await client.update(settings: settings) } }
    }

    private let client: ClaudeClient
    private let listener = SpeechListener()
    private let speaker = Speaker()
    private var pendingAnswerID: UUID?

    init(settings: ClaudeSettings = ClaudeSettings()) {
        self.settings = settings
        self.client = ClaudeClient(settings: settings)
        wireUp()
    }

    var hasAPIKey: Bool { Keychain.apiKey()?.isEmpty == false }

    private func wireUp() {
        listener.onWake = { [weak self] in
            self?.speaker.stop()
            self?.state = .hearing("")
        }
        listener.onPartialCommand = { [weak self] partial in
            guard let self, case .hearing = self.state else { return }
            self.state = .hearing(partial)
        }
        listener.onCommand = { [weak self] command in
            self?.ask(command)
        }
        listener.onError = { [weak self] error in
            self?.state = .failed(error.localizedDescription)
        }
        speaker.onSpeakingChanged = { [weak self] speaking in
            guard let self else { return }
            if speaking {
                self.state = .speaking
            } else if self.listener.isRunning {
                self.listener.resume()
                self.state = .listening
            } else {
                self.state = .off
            }
        }
    }

    // MARK: - Steuerung

    func toggleListening() async {
        if listener.isRunning {
            listener.stop()
            speaker.stop()
            state = .off
            return
        }
        guard await listener.requestAuthorization() else {
            state = .failed(SpeechListener.StartError.notAuthorized.localizedDescription)
            return
        }
        do {
            try listener.start()
            state = .listening
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Knopf statt Weckwort.
    func pushToTalk() {
        guard listener.isRunning else { return }
        speaker.stop()
        listener.beginCommandDirectly()
        state = .hearing("")
    }

    func clearHistory() {
        turns.removeAll()
    }

    /// Auch für Texteingabe, falls gerade nicht gesprochen werden kann.
    func ask(_ command: String) {
        let question = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }
        guard hasAPIKey else {
            state = .failed(ClaudeError.missingAPIKey.localizedDescription)
            return
        }

        // Während Jarvis antwortet, hört er nicht zu.
        listener.pause()
        turns.append(ChatTurn(role: .user, text: question))

        let answer = ChatTurn(role: .assistant, text: "")
        turns.append(answer)
        pendingAnswerID = answer.id
        state = .thinking

        Task { await self.run(history: turns.dropLast().map { $0 }) }
    }

    private func run(history: [ChatTurn]) async {
        var chunker = SentenceChunker()
        let (deltas, continuation) = AsyncStream<String>.makeStream(of: String.self)

        let work = Task<String, Error> {
            defer { continuation.finish() }
            return try await client.send(history: history) { delta in
                continuation.yield(delta)
            }
        }

        // Der Stream hält die Reihenfolge, die Oberfläche bleibt auf dem Main-Actor.
        for await delta in deltas {
            appendToPendingAnswer(delta)
            for sentence in chunker.push(delta) {
                speaker.enqueue(sentence)
            }
        }

        do {
            _ = try await work.value
            if let rest = chunker.flush() { speaker.enqueue(rest) }
            if !speaker.isSpeaking { resumeListening() }
        } catch {
            work.cancel()
            removePendingAnswerIfEmpty()
            state = .failed(error.localizedDescription)
            resumeListening()
        }
        pendingAnswerID = nil
    }

    private func appendToPendingAnswer(_ delta: String) {
        guard let id = pendingAnswerID,
              let index = turns.firstIndex(where: { $0.id == id })
        else { return }
        turns[index].text += delta
    }

    private func removePendingAnswerIfEmpty() {
        guard let id = pendingAnswerID,
              let index = turns.firstIndex(where: { $0.id == id }),
              turns[index].text.isEmpty
        else { return }
        turns.remove(at: index)
    }

    private func resumeListening() {
        // Eine Fehlermeldung bleibt stehen, bis der Nutzer sie gelesen hat.
        if case .failed = state {
            if listener.isRunning { listener.resume() }
            return
        }
        guard listener.isRunning else {
            state = .off
            return
        }
        listener.resume()
        state = .listening
    }
}
