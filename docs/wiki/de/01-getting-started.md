# Kurzanleitung — Erste Schritte mit RDBK.app

Willkommen! RDBK.app ist eine PWA (Progressive Web App) zum Erstellen, Teilen und Befolgen digitaler roadbook. Sie läuft **vollständig im Browser** — nichts zu installieren, aber du kannst sie auch wie eine App auf dem Telefon „installieren".

Die App funktioniert **offline** für Aufzeichnung, Bearbeitung und Navigation. Eine Verbindung wird nur benötigt für: Login, Speichern im Profil, Upload von Fotos/Audio, öffentliche Seiten.

---

## 1. Wähle, was du tun möchtest — die 4 Haupt-Tools und Optionen

| Tool | Wofür es dient | Wann man es nutzt |
|------|--------------|---------------|
| **Roadbook Recorder** | Zeichnet eine live GPS-Spur auf und lässt sich mit Waypoints an den Stellen anreichern, die du als Notizen festlegen möchtest; zudem lassen sich Fotos der Kreuzung und praktische Sprachnotizen verknüpfen, um dir Notizen zu machen, wie die Tulpe gezeichnet werden soll oder sonstige Hinweise | Während der Erkundung / der Feldbesichtigung |
| **Editor** | Erstellt oder bearbeitet ein roadbook aus einer Aufzeichnung, aus einem GPX oder aus einem roadbook im openrally-Format; optimiert die Spur, sieht sich die Sprachnotizen und Fotos der Erkundung an, vervollständigt die Notizen und Tulpen durch Zeichnen; die Verwaltung der Pfeile und CAP erfolgt automatisch auf Basis der zugrunde liegenden Spur. Am Ende kannst du es in das Format RDBK, openrally und PDF exportieren, falls du es drucken möchtest | Nach der Aufzeichnung (oder von Null) zum Vorbereiten des endgültigen roadbook |
| **Roadbook Reader** | Ermöglicht die Navigation digitaler roadbook im touristischen oder Wettbewerbsmodus, kann erreichte Notizen automatisch markieren und bietet zusätzlich eine (optionale) Karte, die die Position der einzelnen Note relativ zum Fahrzeug zeigt | Während des Events / der Ausfahrt — ist der „Beifahrer" |
| **Roadbook Player** | GPS-Bordcomputer ohne roadbook: Gesamt-/Teilodometer, Geschwindigkeit, heading, Stoppuhr, Waypoint-Zähler, GPX-Aufzeichnung | Freie Erkundungen, Tests, Ausfahrten ohne vorgegebenes roadbook |

> **ANDERE MÖGLICHKEITEN**:  
> - auf der **HOME PAGE** findest du eine Galerie öffentlicher roadbook, die du einsehen oder befahren kannst
> - wenn du registriert bist, kannst du deine roadbook (draft/ready/public) auf RDBK.app speichern und zwischen Telefon und PC teilen
> - im Bereich **Events** findest du von Clubs organisierte Events
> - ... und du kannst jederzeit ein Event organisieren und dabei die digitale Verwaltung deiner roadbook nutzen!

---

## 2. Typischer Ablauf „von Null zum Rennen"

```
┌─────────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Recorder   │ ──→ │ Editor  │ ──→ │  Save   │ ──→ │ Reader  │ ←── │  Event  │
│  (Feld)     │     │ (Schreiben)│  │ (Profil)│     │ (Navigieren)│ │ (Organis.)│
└─────────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
      │                   │                │                │              │
  GPS live           Zeichne/       Im Cloud         Folge          Event erstellen,
  Waypoint           importiere     gespeichert +    Notizen +      RB zuordnen,
  Foto/Audio         GPX/.rdbk      optionalem        CAP +          einladen mit
                      Icons/Symbolen .rdbk lokal      Punktestand    Join-Code
```

---

## 3. Warum ein Konto erstellen

Der Login erlaubt dir, deine roadbook in der Cloud zu speichern und auf jedem Gerät wiederzufinden — du kannst während einer Erkundung eine Spur mit dem Telefon aufzeichnen und sie dann bequem am PC bearbeiten, ohne verrückt zu werden beim Verschieben von Dateien.

1. Tippe **Account** (oben rechts) → **Registrieren**
2. Gib ein: Vorname, Nachname, Benutzername, E-Mail, Passwort (≥ 8 Zeichen)
3. Setze den Haken bei **Ich akzeptiere die Nutzungsbedingungen**
4. Schließe die Turnstile-Prüfung ab (falls aktiv)
5. Du erhältst eine E-Mail: klicke **Meine E-Mail bestätigen** innerhalb von 24 h
6. Kehre in die App zurück und mache **Login** mit E-Mail/Benutzername + Passwort

> **Google Sign-In**: wenn du den Button „Mit Google fortfahren" siehst, kannst du ihn nutzen, um ohne Passwort zu erstellen/anzumelden.

---

## 4. Wichtige Begriffe, die du gleich kennen solltest

| Begriff | Bedeutung |
|----------|----------------|
| **Roadbook-Status** | `draft` = private Entwurf · `ready` = bereit, aber privat · `public` = für alle in der Galerie sichtbar |
| **Lokales vs. Cloud-Speichern** | Im Editor: **Export .rdbk** = ZIP-Datei auf deinem Gerät (offline, portabel). **Save to profile** = auf dem Server gespeichert, von jedem angemeldeten Gerät abrufbar |
| **Fotos & Sprachnotizen** | Landen nicht im `.rdbk`, es sei denn, du setzt beim Export den Haken „Fotos und Audio einschließen". Sie liegen auf dem Server (Login nötig). Ohne Login bleiben sie auf dem Gerät und kommen in das lokale `.rdbk` |
| **Join-Code Events** | Kurzer Code (z. B. `DA2C09`), den dir der Veranstalter gibt. Öffne `/go/DA2C09` → du kommst ins Event und siehst die `ready`-roadbook für Teilnehmer |
| **Rennergebnis (Ranking)** | Nur im **Competition**-Modus im Reader. Erzeugt am Ende der Prüfung einen signierten 55-Zeichen-QR-Code. |

---

## 5. Erste Dinge zum Ausprobieren (5 Minuten)

1. **Spur aufzeichnen** → Recorder → „Start recording" → gehen/fahren → „Finish" → „Open in Editor"
2. **Route zeichnen** → Editor → „Draw on the map" → zwei Punkte tippen → Notizen hinzufügen (Zeile tippen → Inline-Editor)
3. **.rdbk exportieren** → Editor → Export → .rdbk → ZIP-Datei herunterladen
4. **Im Reader öffnen** → Reader → „Carica file .rdbk" → Datei wählen → „Trip mode" → Navigation starten
5. **Tripmaster testen** → Tripmaster → Start → siehe Odometer, Geschwindigkeit, heading live

---

## 6. Wo du Hilfe findest

| Was | Wo |
|------|------|
| Nutzungsbedingungen | `/terms/` (Link im Footer) |
| Datenschutz | `/privacy/` |
| Standard `.rdbk` | `/standard/` — vollständige Format-Spezifikation |
| Bug melden / Feature anfragen | GitHub Issues (Link im Footer → About) |
| Kontakt | `/contact/` |

---

## 7. Nächster Schritt

Wähle das Tool, das du brauchst, und lies seine Anleitung:

- 📍 [Eine Spur aufzeichnen →](02-recorder.md)
- ✏️ [Ein roadbook erstellen/bearbeiten →](03-editor.md)
- 🧭 [Mit dem Reader navigieren →](04-reader.md)
- 📊 [Den Tripmaster nutzen →](05-tripmaster.md)
