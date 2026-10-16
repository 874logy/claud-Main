import Foundation

/// Rollen, wie die Messages-API sie erwartet.
enum Role: String, Codable, Sendable {
    case user
    case assistant
}

struct ChatTurn: Identifiable, Sendable {
    let id = UUID()
    let role: Role
    var text: String
}

struct ClaudeSettings: Sendable {
    /// Es gibt kein offizielles Anthropic-SDK für Swift, deshalb rohes HTTP.
    static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
    static let apiVersion = "2023-06-01"
    /// Nötig für die skalare `fallbacks`-Form.
    static let fallbackBeta = "server-side-fallback-2026-07-01"

    var model = "claude-opus-5-5"
    var maxTokens = 600
    /// Bei einem Assistenten, auf den man wartet, zählt Latenz mehr als Tiefe.
    var effort = "low"
    var system = """
        Du bist Jarvis, ein Sprachassistent. Deine Antworten werden vorgelesen.

        Antworte auf Deutsch, in höchstens drei Sätzen, in ganzen Sätzen ohne \
        Aufzählungen, ohne Markdown, ohne Sternchen, ohne Emojis.
        Wenn du etwas nicht weißt, sage das in einem Satz und rate nicht.
        Keine Einleitungen wie "Gerne" oder "Natürlich" — antworte direkt.
        """
    /// Wie viele vergangene Züge mitgeschickt werden.
    var historyDepth = 8
}

enum ClaudeError: LocalizedError {
    case missingAPIKey
    case http(status: Int, body: String)
    case refused(explanation: String?)
    case emptyResponse

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "Kein API-Key gespeichert."
        case .http(let status, let body):
            return "Die API antwortete mit \(status): \(body)"
        case .refused(let explanation):
            return explanation ?? "Die Anfrage wurde abgelehnt."
        case .emptyResponse:
            return "Die Antwort war leer."
        }
    }
}

/// Spricht die Messages-API im Streaming-Modus, damit das Vorlesen beginnen
/// kann, bevor die Antwort fertig ist.
actor ClaudeClient {
    private let session: URLSession
    private var settings: ClaudeSettings

    init(settings: ClaudeSettings = ClaudeSettings()) {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
        self.settings = settings
    }

    func update(settings: ClaudeSettings) {
        self.settings = settings
    }

    func currentSettings() -> ClaudeSettings {
        settings
    }

    /// Schickt den Gesprächsverlauf und ruft `onDelta` für jedes Textstück auf.
    /// Rückgabe ist die vollständige Antwort.
    func send(
        history: [ChatTurn],
        onDelta: @Sendable @escaping (String) -> Void
    ) async throws -> String {
        guard let key = Keychain.apiKey(), !key.isEmpty else { throw ClaudeError.missingAPIKey }

        var request = URLRequest(url: ClaudeSettings.endpoint)
        request.httpMethod = "POST"
        request.setValue(key, forHTTPHeaderField: "x-api-key")
        request.setValue(ClaudeSettings.apiVersion, forHTTPHeaderField: "anthropic-version")
        request.setValue(ClaudeSettings.fallbackBeta, forHTTPHeaderField: "anthropic-beta")
        request.setValue("application/json", forHTTPHeaderField: "content-type")

        let trimmed = history.suffix(settings.historyDepth).map {
            Payload.Message(role: $0.role.rawValue, content: $0.text)
        }
        request.httpBody = try JSONEncoder().encode(
            Payload(
                model: settings.model,
                maxTokens: settings.maxTokens,
                stream: true,
                system: settings.system,
                messages: trimmed,
                outputConfig: .init(effort: settings.effort),
                // Weicht serverseitig auf ein anderes Modell aus, statt stumm abzubrechen.
                fallbacks: "default"
            )
        )

        let (stream, response) = try await session.bytes(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            var body = ""
            for try await line in stream.lines { body += line }
            throw ClaudeError.http(status: http.statusCode, body: body)
        }

        var full = ""
        var refusal: String?

        // Server-Sent Events: nur "data:"-Zeilen tragen Inhalt.
        for try await line in stream.lines {
            guard line.hasPrefix("data:") else { continue }
            let json = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            if json.isEmpty || json == "[DONE]" { continue }
            guard let data = json.data(using: .utf8),
                  let event = try? JSONDecoder().decode(Event.self, from: data)
            else { continue }

            switch event.type {
            case "content_block_delta":
                // Thinking-Blöcke kommen als eigener Delta-Typ und werden hier übergangen.
                if event.delta?.type == "text_delta", let text = event.delta?.text, !text.isEmpty {
                    full += text
                    onDelta(text)
                }
            case "message_delta":
                if event.delta?.stopReason == "refusal" {
                    refusal = event.delta?.stopDetails?.explanation
                }
            case "error":
                throw ClaudeError.http(status: -1, body: event.error?.message ?? "unbekannter Streamfehler")
            default:
                continue
            }
        }

        // Auch die Fallback-Kette kann ablehnen — dann bleibt der Text leer.
        if let refusal, full.isEmpty { throw ClaudeError.refused(explanation: refusal) }
        guard !full.isEmpty else { throw ClaudeError.emptyResponse }
        return full
    }

    // MARK: - Wire-Format

    private struct Payload: Encodable {
        let model: String
        let maxTokens: Int
        let stream: Bool
        let system: String
        let messages: [Message]
        let outputConfig: OutputConfig
        let fallbacks: String

        struct Message: Encodable {
            let role: String
            let content: String
        }

        struct OutputConfig: Encodable {
            let effort: String
        }

        enum CodingKeys: String, CodingKey {
            case model
            case maxTokens = "max_tokens"
            case stream
            case system
            case messages
            case outputConfig = "output_config"
            case fallbacks
        }
    }

    private struct Event: Decodable {
        let type: String
        let delta: Delta?
        let error: APIError?

        struct Delta: Decodable {
            let type: String?
            let text: String?
            let stopReason: String?
            let stopDetails: StopDetails?

            enum CodingKeys: String, CodingKey {
                case type, text
                case stopReason = "stop_reason"
                case stopDetails = "stop_details"
            }
        }

        struct StopDetails: Decodable {
            let category: String?
            let explanation: String?
        }

        struct APIError: Decodable {
            let type: String?
            let message: String?
        }
    }
}
