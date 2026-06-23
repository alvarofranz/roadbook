# Documentazione RDBK.app

Una guida sezione-per-sezione a come è fatto RDBK.app — la PWA per roadbook digitali e il
formato aperto `.rdbk`. Ogni documento spiega scopo, struttura, flusso dati, funzioni chiave
(con link al codice a livello di riga) e una sezione onesta di limiti/quirk.

> Per il quadro d'insieme e le regole di lavoro vedi [CLAUDE.md](../CLAUDE.md) nella radice.

## I tool (`public/<tool>/`)
- [Editor](editor.md) — l'hub di creazione: sorgenti (GPX, Record, Draw, .rdbk, Challenge),
  editing sulla mappa, modello note, i tre export e Save to profile.
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
- [i18n](i18n.md) — internazionalizzazione a stringhe-sorgente (EN · ES · IT).
- [challenges](challenges.md) — `RBChallenges`: sfide pubbliche DB-backed e URL amichevoli.
- [pdf](pdf.md) — `RBPdf`: generazione PDF A4 del roadbook sul dispositivo.

## Pagine utente e statiche
- [account-pages](account-pages.md) — home, profilo, I miei roadbook, privacy.

## Backend
- [backend-api](backend-api.md) — l'API PHP (`public/api/` + `app/`): account, storage, foto,
  challenge, schema DB.
- [user-management](user-management.md) — gestione utenti: pannello admin (`/admin`), modello
  permessi (`is_admin` + `ADMIN_EMAILS`), azioni admin (attiva/modifica/blocca/elimina),
  self-service (cambio password forzato, elimina account), migrazioni e note di deploy.

## Il formato
- [rdbk-format](rdbk-format.md) — lo standard aperto `.rdbk` e la pagina `/standard`.
- [roadbook-specs](roadbook_specs.md) — convenzioni di resa del roadbook (tulip) e decisioni
  di design: colori RB System, tipi strada per spessore (dash/double), trunk, bivi, CAP, danger.
- [fia-lexicon-compliance](fia-lexicon-compliance.md) — confronto col lexicon roadbook FIA
  cross-country (issue #9): cosa copriamo come icona, come dato, o non ancora.

---

### Discrepanze note tra documentazione e codice
Emerse durante la stesura, da decidere se correggere nel codice o nelle note:
- **Mappa**: il codice di [rbmap](rbmap.md) usa **MapLibre GL**, non Mapbox come dice CLAUDE.md.
- **note-canvas**: `NoteCanvas.rowCols` è citata in CLAUDE.md ma **non esiste** nel sorgente attuale.
- **i18n**: il dizionario `it` ha un buco di parità (chiavi `feat.3.*` mancanti) — vedi [i18n](i18n.md).
- **Ranking**: la colonna *Regolarità* è di fatto neutralizzata per i risultati firmati — vedi
  [ranking-model](ranking-model.md) §5.
