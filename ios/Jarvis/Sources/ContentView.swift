import SwiftUI

struct ContentView: View {
    @Bindable var conversation: Conversation
    @State private var showingSettings = false
    @State private var typed = ""

    private var isListening: Bool {
        if case .off = conversation.state { return false }
        if case .failed = conversation.state { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                statusBar
                transcript
                controls
            }
            .navigationTitle("Jarvis")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Neu", systemImage: "arrow.counterclockwise") {
                        conversation.clearHistory()
                    }
                    .disabled(conversation.turns.isEmpty)
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView(settings: $conversation.settings)
            }
        }
    }

    // MARK: - Teile

    private var statusBar: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(statusColor)
                .frame(width: 9, height: 9)
                .overlay {
                    // Pulsiert, solange gearbeitet wird.
                    Circle()
                        .stroke(statusColor.opacity(0.5), lineWidth: 1)
                        .scaleEffect(pulses ? 2.2 : 1)
                        .opacity(pulses ? 0 : 1)
                        .animation(
                            pulses
                                ? .easeOut(duration: 1.1).repeatForever(autoreverses: false)
                                : .default,
                            value: pulses
                        )
                }
            Text(conversation.state.label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if conversation.turns.isEmpty {
                        Text("Starte das Zuhören und sag „Jarvis, …“.\nOhne Mikrofon geht es per Textfeld.")
                            .font(.callout)
                            .foregroundStyle(.tertiary)
                            .padding(.top, 40)
                    }
                    ForEach(conversation.turns) { turn in
                        TurnBubble(turn: turn).id(turn.id)
                    }
                }
                .padding(20)
            }
            .onChange(of: conversation.turns.last?.text) { _, _ in
                guard let last = conversation.turns.last else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    private var controls: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                TextField("Tippen statt sprechen", text: $typed)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit(sendTyped)
                Button("Senden", action: sendTyped)
                    .buttonStyle(.bordered)
                    .disabled(typed.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            HStack(spacing: 12) {
                Button {
                    Task { await conversation.toggleListening() }
                } label: {
                    Label(
                        isListening ? "Zuhören beenden" : "Zuhören starten",
                        systemImage: isListening ? "stop.fill" : "mic.fill"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    conversation.pushToTalk()
                } label: {
                    Image(systemName: "waveform")
                        .frame(height: 20)
                }
                .buttonStyle(.bordered)
                .disabled(!isListening)
                .accessibilityLabel("Jetzt sprechen, ohne Weckwort")
            }
        }
        .padding(20)
        .background(.bar)
    }

    private var statusColor: Color {
        switch conversation.state {
        case .off: return .secondary
        case .listening: return .green
        case .hearing: return .blue
        case .thinking: return .orange
        case .speaking: return .purple
        case .failed: return .red
        }
    }

    private var pulses: Bool {
        switch conversation.state {
        case .hearing, .thinking, .speaking: return true
        default: return false
        }
    }

    private func sendTyped() {
        let text = typed
        typed = ""
        conversation.ask(text)
    }
}

private struct TurnBubble: View {
    let turn: ChatTurn

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(turn.role == .user ? "Du" : "Jarvis")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(turn.role == .user ? .secondary : Color.accentColor)
            Text(turn.text.isEmpty ? "…" : turn.text)
                .font(.body)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(turn.role == .user ? Color.clear : Color.secondary.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.secondary.opacity(turn.role == .user ? 0.2 : 0), lineWidth: 1)
        )
    }
}
