# Il backend PHP di RDBK

Come funziona l'API server di RDBK.app: account, storage dei roadbook per-utente, foto
geotaggate e challenge pubbliche. Documento di riferimento per il modello dati e gli
endpoint del back-end.

> Il front-end è una PWA che **funziona del tutto senza il server**: crei, leggi, esporti e
> importi `.rdbk` interamente nel browser. L'API è un livello *opzionale* che aggiunge
> soltanto gli account e la condivisione — login, salvataggio dei roadbook nel proprio
> profilo, gallerie foto e la pubblicazione di challenge pubbliche.

Stack: **PHP 8.1 + MariaDB**, configurazione via `.env` ([phpdotenv](../app/bootstrap.php#L6)).
Il codice di logica vive in `app/` (fuori dalla web root), i due endpoint HTTP in `public/api/`.

---

## 1. Architettura e flusso di una richiesta

```
front-end (RBApi)                public/api/                 app/
─────────────────                ───────────                 ─────
RBApi('rb_save', body) ──POST──▶ index.php (router) ──────▶ roadbooks.php  ──▶ MariaDB + storage/users/
RBUpload(...)          ──POST──▶ upload.php          ──────▶ images.php     ──▶ public/photos/ , public/avatars/
                                       │
                                 bootstrap.php  (carica .env, apre la sessione, include db/mail/auth/roadbooks/admin/settings/events)
```

- **Un unico front controller per le action JSON:** [`public/api/index.php`](../public/api/index.php)
  riceve tutte le chiamate `RBApi(...)` e fa il dispatch su `$action`.
- **Un endpoint separato per i file binari:** [`public/api/upload.php`](../public/api/upload.php)
  riceve i `multipart/form-data` (avatar, logo evento, foto galleria, cover, note vocali), perché
  il router JSON parla solo JSON.
- Entrambi gli entry point caricano per prima cosa [`app/bootstrap.php`](../app/bootstrap.php),
  che costruisce `$CFG` dall'`.env`, apre la sessione e include `db.php`, `mail.php`, `auth.php`,
  `roadbooks.php`, `admin.php`, `settings.php`, `events.php`.

### Il front-end parla con l'API
`RBApi(action, body)` (descritto in `CLAUDE.md`, definito in `app.js`) fa una POST JSON a
`index.php` con `{ action, ...body }`. La risposta è sempre JSON: `{ ok: true, ... }` in caso
di successo, `{ ok: false, error: "..." }` con codice HTTP appropriato in caso di errore
([`fail()`](../app/bootstrap.php#L52)).

---

## 2. Il router `index.php`

Il dispatch è uno `switch ($action)` ([index.php:19](../public/api/index.php#L19)). Prima dello
switch ci sono i guard di metodo e di origine.

### Regole di metodo e CSRF
- **Solo cinque action sono leggibili via GET** — `config`, `public_list`, `public_get`,
  `events_list`, `event_get` (l'array `$readOnly` in `index.php`); tutto ciò che cambia stato
  esige `POST`, altrimenti `405`. Questo blocca il CSRF via navigazione GET top-level con il
  cookie di sessione `SameSite=Lax`.
- **Same-origin guard sulle POST:** ogni POST passa da `require_same_origin()` (helper
  condiviso in `bootstrap.php`): se è presente l'header `Origin`, il suo host deve coincidere
  con l'`Host` della richiesta, altrimenti `403 Bad origin`. Lo **stesso** helper è invocato
  in `upload.php`.
- Ogni eccezione non gestita viene loggata e tradotta in un generico `500 Server error` — i
  messaggi interni non trapelano al client.

### Le action dell'API

Le action sono definite in `app/auth.php` (account/admin), `app/roadbooks.php` (roadbook/foto/
audio/pubblici) e `app/events.php` (eventi). Colonna **Auth**: *nessuna* = anonima · *opzionale*
= `current_user()` (funziona da anonimo, eleva i permessi se loggato) · *richiesta* =
`require_user()` (401 senza sessione né Bearer token) · *admin* = `require_admin()` ·
*organizer* = ruolo organizer (o admin).

**Account & sessione** (`auth.php`)

| Action | Cosa fa | Auth |
|--------|---------|:----:|
| `config` | Bootstrap del front-end: chiave Turnstile (sito), **`google_client`** (id OAuth Web per il pulsante GIS, #46), utente corrente (con `manages_events` per chi co-organizza un evento) e il **banner** di sito | nessuna |
| `register` | Crea l'account (richiede `password_confirm` **e** `accept_terms`, timbra `terms_accepted_at`/`terms_version`) e invia la mail di verifica | nessuna |
| `verify` | Verifica l'email tramite token | nessuna |
| `login` | Login (email **o** username), rigenera la sessione, restituisce anche un Bearer token | nessuna |
| `google_auth` | **Google Sign-In (#46)**: verifica l'ID token Google (tokeninfo: firma/`iss`/`exp`, `aud` ∈ `GOOGLE_CLIENT_IDS`), poi (1) accede all'account già collegato via `google_sub`, (2) lo collega a un account con email **verificata** corrispondente, o (3) crea un account Google *senza password* (richiede `accept_terms`; se manca risponde `need_terms`). Rigenera la sessione + Bearer token come `login` | nessuna |
| `logout` | Distrugge la sessione e revoca il Bearer token usato | sessione |
| `forgot` / `reset` | Mail di reset password (risposta sempre positiva) / nuova password via token | nessuna |
| `profile` | Aggiorna nome/cognome/bio, **organizzazione** e la lingua delle note vocali (`voice_lang`) | richiesta |
| `save_location` | Salva la posizione mappa di default (`default_lat`/`default_lon`); coppia non valida → azzera | richiesta |
| `set_lang` | Salva la lingua UI preferita (`ui_lang`, whitelist `en`/`es`/`it`) | richiesta |
| `change_password` | Cambia la password da loggati (vedi [user-management](user-management.md)) | richiesta |
| `change_email` / `verify_email_change` | Cambio email con ri-verifica (`pending_email` + link) / conferma dal link | richiesta / nessuna |
| `account_delete` | Elimina il proprio account (vedi [user-management](user-management.md)) | richiesta |

**Admin** (`auth.php` — tutte `require_admin()`): `admin_users`, `admin_set_role`,
`admin_verify`, `admin_block`, `admin_update`, `admin_delete`, `admin_activity`,
`admin_settings`/`admin_save_settings`, `admin_logs`, `admin_roadbooks`, `admin_unpublish`,
`admin_user_roadbooks`, `admin_set_status`, `admin_move_roadbook`,
`admin_trash_list`/`admin_rb_restore`/`admin_rb_purge` (cestino roadbook, #187) — gestione utenti,
ruoli, verifica/blocco, log attività, banner/impostazioni, e moderazione roadbook (vedi
[user-management](user-management.md)).

**Eventi** (`events.php`)

| Action | Cosa fa | Auth |
|--------|---------|:----:|
| `events_manage` | Elenca gli eventi che l'utente può gestire (propri + co-organizzati; tutti per admin) | richiesta |
| `event_manage_get` | Dati completi di un evento per la pagina di gestione | richiesta |
| `event_save` | Crea/aggiorna un evento (creare esige il ruolo **organizer**); lo **slug pubblico segue il titolo** — rigenerato dal titolo a ogni salvataggio, quindi un rename aggiorna `/event/<slug>` (#194) | richiesta/organizer |
| `event_delete` | Elimina un evento | richiesta |
| `event_rb_add`/`event_rb_remove`/`event_rb_mode` | Associa/dissocia un roadbook all'evento; imposta la sua `scoring_mode` | richiesta |
| `event_org_add`/`event_org_remove` | Aggiunge/rimuove un co-organizzatore (`event_organizers`) | richiesta |
| `event_join_code` | Genera/rigenera il codice di adesione dell'evento | richiesta |
| `event_join`/`event_leave` | Adesione con codice / abbandono (`event_participants`) | richiesta |
| `event_participant_remove` / `event_participants_list` | Rimuove / elenca (paginato) i partecipanti | richiesta |
| `event_logo_remove` | Rimuove il logo evento | richiesta |
| `user_search` | Ricerca utenti (per aggiungere organizzatori), filtrata per organizzazione | richiesta |
| `events_list` | Elenco pubblico degli eventi | nessuna |
| `event_get` | Vista pubblica di un evento via slug | nessuna |

**Roadbook, foto, audio, pubblici** (`roadbooks.php`)

| Action | Cosa fa | Auth |
|--------|---------|:----:|
| `rb_list` | Elenca i propri roadbook (metadati, con `status`) | richiesta |
| `rb_coedit_list` | Elenca i roadbook altrui che puoi co-editare via un tuo evento (#123) | richiesta |
| `rb_get` | Carica un roadbook che puoi editare (proprietario **o** co-editor di evento); restituisce `status`/`reusable`/`is_owner`/`owner` e, se richiesto (`lock`), acquisisce il soft lock | richiesta |
| `rb_lock_refresh`/`rb_lock_release`/`rb_lock_force` | Heartbeat / rilascio / presa forzata del soft lock (#154) | richiesta |
| `rb_draft` | Crea una bozza vuota (intitolata col nome, #148) per agganciarvi foto/audio in registrazione | richiesta |
| `rb_save` | Salva/aggiorna un roadbook (`status` draft/ready/public + `reusable`; solo il proprietario ne cambia pubblicazione; rifiuta 409 se un altro tiene il lock) | richiesta |
| `rb_status` | Cambia solo lo `status` di pubblicazione (proprietario) | richiesta |
| `rb_duplicate` | Duplica un proprio roadbook (file + riga + galleria **+ audio**), in **una transazione**; la copia parte `draft` | richiesta |
| `rb_delete` | **Cestina** un proprio roadbook (soft-delete → `status='deleted'`, #187): sparisce dalle viste utente, i file restano 30gg per il ripristino admin | richiesta |
| `ph_list` / `ph_delete` / `ph_move` | Elenca (pubblico, proprio o co-editato) / elimina / sposta il geotag di una foto | opzionale / richiesta / richiesta |
| `audio_list` / `audio_delete` | Elenca / elimina una nota vocale | opzionale / richiesta |
| `public_list` | Galleria pubblica: ultimi 60 `status='public'` (con `reusable=1` filtra i clonabili, #106) | nessuna |
| `public_get` | Carica via slug un roadbook `public` (o proprio, o **`ready` per i partecipanti/organizzatori** del suo evento, #25); include foto + `cover` + dati autore | opzionale |

`current_user()` — il payload restituito da `config` e da `login` — include anche le preferenze
utente: `ui_lang` (lingua UI scelta), `voice_lang` (lingua delle note vocali), la posizione mappa
di default `default_lat`/`default_lon` (numero o `null`, mai stringhe `DECIMAL`) e i flag di ruolo
(`is_admin`, `is_organizer`), così il front-end li applica subito.

L'upload immagini **non** è un'action di `index.php`: è il file separato `upload.php`
(vedi §6), invocato dal front-end via `RBUpload`.

---

## 3. Configurazione, sessione e connessione DB

### `.env` → `$CFG` (bootstrap.php)
[`bootstrap.php`](../app/bootstrap.php#L8) carica l'`.env` con phpdotenv (`safeLoad`, non fallisce
se manca) e costruisce l'array `$CFG`:

| Chiave `$CFG` | Variabile `.env` | Uso |
|---------------|------------------|-----|
| `db.*` | `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASS` | connessione PDO |
| `sendgrid_key`, `mail_from`, `mail_from_name` | `SENDGRID_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | invio email |
| `base_url` | `BASE_URL` | link nelle email |
| `app_secret` | `APP_SECRET` | pepper per l'hashing dei token |
| `turnstile_site`, `turnstile_secret` | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Cloudflare Turnstile |
| `storage` | — (`<root>/storage/users`) | file `.rdbk` privati per-utente |
| `avatars_dir`, `photos_dir`, `audio_dir`, `event_logos_dir` | — (`public/avatars`, `public/photos`, `public/audio`, `public/event-logos`) | immagini, note vocali e loghi evento serviti via web |

`bootstrap.php` definisce anche la costante **`DEFAULT_QUOTA_BYTES`** (50 MB, #99): la quota disco
di default per utente, sovrascrivibile per singolo utente da un admin (`users.quota_bytes`).

### Sessione (sliding, 60 giorni)
Cookie `rdbksid` con `SESSION_LIFETIME = 60 giorni`, `Secure` + `HttpOnly` + `SameSite=Lax`
([bootstrap.php:34](../app/bootstrap.php#L34)). È **scorrevole**: ad ogni richiesta con
sessione attiva il cookie viene riemesso con scadenza rinnovata
([bootstrap.php:40](../app/bootstrap.php#L40)) — così l'app installata resta loggata "come
nativa".

### Connessione PDO (db.php)
[`db()`](../app/db.php#L2) restituisce un singleton PDO MySQL (`utf8mb4`) con eccezioni
attive, fetch associativo di default e **prepared statement reali** (`EMULATE_PREPARES =
false`). Tutte le query passano da prepared statement: non c'è concatenazione di SQL.

### Helper trasversali (bootstrap.php)
- `json_out($data, $code)` / `json_in()` / `fail($msg, $code)` — I/O JSON
  ([bootstrap.php:45](../app/bootstrap.php#L45)).
- `rate_limit($key, $max, $window)` — rate limit leggero via **APCu**; è un **no-op se
  l'estensione non è caricata** ([bootstrap.php:66](../app/bootstrap.php#L66)). Usato su
  `register` (10/h), `login` (20/15min), `forgot` (8/15min) per IP. Al primo hit della
  finestra registra quando scade, così la risposta `429` include `retry_after` (secondi
  da attendere) oltre a `{ok:false, error:'Too many attempts. Please wait a moment.'}` — il
  form di login lo trasforma in un countdown.
- `client_ip()` — legge `REMOTE_ADDR` ([bootstrap.php:77](../app/bootstrap.php#L77)).

---

## 4. Autenticazione (auth.php)

### Token: random + hash con pepper
I token (verifica email, reset, API) sono 32 byte casuali esadecimali
([`new_token`](../app/auth.php#L7)). Nel DB si salva **solo** l'hash
`sha256(token + '|' + app_secret)` ([`token_hash`](../app/auth.php#L8)): il valore in chiaro
esiste solo nella mail o sul dispositivo. Le password usano `password_hash`/`password_verify`
(bcrypt di default).

### Registrazione e verifica email
[`register_user`](../app/auth.php): valida nome/cognome, username (`^[a-zA-Z0-9_.-]{3,40}$`),
email e password (≥ 8 caratteri, con `password_confirm` corrispondente), esige il **consenso ai
Termini** (`accept_terms`, #135) — timbrato server-side come `terms_accepted_at = NOW()` +
`terms_version` (la versione autorevole del server, mai quella del client) — passa per Turnstile,
controlla unicità di username/email, crea l'utente non verificato con un `verify_token` valido
24 h, e invia la mail con link `/account/?verify=<raw>`. [`verify_email`](../app/auth.php) consuma
il token (controllo scadenza) e setta `email_verified = 1`.

### Login e sessione
[`login_user`](../app/auth.php#L181): accetta **email *oppure* username** nello stesso campo,
verifica la password, **rifiuta gli account non verificati** (`403`), poi
`session_regenerate_id(true)` (anti session-fixation) e salva `$_SESSION['uid']`. Restituisce
anche un **Bearer token** ([`issue_api_token`](../app/auth.php#L21)) — vedi sotto.

### Bearer token per le app native
Una webview Capacitor non porta il cookie di sessione cross-origin, quindi le app native si
autenticano con un Bearer token (tabella `api_tokens`). [`current_user`](../app/auth.php#L27)
prima prova la sessione, poi ricade su `Authorization: Bearer <token>`
([`bearer_token`](../app/auth.php#L13), che legge anche `REDIRECT_HTTP_AUTHORIZATION` /
`apache_request_headers`), aggiornando `last_used_at`. Il web non tocca mai questo percorso.
`logout` revoca il token usato ([auth.php:199](../app/auth.php#L199)).

### Reset password
[`forgot_password`](../app/auth.php#L205): genera un `reset_token` valido 1 h e invia la mail,
ma **risponde sempre positivamente** per non rivelare se un'email è registrata
([auth.php:220](../app/auth.php#L220)). [`reset_password`](../app/auth.php#L223) consuma il
token e aggiorna l'hash.

### Cambio email (con ri-verifica del nuovo indirizzo)
[`change_email`](../app/auth.php#L239) (da loggati): valida il nuovo indirizzo, ne controlla
l'unicità (anche contro i `pending_email` altrui), lo salva in **`pending_email`** e invia un
link di conferma `/account/?verifyemail=<raw>` **al nuovo indirizzo** (token valido 24 h, che
riusa `verify_token`/`verify_expires`, liberi su un account già verificato). **L'email attuale
resta attiva finché la conferma non avviene.** [`verify_email_change`](../app/auth.php#L258)
apre il link (basato su token, senza sessione, come il reset): rifa il controllo di unicità e
fa lo switch `email ← pending_email`, azzerando `pending_email` e i token. Questo chiude il
vecchio limite "niente cambio email da loggati".

### Preferenze utente (lingua + posizione di default)
- [`set_lang`](../app/auth.php#L78): salva la lingua UI preferita in **`ui_lang`** (whitelist
  `en`/`es`/`it`), così la scelta dal selettore di lingua dell'header segue l'utente tra
  dispositivi. Valore non nella whitelist → `400`.
- [`save_location`](../app/auth.php#L88): salva la posizione mappa di default in
  **`default_lat`/`default_lon`**. Valida la coppia (numerica, `|lat| ≤ 90`, `|lon| ≤ 180`):
  se manca o è fuori range, **azzera** entrambe a `NULL`. Serve a centrare la mappa quando non
  c'è ancora un fix GPS (apertura del Recorder, o disegno di una rotta da zero nell'Editor).
- [`update_profile`](../app/auth.php) gestisce nome/cognome/bio, **`organization`** (testo libero,
  usato per filtrare la ricerca organizzatori, #123) e la lingua delle note vocali **`voice_lang`**
  (whitelist `''`/`en-US`/`es-ES`/`it-IT`; `''` = segue il dispositivo).

### Account reviewer pre-verificato
La migrazione [007](../migrations/007_reviewer_account.sql) inserisce un utente
`reviewer / reviewer@rdbk.app` con `email_verified = 1` (bypassa la verifica) per la
revisione Google Play e il testing interno. È un **utente normale e non privilegiato**: può
fare solo ciò che può un qualsiasi utente loggato. L'upsert (`ON DUPLICATE KEY`) ne resetta la
password se rieseguita.

### Cloudflare Turnstile
[`verify_turnstile`](../app/auth.php#L125) protegge `register`/`login`/`forgot`. È un **no-op se
`turnstile_secret` è vuoto** (feature non ancora attivata): in locale e senza configurazione,
i form passano senza challenge.

---

## 5. Storage dei roadbook per-utente (roadbooks.php)

**Modello ibrido:** i *metadati* stanno nella tabella `roadbooks`; il *JSON completo del
roadbook* è un file su disco in `storage/users/<user_id>/<id>.rdbk`
([`rb_dir`](../app/roadbooks.php#L6), `mkdir 0700`), fuori dalla web root e servito **solo**
attraverso questi endpoint autenticati. Lo storage lato server resta **JSON puro**: il
contenitore ZIP `.rdbk` (con foto/audio) è solo l'artefatto di export/import client-side.

### Lo stato di pubblicazione (`status`, non più `is_public`)
Dalla migrazione 015 (#96) il ciclo di vita di un roadbook è un enum **`status`** =
`draft` → `ready` → `public` (in lavorazione → pronto → pubblicato), che **sostituisce** il
vecchio flag binario `is_public`. La migrazione 029 (#187) aggiunge lo stato **`deleted`** (cestino):
- `public` è l'unico stato visibile a un non proprietario (galleria, Reader, `/challenge`);
- `draft`/`ready` sono privati, salvo la consegna di evento (`ready` ai partecipanti, vedi
  `public_get`);
- `reusable` (#106) è un flag ortogonale: un roadbook **pubblico** può opt-in a essere clonabile
  da altri.
- `deleted` (#187) è il **cestino**: `rb_delete` ci sposta il roadbook (invece di cancellarlo),
  che sparisce da ogni vista utente (le viste pubbliche filtrano già `status='public'`); solo la
  pagina admin **`/admin/trash/`** lo elenca, può ripristinarlo (`admin_rb_restore` → torna
  `draft`) o eliminarlo subito (`admin_rb_purge`, riga+file). Il cron lo purga dopo 30gg
  (`cron/purge-trashed-roadbooks.php`, slot 2 del round-robin; `updated_at` = quando è stato
  cestinato). La cancellazione **account/utente** resta invece erasure immediata.

### Salvataggio (`rb_save`)
`rb_save` valida che il payload abbia `notes` e `track`, deriva titolo/distanza/conteggio note dal
`meta`, normalizza `status` (`rb_clean_status`) e `reusable`, e:
- **con `id > 0`:** aggiorna la riga e riscrive il file **nello storage del proprietario**;
  l'accesso passa da `rb_require_edit` (proprietario **o** co-editor di evento, #123). Un
  **co-editor non cambia** `status`/`reusable` (restano quelli del proprietario); la prima salvata
  di una bozza (`filename = 'pending'`) materializza `<id>.rdbk`. **Soft lock (#154):** se un altro
  tiene un lock fresco → `409`; altrimenti il save prende/rinnova il lock.
- **senza `id`:** inserisce (sempre come proprio), scrive `<id>.rdbk` e genera lo slug.

Ogni roadbook riceve sempre uno **slug** (`unique_slug`): base slugificata dal titolo, de-duplicata
con suffisso `-2`, `-3`… ed unico a livello DB (`uq_slug`). Lo slug esiste anche per i privati (la
pagina di vista funziona pure su privato per il proprietario).

### Bozza per foto/audio live (`rb_draft`)
`rb_draft` crea una riga vuota (`note_count = 0`, `status='draft'`, `filename = 'pending'`)
all'avvio della registrazione, **intitolata col nome scelto** (#148) invece del vecchio segnaposto
"Recording…", così foto e note vocali scattate dal vivo si agganciano subito a un `roadbook_id`. Le
bozze mai finite vengono ripulite dal cron round-robin (`cron/cron.php` → `cleanup-drafts.php`).

### Lista, lettura, duplicazione, eliminazione
- `rb_list`: metadati dei propri roadbook ordinati per `updated_at`. `rb_coedit_list`: i roadbook
  **altrui** che puoi co-editare tramite un tuo evento (ognuno nomina l'evento di provenienza).
- `rb_get`: via `rb_require_edit` legge il `.rdbk` di un roadbook che puoi editare (proprietario
  **o** co-editor). Restituisce `status`, `reusable`, `is_owner`/`owner` (che pilotano la UI di
  co-editing) e, **se il chiamante lo chiede** (`lock`), acquisisce il soft lock — l'Editor lo
  chiede, il Reader no. Per una bozza senza file torna uno scheletro vuoto da disegnare.
- `rb_duplicate`: in **una singola transazione** copia file `.rdbk`, riga DB, intera galleria foto
  **e le note vocali** (file + righe) in un nuovo roadbook; un errore a metà fa rollback (niente
  copie parziali). La copia parte `draft`, con titolo "… (copy)" e slug proprio.
- `rb_delete`: cancella **prima la riga, poi il file** (una DELETE fallita non deve perdere il
  file); foto/audio spariscono in cascata via FK.

### Endpoint pubblici (challenge / community)
- `public_list`: join `roadbooks ⨝ users`, solo `status = 'public'` con slug, ultimi 60, con una
  thumbnail (prima foto della galleria, che è la cover `_map.avif` a `sort -1` se presente).
  `reusable=1` nel body filtra i soli clonabili (la ricerca di fork dell'Editor, #106).
- `public_get`: carica un roadbook via **slug**. È servito se `public`, **o** al proprietario, **o**
  — se `ready` — ai **partecipanti/organizzatori dell'evento** a cui è associato (#25,
  `event_grants_read`); altrimenti `403`. Include il `.rdbk`, la lista foto (esclusa la cover), la
  `cover` a parte, e i dati pubblici dell'autore. È la base della pagina challenge / vista pubblica.

---

## 6. Upload e pipeline media (upload.php + images.php)

### upload.php — i cinque tipi di upload
[`upload.php`](../public/api/upload.php) richiede sempre un utente loggato (`require_user()`) e
applica lo stesso `require_same_origin()` del router. Accetta `multipart` con un campo file
(`photo` per le immagini, `audio` per le note vocali; max **12 MB**, deve essere un vero
`is_uploaded_file`). Gli upload che consumano spazio (foto/audio) verificano prima la **quota
disco per-utente**: superata, rispondono **`413`** (`user_disk_bytes` vs `user_quota_bytes`, §5).

- **`type=avatar`** → AVIF quadrato 256px in `public/avatars/<user_id>.avif`; aggiorna
  `users.avatar` e risponde con l'URL cache-busted.
- **`type=event_logo` + `event=<id>`** (#151) → logo evento, AVIF max 512px in
  `public/event-logos/<event_id>.avif`. Richiede i diritti di gestione dell'evento
  (`require_event_manage`: proprietario / co-organizzatore / admin); aggiorna `events.logo`.
- **`type=photo` + `roadbook=<id>`** → foto galleria, max 1600px. Verifica la proprietà del
  roadbook, impone un tetto di **60 foto** per galleria, e accetta `lat`/`lon` opzionali (geotag)
  clampati al range valido. La riga viene inserita come `pending`, poi il file prende un nome
  **non indovinabile** (`bin2hex(random_bytes(8)).avif`) così le foto di roadbook privati non sono
  enumerabili; se l'elaborazione fallisce la riga viene rimossa.
- **`type=cover` + `roadbook=<id>`** (#123) → la **cover auto-generata** (mappa del percorso,
  prodotta lato client da `cover-map.js`): una sola entry di galleria riservata al nome fisso
  **`_map.avif`** con `sort -1` (prima → è la thumbnail di home/liste), **esclusa** dallo swipe
  foto pubblico. Sovrascritta ad ogni save (anche di un co-editor). Accesso via `rb_require_edit`.
- **`type=audio` + `roadbook=<id>`** → nota vocale di un waypoint, **archiviata così com'è
  (nessun transcoding)** accanto alla sua trascrizione, così una trascrizione errata si può
  riascoltare. Verifica la proprietà del roadbook, impone un tetto di **200 note** per roadbook,
  accetta `lat`/`lon` opzionali, deriva l'estensione dal MIME del browser
  (`webm`/`ogg`/`m4a`/`mp3`/`wav`, default `webm`) e usa lo stesso nome **non indovinabile** in
  `public/audio/<roadbook_id>/`. Inserisce la riga in `roadbook_audio`. Gestita lato JSON da
  `audio_list`/`audio_delete` (vedi §2).

### images.php — decodifica → AVIF
[`process_to_avif`](../app/images.php#L6) (GD): decodifica qualsiasi immagine, **scarta gli
input oltre 50 MP** (guardia anti decompression-bomb), corregge l'orientamento da EXIF,
opzionalmente ritaglia in quadrato, ridimensiona per stare entro `maxDim` e scrive un **AVIF
compresso**. **L'originale non viene mai salvato** (il tmp di PHP è auto-rimosso). Le note
vocali non passano da qui: l'audio è conservato tal quale.

> Foto e note vocali sono una **funzione solo dell'app** (storage lato server, geotaggate): non
> finiscono mai dentro il file `.rdbk`, che resta autocontenuto e portabile (vedi `CLAUDE.md`).

---

## 7. Email (mail.php)

[`send_mail`](../app/mail.php#L3) invia HTML tramite la **SendGrid v3 API** (cURL, Bearer
key). Se la chiave non è configurata logga e ritorna `false` (in locale le mail semplicemente
non partono, il resto funziona). [`mail_html`](../app/mail.php#L28) e
[`mail_button`](../app/mail.php#L36) compongono il template brandizzato; il bottone fa
`htmlspecialchars` sull'URL.

---

## 8. Schema del database (migrations/)

Le migrazioni sono SQL ordinate in [`migrations/`](../migrations); lo schema corrente è la
loro somma.

| File | Cosa introduce |
|------|----------------|
| [001_init.sql](../migrations/001_init.sql) | tabelle `users` e `roadbooks` |
| [002_community.sql](../migrations/002_community.sql) | `users.bio` / `users.avatar`; `roadbooks.is_public` / `slug` (unico) |
| [003_photos.sql](../migrations/003_photos.sql) | tabella `roadbook_photos` (FK + cascade) |
| [004_distance.sql](../migrations/004_distance.sql) | `roadbooks.km_total` → `total_distance` (metri interi) |
| [005_photo_geo.sql](../migrations/005_photo_geo.sql) | `roadbook_photos.lat` / `lon` (geotag) |
| [006_api_tokens.sql](../migrations/006_api_tokens.sql) | tabella `api_tokens` (Bearer per le app native) |
| [007_reviewer_account.sql](../migrations/007_reviewer_account.sql) | utente reviewer pre-verificato (upsert) |
| [008_admin.sql](../migrations/008_admin.sql) · [009_admin_user_flags.sql](../migrations/009_admin_user_flags.sql) | `users.is_admin`; `users.must_change_password` / `blocked` (vedi [user-management](user-management.md)) |
| [010_voice_lang.sql](../migrations/010_voice_lang.sql) | `users.voice_lang` (lingua speech-to-text delle note vocali) |
| [011_pending_email.sql](../migrations/011_pending_email.sql) | `users.pending_email` (cambio email in attesa di conferma) |
| [012_roadbook_audio.sql](../migrations/012_roadbook_audio.sql) | tabella `roadbook_audio` (note vocali, FK + cascade, geotag) |
| [013_default_location.sql](../migrations/013_default_location.sql) | `users.default_lat` / `default_lon` (posizione mappa di default) |
| [014_ui_lang.sql](../migrations/014_ui_lang.sql) | `users.ui_lang` (lingua UI preferita, `en`/`es`/`it`) |
| [015_roadbook_status.sql](../migrations/015_roadbook_status.sql) | `roadbooks.status` enum `draft`/`ready`/`public` (#96); backfill dal vecchio `is_public` |
| [016_user_quota.sql](../migrations/016_user_quota.sql) | `users.quota_bytes` (override nullable sulla quota disco di default, #99) |
| [017_activity_log.sql](../migrations/017_activity_log.sql) | tabella `activity_log` (audit sicurezza, IP anonimizzato, auto-purge 90 gg, #86) |
| [018_settings.sql](../migrations/018_settings.sql) | tabella `settings` key/value di sito (banner e futuri flag, #103) |
| [019_events.sql](../migrations/019_events.sql) | tabelle `events` + `event_roadbooks` (entità evento + associazioni, #6) |
| [020_organizer_role.sql](../migrations/020_organizer_role.sql) | `users.is_organizer` (ruolo organizzatore eventi, #121) |
| [021_terms_consent.sql](../migrations/021_terms_consent.sql) | `users.terms_accepted_at` / `terms_version` (consenso ai Termini alla registrazione, #135) |
| [022_event_participation.sql](../migrations/022_event_participation.sql) | `event_roadbooks.scoring_mode` + tabella `event_categories` (#6/#122) |
| [023_event_participants.sql](../migrations/023_event_participants.sql) | `users.organization`, `events.join_code`, tabelle `event_organizers` + `event_participants` (#123) |
| [024_event_logo.sql](../migrations/024_event_logo.sql) | `events.logo` (logo evento, #151) |
| [025_roadbook_locks.sql](../migrations/025_roadbook_locks.sql) | tabella `roadbook_locks` (soft lock di co-editing, TTL 10 min, #154) |
| [026_roadbook_reusable.sql](../migrations/026_roadbook_reusable.sql) | `roadbooks.reusable` (roadbook pubblico clonabile, #106) |
| [027_listing_indexes.sql](../migrations/027_listing_indexes.sql) | indici compositi per le query di listing calde (#171) |
| [028_google_auth.sql](../migrations/028_google_auth.sql) | `users.google_sub` (UNIQUE) + `password_hash` NULLABLE (Google Sign-In, #46) |
| [029_roadbook_trash.sql](../migrations/029_roadbook_trash.sql) | `roadbooks.status` enum + valore `deleted` (cestino soft-delete, #187) |

**Tabelle:** `users`, `roadbooks`, `roadbook_photos`, `roadbook_audio`, `roadbook_locks`,
`api_tokens`, `activity_log`, `settings`, `events`, `event_roadbooks`, `event_categories`,
`event_organizers`, `event_participants`. I token (verify/reset/api) sono colonne/righe con
**solo l'hash**; `pending_email` tiene il nuovo indirizzo finché il cambio non è confermato. Le FK
sono `ON DELETE CASCADE`: cancellare un utente porta via i suoi roadbook, i suoi eventi e le sue
righe di partecipazione; cancellare un roadbook porta via foto, note vocali e lock; i suoi token
restano legati all'utente. Ogni migrazione dello schema segue la **regola schema-first** (applicata
a prod *prima* del codice che la legge, vedi `CLAUDE.md`).

---

## 9. Sicurezza — note oneste

- **CSRF:** difeso da `SameSite=Lax` + il vincolo POST-only sulle action di stato + il
  same-origin guard. Non c'è un token anti-CSRF esplicito: la difesa si regge su quei tre
  pilastri (e sull'header `Origin`, che però è facoltativo nel controllo —
  [index.php:15](../public/api/index.php#L15) salta il guard se `Origin` è assente).
- **Rate limiting:** dipende da **APCu**; se l'estensione non è installata, `rate_limit` è un
  **silenzioso no-op** e register/login/forgot non hanno alcun freno
  ([bootstrap.php:66](../app/bootstrap.php#L66)).
- **Iniezione SQL:** non possibile per come è scritto — prepared statement reali ovunque,
  nessuna concatenazione.
- **Foto e note vocali priv<i>ate</i>:** non sono dietro auth a livello di file — stanno in
  `public/photos/` e `public/audio/` e sono servite staticamente dal web server. La protezione
  è il **nome casuale a 16 hex** (non enumerabile), non un controllo di accesso. Chi ha l'URL
  vede/ascolta il media anche se il roadbook è privato.
- **Avatar prevedibili:** l'avatar è `public/avatars/<user_id>.avif`, cioè un URL pubblico e
  indovinabile dato l'`id` — accettabile perché l'avatar è per natura pubblico.
- **Firma del Bearer token:** è un segreto opaco hashato con pepper; la revoca è per-token su
  logout. Non c'è scadenza dei token API (solo `last_used_at` come traccia).
- **Verifica email del reviewer:** bypassata di proposito (account di test); è comunque non
  privilegiato.
- **Errori:** ogni eccezione diventa un generico `500` lato client e finisce in `error_log` —
  niente dettagli interni esposti.

---

## 10. Limiti

- **Username non modificabile dall'utente:** da loggati si può cambiare email (con
  ri-verifica), password ed eliminare l'account (vedi [user-management](user-management.md)),
  ma lo **username** lo cambia solo un admin (`admin_update`).
- **Niente re-invio della mail di verifica:** se il link a 24 h scade, l'account resta
  inattivabile dai soli endpoint qui presenti.
- **Rate limit fragile:** assente senza APCu (vedi §9).
- **Quota disco per-utente (#99):** oltre ai tetti locali (60 foto *per galleria*, 200 note
  vocali *per roadbook*, 12 MB *per upload*) c'è un limite di spazio totale per account
  (`DEFAULT_QUOTA_BYTES` 50 MB, sovrascrivibile per utente da un admin via `quota_bytes`):
  superato, gli upload di foto/audio rispondono `413`. Non c'è invece un tetto sul numero di
  roadbook.
- **Foto e note vocali private non sono davvero private** a livello di accesso (vedi §9): la
  riservatezza è "by obscurity" via nome file casuale.
- **Pulizia differita al cron** (`cron/cron.php`, round-robin un task/minuto): bozze `rb_draft`
  mai finite (`note_count = 0`, slot 0), retention log attività 90gg (slot 1) e purga del cestino
  roadbook a 30gg (slot 2, #187). Serve lo scheduler di sistema (`* * * * *`).
- **Un solo livello di condivisione** (pubblico/privato): niente link non-listati, niente
  permessi per-utente o collaborazione.
- **SendGrid hard-coded** come provider mail; nessun fallback SMTP.
