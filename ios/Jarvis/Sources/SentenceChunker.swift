import Foundation

/// Zerlegt einen Textstrom in sprechbare Sätze. Nötig, weil die Antwort
/// zeichenweise ankommt, die Sprachausgabe aber ganze Sätze braucht, um
/// Betonung und Pausen richtig zu setzen.
struct SentenceChunker {
    private var buffer = ""
    /// Unter dieser Länge wird nicht geschnitten — fängt "z. B." und "Dr." ab.
    private let minimumLength = 24
    private let terminators: Set<Character> = [".", "!", "?", "…", ":", "\n"]

    /// Nimmt ein Streamstück und gibt die Sätze zurück, die jetzt vollständig sind.
    mutating func push(_ delta: String) -> [String] {
        buffer += delta
        var complete: [String] = []

        while let cut = nextCut() {
            let sentence = String(buffer[buffer.startIndex...cut])
            buffer = String(buffer[buffer.index(after: cut)...])
            let trimmed = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { complete.append(trimmed) }
        }
        return complete
    }

    /// Gibt den Rest zurück, wenn der Stream endet.
    mutating func flush() -> String? {
        let rest = buffer.trimmingCharacters(in: .whitespacesAndNewlines)
        buffer = ""
        return rest.isEmpty ? nil : rest
    }

    private func nextCut() -> String.Index? {
        var index = buffer.startIndex
        var offset = 0
        while index < buffer.endIndex {
            let character = buffer[index]
            let next = buffer.index(after: index)
            if terminators.contains(character), offset + 1 >= minimumLength {
                // Ein Punkt zählt nur, wenn danach Leerraum folgt oder der Puffer endet.
                if character == "\n" || next == buffer.endIndex || buffer[next].isWhitespace {
                    return index
                }
            }
            index = next
            offset += 1
        }
        return nil
    }
}
