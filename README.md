# Klausurdashboard

Browserbasiertes Prüfungsaufsichts-Tool für Klausuren an der LMU München.

## Funktionen

- Countdown-Timer (automatische Formatwechsel: Std/Min → Min/Sek → rot unter 15 Min)
- Beameransicht (zweites Browserfenster) mit Echtzeit-Synchronisation via BroadcastChannel / localStorage
- Pause und Fortsetzen des Timers
- WC-Status (Frei / Besetzt / automatisch Gesperrt in den letzten 15 Min)
- Konfigurierbare Abgabestapel (Namensgruppen für die Klausurabgabe)
- Freie Ankündigungen auf dem Beamer
- Live-Vorschau im Dashboard
- Screen Wake Lock – Bildschirm bleibt während der Prüfung aktiv
- Vollständig offline – kein Server, kein Internet nötig

## Technischer Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 6](https://vitejs.dev/) mit [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) → ein einziges `index.html`
- [Tailwind CSS v4](https://tailwindcss.com/)
- Icons: [lucide-react](https://lucide.dev/)
- Animationen: [Motion](https://motion.dev/)

## Entwicklung

```bash
npm install
npm run dev          # Entwicklungsserver auf http://localhost:3000
```

Beameransicht im Entwicklungsmodus: `http://localhost:3000/?beamer`

## Build

```bash
npm run build        # Erzeugt dist/index.html (vollständig selbstständige Datei)
```

Das Build-Ergebnis ist eine einzige HTML-Datei (`dist/index.html`) mit allen JS-, CSS- und Bild-Assets inline.

## Nutzung (fertig gebaute Datei)

1. `dist/index.html` im Browser öffnen (Chrome/Edge empfohlen).
2. Prüfungsname und Dauer eingeben.
3. „Beameransicht öffnen" klicken → neues Fenster auf den Beamer/zweiten Bildschirm ziehen und dort Vollbild (F11) aktivieren.
4. Prüfung starten.
