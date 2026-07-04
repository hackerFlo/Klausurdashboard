# Versionshistorie

Alle nennenswerten Änderungen am Klausurdashboard, neueste Version zuerst.
Die Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/): neue Funktionen erhöhen die zweite Zahl (1.1.0), Fehlerbehebungen die dritte (1.0.1), inkompatible Änderungen die erste (2.0.0).

## [1.0.0] – 2026-07-04

Offizieller Launch. Das Klausurdashboard ist ab jetzt in drei gleichwertigen Versionen verfügbar:

- **Browser (HTML)** – eine einzige Datei, läuft komplett offline
- **macOS-App** (Apple Silicon, `.dmg`)
- **Windows-11-App** (x64, Setup-Installer ohne Adminrechte)

### Funktionsumfang zum Launch

- Countdown-Timer mit automatischem Formatwechsel (Std/Min → Min/Sek) und Warnfarbe unter 15 Minuten Restzeit
- Beameransicht mit Echtzeit-Synchronisation; öffnet in den Desktop-Apps automatisch im Vollbild auf dem Beamer
- Automatisches Umschalten von „Duplizieren" auf „Erweitern" bei gespiegeltem Beamer, Wiederherstellung beim Beenden (macOS & Windows)
- Pause & Fortsetzen des Timers
- WC-Status (Frei / Besetzt), automatisch gesperrt in den letzten 15 Minuten
- Konfigurierbare Abgabestapel (Namensgruppen für eine geordnete Abgabe)
- Freie Ankündigungen, die live auf dem Beamer erscheinen
- Live-Vorschau der Beameransicht direkt im Dashboard
- Screen Wake Lock – der Bildschirm bleibt während der gesamten Prüfung aktiv
- Update-Hinweis: Vor Prüfungsbeginn prüft die App (nur wenn online), ob eine neuere Version verfügbar ist, und zeigt einen dezenten Hinweis mit Download-Link. Die App bleibt auch ohne Update und ohne Internetverbindung voll funktionsfähig.
- Eigenes App-Icon (Prüfungsbogen mit Uhr) für macOS, Windows und als Browser-Favicon

## [0.1.0] – 2026-07-04

Erste Vorabversion als Desktop-App (macOS und Windows) zusätzlich zur Browser-Version, mit dem oben beschriebenen Funktionsumfang.

[1.0.0]: https://github.com/hackerFlo/Klausurdashboard/releases/tag/v1.0.0
[0.1.0]: https://github.com/hackerFlo/Klausurdashboard/releases/tag/v0.1.0
