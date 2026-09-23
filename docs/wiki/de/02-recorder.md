# Roadbook Recorder — Eine Live-GPS-Spur aufzeichnen

Der **Recorder** ist das Werkzeug für den Einsatz **im Feld**. Er zeichnet die GPS-Spur auf und lässt dich unterwegs Notizen und geotaggte Fotos setzen. Das Ergebnis ist ein draft, der an den Editor zur Erstellung des endgültigen roadbook weitergegeben wird.

> Funktioniert **zu 100 % offline** für GPS + Waypoint + Medien. Die Medien bleiben in der lokalen Warteschlange, bis eine Verbindung besteht. Eine Verbindung wird nur benötigt für: anfänglichen Login, verzögerten Upload, Speichern im Profil.

---

## Vollständige Abfolge: vom Öffnen bis zum Speichern

### 1. Öffne den Recorder

Öffne den **Recorder** aus dem Hauptmenü oder gehe direkt auf `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Du siehst den Startbildschirm mit dem Button **Start recording**. Wenn du nicht angemeldet bist, erscheint ein Hinweis: *„Nicht angemeldet: Die Route und ihre Fotos warten auf diesem Gerät, und Speichern bittet dich, dich anzumelden.“* — du kannst trotzdem aufzeichnen.

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

Tippe **End** (untere Leiste) und bestätige, um die Aufzeichnung zu beenden.

> ![Riepilogo registrazione](../assets/screenshots/rec06a.jpeg)

Ein Dialog zeigt eine kurze Zusammenfassung (km · Notizen · Fotos) und stellt genau eine Frage, mit zwei Buttons:

| Button | Was passiert |
|---------|--------------|
| **💾 Speichern** | Angemeldet: Die Aufzeichnung wird als roadbook-**draft** (mit ihren Fotos) gespeichert und der **Editor öffnet sich** sofort darauf. Abgemeldet: Du kommst zur Anmeldeseite und, sobald du angemeldet bist, kehrst du zurück und sie wird genauso gespeichert; dann öffnet sich der Editor |
| **🗑 Verwerfen** | Fragt nach einer Bestätigung und nennt, was verloren ginge (Spur, Notizen, Fotos, Sprachnotizen), dann wird die Aufzeichnung verworfen |

Hier gibt es keine Export-Buttons: Exportieren (GPX, `.rdbk`, PDF…) erledigst du später im Editor.

> Der Dialog lässt sich nicht durch Tippen daneben schließen. Bis du speicherst oder verwirfst, ist die Aufzeichnung sicher — selbst wenn die App abstürzt, wird sie dir beim nächsten Besuch erneut angeboten.

---

### 7. Im Editor

Der Editor öffnet sich mit bereits geladener Spur, Notizen und Fotos: Gib dem roadbook einen Namen, schreib den Text der Notizen und exportiere es, wenn du möchtest. Der draft ist gespeichert und findet sich auch unter **Meine Roadbooks** im Hauptmenü.

## Offline-Verhalten

| Was | Angemeldet + online | Angemeldet + offline | Abgemeldet |
|------|------------------|-------------------|----------|
| GPS-Spur | ✅ lokal + Checkpoint | ✅ lokal + Checkpoint | ✅ lokal + Checkpoint |
| Notizen | ✅ lokal | ✅ lokal | ✅ lokal |
| Foto | ✅ Warteschlange → Upload | ✅ lokale Warteschlange | ✅ lokale Warteschlange |
| Server-draft | live erstellt/aktualisiert | beim ersten Flush erstellt | bei **Speichern** erstellt, nach der Anmeldung |
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
