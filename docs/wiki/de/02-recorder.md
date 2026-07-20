# Roadbook Recorder — Eine Live-GPS-Spur aufzeichnen

Der **Recorder** ist das Werkzeug für den Einsatz **im Feld**. Er zeichnet die GPS-Spur auf und lässt dich sie mit Waypoints, geotaggten Fotos und Sprachnotizen anreichern. Das Ergebnis ist ein draft, der an den Editor zur Erstellung des endgültigen roadbook weitergegeben wird.

> Funktioniert **zu 100 % offline** für GPS + Waypoint + Medien. Die Medien bleiben in der lokalen Warteschlange, bis eine Verbindung besteht. Eine Verbindung wird nur benötigt für: anfänglichen Login, verzögerten Upload, Speichern im Profil.

---

## Vollständige Abfolge: vom Öffnen bis zum Speichern

### 1. Öffne den Recorder

Öffne den **Recorder** aus dem Hauptmenü oder gehe direkt auf `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Du siehst den Startbildschirm mit dem Button **Start recording**. Wenn du nicht angemeldet bist, erscheint ein Hinweis: *„Foto e audio richiedono login"* (Fotos und Audio erfordern Login) — du kannst trotzdem aufzeichnen, aber die Medien bleiben nur auf dem Gerät.

---

### 2. Starte eine neue Aufzeichnung

Tippe **Start recording**.

> ![Nome sessione](../assets/screenshots/rec02.jpg)

Es öffnet sich ein Modal für den **Namen** der Sitzung (Standard: Datum/Uhrzeit `YYYY-MM-DD HH-MM`). Du kannst ihn ändern. Tippe **Conferma**.

---

### 3. Live-Dashboard — die Aufzeichnung läuft

Das Live-Dashboard zeigt alle Daten in Echtzeit:

> ![Dashboard registrazione](../assets/screenshots/rec03a.jpg)

| Element | Was du siehst |
|----------|-----------|
| **Tempo** | Dauer der Aufzeichnung (Pause ausgenommen) |
| **Velocità** | Momentangeschwindigkeit + Höchstgeschwindigkeit |
| **Waypoint** | Zähler der gesetzten Waypoints |
| **Distanza** | Gefahrene km |
| **Mappa** | Heading-up-Karte (Fahrtrichtung oben) mit Spur und Waypoints |

> Die Karte ist standardmäßig **heading-up** — die Fahrtrichtung zeigt immer nach oben. Tippe die Steuerung oben rechts an, um auf Norden zu fixieren.

---

### 4. Reichere die Spur während der Fahrt an

Während der Aufzeichnung hast du 4 Buttons zur Verfügung:

| Button | Aktion | Bedienung |
|----------|--------|-------------|
| **⏸ Pause** | Pausiert GPS und Stoppuhr | Tippe zum Pausieren (Stopps, Wartezeiten). Mit demselben Button fortsetzen |
| **📍 Waypoint** | Erstellt einen Waypoint an der aktuellen GPS-Position | Tippe → Text schreiben (schließt nach 5 s automatisch). Mikrofon zum Diktieren nutzen |
| **🎤 WP audio** | Nimmt eine Sprachaufnahme auf | **Gedrückt halten** zum Aufnehmen. Loslassen → Countdown 5→0 → speichern. Auf Desktop wird automatisch transkribiert |
| **📷 WP Foto** | Macht ein geotaggtes Foto | Öffnet die Rückkamera. Das Foto wird an die aktuelle GPS-Position gehängt |

> ![Pulsanti waypoint e media](../assets/screenshots/rec04a.jpg)

> **Tipp**: nutze **Waypoint** für schriftliche Referenzen (Kreuzungen, Gefahren, Straßenwechsel), **WP audio** für lange Notizen während der Fahrt, **WP Foto** für Schilder und visuelle Punkte.

---

### 5. Live-Karte

> ![Mappa live](../assets/screenshots/rec05.jpg)

- Die Spur ist eine **durchgehende Linie**
- Waypoints sind **nummerierte blaue Punkte**
- Fotos haben eine **📷-Markierung**
- Dein GPS-Marker wird ein **Richtungs-Chevron**, wenn du dich bewegst
- Tippe einen Waypoint/ein Foto an → Infos und Aktionen (löschen, Text bearbeiten)

---

### 6. Ende der Aufzeichnung

Tippe **Finish**, um die Aufzeichnung zu beenden.

> ![Riepilogo registrazione](../assets/screenshots/rec06a.jpeg)

Es öffnet sich das Zusammenfassungs-Modal mit den Sitzungsdaten: Streckenpunkte, km, Waypoints, Fotos. Hier wählst du, was du tun möchtest:

| Option | Wann nutzen | Was passiert |
|---------|---------------|--------------|
| **💾 Save to server** | Du bist angemeldet und möchtest alles im Profil wiederfinden | Speichert den **draft** auf dem Server (Spur + Waypoint + Medien). Du bleibst im Recorder mit dem Button **Edit**, um im Editor zu öffnen |
| **📦 Export .rdbk** | Du willst eine portable Offline-Datei | Erstellt eine `.rdbk`-ZIP (roadbook.json + Fotos + Audio). Datei herunterladen |
| **✏️ Open in Editor** | Du willst die Route sofort verfeinern | Gibt Spur und Waypoint an den Editor weiter. Bereits auf dem Server liegende Fotos bleiben verknüpft |
| **📍 Export GPX** | Du brauchst es nur für andere Software | Lädt `.gpx` im Standardformat herunter (Spur + Waypoint mit Namen). Fotos und Audio sind **nicht** enthalten |

> 📸 *Screenshot: Speicheroptionen — Save to server, Export .rdbk, Open in Editor, Export GPX*

> **Best practice**: wenn angemeldet → **Save to server** → dann **Open in Editor**.  
> Wenn abgemeldet → **Export .rdbk** → dann zu Hause: Login → Editor → `.rdbk` importieren → Save to profile.

---

### 7. Nach dem Speichern

Wenn du **Save to server** gewählt hast, zeigt der Recorder den Button **Edit**, der dich direkt in den Editor mit bereits geladener Spur und Waypoints bringt. Der draft ist gespeichert und findet sich auch unter **I miei roadbook** (Meine roadbook) im Hauptmenü.

## Offline-Verhalten

| Was | Angemeldet + online | Angemeldet + offline | Abgemeldet |
|------|------------------|-------------------|----------|
| GPS-Spur | ✅ lokal + Checkpoint | ✅ lokal + Checkpoint | ✅ lokal + Checkpoint |
| Waypoint-Text | ✅ lokal | ✅ lokal | ✅ lokal |
| Foto | ✅ Warteschlange → Upload | ✅ lokale Warteschlange | ✅ lokale Warteschlange |
| Audio | ✅ Warteschlange → Upload | ✅ lokale Warteschlange | ✅ lokale Warteschlange |
| Server-draft | live erstellt/aktualisiert | beim ersten Flush erstellt | nie erstellt |
| Wiederherstellung nach Absturz | ✅ automatisch | ✅ automatisch | ✅ automatisch |

---

## Wiederherstellung einer unterbrochenen Sitzung

Der Recorder speichert die Sitzung in Echtzeit. Wenn die App geschlossen wird (Anruf, Absturz, Akku), schlägt sie beim nächsten Start vor:

1. **Resume** — die Aufzeichnung dort fortsetzen, wo du sie verlassen hast
2. **Recupero GPX** — wenn die Sitzung verloren ist, die verwaiste GPX-Spur wiederherstellen
3. **Parti pulito** — ignorieren und neu beginnen

> 📸 *Screenshot: Modal zur Wiederherstellung einer unterbrochenen Sitzung*

> Das Resume abzulehnen **löscht** die Sitzung nicht: sie wird nur überschrieben, wenn du eine neue Aufzeichnung startest oder mit „End the trip" beendest.

---

## Tastaturkürzel (Desktop)

| Taste | Aktion |
|-------|--------|
| `Spazio` | Waypoint (GPS-Fix erforderlich) |
| `A` | WP audio (gedrückt halten) |
| `F` | WP Foto |
| `P` | Pause / Resume |
| `Esc` | Finish / Modal schließen |

---

## Nächster Schritt

Du hast die Spur aufgezeichnet? → [Editor: roadbook erstellen/bearbeiten →](03-editor.md)  
Du möchtest navigieren? → [Reader: mit GPS navigieren →](04-reader.md)
