# Struttura menu RDBK.app

## Matrice comparativa

| Voce di menu | Web desktop<br>non aut. | Web desktop<br>autenticato | Web desktop<br>admin | Web mobile<br>/ PWA | App nativa<br>iOS/Android | Modalità<br>partecipante |
|---|---|---|---|---|---|---|
| **Reader** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ⬜ (solo da evento) |
| **Editor** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ❌ |
| **Navigate** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ❌ |
| ├ Tripmaster | via Navigate | via Navigate | via Navigate | via Navigate | via Navigate | ❌ |
| └ Recorder | via Navigate | via Navigate | via Navigate | via Navigate | via Navigate | ❌ |
| **Roadbooks** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ❌ | ❌ |
| **Events** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ⬜ (solo evento corrente) |
| └ Event list | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| └ Ranking | via Events | via Events | via Events | via Events | via Events | ⬜ (solo da evento) |
| **Profile / Account** | ❌ (Sign in) | ✅ dropdown | ✅ dropdown | ✅ dropdown | ✅ tab bar | ✅ (ridotto) |
| ├ My profile | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| ├ My roadbooks | — | ✅ | ✅ | ✅ | (via web) | ❌ |
| ├ Admin: Public Roadbooks | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| ├ Admin: Event management | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| ├ Admin: Participant mgmt | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| ├ Admin: User management | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| ├ Admin: Site settings | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| ├ Admin: Roadbook trash | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| ├ Admin: Logs | — | ❌ | ✅ | ❌ | ❌ | ❌ |
| ├ Organizer: Event mgmt | — | ✅ (se org) | — | ✅ (se org) | ❌ | ❌ |
| ├ Organizer: Participant mgmt | — | ✅ (se org) | — | ✅ (se org) | ❌ | ❌ |
| ├ **Switch to full mode** | — | ❌ | ❌ | ❌ | ❌ | ✅ |
| └ Sign out | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Home page** | landing marketing | landing marketing | landing marketing | landing marketing | launcher tool | reindirizza a evento |
| **Footer** | About · Standard · Privacy · Terms · Contact | idem | idem | idem | idem | idem |

**Legenda:** ✅ = visibile · ❌ = nascosto/non disponibile · ⬜ = visibile ma limitato al contesto evento

## Schema navigazione

### Web desktop
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [RDBK.app]  Reader  Editor  Navigate  Roadbooks  Events  Ranking   [👤 Acct] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Web mobile / PWA (bottom tab bar)
```
┌────────────────────────────────────────────────┐
│  Reader  Editor  Navigate  Roadbooks  Events  Ranking │
└────────────────────────────────────────────────┘
```

### App nativa iOS/Android (bottom tab bar)
```
┌─────────────────────────────────┐
│  Reader  Editor  Navigate  Events  Profile  │
└─────────────────────────────────┘
```

### Modalità partecipante (dopo `/go/<codice>`)
```
┌──────────────────────────────────────┐
│ [RDBK.app]  ← Nome Evento    [👤 Acct]│
└──────────────────────────────────────┘
  ↓ home page reindirizza a /event/<slug>
  ↓ tab bar ancora visibile (bug #258)
```

## Note

- La tab bar mobile mostra 6 voci sul web, 5 nell'app (manca Roadbooks).
- In modalità partecipante la tab bar inferiore **non viene nascosta** — l'utente può ancora navigare verso Editor, Tripmaster, etc.
- Ranking è una sezione autonoma sul web (`/ranking/`) ma è raggruppato dentro Events sull'app.
- "Navigate" raggruppa Tripmaster e Recorder sotto un'unica voce con landing page.
- I link amministrativi appaiono solo nell'account menu dropdown (web), non nella tab bar dell'app.

---

## Scenario evento dal vivo

### Flussi di ingresso

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│ Manifesto    │────→│ Scansiona QR     │────→│ App già installata?  │
│ con QR       │     │ (/go/<codice>)   │     └──────────┬───────────┘
└──────────────┘                                       │
                                                  ┌────┴────┐
                                                  │         │
                                                  SI        NO
                                                  │         │
                                                  ↓         ↓
                                          ┌──────────┐  ┌──────────────┐
                                          │ Apre app  │  │ Store       │
                                          │ deep link │  │ (Play/AppStore)│
                                          └────┬─────┘  └──────┬───────┘
                                               │               │
                                               │               ↓
                                               │         ┌──────────┐
                                               │         │ Installa  │
                                               │         │ app +     │
                                               │         │ deep link │
                                               │         └────┬─────┘
                                               │               │
                                               └───────┬───────┘
                                                       │
                                                       ↓
                                              ┌─────────────────┐
                                              │ /go/<codice>     │
                                              │ auto-join come   │
                                              │ pending          │
                                              └────────┬─────────┘
                                                       │
                                              ┌────────┴────────┐
                                              │                 │
                                              │                 │
                                              ↓                 ↓
                                     ┌──────────────┐   ┌──────────────┐
                                     │ Già account? │   │ Crea account │
                                     │              │   │ (login)      │
                                     └──────┬───────┘   └──────┬───────┘
                                            │                  │
                                            └────────┬─────────┘
                                                     │
                                                     ↓
                                           ┌──────────────────┐
                                           │ Pagina evento    │
                                           │ (modalità        │
                                           │  partecipante)   │
                                           │                  │
                                           │ Vede:            │
                                           │ • titolo evento  │
                                           │ • codice attivaz.│
                                           │   (6 caratteri)  │
                                           │ • roadbook       │
                                           │   (lock se draft)│
                                           │ • Reader         │
                                           │ • Ranking        │
                                           └──────────────────┘
```

### Punti da risolvere

1. **Deep link nativo** — `/go/<codice>` deve funzionare come universal link (iOS) / app link (Android) per aprire l'app direttamente. Oggi non è implementato.
2. **Poster QR** — il QR sul manifesto codifica `https://rdbk.app/go/<codice>`. Se l'app non è installata → store. Se è installata → apre l'app e arriva alla pagina evento.
3. **Primo accesso senza account** — il flusso porta al login/registrazione, poi torna al `/go/<codice>`. Funziona già.
4. **Tab bar in modalità partecipante** — oggi mostra ancora tutti i tool. Dovrebbe mostrare solo:
   - **Reader** (per navigare i roadbook dell'evento)
   - **Evento** (il singolo evento, non la lista)
   - **Profile** (con "Switch to full mode")

---

## Proposta revisione menu (#258)

### Obiettivi

- Max 5 voci nella bottom tab bar (come Instagram)
- Raggruppare funzionalità simili
- Events come sezione comprensibile (con spiegazione di cosa sono)
- Ranking dentro Events
- Adattamento automatico in modalità partecipante

### Proposta tab bar (app nativa)

```
┌──────────────────────────────────────┐
│  Reader  │  Editor  │  Navigate  │  Events  │  Profile  │
└──────────────────────────────────────┘
    ↑          ↑          ↑           ↑          ↑
    Leggi     Crea/     Tripmaster   Elenco     Account
    roadbook   modifica  + Recorder   eventi +   + impost.
                        (GPS)        Ranking   
```

### Proposta tab bar (web mobile / PWA)

Stessa struttura, 5 tab. **Roadbooks** (community pubblici) va dentro **Events** o **Profile**.

### Proposta top bar (web desktop)

```
┌──────────────────────────────────────────────────────────┐
│ [RDBK.app]  Reader  Editor  Navigate  Events  [👤 Acct] │
└──────────────────────────────────────────────────────────┘
```

(5 link, senza Roadbooks e Ranking separati — entrambi dentro Events)

### Modalità partecipante — tab bar proposta

```
┌──────────────────────────────┐
│  Reader  │  Evento  │  Profile  │  ← solo 3 voci
└──────────────────────────────┘
```

- **Reader**: apre i roadbook dell'evento (non la lista globale)
- **Evento**: landing page dell'evento specifico (con roadbook, classifica)
- **Profile**: con "Switch to full mode" per uscire

Il partecipante non deve vedere Editor, Navigate/Tripmaster/Recorder, né la lista eventi globale.

### Landing Events con spiegazione

La pagina `/events/` deve includere, oltre alla lista eventi pubblici, una sezione introduttiva:

> *"Un evento è un raduno organizzato attorno a uno o più roadbook. Puoi partecipare con un codice fornito dall'organizzatore, seguire i percorsi con il Reader e confrontare i tuoi risultati in classifica."*

Con link a:
- "Come funzionano gli eventi" (`/features/events/`)
- "Trova un evento" (lista)
- "Ho un codice di partecipazione" (campo per inserire il codice → `/go/<codice>`)

### Schema navigazione revisionato

```
                    ┌──────────────────────────────────────────────┐
                    │                   RDBK.app                   │
                    └──────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┬───────────────┐
                    ▼                ▼                ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────┐
              │  Reader  │   │  Editor  │   │   Events     │   │ Navigate │
              │ (leggi)  │   │ (crea)   │   │              │   │ (GPS)    │
              └──────────┘   └──────────┘   └──────┬───────┘   └──────────┘
                                                   │
                          ┌────────────────────────┼──────────────────┐
                          ▼                        ▼                  ▼
                   ┌──────────────┐        ┌──────────────┐   ┌────────────┐
                   │ Lista eventi │        │  Partecipo   │   │  Ranking   │
                   │ (/events/)   │        │  con codice  │   │ (per evento)│
                   └──────┬───────┘        └──────┬───────┘   └────────────┘
                          │                       │
                          ▼                       ▼
                   ┌──────────────┐        ┌──────────────┐
                   │ Pagina evento│        │  /go/<codice>│
                   │ (/event/<s>) │        │  → auto-join │
                   │              │        │  → pending   │
                   │ • roadbook   │        │  → QR attiv. │
                   │ • reader     │        └──────────────┘
                   │ • ranking    │
                   │ • info       │
                   └──────────────┘

    ─── Modalità partecipante (dopo attivazione) ───

                   ┌──────────────────────────────────────────────┐
                   │            Modalità partecipante             │
                   │     (solo 3 tab: Reader · Evento · Profile)  │
                   └──────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌────────────┐ ┌────────────┐ ┌──────────────┐
              │ Reader     │ │ Evento     │ │ Profile      │
              │ (solo RB   │ │ corrente   │ │ • Switch to  │
              │  evento)   │ │ + ranking  │ │   full mode  │
              └────────────┘ └────────────┘ │ • Sign out   │
                                            └──────────────┘
```
