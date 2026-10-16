# Mein Wiki – eine individualisierbare Wikipedia

Eine kleine Web-App, die Wikipedia-Artikel live lädt und so anzeigt, wie **du** es möchtest.

## Funktionen

- **Suche & Zufallsartikel** in der Wikipedia deiner Wahl (Deutsch, Englisch, Französisch …)
- **Design:** hell, dunkel oder sepia
- **Lesekomfort:** Schriftart, Schriftgröße, Zeilenabstand und Textbreite einstellbar
- **Ausblenden nach Wunsch:** Bilder, Infoboxen, Einzelnachweise, Navigationsleisten, Inhaltsverzeichnis
- **Leseliste** zum Merken von Artikeln und **Verlauf** der zuletzt gelesenen Artikel
- **Eigene Notizen** zu jedem Artikel (werden automatisch gespeichert)
- **Andere Sprache:** denselben Artikel per Klick in einer anderen Sprachversion lesen
- **Export/Import** von Einstellungen, Leseliste, Verlauf und Notizen als JSON-Datei

Alle Daten bleiben in deinem Browser (`localStorage`) – es gibt keinen Server und kein Konto.

## Starten

Keine Installation nötig: einfach `index.html` im Browser öffnen.

Alternativ mit einem lokalen Webserver:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Aufbau

| Datei           | Inhalt                                                     |
|-----------------|------------------------------------------------------------|
| `index.html`    | Seitenstruktur, Einstellungs- und Listen-Dialoge           |
| `css/style.css` | Designs (über CSS-Variablen) und Regeln zum Ausblenden      |
| `js/app.js`     | Wikipedia-API, Routing, Einstellungen, Leseliste, Notizen  |

Die Artikel kommen über die öffentliche [MediaWiki-API](https://www.mediawiki.org/wiki/API:Main_page).
Inhalte von Wikipedia stehen unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.de).
