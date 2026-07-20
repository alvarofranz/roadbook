# Eventi RDBK

Come funziona il sottosistema **Eventi** di RDBK.app: un evento raccoglie uno o più roadbook,
ha una pagina pubblica di presentazione, dei co-organizzatori, dei partecipanti che aderiscono
con un codice, e una console di gestione. Documento di riferimento per il modello dati, i ruoli,
le pagine e le action.

> È l'epic **#6**, costruita in fasi (P0→P4). Questo doc descrive ciò che è **in produzione**
> (P0–P3): entità evento, listing/pagina pubblica, console di gestione, ruoli/co-organizzatori,
> partecipanti + join-by-code, co-editing dei roadbook di evento. Restano aperte **P2.4**
> (entry self-select, #124) e **P4** (viewer non-ridistribuibile completo + PDF organizzatore,
> #25). Il motore di scoring integrato è rinviato: la classifica resta su Reader Competition +
> Ranking (vedi [ranking-model](ranking-model.md)).
>
> Lato server la logica vive in [`app/events.php`](../app/events.php); le action e lo schema
> completo sono in [backend-api](backend-api.md). Front-end: 2 pagine pubbliche + 3 pagine di
> gestione (sotto).

---

## 1. Il modello dati

Cinque tabelle (migrazioni 019, 022, 023 — dettaglio in [backend-api §8](backend-api.md)):

| Tabella | Campi chiave | Ruolo |
|---|---|---|
| `events` | `id`, `slug` (unico), `title`, `description`, `starts_on`/`ends_on`, `is_public`, `join_code` (unico), `logo`, **`organizer_id`** | L'evento + la sua pagina di presentazione; `organizer_id` = **proprietario**. |
| `event_roadbooks` | `event_id`, `roadbook_id`, `sort`, **`scoring_mode`** | I roadbook associati all'evento, ordinati, ognuno con la propria modalità di punteggio. |
| `event_organizers` | `event_id`, `user_id` | I **co-organizzatori** (il proprietario è sempre incluso). |
| `event_participants` | `event_id`, `user_id`, `status`, `created_at` | Chi ha aderito (con il join code): `pending` finché l'organizzatore non lo attiva, poi `active` (#163). |

Le categorie/classi vivono sul singolo roadbook (`roadbooks.category`, #248), non più
sull'evento.

- **Proprietà vs gestione:** il proprietario è `events.organizer_id`; le righe `event_organizers`
  concedono ad altri utenti i diritti di **gestione dei contenuti** dello stesso evento. La
  proprietà (lista organizzatori, cancellazione evento) resta del proprietario o di un admin.
- **`scoring_mode`** (`EVENT_SCORING_MODES`): `free` (segui senza punteggio) · `roadbook_suite`
  (le regole del ranking attuale). `fia` è **riservato** — l'editor lo mostra disabilitato e
  l'API lo rifiuta ricadendo su `free`.
- Tutte le FK sono `ON DELETE CASCADE`: cancellare l'evento porta via associazioni, categorie,
  organizzatori e partecipanti (il file logo viene rimosso a mano in `event_delete`).

---

## 2. Ruoli e diritti

Non esiste un "tipo utente evento": i ruoli sono **per-evento**, su un'unica tabella `users`.

| Capacità | Admin | Proprietario | Co-organizzatore | Partecipante | Pubblico |
|---|:--:|:--:|:--:|:--:|:--:|
| Creare un evento | ✓ | se **organizer** | — | — | — |
| Modificare evento + categorie + associazioni | ✓ | ✓ | ✓ | — | — |
| Gestire la lista organizzatori · cancellare l'evento | ✓ | ✓ | — | — | — |
| Editare un roadbook dell'evento (co-editing #123) | ✓ | ✓ (i propri) | ✓ | — | — |
| Leggere un roadbook `ready` dell'evento (#25) | ✓ | ✓ | ✓ | ✓ | — |
| Vedere l'evento nel listing pubblico | ✓ | ✓ | ✓ | ✓ | ✓ (se `is_public`) |

Il **ruolo globale `is_organizer`** (concesso da un admin) serve solo a **creare** eventi; una
volta creato, i diritti sono per-evento. Le funzioni guardia in `events.php`:

- `is_organizer($user)` / `is_admin($user)` — creare esige uno dei due (`event_save` con id 0).
- `event_can_manage($user, $eventRow)` — admin, proprietario **o** co-organizzatore.
- `require_event_manage($user, $id)` → riga evento o `403` (gestione contenuti).
- `require_event_owner($user, $id)` → solo proprietario/admin (accesso: organizzatori, delete).
- `user_manages_events($uid)` — possiede o co-organizza almeno un evento; **pilota la voce
  "Event management"** nel menu account per chi non ha il ruolo organizer globale (via
  `config`, campo `manages_events`).
- `event_grants_read` / `event_co_edits_roadbook` — vedi §5.

---

## 3. Le pagine pubbliche

### `/events/` — listing pubblico (`events.js`)
Elenco degli eventi pubblici con **ricerca + paginazione client-side**. Chiama
`RBApi('events_list')` → `events_public_list()`, che restituisce gli eventi `is_public = 1` (max
100, ordinati per data di inizio) con il **conteggio dei soli roadbook pubblici**. Ogni card
(via `RBGalleryCard`) mostra logo/titolo, organizzatore, intervallo date (`RBDateRange`) e numero
di roadbook, e linka a `/event/<slug>`.

### `/event/<slug>` — pagina di presentazione (`event.js`)
La vetrina di un evento. Chiama `RBApi('event_get', { slug })` → `event_public_get()` (GET,
anonima) che serve un evento **solo se `is_public`**, con:
- i dati dell'evento (titolo, date, organizzatore, descrizione, logo, categorie);
- lo **stato di adesione** del visitatore loggato (`joined`) e `can_join` (esiste un join code);
- i **roadbook**: quelli `public` per tutti, **più** i `ready` se il visitatore è **membro**
  (partecipante o organizzatore) — le rotte "pronte" consegnate solo agli iscritti (#25). Le bozze
  non compaiono mai.

Per un utente loggato compare il **form di adesione con codice** (`event_join`) o il pulsante
**Leave** (`event_leave`); aderire/abbandonare **rifà la fetch**, così la lista dei roadbook segue
l'accesso appena acquisito/perso. Da un roadbook della lista si va al Reader / alla pagina
`/challenge/<slug>`.

---

## 4. La console di gestione (`/admin/events/…`)

Tre pagine (non popup): elenco, modifica, partecipanti. L'accesso è **per-evento** (la voce
"Event management" nel menu account appare ad admin, organizer, o chi co-organizza — §2).

### `/admin/events/` — elenco (`admin-events.js`)
Gli eventi che gestisci: i tuoi + quelli che co-organizzi (admin li vede tutti). `events_manage()`
restituisce, in una passata, i conteggi roadbook/partecipanti per evento. Creare/modificare
avviene sulla pagina dedicata `edit/?id=<id>` (mai in popup); `?id=0` crea un nuovo evento al
primo salvataggio.

### `/admin/events/edit/` — modifica evento (`event-edit.js`)
La pagina completa di un evento. `event_manage_get()` fornisce tutto: parametri, categorie,
organizzatori, roadbook associati (con proprietario + `scoring_mode`) e il totale partecipanti +
il join code. Le azioni:
- **Parametri** — `event_save` (titolo, descrizione, sito dell'organizzatore, coordinate HQ,
  date, visibilità). Le categorie non si gestiscono qui: vivono sul singolo roadbook
  (`roadbooks.category`, #248).
- **Roadbook** — `event_rb_add` (solo un roadbook **di cui sei proprietario**; un admin può
  associarne di altrui, #140), `event_rb_remove` (dissocia, non tocca il roadbook), `event_rb_mode`
  (imposta `scoring_mode`).
- **Organizzatori** — `user_search` (ricerca per username/nome, filtrabile per organizzazione;
  riservata a organizzatori/admin perché restituisce le email),
  `event_org_add`/`event_org_remove` (**solo il proprietario/admin**; il proprietario non è
  rimovibile).
- **Join code** — `event_join_code` genera/rigenera (o azzera) il codice condiviso con i
  partecipanti.
- **Logo** — upload via `RBUpload({ type: 'event_logo', event })` (AVIF 512px, vedi
  [backend-api §6](backend-api.md)); `event_logo_remove` lo toglie.

### `/admin/events/participants/` — roster (`participants.js`)
La lista partecipanti su pagina propria (#144): un evento può averne centinaia, quindi è
**cercata e paginata lato server** (`event_participants_list`, `q` su username/nome completo).
`event_participant_remove` rimuove un partecipante. La forma della riga è il contratto che
**P2.4 (#124)** allargherà con i campi entry (categoria, team, veicolo, numero).

---

## 5. Consegna ed editing dei roadbook di evento

Il collante col resto dell'app sono due controlli in `events.php`, entrambi costruiti su
`event_rights_on_roadbook`:

- **Lettura consegnata (#25):** `event_grants_read($uid, $roadbookId)` — un roadbook `ready`
  associato a un evento è leggibile da **partecipanti e organizzatori** di quell'evento. È il
  gate usato da [`public_get`](backend-api.md) per servire una rotta "pronta" agli iscritti pur
  restando privata al pubblico. *(La protezione completa — niente download/GPX/PDF per i
  partecipanti, finestra temporale — è la P4 ancora aperta, #25.)*
- **Co-editing (#123):** `event_co_edits_roadbook($uid, $roadbookId)` — gli organizzatori
  possono **editare** un roadbook associato all'evento anche se non ne sono proprietari. È il gate
  usato da `rb_require_edit` nell'[Editor](editor.md): la proprietà e la pubblicazione restano del
  proprietario, l'editing è condiviso, e la concorrenza è gestita dal **soft lock** (#154, vedi
  editor.md §7.2). L'Editor mostra i roadbook co-editabili via `rb_coedit_list`.

---

## 6. Le action (riassunto)

Tutte in `events.php`, instradate da `index.php`; `events_list` ed `event_get` sono **GET**
(pubbliche), il resto **POST** autenticato. Dettaglio auth e payload in
[backend-api §2](backend-api.md).

| Gruppo | Action |
|---|---|
| Pubbliche (GET) | `events_list`, `event_get` |
| Gestione | `events_manage`, `event_manage_get`, `event_save`, `event_delete`, `event_logo_remove` |
| Associazioni roadbook | `event_rb_add`, `event_rb_remove`, `event_rb_mode` |
| Co-organizzatori | `user_search`, `event_org_add`, `event_org_remove` |
| Partecipanti | `event_join_code`, `event_join`, `event_leave`, `event_participant_remove`, `event_participant_add`, `event_participants_list`, `event_activate_by_code`, `participant_activate` |

---

## 7. Stato delle fasi (epic #6)

- ✅ **P0** stati di pubblicazione roadbook (#96) · **P1** entità + listing + presentazione +
  console admin (#111) · **P2.1** ruolo organizer (#121) · **P2.2** categorie (#122) · **P2.3**
  partecipanti + join-by-code + pagina gestione + co-organizzatori (#123/#140) · **P3** soft lock
  di co-editing (#154).
- ⏳ **P2.4** entry self-select (#124) — il partecipante sceglie categoria + entry; manca la
  tabella `event_entries`.
- ⏳ **P4** viewer partecipante non-ridistribuibile completo + PDF organizzatore (#25) — la
  lettura gated è già live, manca il blocco di download/PDF/stampa e la finestra temporale.

---

## 8. Entry gate e flusso partecipante (#163)

### URL scheme

Il punto di ingresso per un partecipante è il link breve `/go/<join_code>` (es.
`https://rdbk.ddev.site/go/DA2C0926`). Questo URL è **distribuito solo al banco
registrazione** (QR cartaceo o link inviato all'arrivo) — chi lo riceve è già in
presenza dell'organizzatore e quindi pronto a consumare (leggere) i roadbook
dell'evento.

### Flusso

1. Il partecipante apre `/go/<code>`.
2. Se non autenticato → redirect a `/account/?next=/go/<code>`.
3. Se autenticato e non ancora iscritto → viene creato come **pending** (in attesa
   di attivazione) e reindirizzato a `/event/<slug>`.
4. Se autenticato e già **active** → viene impostato il contesto partecipante
   (cookie `rb_participant=1` + sessione lato server) e reindirizzato a
   `/event/<slug>`.
5. A questo punto la pagina evento mostra la **roadbook gallery** al completo
   (public + ready) e, se il roadbook ha `scoring_mode ≠ free`, il **link alla
   classifica**.

### Riduzione della superficie (participant mode)

Quando il cookie `rb_participant=1` è attivo:
- La **top nav** mostra solo un link di ritorno all'evento (nessun tool Recorder,
  Editor, Tripmaster…).
- La **home page** (`/`) reindirizza a `/event/<slug>`.
- Il **menu account** contiene l'escape hatch "Switch to full mode".
- La pagina evento nasconde il form di join, il sito organizzatore e la mappa HQ.
- Il **Ranking** è accessibile solo se l'evento ha almeno un roadbook con
  `scoring_mode ≠ free`.

## 9. Limiti e quirk

- **Un evento per roadbook** in pratica: un roadbook può essere associato a più eventi via
  `event_roadbooks`, ma il flusso di gestione e il co-editing assumono un uso 1-a-1; per riusarne
  uno conviene **duplicarlo** (`rb_duplicate`).
- **`scoring_mode` è metadato**, non ancora un motore: `free`/`roadbook_suite` classificano
  l'associazione ma il punteggio effettivo resta sul Reader Competition + Ranking; `fia` è
  riservato/disabilitato.
- **Nessuna finestra temporale applicata**: `starts_on`/`ends_on` sono informativi; la consegna
  `ready` non è ancora limitata alle date dell'evento (parte di P4, #25).
- **Join code = accesso in lettura ai `ready`**, non un login: chi ha il codice e un account
  aderisce e vede le rotte pronte; la protezione contro la redistribuzione è ancora parziale (P4).
- **Il proprietario non è rimovibile** dagli organizzatori; per cambiare proprietà non c'è
  un'azione dedicata (solo un admin può intervenire).
