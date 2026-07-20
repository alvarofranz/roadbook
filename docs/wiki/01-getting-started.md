# Guida Rapida — Primi passi con RDBK.app

Benvenuto! RDBK.app è una PWA (Progressive Web App) per creare, condividere e seguire roadbook digitali. Funziona **interamente nel browser** — niente da installare, ma puoi anche "installarla" come app sul telefono.

L'app funziona **offline** per registrazione, editing e navigazione. Serve connessione solo per: login, salvataggio sul profilo, upload foto/audio, pagine pubbliche.

---

## 1. Scegli cosa fare — i 4 tool principali e le opzioni

| Tool | A cosa serve | Quando usarlo |
|------|--------------|---------------|
| **Roadbook Recorder** | Registra una traccia GPS live, la puoi arricchire con waypoint nei punti che vorrai impostare come note; inoltre correlare anche foto dell'incrocio e comode note vocali per prendere appunti su come dovrà essere disegnato il tulip o avvertenze varie | Durante il sopralluogo / la ricognizione sul campo |
| **Editor** | Creare o modificare un roadbook partendo da una registrazione, da un GPX o da un roadbook in formato openrally; ottimizza la traccia, rivedi gli appunti vocali e le foto del sopralluogo, completa le note ed i tulip disegnandoli; la gestione delle frecce e dei CAP è automatica sulla base della traccia sottostante. Al termine puoi esportarlo in formato RDBK, openrally e PDF se preferisci stamparlo | Dopo la registrazione (o da zero) per preparare il roadbook definitivo |
| **Roadbook Reader** | Permette la navigazione dei roadbook in formato digitale in modalità turistica o competizione, può marcare automaticamente le note raggiunte ed in aggiunta è anche attivabile una mappa (opzionale) che presenta la posizione della singola nota rispetto a quella del veicolo | Durante l'evento / l'uscita — è il "copilota" |
| **Roadbook Player** | Computer di bordo GPS senza roadbook: odometro totale/parziale, velocità, heading, cronometro, waypoint counter, registrazione GPX | Ricognizioni libere, prove, uscite senza roadbook prestabilito |

> **ALTRE POSSIBILITA'**:  
> - in **HOME PAGE** trovi una galleria dei roadbook pubblici che puoi consultare o percorrere
> - se sei registrato puoi salvare su RDBK.app tuoi roadbook (draft/ready/public) e condividerli tra telefono e PC
> - nella sezione **Eventi** trovi eventi organizzati dai Club
> - ... e puoi sempre organizzare un evento sfruttando la gestione digitale dei tuoi roadbook!

---

## 2. Flusso tipico "da zero a gara"

```
┌─────────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Recorder   │ ──→ │ Editor  │ ──→ │  Save   │ ──→ │ Reader  │ ←── │  Event  │
│  (campo)    │     │ (scrivi)│     │ (profilo)│    │ (naviga)│     │ (organ.)│
└─────────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
      │                   │                │                │              │
  GPS live           Disegna/       Salvato su         Segui          Crea evento,
  waypoint           importa        cloud +            note +         associa RB,
  foto/audio         GPX/.rdbk      opzionale        CAP +          invita con
                      icone/simboli  .rdbk locale     punteggio      join code
```

---

## 3. Perché creare un account

Il login ti permette di salvare i tuoi roadbook sul cloud e ritrovarli su qualsiasi dispositivo — puoi registrare una traccia col telefono durante un sopralluogo e poi editarla comodamente dal PC senza impazzire a spostare file.

1. Tocca **Account** (in alto a destra) → **Registrati**
2. Inserisci: nome, cognome, username, email, password (≥ 8 caratteri)
3. Spunta **Accetto i Termini d'uso**
4. Completa il challenge Turnstile (se attivo)
5. Riceverai un'email: clicca **Verifica la mia email** entro 24 h
6. Torna nell'app e fai **Login** con email/username + password

> **Google Sign-In**: se vedi il pulsante "Continua con Google", puoi usarlo per creare/accedere senza password.

---

## 4. Concetti chiave da sapere subito

| Concetto | Cosa significa |
|----------|----------------|
| **Stato roadbook** | `draft` = bozza privata · `ready` = pronto ma privato · `public` = visibile a tutti in galleria |
| **Salvataggio locale vs cloud** | Nell'Editor: **Export .rdbk** = file ZIP sul tuo device (offline, portabile). **Save to profile** = salvato sul server, ritrovi da qualsiasi device loggato |
| **Foto & note vocali** | Non finiscono nel `.rdbk` a meno che non spunti "Includi foto e audio" all'export. Vivono sul server (serve login). Da sloggato restano nel device e vanno nel `.rdbk` locale |
| **Join code eventi** | Codice breve (es. `DA2C09`) che l'organizzatore ti dà. Apri `/go/DA2C09` → entri nell'evento vedi i roadbook `ready` riservati ai partecipanti |
| **Punteggio gara (Ranking)** | Solo in modalità **Competition** nel Reader. Genera un QR firmato 55 caratteri a fine prova.

---

## 5. Prime cose da provare (5 minuti)

1. **Registra una traccia** → Recorder → "Start recording" → cammina/guida → "Finish" → "Open in Editor"
2. **Disegna una rotta** → Editor → "Draw on the map" → tap due punti → aggiungi note (tap riga → editor inline)
3. **Esporta .rdbk** → Editor → Export → .rdbk → scarica il file ZIP
4. **Apri in Reader** → Reader → "Carica file .rdbk" → scegli il file → "Trip mode" → inizia a navigare
5. **Prova Tripmaster** → Tripmaster → Start → vedi odometro, velocità, heading live

---

## 6. Dove trovare aiuto

| Cosa | Dove |
|------|------|
| Termini d'uso | `/terms/` (link in footer) |
| Privacy | `/privacy/` |
| Standard `.rdbk` | `/standard/` — specifica completa del formato |
| Segnala bug / richiedi feature | GitHub Issues (link in footer → About) |
| Contatto | `/contact/` |

---

## 7. Prossimo passo

Scegli il tool che ti serve e leggi la sua guida:

- 📍 [Registrare una traccia →](02-recorder.md)
- ✏️ [Creare/modificare un roadbook →](03-editor.md)
- 🧭 [Navigare con il Reader →](04-reader.md)
- 📊 [Usare il Tripmaster →](05-tripmaster.md)
