import SwiftUI

struct SettingsView: View {
    @Binding var settings: ClaudeSettings
    @Environment(\.dismiss) private var dismiss

    @State private var key = ""
    @State private var saved = false

    private let models = [
        ("claude-opus-5-5", "Opus 5.5 — klug, ~0,4 ¢ pro Frage"),
        ("claude-haiku-5-5", "Haiku 5.5 — schnell, ~0,01 ¢ pro Frage"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("sk-ant-…", text: $key)
                        .textContentType(.password)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Button(saved ? "Gespeichert" : "Im Schlüsselbund speichern") {
                        Keychain.setAPIKey(key)
                        key = ""
                        saved = true
                    }
                    .disabled(key.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text("API-Key")
                } footer: {
                    Text("Zu holen auf console.anthropic.com. Der Key liegt im Schlüsselbund dieses Geräts, nicht im Code und nicht in der Cloud.")
                }

                Section("Modell") {
                    Picker("Modell", selection: $settings.model) {
                        ForEach(models, id: \.0) { id, label in
                            Text(label).tag(id)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section {
                    Picker("Aufwand", selection: $settings.effort) {
                        Text("niedrig — antwortet sofort").tag("low")
                        Text("mittel").tag("medium")
                        Text("hoch — denkt länger").tag("high")
                    }
                    Stepper("Antwortlänge: \(settings.maxTokens) Tokens", value: $settings.maxTokens, in: 200...2_000, step: 100)
                    Stepper("Gedächtnis: \(settings.historyDepth) Züge", value: $settings.historyDepth, in: 2...20, step: 2)
                } footer: {
                    Text("Niedriger Aufwand hält die Wartezeit kurz — bei einem Assistenten, auf den man wartet, zählt das mehr als Tiefe.")
                }

                Section("Charakter") {
                    TextEditor(text: $settings.system)
                        .frame(minHeight: 160)
                        .font(.callout)
                }
            }
            .navigationTitle("Einstellungen")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }
}
