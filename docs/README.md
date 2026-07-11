# Documentazione RDBK.app

Una guida sezione-per-sezione a come è fatto RDBK.app — la PWA per roadbook digitali e il
formato aperto `.rdbk`. Ogni documento spiega scopo, struttura, flusso dati, funzioni chiave
e una sezione onesta di limiti/quirk.

> Per il quadro d'insieme e le regole di lavoro vedi [CLAUDE.md](../CLAUDE.md) nella radice.
>
> **Convenzione:** i riferimenti al codice puntano alle **funzioni per nome** (es. `setRoadbook`,
> `rb_save`), non a numeri di riga — che scivolano ad ogni modifica. Cerca il nome nel file
> indicato.

## I tool (`public/<tool>/`)
- [Editor](editor.md) — l'hub di creazione: sorgenti (GPX, Record, Draw, .rdbk, roadbook
  pubblico), editing sulla mappa, modello note, gli export e Save to profile.
- [Reader](reader.md) — il navigatore: tabella note cartacea, stati colore, modal di avvio,
  avanzamento auto/manuale, odometro e CAP. *(Punteggio gara → vedi Ranking.)*
- [Tripmaster](tripmaster.md) — computer di bordo GPS senza roadbook.
- [Recorder](recorder.md) — registrazione tracce GPX live (waypoint, foto, crash-safe).
- [Ranking](ranking-model.md) — modello di punteggio e classifica dai QR firmati.

## Front-end condiviso (`public/assets/js/`)
- [roadbook-core](roadbook-core.md) — `window.RB`: geo math, parsing, buildRoadbook, metriche,
  operazioni traccia, GPX, payload META + firma.
- [note-canvas](note-canvas.md) — `NoteCanvas`: editor di vignette/tulip + render statici.
- [rbmap](rbmap.md) — helper della mappa (traccia, waypoint, marker, layer).
- [gps-stack](gps-stack.md) — `RBGpsMeter` + `RBGpxRecorder` + status bar: il ciclo GPS condiviso.
- [app-shell](app-shell.md) — `app.js`/`home.js`: helper globali `RB*`, header/footer, service
  worker, auto-refresh di versione, install PWA.
- [i18n](i18n.md) — internazionalizzazione a stringhe-sorgente (EN · ES · IT · DE · FR).
- [i18n-edit](i18n-edit.md) — editor di traduzione in-context (solo admin).
- [rbzip](rbzip.md) — `RBZip`: codec ZIP lato browser (container .rdbk e foto/audio).
- [rb-media-queue](rb-media-queue.md) — `RBMediaQueue`: coda offline-first per upload di foto/audio.
- [rb-transcribe](rb-transcribe.md) — `RBTranscribe`: trascrizione Whisper in-browser.
- [challenges](challenges.md) — `RBChallenges`: sfide pubbliche DB-backed e URL amichevoli.
- [pdf](pdf.md) — `RBPdf`: generazione PDF A4 del roadbook sul dispositivo.

## Pagine utente e statiche
- [home-page](home_page.md) — la galleria della home (teaser dei roadbook pubblici) e la
  generazione della **cover** di ogni roadbook (mappa statica della rotta) usata come miniatura.
- [roadbooks](roadbooks.md) — la galleria `/roadbooks/` dei roadbook pubblici completi.
- [account-pages](account-pages.md) — home, profilo, I miei roadbook, privacy, e le altre pagine
  statiche/marketing (about, terms, contact, feature pages).

## Backend
- [backend-api](backend-api.md) — l'API PHP (`public/api/` + `app/`): account, storage, foto/audio,
  roadbook pubblici, **eventi + co-editing**, schema DB (tutte le `migrations/*.sql`).
- [events](events.md) — il sottosistema **Eventi** (`public/events/`, `public/event/`,
  `public/admin/events/` + `app/events.php`): modello dati, ruoli/co-organizzatori, partecipanti +
  join-by-code, consegna dei roadbook `ready`, co-editing.
- [go](go.md) — l'handler `/go/<join_code>`: entry gate per partecipanti a eventi tramite codice
  breve.
- [cron](cron.md) — cron jobs: round-robin runner e task di manutenzione (pulizia upload, ricordi,
  rimozione vecchi eventi, etc.).
- [user-management](user-management.md) — gestione utenti: pannello admin (`/admin`), modello
  permessi, azioni admin (attiva/modifica/blocca/elimina), self-service (cambio password forzato,
  elimina account), migrazioni e note di deploy.

## Infrastruttura / contenuto
- [seo](seo.md) — metadati per i motori di ricerca (title/description per pagina e lingua,
  Open Graph, canonical, policy di indicizzazione).

## Il formato
- [rdbk-format](rdbk-format.md) — lo standard aperto `.rdbk` e la pagina `/standard`.
- [roadbook-specs](roadbook_specs.md) — convenzioni di resa del roadbook (tulip) e decisioni
  di design: colori RB System, tipi strada per spessore (dash/double), trunk, bivi, CAP, danger.
- [fia-lexicon-compliance](fia-lexicon-compliance.md) — confronto col lexicon roadbook FIA
  cross-country (issue #9): cosa copriamo come icona, come dato, o non ancora.

---

### Comportamenti da tenere a mente
- **Ranking**: la colonna *Regolarità* è di fatto neutralizzata per i risultati firmati — vedi
  [ranking-model](ranking-model.md) §5.
