# Roadbook Recorder — Eine Live-GPS-Spur aufzeichnen

Der **Recorder** ist das Werkzeug für den Einsatz **im Feld**. Er zeichnet die GPS-Spur auf und lässt dich unterwegs Notizen und geotaggte Fotos setzen. Das Ergebnis ist ein draft, der an den Editor zur Erstellung des endgültigen roadbook weitergegeben wird.

> Funktioniert **zu 100 % offline** für GPS + Waypoint + Medien. Die Medien bleiben in der lokalen Warteschlange, bis eine Verbindung besteht. Eine Verbindung wird nur benötigt für: anfänglichen Login, verzögerten Upload, Speichern im Profil.

---

## Vollständige Abfolge: vom Öffnen bis zum Speichern

### 1. Öffne den Recorder

Öffne den **Recorder** aus dem Hauptmenü oder gehe direkt auf `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Du siehst den Startbildschirm mit dem Button **Start recording**. Wenn du nicht angemeldet bist, erscheint ein Hinweis: *„Nicht angemeldet: Fotos bleiben auf diesem Gerät und kommen am Ende in eine lokale .rdbk. Melde dich an, um sie in deinem Konto zu speichern.“* — du kannst trotzdem aufzeichnen.

---

### 2. Starte eine neue Aufzeichnung

Tippe **Start recording**.

> ![Nome sessione](../assets/screenshots/rec02.jpg)

Es öffnet sich ein Modal für den **Namen** der Sitzung (Standard: Datum/Uhrzeit `YYYY-MM-DD HH-MM`). Du kannst ihn ändern. Tippe **Conferma**.

---

### 3. Live-Dashboard — die Aufzeichnung läuft

Während der Aufzeichnung zeigt der Bildschirm oben vier Anzeigen:

> ![Dashboard registrazione](../assets/screenshots/rec03a.jpg)

| Element | Was du siehst |
|----------|-----------|
| **Zeit** | Dauer der Aufzeichnung (Pausen ausgenommen) |
| **km/h** | Aktuelle Geschwindigkeit |
| **Notizen** | Anzahl der gesetzten Notizen |
| **km** | Gefahrene Strecke |

Darunter folgen die Erfassungs-Buttons (Schritt 4) und die Live-Karte (Schritt 5). **Pause** und **End** liegen in einer Leiste unten, jeweils halb so breit; auf dem Handy schwebt diese Leiste direkt über der unteren Tab-Leiste.

---

### 4. Reichere die Spur während der Fahrt an

Die Erfassungsreihe hat links einen großen **Notiz**-Button und rechts daneben ein 2×2-Raster aus Icon-Buttons, genauso hoch wie er:

| Button | Aktion | Bedienung |
|----------|--------|-------------|
| **📍 Notiz** | Setzt eine Notiz an der aktuellen GPS-Position | Tippen: die Notiz wird sofort gesetzt (GPS-Fix erforderlich). Eine Erfolgsglocke ertönt und ein großes grünes Häkchen erscheint für weniger als eine Sekunde auf dem Bildschirm. Es gibt nichts zu tippen — den Text der Notiz schreibst du später im Editor |
| **📷 Foto** | Macht ein geotaggtes Foto | Öffnet die Rückkamera. Das Foto wird an die aktuelle GPS-Position gehängt und setzt dort immer auch eine Notiz |
| **↩ Letzte Notiz rückgängig** | Entfernt die letzte Notiz | Fragt vorher nach und nennt dabei die Notiz, die entfernt wird |
| **🗺 Kartenstil** | Wechselt die Basiskarte | Satellit ↔ topografisch |
| **🧭 Heading up** | Kartenausrichtung | Die Karte dreht sich mit deinem Kurs (heading up) oder bleibt genordet |

Die untere Leiste enthält die anderen beiden:

| Button | Aktion |
|----------|--------|
| **⏸ Pause** | Pausiert GPS und Stoppuhr (Stopps, Wartezeiten). Erneut tippen zum Fortsetzen |
| **🏁 End** | Beendet die Aufzeichnung (Schritt 6) |

> ![Pulsanti waypoint e media](../assets/screenshots/rec04a.jpg)

> **Tipp**: tippe an jeder Kreuzung, Gefahr oder jedem Straßenwechsel auf **Notiz**, ohne den Blick von der Straße zu nehmen, und ergänze die Worte später im Editor. Nutze **Foto** für Schilder und visuelle Punkte.

---

### 5. Live-Karte

> ![Mappa live](../assets/screenshots/rec05.jpg)

- Die Spur ist eine **durchgehende Linie**
- Notizen sind **nummerierte blaue Punkte**
- Fotos haben eine **📷-Markierung**
- Oben links, groß und ohne Beschriftung: die **Distanz seit der letzten Notiz** (km, zwei Dezimalstellen; vor der ersten Notiz seit dem Start)
- Dein GPS-Marker wird ein **Richtungs-Chevron**, wenn du dich bewegst

---

### 6. Ende der Aufzeichnung

Tippe **End** (untere Leiste), um die Aufzeichnung zu beenden.

> ![Riepilogo registrazione](../assets/screenshots/rec06a.jpeg)

Es öffnet sich das Zusammenfassungs-Modal mit den Sitzungsdaten: Streckenpunkte, km, Notizen, Fotos. Hier wählst du, was du tun möchtest:

| Option | Wann nutzen | Was passiert |
|---------|---------------|--------------|
| **💾 Save to server** | Du bist angemeldet und möchtest alles im Profil wiederfinden | Speichert den **draft** auf dem Server (Spur + Waypoint + Medien). Du bleibst im Recorder mit dem Button **Edit**, um im Editor zu öffnen |
| **📦 Export .rdbk** | Du willst eine portable Offline-Datei | Erstellt eine `.rdbk`-ZIP (roadbook.json + Fotos). Datei herunterladen |
| **✏️ Open in Editor** | Du willst die Route sofort verfeinern | Gibt Spur und Waypoint an den Editor weiter. Bereits auf dem Server liegende Fotos bleiben verknüpft |
| **📍 Export GPX** | Du brauchst es nur für andere Software | Lädt `.gpx` im Standardformat herunter (Spur + Notizen als Waypoints mit Namen). Fotos sind **nicht** enthalten |

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
| Notizen | ✅ lokal | ✅ lokal | ✅ lokal |
| Foto | ✅ Warteschlange → Upload | ✅ lokale Warteschlange | ✅ lokale Warteschlange |
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

## Nächster Schritt

Du hast die Spur aufgezeichnet? → [Editor: roadbook erstellen/bearbeiten →](03-editor.md)  
Du möchtest navigieren? → [Reader: mit GPS navigieren →](04-reader.md)
