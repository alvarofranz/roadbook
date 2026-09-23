# Reader — Ein Roadbook mit GPS navigieren

Der **Reader** ist der digitale Beifahrer: Er lädt ein Roadbook und macht daraus eine Notentabelle im Papierstil, gesteuert vom GPS. Kilometerzähler, die entlang der Route messen, automatische oder manuelle Validierung, ein Bericht am Ende der Fahrt und — im Wettbewerb einer Veranstaltung — ein signiertes Ergebnis für die Rangliste.

> Navigation und Validierung funktionieren zu 100 % offline. Eine Verbindung braucht es nur zum Anmelden, zum Laden eines Roadbooks aus dem Profil oder der öffentlichen Galerie und zum Speichern des Berichts.

---

## 1. Ein Roadbook laden

Öffne den Reader (`/reader/`). Der Startbildschirm bietet:

| Einstieg | Was passiert |
|----------|--------------|
| **.rdbk-Datei laden** | Importiert ein vollständiges Roadbook (Track + Notizen + Symbole) |
| **Aus Meine Roadbooks öffnen** | Wählt eines der in deinem Profil gespeicherten Roadbooks (angemeldet) |
| **Öffentliche Galerie** | Die öffentlichen Roadbooks, direkt darunter: tippe eines an, um es zu öffnen |

**Über einen Link**: `/reader/<slug>` öffnet ein öffentliches Roadbook, `?rb=<id>` eines deiner eigenen.

> Um ein öffentliches Roadbook zu öffnen, musst du angemeldet sein.

Ein Roadbook öffnet sich zuerst als **schreibgeschützte Vorschau**: die Notenliste, ohne GPS. Vielleicht willst du es nur ansehen. Tippe auf **Navigieren**, um zu starten.

---

## 2. Eine Fahrt starten

**Navigieren** öffnet den Startdialog:

| Option | Beschreibung |
|--------|--------------|
| **GPX-Track aufzeichnen** | Zeichnet den GPS-Track der Fahrt auf (absturzsicher) |
| **Ton bei Notiz** | Eine Glocke bei jeder validierten Notiz, eine Fanfare bei der letzten. Sie spielt über deiner Musik, statt sie anzuhalten |
| **Externe Fernbedienung** | Weiterschalten mit einem Bluetooth-Pedal oder -Klicker (siehe §4) |

Es gibt keinen Modus zu wählen: Ein Roadbook, das aus einer Veranstaltung geöffnet wird, die es **wertet**, läuft als **Wettbewerb** (deine Fahrzeugnummer wird abgefragt, Strafen gelten, das signierte Ergebnis geht in die Rangliste der Veranstaltung); alles andere läuft als **Tour**.

---

## 3. Der Navigationsbildschirm

Der Reader belegt den ganzen Bildschirm:

1. **Kilometerzähler-Leiste** oben: Titel, Gesamt (*Prog.*) über Teilstrecke (*Teil.*), Kurs, Uhrzeit, GPS-Status und Geschwindigkeit
2. **Notenliste**: eine Zeile pro Notiz, in drei Spalten — Gesamt- und Teildistanz mit der Notiznummer (und ihrem Wegpunkttyp, falls vorhanden) · die Vignette · Text, CAP, Tempolimit und Koordinaten
3. **Aktionsleiste** unten: Schalter **Auto** · **Karte zur Notiz** · **Pause** · GPX · **Fertig** · **Beenden**

Notenzustände: **erreicht** (grün) · **übersprungen** (rosa) · **aktiv** (roter Rand) · ausstehend (weiß). Beim Annähern an die aktive Notiz wird sie **blau** und zeigt die verbleibende Distanz, in km mit zwei Nachkommastellen.

Wird eine Notiz validiert, rückt die nächste **ganz nach oben** in der Liste: Die Straße vor dir bekommt den ganzen Platz.

### Distanzen entlang der Route
Die verbleibende Distanz wird **entlang der Straße** gemessen, wie die Teilstrecken des Roadbooks selbst, nicht in Luftlinie: Gefahrene Teilstrecke plus verbleibende Distanz ergibt immer die Teilstrecke der Notiz. Bei jedem Notenwechsel werden beide Kilometerzähler auf der Route neu verankert, sodass die Teilstrecke genau an der Notiz 0.00 zeigt.

---

## 4. Fortschritt: automatisch oder manuell

### Automatisch (Standard)
Die aktive Notiz wird validiert, sobald du in ihren **Validierungsradius** fährst.

- Der Radius kommt von der Notiz (`wp_radius`), dann vom Standard des Roadbooks, dann von ihrem Wegpunkttyp, sonst 30 m; er fällt nie unter 18 m, über dem GPS-Rauschen
- Geprüft wird die **gefahrene Strecke zwischen zwei GPS-Fixes**, nicht nur die Fixes: Bei Tempo bewegt sich ein Handy 25 m zwischen zwei Positionen, und ein enger Wegpunkt würde sonst dazwischen durchrutschen
- Eine Position, bei der sich das Handy nicht sicher ist (schlechte Genauigkeit), wird ignoriert: Sie kann weder eine Notiz validieren noch Distanz hinzufügen

### Manuell
Schalte **Auto** aus: Dann markiert ein Tippen **irgendwo auf die Zeile der aktiven Notiz** sie als erledigt (das Ziel ist die ganze Zeile, kein kleiner Knopf, den man in Fahrt treffen muss). Mit Auto an validiert nur das GPS.

- Im Wettbewerb verlangt eine manuelle Validierung, dass du höchstens 100 m von der Notiz entfernt bist, plus den Spielraum, den deine GPS-Genauigkeit braucht
- Ein Tippen auf eine **andere** Notiz verlegt die Fahrt dorthin und fragt vorher: Die Notizen dazwischen bleiben unvalidiert, und im Wettbewerb kostet jede übersprungene gewertete Notiz 450 Punkte
- Im Wettbewerb kannst du nicht zu einer bereits validierten Notiz zurück

### Freihändig mit einer externen Fernbedienung
Hake im Startdialog **Externe Fernbedienung** an, um weiterzuschalten, ohne den Bildschirm zu berühren.

- Ein Bluetooth-**Blätterpedal**, ein Kamera-Klicker oder ein Präsentations-Presenter koppelt sich als Tastatur: nichts einzurichten, funktioniert offline, im Browser und in der App
- **Weiter**: → · ↓ · Bild ↓ · Leertaste · Enter — **Zurück**: ← · ↑ · Bild ↑ (nur auf Tour: Im Wettbewerb lässt sich eine validierte Notiz nicht rückgängig machen)
- Die Einstellung wird auf dem Gerät gespeichert, und Tasten werden ignoriert, während du tippst oder ein Dialog offen ist

---

## 5. Karte zur Notiz

Nur wenn das Roadbook eine Karte erlaubt: **Karte zur Notiz** in der Aktionsleiste öffnet eine Minikarte unter der aktiven Notiz; tippe erneut, um sie zu schließen.

- Sie zeigt den Track, deine Live-Position und in der Ecke die Notiznummer mit der verbleibenden Distanz
- **Ein kurzer gelber Pfeil** führt dich: von deiner Position zeigt er direkt auf die Notiz
- Wird die Notiz validiert, folgt dir die Karte zur nächsten

---

## 6. Pause, fertig, beenden

| Knopf | Was er tut |
|-------|------------|
| **Pause** | Stoppt das GPS und die Bildschirmsperre-Verhinderung, um Akku zu sparen (eine Mittagspause); die Kilometerzähler laufen in der Pause nicht weiter |
| **Fertig** | Schließt die Fahrt ab und öffnet ihren Bericht. Vor der letzten Notiz fragt er vorher: Nicht erreichte Notizen zählen als übersprungen |
| **Beenden** (das Ausgangssymbol) | Verlässt die Fahrt ohne Bericht, nach einer Bestätigung |

---

## 7. Der Fahrtbericht

Jede Fahrt endet mit ihrem **Bericht**: erreichte und übersprungene Notizen, Tempolimit-Zonen, Zeit und Distanz. Oben steht deine Fahrtkarte, darunter **Teilen** und ein einziger Schalter, um die Fahrt **Privat** zu halten oder **Öffentlich** zu machen (sichtbar auf deinem Profil `/u/<username>`). Teilen, bevor du gewählt hast, fragt vorher, denn Teilen macht die Fahrt öffentlich.

Der Bericht wird zuerst auf dem Gerät gespeichert und hochgeladen, sobald eine Verbindung besteht.

### Im Wettbewerb — das signierte Ergebnis
Eine Wettbewerbsfahrt erzeugt zusätzlich ein **HMAC-signiertes Ergebnis** (einen QR-Code zum Teilen oder Herunterladen) und geht in die gemeinsame Rangliste der Veranstaltung ein, wo die Organisatoren es prüfen.

---

## 8. Eine unterbrochene Sitzung wiederherstellen

Die Fahrt sichert sich selbst auf dem Gerät. Wird sie unterbrochen (ein Anruf, ein Absturz, das Handy schließt die App), fragt der Reader beim nächsten Besuch **Laufende Fahrt fortsetzen?** und macht genau dort weiter, wo du warst. Ein laufender GPX-Mitschnitt wird genauso wiederhergestellt.

> Ablehnen löscht nichts, und die Frage kommt für diese Fahrt nicht wieder. Sie wird nie gestellt, wenn der Link ein anderes Roadbook nennt.

---

## 9. Nächster Schritt

Fertig mit dem Navigieren? → [Tripmaster: GPS-Bordcomputer →](05-tripmaster.md)
Willst du ein Roadbook erstellen? → [Editor: erstellen/bearbeiten →](03-editor.md)
