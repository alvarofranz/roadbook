# Reader — Ein Roadbook mit GPS navigieren

Der **Reader** ist der digitale Beifahrer: er lädt ein roadbook und verwandelt es in eine papierähnliche Notiz-Tabelle, die vom GPS geführt wird. Odometer, CAP-Kompass, automatische oder manuelle Validierung und — im Competition-Modus — ein signierter QR-Code mit dem Ergebnis.

> Funktioniert zu 100 % offline für Navigation und Validierung. Eine Verbindung wird nur benötigt für: Login, Laden eines roadbook aus dem Profil/der öffentlichen Galerie, Speichern von Ergebnissen.

---

## 1. Ein Roadbook laden

Öffne den Reader (`/reader/`) — der Startbildschirm bietet 3 Eingänge:

| Eingang | Vorgehen | Was passiert |
|----------|-----------|--------------|
| **Carica file `.rdbk`** | Tap „Carica .rdbk" → Datei wählen | Importiert vollständiges roadbook (Spur + Notizen + Icons) |
| **I tuoi roadbook** | Tap „I tuoi roadbook" (nur wenn angemeldet) | Picker der auf deinem Profil gespeicherten roadbook |
| **Roadbook pubblici** | Tap „Roadbook pubblici" | Picker der öffentlichen challenge der Galerie |

**Per URL** (automatisch):
- `/reader/<slug>` → lädt öffentliches roadbook direkt
- `?rb=<id>` → lädt ein deiner gespeicherten roadbook per ID

> Um ein öffentliches roadbook zu öffnen, musst du angemeldet sein.

---

## 2. Wähle den Navigationsmodus

Nach dem Laden öffnet sich das Start-Modal mit diesen Optionen:

| Option | Beschreibung |
|---------|-------------|
| **Mappa per nota** | Zeigt/versteckt die Mini-Karte unter jeder Note |
| **Registra GPX** | Speichert die GPS-Spur der Navigation (crash-sicher) |
| **Suono su nota** | Kurzer Beep, wenn eine Note validiert wird |

Dann wählst du den **Modus**:

| Modus | Wann nutzen | Funktion |
|----------|---------------|---------|
| **Trip mode** | Freie Nutzung, Erkundungen, Ausfahrten ohne Punktestand | Folgt dem roadbook frei, kein Punktestand |
| **Competition** | Rennen, Events mit Klassifizierung | Validiert mit Strafen, erzeugt signierten QR für Ranking |

---

## 3. Der Navigationsbildschirm

```
┌─────────────────────────────────────────┐
│ Titolo roadbook                          │
│ Totale: 12.34 km  |  Parziale: 0.56 km  │
│ Bussola: 045° ↗  |  GPS: ±3m 🟢         │
├─────────────────────────────────────────┤
│ #  │ Vignette │ Indicazioni   │ [Mappa] │
│ 1  │  ┌───┐   │ Svolta a dx   │  [☗]   │
│    │  │ ╱  │   │ CAP 045°     │         │
│    │  └───┘   │ Asfalto       │         │
│─── │───────── │────────────── │─────────│
│ 2  │  ┌───┐   │ Dritto        │  [☗]   │
│    │  │ ↑  │   │ Sterrato      │         │
│    │  └───┘   │               │         │
│    │   ✅     │ RAGGIUNTA     │         │
├─────────────────────────────────────────┤
│              [⏸ Pausa] [🏁 Fine]         │
└─────────────────────────────────────────┘
```

### Elemente des Bildschirms

1. **Odometer-Leiste** (sticky oben): Titel, Gesamt, Teil, CAP-Kompass, Uhrzeit, GPS-Status, Akku
2. **Notiz-Tabelle**: jede Note in einer Zeile mit Distanz, Tulpen-Vignette, Text, CAP, Straßentyp
3. **Notiz-Zustände**: ✅ Raggiunta (erreicht, grün) · ⏭ Saltata (übersprungen, rosa) · ▶ Attiva (aktiv, roter Rand) · weiß (zukünftig)
4. **Spalten**: Distanzen + Nummer | Vignette | Indicazioni | Buttons (Karte, erreicht)

---

## 4. Fortschritt: automatisch vs. manuell

### Automatisch (Standard)
Sobald das GPS in den **Validierungsradius** der aktiven Note eintritt, wird die Note automatisch als erreicht markiert.

- Der Radius ist adaptiv: hängt vom `wp_radius` der Note ab, mit einem Maximum, das Überlappungen vermeidet
- Funktioniert unabhängig von der Geschwindigkeit
- Ein/Aus schalten mit dem Schalter **Auto** in der Leiste

### Manuell
Tap auf die aktive Note oder den Button „Raggiunta" zum Validieren.

- Im Trip: markiert grün und synchronisiert den Odometer
- In Competition: validiert mit Punktestand (GPS innerhalb 100 m erforderlich)
- Rückwärts validieren ist nicht möglich

### Freihändig mit einer externen Fernbedienung
Aktiviere **Externe Fernbedienung (Pedal / Clicker)** in der Modusauswahl, um ohne Bildschirmberührung weiterzuschalten.

- Ein Bluetooth-**Blätterpedal**, ein Kamera-Clicker oder eine Präsentations-Fernbedienung koppelt sich als Tastatur: nichts zu konfigurieren, funktioniert offline, im Browser wie in der App
- **Weiter**: → · ↓ · Page ↓ · Space · Enter — **Zurück**: ← · ↑ · Page ↑ (nur im Trip-Modus; in Competition lässt sich eine validierte Note nicht zurücknehmen)
- Ein Fußpedal lässt beide Hände am Lenkrad; ein Clicker am Lenker passt für Motorrad und Fahrrad
- Die Einstellung bleibt auf dem Gerät gespeichert, und Tasten werden ignoriert, während du tippst oder ein Dialog offen ist

---

## 5. CAP-Leiste (zwischen zwei Notizen)

Wenn die vorige Note ein CAP hat, erscheint unten eine Leiste mit:
- **Rotta da tenere** (Kurs zu haltend)
- **Velocità corrente** (aktuelle Geschwindigkeit)
- **Distanza alla destinazione** (Distanz zum Ziel)
- **Freccia direzionale** (Richtungspfeil)

Es ist eine „Kompass"-Hilfe, um zwischen zwei Notizen zu navigieren, ohne sich zu verlieren.

---

## 6. Interaktive Karte pro Note

Optional: Tap auf den Karten-Button einer Zeile öffnet eine Mini-Karte unter der Note.

- Zentriert auf die Note bei Zoom ~13
- Zeigt die gesamte Spur + Pin für Kontext
- Blauer GPS-Punkt in Echtzeit
- Tap auf die geöffnete Karte schließt sie wieder

> Die Karte pro Note ist nützlich, um die Position im Gelände zu bestätigen, wenn der Notiz-Text mehrdeutig ist.

---

## 7. Zusatzfunktionen

| Funktion | Bedienung |
|----------|-------------|
| **Correzione odometro** | Nudge ±10 m bei Bedarf; Validieren einer Note synchronisiert das Gesamt mit der Distanz dieser Note |
| **Pausa** | Stoppt GPS und Wake-Lock zum Akku-Sparen (Mittagspausen, Wartezeiten) |
| **Sound on note** | Kurzer WebAudio-Beep, wenn eine Note validiert wird (auto oder manuell) |
| **Registrazione GPX** | Crash-sicher: Checkpoint bei jedem Fix, Wiederherstellung, wenn die App schließt |
| **Recupero sessione** | Wenn unterbrochen (Anruf, Absturz), wird exakt dort fortgesetzt, wo du warst |
| **Cambio lingua** | Sprache mitten in der Sitzung ändern ohne Datenverlust |

---

## 8. In Competition — QR-Ergebnis

Im Competition-Modus wird am Ende der Navigation ein **HMAC-signierter QR-Code** (55 Zeichen) erzeugt, der enthält:
- Vollständiges Ergebnis: Strafen, Zeiten, Geschwindigkeiten
- Signiert gegen den Server (nicht fälschbar)

Den QR-Code an den Veranstalter für die Klassifizierung (Ranking) übergeben.

---

## 9. Wiederherstellung einer unterbrochenen Sitzung

Beim Start prüft der Reader in dieser Reihenfolge:
1. **Sessione in corso** in `localStorage` → schlägt Fortsetzung vor
2. **Roadbook da URL** → lädt es direkt
3. **GPX orfano** → schlägt Spur-Wiederherstellung vor
4. **Niente** → startet sauber

> Die Fortsetzung abzulehnen **löscht die Sitzung nicht**: sie wird nur überschrieben, wenn du eine neue Fahrt startest oder explizit beendest.

---

## 10. Nächster Schritt

Du hast die Navigation abgeschlossen? → [Tripmaster: GPS-Bordcomputer →](05-tripmaster.md)  
Du möchtest ein roadbook erstellen? → [Editor: erstellen/bearbeiten →](03-editor.md)
