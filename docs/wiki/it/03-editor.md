# Editor — Creare e modificare un roadbook

L'**Editor** è l'hub di creazione: qui trasformi una traccia grezza (o un foglio bianco) in un roadbook completo con note, CAP, danger, tipi strada, icone, vignette tulip.

> **Funziona offline** per editing puro. Serve connessione per: login, caricare/salvare sul profilo, upload foto/audio, importare challenge pubbliche, export PDF/GPX (usa librerie lazy-loaded).

---

## Avvio — Scegli la sorgente

Apri **Editor** (`/editor/`). La landing (`#loadFrom`) offre 4 carte + 2 sorgenti nascoste:

> 📸 *Screenshot: schermata iniziale Editor con le 4 carte di sorgente (GPX, Disegna sulla mappa, .rdbk, Roadbook pubblico)*

| Sorgente | Come fare | Cosa ottieni |
|----------|-----------|--------------|
| **GPX** | Tap "GPX" → scegli file `.gpx` (opzionale `.wpt`) | `RB.parseGPX` → `buildRoadbook` → roadbook con traccia + waypoint |
| **Disegna sulla mappa** | Tap "Disegna sulla mappa" | Mappa in modalità **Disegna**: tocca la mappa per aggiungere il percorso punto per punto — i primi due tap creano il roadbook da zero |
| **.rdbk** | Tap ".rdbk" → scegli file ZIP/JSON | Importa roadbook completo (media in `pendingMedia`, vedi sotto) |
| **Roadbook pubblico** | Tap "Roadbook pubblico" → picker challenge | **Fork** di un roadbook `public` + `reusable` → nuovo roadbook privato tuo |

**Sorgenti automatiche** (all'avvio, priorità):
1. `?trip=1` → traccia/waypoint/foto da Recorder/Tripmaster via `sessionStorage`
2. Draft non salvato in `localStorage` (`rb_editor_draft`) → conferma recupero
3. `?rb=<id>` → carica tuo roadbook salvato (richiede login)

> Importare (GPX, .rdbk, pubblico) **azzera l'identità** (`resetIdentity`): `currentRbId=0`, status=`draft`, `reusable=false`. Così non sovrascrivi l'originale per errore.

---

## Vista Map — La barra strumenti

La mappa è il cuore. Ci sono due barre:

- **In alto a sinistra**: ☰ (menu) · Undo · Redo
- **In basso a sinistra**: la **barra delle modalità** verticale (sul telefono corre in orizzontale lungo il bordo inferiore). Ogni pulsante mostra icona e tasto; la modalità attiva è evidenziata e mostra anche il nome

> 📸 *Screenshot: mappa Editor con la barra in alto a sinistra, la barra modalità in basso a sinistra e traccia caricata*

### Modalità (esclusive, barra in basso a sinistra)

| Modalità | Tasto | Cosa fa |
|------|-------|---------|
| **Sposta** (default) | `M` | Trascina **qualsiasi punto**: punto traccia, nota o foto. La linea segue. Metriche ricalcolate al rilascio |
| **Aggiungi note** | `N` | Tap sulla rotta → mette una nota lì. La modalità resta attiva, così puoi metterne diverse di fila |
| **Aggiungi punti** | `P` | Tap sulla rotta esistente → inserisce un punto in quel tratto. Serve una rotta |
| **Disegna** | `D` | Ogni tap aggiunge un punto **nuovo** ed estende la rotta dall'estremità aperta più vicina (partenza, arrivo o bordo di un taglio aperto); toccare il bordo opposto di un taglio lo chiude. Senza nulla caricato, i primi due tap creano il roadbook |
| **Taglia** | `C` | Menu ☰ → Taglia (compare nella barra modalità solo mentre è attivo). Tap 2 punti → taglia (lascia buco = *gap*) |

Toccare di nuovo la modalità attiva torna a **Sposta**; anche `Esc`. Trascinare sposta sempre la mappa, in ogni modalità.

### Menu ☰

| Tool | Funzione |
|------|----------|
| **Taglia** | Attiva la modalità Taglia (tasto `C`, vedi sopra) |
| **Add GPX** | Join intelligente: se entrambe le estremità toccano la rotta (≤200m) → sostituisce tratto interno; altrimenti unisce all'estremità più vicina (auto-orienta) |
| **Simplify** | Douglas-Peucker (tolleranza 0,5–50m, default 2m). **Ricalcola metriche da zero** → totale può solo diminuire. Note restano sui loro vertici (anchore preservati) |
| **Adjust** | Re-record live di un tratto (gps-meter condiviso). Sostituisce il segmento tra `adjP1` e `adjP2` e ri-aggancia le note |
| **Scorciatoie** | Elenca tutte le scorciatoie da tastiera |

**Undo / Redo** (barra in alto a sinistra): Snapshot debounced 400ms, max 30. Ctrl/Cmd+Z / Ctrl+Y (Shift+Z)

> **Reverse** (inversione percorso) sta in **Settings** (vista Config), non qui.

### Menu del tasto destro (pressione lunga su touch)

Una card scura nello stile dell'app. In alto dice cosa è stato colpito — una nota (con il suo numero), un punto traccia o "questo punto" — e le sue coordinate, con un pulsante per copiarle in un clic. Sotto, i comandi in gruppi (modifica · foto · apri in Google Maps / Google Earth), ognuno con il suo tasto. Le frecce scorrono i comandi; `Esc` o un clic fuori lo chiude.

### Scorciatoie da tastiera

| Tasto | Azione |
|-------|--------|
| `M` · `N` · `P` · `D` · `C` | Modalità: Sposta · Aggiungi note · Aggiungi punti · Disegna · Taglia |
| `Esc` | Torna a Sposta |
| Ctrl/Cmd+Z · Ctrl+Y (Shift+Z) | Undo · Redo |

Le stesse lettere valgono nel menu del tasto destro e su un punto traccia selezionato:

| Tasto | Azione |
|-------|--------|
| `N` | Trasforma in / aggiungi una nota |
| `P` | Aggiungi un punto traccia |
| `I` | Punto intermedio |
| `T` | Trasforma una nota in punto traccia |
| `Del` | Elimina |

---

## Gestione tagli aperti (*gaps*)

Un taglio interno lascia un **buco reale** (non un segmento). Memorizzato come coppia di **punti** `{a,b}` (non indici) → sopravvive a shift di indice.

- **Riempi**: tocca con Disegna da un bordo del taglio (toccare il bordo opposto chiude il gap)
- **Chiudi dritto**: all'export/save → `confirmOpenCuts` chiede conferma → chiude come linea retta
- `resolveGaps()` li risolve in indici on demand

---

## Lista note + Editor inline

Colonna destra: righe `.note-mini`. Tap riga → **editor inline si sposta** sotto quella riga (unico `#noteEditZone` fisicamente spostato). Canvas vignette (`#canvasWrap`) si sposta DENTRO la cella tulip.

> 📸 *Screenshot: pannello note con editor inline aperto su una nota*

### Campi per nota

| Campo | Come si edita | Note |
|-------|---------------|------|
| **Testo** | `textarea` in place (mantiene focus) | Aggiorna modello senza rebuild |
| **Road type** | Select "Road" → imposta `road_type` | Solo la strada che **lasci** è autoriale; l'arrivo (`road_type_in`) deriva dal `road_type` della nota precedente |
| **Danger** | Select `—` / `!` / `!!` / `!!!` → `n.danger` | 0 = rimuove |
| **CAP** | Toggle riga → calcola `bearingDeg` + `haversineM` verso nota successiva | Ultima nota: niente CAP |
| **Icone / Vignette** | `NoteCanvas` su `#noteCanvas` | Palette standard + custom embeddate (vedi § sotto) |

### Drag sulla mappa (tool Sposta)
Nota si trascina dal marker blu → sposta **vertice traccia** sotto → linea la segue. Nota mobile come un punto traccia.

### Riordino / Cancellazione
Frecce ↑/↓ (cambia `sel` ±1), `Del` → `delNote` (minimo 2 note). **Non ricentra mappa** (fix #65).

---

## Palette icone

`renderIcons` fonde:
- **Standard** (`assets/icons/index.json` → `loadStd`)
- **Custom** embeddate nel roadbook (`rb.symbols`)

> 📸 *Screenshot: palette icone con categorie e ricerca live*

Chip categorie + ricerca live (`filterIcons`). Tap o **drag&drop** su vignette per aggiungere. Custom: upload (`#iconFile`) o incolla → data-URI. Se l'icona sta su uno sfondo uniforme (es. la foto di un foglio bianco), l'Editor chiede **"Rimuovere lo sfondo?"** (No / Sì), mostrando originale e risultato affiancati — gira tutto nel browser, e la libreria icone del roadbook tiene solo la versione scelta. Badge × per cancellare (bloccato se in uso).

> All'import di un file Roadbook Suite (il suo JSON, letto da `RB.readRoadbook`): icone rinominate 1:1 (tabella in `editor.md` §9.5), flip Y + ricentrate + ×1.5 (×3 partenza/arrivo). Le icone che non si risolvono sono nominate in un messaggio (la vignetta mostra un segnaposto), così sai cosa ri-aggiungere.

---

## Vista Config — Dettagli roadbook

Seconda vista (`showView('config')`), tab `#viewConfig`:

> 📸 *Screenshot: vista Config con campi titolo, descrizione, stato, profilo waypoint*

| Sezione | Campi |
|---------|-------|
| **Titolo / Descrizione / Autore / Organizzazione** | `oninput` → `markDirty`, `stampMeta` timbra `modified` (YYYY-MM-DD) ad ogni save/export |
| **Logo evento** | `RBImg.toDataURL(f, 256)` → data-URI in `meta.logo` (auto-contenuto) |
| **Stato** | `setStatus()`: **draft · ready · public** (non più binario). Solo `public` pubblica in galleria |
| **Riutilizzabile** | `cfgReusable` → `reusable` (solo se `public`) — permette fork da altri (#106) |
| **Tipo di roadbook** | `cfgProfile`: `basic` o `rally` (vocabolario FIA completo). Non è nel file: un roadbook che usa un tipo di waypoint rally si apre come rally |
| **Raggio validazione default** | `cfgWpRadius` → `meta.default_validation_radius` (m) per note senza `validation_radius` proprio |
| **Accesso mappa nel Reader** | `cfgMapAccess` → `meta.map_allowed` (false = nasconde mappa, es. gare) |
| **Foto** | Galleria su mappa + upload geolocalizzato + lightbox (vedi sotto) |
| **Cancella roadbook** | Solo se `currentRbId > 0` (salvato). `RBConfirmDanger` nomina il titolo → `rb_delete` (cestino 30gg) |

---

## Foto: galleria su mappa, upload geolocalizzato, lightbox

**Richiede roadbook salvato** (`currentRbId > 0` / `draftId`) + login.

> 📸 *Screenshot: galleria foto su mappa con pin e lightbox aperto*

### Upload (tutti convergono su `addPhotos`)

1. **EXIF GPS** → `RBImg.gps(file)` legge GPS dai primi 256 KB JPEG. Se presente → upload immediato con quelle coord
2. **A mano su mappa** → se EXIF manca (PNG/HEIC/senza GPS): foto in coda → `promptPlacePhoto` → tap su mappa (cursore mirino, un tap per foto in coda)
3. **Copia-incolla** (Ctrl/Cmd+V) → listener `paste` → stesso flusso EXIF/pin

### Lightbox
Tap pin / miniatura → visore a pieno schermo (copre solo mappa, **non** pannello note → continui a editare). Frecce ‹/›, `←`/`→`, `Esc`. Azioni:
- **Waypoint** → crea waypoint sulla posizione foto
- **Sposta sulla mappa** → modalità *posiziona* → prossimo tap aggiorna coord via `ph_move`
- **Delete** → `ph_delete` (con conferma) + aggiorna lightbox + pin

---

## Note vocali — player

Le note vocali già registrate sono salvate server-side (`roadbook_audio`, `audio_list`/`audio_delete`). Ognuna compare come **player audio** sulla riga nota più vicina (≤80m), con una **×** per eliminarla (la conferma nomina la nota).

---

## Export & Save to profile

Pulsante **Export** → pop-up con tutti i formati. **Save** (salvataggio profilo) separato. Ogni export chiude pop-up, conferma **una volta** tagli aperti, ricalcola metriche.

> 📸 *Screenshot: pop-up Export con formati disponibili (.rdbk, PDF, GPX, OpenRally, KMZ)*

| Formato | Funzione | Output |
|---------|----------|--------|
| **.rdbk** | `exportRdbk(includeMedia)` | ZIP: `roadbook.json` auto-contenuto scritto da `RB.writeRoadbook` e verificato da `RB.validateRoadbook` (`embedUsed` embedda i simboli usati, pota gli standard inutilizzati) + opzionale `photos/`/`audio/`/`media.json` |
| **PDF** | `exportPdf` | A4 via `RBPdf.generate` (jsPDF lazy, `rb-pdf.js`) |
| **GPX** | `exportCustomGpx` | Checkbox componibili (Traccia / Waypoint / Garmin icons / OSMAnd icons / OpenRally file separato) |
| **OpenRally** | `exportOpenRally` | `RB.openRallyDocument` → `…_OR.gpx` (GPX 1.1 + namespace `openrally:`) |
| **KMZ** | `exportKmz` | `RB.kmlDocument` + `RBZip.write({ 'doc.kml': kml })` → `.kmz` |

### embedUsed (regola auto-contenuta)
Ogni simbolo usato finisce in `rb.symbols` come data-URI; gli standard non referenziati → rimossi, i custom restano. Garantisce portabilità.

### Opzioni GPX (issue #34)
Checkbox: **Traccia** (obbligatoria per Garmin/OSMAnd), **Waypoint**, **Garmin icons**, **OSMAnd icons**, **OpenRally**. Garmin + OSMAnd convivono in un file. Naming: `slug_data_WPT_grm_osm_OR.gpx`.

### Save to profile
`doSave` → timbra meta, ricalcola, embedda i simboli, scrive e valida il documento → `RBApi('rb_save')`. Successo: registra `currentRbId`, azzera `dirty`, pulisce draft, fissa `?rb=<id>` in URL (reload continua a editare stesso). **"Save as"** → azzera identità, aggiunge "(copy)", salva nuova entità privata.

---

## Co-editing, lock, chiusura (#123 · #154 · #166)

| Aspetto | Regola |
|---------|--------|
| **Proprietà** | `setOwnership(isOwner, owner)`: co-editor vede nota *Solo il proprietario può cambiare la visibilità*; save co-editor **mantiene stato pubblicazione proprietario** |
| **Soft lock** | `setLock(lock)`: se `lock.mine===false` → Editor read-only + `lockBanner` (@utente sta modificando). Chi tiene lock rinnova 4 min (`rb_lock_refresh`), rilascia in chiusura (`sendBeacon` → `rb_lock_release`). Forzabile (`rb_lock_force`) |
| **Chiudi** | `leaveEditor` (pulsante `#closeEditor`): modifiche non salvate → *Salva e chiudi · Chiudi senza salvare · Annulla* → torna a **landing Editor** (lista roadbook), non home; pulisce `?rb=`/`/<slug>` |

---

## Avvio, draft, recovery

- `markDirty()` → checkpoint debounced 2s in `localStorage` (`rb_editor_draft`)
- `beforeunload` + `visibilitychange` flushano draft prima di chiusura/kill
- **Startup precedence**: `config` → `?trip=1` (Recorder/Tripmaster) → `localStorage` draft (conferma `RBConfirm`, rifiuto **non** cancella) → `?export=1` (apre pop-up export subito) → `?rb=<id>` (carica salvato) → posizione default mappa da profilo (`default_lat/lon`)

---

## Import .rdbk Roadbook Suite — fedeltà per Ranking

`RB.readRoadbook` legge un `.rdbk` (validato; distanze, bearing e tipi strada in arrivo derivano dalla traccia) e converte un file Roadbook Suite: chiavi italiane → campi `.rdbk`, `bivio[]→junctions[]` (flip Y), simboli flip Y + ricentrati + ×1.5, cartelli di limite → `speed_limit_kmh`.

**Campi Ranking preservati in import:**
- `lat/lon` (accuracy/extra) ✅
- `cap/cap_distance` (penalità CAP) ✅ — `recomputeCaps` ricalcola solo dove `cap!=null`
- `distance/partial_distance` (km, reach) ✅
- `waypoint_type` `ss_start`/`ss_end` o simboli I02_partenza / I01_arrivo (sezione punteggio) ✅
- `speed_limit_kmh` (limiti velocità) ✅

In **export/save**: `recomputeMetrics` deriva lat/lon, distance e bearing dal `track_index` di ogni nota, `recomputeCaps` riallinea CAP attivi. Coerente per punteggio.

---

## Limiti & quirk

- `RB.blankNote` non porta valori derivati → numerazione dopo `recomputeMetrics` (le righe lo chiamano subito)
- Autore default può sovrascrivere campo vuoto al login (dipende ordine promise `account`)
- `spliceByIndex` ri-aggancia tutte le note con `nearestIdx` → può spostare nota in modo non intuitivo se variante passa vicino a nota "vecchia"
- Tagli aperti → chiusi in linea retta (preceduto da `confirmOpenCuts`)
- Foto richiedono roadbook **già salvato** (`currentRbId > 0` / `draftId`)

---

## Prossimo passo

Hai il roadbook pronto? → [Reader: naviga →](reader.md)  
Vuoi un computer di bordo GPS? → [Tripmaster →](05-tripmaster.md)