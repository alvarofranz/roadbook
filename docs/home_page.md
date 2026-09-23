# Home page e cover dei roadbook

Come la **home** mostra i roadbook pubblici e come ogni roadbook ottiene la sua **cover**
(l'immagine usata come miniatura): una mappa statica con la rotta disegnata sopra le tile.

> La galleria della home è una IIFE in [home.js](../public/assets/js/home.js); la generazione
> della cover è in [cover-map.js](../public/assets/js/cover-map.js), innescata al salvataggio
> dall'[Editor](editor.md). Il lato server (storage + liste) è nell'API PHP — vedi
> [backend-api](backend-api.md). Niente MapLibre/WebGL e nessuna nuova migrazione DB.

---

## 0. Le due home (#720)

- **Web** (`.web-only`): hero con i badge ufficiali **App Store** / **Google Play** (`RBGetAppHTML`,
  da `RBStore`, dentro ogni `[data-get-app]`) e *Start in the browser*; il flusso in quattro passi;
  la banda *Install it on any device* (badge + web app per computer + nota GPS); le funzioni; la
  banda della guida; la galleria. Il chip **Install** esiste solo sul web e apre `/install/`.
- **App** (`.app-only`): una home da app — saluto `@utente`, la grande azione *Record a route*, tre
  accessi rapidi (Navigate · Editor · Events), gli ultimi 4 roadbook dell'utente con *Navigate* /
  modifica (`rb_list`), o l'invito ad accedere; poi i pubblici come carosello orizzontale.
  Nessun pie' di versione: App Info (menu del profilo) mostra binario, contenuto web e live.

## 1. La galleria della home (`home.js`)

La sezione "Public roadbooks" della home è un **teaser**: i 6 roadbook pubblici più recenti.
La lista completa con ricerca + paginazione vive in `/roadbooks` ([challenges](challenges.md)).

Flusso ([home.js:65](../public/assets/js/home.js#L65)):
1. `RBChallenges.listPublic()` → `public_list` dell'API restituisce i roadbook pubblici
   (`WHERE status = 'public' AND slug IS NOT NULL`, ordinati per `updated_at`, max 60) con per
   ciascuno `slug · title · total_distance · note_count · username · thumb`.
2. `render()` costruisce una card per roadbook con la card condivisa **`RBRoadbookCard`**
   (`.gallery-card`, #770), linkata a `/challenge/<slug>`.

**La miniatura** di ogni card, in ordine di preferenza:
- **`thumb`** — l'URL immagine restituito da `public_list`. È la **cover** del roadbook quando
  esiste (vedi §2), altrimenti la prima foto reale della galleria. Mostrato come `<img>`.
- **fallback** — se `thumb` è assente (roadbook mai salvato dopo l'introduzione della cover, o
  senza foto), si disegna al volo un SVG leggero della **sola** polilinea della rotta
  (`RBFillRoutes` in `app.js`, condiviso da ogni galleria): nessuna tile, nessun basemap. La traccia
  viene presa caricando il roadbook una sola volta, lazy e cache-ata per slug.
- Se il roadbook nasconde la mappa (`meta.map_access === false`) il fallback **non** rivela la
  forma della rotta: resta l'icona segnaposto.

> La home **non** decide cosa è pubblico: elenca solo ciò che `public_list` ritorna, che filtra
> già `status = 'public'`. Vedi [backend-api](backend-api.md).

## 2. Generazione della cover (`cover-map.js` + salvataggio Editor)

La cover è una **mappa statica della rotta**: la polilinea (rossa, `#ff5a45`) sopra tile raster
CyclOSM, composta su un `<canvas>` ed esportata in PNG. **Nessun marker di waypoint, nessuna
zona** — solo la rotta sulla mappa.

`RBCoverMap.capture(track, opts)` è `render(track, opts)` — che restituisce il canvas, e serve anche
alla card della run (#785) con i marker delle note e un riquadro con margini diversi per lato —
seguito da `toBlob`:
1. Proietta la traccia in **Web-Mercator** (la proiezione delle tile) e ne calcola il bounding
   box.
2. Sceglie lo **zoom** che fa stare il bbox (più padding) nel box `1200×750`: le tile arrivano a
   livelli interi e la frazione che avanza le ingrandisce, così la rotta riempie il suo riquadro.
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
roadbook, identificata da **`sort = -1`** e con **nome file casuale** (#206: le mappe dei
roadbook privati non devono essere enumerabili), rigenerata a ogni salvataggio.

- **Upload** ([upload.php:73](../public/api/upload.php#L73), `type=cover`): verifica la
  proprietà del roadbook, ricomprime il PNG in AVIF (`process_to_avif`, max 1200px) su
  `photos/<id>/<random>.avif`, e fa l'**upsert** della sola riga `roadbook_photos` a
  `sort = -1` (il file della cover precedente viene eliminato).
- **Miniatura** (`public_list`, [roadbooks.php:209](../app/roadbooks.php#L209)): la subquery del
  `thumb` ordina `sort, id` → con `sort = -1` la cover è **sempre** la prima, quindi la
  miniatura. Senza cover ricade sulla prima foto reale.
- **Esclusa dalla galleria**: `ph_list` (solo per chi edita il roadbook) filtra `sort >= 0`, così
  la cover non compare tra le foto dell'editor. `public_get` non espone la galleria (#316) e
  restituisce la sola cover nel campo **`cover`** (letto dalla riga a `sort -1`).

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
