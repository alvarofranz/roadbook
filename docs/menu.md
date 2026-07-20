# Struttura menu RDBK.app

## Matrice comparativa

| Voce di menu | Web desktop<br>non aut. | Web desktop<br>autenticato | Web desktop<br>admin | Web mobile<br>/ PWA | App nativa<br>iOS/Android | Modalità<br>partecipante |
|---|---|---|---|---|---|---|
| **Recorder** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ❌ |
| **Editor** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ❌ |
| **Navigate** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ❌ |
| ├ Reader | via Navigate | via Navigate | via Navigate | via Navigate | via Navigate | ⬜ (solo da evento) |
| └ Tripmaster | via Navigate | via Navigate | via Navigate | via Navigate | via Navigate | ❌ |
| **Roadbooks** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ❌ | ❌ |
| **Events** | ✅ top bar | ✅ top bar | ✅ top bar | ✅ tab bar | ✅ tab bar | ⬜ (solo evento corrente) |
| ├ Event list | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
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

### Web desktop (top bar — `WEB_NAV`)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [RDBK.app]  Recorder  Editor  Navigate  Roadbooks  Events   [👤 Acct] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Web mobile / PWA (bottom tab bar — `WEB_NAV`)
```
┌────────────────────────────────────────────────┐
│  Recorder  Editor  Navigate  Roadbooks  Events │
└────────────────────────────────────────────────┘
```

### App nativa iOS/Android (bottom tab bar — `APP_TABS`)
```
┌───────────────────────────────────────────────┐
│  Recorder  Editor  Navigate  Events  Profile  │
└───────────────────────────────────────────────┘
```

### Modalità partecipante (dopo `/go/<codice>`)
```
┌──────────────────────────────────────┐
│ [RDBK.app]  ← Nome Evento    [👤 Acct]│
└──────────────────────────────────────┘
  ↓ home page reindirizza a /event/<slug>
  ↓ tab bar ridotta (Reader · Evento · Profile) — non ancora implementata (#163)
```

## Note

- Un'unica sorgente di verità: il catalogo `SECTION` in `public/assets/js/app.js`. Il web lo rende come top bar (`WEB_NAV`), l'app come bottom tab bar icon-only (`APP_TABS`); la top bar è nascosta via CSS su ogni viewport mobile (web · PWA · nativa), dove prende il posto la tab bar inferiore.
- La tab bar mostra **5 voci** sia sul web mobile/PWA (`Recorder · Editor · Navigate · Roadbooks · Events`) sia nell'app nativa (`Recorder · Editor · Navigate · Events · Profile`, senza Roadbooks ma con Profile).
- **Recorder** è una voce di primo livello. **"Navigate"** raggruppa **Reader** e **Tripmaster** (hub `/navigate/`, `covers: ['tripmaster', 'reader']`).
- Ranking **non ha una voce di menu propria**: è dentro **Events** (`covers: ['event', 'ranking']`) e si apre per singolo roadbook di competizione dalla pagina dell'evento (`?event=<slug>&rb=<slug>`), riservato a partecipanti/organizzatori.
- I link amministrativi/organizzatore appaiono solo nel dropdown del menu account (web), non nella tab bar dell'app.
- La **tab bar ridotta per il partecipante** (3 voci: Reader · Evento · Profile) non è ancora implementata — tracciata in **#163**.

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
4. **Tab bar in modalità partecipante** — oggi mostra ancora tutti i tool. Dovrebbe mostrare solo Reader · Evento · Profile. Tracciato in **#163** (participant home).
