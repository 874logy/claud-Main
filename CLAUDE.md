# CLAUDE.md

## Projekt
„Mein Wiki“: individualisierbare Wikipedia-Oberfläche als reine statische Web-App (HTML/CSS/JS, kein Build-Schritt, keine Abhängigkeiten).

## Konventionen
- Antworten, UI-Texte, Kommentare und Commit-Nachrichten auf **Deutsch**.
- Kein Framework und kein Bundler einführen; `index.html` muss direkt per Doppelklick (`file://`) funktionieren – daher keine ES-Module.
- Alle Nutzerdaten nur in `localStorage` unter Schlüsseln mit Präfix `meinwiki.`.
- Neue Einstellungen: Standardwert in `DEFAULTS` (`js/app.js`), Eingabefeld mit `data-setting="<name>"` in `index.html`, Wirkung in `applySettings()`.
- HTML von Wikipedia immer durch `sanitize()` schicken, bevor es ins DOM kommt.
- Der Sprachcode bildet den API-Hostnamen – immer über `validLang()` prüfen.

## Testen
Kein Test-Framework. Änderungen im Browser prüfen (z. B. Playwright mit abgefangenen Anfragen an `*.wikipedia.org`, falls das Netzwerk Wikipedia blockiert).
