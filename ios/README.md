# Jarvis — Sprachassistent für iOS

Eine native App: hört dauerhaft zu, wacht beim Wort „Jarvis“ auf, schickt den
gesprochenen Satz an die Claude-API und liest die Antwort vor. Spracherkennung
und Stimme sind Bordmittel von iOS — bezahlt wird nur das Modell.

```
Mikrofon ─► SFSpeechRecognizer ─► Weckwort? ─► Befehl ─► Messages-API (Streaming)
                                                              │
   Lautsprecher ◄── AVSpeechSynthesizer ◄── satzweise ◄───────┘
```

Der Streaming-Pfad ist der Punkt, an dem sich die App von einem Shortcut
unterscheidet: Sie beginnt vorzulesen, sobald der erste Satz fertig ist, statt
auf die ganze Antwort zu warten.

## Bauen

Es braucht einen Mac mit Xcode 15 oder neuer. Zwei Wege:

**Mit XcodeGen** (empfohlen, erzeugt das Projekt aus `project.yml`):

```bash
brew install xcodegen
cd ios/Jarvis
xcodegen generate
open Jarvis.xcodeproj
```

**Ohne XcodeGen:** In Xcode ein neues Projekt anlegen (App, SwiftUI, iOS 17),
die Dateien aus `Jarvis/Sources/` hineinziehen und in der Target-Konfiguration
unter *Info* diese Schlüssel ergänzen — ohne sie stürzt die App beim ersten
Mikrofonzugriff ab:

| Schlüssel | Wert |
| --- | --- |
| `NSMicrophoneUsageDescription` | Jarvis hört zu, wenn du ihn ansprichst. |
| `NSSpeechRecognitionUsageDescription` | Gesprochene Befehle werden in Text umgewandelt. |
| `UIBackgroundModes` | `audio` (nur nötig, wenn er bei gesperrtem Bildschirm weiterhören soll) |

Signieren: eigenes Apple-ID-Team auswählen, `PRODUCT_BUNDLE_IDENTIFIER` auf
etwas Eigenes ändern. Ohne bezahlten Developer-Account läuft die App sieben
Tage pro Installation, dann neu aufs Gerät schieben.

## Erster Start

1. API-Key holen auf [console.anthropic.com](https://console.anthropic.com/settings/keys), Guthaben aufladen.
2. In der App oben rechts auf das Schieberegler-Symbol, Key einsetzen, speichern.
   Er landet im Schlüsselbund des Geräts — nicht im Code, nicht in iCloud.
3. *Zuhören starten* antippen, Mikrofon und Spracherkennung erlauben.
4. „Jarvis, wie weit ist der Mond entfernt?“

Der Wellen-Knopf startet einen Befehl ohne Weckwort. Das Textfeld fragt ohne
Mikrofon — praktisch zum Testen im Simulator, der kein brauchbares Audio hat.

## Dateien

| Datei | Aufgabe |
| --- | --- |
| `Sources/SpeechListener.swift` | Dauerzuhören, Weckworterkennung, Befehlsende per Stille |
| `Sources/ClaudeClient.swift` | Messages-API über rohes HTTP, SSE-Streaming |
| `Sources/Speaker.swift` | Sprachausgabe, Auswahl der besten deutschen Stimme |
| `Sources/SentenceChunker.swift` | Zerlegt den Textstrom in sprechbare Sätze |
| `Sources/Conversation.swift` | Zustandsmaschine: Zuhören → Fragen → Vorlesen |
| `Sources/ContentView.swift` | Oberfläche |
| `Sources/SettingsView.swift` | Key, Modell, Aufwand, Charakter |
| `Sources/Keychain.swift` | Key-Ablage |
| `tools/smoke_test.sh` | Prüft Key und Request ohne Mac |

## Vor dem Bauen testen

Der API-Teil lässt sich von überall prüfen, auch ohne Mac:

```bash
ANTHROPIC_API_KEY=sk-ant-... ios/tools/smoke_test.sh "Sag in einem Satz hallo."
```

Das Skript schickt genau den Request, den die App schickt — gleiche Header,
gleiche Felder. Antwortet es, ist der Key gültig und die Shape stimmt.

## Was zu wissen ist

**Dieser Code ist nicht kompiliert worden.** Geschrieben in einem Linux-Container
ohne Swift-Toolchain; `AVFoundation`, `Speech` und `SwiftUI` gibt es dort nicht.
Rechne beim ersten Build mit Kleinkram, den der Compiler anzeigt.

**Echo.** Die Audiosession läuft im Modus `.voiceChat`, also mit
Echounterdrückung, und die Erkennung pausiert, solange Jarvis spricht. Ohne
beides würde er sich selbst als Befehl hören. Über Lautsprecher bei hoher
Lautstärke kann es trotzdem passieren — dann Kopfhörer.

**Erkennung auf dem Gerät.** `requiresOnDeviceRecognition` wird gesetzt, wenn
das Gerät es kann: schneller, ohne Netz, und Nebengeräusche gehen nicht an
einen Server. Wo nicht, fällt es automatisch auf die Servererkennung zurück.

**Hintergrund.** Mit dem `audio`-Background-Mode hört er bei gesperrtem
Bildschirm weiter. Das kostet Akku, und für den App Store wäre diese Nutzung
heikel — für eine App auf dem eigenen Gerät ist sie in Ordnung.

**Erkennungsaufgaben laufen nicht endlos.** iOS beendet sie nach etwa einer
Minute; `SpeechListener` setzt deshalb alle 45 Sekunden neu auf. Deswegen
beginnt der Transkripttext zwischendurch von vorn — für die Weckworterkennung
ist das unerheblich.

**Kosten.** Mit `claude-opus-5-5` etwa 0,4 ¢ pro Frage (rund 300 Tokens hinein,
150 hinaus). In den Einstellungen auf `claude-haiku-5-5` umschaltbar, dann etwa
0,01 ¢ — merklich schneller, bei echten Fragen merklich schwächer.
`effort: low` ist gesetzt, weil Wartezeit bei einem Assistenten mehr wiegt als
Tiefe; auch das ist in den Einstellungen änderbar.

## Nächste Schritte

- **Werkzeuge:** Websuche läuft als serverseitiges Tool über das `tools`-Feld,
  ohne eigenen Code. Kalender, Erinnerungen und HomeKit brauchen client-seitige
  Tools und eine Schleife über `stop_reason == "tool_use"`.
- **Eigenes Weckwort:** Das Wort steht in `SpeechListener.wakeWords`. Für echte
  Weckworterkennung statt Textsuche wäre ein kleines Audiomodell der Weg.
- **Verlauf behalten:** `Conversation.turns` lebt nur im Speicher. Für
  Gespräche über App-Starts hinweg nach SwiftData verschieben.
