# roadbook-core.js — la libreria backbone

Il modulo condiviso da **tutte** le pagine di RDBK.app. È un'unica IIFE che espone il globale
`window.RB` (e, per i test Node, `module.exports`). Dentro ci sono il modello dati del
roadbook e il formato `.rdbk` (lettura, scrittura, validazione), la matematica geografica, il parsing di GPX/WPT, la costruzione del roadbook, i
ricalcoli delle metriche, le operazioni sulla traccia, la serializzazione GPX/OpenRally, i
limiti di velocità, la tipizzazione dei waypoint (FIA), lo stato di pubblicazione, e —
condivise tra Reader e Ranking — il **motore di punteggio** (sezioni, penalità, `rankEntry`),
le costanti, il payload del risultato e la firma.

> Convenzione del modello dati: **tutte le distanze sono metri interi**, gli angoli sono gradi
> bussola `[0,360)` (0 = N, 90 = E). Le coordinate vengono arrotondate a 6 decimali, gli
> angoli a 3 (vedi §11).

---

## 1. L'oggetto esportato (`window.RB`)

Tutto ciò che è pubblico passa da `window.RB`. Le funzioni geo stanno in un sotto-oggetto
`RB.geo`; tutto il resto è in cima a `RB`.

| Chiave            | Cosa contiene |
|-------------------|---------------|
| `FORMAT_VERSION`  | la versione del formato `.rdbk` che il codice legge e scrive (`1`) |
| `ROAD_TYPES`, `ROAD_WIDTH`, `DOUBLE_GAP`, `DEFAULT_ROAD_TYPE`, `roadType` | i 5 tipi di strada e i loro tratti (§2) |
| `CAP_TYPES`       | i qualificatori del CAP (`exit` · `average` · `calculated` · `turning`) |
| `CONST`           | costanti di punteggio e larghezze META (§2) |
| `geo`             | `{ haversineM, bearingDeg, destPoint }` (§3) |
| `parseGPX`, `parseWPT`, `parseOpenRally` | parser di import (§4) |
| `buildRoadbook`, `newRoadbook`, `blankNote`, `trackPoint`, `trackFixes` | costruzione del roadbook, di una nota e dei punti di traccia (§5) |
| `readRoadbook`, `writeRoadbook`, `validateRoadbook`, `validateMedia` | il formato `.rdbk`: lettura, scrittura canonica, validazione (§5 · [rdbk-format.md](rdbk-format.md)) |
| `recomputeMetrics`, `recomputeCaps` | ricalcoli (§6) |
| `cumulativeM`, `deriveBearings` | distanza cumulativa / bearing in-out a un indice (§5-6) |
| `speedLimitOfNote`, `speedLimitFromName` | limite di velocità di una nota / di un cartello dal suo nome (§8) |
| `simplifyRoadbook`, `reverseRoadbook`, `joinTrack`, `nearestOnTrack`, `routeAhead`, `leftToNote` | operazioni traccia (§7) |
| `gpxDocument`, `kmlDocument`, `openRallyDocument`, `appWaypointSymbol` | serializzatori GPX / KML / OpenRally (§7) |
| `WP_TYPES`, `wpType`, `wpTypeByCap`, `wpTypesForProfile`, `wpBadgeSVG`, `detectionRadius` | tipizzazione waypoint FIA (`waypoint_type`) + raggio di rilevamento; `wpTypeByCap` traduce un codice OpenRally (`WPM`, `DZ`…) nel tipo, per l'import OpenRally |
| `appwptFromImport`, `gpxCompatibility` | l'icona Garmin/OSMAnd di un waypoint GPX importato: riportata a un simbolo RDBK, o conservata in `note.compatibility.gpx` = `{ sym, osmand_icon, osmand_color }` |
| `ROADBOOK_STATUSES`, `roadbookStatus` | stato di pubblicazione (draft/ready/public) |
| **scoring** — `scoredNoteSet`, `isScoredIdx`, `validationPenalties`, `speedPenalty`, `skipPenalty`, `rankEntry`, `speedBand` | motore di punteggio condiviso Reader↔Ranking (vedi [ranking-model.md](ranking-model.md)) |
| `hhmmss`, `ddmmyy`, `parseHms` | codec orari del payload META |
| `buildMeta`, `parseMeta`, `signMeta`, `verifyMeta` | payload e firma del risultato (§9) |
| `symbolSrc`       | l'immagine di un simbolo (§11) |
| `tulipToDataURL`  | converte il tulip SVG di una nota in data URI PNG (usato per esportazione/embedding) |
| `filterByText`, `filterRoadbooks` | filtro testuale generico / di una lista di roadbook (§11) |
| `deleteNote` | elimina una nota e il suo vertice di traccia (§11) |
| `pendingWork` | scansione del lavoro non salvato tra i tool (§11) |
| `recJunkFix`, `recStepM` | soglia scarto fix / passo di campionamento della registrazione live |
| `odometerStep` | il gate di ingresso dell'odometro: giudica un fix contro l'ultima posizione affidabile (`junk` / `noise` / `teleport` / `ok`) — vedi [gps-stack.md](./gps-stack.md) §2 |
| `isEndNote(notes, i)` | la nota di **fine** del roadbook: l'ultima nota. Il suo tulip non disegna la strada d'uscita (#447) |
| `tulipShape(rb, i, isEnd, isFirst)` | la forma che l'autore ha dato alla traccia attorno alla nota (#945): `{ entry, exit, turn }`. Nei 30 m su un lato (prima = ingresso, dopo = uscita, fermandosi alla nota vicina) 4 o più punti = strada disegnata apposta: una polilinea nel box 230×162 (ruotata su `bearing_in`, scalata a 73 px l'ingresso e 95 px l'uscita curva lungo la strada, ridotta solo per restare nel box); meno = `null`, la strada dritta classica. `turn`: l'angolo dell'uscita dritta, dove va la strada nei primi 20 m. Mai sopra la nota né sugli incroci dell'autore; mai memorizzata (vedi [note-canvas.md](note-canvas.md) §3) |
| `tulipPoints(rb, i)` | i punti della traccia dentro i 30 m della nota, per lato: `{ before, after, need }` (`null` per il lato senza strada nel tulip: prima della prima nota, dopo l'ultima) — la scheda dell'anello tratteggiato dell'Editor |
| `tulipAddPoints(rb, i, isOpen?)` | porta ogni lato a 4 punti **sulla traccia** (a 1/5, 2/5… del tratto nel cerchio, saltando dove un punto c'è già entro 1,5 m): la rotta non cambia, i `track_index` delle note si spostano, i segmenti per cui `isOpen(a, b)` (un taglio aperto) restano intatti. Ritorna quanti punti ha aggiunto |
| `tulipContext(rb, i)` | tutto ciò che serve a un render del tulip oltre alla nota: `{ isEnd, isFirst, shape }` — il `ctx` di `NoteCanvas.toSVG` e `setNote`, una chiamata per ogni renderer |
| `noteReached` | il gate di convalida automatica del Reader: la nota è raggiunta se il **segmento** percorso fra due fix entra nel raggio |
| `manualGate` | il gate della convalida **manuale**: `null` se è permessa (nessun fix, o dentro i 100 m allargati dall'accuratezza), altrimenti la distanza — che il Reader usa per dire quanto sei lontano e offrire di saltare la nota (#431) |
| `nearestIdx`, `nearestIdxByTime`, `resolveIdx`, `round6`, `slug`, `urlToDataURL`, `pad2` | helper vari (§5, §11) |

Quasi tutte le funzioni di mutazione (`recompute*`, `simplify*`, `reverse*`, `joinTrack`)
**modificano l'oggetto `rb` in-place** e lo restituiscono per
concatenazione: non producono una copia.

---

## 2. Costanti (`ROAD_TYPES`, `CONST`)

`ROAD_TYPES` è il catalogo dei 5 tipi di strada, voci `{ id, name, color, dash, double }`: i tratti
del FIA Road Book Lexicon (Cross Country, 2026), i colori della palette dell'app, il nome che ogni
controllo mostra (tradotto). È l'`id` del `road_type` di una nota e di una giunzione; `roadType(id)`
ritorna la voce (il default per un id sconosciuto), `DEFAULT_ROAD_TYPE` = `2`. Ogni strada della
vignetta è larga `ROAD_WIDTH` (8); `dash` è il tratteggio SVG nelle stesse unità, `double` divide il
tratto in due linee con un centro bianco largo `DOUBLE_GAP` (2). Il renderer è `roadMarkup` di
[note-canvas.md](note-canvas.md).

| id | nome | colore | tratto |
|:--:|------|--------|--------|
| 1 | Tarmac | `#22c55e` | doppia linea |
| 2 | Track (default) | `#ff5a45` | continuo |
| 3 | Low-visible track | `#ff5a45` | `24 8 8 8` |
| 4 | Off track | `#ff5a45` | `8 8` |
| 5 | Bike lane | `#532b78` (viola) | continuo (#561) |

`CONST` raccoglie le costanti che **Reader e Ranking devono condividere** per essere d'accordo
sul punteggio:

| Chiave             | Valore | Significato |
|--------------------|:------:|-------------|
| `MANUAL_RADIUS_M`  | 100    | raggio di "armamento" per il calcolo dell'overshoot, e gate della convalida manuale |
| `MIN_DISP_M`       | 5      | spostamento minimo considerato — pavimento del rumore quando l'accuratezza è ignota |
| `FIX_ACC_MAX_M`    | 35     | oltre questa accuratezza un fix è spazzatura: né registrato né contato |
| `MAX_SPEED_MS`     | 70     | 252 km/h: un passo più veloce di così non è mai successo (fix in cache) |
| `REACH_DEFAULT_M`  | 30     | raggio di rilevamento di default (geofence del Reader). `newRoadbook` lo scrive anche in `meta.default_validation_radius`, così il file dice quello che vale invece di lasciarlo implicito |
| `REACH_MIN_M`      | 18     | pavimento del reach: sotto si chiederebbe al GPS una precisione che non ha |
| `P_SKIP`           | 450    | penalità per nota saltata |
| `P_SPEED_PER_KMH`  | 10     | penalità per km/h di eccesso |
| `REG_GRACE_S`      | 59     | tolleranza in secondi sul ritardo (regolarità) |
| `META_WIDTHS`      | `[3,6,6,6,4,4,4,4,4,5,3]` | larghezze dei campi del payload META (§9) |

Le penalità `accuracy`/`cap`/`extra` valgono **1 punto per metro** (non c'è una costante: è
implicito nel motore del Reader). Per come queste costanti diventano un punteggio vedi
[docs/ranking-model.md](ranking-model.md).

---

## 3. Matematica geografica (`RB.geo`)

Tre funzioni pure su un modello sferico (raggio terrestre
[`EARTH_RADIUS_M = 6371000`](../public/assets/js/roadbook-core.js)):

- [`haversineM(a, b)`](../public/assets/js/roadbook-core.js) — distanza in metri tra due
  `{lat, lon}` con la formula dell'emisenoverso (haversine).
- [`bearingDeg(a, b)`](../public/assets/js/roadbook-core.js) — rilevamento bussola `a→b`
  in gradi `[0,360)`.
- [`destPoint(lat, lon, heading, distM)`](../public/assets/js/roadbook-core.js) — punto di
  destinazione partendo da `(lat,lon)` lungo `heading` per `distM` metri; ritorna `{lat, lon}`.

Helper interni non esportati: `toRad`, `toDeg`, `normDeg`.

---

## 4. Parsing di import (`parseGPX`, `parseWPT`)

[`parseGPX(text)`](../public/assets/js/roadbook-core.js) usa `DOMParser` e lancia se l'XML
è malformato. Estrae:
- il `name` (da `trk > name` o `metadata > name`);
- i `trkpts` — fix GPS con le parole del GPX (`lat`, `lon`, `ele` se finito, `t`, `cmt`), che
  `trackPoint` converte in punti di traccia (`elevation`, `time_ms`);
- i `wpts`: i `<wpt>` veri e propri **oppure**, se non ce ne sono, ogni `<trkpt>` il cui `<cmt>`
  inizia per `wpt` (caso comune in alcuni esportatori).

[`parseWPT(text)`](../public/assets/js/roadbook-core.js) legge il formato Garmin `.wpt`:
righe che iniziano per `W`, prende le **ultime due** coppie decimali come `lat`/`lon` e applica
il segno secondo le lettere di emisfero (`S` → lat negativa, `W` o `O` → lon negativa — `O` per
"Ovest"/"Oeste").

Due helper sul nome del waypoint:
- [`numFromName(s)`](../public/assets/js/roadbook-core.js) — primo gruppo di cifre del nome,
  come numero (o `null`).
- [`wptText(w)`](../public/assets/js/roadbook-core.js) — il **testo nota**: ritorna
  `w.text` se presente, altrimenti il `name` **solo se è contenuto reale**; le etichette
  autogenerate (`wptN`, `start`, `end`, numeri puri) diventano stringa vuota.

---

## 5. Costruzione del roadbook (`buildRoadbook`, `newRoadbook`, `blankNote`)

`buildRoadbook({ name, trkpts, wpts })` trasforma traccia + waypoint in un roadbook. Lancia se i punti
traccia sono meno di 2.

Passaggi:
1. **Garantisce una nota di partenza e una di arrivo**: se nessun waypoint cade sul primo
   punto traccia ne aggiunge uno `start`, idem per l'ultimo (`end`).
2. Risolve l'indice traccia di ogni waypoint con `resolveIdx(trkpts, pt)` — **il punto più
   vicino nel TEMPO** quando sia il waypoint sia la traccia portano un timestamp (`t`),
   altrimenti il più vicino per posizione (`nearestIdx`, haversine) — poi li **ordina** per
   `track_index` e **deduplica** i waypoint che cadono sullo stesso indice (una nota per punto).
3. Ogni nota nasce da `blankNote(trackIndex, DEFAULT_ROAD_TYPE)` con il testo di `wptText`, il
   simbolo riconosciuto (`symbols`), il `danger` recuperato da un `special_marker`, l'icona GPX non
   mappata in `compatibility.gpx` e il materiale (`blocks`) del waypoint.
4. `newRoadbook(name, trkpts.map(trackPoint), notes)` e `recomputeMetrics` derivano il resto.

- **`newRoadbook(title, track, notes)`** — un roadbook in memoria: `{ rdbk_version: 1, meta: { title,
  default_validation_radius: CONST.REACH_DEFAULT_M }, track, notes, symbols: {} }`. Ogni roadbook nuovo,
  qualunque sia la sua origine, parte da qui (anche lo scheletro vuoto di una bozza di registrazione:
  `newRoadbook(title, [], [])`).
- **`blankNote(trackIndex, roadType)`** — i campi autoriali di una nota ai loro default
  (`{ track_index, text: '', road_type, cap: null, symbols: [], junctions: [] }`): la forma da cui
  parte ogni strumento che aggiunge una nota; `recomputeMetrics` deriva il resto.
- **`trackPoint(fix)` / `trackFixes(track)`** — il confine tra i fix GPS (`{lat, lon, ele, t}`, le
  parole del GPX, usate dai parser, dai logger e dalle tracce delle run) e i punti di traccia del
  roadbook (`{lat, lon, elevation?, time_ms?}`, coordinate a 6 decimali). I serializzatori GPX/KML
  scrivono `trackFixes(rb.track)`.

### Il formato `.rdbk` (`readRoadbook`, `writeRoadbook`, `validateRoadbook`)

Il riferimento completo è [rdbk-format.md](rdbk-format.md). In breve:
- `validateRoadbook(doc)` → `{ valid, errors, warnings }` (ogni voce `{ path, message, values? }`): il
  solo giudice di un documento, per Reader, Editor, validatore e test.
- `readRoadbook(doc)` rifiuta ciò che il validatore rifiuta (lancia, con `error.report`), completa in
  memoria i default omessi e chiama `recomputeMetrics`. Un file Roadbook Suite (il JSON di un altro
  programma: chiavi italiane, chilometri, `bivio`) viene invece importato da `importSuiteRoadbook`:
  `bivio → junctions` con flip dell'asse y, ancoraggio/asse dei simboli, remap via
  `SUITE_ICON_ALIASES`, i codici strada della suite → i tipi FIA, e il limite letto dal cartello →
  `speed_limit_kmh` + `waypoint_type` `dz`/`fz` (#94). Richiede una traccia.
- `writeRoadbook(rb)` scrive la forma canonica: solo i campi autoriali, default omessi, chiavi in
  ordine fisso, coordinate a 6 decimali, `meta.generator = "RDBK.app"`, l'intera libreria `symbols`.
- `validateMedia(manifest, names)` giudica il `media.json` di un contenitore contro le sue voci.

### Bearing e vertici duplicati (#452)

Un bearing ha bisogno di due punti **distinti**: `bearingDeg(p, p)` è `0` (`atan2(0,0)`). Un vertice
**duplicato** accanto a una nota — si disegna sopra un punto esistente, una coppia GPS senza
movimento, un ricongiungimento — darebbe a quella nota un bearing di 0°, e siccome l'angolo
d'uscita del tulip è `bearing_out − bearing_in`, un solo valore falso sposta la freccia dove
capita: una nota che va **dritto** disegnata come **svolta secca a destra**.

Quindi `deriveBearings` non guarda il vicino immediato ma **cammina verso l'esterno fino al
primo vertice abbastanza lontano** (`BEARING_MIN_M = 1 m`) da portare una direzione. La soglia è
piccola di proposito: sistema i vicini degeneri, non prova a smussare il jitter GPS. I bearing sono
valori **derivati**: nessun file li porta, ogni reader li calcola così.

Il **modello nota in memoria** (dopo `recomputeMetrics`):

| Campo | Origine |
|-------|---------|
| `track_index` | indice nel `track[]` (autoriale) |
| `num` | `i + 1` (progressivo dopo l'ordinamento) |
| `lat`, `lon` | dal punto traccia, `round6` |
| `distance` | `cum[track_index]` arrotondato (metri dal via) |
| `partial_distance` | distanza dalla nota precedente (`max(0, …)`, metri) |
| `bearing_in` | rilevamento in arrivo (o = `bearing_out` all'inizio della traccia) |
| `bearing_out` | rilevamento in uscita (o = `bearing_in` alla fine) |
| `road_type` | autoriale; **2 (Track) di default** |
| `road_type_in` | il `road_type` della nota precedente (la prima: il proprio) |
| `cap`, `cap_distance` | `cap` autoriale (`null` = nessun CAP); `cap_distance` solo con un CAP |
| `symbols`, `junctions` | array (vuoti di default) |

## 6. Ricalcoli (`recomputeMetrics`, `recomputeCaps`)

Da eseguire dopo ogni modifica/splice perché i valori derivati restino coerenti con la traccia.

[`recomputeMetrics(rb)`](../public/assets/js/roadbook-core.js):
- riordina le note per `track_index`;
- per ogni nota clampa `track_index` ai limiti della traccia e ricalcola `num`, `lat`/`lon`,
  `distance`, `partial_distance` e i bearing **dalla traccia**;
- deriva `road_type_in`: **sempre il `road_type` della nota precedente** (la prima nota arriva sulla
  strada da cui parte). Solo `road_type` è autoriale: la strada "continua" finché una nota non la
  cambia;
- `cap_distance` = linea retta fino alla nota successiva, solo dove c'è un CAP;
- aggiorna `meta.total_distance` e `meta.note_count`.

[`recomputeCaps(rb)`](../public/assets/js/roadbook-core.js) (Editor) ripropone il CAP **solo
dove è già attivo** (`cap != null`): `cap` = rilevamento verso la nota seguente, `cap_distance` =
distanza in linea d'aria; l'ultima nota non ha una nota a cui puntare e perde il CAP. Non *crea* CAP
dove non c'è.

---

## 7. Operazioni sulla traccia ed export GPX

**Interna (non esportata su `window.RB`):** `simplifyKeepMask(trkpts, toleranceM, keepIdx)` —
Douglas-Peucker con tolleranza in **metri**, implementazione **iterativa** (stack, niente limite
di ricorsione) su una proiezione equirettangolare locale; ritorna la maschera dei vertici tenuti.
Gli indici elencati in `keepIdx` (le ancore delle note) e i due estremi **sopravvivono sempre**.

[`simplifyRoadbook(rb, toleranceM)`](../public/assets/js/roadbook-core.js) — semplifica
`rb.track` con quella maschera proteggendo i `track_index` delle note, ri-mappa ogni nota
**esattamente** sul proprio vertice (#216) e richiama `recomputeMetrics` + `recomputeCaps`.

[`reverseRoadbook(rb)`](../public/assets/js/roadbook-core.js) — inverte il senso di marcia:
ribalta la traccia, ri-mappa ogni `track_index` (`last - track_index`), dà a ogni nota come
`road_type` il suo `road_type_in`, poi ricalcola metriche e CAP (`recomputeMetrics` rideriva
`road_type_in`). Toglie gli orari (`time_ms`): letti al contrario non descrivono più una
registrazione.

`joinTrack(rb, piece, atStart)` — allunga la rotta con un'altra traccia (l'*Add GPX* dell'Editor).
`piece` è orientato col **primo** punto sull'estremità a cui si aggancia: accodato dopo l'arrivo,
o — `atStart` — anteposto alla partenza, verso di essa. Un primo punto che cade **sull'estremità**
(< 1 m) non si duplica; uno solo vicino resta, e la rotta lo raggiunge. Ogni punto aggiunto passa per `trackPoint` e **tiene `elevation` e `time_ms`** (#158), le note esistenti
restano sui loro vertici (indici spostati, non ri-ancorate nello spazio) e una nuova nota di
estremità cavalca la nuova punta.

[`nearestOnTrack(trkpts, pt)`](../public/assets/js/roadbook-core.js) — posizione più vicina
**sulla polilinea** (non solo su un vertice): ritorna il segmento `i`, la frazione `t` lungo di
esso, il punto proiettato `lat`/`lon` e la distanza in metri. Usata dagli strumenti di editing.

`routeAhead(rb, cum, i, here, hintM)` — dove si trova il pilota **lungo il percorso** rispetto
alla nota `i` (#847): il fix proiettato sulla traccia tra la nota precedente e la successiva →
`{atM, offRouteM}` (metri dall'inizio lungo la traccia GPX, la distanza dalla traccia). Se quel tratto passa due volte nello stesso posto, `hintM` (l'odometro) sceglie il
passaggio giusto. `leftToNote(rb, cum, i, here, hintM)` — quanto manca alla nota: lungo il percorso,
mai meno della linea retta. Usate dal Reader (§ Distanze in [reader.md](reader.md)).

[`gpxDocument(name, pts, wpts)`](../public/assets/js/roadbook-core.js) — serializza un GPX
1.1 (`creator="RDBK.app"`): una `<trk>` di fix (possono portare `ele` e `t` → `<time>` ISO; per un
roadbook `trackFixes(rb.track)`) più
eventuali `<wpt>` con nome. Tutto il testo è XML-escaped. Usato anche dal logger GPX del Reader.

---

## 8. Limiti di velocità (`speedLimitFromName`, `speedLimitOfNote`)

Il limite è **dichiarativo** e vive solo nel campo `note.speed_limit_kmh`:
- `speedLimitOfNote(note)` — `note.speed_limit_kmh` (`0` = revocato), `null` se assente.
- `speedLimitFromName(name)` — il limite che mostra un cartello dal suo nome: `S99_end` → `0`;
  `S01_10km`/`S03_30km`/… → il numero; altrimenti `null`. Lo usa l'Editor, che quando si imposta un
  limite tiene tra i simboli della nota esattamente un cartello `S…` corrispondente, e l'import di
  Roadbook Suite, che legge il limite dai cartelli.

---

## 9. Payload del risultato (`buildMeta`/`parseMeta`)

Il "ponte" tra Reader e Ranking è una stringa META a **larghezza fissa di 55 caratteri**: i primi
49 caratteri sono numerici, seguiti dal campo `rb` (prefisso dello slug del roadbook, 6 caratteri,
riempito con spazi — usato dal Ranking per rifiutare un QR di un altro roadbook; vedi
`RB.metaRbPrefix`). I campi e l'ordine sono definiti da
[`META_KEYS`](../public/assets/js/roadbook-core.js) +
[`CONST.META_WIDTHS`](../public/assets/js/roadbook-core.js):
`team(3) date(6) start(6) end(6) accuracy(4) skip(4) extra(4) cap(4) speed(4) km(5) avg(3) rb(6)`
(i primi 11 numerici; `rb` è testo — prefisso dello slug del roadbook).

[`buildMeta(f)`](../public/assets/js/roadbook-core.js) impacchetta i campi numerici:
**clampa i negativi a 0**, **satura a tutti-9** in overflow (così un `-` o un troncamento a
sinistra non possono corrompere la stringa) e `padStart` a 0 per ripristinare gli zeri iniziali
(date/start/end). [`parseMeta(str)`](../public/assets/js/roadbook-core.js) fa l'inverso,
ritagliando per larghezza.

Per il significato preciso di ogni campo, la codifica di `km`/`avg` (decimi) e da dove vengono le
penalità, vedi [docs/ranking-model.md §2–3](ranking-model.md).

---

## 10. Firma del risultato (`signMeta`/`verifyMeta`)

[`hmacHex(msg, key)`](../public/assets/js/roadbook-core.js) calcola HMAC-SHA256 via
`crypto.subtle` e lo restituisce esadecimale.
[`signMeta(meta, key)`](../public/assets/js/roadbook-core.js) appende `-` + i **primi 10 hex**
della firma (e in caso di errore ritorna il `meta` nudo).
[`verifyMeta(payload, key)`](../public/assets/js/roadbook-core.js) splitta sull'**ultimo** `-`,
riconfronta la firma e ritorna `{ meta, valid }`; un payload **senza** firma è `valid: false`.

La chiave (`signKey`) vive nel client (`config.js`): la firma protegge da manomissioni
**casuali/accidentali**, non da un falsario determinato. Dettagli sulla gestione lato Ranking in
[docs/ranking-model.md §6](ranking-model.md).

---

## 11. Risoluzione dei simboli, helper

[`symbolSrc(symbol, rb, basePath)`](../public/assets/js/roadbook-core.js) — l'immagine di un simbolo
di nota: la libreria del roadbook (`rb.symbols[name]`) — dove sta ogni simbolo di un file `.rdbk` —
altrimenti, mentre un roadbook è in modifica e un simbolo della palette non è ancora stato
incorporato, la palette standard sotto `basePath` (`assets/icons/`).

Helper finali:
- [`round3`](../public/assets/js/roadbook-core.js) / [`round6`](../public/assets/js/roadbook-core.js)
  — arrotondamento a 3 / 6 decimali (angoli / coordinate). Solo `round6` è esportata.
- [`slug(s)`](../public/assets/js/roadbook-core.js) — slug URL/filesystem-safe (minuscolo,
  trattini singoli, ≤60 char; default `roadbook`).
- [`pad2(n)`](../public/assets/js/roadbook-core.js) — zero-padding a due cifre (nomi file
  con timestamp).
- [`urlToDataURL(url)`](../public/assets/js/roadbook-core.js) — fetch (same-origin) →
  data: URI, `null` in caso di errore; serve a incorporare asset self-contained (simboli nel
  `.rdbk` / nel PDF).
- [`filterByText(list, query, fields)`](../public/assets/js/roadbook-core.js) — filtro
  generico: tiene gli item dove **uno qualsiasi** dei `fields` contiene `query`
  (case-insensitive); `query` vuota ritorna una **copia** della lista; null-safe.
  [`filterRoadbooks(list, query)`](../public/assets/js/roadbook-core.js) ci si appoggia
  filtrando sul solo `title`. Usata dalla ricerca della lista condivisa `RBRoadbookList` e
  dalla ricerca utenti dell'admin (vedi `docs/app-shell.md`).
- [`deleteNote(rb, i)`](../public/assets/js/roadbook-core.js) — elimina la nota `i`
  **e** il vertice di traccia su cui poggia, riconnettendo il percorso; le note successive
  scalano di un indice. Il vertice è mantenuto (rimozione della sola nota) se la traccia
  scenderebbe sotto i 2 punti. Ritorna l'indice del vertice rimosso, o `-1`.
- [`pendingWork(snapshot)`](../public/assets/js/roadbook-core.js) — scansione del
  **lavoro non salvato** tra i tool: prende lo snapshot già parsato delle chiavi
  `localStorage` di checkpoint e ritorna un descrittore per ciascun lavoro recuperabile
  (`{ tool, url, keys[], kind, title?, noteCount?, distanceM?, noteIdx?, noteTotal? }`),
  applicando lo stesso guard "è recuperabile?" di ogni tool — un checkpoint con un roadbook
  (`rb_editor_draft`, `rb_session_roadbook`) conta solo se `rdbk_version === FORMAT_VERSION`. Funzione pura, senza i18n: il
  guscio formatta etichetta/dettaglio. Usata dalla pillola "Unsaved work" del guscio (vedi
  `docs/app-shell.md` §7).

---

## 12. Limiti e quirk

- **Mutazione in-place.** `recompute*`, `simplify*`, `reverse*`, `joinTrack` modificano l'oggetto
  `rb` ricevuto (`readRoadbook` invece lavora su una copia del documento). Chi ha bisogno di preservare
  l'originale deve clonarlo prima.
- **Modello sferico.** `haversineM`/`bearingDeg`/`destPoint` assumono una Terra sferica
  (raggio fisso 6371 km); va benissimo per le distanze di un roadbook, ma non è geodetico.
- **Il simplify e `nearestOnTrack` usano una proiezione equirettangolare locale** ancorata
  al primo punto (o al `pt`): su tracce molto lunghe in latitudine la distorsione cresce, ma a
  scala di roadbook è trascurabile.
- **`nearestIdx` è O(n)** su tutta la traccia ad ogni chiamata: `buildRoadbook` e
  `simplifyRoadbook` lo invocano per ogni waypoint/nota, quindi il costo è O(note × punti).
- **`road_type` default = 2 (Track).** Ogni roadbook costruito da GPX nasce "pista" finché l'autore
  non cambia i tipi.
- **Payload META a larghezza fissa (55 caratteri).** Ogni nuovo campo va aggiunto a `META_KEYS`
  + `META_WIDTHS` insieme (allarga il payload) e va adeguato sia il Reader che il Ranking — è il
  vincolo chiave per estensioni future (vedi [docs/ranking-model.md §8](ranking-model.md)). Il
  campo `rb` è **stringa** (riempita con spazi), non numerico: `verifyMeta` NON deve fare trim del
  META, altrimenti il padding del campo `rb` sparisce prima del ricalcolo HMAC e ogni firma fallisce.
- **La firma è solo anti-manomissione casuale**: la chiave è nel client.
- **Nessun importer di altre forme `.rdbk`.** `readRoadbook` legge solo `rdbk_version: 1` (e i file
  Roadbook Suite); qualsiasi altro documento è rifiutato con il rapporto del validatore.
