# Tripmaster — GPS-Bordcomputer

Der **Tripmaster** ist ein GPS-Bordcomputer ohne roadbook: keine Notizen, kein zu folgender Streckenverlauf, kein Punktestand. Er zeigt in Echtzeit Gesamt- und Teilodometer, Geschwindigkeit mit Warn-Bändern, heading (CAP), Stoppuhr und Waypoint-Zähler — nützlich für Erkundungen, Tests oder Ausfahrten, wo nur die Bordinstrumente gebraucht werden.

> Funktioniert zu 100 % offline. Die Sitzung wird bei jedem Fix gespeichert, daher gehen bei einem Anruf oder Bildschirm-Sperre keine Daten verloren.

---

## 1. Start

Öffne den **Tripmaster** (`/tripmaster/`) und tippe **Start**. Sofort siehst du das Live-Dashboard mit allen Instrumenten.

Beim Start prüft der Tripmaster automatisch:
1. **Sessione interrotta** in Bearbeitung → schlägt Fortsetzung vor
2. **Traccia GPX orfana** → schlägt Wiederherstellung vor
3. **Niente** → startet sauber

---

## 2. Das Dashboard

```
┌──────────────────────────────────┐
│ ⏰ 14:32   🔋 85%   🛰 ±3m      │
├──────────────────────────────────┤
│                                  │
│  TOTALE          PARZIALE        │
│  12.34 km        0.56 km         │
│  [−10] [+10]    [−10] [+10]      │
│                                  │
│  VELOCITÀ        CAP             │
│  45 km/h ▲      045° ↗           │
│  ⚠ max: 78 km/h                  │
│                                  │
│  CRONOMETRO      WAYPOINT        │
│  12:34 ▶         5              │
│                                  │
├──────────────────────────────────┤
│ [🔴 STOP GPX] [🏁 End trip]     │
└──────────────────────────────────┘
```

### Instrumente:

| Instrument | Beschreibung |
|-----------|-------------|
| **Odometro totale** | Distanz seit Beginn der Sitzung |
| **Odometro parziale** | Distanz seit dem letzten Reset oder Waypoint |
| **Velocità** | Aktuelle Geschwindigkeit + Höchstwert |
| **Heading (CAP)** | Fahrtrichtung in Grad mit Nadel |
| **Cronometro** | Timer Start/Pause/Reset |
| **Waypoint** | Zähler (nur Zahl, keine Position gespeichert) |

---

## 3. Odometer: Gesamt, Teil und Korrekturen

Zwei unabhängige Odometer, beide mit manuellen Korrekturen ±10 m:

| Button | Aktion |
|----------|--------|
| **+10 / −10** (parziale) | Korrigiert den Teilwert |
| **+10 / −10** (totale) | Korrigiert den Gesamtwert |

> Die Korrektoren können nicht unter 0 gehen.

### Reset des Teil-Odometers

Halte den Reset-Button **5 Sekunden** gedrückt (Schutz gegen versehentliches Berühren). Das Teil-Odometer wird auch automatisch auf Null gesetzt, wenn du **Mark waypoint** drückst.

---

## 4. Geschwindigkeit und Warn-Bänder

Stelle eine **zu überwachende Geschwindigkeit** ein, um visuelle Signale zu erhalten:

| Band | Bedingung | Farbe (Standard) |
|-------|-----------|------------------|
| Unter Limit | `v < limite − 5` | Grün |
| Annäherung | `limite − 5 ≤ v < limite` | Orange |
| Überschreitung | `v ≥ limite` | Rot mit ⚠ |

> Die Konfiguration der Bänder (Limit und Farben) erfolgt über den Geschwindigkeits-Einstellungs-Button. Farben und Limit werden gespeichert und zur nächsten Sitzung wiederhergestellt.

---

## 5. Stoppuhr

Die Stoppuhr nutzt die Systemuhr, zählt also auch weiter, wenn die App in den Hintergrund geht.

| Button | Aktion |
|----------|--------|
| **Start/Pausa** | Startet oder pausiert |
| **Reset** | Setzt auf Null (nur bei gestopptem Timer) |

> Die angezeigte Zeit umfasst die Hintergrund-Phase: wenn du pausierst und erst Stunden später fortsetzt, läuft die Zählung dort weiter, wo sie war.

---

## 6. Waypoint-Zähler

Drücke **Mark waypoint**, um:
- den Waypoint-Zähler zu erhöhen
- den **Teilwert** auf Null zu setzen

> Der Zähler ist nur eine Zahl — er speichert keine Koordinaten. Um die tatsächliche Position aufzuzeichnen, aktiviere die **GPX-Aufzeichnung**.

---

## 7. GPX-Aufzeichnung

Aktiviere die GPX-Aufzeichnung über den dafür vorgesehenen Button, um eine Spur deiner Ausfahrt zu haben:

- **Crash-sicher**: Checkpoint bei jedem Fix, Wiederherstellung, wenn die App schließt
- Der Button wird während der Aufzeichnung rot **STOP**
- Settings-Modal zum Konfigurieren von Dateiname und Optionen

---

## 8. Wiederherstellung einer unterbrochenen Sitzung

Beim Start prüft er in dieser Reihenfolge:
1. **Sessione in corso** in `localStorage` → schlägt Fortsetzung mit allen Daten vor (Odometer, Stoppuhr, Waypoint, GPX)
2. **GPX orfano** → schlägt Wiederherstellung der unterbrochenen Spur vor
3. **Niente** → startet sauber

> Die Fortsetzung abzulehnen **löscht** die Sitzung nicht: sie wird überschrieben, sobald du dich zu bewegen beginnst, oder explizit mit „End the trip" gelöscht.

---

## 9. Tastaturkürzel (Desktop)

| Taste | Aktion |
|-------|--------|
| `Spazio` | Mark waypoint |
| `P` | Pause/Resume Stoppuhr |
| `Esc` | End trip |

---

## 10. Nächster Schritt

Du hast die Erkundung abgeschlossen? → [Recorder: eine Spur aufzeichnen →](02-recorder.md)  
Du möchtest ein roadbook erstellen? → [Editor: erstellen/bearbeiten →](03-editor.md)
