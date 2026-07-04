# Klausurdashboard

Prüfungsaufsichts-Tool für Klausuren an der LMU München – als Browser-Version (eine einzige HTML-Datei), macOS-App und Windows-App.

## Download

Alle drei Versionen gibt es auf der [Download-Seite](https://hackerflo.github.io/Klausurdashboard/) oder direkt bei den [Releases](https://github.com/hackerFlo/Klausurdashboard/releases). Was sich mit jeder Version geändert hat, steht in der [Versionshistorie](CHANGELOG.md).

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

## Nutzung

1. App installieren oder die HTML-Datei im Browser öffnen (Chrome/Edge empfohlen).
2. Prüfungsname und Dauer eingeben.
3. „Beameransicht öffnen" klicken → neues Fenster auf den Beamer/zweiten Bildschirm ziehen und dort Vollbild (F11) aktivieren (die Desktop-Apps erledigen das automatisch).
4. Prüfung starten.
