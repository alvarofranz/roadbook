# RDBK.app — AGENTS.md

Per architettura, strumenti, deploy e convenzioni dettagliate leggi **`CLAUDE.md`** (root). Qui solo ciò che un agente OpenCode sbaglierebbe senza aiuto.

## Sicurezza

- **CSP: `script-src 'self'`** — niente inline `<script>`, `onclick=`, `javascript:` URL. Tutto il JS va in file `.js` esterni, la UI si lega con `addEventListener` delegato.
- **Conferma prima di distruggere dati.** Ogni delete/overwrite deve passare da `RBConfirm` che nomina l'oggetto (es. numero nota + testo). Mai silenzioso.
- **Migrazioni DB: mai perdere dati.** Prima di droppare colonne, tabelle, container Docker, volumi o fare reset, **CHIEDI CONFERMA** (con testo in **rosso**). Spiega esattamente cosa stai per fare e quali dati rischi di perdere.

## i18n

- **Tutte le lingue (EN/ES/IT/DE/FR) devono avere le stesse chiavi.** Se aggiungi/rimuovi una chiave in `i18n.js` (EN), aggiorna SUBITO anche `i18n.{es,it,de,fr}.js`. Il test `npm test` include `tests/i18n.test.js` che verifica la parità.

## Branch e PR

- **`main` è protetto** — nessun push diretto (GH006). Ogni modifica va su un branch → PR → merge. Self-merge consentito (`gh pr merge --squash --delete-branch`).
- **PR di process/architettura/db/deploy/CI** → chiedere review ad Álvaro prima di mergiare (`CLAUDE.md` "Process/architecture changes need an Alvaro review").

## Test e lint

```bash
npm test                    # Vitest (tests/**/*.test.js, happy-dom)
node --check <file>.js      # syntax check JS (CI lo fa su tutti i .js non minified)
npm run check               # syntax check su tutta la codebase (source/check-syntax.mjs)
```

- Prima di chiedere all'utente di testare, esegui `npm test` e risolvi eventuali rossi.
- I test di non regressione vanno in `tests/` con Vitest.

## Sviluppo

- **Niente ambiente locale.** Lo sviluppo è sul dev clone del VPS (`http://localhost:8806`). Nessun Docker, nessun Mac.
- `public/` è la web root. **Niente build step** per il web — i file `.js` sono serviti così come sono.
- Config gitignorata: `public/assets/js/config.js`, `.env`, `vendor/`, `public/assets/fontawesome/`. Nel dev clone sono copiati da produzione.

## Versioni e deploy

- `stamp-version.mjs` scrive `public/version.json` e aggiorna i `?v=` cache-buster. Il server DEVE eseguirlo dopo ogni checkout.
- **Release:** `node source/stamp-version.mjs <X.Y.Z>` → commit → branch → PR → merge. Quel merge fa partire web + Android (Play) + iOS (Xcode Cloud).
- **Build nativo:** `npm run build:native` (esbuild `native/src/native.js` → `public/assets/js/native.bundle.js`). Serve prima di `npx cap sync`.

## API DB

```bash
# List migrations pendenti
curl -fsS -H "X-Admin-Key: $VPS_KEY" https://alvarofranz.com/api/projects/rdbk/migrations | jq '.parsed'
# Applicare una migration
curl -sS -X POST -H "X-Admin-Key: $VPS_KEY" https://alvarofranz.com/api/projects/rdbk/migrations/<file>.sql/apply | jq -r '.stdout // .'
```
- **Schema prima del codice**: una nuova colonna/tabella deve esistere in prod PRIMA che il codice che la usa venga deployato.
- **Chiave DB/produzione**: in `db.md` (gitignored).

## Convenzioni rapide

- **Nessun CSS inline** (`style="…"`). Tutto in stylesheet con classi descrittive.
- **Nessun commento legacy** ("prima era X, ora Y"). Quando cambi qualcosa, riscrivi i commenti come se fosse sempre stato così.
- **Stesso FontAwesome icona per tool** in tutta l'app (`fa-circle-dot` Recorder, `fa-pen-ruler` Editor, `fa-compass` Reader, `fa-gauge-high` Tripmaster).
