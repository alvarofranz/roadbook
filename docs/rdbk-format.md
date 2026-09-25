# Il formato aperto `.rdbk` (versione 1)

Lo standard di file dietro a RDBK.app: un file `.rdbk` è un **contenitore ZIP** con dentro
`roadbook.json` — il roadbook autonomo che porta con sé l'intero percorso (traccia GPS, note,
CAP, diagrammi di incrocio **e i propri simboli**) — più, opzionalmente, i media geotaggati (foto,
note vocali). Questo documento segue la struttura della
[pagina pubblica dello standard](../public/standard/index.html) (`/standard`) e aggiunge, per
ogni parte, **quale funzione del codice la implementa**.

> Convenzioni cardine: **tutte le distanze sono numeri interi in metri**; le coordinate sono gradi
> decimali WGS-84 con **al massimo 6 decimali**; i rilevamenti e i CAP sono gradi orari dal nord
> vero (0–359); gli angoli dei simboli sono gradi orari. Il file contiene **solo ciò che l'autore
> ha deciso**: tutto quello che si può calcolare (distanze, rilevamenti, conteggi) lo calcola chi
> legge, così un file non può mai contraddirsi.

---

## 1. A cosa serve il formato

Un `.rdbk` è pensato per essere **letto, seguito, condiviso e archiviato** senza alcun allegato
esterno. Le sue quattro proprietà di design:

- **Autonomo.** `roadbook.json` incorpora i simboli che usa (come data URI), quindi rende in modo
  identico ovunque — offline, anni dopo — senza pacchetti di icone esterni da perdere.
- **JSON puro.** `roadbook.json` è apribile in qualsiasi editor di testo, parsabile con una riga in
  qualunque linguaggio, versionabile con `git diff`.
- **Pronto per la mappa.** La traccia GPS completa viaggia insieme alle note, così ogni reader può
  disegnare il percorso e posizionare l'utente su di esso.
- **I simboli sono di prima classe.** Ogni nota può portare pittogrammi posizionati, ruotati e
  scalabili e vettori di incrocio — non solo una riga di testo.

**File:** estensione `.rdbk`, contenitore **ZIP**, media type **`application/x-roadbook`**.

### Dove vive nel codice

| Cosa | Dove |
|------|------|
| Versione del formato | `RB.FORMAT_VERSION` (= `1`) in [roadbook-core.js](../public/assets/js/roadbook-core.js) |
| Giudizio su un documento | `RB.validateRoadbook(doc)` → `{ valid, errors, warnings }` |
| Documento → roadbook in memoria | `RB.readRoadbook(doc)` (valida, idrata i valori derivati; lancia se non valido) |
| Roadbook in memoria → documento | `RB.writeRoadbook(rb)` (forma canonica: default omessi, chiavi in ordine fisso, 6 decimali) |
| Valori derivati | `RB.recomputeMetrics(rb)` (§7) |
| Giudizio su `media.json` | `RB.validateMedia(manifest, names)` (§12) |
| Contenitore ZIP | `RBZip.inspect` / `readBundle` / `readRdbk` / `write` in [rbzip.js](../public/assets/js/rbzip.js) — vedi [rbzip.md](rbzip.md) |
| Validatore pubblico | `/validator/` ([validator.js](../public/validator/validator.js)) — §13 |
| Controllo lato server al salvataggio | `rb_valid_document` in [app/roadbooks.php](../app/roadbooks.php) — §14 |

---

## 2. Contenitore (il file)

Un file `.rdbk` è un **contenitore ZIP**. Al suo interno, `roadbook.json` contiene il roadbook — il
documento descritto sotto, con ogni simbolo che disegna e ogni nota vocale incorporati — insieme a
foto opzionali:

```
il-mio-roadbook.rdbk   (ZIP)
├─ roadbook.json     // il roadbook — il documento qui sotto
├─ media.json        // opzionale — dove è stato preso ogni file incluso
└─ photos/…          // opzionale — foto geotaggate
```

Le foto sono **opzionali**: viaggiano solo quando chi esporta le include (nell'Editor, la spunta
*includi le foto*). Senza foto, lo ZIP contiene solo `roadbook.json`. Le note vocali non sono voci
del contenitore: sono blocchi `voice` delle note (§6), dentro `roadbook.json`. Un reader
riconosce lo ZIP dal magic number `PK`; un file JSON nudo si legge come un `roadbook.json` da solo
(`RBZip.inspect` riporta `container: 'zip' | 'json'`).

`RBZip.inspect(file)` descrive il file **senza giudicarlo**: `{ container, names, files, doc,
docError, manifest, manifestError }` — `doc` è il `roadbook.json` parsato (o `null` con `docError`
se manca o non è JSON), `manifest` il `media.json` parsato (o `null` se assente). `readBundle(file)`
ritorna `{ roadbook, media }` e `readRdbk(file)` il solo documento: in entrambi i casi il documento
**grezzo**, che il chiamante passa a `RB.readRoadbook`.

Lo **storage lato server è JSON**: il server conserva il `roadbook.json` così come lo riceve, e lo
ZIP è l'artefatto di export/import. Le foto vivono sul server per roadbook (`public/photos/<id>/`)
e nello ZIP solo quando incluse; le note vocali restano nel documento, fino a 60 MB
(`RB_MAX_BYTES`).

---

## 3. Struttura del documento (`roadbook.json`)

`roadbook.json` è un singolo oggetto JSON:

```jsonc
{
  "rdbk_version": 1,       // la versione dello standard che il file segue
  "meta": { … },           // i dati del roadbook
  "track": [ … ],          // la polilinea GPS (punti ordinati)
  "notes": [ … ],          // le note, in ordine di traccia
  "symbols": { … },        // la libreria di simboli incorporata (nome → data URI)
  "compatibility": { … }   // opzionale — ciò che altri formati dicevano, un blocco ciascuno
}
```

- **Un valore al suo default si omette** (testo vuoto, strada `2`, nessuna rotazione, liste
  vuote…): c'è un solo modo di scrivere ogni cosa. `writeRoadbook` scrive così; `validateRoadbook`
  segnala come *warning* un default presente.
- `writeRoadbook` scrive le chiavi in **ordine fisso** (quello delle tabelle qui sotto), le
  coordinate arrotondate a 6 decimali, e la libreria `symbols` in ordine alfabetico.
- Una chiave sconosciuta non invalida il file: è un *warning* (i reader la ignorano).

Un roadbook nuovo nasce da `RB.newRoadbook(title, track, notes)` (versione, `meta.title`,
`meta.default_validation_radius` = `CONST.REACH_DEFAULT_M`, `symbols` vuoto); da un GPX lo costruisce
`RB.buildRoadbook`. Una nota nuova nasce da `RB.blankNote(trackIndex, roadType)`.

---

## 4. `meta`

| Campo | Tipo | Significato |
|-------|------|-------------|
| `title` | string | **Obbligatorio**, non vuoto. Titolo del roadbook. |
| `description` | string | Testo libero mostrato sulla pagina pubblica del roadbook. |
| `author` | string | Nome dell'autore. |
| `organization` | string | Club / organizzatore dell'evento. |
| `modified` | string | Data di ultima modifica, `YYYY-MM-DD`. |
| `logo` | string | L'immagine del roadbook come data URI, incorporata come i simboli. |
| `map_allowed` | `false` | `false` nasconde la mappa al reader durante la navigazione (gare in cui leggere la mappa sarebbe sleale). Assente = mappa consentita; si scrive **solo** come `false`. |
| `default_validation_radius` | integer > 0 | Il raggio di convalida (metri) di ogni nota senza un `validation_radius` proprio. |
| `generator` | string | Il programma che ha scritto il file. RDBK.app scrive `"RDBK.app"`. |

L'**ambito dei tipi di waypoint** (base o rally) non è nel file: l'Editor lo deduce — un roadbook
che usa un tipo del livello rally *è* un roadbook rally — e lo mostra come select nelle
impostazioni (vedi [editor.md](editor.md)).

---

## 5. `track`

Un array **ordinato** di almeno **due** punti: il percorso. Le note stanno sui suoi punti, per
indice (`track_index`).

| Campo | Tipo | Significato |
|-------|------|-------------|
| `lat` | number | **Obbligatorio.** Latitudine, −90…90. |
| `lon` | number | **Obbligatorio.** Longitudine, −180…180. |
| `elevation` | integer | Altitudine in metri. |
| `time_ms` | integer | Ora del fix, millisecondi dal 1970 UTC — conservata da una registrazione. |

```jsonc
"track": [
  { "lat": 45.827120, "lon": 9.411640, "elevation": 1245, "time_ms": 1783065600000 },
  { "lat": 45.827400, "lon": 9.411800 }
]
```

I fix GPS grezzi (il GPX, i log del Reader/Tripmaster, le tracce delle run) usano le parole del GPX,
`ele` e `t`; il confine è `RB.trackPoint(fix)` (fix → punto di traccia) e `RB.trackFixes(track)`
(traccia → fix, per i serializzatori GPX/KML).

---

## 6. `notes`

Il cuore di un roadbook: **almeno una nota**, ognuna su un punto della traccia, in ordine di traccia
(ogni `track_index` è **maggiore** del precedente — due note non condividono un punto).

| Campo | Tipo | Default | Significato |
|-------|------|---------|-------------|
| `track_index` | integer | — | **Obbligatorio.** Il punto di `track` su cui sta la nota. |
| `text` | string | `''` | L'istruzione. |
| `road_type` | 1–5 | `2` | La strada su cui si **lascia** la nota — vedi [§9](#9-tipi-di-strada). Vale finché una nota successiva non la cambia. |
| `cap` | integer 0–359 | nessuno | CAP — il rilevamento da tenere dopo la nota, come l'ha impostato l'autore. |
| `cap_type` | string | `exit` | Solo con un `cap`: `average`, `calculated` o `turning` (`RB.CAP_TYPES`). |
| `speed_limit_kmh` | integer ≥ 0 | nessuno | Il limite di velocità in vigore da questa nota, km/h; `0` lo annulla. |
| `danger` | 1–3 | nessuno | Gradazione di pericolo stile FIA: `!` / `!!` / `!!!` in rosso dentro il box della vignetta (mai nella colonna del testo). |
| `waypoint_type` | string | nessuno | Il tipo di waypoint FIA, per nome (`RB.WP_TYPES`): `masked` · `control` · `security` · `navigation` · `precise` · `visible` · `eclipse`, i marcatori `start` · `finish` · `ss_start` · `ss_end`, le zone `dz`/`fz` · `dn`/`fn` · `dt`/`ft` e i controlli `cp` · `pc` · `stop`. |
| `validation_radius` | integer > 0 | nessuno | Il raggio di convalida della nota (metri). |
| `symbols` | array | `[]` | Simboli posizionati — [§8](#8-simboli). |
| `junctions` | array | `[]` | Vettori di incrocio — [§10](#10-vettori-di-incrocio-junctions). |
| `imported_tulip` | object | nessuno | Un tulip importato da un altro formato (es. OpenRally): `{ "image": data URI, "shown"?: false }`. |
| `blocks` | array | `[]` | Il materiale che la nota porta con sé, prima o dopo di essa. |
| `compatibility` | object | nessuno | Ciò che un altro formato diceva di questa nota — [§11](#11-compatibility). |

```jsonc
{
  "track_index": 184,
  "text": "Tieni la destra sulla pista in ghiaia",
  "road_type": 3,
  "cap": 247, "cap_type": "average",
  "speed_limit_kmh": 30,
  "danger": 2,
  "waypoint_type": "masked",
  "symbols": [ { "name": "S03_30km.svg", "position": [40, 22], "size": 32 } ],
  "junctions": [ { "from": [0, 0], "to": [45, 25], "road_type": 4 } ],
  "blocks": [ { "type": "text", "placement": "before", "text": "Guado profondo dopo il ponte — rallenta." } ]
}
```

### Dettagli e implementazione

- **Raggio di convalida.** `RB.detectionRadius(note, meta)` applica la precedenza:
  `validation_radius` della nota → `meta.default_validation_radius` → il `radius` del tipo in
  `WP_TYPES` → `CONST.REACH_DEFAULT_M` (30 m). Il Reader poi lo limita con lo spazio tra note vicine
  e lo porta almeno a `CONST.REACH_MIN_M` (`RB.reachRadius`).
- **Tipi di waypoint.** Il file scrive l'id descrittivo così com'è. I codici OpenRally (`WPM`,
  `WPN`, `DSS`, `DZ`…) esistono solo nell'import/export OpenRally: il campo `cap` di ogni voce di
  `WP_TYPES` e `RB.wpTypeByCap(code)`. L'Editor propone i tipi dell'ambito corrente
  (`RB.wpTypesForProfile('basic' | 'rally')`); il badge è `RB.wpBadgeSVG`.
- **CAP.** `cap` è un dato autoriale. Nell'Editor `RB.recomputeCaps` ripropone, dopo ogni modifica,
  il rilevamento in linea retta verso la nota successiva (l'ultima nota non ha un CAP).
- **Limite di velocità.** Lo porta solo `speed_limit_kmh`; `RB.speedLimitOfNote(note)` legge il
  campo. Quando l'autore imposta un limite, l'Editor aggiunge anche il cartello `S…` corrispondente
  tra i simboli della nota e tagga la nota come zona controllata (`dz`, o `fz` con `0`);
  `RB.speedLimitFromName` legge il limite dal nome di un cartello per questo e per l'import di
  Roadbook Suite.
- **Tulip importato.** Finché è mostrato (`shown` assente) l'immagine *è* l'intera vignetta,
  disegnata a tutto box da `NoteCanvas`; `"shown": false` fa disegnare il tulip della nota
  (strade, incroci, simboli) tenendo l'originale. Il toggle dell'Editor inverte `shown`. Vedi
  [note-canvas.md](note-canvas.md).
- **Blocchi (`blocks`, `RB.NOTE_BLOCKS`).** Ogni blocco è `{ "type": "photo" | "ad" | "text",
  "placement": "before" | "after", "image"?: data URI, "text"?: string }` e porta un'immagine, un
  testo o entrambi. Non sono mai waypoint: non vengono numerati, mappati, valutati, né esportati come
  waypoint GPX/KMZ. Il testo di un blocco `text` si legge a tutta larghezza; una foto e una
  pubblicità mostrano la loro `image` con la didascalia accanto. `RB.noteBlocks(note, placement)`
  li filtra per lato; `RB.blockType` rende come testo un `type` che il reader non conosce.
- **Nota vocale (`{ "type": "voice", "audio": data URI audio, "lead_distance"?: int }`, #992).** Il
  suono di una nota, senza trascrizione: si ascolta, non si vede — niente lato, niente riga, non entra
  nel PDF. Un reader la riproduce da solo `lead_distance` metri prima della nota lungo il percorso
  (`RB.voiceLead`: default `RB.VOICE_LEAD_M` = 100, omesso quando è 100), una volta per corsa. La
  registrano il Recorder (tenendo premuto il microfono) e l'Editor (l'extra *Nota vocale*), entrambi
  con `RBVoice` (`rb-voice.js`: mono a 24 kbit/s, al massimo 60 s). `RB.blockHasContent` dice se un
  blocco porta qualcosa (immagine, testo o audio).

---

## 7. Valori derivati

**Mai scritti, sempre calcolati** — nello stesso modo da ogni reader, così due app mostrano gli
stessi numeri. Le distanze sono haversine su una sfera di raggio **6 371 000 m**, arrotondate al
metro. In memoria l'app li tiene sulla nota e su `meta`: `RB.readRoadbook` li idrata e
`RB.recomputeMetrics(rb)` li ricalcola dopo ogni modifica; `RB.writeRoadbook` non li scrive mai.

| Valore | Significato |
|--------|-------------|
| `num` | La posizione della nota nella lista, da 1. |
| `lat`, `lon` | Il punto di traccia su cui sta la nota. |
| `distance` | Metri lungo la traccia dal suo primo punto. |
| `partial_distance` | Metri lungo la traccia dalla nota precedente (0 per la prima). |
| `bearing_in`, `bearing_out` | Il rilevamento della traccia in arrivo e in uscita dalla nota, dal punto più vicino ad almeno 1 m (`deriveBearings`; all'inizio della traccia `bearing_in` = `bearing_out`, alla fine il contrario). |
| `road_type_in` | La strada su cui si arriva: il `road_type` della nota precedente (la prima arriva sulla propria). |
| `cap_distance` | Con un CAP: i metri in linea retta fino alla nota successiva (`null` sull'ultima). |
| `meta.total_distance` | La lunghezza della traccia. |
| `meta.note_count` | Il numero di note. |

`recomputeMetrics` riordina anche le note per `track_index` e riporta un indice fuori traccia dentro
i limiti. Il server calcola la lunghezza con la stessa formula (`rb_track_length`) per la colonna
`total_distance` delle liste.

---

## 8. Simboli

### Sistema di coordinate

L'array `symbols` di una nota colloca i pittogrammi su un box di riferimento fisso di
**230 × 162**. L'**origine è il centro** del box; **`+y` punta in alto**; l'`angle` è in gradi
**orari**. Così la nota rende identica a qualsiasi dimensione.

| Campo | Tipo | Default | Significato |
|-------|------|---------|-------------|
| `name` | string | — | **Obbligatorio.** La sua immagine: la chiave nella libreria `symbols`. |
| `position` | [x, y] | — | **Obbligatorio.** Centro in unità di riferimento, dal centro del box, +y in alto. |
| `size` | number > 0 | — | **Obbligatorio.** Lato del box del simbolo (quadrato), in unità di riferimento. |
| `angle` | number | `0` | Rotazione, gradi orari. |
| `mirrored` | `true` | `false` | Specchiato da sinistra a destra. |

### La libreria (`symbols` di primo livello)

Le immagini vivono **dentro il file**, nella mappa `symbols` di primo livello: nome → data URI.
**Ogni `name` usato da una nota DEVE esserci** (altrimenti `validateRoadbook` dà errore): è questo
che rende un `.rdbk` portabile. La libreria può contenere di più — i simboli dell'autore, tenuti per
dopo: `writeRoadbook` scrive l'intera libreria del roadbook, simboli custom compresi (#454).

```jsonc
"symbols": {
  "S03_30km.svg": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…",
  "P07_ponte.png": "data:image/png;base64,iVBORw0KGgoAAAANS…"
}
```

`RB.symbolSrc(symbol, rb, basePath)` risolve l'immagine: la libreria del roadbook (`rb.symbols`) —
dove sta ogni simbolo di un file `.rdbk` — altrimenti, mentre un roadbook è in modifica e un simbolo
della palette non è ancora stato incorporato, la palette standard sotto `basePath`
([`public/assets/icons/`](../public/assets/icons/)). L'Editor incorpora e rinfresca i simboli della
palette usati all'apertura e al salvataggio/export (#174).

---

## 9. Tipi di strada

I tratti sono quelli del **FIA Road Book Lexicon** (Cross Country, 2026); i colori sono quelli della
palette dell'app (i colori sono scelta del reader, il tratto è lo standard). Nella vignetta ogni
strada è larga **8 unità** (`RB.ROAD_WIDTH`); i tratteggi sono nelle stesse unità. Il catalogo è
`RB.ROAD_TYPES`, voci `{ id, name, color, dash, double }`; `RB.roadType(id)` ne ritorna una (il
default per un id sconosciuto) e `RB.DEFAULT_ROAD_TYPE` = `2`.

| `road_type` | Strada | Tratto | `dash` | Colore app |
|-------------|--------|--------|--------|------------|
| `1` | Tarmac (asfalto) | **doppia linea**: tratto da 8 con un centro bianco da 2 (`RB.DOUBLE_GAP`) | — | verde `#22c55e` |
| `2` | Track (pista) — **default** | linea continua | — | `#ff5a45` |
| `3` | Low-visible track (pista poco visibile) | trattini lungo–corto | `24 8 8 8` | `#ff5a45` |
| `4` | Off track (fuoripista) | trattini corti quadrati | `8 8` | `#ff5a45` |
| `5` | Bike lane (ciclabile) | linea continua — aggiunta del formato, la FIA non conosce biciclette (#561) | — | viola `#532b78` |

La vignetta di una nota è un *tulip*: la strada da cui si arriva entra dal bordo inferiore fino al
centro del box (secondo `road_type_in`), la strada su cui si esce parte dal centro con una freccia
alla svolta reale (secondo `road_type`), e gli incroci si diramano dal centro. Dove l'autore ha
disegnato una strada punto per punto sulla traccia attorno alla nota, la vignetta ne segue la forma
(`RB.tulipShape`/`RB.tulipContext`, #945) — ricavata al momento del disegno, mai memorizzata.
`NoteCanvas` ha **un solo renderer** delle strade, `roadMarkup()`, usato dal tronco e dagli incroci.

---

## 10. Vettori di incrocio (`junctions`)

Una nota può disegnare le altre strade del suo incrocio: vettori sullo stesso box 230 × 162, da
`from` a `to`, ciascuno col suo `road_type` e il tratto che ne deriva. Gli incroci si disegnano in
**grigio** (`#9aa4b2`) con il tratto del loro tipo; lo spessore è quello della strada, non un campo.

| Campo | Tipo | Default | Significato |
|-------|------|---------|-------------|
| `from` | [x, y] | — | **Obbligatorio.** Inizio del vettore (unità di riferimento, +y in alto). |
| `to` | [x, y] | — | **Obbligatorio.** Punta del vettore. |
| `road_type` | 1–5 | `2` | Tipo di strada → tratto del vettore. |

```jsonc
"junctions": [
  { "from": [0, 0], "to": [45, 25] },
  { "from": [0, 0], "to": [-30, 40], "road_type": 4 }
]
```

Una nota senza incroci omette la chiave. Nell'editor della vignetta la barra di un incrocio ha solo
la select del tipo di strada ed Elimina.

---

## 11. `compatibility`

Un oggetto opzionale, **alla radice e su una nota**, con **un blocco per ogni altro formato**,
chiamato col suo nome. Tiene ciò che quel formato diceva e il `.rdbk` non ha un campo per dirlo, così
il viaggio di ritorno non perde nulla. Un reader che non conosce un blocco lo ignora; un writer
**DEVE** conservarlo (`writeRoadbook` lo copia così com'è).

```jsonc
"compatibility": {
  "openrally": [ { "tag": "speed", "attrs": {}, "text": "50" } ],
  "gpx": { "sym": "Flag, Blue", "osmand_icon": "special_flag_stroke", "osmand_color": "#1010a0" }
}
```

I blocchi che RDBK.app usa:

- **`openrally`** (su una nota) — ogni elemento `openrally:` di un `<wpt>` importato che il `.rdbk`
  non mappa (tranne `distance` e `tulip`), come `{ tag, attrs, text }`: `RB.parseOpenRally` lo
  riempie, `RB.openRallyDocument` lo riemette alla lettera. Vedi [editor.md](editor.md).
- **`gpx`** (su una nota) — l'icona Garmin/OSMAnd di un waypoint importato che non corrisponde a
  nessun simbolo RDBK: `{ sym, osmand_icon, osmand_color }` (`RB.gpxCompatibility`), riemessa
  dall'export GPX così com'era arrivata.

---

## 12. `media.json`

Dove è stata scattata ogni foto inclusa nel contenitore:

```jsonc
{
  "photos": [ { "file": "photos/IMG_0001.jpg", "lat": 45.8301, "lon": 9.4132 } ]
}
```

Ogni `file` è un percorso dentro `photos/` ed è una voce del contenitore; `lat`/`lon`
sono opzionali. `RB.validateMedia(manifest, names)` confronta il manifest con le voci reali dello
ZIP: un file elencato che non c'è è un errore; un file in `photos/` non elencato (senza posizione),
una chiave diversa da `photos` o una voce sconosciuta nello ZIP è un *warning*. Senza `media.json`
non ci sono foto geotaggate.

---

## 13. Il validatore (`/validator/`)

[`/validator/`](../public/validator/index.html) controlla un file contro ogni regola di questo
documento, **nel browser**: niente viene caricato né salvato. Si trascina o si sceglie un `.rdbk` (o
un `roadbook.json` nudo); `RBZip.inspect` lo apre, `RB.validateRoadbook` giudica `roadbook.json` e
`RB.validateMedia` i media del contenitore — le stesse funzioni con cui ogni superficie legge un
roadbook, quindi ciò che passa qui si apre ovunque. La pagina mostra il verdetto, i dati del file
(contenitore, titolo, note, distanza, punti di traccia, simboli, foto, note vocali) e gli errori e i
warning (i primi 100 di ciascuno), ognuno con il suo percorso esatto (`notes[3].symbols[0].name`).
È linkata dal footer (gruppo *Resources*, `fa-file-circle-check`), da `/standard` (CTA e sezione
conformità) ed è nella sitemap.

Il rapporto di `validateRoadbook` / `validateMedia` è `{ valid, errors, warnings }`, ogni voce
`{ path, message, values? }` — `message` è una stringa sorgente inglese tradotta via `RBt`, con
`{values}` sostituito da `values`. Un warning non rende mai invalido un file.

**Errori** (tra gli altri): `rdbk_version` diverso da `1`; `meta.title` mancante o vuoto; `track`
con meno di 2 punti o coordinate fuori intervallo; `notes` vuota; un `track_index` fuori traccia o non
crescente; un valore fuori dominio (`road_type` non 1–5, `cap` non intero 0–359, `cap_type` senza
`cap`, `danger` non 1–3, `waypoint_type` sconosciuto, raggi non interi positivi); un simbolo il cui
`name` non è nella libreria; `map_allowed` o `imported_tulip.shown` diversi da `false`; un data URI
malformato; un blocco senza immagine né testo. **Warning:** una chiave sconosciuta; un valore al suo
default (`text: ""`, `road_type: 2`, `cap_type: "exit"`, `angle: 0`, `mirrored: false`).

---

## 14. Chi legge e chi scrive nell'app

- **Lettura.** Ogni superficie passa il documento a `RB.readRoadbook(doc)`: valida, e su un documento
  non valido lancia `This file is not a valid .rdbk roadbook.` con il rapporto in `error.report`;
  altrimenti clona, completa i default in memoria (testo, strada, simboli, incroci,
  `imported_tulip.shown`) e chiama `recomputeMetrics`. Un file **Roadbook Suite** (il JSON di un
  altro programma: chiavi italiane `titolo`/`testo`/`bivio`…, senza `rdbk_version`) viene invece
  importato da `importSuiteRoadbook` e richiede una traccia.
- **Scrittura.** Export `.rdbk` e salvataggio sul server passano per `RB.writeRoadbook(rb)`; l'Editor
  valida il documento scritto con `RB.validateRoadbook` prima di salvarlo o esportarlo (`rdbkDocument`) e, se non passa, mostra i primi errori invece di scriverlo. I checkpoint locali
  conservano invece il roadbook in memoria (valori derivati compresi).
- **Server.** `rb_save` accetta solo un documento `.rdbk` 1 strutturalmente valido
  (`rb_valid_document`: versione, titolo, traccia di almeno 2 punti reali, note con `track_index`
  crescente, `symbols` una mappa), altrimenti fallisce con `This file is not a valid .rdbk
  roadbook.`; calcola da sé `total_distance` (`rb_track_length`) e `note_count`, e conserva il
  documento così come l'ha ricevuto. `rb_read_payload` ritorna il documento salvato, o `null` per una
  bozza di registrazione che non ha ancora un file (`filename = 'pending'`): per quella l'Editor parte
  da `RB.newRoadbook(title, [], [])` con il `title` restituito da `rb_get`.
- **Checkpoint locali.** La bozza dell'Editor (`rb_editor_draft`) e il roadbook della run del Reader
  (`rb_session_roadbook`) sono offerti/ripristinati solo se `rb.rdbk_version === RB.FORMAT_VERSION`;
  `RB.pendingWork` applica la stessa verifica.

---

## 15. Conformità

- Un `.rdbk` è un contenitore ZIP con dentro un `roadbook.json` UTF-8; estensione `.rdbk`, media type
  `application/x-roadbook`.
- Un **reader** conforme DEVE rifiutare un file di cui non conosce la `rdbk_version`, calcolare i
  valori derivati come definiti in [§7](#7-valori-derivati) e disegnare ogni strada col suo tratto.
- Un **writer** conforme DEVE incorporare ogni simbolo che le sue note usano, NON DEVE scrivere un
  valore derivato e DOVREBBE omettere ogni valore al suo default.
- Una chiave che il reader non conosce si ignora; i blocchi `compatibility` si conservano nel
  round-trip.
- Un reader conforme DEVE rendere i `blocks` di una nota attorno a essa — prima o dopo, in ordine — e
  NON DEVE numerarli, metterli sulla mappa, valutarli o emetterli come waypoint GPX/KMZ; una nota
  vocale la riproduce `lead_distance` metri prima della nota.
- Il [validatore](#13-il-validatore-validator) controlla un file contro tutte queste regole.

---

## 16. Esempio completo (minimo, `roadbook.json`)

Passa `RB.validateRoadbook` senza errori né warning:

```json
{
  "rdbk_version": 1,
  "meta": { "title": "Demo loop", "author": "Alex Driver", "modified": "2026-09-25", "generator": "RDBK.app" },
  "track": [
    { "lat": 45.8271, "lon": 9.4116 },
    { "lat": 45.829, "lon": 9.4135 },
    { "lat": 45.8305, "lon": 9.415 }
  ],
  "notes": [
    { "track_index": 0, "text": "Start", "waypoint_type": "start" },
    { "track_index": 1, "text": "Tieni la sinistra sull'asfalto", "road_type": 1, "cap": 35,
      "junctions": [ { "from": [0, 0], "to": [45, 25], "road_type": 4 } ] },
    { "track_index": 2, "text": "Finish", "waypoint_type": "finish",
      "symbols": [ { "name": "I01_arrivo.png", "position": [0, 0], "size": 40 } ] }
  ],
  "symbols": { "I01_arrivo.png": "data:image/png;base64,iVBORw0KGgoAAAANS…" }
}
```

In memoria, dopo `RB.readRoadbook`, la seconda nota ha `num: 2`, `lat`/`lon` del punto 1,
`distance`/`partial_distance` pari alla lunghezza del primo segmento, `road_type_in: 2` (la strada
della prima nota), `cap_distance` in linea retta fino alla terza, e `meta.note_count: 3`.

---

## 17. Cosa NON contiene `roadbook.json`

- **Nessun valore derivato** (§7): né distanze, né rilevamenti, né numeri di nota, né conteggi.
- **Nessuna foto della galleria.** Le foto geotaggate sono voci del contenitore (`photos/` +
  `media.json`), incluse solo quando chi esporta le sceglie. (Le immagini e l'audio dei `blocks`, il
  `logo` e i simboli sono invece data URI dentro il documento.)
- **Nessun dato personale** oltre a ciò che l'autore scrive in `meta.author`/`organization`.
- **Nessun risultato di gara.** Il token risultato firmato che il Reader emette in competizione non
  fa parte del file: è documentato in [ranking-model.md](ranking-model.md).

---

## 18. Limiti

- **Nessun importer di altre forme `.rdbk`.** Un documento senza `rdbk_version: 1` (e che non sia un
  file Roadbook Suite) è rifiutato con il rapporto del validatore: l'app non legge altre versioni.
- **Le foto viaggiano solo se incluse all'export**, e solo con le coordinate: `media.json` non lega
  una foto a una nota specifica, né porta didascalie o orari.
- **Il server controlla solo la struttura.** `rb_valid_document` verifica versione, titolo, traccia,
  ordine delle note e forma di `symbols`; la validazione completa (domini dei valori, simboli
  incorporati) la fa il client con `RB.validateRoadbook` prima di salvare.
- **Una nota per punto di traccia.** I `track_index` sono strettamente crescenti: due note nello
  stesso punto richiedono un punto in più sulla traccia.
- **`road_type` ha 5 valori** e codifica il tratto, non attributi reali della strada (larghezza,
  fondo specifico).
- **`danger` è una scala 1–3** di gravità, non una tipologia di pericolo.
- **`cap`/`cap_distance` sono per nota e in linea retta**: un singolo rilevamento verso la nota
  successiva, non una sequenza di sub-rilevamenti.
- **Nessuna struttura di zona.** Una zona (velocità, neutralizzazione, transfer…) è una nota di
  inizio più una nota di fine (`waypoint_type` `dz`/`fz`, `dn`/`fn`, `dt`/`ft`; `speed_limit_kmh` e
  `0`): la coerenza la segnala l'Editor (`RB.consistencyReport`), non il validatore.
