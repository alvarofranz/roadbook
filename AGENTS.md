# RDBK.app — AGENTS.md

Per tutte le informazioni sul progetto (architettura, convenzioni, strumenti, deploy),
leggi il file **`CLAUDE.md`** nella root del progetto. È la fonte di verità.

Note specifiche per opencode:
- Usa `/connect` per aggiungere provider (DeepSeek, LM Studio, etc.)
- Usa `/models` per cambiare modello
- **Tutte le linee guida in CLAUDE.md si applicano anche qui** (test prima del deploy, nessun deploy senza approvazione,
  partire da `main` fresco, etc.). Leggilo integralmente all'inizio di ogni sessione.
- **Chiavi DB/produzione**: in `db.md` (gitignored) — contiene VPS_ADMIN_KEY
- **Migration al DB**: dopo aver pushato, applica via panel con
  `curl -sS -X POST -H "X-Admin-Key: $VPS_ADMIN_KEY" "https://alvarofranz.com/api/projects/rdbk/migrations/<file>/apply"`
  Se il panel non trova il file, riprovare dopo 30-60 secondi (deploy non ancora completato).
- **Issue GitHub**: non assegnare mai nuove issue a nessuno a meno che non venga richiesto esplicitamente.
  Le fix vanno assegnate a chi ha aperto l'issue.
- **Deploy**: mai mergiare PR o pushare in produzione senza il tuo esplicito OK dopo che hai
  testato su ddev. Dopo aver implementato una modifica, chiedo sempre conferma prima di
  procedere al merge/deploy.
- **Test automatici**: prima di chiedere all'utente di testare, esegui `npm test` su ddev per
  verificare che i test passino. Se non passano, risolvi prima.
- **Test di non regressione**: dopo l'approvazione della PR, i test relativi alla modifica
  vanno inseriti nella suite automatica come test di non regressione (stessa directory
  `tests/` con Vitest).
- **CRLF line endings**: su Windows WSL, git può convertire i line-ending in CRLF.
  Prima di ogni commit, verifica con `git diff --ignore-space-at-eol` che non ci siano
  modifiche spurie dovute a CRLF. Se necessario, configura `git config core.autocrlf input`
  o esegui `git add --renormalize .` per risolvere.
