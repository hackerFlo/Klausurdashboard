# Klausurdashboard

Prüfungsaufsichts-Tool für Klausuren an der LMU München – läuft als Website direkt im Browser.

## Nutzung

Das Klausurdashboard gibt es ausschließlich als Website: [hackerflo.github.io/Klausurdashboard](https://hackerflo.github.io/Klausurdashboard/). Es ist keine Installation nötig, und es läuft immer die neueste Version. Internet wird nur zum Öffnen benötigt – einmal geladen, läuft die Software auch bei Internetausfall unterbrechungsfrei weiter. Was sich mit jeder Version geändert hat, steht in der [Versionshistorie](CHANGELOG.md).

1. [Klausurdashboard öffnen](https://hackerflo.github.io/Klausurdashboard/Klausurdashboard.html) (Chrome/Edge empfohlen).
2. Prüfungsname und Dauer eingeben.
3. „Beameransicht öffnen" klicken → neues Fenster auf den Beamer/zweiten Bildschirm ziehen und dort Vollbild (F11) aktivieren.
4. Prüfung starten.

## Funktionen

- Countdown-Timer (automatische Formatwechsel: Std/Min → Min/Sek → rot unter 15 Min)
- Beameransicht (zweites Browserfenster) mit Echtzeit-Synchronisation via BroadcastChannel / localStorage
- Pause und Fortsetzen des Timers
- WC-Status (Frei / Besetzt / automatisch Gesperrt in den letzten 15 Min)
- Konfigurierbare Abgabestapel (Namensgruppen für die Klausurabgabe)
- Freie Ankündigungen auf dem Beamer
- Live-Vorschau im Dashboard
- Screen Wake Lock – Bildschirm bleibt während der Prüfung aktiv
- Offline-sicher – nach dem Öffnen wird keine Internetverbindung mehr benötigt
