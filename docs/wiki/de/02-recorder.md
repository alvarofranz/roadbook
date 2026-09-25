# Roadbook Recorder — Eine Live-GPS-Spur aufzeichnen

Der **Recorder** ist das Werkzeug für den Einsatz **im Feld**. Er zeichnet die GPS-Spur auf und lässt dich unterwegs Notizen, geotaggte Fotos und Sprachnotizen setzen. Das Ergebnis ist ein draft, der im Editor zum endgültigen roadbook wird.

> Funktioniert **zu 100 % offline** für das GPS, die Notizen, die Fotos und die Sprachnotizen. Die Fotos bleiben in einer lokalen Warteschlange, bis ein Netz da ist. Eine Verbindung brauchst du nur zum Anmelden, zum Hochladen der Fotos und zum Speichern im Profil.

---

## Vollständige Abfolge: vom Öffnen bis zum Speichern

### 1. Öffne den Recorder

Öffne den **Recorder** über die Tab-Leiste (das ⏺-Symbol) oder gehe direkt auf `/recorder/`.

> ![Start des Recorders](../assets/screenshots/rec01.jpg)

Der Startbildschirm sagt, was der Recorder tut, und zeigt live den **GPS-Zustand**: *GPS wird gesucht…*, *GPS zu schwach zum Aufzeichnen* oder *GPS bereit* mit seiner Genauigkeit (±m). **Aufnahme starten** wird erst freigegeben, wenn das GPS gut genug zum Aufzeichnen ist — eine Aufzeichnung beginnt also nie blind. Bist du nicht angemeldet, sagt dir ein Hinweis, dass die Route und ihre Fotos auf deinem Gerät warten und **Speichern** dich um die Anmeldung bittet — aufzeichnen kannst du trotzdem.

> **Admins** können starten, ohne auf das GPS zu warten (der Button sagt es) — praktisch an einem Computer, der keins hat: Jeder Fix wird behalten, egal wie genau, und eine Notiz ganz ohne Fix landet dort, wo die Karte zentriert ist.

---

### 2. Starten

Tippe **Aufnahme starten**. Die Aufzeichnung beginnt sofort: Es gibt nichts auszufüllen — seinen Namen bekommt das roadbook später, im Editor.

---

### 3. Live-Dashboard — die Aufzeichnung läuft

> ![Dashboard der Aufzeichnung](../assets/screenshots/rec03a.jpg)

Oben die Statusleiste (Uhrzeit · Akku · GPS-Genauigkeit) und vier Anzeigen:

| Element | Was du siehst |
|---------|---------------|
| **Zeit** | Dauer der Aufzeichnung (ohne Pausen) |
| **km/h** | Aktuelle Geschwindigkeit |
| **Notizen** | Anzahl der gesetzten Notizen |
| **km** | Gefahrene Strecke |

Darunter folgen die Erfassungs-Buttons (Schritt 4) und die Live-Karte (Schritt 5). **Pause** und **Beenden** liegen in einer Leiste unten, jeweils halb so breit; auf dem Handy schwebt diese Leiste direkt über der Tab-Leiste.

---

### 4. Reichere die Spur während der Fahrt an

> ![Erfassungs-Buttons](../assets/screenshots/rec04a.jpg)

Die Erfassungsreihe hat drei gleich hohe Spalten: die große **Notiz** (40 %), die Erfassungen (40 %: **Foto** über **Sprachnotiz**) und die zwei Kartenschalter (20 %: **Kartenstil** über **In Fahrtrichtung**).

| Button | Aktion | Bedienung |
|--------|--------|-----------|
| **📍 Notiz** | Setzt eine Notiz an deiner GPS-Position | Tippen: Die Notiz wird sofort gesetzt. Eine Erfolgsglocke ertönt und ein großes grünes Häkchen erscheint für weniger als eine Sekunde. Es gibt nichts zu tippen — den Text der Notiz schreibst du später im Editor |
| **📷 Foto** | Macht ein geotaggtes Foto | Öffnet die Rückkamera. Das Foto wird an deine Position gehängt und setzt dort immer auch eine Notiz |
| **🎤 Sprachnotiz** | Nimmt eine Sprachnotiz auf | **Gedrückt halten**, während du sprichst — genau dort wird eine Notiz gesetzt, und der Button wird rot und zählt die Sekunden; **loslassen** beendet sie (höchstens eine Minute). Behalten wird nur der Ton, ohne Transkription: Er wird zum Extra **Sprachnotiz** der Notiz und spielt beim Navigieren des roadbook von selbst, bevor du die Notiz erreichst (100 m vorher oder in dem Abstand, den der Autor im Editor festlegt) |
| **🗺 Kartenstil** | Wechselt die Basiskarte | Satellit ↔ topografisch |
| **➤ In Fahrtrichtung** | Kartenausrichtung | Die Karte dreht sich mit deinem Kurs (leuchtet) oder bleibt genordet |

Die untere Leiste enthält die anderen beiden:

| Button | Aktion |
|--------|--------|
| **⏸ Pause** | Unterbricht die Aufzeichnung (Stopps, Wartezeiten). Erneut tippen zum Fortsetzen |
| **🏁 Beenden** | Beendet die Aufzeichnung (Schritt 6) |

> **Tipp**: Tippe an jeder Kreuzung, Gefahr oder jedem Straßenwechsel auf **Notiz**, ohne den Blick von der Straße zu nehmen, und ergänze die Worte später im Editor. Halte **Sprachnotiz** gedrückt, wenn ein paar Worte es besser sagen — du hörst sie auf der Strecke wieder. Unterwegs gibt es kein Rückgängig: Eine versehentlich gesetzte Notiz ist im Editor in einer Sekunde gelöscht.

---

### 5. Live-Karte

> ![Live-Karte](../assets/screenshots/rec05.jpg)

- Die Spur ist eine **durchgehende Linie**
- Notizen sind **nummerierte blaue Punkte**
- Fotos haben eine **📷-Markierung**
- Oben links, groß und ohne Beschriftung: die **Distanz seit der letzten Notiz** (km, zwei Dezimalstellen; vor der ersten Notiz seit dem Start)
- Dein GPS-Marker wird ein **Richtungs-Chevron**, wenn du dich bewegst

---

### 6. Die Aufzeichnung beenden

Tippe **Beenden** (untere Leiste) und bestätige.

> ![Ende der Aufzeichnung](../assets/screenshots/rec06a.jpg)

Ein Dialog zeigt eine kurze Zusammenfassung (km · Notizen · Fotos) und stellt genau eine Frage, mit zwei Buttons:

| Button | Was passiert |
|--------|--------------|
| **💾 Speichern** | Angemeldet: Die Aufzeichnung wird als roadbook-**draft** (mit ihren Fotos und Sprachnotizen) gespeichert und der **Editor öffnet sich** sofort darauf. Abgemeldet: Du kommst zur Anmeldeseite und, sobald du angemeldet bist, kehrst du zurück und sie wird genauso gespeichert; dann öffnet sich der Editor |
| **🗑 Verwerfen** | Fragt nach einer Bestätigung und nennt, was verloren ginge (Spur, Notizen, Fotos), dann wird die Aufzeichnung verworfen |

Hier gibt es keine Export-Buttons: Exportieren (GPX, `.rdbk`, PDF…) erledigst du später im Editor.

> Der Dialog lässt sich nicht durch Tippen daneben schließen. Bis du speicherst oder verwirfst, ist die Aufzeichnung sicher — selbst wenn die App abstürzt, wird sie dir beim nächsten Besuch erneut angeboten.

---

### 7. Im Editor

Der Editor öffnet sich mit Spur, Notizen, Fotos und Sprachnotizen bereits an ihrem Platz: Gib dem roadbook einen Namen, schreib den Text der Notizen, hör dir eine Sprachnotiz im Tab **Sprachnotiz** ihrer Notiz an (und leg fest, wie viele Meter vor der Notiz sie spielt) und exportiere es, wenn du möchtest. Der draft ist gespeichert und findet sich auch unter **Meine Roadbooks**.

## Offline-Verhalten

| Was | Angemeldet + online | Angemeldet + offline | Abgemeldet |
|-----|---------------------|----------------------|------------|
| GPS-Spur | ✅ lokal + Checkpoint | ✅ lokal + Checkpoint | ✅ lokal + Checkpoint |
| Notizen und Sprachnotizen | ✅ lokal | ✅ lokal | ✅ lokal |
| Fotos | ✅ Warteschlange → Upload | ✅ lokale Warteschlange | ✅ lokale Warteschlange |
| Server-draft | live erstellt/aktualisiert | beim ersten Upload erstellt | bei **Speichern** erstellt, nach der Anmeldung |
| Wiederherstellung nach Absturz | ✅ automatisch | ✅ automatisch | ✅ automatisch |

---

## Wiederherstellung einer unterbrochenen Sitzung

Der Recorder speichert die Sitzung in Echtzeit. Wird die App geschlossen (ein Anruf, ein Absturz, der Akku), bietet sie dir beim nächsten Start an, die Aufzeichnung dort **fortzusetzen**, wo du aufgehört hast. Ablehnen **löscht sie nicht**: Die Aufzeichnung bleibt auf dem Gerät und wird erst ersetzt, wenn du eine neue startest.

---

## Nächster Schritt

Du hast die Spur aufgezeichnet? → [Editor: roadbook erstellen/bearbeiten →](03-editor.md)  
Du möchtest navigieren? → [Reader: mit GPS navigieren →](04-reader.md)
