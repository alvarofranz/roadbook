# Home page e cover dei roadbook

Come la **home** mostra i roadbook pubblici e come ogni roadbook ottiene la sua **cover**
(l'immagine usata come miniatura): una mappa statica con la rotta disegnata sopra le tile.

> La galleria della home è una IIFE in [home.js](../public/assets/js/home.js); la generazione
> della cover è in [cover-map.js](../public/assets/js/cover-map.js), innescata al salvataggio
> dall'[Editor](editor.md). Il lato server (storage + liste) è nell'API PHP — vedi
> [backend-api](backend-api.md). Niente MapLibre/WebGL e nessuna nuova migrazione DB.

---

## 1. La galleria della home (`home.js`)

La sezione "Public Roadbooks" della home è un **teaser**: i 6 roadbook pubblici più recenti.
La lista completa con ricerca + paginazione vive in `/roadbooks` ([challenges](challenges.md)).

Flusso ([home.js:65](../public/assets/js/home.js#L65)):
1. `RBChallenges.listPublic()` → `public_list` dell'API restituisce i roadbook pubblici
   (`WHERE is_public = 1 AND slug IS NOT NULL`, ordinati per `updated_at`, max 60) con per
   ciascuno `slug · title · total_distance · note_count · username · thumb`.
2. `render()` ([home.js:32](../public/assets/js/home.js#L32)) costruisce una `.gallery-card`
   per roadbook, linkata a `/challenge/<slug>`.

**La miniatura** di ogni card, in ordine di preferenza:
- **`thumb`** — l'URL immagine restituito da `public_list`. È la **cover** del roadbook quando
  esiste (vedi §2), altrimenti la prima foto reale della galleria. Mostrato come `<img>`.
- **fallback** — se `thumb` è assente (roadbook mai salvato dopo l'introduzione della cover, o
  senza foto), si disegna al volo un SVG leggero della **sola** polilinea della rotta
  (`routeSvg`, [home.js:16](../public/assets/js/home.js#L16)): nessuna tile, nessun basemap.
  La traccia viene presa caricando il roadbook una sola volta (`fillRoutes`,
  [home.js:48](../public/assets/js/home.js#L48), lazy e cache-ata per slug).
- Se il roadbook nasconde la mappa (`meta.map_access === false`) il fallback **non** rivela la
  forma della rotta: resta l'icona segnaposto.

> La home **non** decide cosa è pubblico: elenca solo ciò che `public_list` ritorna, che filtra
> già `is_public = 1`. Vedi [backend-api](backend-api.md).

## 2. Generazione della cover (`cover-map.js` + salvataggio Editor)

La cover è una **mappa statica della rotta**: la polilinea (rossa, `#ff5a45`) sopra tile raster
CyclOSM, composta su un `<canvas>` ed esportata in PNG. **Nessun marker di waypoint, nessuna
zona** — solo la rotta sulla mappa.

`RBCoverMap.capture(track, opts)` ([cover-map.js:15](../public/assets/js/cover-map.js#L15)):
1. Proietta la traccia in **Web-Mercator** (la proiezione delle tile) e ne calcola il bounding
   box.
2. Sceglie lo **zoom** più alto che fa stare il bbox (più padding) nel box `1200×750`.
3. Scarica le tile che coprono il box (`crossOrigin = 'anonymous'`) e le disegna sul canvas; poi
   disegna la rotta (alone scuro sotto per contrasto + tratto rosso sopra), i pallini
   **start (verde) / finish (rosso)** e il credito "© OpenStreetMap, CyclOSM".
4. `canvas.toBlob(...,'image/png')` → `Blob` ([cover-map.js:61](../public/assets/js/cover-map.js#L61)).
   Ritorna `null` per traccia mancante/degenere (un solo punto) o se l'export fallisce.

Le tile CyclOSM/ESRI rispondono con `Access-Control-Allow-Origin: *`, quindi il canvas **non si
"taint-a"** e l'export funziona.

**Innesco** ([editor.js:964](../public/editor/editor.js#L964)): dopo un `Save to profile`
riuscito (`r.ok && currentRbId > 0`, [editor.js:960](../public/editor/editor.js#L960)),
`updateCover()` genera il PNG e lo carica con `RBUpload({ type: 'cover', roadbook })`. È
**best-effort e non bloccante**: se la cattura o l'upload falliscono, il salvataggio non ne
risente — la card userà semplicemente il fallback.

## 3. Storage e liste (lato server)

La cover **non** è uno storage a parte: è una **voce riservata della galleria foto** del
roadbook, con nome fisso **`_map.avif`**, sovrascritta a ogni salvataggio.

- **Upload** ([upload.php:73](../public/api/upload.php#L73), `type=cover`): verifica la
  proprietà del roadbook, ricomprime il PNG in AVIF (`process_to_avif`, max 1200px) su
  `photos/<id>/_map.avif`, e fa l'**upsert** di una sola riga `roadbook_photos` con
  `sort = -1`.
- **Miniatura** (`public_list`, [roadbooks.php:209](../app/roadbooks.php#L209)): la subquery del
  `thumb` ordina `sort, id` → con `sort = -1` la cover è **sempre** la prima, quindi la
  miniatura. Senza cover ricade sulla prima foto reale.
- **Esclusa dallo swipe**: `public_get`
  ([roadbooks.php:237](../app/roadbooks.php#L237)) e `ph_list`
  ([roadbooks.php:151](../app/roadbooks.php#L151)) filtrano `filename <> '_map.avif'`, così la
  cover non compare tra le foto utente né nell'editor. `public_get` la restituisce a parte nel
  campo **`cover`** ([roadbooks.php:240](../app/roadbooks.php#L240)).

In sintesi: **cover-only** (fuori dalla galleria), **sempre la miniatura**, base **CyclOSM**.

## 4. Ciclo di vita

- È **generate-at-save**: i roadbook esistenti **non** hanno una cover finché non vengono
  **risalvati**; fino ad allora la home usa il fallback (linea sola / icona).
- I file vivono sotto `public/photos/<id>/` (git-ignored, volume-backed), persistono tra i
  deploy e **non** sono nel `.rdbk` — la cover è una feature app/server, come le foto.

## Limiti / quirk (onesti)

- **OG image** — `public_get` espone `cover`, ma `/challenge/<slug>` è renderizzato lato client,
  quindi i crawler social non vedono `og:image` senza prerender. Follow-up separato.
- **Niente icone** sulla cover (waypoint numerati, badge DZ/FZ): scelta voluta, solo rotta.
- **Backfill** — per popolare le cover dei roadbook già esistenti serve risalvarli (la
  generazione è client-side, per-proprietario); non c'è un backfill server-side.
- **`public_list` elenca per riga DB**, senza verificare che il file `.rdbk` esista: in locale
  (DB di prod ma file non sincronizzati) può mostrare card che poi danno "non esiste o è
  privato" all'apertura; in produzione i file ci sono.
