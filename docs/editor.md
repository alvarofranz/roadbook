# L'Editor RDBK

Come funziona la sezione **Editor** di RDBK: il centro di creazione e modifica dei
roadbook. Documento di riferimento per il flusso, i tool sulla mappa e il modello di
editing delle note.

> L'Editor è una IIFE in [editor.js](../public/editor/editor.js) con la sua UI in
> [index.html](../public/editor/index.html). Tutto il lavoro pesante (geo-math, parsing,
> `buildRoadbook`, render della vignette, mappa, recording) è delegato alle primitive
> condivise `RB.*` / `NoteCanvas` / `RBMap` / `RBGpxRecorder` — vedi i rispettivi doc; qui
> documentiamo solo l'orchestrazione dell'Editor.

---

## 1. Scopo e struttura della pagina

L'Editor produce **un unico roadbook in memoria** (`rb`) con la forma del formato `.rdbk`
(`meta` · `track` · `notes` · `icons`) e lo edita finché non viene esportato o salvato.
Invariante chiave del codice: **qualunque siano i pezzi di origine, la rotta è sempre UNA
traccia continua** (commento di testa, [editor.js:7](../public/editor/editor.js#L7)).

La pagina ha due viste, commutate da `showView(v)`
([editor.js:427](../public/editor/editor.js#L427)):

| Vista        | Elemento      | Contenuto                                                        |
|--------------|---------------|-----------------------------------------------------------------|
| **map**      | `#viewMap`    | landing iniziale · mappa + barra strumenti · lista note + editor inline |
| **config**   | `#viewConfig` | dettagli roadbook (visibilità, descrizione, autore, org, logo, accesso mappa) + galleria foto |

Lo stato globale del modulo vive in poche variabili
([editor.js:29](../public/editor/editor.js#L29)): `rb` (il roadbook), `sel` (indice nota
selezionata), `dirty`/`exported` (per il pulsante Save e il prompt di uscita), `editorOpen`
(editor nota aperto inline), più `gaps` (i tagli aperti, §3) e
`currentRbId`/`isPublic` (identità lato profilo, §6).

---

## 2. Le sorgenti di creazione

La landing (`#loadFrom`) offre quattro carte; le altre due sorgenti (record/trip) arrivano
dal flusso di startup (§7). Tutte passano per `setRoadbook(r)`
([editor.js:336](../public/editor/editor.js#L336)), che normalizza con `RB.importRoadbook`,
pre-carica via XHR sincrono ogni icona embedded come data-URI (così le vignette renderizzano
subito), mostra la superficie di editing e fa il primo render.

| Sorgente            | Handler                                                                | Cosa fa |
|---------------------|------------------------------------------------------------------------|---------|
| **GPX** (`+ .wpt`)  | `$('gpxFile').onchange` ([editor.js:314](../public/editor/editor.js#L314)) | `RB.parseGPX` (+ `RB.parseWPT` se manca) → `RB.buildRoadbook` |
| **Draw on the map** | `$('drawRoute').onclick` ([editor.js:308](../public/editor/editor.js#L308)) | apre la mappa in modalità `draw`; i primi due tap creano il roadbook |
| **.rdbk**           | `$('jsonFile').onchange` ([editor.js:325](../public/editor/editor.js#L325)) | `JSON.parse`, valida `track`+`notes`, `setRoadbook` — dettaglio e fedeltà per il Ranking in **§9** |
| **Challenge**       | `$('pickChallenge').onclick` ([editor.js:313](../public/editor/editor.js#L313)) | `RBChallenges.pick` → fork come **nuovo** roadbook |

Le sorgenti che importano contenuto *fresco* (GPX, .rdbk, challenge) chiamano prima
`resetIdentity()` ([editor.js:636](../public/editor/editor.js#L636)): azzerano
`currentRbId`, rimettono privato e ripuliscono `?rb=` dall'URL — così importare qualcosa
mentre si edita un roadbook salvato fa partire una nuova entità, non sovrascrive l'originale.

---

## 3. La barra strumenti: il GPX si edita sulla mappa

La traccia non si edita in un editor a parte: si edita **direttamente sulla mappa** tramite
la barra verticale `.map-tools` ([index.html:205](../public/editor/index.html#L205)). I tool
si dividono in **mode tool** (toggle esclusivi) e **one-shot** (azioni immediate).

### 3.1 Mode tool

`setMapTool(tool)` ([editor.js:110](../public/editor/editor.js#L110)) imposta `mapTool`,
azzera lo stato di cut/draw, aggiorna l'evidenziazione e il cursore. Il dispatch dei tap
mappa è in `map.map.on('click', …)` ([editor.js:51](../public/editor/editor.js#L51)).

| Tool       | `mapTool` | Funzione                                                  | Comportamento |
|------------|-----------|-----------------------------------------------------------|---------------|
| **pan**    | `pan`     | `select` su waypoint ([editor.js:50](../public/editor/editor.js#L50)) | naviga; tap su una nota la apre; il marker rosso di riposizionamento è attivo solo qui |
| **add note** | `note`  | `addWaypointNear` ([editor.js:860](../public/editor/editor.js#L860)) | inserisce una nota dove tocchi (split del segmento se serve) |
| **draw**   | `draw`    | `drawPoint` ([editor.js:157](../public/editor/editor.js#L157)) | ogni tap estende dall'estremità **aperta più vicina** |
| **move points** | `points` | `setVertexEditor` + `onVertexDrag`/`onVertexCommit` ([editor.js:64](../public/editor/editor.js#L64)) | trascina qualunque vertice; metriche/note ricalcolate al rilascio |
| **insert** | `insert`  | `insertMidpoint` ([editor.js:214](../public/editor/editor.js#L214)) | tap su un segmento → nuovo vertice al suo punto medio |
| **cut**    | `cut`     | `cutPoint` ([editor.js:227](../public/editor/editor.js#L227)) | tap due punti → taglia |

**Draw.** Con nulla caricato, i primi due tap costruiscono un roadbook da zero
(`drawSeed` → `RB.buildRoadbook`). Con una rotta presente, ogni tap calcola la candidata più
vicina tra: estremità finale, estremità iniziale, e i due bordi di ogni taglio aperto, e
applica la più vicina; toccare il bordo opposto di un taglio lo **chiude** invece di
estenderlo ([editor.js:182](../public/editor/editor.js#L182)).

**Posizionamento esatto.** `splitTrackAt(p)`
([editor.js:201](../public/editor/editor.js#L201)) usa `RB.nearestOnTrack`: se il tap cade
tra due vertici, il segmento viene spezzato lì inserendo un punto — quindi note e tagli
possono stare **ovunque** sulla rotta, non solo sui vertici esistenti. Il connettore
tratteggiato di un taglio aperto non viene mai spezzato (non è un segmento reale).

**Tagli aperti (`gaps`).** Un cut interno lascia un vero buco. È memorizzato come la coppia
di **punti** dei bordi (`{a, b}`), non come indici — così sopravvive agli shift di indice di
qualunque altra operazione; `resolveGaps()`
([editor.js:84](../public/editor/editor.js#L84)) li ri-risolve in indici on demand e pota
quelli morti. Il buco si riempie disegnando, o si chiude come **linea retta** all'export/save
dopo una conferma (`confirmOpenCuts`, [editor.js:103](../public/editor/editor.js#L103)).

### 3.2 One-shot

| Tool         | Handler                                                  | Funzione |
|--------------|----------------------------------------------------------|----------|
| **add GPX**  | `$('toolAddGpx')` → `addGpxTrack` ([editor.js:265](../public/editor/editor.js#L265)) | join intelligente |
| **reverse**  | `$('toolReverse')` ([editor.js:287](../public/editor/editor.js#L287)) | `RB.reverseRoadbook` |
| **simplify** | `$('toolSimplify')` ([editor.js:292](../public/editor/editor.js#L292)) | modale tolleranza → `RB.simplifyRoadbook` (Douglas-Peucker, ancore-nota mantenute) |
| **adjust**   | `$('toolAdjust')` ([editor.js:307](../public/editor/editor.js#L307)) | re-record live di un tratto (§5) |
| **undo/redo**| `undo`/`redo` ([editor.js:399](../public/editor/editor.js#L399)) | snapshot debounced |
| **layers**   | `$('toolLayers')` ([editor.js:138](../public/editor/editor.js#L138)) | satellite ↔ terreno (persistito in `localStorage`) |

**add GPX** (`addGpxTrack`, [editor.js:265](../public/editor/editor.js#L265)): se **entrambe**
le estremità del pezzo toccano la rotta (entro 200 m) offre la **sostituzione del tratto**
intermedio (`spliceByIndex`); altrimenti unisce il pezzo all'estremità più vicina,
auto-orientandolo (eventuale `reverseRoadbook` per agganciare in testa). In ogni caso la
rotta resta una sola traccia.

**Undo/redo.** Snapshot dell'intero `{rb, sel, gaps}` serializzato
([editor.js:378](../public/editor/editor.js#L378)), max 30, push debounced a 400 ms. Ogni
`markDirty()` ([editor.js:36](../public/editor/editor.js#L36)) schedula un push. Scorciatoie
Ctrl/Cmd+Z / Ctrl+Y (Shift+Z) ([editor.js:404](../public/editor/editor.js#L404)), disabilitate
dentro campi testo e durante un recording.

I mode tool sono `disabled` finché non c'è una rotta; `setRoadbook` li abilita
([editor.js:363](../public/editor/editor.js#L363)). `Escape` torna a `pan`.

---

## 4. Il modello di editing delle note

La lista note (`renderNotes`, [editor.js:702](../public/editor/editor.js#L702)) è una colonna
di righe `.note-mini`. Tappare una riga **espande l'editor inline subito sotto**: l'unico
elemento `#noteEditZone` viene fisicamente **spostato** nello slot di quella riga, e la
canvas-vignette (`#canvasWrap`) viene spostata DENTRO la cella tulip della riga
(`openEditZoneAt`, [editor.js:777](../public/editor/editor.js#L777)). Prima di ogni rebuild
della lista i due pezzi vengono "parcheggiati" in `#rbPanel` (`parkEditor`,
[editor.js:776](../public/editor/editor.js#L776)) — altrimenti `innerHTML` distruggerebbe gli
elementi spostati.

Campi editabili di una nota:

- **Testo** — `textarea` editata in place nella riga; aggiorna solo il modello senza rebuild
  (mantiene il focus) ([editor.js:749](../public/editor/editor.js#L749)).
- **Road type** — select "Road" che imposta `road_type_out`; solo la strada che si **lascia**
  è autorizzata, l'arrivo deriva dal `road_out` della nota precedente
  (`renderEditor` + `RB.normalizeRoadTypes`, [editor.js:830](../public/editor/editor.js#L830)).
- **Danger** — select FIA `—`/`!`/`!!`/`!!!` → `n.danger` (cancellato se 0)
  ([editor.js:837](../public/editor/editor.js#L837)).
- **CAP** — toggle nella riga (`toggleCapAt`, [editor.js:840](../public/editor/editor.js#L840)):
  attivandolo calcola heading (`bearingDeg`) e distanza (`haversineM`) verso la nota
  successiva. L'**ultima nota non ha CAP** (manca la nota seguente).
- **Icone / vignette** — gestite da `NoteCanvas` su `#noteCanvas`
  ([editor.js:46](../public/editor/editor.js#L46)); palette in §4.1.

**Drag sulla mappa.** Mentre una nota è aperta e il tool è `pan`, `placeMainEditMarker`
([editor.js:808](../public/editor/editor.js#L808)) mette un marker rosso trascinabile: al
rilascio riaggancia la nota al vertice più vicino (`RB.nearestIdx`) e ricalcola le metriche —
la nota si riposiziona sulla stessa mappa che descrive, senza mini-mappa separata.

Riordino/cancellazione: frecce ↑/↓ (`select` di indice ±1) e `delNote`
([editor.js:848](../public/editor/editor.js#L848)); la guardia impone **almeno 2 note**
([editor.js:737](../public/editor/editor.js#L737)).

### 4.1 Palette icone

`renderIcons` ([editor.js:874](../public/editor/editor.js#L874)) fonde la palette standard
(`assets/icons/index.json`, caricata da `loadStd`) con le icone custom embedded nel roadbook
(`rb.icons`). Chip di categoria (`renderIconCats`) + ricerca live (`filterIcons`,
[editor.js:911](../public/editor/editor.js#L911)) filtrano insieme. Le icone si aggiungono col
tap o col **drag&drop** sulla vignette; le custom si caricano (`#iconFile` → data-URI) e si
cancellano con il badge × (bloccato se l'icona è in uso, `delCustomIcon`,
[editor.js:933](../public/editor/editor.js#L933)).

---

## 5. Record e "Adjust on the trail" (GPS live)

La barra `#recBar` ([index.html:191](../public/editor/index.html#L191)) è il loop GPS dal vivo.
Il **recording di una rotta nuova** vive ormai nel tool Recorder dedicato; nell'Editor la
barra serve principalmente ad **"Adjust on the trail"** (re-record live di un tratto),
avviata da `startRecording('adjust')` ([editor.js:480](../public/editor/editor.js#L480)).

Il fix GPS (`onRecFix`, [editor.js:498](../public/editor/editor.js#L498)) scarta i fix con
accuratezza > 35 m, campiona con passo adattivo `max(2.5, accuracy·0.35)` e applica uno
smoothing a media mobile su 3 punti (`smoothTrack`,
[editor.js:444](../public/editor/editor.js#L444)). In modalità adjust attende che ci si porti
sul sentiero (≤ 10 m) per fissare l'ingresso `adjP1`, poi rileva un eventuale rientro più
avanti (`adjP2`). Alla fine `finishAdjust` ([editor.js:588](../public/editor/editor.js#L588))
chiede conferma e fa `spliceByIndex` ([editor.js:608](../public/editor/editor.js#L608)),
sostituendo il tratto e ri-agganciando le note (`RB.nearestIdx`).

Il recording nuovo (`recMode === 'new'`) è checkpointato in `localStorage` (`REC_KEY`,
[editor.js:441](../public/editor/editor.js#L441)) e recuperabile via `checkRecovery`
([editor.js:619](../public/editor/editor.js#L619)); rispecchia inoltre la traccia nel file GPX
crash-safe di `RBGpxRecorder`. Le foto in recording sono geotaggate e caricate lato server
(`recPhoto`, [editor.js:552](../public/editor/editor.js#L552)); richiedono un draft id e il
login.

---

## 6. Configurazione, logo, galleria

La vista config (`#viewConfig`) edita `rb.meta`. Titolo (`#rbTitle`), descrizione, autore,
organizzazione sono legati con handler `oninput` che fanno `markDirty`
([editor.js:411](../public/editor/editor.js#L411)). `stampMeta`
([editor.js:426](../public/editor/editor.js#L426)) riempie l'autore di default e timbra
`modified` (YYYY-MM-DD) ad ogni save/export.

- **Logo evento** — caricato via `RBImg.toDataURL(f, 256)` ed embedded come data-URI in
  `meta.logo` (auto-contenuto come le icone) ([editor.js:417](../public/editor/editor.js#L417)).
- **Visibilità** — segmented Private/Public → `setVis` ([editor.js:634](../public/editor/editor.js#L634)).
- **Accesso mappa nel Reader** — checkbox `cfgMapAccess` → `meta.map_access`
  ([editor.js:434](../public/editor/editor.js#L434)).
- **Foto** — galleria sulla mappa + upload geolocalizzato + lightbox: vedi §6.1.

> Le foto sono **una feature dell'app, mai dentro il `.rdbk`** (vivono lato server). Coerente
> con lo standard.

### 6.1 Foto: galleria sulla mappa, upload geolocalizzato, lightbox
Le foto sono **server-side, geotaggate, legate al roadbook** (tabella `roadbook_photos`, API
`ph_list`/`ph_delete`, upload `RBUpload` → `upload.php`, AVIF, max 60/roadbook — vedi
[backend-api.md](backend-api.md)). Richiedono un roadbook **salvato** (`currentRbId > 0`) o un
draft, e il login.

**Ogni foto ha coordinate (requisito).** `loadPhotos` ([editor.js:673](../public/editor/editor.js#L673))
mostra **tutte** le foto come **pin sulla mappa** (la mappa *è* la galleria) e come indicatore
📷 per-nota (nota più vicina entro 80 m). L'upload (`addPhotos`,
[editor.js:710](../public/editor/editor.js#L710)) raccoglie le coordinate in due modi:

1. **da EXIF** — `RBImg.gps(file)` ([app.js:192](../public/assets/js/app.js#L192)) legge il GPS
   dall'EXIF del JPEG in vanilla JS (primi 256 KB). Se presente, upload immediato con quelle coord.
2. **a mano sulla mappa** — se l'EXIF manca (PNG/HEIC o foto senza GPS) la foto va in coda e
   `promptPlacePhoto` ([editor.js:722](../public/editor/editor.js#L722)) entra in modalità
   *posiziona*: un tap su `edMap` ne fissa la posizione (cursore a mirino, un tap per foto in coda).

Nessuna foto viene salvata senza coordinate.

**Punti di upload:** il bottone *Add photos* nei Settings; nel **menu contestuale della
mappa** (tasto destro, [editor.js:21](../public/editor/editor.js#L21)) la voce *Upload a photo
here*, che geotagga sul punto cliccato (nessun EXIF: la posizione è scelta); e **copia-incolla**
(Ctrl/Cmd+V di un'immagine dagli appunti, listener `paste`) che segue il normale flusso
EXIF/pin. Tutti convergono su `addPhotos`.

**Lightbox** (`openLightbox`): un tap su un **pin** o su una **miniatura** apre il visore che
sfoglia *tutte* le foto del roadbook. Il visore **copre solo la mappa** (`#lightbox` è dentro
`#mapEditor`, posizione assoluta), **non** il pannello note → si può **continuare a editare** mentre
si guarda una foto; le frecce da tastiera sono ignorate quando il focus è in un campo di testo.
Frecce ‹/›, `←`/`→` e `Esc`, più una riga azioni:
- **Waypoint** — crea un waypoint sulla posizione della foto (sostituisce il vecchio "promuovi a
  waypoint" del pin);
- **Move on map** — entra in modalità *posiziona* (`startMovePhoto`): il prossimo tap sulla mappa
  aggiorna le coordinate della foto via l'endpoint **`ph_move`** ([roadbooks.php](../app/roadbooks.php), `UPDATE … SET lat,lon`, con check proprietà);
- **Delete** — elimina la foto (`ph_delete`, con conferma) e aggiorna lightbox + pin.

---

## 7. Export e "Save to profile"

Un unico pulsante **Export** (`#exportBtn`) apre una pop-up (`openExportModal`, `RBModal`) con
tutti i formati; **Save** (salvataggio sul profilo) resta separato. Ogni voce chiude la pop-up,
conferma **una sola volta** i tagli aperti (`confirmOpenCuts`) e ricalcola le metriche prima di
scrivere — così una scelta GPX multipla non ripete il prompt.

| Formato | Funzione | Output |
|---------|----------|--------|
| **.rdbk** | `exportRdbk` | JSON auto-contenuto; `embedUsed` embedda ogni icona usata e pota le inutilizzate |
| **PDF** | `exportPdf` | A4 sul device via `RBPdf.generate` (jsPDF lazy-loaded, `rb-pdf.js`) |
| **GPX** | un pulsante con **checkbox** per le tipologie (esporta ognuna spuntata): | |
| · Track | `exportTrack` | `RB.gpxDocument`: **solo la traccia GPS**, niente waypoint |
| · Track + WPT | `exportGpx` | `RB.gpxDocument`: traccia + ogni nota come waypoint nominato |
| · OpenRally | `exportOpenRally` | `RB.openRallyDocument` (vedi sotto) |

`embedUsed` garantisce la regola auto-contenuta del formato: ogni simbolo usato finisce in
`rb.icons` come data-URI; le icone non più referenziate vengono rimosse.

> **OpenRally import/export (issue #13).** Standard:
> [github.com/openrally/openrally](https://github.com/openrally/openrally) (XSD:
> [`cross-country/openrally.xsd`](https://github.com/openrally/openrally/blob/master/cross-country/openrally.xsd)).
> GPX 1.1 + namespace `openrally:`; round-trip validato contro l'XSD ufficiale
> (`cross-country/test_wrapper.xsd`) con `xmllint --schema`.
>
> **Export** (`RB.openRallyDocument`): traccia come `<trk>`, ogni nota come `<wpt>`; `distance`
> in km (+ il totale a livello `<metadata>`) e la vignette rigenerata da `NoteCanvas.toSVG` in
> `<openrally:tulip>`. Per una nota **importata** i parametri OpenRally sono riemessi *verbatim*
> dal passthrough; per una nota **nativa** si emette il set calcolato (`cap`/`danger`/`speed`).
>
> **Import** (`RB.parseOpenRally`): l'handler GPX rileva il namespace `openrally:` e instrada
> qui. Geometria: `<trk>` reale → usata; coordinate `<wpt>` reali → traccia costruita da esse;
> **solo-distanza** (l'example ufficiale, wpt a 0,0) → **traccia segnaposto** spaziata per
> `openrally:distance`, con avviso a ridisegnarla sulla mappa.
>
> **Passthrough completo:** ogni elemento `openrally:` del wpt **tranne** `distance`/`tulip`
> (rigenerati) è conservato verbatim in **`note.openrally`** — `cap`, `danger`, `speed`, tipi
> WP (`wpm/wpe/wps/wpc/wpv/wpp/wpn`), zone (`dss/ass/dz/fz/dt/ft/fn/checkpoint/stop/timecontrol/
> neutralization/fuel/reset`), `show_coordinates`, `notes`. Essendo dentro il JSON del roadbook,
> **sopravvive a save/reimport** (sia `.rdbk` sia profilo server) e viene riemesso all'export.
>
> **Tulip importato:** è un'immagine opaca → diventa un'icona **`cover`** che `NoteCanvas.toSVG`
> rende a tutto-box, da sola (vale anche per Reader e PDF). Nel picker "Tuoi (in questo
> roadbook)" appare **solo quello della nota corrente**, con tooltip *"Cancellami per esportare
> il tulip modificato"*: cancellandolo la vignetta torna editabile e l'export emette quella
> nativa. I controlli/zone di gara strutturati restano un passthrough (non editabili in RDBK);
> la loro modellazione nativa dipende dalle estensioni `.rdbk` proposte in #9.

**Save to profile.** `doSave` ([editor.js:637](../public/editor/editor.js#L637)) timbra il
meta, ricalcola, embedda le icone e fa `RBApi('rb_save', …)`. Al successo registra
`currentRbId`, azzera `dirty`, pulisce il draft e **fissa `?rb=<id>` nell'URL** via
`history.replaceState` — così un reload (o l'auto-refresh di versione) continua a editare lo
stesso roadbook, e i successivi save aggiornano la stessa entità. `$('saveAccount')` richiede
login (`RBNeedAuth`). **"Save as"** ([editor.js:657](../public/editor/editor.js#L657)) azzera
l'identità, aggiunge "(copy)" al titolo e salva una nuova entità privata, lasciando intatto
l'originale.

---

## 8. Avvio, draft e recovery

`markDirty()` ([editor.js:36](../public/editor/editor.js#L36)) marca il lavoro come sporco e
schedula un **checkpoint debounced (2 s)** dell'intero stato in `localStorage` (`DRAFT_KEY`,
`saveDraft`/`clearDraft`, [editor.js:34](../public/editor/editor.js#L34)). Il draft viene
**pulito** solo quando il lavoro è al sicuro (save su profilo o export). `beforeunload`
([editor.js:435](../public/editor/editor.js#L435)) e `visibilitychange`
([editor.js:474](../public/editor/editor.js#L474)) flushano il draft prima di un'eventuale
chiusura/kill dell'OS.

La sequenza di startup ([editor.js:998](../public/editor/editor.js#L998)) ha una precedenza
precisa:

1. `RBApi('config')` per identificare l'utente (in parallelo).
2. **`?trip=1`** — traccia passata da Recorder/Tripmaster via `sessionStorage` (con waypoint
   e, se loggati, il draft con le foto già attaccate).
3. **Draft non salvato** in `localStorage` — `RBConfirm` di recupero (rifiutare **non** lo
   cancella: viene sovrascritto al prossimo checkpoint).
4. **`checkRecovery`** — un recording GPS interrotto.
5. **Challenge dall'URL** (`RBChallenges.publicFromUrl`) — fork come nuovo roadbook.
6. **`?rb=<id>`** — carica un roadbook salvato dal profilo (richiede login).

---

## 9. Importazione di file JSON predisposti da RB Suite (`.rdbk`)

I file JSON prodotti dalla suite RDBK sono i `.rdbk`: un unico file UTF-8 auto-contenuto con
`meta` · `track` · `notes` · `icons` (lo schema completo è in [rdbk-format.md](rdbk-format.md)).
Questo capitolo documenta cosa succede quando se ne **importa uno nell'Editor** e — punto
chiave — **se sopravvivono le informazioni che serviranno poi al Ranking**.

### 9.1 Il percorso di import
La carta **.rdbk** della landing è gestita da `$('jsonFile').onchange`
([editor.js:325](../public/editor/editor.js#L325)):

1. `JSON.parse` del testo del file;
2. validazione minima: devono esserci `track` **e** `notes`, altrimenti `throw 'Not a roadbook'`;
3. `resetIdentity()` — l'import è un **nuovo** roadbook (azzera `?rb=`, torna privato, §2);
4. `setRoadbook(j)` ([editor.js:336](../public/editor/editor.js#L336)).

`setRoadbook` passa per [`RB.importRoadbook`](../public/assets/js/roadbook-core.js#L205), che
porta il file allo schema canonico. Per un `.rdbk` **già canonico** non tocca nulla. Per un
file **Roadbook Suite** (riconosciuto da un marcatore legacy: `titolo`, `testo`, `bivio`,
`cap_hdr`, `km_prog`…) applica le conversioni specifiche:

- chiavi italiane → canoniche (`titolo→title`, `testo→text`, `km_totali/km_prog/km_parz` in
  metri, `cap_hdr/cap_km→cap/cap_distance`);
- `bivio[]→junctions[]` con **flip dell'asse Y** (la Suite usa +y verso il basso, la vignetta
  +y verso l'alto); le **icone** oltre al flip Y vengono **ri-centrate** (la Suite le ancora
  all'angolo in alto a sinistra, RDBK al centro) e **ingrandite** ×1.5 (×3 per `partenza`/`arrivo`);
- **ricalcolo metriche dalla traccia** (`recomputeMetrics`): bearing, distanze e tipi-strada
  vengono ri-derivati dalla polilinea, che è la fonte autorevole. Questo raddrizza, fra
  l'altro, la freccia della **nota di partenza** (la Suite vi mette un `bearing_in` placeholder
  che, con la resa a *svolta relativa*, punterebbe all'indietro).

Per un `.rdbk` canonico, invece, **in import non gira alcun ricalcolo**: i campi restano
identici al file.

### 9.2 Fedeltà dei dati per il Ranking
Il Ranking non legge il `.rdbk`: legge la stringa META firmata che il **Reader** produce a
fine prova (vedi [ranking-model.md](ranking-model.md)). Ma il Reader calcola le penalità da
campi per-nota che devono quindi essere presenti nel `.rdbk` importato. Verifica campo per
campo:

| Dato usato dal Ranking (via Reader) | A cosa serve | Importato dall'Editor? |
|---|---|---|
| `lat` / `lon` | penalità *accuracy* ed *extra* | ✅ preservati in import; in export agganciati alla traccia da [`recomputeMetrics`](../public/assets/js/roadbook-core.js#L208) |
| `cap` / `cap_distance` | penalità *CAP* (proiezione `destPoint` dalla nota precedente) | ✅ preservati; [`recomputeCaps`](../public/assets/js/roadbook-core.js#L229) ricalcola **solo dove `cap != null`**, mantenendo il flag |
| `distance` / `partial_distance` | `km`, raggio di reach, sezione | ✅ ricalcolati dalla traccia importata (intatta) |
| `icons` con `I02_partenza` / `I01_arrivo` | delimitano la **sezione a punteggio** (`scoredSet`) | ✅ array `icons` per-nota preservato; in export embeddato da [`embedUsed`](../public/editor/editor.js#L982) |
| `icons` con limiti `Sxx_*` | penalità *speed* (`speedLimitOfNote`) | ✅ stesso percorso delle icone |

`danger` non è usato dal Ranking. La stringa META (team, tempi, penalità) **non** è nel
`.rdbk`: nasce nel Reader al `Finish`, quindi non è oggetto dell'import.

**Conclusione:** importando un `.rdbk` nell'Editor, tutte le informazioni che servono al
Ranking vengono importate e preservate.

### 9.3 Cosa cambia in export/save (e perché è coerente)
A differenza dell'import, **export e Save ricalcolano** prima di scrivere
([editor.js:964](../public/editor/editor.js#L964)): `recomputeMetrics` aggancia ogni nota al
punto-traccia più vicino (`idx`) — `lat/lon`, `distance`, `partial_distance` e bearing
derivano dalla traccia — e `recomputeCaps` riallinea heading/distanza-CAP alla geometria dove
il CAP è attivo. Le note **stanno sulla traccia per definizione**, quindi questo non perde
nulla di rilevante per il punteggio: rende solo i valori internamente coerenti.

### 9.4 Condizione sul contenuto del file
Sezione cronometrata e penalità velocità esistono **solo se** il file contiene davvero le
icone di partenza/arrivo e i cartelli di limite. Un `.rdbk` privo dell'icona di partenza fa
considerare al Reader **l'intero roadbook** come a punteggio (`scoredSet = null`, vedi §3 di
[ranking-model.md](ranking-model.md)); senza cartelli di limite non c'è penalità velocità. È
una proprietà del contenuto del file, non una perdita in fase di import.

### 9.5 Mappatura delle icone
I nomi-icona di Roadbook Suite spesso differiscono da quelli della palette standard. La
traduzione avviene in due punti.

**(a) Rinomine 1:1** — in [`importRoadbook`](../public/assets/js/roadbook-core.js#L190)
(quindi valgono sia Editor sia Reader):

| Roadbook Suite | → Palette | Regola |
|---|---|---|
| `S01_10km.png` … `S09_90km.png`, `S99_end.png` | `…​.svg` | limiti di velocità: la Suite li esporta PNG, la palette li ha SVG (la penalità velocità funziona comunque, va per nome) |
| `p36_gruppo_case.png` | `P02_gruppo_case.png` | stesso soggetto, numero diverso |
| `p14_lago.png` | `P14_estanque.png` | lago ≈ estanque |
| `S10_stop.png` | `B02_stop.svg` | cartello: stop |
| `S11_precedenza.png` | `B01_give_way.svg` | cartello: dare precedenza |
| `S12_divieto_passaggio.png` | `C01_no_entry.svg` | cartello: divieto di passaggio |
| `S14_strettoia.png` | `W07_road_narrows.svg` | cartello: strettoia |
| `S15_curva_pericolosa_dx.png` | `W01_curve_right.svg` | cartello: curva pericolosa a destra |
| `S16_curva_pericolosa_sx.png` | `W02_curve_left.svg` | cartello: curva pericolosa a sinistra |
| `S17_sdrucciolevole.png` | `W11_slippery_road.svg` | cartello: fondo sdrucciolevole |
| `S18_frana.png` | `W13_falling_rocks.svg` | cartello: frana / caduta massi |
| `S19_pericolo_generico.png` | `W28_general_danger.svg` | cartello: pericolo generico |
| `S20_rotatoria.png` | `D06_roundabout.svg` | cartello: rotatoria |
| `s20_strada_tortuosa.png` | `W03_double_curve_right.svg` | cartello: strada con molte curve |
| `s21_attraversamanto_senza_barriere.png` | `W24_level_crossing.svg` | cartello: passaggio a livello senza barriere |
| `s24_attenzione.png` | `W28_general_danger.svg` | cartello: attenzione (pericolo generico) |
| `s25_trattori.png` | `W27_agricultural_vehicles.svg` | cartello: mezzi agricoli |

> ⚠️ **Collisione serie `S`:** la Suite usa `S10`…`S20` per *cartelli* (stop, precedenza,
> divieto, curve, frana, rotatoria, …), mentre la palette usa la serie `S` solo per i *limiti*
> (`S10_100km`…). Per questo i cartelli sono mappati per **significato** (tabella sopra) e la
> regola dei limiti è ristretta a `S0x` (un solo zero), così non si toccano a vicenda. Tutti i
> cartelli della Suite trovano un equivalente del set Vienna in palette (`W*`/`B*`/`C*`/`D*`).

**(b) Icone senza file → fallback + nota** — in [`flagUnresolvedIcons`](../public/editor/editor.js#L880)
(solo Editor, dopo `loadStd`): per ogni icona il cui **file non esiste** su disco si sostituisce
il nome con un segnaposto (`W28_general_danger.svg`) e si **aggiunge al testo della nota**
`Nota: aggiungere icona <nome originale>`, così l'autore sa cosa rimpiazzare. L'esistenza è
verificata con un `HEAD` su `assets/icons/<nome>` (deduplicato), **non** con `index.json`:
così un file realmente presente ma non listato nel picker renderizza comunque e **non** viene
flaggato. È idempotente (il nome originale sparisce dopo lo swap; la nota si aggiunge una volta
sola). *(Le icone di superficie del terreno — `T01`/`T02`/`T05`/`t03`/`t04`/`t06` — sono ora
anche nella palette ricercabile, categoria Terrain.)*

**Senza alcun equivalente** (ricadono nel fallback (b) finché non si aggiungono le icone):
`p24_cassonetto`, `p26_estatua_monumento`, `p44_campo_coltivo`, e i segnaposto generici della
Suite `*_icona` (`p02_icona`, `s01_icona`, `i03_icona`, …).

---

## 10. Limiti e quirk da segnalare

- **XHR sincrono in `setRoadbook`.** Le icone embedded mancanti vengono risolte con
  `XMLHttpRequest` **sincrono** ([editor.js:346](../public/editor/editor.js#L346)): blocca il
  thread durante il caricamento e usa il deprecato `overrideMimeType` per leggere binario.
  Funziona ma è un anti-pattern; con molte icone non in cache l'apertura può ingobbire.
- **`makeNote` non emette il campo `num`.** `makeNote` crea `num: 0`
  ([editor.js:45](../public/editor/editor.js#L45)); la numerazione corretta arriva solo dopo
  `RB.recomputeMetrics`. Le righe che inseriscono note lo chiamano subito, quindi in pratica è
  coerente — ma una nota appena creata e mostrata prima del recompute apparirebbe come `0`.
- **L'autore di default può sovrascrivere il campo vuoto al login.** In startup, se l'utente
  arriva dopo il render, l'autore viene riempito solo se `meta.author` e il campo sono vuoti
  ([editor.js:1002](../public/editor/editor.js#L1002)) — corretto, ma dipende dall'ordine di
  risoluzione della promise `account`.
- **`spliceByIndex` ri-aggancia tutte le note con `nearestIdx`.** Dopo un adjust/splice le
  note vengono riancorate al vertice più vicino sulla nuova traccia
  ([editor.js:615](../public/editor/editor.js#L615)); se la variante passa vicino a una nota
  "vecchia" lontana lungo la rotta, l'aggancio per distanza euclidea può spostarla in modo
  non intuitivo.
- **I tagli aperti si chiudono in linea retta.** Per design, ma vale ricordarlo: dimenticare
  di riempire un gap prima dell'export produce un segmento dritto che attraversa il buco
  (almeno preceduto dalla conferma `confirmOpenCuts`).
- **Le foto richiedono un roadbook già salvato** (`currentRbId > 0` / `draftId`): non si
  possono allegare foto a un roadbook puramente locale non ancora salvato.
