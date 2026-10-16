# Karteikarten

Lern-App für iOS und Android, gebaut mit Expo (SDK 58) und Expo Router.

## Funktionen

- Stapel anlegen und löschen, Karten mit Vorder- und Rückseite anlegen, bearbeiten und löschen
- Lernen mit dem Leitner-System: Gewusste Karten wandern ein Fach weiter und kommen nach 3, 7, 14 und 30 Tagen wieder. Nicht gewusste Karten gehen zurück in Fach 1, kommen in derselben Runde noch einmal und am nächsten Tag wieder.
- Karten drehen sich beim Antippen um, mit Vibrations-Feedback
- Fortschritt pro Fach und fällige Karten auf einen Blick
- Alle Daten liegen lokal auf dem Gerät (SQLite) und funktionieren offline
- Heller und dunkler Modus
- Ein Beispielstapel „Geschichte“ ist beim ersten Start schon angelegt

## Starten

```bash
cd karteikarten-app
npm install
npx expo start
```

Dann den QR-Code mit der App **Expo Go** scannen (iOS: Kamera-App, Android: in Expo Go).

## Prüfen

```bash
npm run typecheck
```

## Aufbau

```
src/
  app/                  Bildschirme (Expo Router)
    _layout.tsx         Navigation, Datenbank, Farbschema
    index.tsx           Übersicht aller Stapel
    deck/new.tsx        Neuen Stapel anlegen
    deck/[id]/index.tsx Stapel: Fortschritt und Kartenliste
    deck/[id]/card.tsx  Karte anlegen oder bearbeiten
    deck/[id]/study.tsx Lernmodus
  components/Button.tsx
  lib/db.ts             Datenbank und Leitner-Logik
  lib/theme.ts          Farben für hell und dunkel
```

## iPhone-App bauen (TestFlight / App Store)

Voraussetzungen: ein kostenloses [Expo-Konto](https://expo.dev/signup) und ein Apple-Developer-Konto (99 $ pro Jahr). Ein Mac ist nicht nötig, gebaut wird in der Cloud.

1. Die Bundle-ID in `app.json` (`ios.bundleIdentifier`, derzeit `com.logy.karteikarten`) bei Bedarf auf eine eigene, weltweit eindeutige ID ändern.
2. Bauen:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build --platform ios --profile production
   ```
   Beim ersten Mal fragt EAS nach dem Apple-Login und legt Zertifikat und Provisioning-Profil automatisch an.
3. An TestFlight senden:
   ```bash
   npx eas-cli@latest submit --platform ios --latest
   ```
   Danach erscheint die App in App Store Connect unter TestFlight und lässt sich auf dem iPhone installieren.

Das Profil `preview` erstellt stattdessen eine Version zur direkten Installation auf registrierten Geräten (Ad-hoc).
