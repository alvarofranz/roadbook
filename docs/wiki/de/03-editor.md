# Editor — Ein Roadbook erstellen und bearbeiten

Der **Editor** ist die Erstellungs-Zentrale: hier verwandelst du eine rohe Spur (oder ein leeres Blatt) in ein vollständiges roadbook mit Notizen, CAP, danger, Straßentypen, Icons und Tulpen-Vignetten.

> **Funktioniert offline** für die reine Bearbeitung. Eine Verbindung wird benötigt für: Login, Laden/Speichern im Profil, Upload von Foto/Audio, Import öffentlicher challenge, Export PDF/GPX (nutzt lazy-geladene Bibliotheken).

---

## Start — Wähle die Quelle

Öffne den **Editor** (`/editor/`). Die Landing-Seite (`#loadFrom`) bietet 4 Karten + 2 versteckte Quellen:

> 📸 *Screenshot: Editor-Startbildschirm mit den 4 Quell-Karten (GPX, Auf der Karte zeichnen, .rdbk, Roadbook pubblico)*

| Quelle | Vorgehen | Ergebnis |
|----------|-----------|--------------|
| **GPX** | Tap „GPX" → `.gpx`-Datei wählen (optional `.wpt`) | `RB.parseGPX` → `buildRoadbook` → roadbook mit Spur + Waypoint |
| **Auf der Karte zeichnen** | Tap „Auf der Karte zeichnen" | Karte im **Zeichnen**-Modus: auf die Karte tippen, um die Route Punkt für Punkt anzulegen — die ersten zwei Taps erstellen das roadbook von Null |
| **.rdbk** | Tap „.rdbk" → ZIP/JSON-Datei wählen | Importiert vollständiges roadbook (Medien in `pendingMedia`, siehe unten) |
| **Roadbook pubblico** | Tap „Roadbook pubblico" → challenge-Picker | **Fork** eines `public` + `reusable` roadbook → neues privates roadbook von dir |

**Automatische Quellen** (beim Start, Priorität):
1. `?trip=1` → Spur/Waypoint/Foto von Recorder/Tripmaster via `sessionStorage`
2. Nicht gespeicherter draft in `localStorage` (`rb_editor_draft`) → Wiederherstellung bestätigen
3. `?rb=<id>` → lädt dein gespeichertes roadbook (erfordert Login)

> Importieren (GPX, .rdbk, öffentlich) **setzt die Identität zurück** (`resetIdentity`): `currentRbId=0`, status=`draft`, `reusable=false`. So überschreibst du das Original nicht versehentlich.

---

## Map-Ansicht — die Werkzeugleiste

Die Karte ist das Herzstück. Darauf liegen zwei Leisten:

- **Oben links**: ☰ (Menü) · Undo · Redo
- **Unten links**: die vertikale **Modusleiste** (auf dem Handy verläuft sie waagerecht am unteren Rand). Jeder Button zeigt sein Icon und seine Taste; der aktive Modus ist hervorgehoben und zeigt zusätzlich seinen Namen

> 📸 *Screenshot: Editor-Karte mit der Leiste oben links, der Modusleiste unten links und geladener Spur*

### Modi (exklusiv, Leiste unten links)

| Modus | Taste | Funktion |
|------|-------|---------|
| **Verschieben** (Standard) | `M` | Zieht **jeden beliebigen Punkt**: Spurpunkt, Note oder Foto. Die Linie folgt. Metriken werden beim Loslassen neu berechnet |
| **Notizen hinzufügen** | `N` | Tap auf die Route → setzt dort eine Note. Der Modus bleibt aktiv, so kannst du mehrere nacheinander setzen |
| **Punkte hinzufügen** | `P` | Tap auf die bestehende Route → fügt einen Punkt in diesen Abschnitt ein. Braucht eine Route |
| **Zeichnen** | `D` | Jeder Tap fügt einen **neuen** Punkt hinzu und verlängert die Route ab ihrem nächstgelegenen offenen Ende (Start, Ziel oder Rand eines offenen Schnitts); ein Tap auf den gegenüberliegenden Rand eines Schnitts schließt ihn. Ist nichts geladen, erstellen die ersten zwei Taps das roadbook |
| **Schneiden** | `C` | Menü ☰ → Schneiden (erscheint nur während er aktiv ist in der Modusleiste). 2 Punkte tippen → schneiden (lässt Lücke = *gap*) |

Erneutes Tippen auf den aktiven Modus kehrt zu **Verschieben** zurück; ebenso `Esc`. Ziehen verschiebt immer die Karte, in jedem Modus.

### Menü ☰

| Tool | Funktion |
|------|----------|
| **Schneiden** | Aktiviert den Schneiden-Modus (Taste `C`, siehe oben) |
| **Add GPX** | Intelligentes Verbinden: wenn beide Enden die Route berühren (≤200m) → ersetzt das innere Stück; sonst wird an das nächste Ende angehängt (auto-orientiert) |
| **Simplify** | Douglas-Peucker (Toleranz 0,5–50m, Standard 2m). **Berechnet Metriken komplett neu** → Gesamt kann nur sinken. Notizen bleiben auf ihren Eckpunkten (Anker erhalten) |
| **Adjust** | Live-Neuaufnahme eines Abschnitts (geteilter gps-meter). Ersetzt das Segment zwischen `adjP1` und `adjP2` und hängt Notizen neu an |
| **Tastenkürzel** | Listet alle Tastenkürzel auf |

**Undo / Redo** (Leiste oben links): Debounced-Snapshot 400ms, max 30. Ctrl/Cmd+Z / Ctrl+Y (Shift+Z)

> **Reverse** (Routenumkehr) liegt in **Settings** (Config-Ansicht), nicht hier.

### Rechtsklick-Menü (langes Drücken auf Touch)

Eine dunkle Karte im Stil der App. Oben steht, was getroffen wurde — eine Note (mit ihrer Nummer), ein Spurpunkt oder „diese Stelle" — samt Koordinaten und einem Button, der sie mit einem Klick kopiert. Darunter die Befehle in Gruppen (Bearbeiten · Fotos · in Google Maps / Google Earth öffnen), jeder mit seiner Taste. Die Pfeiltasten bewegen sich durch die Befehle; `Esc` oder ein Klick daneben schließt es.

### Tastenkürzel

| Taste | Aktion |
|-------|--------|
| `M` · `N` · `P` · `D` · `C` | Modus: Verschieben · Notizen hinzufügen · Punkte hinzufügen · Zeichnen · Schneiden |
| `Esc` | Zurück zu Verschieben |
| Ctrl/Cmd+Z · Ctrl+Y (Shift+Z) | Undo · Redo |

Dieselben Buchstaben gelten im Rechtsklick-Menü und auf einem ausgewählten Spurpunkt:

| Taste | Aktion |
|-------|--------|
| `N` | In eine Note umwandeln / Note hinzufügen |
| `P` | Spurpunkt hinzufügen |
| `I` | Zwischenpunkt |
| `T` | Note in einen Spurpunkt umwandeln |
| `Del` | Löschen |

---

## Verwaltung offener Schnitte (*gaps*)

Ein innerer Schnitt hinterlässt eine **echte Lücke** (kein Segment). Gespeichert als Paar von **Punkten** `{a,b}` (nicht Indizes) → übersteht Index-Verschiebungen.

- **Füllen**: mit Zeichnen von einem Rand des Schnitts aus tippen (ein Tap auf den gegenüberliegenden Rand schließt den gap)
- **Gerade schließen**: beim Export/Save → `confirmOpenCuts` fragt nach → schließt als gerade Linie
- `resolveGaps()` löst sie bei Bedarf in Indizes auf

---

## Notizenliste + Inline-Editor

Rechte Spalte: Zeilen `.note-mini`. Tap auf Zeile → **Inline-Editor verschiebt sich** unter diese Zeile (einziges physisch verschobenes `#noteEditZone`). Vignetten-Canvas (`#canvasWrap`) verschiebt sich IN die Tulpen-Zelle.

> 📸 *Screenshot: Notiz-Panel mit geöffnetem Inline-Editor auf einer Note*

### Felder pro Note

| Feld | Bearbeitung | Hinweis |
|-------|---------------|------|
| **Testo** | `textarea` direkt (behält Fokus) | Aktualisiert Modell ohne Rebuild |
| **Road type** | Select „Road" → setzt `road_type_out` | Nur die Straße, die du **verlässt**, ist zulässig; Ankunft leitet sich aus `road_out` der vorigen Note ab |
| **Danger** | Select `—` / `!` / `!!` / `!!!` → `n.danger` | 0 = entfernt |
| **CAP** | Zeilen-Toggle → berechnet `bearingDeg` + `haversineM` zur nächsten Note | Letzte Note: kein CAP |
| **Icone / Vignette** | `NoteCanvas` auf `#noteCanvas` | Standard-Palette + eingebettete Custom-Icons (siehe § unten) |

### Ziehen auf der Karte (Tool Verschieben)
Note wird vom blauen Marker gezogen → verschiebt den **Spur-Eckpunkt** darunter → Linie folgt. Note bewegt sich wie ein Spur-Punkt.

### Umordnen / Löschen
Pfeile ↑/↓ (ändert `sel` ±1), `Del` → `delNote` (Minimum 2 Notizen). **Zentriert Karte nicht neu** (Fix #65).

---

## Icon-Palette

`renderIcons` verschmilzt:
- **Standard** (`assets/icons/index.json` → `loadStd`)
- **Custom** eingebettet im roadbook (`rb.icons`)

> 📸 *Screenshot: Icon-Palette mit Kategorien und Live-Suche*

Kategorie-Chips + Live-Suche (`filterIcons`). Tap oder **Drag&Drop** auf Vignette zum Hinzufügen. Custom: hochladen (`#iconFile`) oder einfügen → data-URI. Liegt das Icon auf einem einfarbigen Hintergrund (z. B. Foto eines weißen Blatts), fragt der Editor **„Hintergrund entfernen?"** (Nein / Ja) und zeigt Original und Ergebnis nebeneinander — das läuft komplett im Browser, und die Icon-Bibliothek des roadbook behält nur die gewählte Version. ×-Badge zum Löschen (gesperrt, wenn in Verwendung).

> Beim Import .rdbk Roadbook Suite: Icons 1:1 umbenannt (Tabelle in `editor.md` §9.5), Y-Flip + zentriert + ×1,5 (×3 Start/Ziel). Icons ohne Datei → Fallback `W28_general_danger.svg` + Hinweis im Text *„Nota: aggiungere icona <nome>"* (Hinweis: Icon <Name> hinzufügen).

---

## Config-Ansicht — Roadbook-Details

Zweite Ansicht (`showView('config')`), Tab `#viewConfig`:

> 📸 *Screenshot: Config-Ansicht mit Feldern Titel, Beschreibung, Status, Waypoint-Profil*

| Bereich | Felder |
|---------|-------|
| **Titolo / Descrizione / Autore / Organizzazione** | `oninput` → `markDirty`, `stampMeta` stempelt `modified` (YYYY-MM-DD) bei jedem Save/Export |
| **Logo evento** | `RBImg.toDataURL(f, 256)` → data-URI in `meta.logo` (selbst-enthalten) |
| **Stato** | `setStatus()`: **draft · ready · public** (nicht mehr binär). Nur `public` veröffentlicht in Galerie |
| **Riutilizzabile** | `cfgReusable` → `reusable` (nur wenn `public`) — erlaubt Fork durch andere (#106) |
| **Profilo waypoint** | `cfgProfile` → `meta.profile`: `basic` (Standard) oder `rally` (vollständiges FIA-Vokabular) |
| **Raggio validazione default** | `cfgWpRadius` → `meta.default_wp_radius` (m) für Notizen ohne eigenes `wp_radius` |
| **Accesso mappa nel Reader** | `cfgMapAccess` → `meta.map_access` (false = Karte verstecken, z. B. bei Rennen) |
| **Foto** | Galerie auf Karte + geolokalisierter Upload + Lightbox (siehe unten) |
| **Cancella roadbook** | Nur wenn `currentRbId > 0` (gespeichert). `RBConfirmDanger` nennt den Titel → `rb_delete` (Papierkorb 30 Tage) |

---

## Foto: Galerie auf Karte, geolokalisierter Upload, Lightbox

**Erfordert gespeichertes roadbook** (`currentRbId > 0` / `draftId`) + Login.

> 📸 *Screenshot: Foto-Galerie auf Karte mit Pin und geöffneter Lightbox*

### Upload (alle laufen auf `addPhotos` hinaus)

1. **EXIF GPS** → `RBImg.gps(file)` liest GPS aus den ersten 256 KB JPEG. Wenn vorhanden → sofortiger Upload mit diesen Koordinaten
2. **Manuell auf Karte** → wenn EXIF fehlt (PNG/HEIC/ohne GPS): Foto in Warteschlange → `promptPlacePhoto` → Tap auf Karte (Fadenkreuz-Cursor, ein Tap pro wartendem Foto)
3. **Kopieren-Einfügen** (Ctrl/Cmd+V) → `paste`-Listener → derselbe EXIF/Pin-Ablauf

### Lightbox
Tap auf Pin / Miniatur → Vollbild-Betrachter (deckt nur die Karte ab, **nicht** das Notiz-Panel → du bearbeitest weiter). Pfeile ‹/›, `←`/`→`, `Esc`. Aktionen:
- **Waypoint** → erstellt Waypoint auf der Foto-Position
- **Auf Karte verschieben** → *posiziona*-Modus → nächster Tap aktualisiert Koordinaten via `ph_move`
- **Delete** → `ph_delete` (mit Bestätigung) + Lightbox + Pin aktualisieren

---

## Sprachnotizen — Player

Bereits aufgenommene Sprachnotizen werden server-seitig gespeichert (`roadbook_audio`, `audio_list`/`audio_delete`). Jede erscheint als **Audio-Player** auf der nächstgelegenen Notizzeile (≤80m), mit einem **×** zum Löschen (die Bestätigung nennt die Note).

---

## Export & Save to profile

Button **Export** → Pop-up mit allen Formaten. **Save** (Profil-Speichern) separat. Jeder Export schließt das Pop-up, bestätigt offene Schnitte **einmal**, berechnet Metriken neu.

> 📸 *Screenshot: Export-Pop-up mit verfügbaren Formaten (.rdbk, PDF, GPX, OpenRally, KMZ)*

| Format | Funktion | Output |
|---------|----------|--------|
| **.rdbk** | `exportRdbk(includeMedia)` | ZIP: selbst-enthaltenes `roadbook.json` (`embedUsed` bettet genutzte Icons ein, entfernt ungenutzte) + optionales `photos/`/`audio/`/`media.json` |
| **PDF** | `exportPdf` | A4 via `RBPdf.generate` (lazy jsPDF, `rb-pdf.js`) |
| **GPX** | `exportCustomGpx` | Kombinierbare Checkboxen (Spur / Waypoint / Garmin-Icons / OSMAnd-Icons / separate OpenRally-Datei) |
| **OpenRally** | `exportOpenRally` | `RB.openRallyDocument` → `…_OR.gpx` (GPX 1.1 + Namespace `openrally:`) |
| **KMZ** | `exportKmz` | `RB.kmlDocument` + `RBZip.write({ 'doc.kml': kml })` → `.kmz` |

### embedUsed (selbst-enthaltene Regel)
Jedes genutzte Symbol landet als data-URI in `rb.icons`; nicht referenzierte → entfernt. Garantiert Portabilität.

### GPX-Optionen (Issue #34)
Checkboxen: **Spur** (Pflicht für Garmin/OSMAnd), **Waypoint**, **Garmin-Icons**, **OSMAnd-Icons**, **OpenRally**. Garmin + OSMAnd koexistieren in einer Datei. Namensgebung: `slug_data_WPT_grm_osm_OR.gpx`.

### Save to profile
`doSave` → stempelt Meta, berechnet neu, bettet Icons ein → `RBApi('rb_save')`. Erfolg: setzt `currentRbId`, leert `dirty`, räumt draft auf, setzt `?rb=<id>` in der URL (Reload bearbeitet dasselbe weiter). **„Save as"** → setzt Identität zurück, fügt „(copy)" hinzu, speichert neue private Entität.

---

## Co-Editing, Lock, Schließen (#123 · #154 · #166)

| Aspekt | Regel |
|---------|--------|
| **Proprietà** | `setOwnership(isOwner, owner)`: Co-Editor sieht Note *Solo il proprietario può cambiare la visibilità* (nur der Eigentümer kann die Sichtbarkeit ändern); Save des Co-Editors **behält Veröffentlichungsstatus des Eigentümers bei** |
| **Soft lock** | `setLock(lock)`: wenn `lock.mine===false` → Editor read-only + `lockBanner` (@user bearbeitet gerade). Wer den Lock hält, erneuert ihn alle 4 min (`rb_lock_refresh`), gibt ihn beim Schließen frei (`sendBeacon` → `rb_lock_release`). Erzwingbar (`rb_lock_force`) |
| **Chiudi** | `leaveEditor` (Button `#closeEditor`): nicht gespeicherte Änderungen → *Salva e chiudi · Chiudi senza salvare · Annulla* (Speichern und schließen · Ohne Speichern schließen · Abbrechen) → zurück zur **Editor-Landing** (roadbook-Liste), nicht Home; räumt `?rb=`/`/<slug>` auf |

---

## Start, draft, Recovery

- `markDirty()` → debounced Checkpoint 2s in `localStorage` (`rb_editor_draft`)
- `beforeunload` + `visibilitychange` spülen draft vor Schließen/Kill
- **Startup-Reihenfolge**: `config` → `?trip=1` (Recorder/Tripmaster) → `localStorage`-draft (Bestätigung `RBConfirm`, Ablehnung **löscht nicht**) → `?export=1` (öffnet sofort Export-Pop-up) → `?rb=<id>` (lädt Gespeichertes) → Standard-Kartenposition aus Profil (`default_lat/lon`)

---

## Import .rdbk Roadbook Suite — Treue für Ranking

`RB.importRoadbook` konvertiert: italienische Schlüssel → kanonische, `bivio[]→junctions[]` (Y-Flip), Icons Y-Flip + zentriert + ×1,5, **Metrik-Neuberechnung aus Spur** (bearing, Distanzen, Straßentypen). Für kanonisches `.rdbk`: **keine Neuberechnung beim Import** (identische Felder).

**Erhaltene Ranking-Felder beim Import:**
- `lat/lon` (accuracy/extra) ✅
- `cap/cap_distance` (CAP-Strafe) ✅ — `recomputeCaps` berechnet nur neu, wo `cap!=null`
- `distance/partial_distance` (km, reach) ✅
- `icons` I02_partenza / I01_arrivo (Punktestand-Bereich) ✅
- `icons` Sxx_* (Geschwindigkeitslimits) ✅

Bei **Export/Save**: `recomputeMetrics` hängt Notizen an Spur (lat/lon, distance, bearing), `recomputeCaps` richtet aktive CAP aus. Kohärent für Punktestand.

---

## Grenzen & Eigenheiten

- `makeNote` gibt `num: 0` aus → korrekte Nummerierung nach `recomputeMetrics` (die Zeilen rufen es sofort auf)
- Standard-Autor kann leeres Feld beim Login überschreiben (hängt von Promise-Reihenfolge `account` ab)
- `spliceByIndex` hängt alle Notizen mit `nearestIdx` neu an → kann Note unintuitiv verschieben, wenn Variante nahe an „alter" Note vorbeiführt
- Offene Schnitte → gerade geschlossen (vorausgehend `confirmOpenCuts`)
- Fotos erfordern **bereits gespeichertes** roadbook (`currentRbId > 0` / `draftId`)

---

## Nächster Schritt

Du hast das roadbook fertig? → [Reader: navigieren →](reader.md)  
Du möchtest einen GPS-Bordcomputer? → [Tripmaster →](05-tripmaster.md)
