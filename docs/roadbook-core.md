# roadbook-core.js — la libreria backbone

Il modulo condiviso da **tutte** le pagine di RDBK.app. È un'unica IIFE che espone il globale
`window.RB` (e, per i test Node, `module.exports`). Dentro ci sono il modello dati del
roadbook, la matematica geografica, il parsing di GPX/WPT, la costruzione del roadbook, i
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
| `ROAD_TYPES`      | tabella dei 5 tipi di strada (§2) |
| `CONST`           | costanti di punteggio e larghezze META (§2) |
| `geo`             | `{ haversineM, bearingDeg, destPoint }` (§3) |
| `parseGPX`, `parseWPT`, `parseOpenRally` | parser di import (§4) |
| `buildRoadbook`, `importRoadbook` | costruzione/normalizzazione del roadbook (§5) |
| `recomputeMetrics`, `recomputeCaps`, `normalizeRoadTypes` | ricalcoli (§6) |
| `cumulativeM`, `deriveBearings` | distanza cumulativa / bearing in-out a un indice (§5-6) |
| `speedLimitOfNote`, `speedLimitFromName` | limite di velocità in vigore / da nome icona (§8) |
| `simplifyRoadbook`, `reverseRoadbook`, `nearestOnTrack` | operazioni traccia (§7) |
| `gpxDocument`, `kmlDocument`, `openRallyDocument`, `appWaypointSymbol` | serializzatori GPX / KML / OpenRally (§7) |
| `WP_TYPES`, `wpType`, `wpTypesForProfile`, `wpBadgeSVG`, `detectionRadius`, `appwptFromImport` | tipizzazione waypoint FIA + raggio di rilevamento + mapping tipi da OpenRally (`openrally:type` → `wp_type`) |
| `ROADBOOK_STATUSES`, `roadbookStatus` | stato di pubblicazione (draft/ready/public) |
| **scoring** — `scoredNoteSet`, `isScoredIdx`, `validationPenalties`, `speedPenalty`, `skipPenalty`, `rankEntry`, `speedBand` | motore di punteggio condiviso Reader↔Ranking (vedi [ranking-model.md](ranking-model.md)) |
| `hhmmss`, `ddmmyy`, `parseHms` | codec orari del payload META |
| `buildMeta`, `parseMeta`, `signMeta`, `verifyMeta` | payload e firma del risultato (§9) |
| `iconSrc`         | risoluzione sorgente di un'icona (§10) |
| `tulipToDataURL`  | converte il tulip SVG di una nota in data URI PNG (usato per esportazione/embedding) |
| `filterByText`, `filterRoadbooks` | filtro testuale generico / di una lista di roadbook (§11) |
| `deleteNote` | elimina una nota e il suo vertice di traccia (§11) |
| `pendingWork` | scansione del lavoro non salvato tra i tool (§11) |
| `recJunkFix`, `recStepM` | soglia scarto fix / passo di campionamento della registrazione live |
| `nearestIdx`, `nearestIdxByTime`, `resolveIdx`, `round6`, `slug`, `urlToDataURL`, `pad2` | helper vari (§5, §11) |

Quasi tutte le funzioni di mutazione (`recompute*`, `simplify*`, `reverse*`, `importRoadbook`,
`normalizeRoadTypes`) **modificano l'oggetto `rb` in-place** e lo restituiscono per
concatenazione: non producono una copia.

---

## 2. Costanti (`ROAD_TYPES`, `CONST`)

`ROAD_TYPES` è la tabella dei 5 tipi di strada, usata per disegnare (colore del tratto nella
vignetta e larghezza della linea sulla mappa) e come `id` nel modello nota (`road_type_in` /
`road_type_out`). Le larghezze del *tulip* sono invece in `ROAD_STYLE` di note-canvas (§ nota).

| id | tipo       | colore     | tratteggiato |
|:--:|------------|------------|:------------:|
| 0  | default    | `#9aa4b2`  | no  |
| 1  | autostrada | `#3b82f6`  | no  |
| 2  | asfalto    | `#22c55e`  | no  |
| 3  | sterrato   | `#ff5a45`  | no  |
| 4  | fuoripista | `#ff5a45`  | **sì** |

`CONST` raccoglie le costanti che **Reader e Ranking devono condividere** per essere d'accordo
sul punteggio:

| Chiave             | Valore | Significato |
|--------------------|:------:|-------------|
| `MANUAL_RADIUS_M`  | 100    | raggio di "armamento" per il calcolo dell'overshoot |
| `MIN_DISP_M`       | 5      | spostamento minimo considerato (filtro deriva GPS) |
| `REACH_DEFAULT_M`  | 30     | raggio di rilevamento di default (geofence del Reader) |
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
[`EARTH_RADIUS_M = 6371000`](../public/assets/js/roadbook-core.js#L8)):

- [`haversineM(a, b)`](../public/assets/js/roadbook-core.js#L15) — distanza in metri tra due
  `{lat, lon}` con la formula dell'emisenoverso (haversine).
- [`bearingDeg(a, b)`](../public/assets/js/roadbook-core.js#L22) — rilevamento bussola `a→b`
  in gradi `[0,360)`.
- [`destPoint(lat, lon, heading, distM)`](../public/assets/js/roadbook-core.js#L29) — punto di
  destinazione partendo da `(lat,lon)` lungo `heading` per `distM` metri; ritorna `{lat, lon}`.

Helper interni non esportati: `toRad`, `toDeg`, `normDeg`.

---

## 4. Parsing di import (`parseGPX`, `parseWPT`)

[`parseGPX(text)`](../public/assets/js/roadbook-core.js#L56) usa `DOMParser` e lancia se l'XML
è malformato. Estrae:
- il `name` (da `trk > name` o `metadata > name`);
- i `trkpts` (ognuno con `lat`, `lon`, `ele` se finito, `time`, `cmt`);
- i `wpts`: i `<wpt>` veri e propri **oppure**, se non ce ne sono, ogni `<trkpt>` il cui `<cmt>`
  inizia per `wpt` (caso comune in alcuni esportatori).

[`parseWPT(text)`](../public/assets/js/roadbook-core.js#L103) legge il formato Garmin `.wpt`:
righe che iniziano per `W`, prende le **ultime due** coppie decimali come `lat`/`lon` e applica
il segno secondo le lettere di emisfero (`S` → lat negativa, `W` o `O` → lon negativa — `O` per
"Ovest"/"Oeste").

Due helper sul nome del waypoint:
- [`numFromName(s)`](../public/assets/js/roadbook-core.js#L91) — primo gruppo di cifre del nome,
  come numero (o `null`).
- [`wptText(w)`](../public/assets/js/roadbook-core.js#L97) — il **testo nota**: ritorna
  `w.text` se presente, altrimenti il `name` **solo se è contenuto reale**; le etichette
  autogenerate (`wptN`, `start`, `end`, numeri puri) diventano stringa vuota.

---

## 5. Costruzione del roadbook (`buildRoadbook`)

`buildRoadbook({ name, trkpts, wpts })` trasforma traccia + waypoint nel JSON canonico del
roadbook. Lancia se i punti traccia sono meno di 2.

Passaggi:
1. `cumulativeM(trkpts)` calcola la distanza cumulativa (metri) ad ogni punto; l'ultima è
   `total_distance`.
2. **Garantisce una nota di partenza e una di arrivo**: se nessun waypoint cade sul primo
   punto traccia ne aggiunge uno `start`/`num 0`, idem per l'ultimo (`end`/`num 9999`).
3. Risolve l'indice traccia di ogni waypoint con `resolveIdx(trkpts, pt)` — **il punto più
   vicino nel TEMPO** quando sia il waypoint sia la traccia portano un timestamp (`t`),
   altrimenti il più vicino per posizione (`nearestIdx`, haversine) — poi li **ordina** per
   `idx` e **deduplica** i waypoint che cadono sullo stesso indice. (La stessa `resolveIdx`
   individua anche start/end.)
4. Per ogni nota deriva `num` (riprogressivo), `distance`, `partial_distance`, `lat`/`lon` dal
   punto traccia, `bearing_in`/`bearing_out` (via `deriveBearings`), e il testo via `wptText`.

Il **modello nota** prodotto:

| Campo | Origine in `buildRoadbook` |
|-------|----------------------------|
| `num` | `i + 1` (progressivo dopo l'ordinamento) |
| `idx` | indice nel `track[]` |
| `distance` | `cum[idx]` arrotondato (metri dal via) |
| `partial_distance` | distanza dalla nota precedente (`max(0, …)`, metri) |
| `lat`, `lon` | dal punto traccia, `round6` |
| `text` | `wptText(w)` |
| `cap`, `cap_distance` | `null` (il CAP è autoriale, non dedotto in costruzione) |
| `bearing_in` | rilevamento dal punto precedente (o successivo per la nota 0) |
| `bearing_out` | rilevamento verso il punto successivo (o = `bearing_in` all'ultimo) |
| `road_type_in`, `road_type_out` | **3 (sterrato) di default** |
| `junctions`, `icons` | `null` / `[]` |

Il `track[]` salvato porta `ele` (intero) solo dove l'elevazione è finita.

`importRoadbook(rb)` normalizza un file appena caricato nello schema canonico. È un **importer
permanente e intenzionale** (non back-compat cruft): oltre a rinominare le chiavi italiane
(`titolo → title`, `km_totali → total_distance` in km → metri, `testo → text`) e a riempire i
default strutturali (`meta`, `icons`, `junctions: null`), fa la **conversione completa dei file
Roadbook Suite**: `bivio → junctions` con flip dell'asse y, flip di ancoraggio/asse delle icone,
remap via `SUITE_ICON_ALIASES`, conversione di `km_prog/km_parz/cap_hdr/cap_km`, `recomputeMetrics`
per i file Suite, e il tagging del limite di velocità → `speed_limit`/`wp_type` (#94). È
**idempotente**: un file già canonico passa invariato.

---

## 6. Ricalcoli (`recomputeMetrics`, `recomputeCaps`, `normalizeRoadTypes`)

Da eseguire dopo ogni modifica/splice perché le metriche derivate restino coerenti con la traccia.

[`recomputeMetrics(rb)`](../public/assets/js/roadbook-core.js#L208):
- riordina le note per `idx`;
- per ogni nota ricalcola `num`, clampa `idx` ai limiti della traccia, riallinea `lat`/`lon`,
  `distance`, `partial_distance` e i bearing **dalla traccia**;
- richiama `normalizeRoadTypes`;
- aggiorna `meta.total_distance` e `meta.note_count`.

[`normalizeRoadTypes(rb)`](../public/assets/js/roadbook-core.js#L203) impone l'invariante:
**`road_type_in` è sempre il `road_type_out` della nota precedente** (la prima nota arriva sulla
strada da cui parte). Solo `road_type_out` è autoriale per nota: la strada "continua" finché una
nota non la cambia.

[`recomputeCaps(rb)`](../public/assets/js/roadbook-core.js#L229) ricalcola il CAP rosso **solo
dove è già attivo** (`cap != null` ed esiste la nota successiva): `cap` = rilevamento verso la
nota seguente, `cap_distance` = distanza in linea d'aria in metri. Non *crea* CAP dove non c'è.

---

## 7. Operazioni sulla traccia ed export GPX

**Interna (non esportata su `window.RB`):**
[`simplifyTrack(trkpts, toleranceM, keepIdx)`](../public/assets/js/roadbook-core.js#L240) —
Douglas-Peucker con tolleranza in **metri**, implementazione **iterativa** (stack, niente limite
di ricorsione) su una proiezione equirettangolare locale. Gli indici elencati in `keepIdx`
(le ancore delle note) e i due estremi **sopravvivono sempre**. Usata da `simplifyRoadbook`.

[`simplifyRoadbook(rb, toleranceM)`](../public/assets/js/roadbook-core.js#L285) — semplifica
`rb.track` proteggendo gli `idx` delle note, poi ri-ancora ogni nota al punto più vicino e
richiama `recomputeMetrics` + `recomputeCaps`.

[`reverseRoadbook(rb)`](../public/assets/js/roadbook-core.js#L295) — inverte il senso di marcia:
ribalta la traccia, ri-mappa ogni `idx` (`last - idx`), scambia `road_type_out ← road_type_in`,
poi ricalcola metriche e CAP (che `normalizeRoadTypes` rideriva `road_type_in`).

[`nearestOnTrack(trkpts, pt)`](../public/assets/js/roadbook-core.js#L268) — posizione più vicina
**sulla polilinea** (non solo su un vertice): ritorna il segmento `i`, la frazione `t` lungo di
esso, il punto proiettato `lat`/`lon` e la distanza in metri. Usata dagli strumenti di editing.

[`gpxDocument(name, pts, wpts)`](../public/assets/js/roadbook-core.js#L303) — serializza un GPX
1.1 (`creator="RDBK.app"`): una `<trk>` (i punti possono portare `ele` e `t` → `<time>` ISO) più
eventuali `<wpt>` con nome. Tutto il testo è XML-escaped. Usato anche dal logger GPX del Reader.

---

## 8. Limiti di velocità (`speedLimitFromName`, `speedLimitOfNote`)

Il limite è **dichiarativo** sul campo `note.speed_limit`, con le icone come fallback:
- `speedLimitFromName(name)` — `S99_end` → `0` (limite revocato); `S01_10km`/`S03_30km`/… → il
  numero (`10`, `30`, …); altrimenti `null`.
- `speedLimitOfNote(note)` — ritorna prima `note.speed_limit` se presente (`0` = revocato),
  altrimenti scorre le icone della nota e ritorna l'ultimo limite trovato (`null` = nessuno).
  Entrambe sono esportate.

---

## 9. Payload del risultato (`buildMeta`/`parseMeta`)

Il "ponte" tra Reader e Ranking è una stringa META a **larghezza fissa di 49 caratteri**, tutta
numerica. I campi e l'ordine sono definiti da
[`META_KEYS`](../public/assets/js/roadbook-core.js#L325) +
[`CONST.META_WIDTHS`](../public/assets/js/roadbook-core.js#L52):
`team(3) date(6) start(6) end(6) accuracy(4) skip(4) extra(4) cap(4) speed(4) km(5) avg(3)`.

[`buildMeta(f)`](../public/assets/js/roadbook-core.js#L326) impacchetta i campi numerici:
**clampa i negativi a 0**, **satura a tutti-9** in overflow (così un `-` o un troncamento a
sinistra non possono corrompere la stringa) e `padStart` a 0 per ripristinare gli zeri iniziali
(date/start/end). [`parseMeta(str)`](../public/assets/js/roadbook-core.js#L338) fa l'inverso,
ritagliando per larghezza.

Per il significato preciso di ogni campo, la codifica di `km`/`avg` (decimi) e da dove vengono le
penalità, vedi [docs/ranking-model.md §2–3](ranking-model.md).

---

## 10. Firma del risultato (`signMeta`/`verifyMeta`)

[`hmacHex(msg, key)`](../public/assets/js/roadbook-core.js#L348) calcola HMAC-SHA256 via
`crypto.subtle` e lo restituisce esadecimale.
[`signMeta(meta, key)`](../public/assets/js/roadbook-core.js#L354) appende `-` + i **primi 10 hex**
della firma (e in caso di errore ritorna il `meta` nudo).
[`verifyMeta(payload, key)`](../public/assets/js/roadbook-core.js#L357) splitta sull'**ultimo** `-`,
riconfronta la firma e ritorna `{ meta, valid }`; un payload **senza** firma è `valid: false`.

La chiave (`signKey`) vive nel client (`config.js`): la firma protegge da manomissioni
**casuali/accidentali**, non da un falsario determinato. Dettagli sulla gestione lato Ranking in
[docs/ranking-model.md §6](ranking-model.md).

---

## 11. Risoluzione icone, costanti, helper

[`iconSrc(ic, rb, basePath)`](../public/assets/js/roadbook-core.js#L368) risolve la sorgente di
un'icona nell'ordine che realizza la **regola self-contained** del formato `.rdbk`:
1. `data:` URI inline → restituito così com'è;
2. la libreria embedded del roadbook (`rb.icons`, lookup **case-insensitive** sul solo basename);
3. la palette standard sotto `basePath` (`assets/icons/`).

Helper finali:
- [`round3`](../public/assets/js/roadbook-core.js#L381) / [`round6`](../public/assets/js/roadbook-core.js#L382)
  — arrotondamento a 3 / 6 decimali (angoli / coordinate). Solo `round6` è esportata.
- [`slug(s)`](../public/assets/js/roadbook-core.js#L385) — slug URL/filesystem-safe (minuscolo,
  trattini singoli, ≤60 char; default `roadbook`).
- [`pad2(n)`](../public/assets/js/roadbook-core.js#L387) — zero-padding a due cifre (nomi file
  con timestamp).
- [`urlToDataURL(url)`](../public/assets/js/roadbook-core.js#L391) — fetch (same-origin) →
  data: URI, `null` in caso di errore; serve a incorporare asset self-contained (icone nel
  `.rdbk` / nel PDF).
- [`filterByText(list, query, fields)`](../public/assets/js/roadbook-core.js#L717) — filtro
  generico: tiene gli item dove **uno qualsiasi** dei `fields` contiene `query`
  (case-insensitive); `query` vuota ritorna una **copia** della lista; null-safe.
  [`filterRoadbooks(list, query)`](../public/assets/js/roadbook-core.js#L724) ci si appoggia
  filtrando sul solo `title`. Usata dalla ricerca della lista condivisa `RBRoadbookList` e
  dalla ricerca utenti dell'admin (vedi `docs/app-shell.md`).
- [`deleteNote(rb, i)`](../public/assets/js/roadbook-core.js#L701) — elimina la nota `i`
  **e** il vertice di traccia su cui poggia, riconnettendo il percorso; le note successive
  scalano di un indice. Il vertice è mantenuto (rimozione della sola nota) se la traccia
  scenderebbe sotto i 2 punti. Ritorna l'indice del vertice rimosso, o `-1`.
- [`pendingWork(snapshot)`](../public/assets/js/roadbook-core.js#L733) — scansione del
  **lavoro non salvato** tra i tool: prende lo snapshot già parsato delle chiavi
  `localStorage` di checkpoint e ritorna un descrittore per ciascun lavoro recuperabile
  (`{ tool, url, keys[], kind, title?, noteCount?, distanceM?, noteIdx?, noteTotal? }`),
  applicando lo stesso guard "è recuperabile?" di ogni tool. Funzione pura, senza i18n: il
  guscio formatta etichetta/dettaglio. Usata dalla pillola "Unsaved work" del guscio (vedi
  `docs/app-shell.md` §7).

---

## 12. Limiti e quirk

- **Mutazione in-place.** `recompute*`, `simplify*`, `reverse*`, `importRoadbook`,
  `normalizeRoadTypes` modificano l'oggetto `rb` ricevuto. Chi ha bisogno di preservare
  l'originale deve clonarlo prima.
- **Modello sferico.** `haversineM`/`bearingDeg`/`destPoint` assumono una Terra sferica
  (raggio fisso 6371 km); va benissimo per le distanze di un roadbook, ma non è geodetico.
- **`simplifyTrack`/`nearestOnTrack` usano una proiezione equirettangolare locale** ancorata
  al primo punto (o al `pt`): su tracce molto lunghe in latitudine la distorsione cresce, ma a
  scala di roadbook è trascurabile.
- **`nearestIdx` è O(n)** su tutta la traccia ad ogni chiamata: `buildRoadbook` e
  `simplifyRoadbook` lo invocano per ogni waypoint/nota, quindi il costo è O(note × punti).
- **`road_type` default = 3 (sterrato).** Ogni roadbook costruito da GPX nasce "sterrato"
  finché l'autore non cambia i tipi.
- **Payload META rigido a 49 caratteri.** Nuovi campi non ci stanno senza ridisegnare META +
  firma e adeguare Reader e Ranking — è il vincolo chiave per estensioni future
  (vedi [docs/ranking-model.md §8](ranking-model.md)).
- **La firma è solo anti-manomissione casuale**: la chiave è nel client.
- **`importRoadbook` non valida** la struttura oltre alle rinomine: un file con `notes`/`track`
  incoerenti passa comunque (saranno i `recompute*`/il rendering a doverci convivere).
