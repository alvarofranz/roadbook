# Struttura menu RDBK.app

Un'unica sorgente di verità: il catalogo `SECTION` in `public/assets/js/app.js`, reso in due
presentazioni con **lo stesso ordine** (#807) — i roadbook prima, il Recorder al centro:

- `WEB_NAV = ['roadbooks', 'editor', 'recorder', 'navigate', 'events']` — la **top bar** del web
  desktop, seguita dal controllo account;
- `APP_TABS = ['back', 'roadbooks', 'editor', 'recorder', 'navigate', 'events', 'profile']` — la
  **bottom tab bar** icon-only, su *ogni* vista a larghezza mobile (web mobile, PWA e app nativa
  allo stesso modo). Su mobile la top bar è nascosta via CSS; non c'è hamburger né menu a tutto
  schermo.

## Matrice comparativa

| Voce | Web desktop | Mobile (web · PWA · app nativa) | Modalità partecipante |
|---|---|---|---|
| **Roadbooks** (`/roadbooks/`) | ✅ top bar | ✅ tab bar | ✅ tab bar · ❌ top bar |
| **Editor** | ✅ top bar | ✅ tab bar | ✅ tab bar · ❌ top bar |
| **Recorder** | ✅ top bar | ✅ tab bar | ✅ tab bar · ❌ top bar |
| **Navigate** (hub `/navigate/`: Reader + Tripmaster) | ✅ top bar | ✅ tab bar | ✅ tab bar · ❌ top bar |
| **Events** (anche `/event/` e `/ranking/`) | ✅ top bar | ✅ tab bar | ✅ tab bar · ❌ top bar |
| **Back** | — | ✅ tab bar (prima voce: `history.back()`, altrimenti la home) | ✅ tab bar |
| **Profile** | controllo account a destra della top bar | ✅ tab bar (apre il menu account in *dropup*) | ✅ |
| Link all'evento (`← Nome evento`) | — | — | ✅ top bar, al posto dei tool |

La top bar in modalità partecipante nasconde i link ai tool (`.nav-tool`) e mette in testa il
link di ritorno all'evento; la tab bar resta quella di sempre.

### Il menu account (`accountMenuHTML`)

Una lista sola, resa nel dropdown desktop (`acc…`) e nel dropup della tab bar (`tab…`) — quindi
identica su ogni superficie. Non autenticato: al suo posto c'è **Sign in** (il tab Profile porta
al login).

| Voce | Utente | Organizzatore | Admin | Partecipante |
|---|---|---|---|---|
| My profile (`/u/<username>`) | ✅ | ✅ | ✅ | ✅ |
| Account settings | ✅ | ✅ | ✅ | ✅ |
| My roadbooks | ✅ | ✅ | ✅ | ❌ |
| Public roadbooks | ✅ | ✅ | ✅ | ❌ |
| Event management (`/admin/events/`) | ❌ | ✅ | ✅ | ❌ |
| User management · Site settings · Roadbook trash · Logs | ❌ | ❌ | ✅ | ❌ |
| My activity | ✅ | ✅ | ✅ | ✅ |
| **Switch to full mode** | ❌ | ❌ | ❌ | ✅ |
| Help · App Info · Sign out | ✅ | ✅ | ✅ | ✅ |

I link di gestione vengono da `manageLinks(user, participant)` (#303).

### Home e footer

- **Home** (`public/index.html`): landing marketing sul web, home dell'app nell'app nativa (#720).
  In modalità partecipante reindirizza a `/event/<slug>`.
- **Footer** (solo desktop — nascosto su mobile): colonna *Product* (le voci di `WEB_NAV`),
  *Resources* (Help · Install · The .rdbk standard · What’s new · About) e *Legal* (Privacy ·
  Terms of Use · Contact), da `SITE_LINKS`; nella riga in basso il selettore di lingua, © e la
  versione. Su mobile la pagina Profile ripete gli stessi `SITE_LINKS` (`RBSiteLinksHTML`) e ha il
  selettore di lingua in fondo.

## Schema navigazione

### Web desktop (top bar — `WEB_NAV`)
```
┌─────────────────────────────────────────────────────────────────────┐
│ [RDBK.app]  Roadbooks  Editor  Recorder  Navigate  Events  [👤 Acct] │
└─────────────────────────────────────────────────────────────────────┘
```

### Ogni vista mobile: web, PWA, app nativa (bottom tab bar — `APP_TABS`)
```
┌─────────────────────────────────────────────────────┐
│ ← Roadbooks Editor Recorder Navigate Events Profile │
└─────────────────────────────────────────────────────┘
```

### Modalità partecipante (dopo `/go/<codice>`), top bar desktop
```
┌──────────────────────────────────────┐
│ [RDBK.app]  ← Nome Evento   [👤 Acct] │
└──────────────────────────────────────┘
  ↓ la home reindirizza a /event/<slug>
  ↓ il menu account perde My roadbooks / Public roadbooks / gestione, e guadagna Switch to full mode
```

## Note

- **"Navigate"** raggruppa **Reader** e **Tripmaster** (`covers: ['tripmaster', 'reader']`).
- Ranking **non ha una voce propria**: è dentro **Events** (`covers: ['event', 'ranking']`) e si
  apre per singolo roadbook di competizione dalla pagina dell'evento (`?event=<slug>&rb=<slug>`),
  riservato a partecipanti/organizzatori.
- La voce attiva: una corrispondenza esatta del primo segmento del path vince, altrimenti la voce
  che lo "copre" (`covers`).
- Le etichette delle voci comuni (`Navigate`, `Events`, `Profile`, `Roadbooks`) sono tradotte; i
  nomi di prodotto (Editor, Recorder) restano così.

---

## Scenario evento dal vivo

```
Manifesto con QR (https://rdbk.app/go/<codice>)
        │
        ├── app installata → Universal Link / App Link (#268): l'app esegue event_join via API
        │                     (Bearer) e apre /event/<slug>
        │
        └── app non installata → il browser apre /go/<codice>: auto-join come *pending*
                                  (login/registrazione prima, se serve, poi ritorno a /go/)
                                  → pagina evento in modalità partecipante
```

Non esiste un vero *deferred deep link* (i link portano solo a un'app già installata): per chi
installa l'app dopo, l'iscrizione fatta sul web resta sull'account, quindi basta accedere per
ritrovare l'evento. La pagina evento mostra al partecipante il titolo, il codice di attivazione, i
roadbook (bloccati se in bozza), il Reader e la Ranking.
