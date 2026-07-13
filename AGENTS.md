# RDBK.app — AGENTS.md

Per tutte le informazioni sul progetto (architettura, convenzioni, strumenti, deploy),
leggi il file **`CLAUDE.md`** nella root del progetto. È la fonte di verità.

Note specifiche per opencode:
- Usa `/connect` per aggiungere provider (DeepSeek, LM Studio, etc.)
- Usa `/models` per cambiare modello
- Le linee guida in CLAUDE.md (test prima del deploy, nessun deploy senza approvazione,
  partire da `main` fresco, etc.) si applicano anche qui
- **Chiavi DB/produzione**: in `db.md` (gitignored) — contiene VPS_ADMIN_KEY
- **Migration al DB**: dopo aver pushato, applica via panel con
  `curl -sS -X POST -H "X-Admin-Key: $VPS_ADMIN_KEY" "https://alvarofranz.com/api/projects/rdbk/migrations/<file>/apply"`
  Se il panel non trova il file, riprovare dopo 30-60 secondi (deploy non ancora completato).
- **Issue GitHub**: non assegnare mai nuove issue a nessuno a meno che non venga richiesto esplicitamente.
  Le fix vanno assegnate a chi ha aperto l'issue.
