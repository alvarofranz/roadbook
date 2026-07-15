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
- **PR**: prima di aprire una nuova PR devo chiederti di testare le modifiche su DDEV e
  attendere il tuo ok.
