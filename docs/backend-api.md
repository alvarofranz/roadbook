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
                                 bootstrap.php  (carica .env, apre la sessione, include db/auth/mail/roadbooks)
```

- **Un unico front controller per le action JSON:** [`public/api/index.php`](../public/api/index.php)
  riceve tutte le chiamate `RBApi(...)` e fa il dispatch su `$action`.
- **Un endpoint separato per i file binari:** [`public/api/upload.php`](../public/api/upload.php)
  riceve i `multipart/form-data` (avatar e foto galleria), perché il router JSON parla solo JSON.
- Entrambi gli entry point caricano per prima cosa [`app/bootstrap.php`](../app/bootstrap.php),
  che costruisce `$CFG` dall'`.env`, apre la sessione e include `db.php`, `mail.php`,
  `auth.php`, `roadbooks.php`.

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
- **Solo tre action sono leggibili via GET** — `config`, `public_list`, `public_get`
  ([index.php:10](../public/api/index.php#L10)); tutto ciò che cambia stato esige `POST`,
  altrimenti `405`. Questo blocca il CSRF via navigazione GET top-level con il cookie di
  sessione `SameSite=Lax`.
- **Same-origin guard sulle POST:** se è presente l'header `Origin`, il suo host deve
  coincidere con l'`Host` della richiesta, altrimenti `403 Bad origin`
  ([index.php:13](../public/api/index.php#L13)). Lo stesso controllo è ripetuto in
  `upload.php` ([upload.php:11](../public/api/upload.php#L11)).
- Ogni eccezione non gestita viene loggata e tradotta in un generico `500 Server error`
  ([index.php:40](../public/api/index.php#L40)) — i messaggi interni non trapelano al client.

### Le action dell'API

| Action | Cosa fa | Auth |
|--------|---------|:----:|
| `config` | Restituisce la chiave Turnstile (sito) e l'utente corrente — bootstrap del front-end ([index.php:20](../public/api/index.php#L20)) | nessuna |
| `register` | Crea l'account e invia la mail di verifica ([auth.php:141](../app/auth.php#L141)) | nessuna |
| `verify` | Verifica l'email tramite token ([auth.php:170](../app/auth.php#L170)) | nessuna |
| `login` | Login, rigenera la sessione, restituisce anche un Bearer token ([auth.php:181](../app/auth.php#L181)) | nessuna |
| `logout` | Distrugge la sessione e revoca il Bearer token usato ([auth.php:198](../app/auth.php#L198)) | sessione |
| `forgot` | Invia la mail di reset password (risposta sempre positiva) ([auth.php:205](../app/auth.php#L205)) | nessuna |
| `reset` | Imposta una nuova password tramite token ([auth.php:223](../app/auth.php#L223)) | nessuna |
| `profile` | Aggiorna nome/cognome/bio e la lingua delle note vocali (`voice_lang`) ([auth.php:64](../app/auth.php#L64)) | **richiesta** |
| `save_location` | Salva la posizione mappa di default dell'utente (`default_lat`/`default_lon`); una coppia non valida o mancante la azzera ([auth.php:88](../app/auth.php#L88)) | **richiesta** |
| `set_lang` | Salva la lingua UI preferita (`ui_lang`, whitelist `en`/`es`/`it`) ([auth.php:78](../app/auth.php#L78)) | **richiesta** |
| `change_password` | Cambia la password da loggati (vedi [user-management](user-management.md)) ([auth.php:99](../app/auth.php#L99)) | **richiesta** |
| `change_email` | Avvia il cambio email con ri-verifica del nuovo indirizzo (`pending_email` + link) ([auth.php:239](../app/auth.php#L239)) | **richiesta** |
| `verify_email_change` | Conferma il nuovo indirizzo dal link e fa lo switch ([auth.php:258](../app/auth.php#L258)) | nessuna |
| `account_delete` | Elimina il proprio account (vedi [user-management](user-management.md)) ([auth.php:113](../app/auth.php#L113)) | **richiesta** |
| `rb_list` | Elenca i roadbook dell'utente (metadati) ([roadbooks.php:13](../app/roadbooks.php#L13)) | **richiesta** |
| `rb_get` | Carica un proprio roadbook (JSON `.rdbk` completo), gated su proprietario ([roadbooks.php:19](../app/roadbooks.php#L19)) | **richiesta** |
| `rb_draft` | Crea una bozza vuota per agganciarvi le foto durante la registrazione ([roadbooks.php:51](../app/roadbooks.php#L51)) | **richiesta** |
| `rb_save` | Salva/aggiorna un roadbook (pubblico o privato) ([roadbooks.php:57](../app/roadbooks.php#L57)) | **richiesta** |
| `rb_duplicate` | Duplica un proprio roadbook (file + riga + galleria) ([roadbooks.php:86](../app/roadbooks.php#L86)) | **richiesta** |
| `rb_delete` | Elimina un proprio roadbook (file + riga) ([roadbooks.php:183](../app/roadbooks.php#L183)) | **richiesta** |
| `ph_list` | Elenca le foto di un roadbook (pubblico, o proprio se privato) ([roadbooks.php:123](../app/roadbooks.php#L123)) | opzionale |
| `ph_delete` | Elimina una foto di un proprio roadbook ([roadbooks.php:136](../app/roadbooks.php#L136)) | **richiesta** |
| `ph_move` | Aggiorna il geotag (lat/lon) di una foto di un proprio roadbook ([roadbooks.php:169](../app/roadbooks.php#L169)) | **richiesta** |
| `audio_list` | Elenca le note vocali di un roadbook (pubblico, o proprio se privato) ([roadbooks.php:182](../app/roadbooks.php#L182)) | opzionale |
| `audio_delete` | Elimina una nota vocale di un proprio roadbook ([roadbooks.php:195](../app/roadbooks.php#L195)) | **richiesta** |
| `public_list` | Galleria pubblica home: ultimi 60 roadbook pubblici ([roadbooks.php:208](../app/roadbooks.php#L208)) | nessuna |
| `public_get` | Carica un roadbook pubblico via slug (o proprio se privato) ([roadbooks.php:221](../app/roadbooks.php#L221)) | opzionale |

Le action che chiamano `require_user()` ([auth.php:52](../app/auth.php#L52)) rispondono `401`
se non c'è una sessione né un Bearer token valido. Quelle con auth *opzionale* usano
`current_user()`: funzionano da anonimo ma elevano i permessi se l'utente è loggato (es.
vedere i propri roadbook privati, foto e note vocali).

`current_user()` ([auth.php:27](../app/auth.php#L27)) — il payload restituito da `config` e da
`login` — include anche le preferenze utente: `ui_lang` (lingua UI scelta), `voice_lang`
(lingua delle note vocali) e la posizione mappa di default `default_lat`/`default_lon`,
normalizzate a numero o `null` (mai stringhe `DECIMAL`), così il front-end le applica subito.

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
| `avatars_dir`, `photos_dir`, `audio_dir` | — (`public/avatars`, `public/photos`, `public/audio`) | immagini e note vocali servite via web |

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
[`register_user`](../app/auth.php#L141): valida nome/cognome, username (`^[a-zA-Z0-9_.-]{3,40}$`),
email e password (≥ 8 caratteri), passa per Turnstile, controlla unicità di username/email,
crea l'utente non verificato con un `verify_token` valido 24 h, e invia la mail con link
`/account/?verify=<raw>`. [`verify_email`](../app/auth.php#L170) consuma il token (controllo
scadenza) e setta `email_verified = 1`.

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
- [`update_profile`](../app/auth.php#L64) gestisce nome/cognome/bio e la lingua delle note
  vocali **`voice_lang`** (whitelist `''`/`en-US`/`es-ES`/`it-IT`; `''` = segue il dispositivo).

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

**Modello ibrido:** i *metadati* stanno nella tabella `roadbooks`; il *JSON `.rdbk` completo*
è un file su disco in `storage/users/<user_id>/<id>.rdbk`
([`rb_dir`](../app/roadbooks.php#L6), `mkdir 0700`), fuori dalla web root e servito **solo**
attraverso questi endpoint autenticati.

### Salvataggio (`rb_save`)
[`rb_save`](../app/roadbooks.php#L57) valida che il payload abbia `notes` e `track`, deriva
titolo/distanza/conteggio note dal `meta`, e:
- **con `id > 0`:** aggiorna la riga e riscrive il file dell'utente (controllo di proprietà
  `user_id`); la prima salvata di una bozza (`filename = 'pending'`) materializza
  `<id>.rdbk`.
- **senza `id`:** inserisce, ottiene l'`id` autoincrement, scrive `<id>.rdbk` e genera lo slug.

Ogni roadbook riceve sempre uno **slug** ([`rb_slug`](../app/roadbooks.php#L31)): base
slugificata dal titolo (max 60 char), de-duplicata con suffisso `-2`, `-3`… È unico a livello
DB (`uq_slug`). Lo slug esiste anche per i privati (la pagina di vista funziona pure su
privato per il proprietario). Il flag `is_public` distingue pubblico/privato.

### Bozza per le foto live (`rb_draft`)
[`rb_draft`](../app/roadbooks.php#L51) crea una riga vuota (`note_count = 0`, titolo
"Recording…", `filename = 'pending'`) all'avvio della registrazione, così le foto scattate dal
vivo si agganciano subito a un `roadbook_id`. Le bozze mai finite vengono ripulite da un cron
(menzionato nel commento, non presente in questo repo).

### Lista, lettura, duplicazione, eliminazione
- [`rb_list`](../app/roadbooks.php#L13): metadati dei propri roadbook ordinati per
  `updated_at`.
- [`rb_get`](../app/roadbooks.php#L19): legge il file `.rdbk` di un roadbook **proprio**
  (gated su `id` + `user_id`). Lo usa il Reader via `/reader/?rb=<id>` per aprire un proprio
  roadbook personale/non pubblico, oltre all'Editor (per una bozza senza file restituisce uno
  scheletro vuoto da disegnare). Per i roadbook pubblici la lettura passa invece da
  `public_get` via slug.
- [`rb_duplicate`](../app/roadbooks.php#L86): copia file `.rdbk`, riga DB **e** intera galleria
  foto (file + righe) in un nuovo roadbook; la copia parte **privata**, con titolo
  "… (copy)" e slug proprio.
- [`rb_delete`](../app/roadbooks.php#L183): cancella file e riga (la galleria sparisce in
  cascata via FK).

### Endpoint pubblici (challenge / community)
- [`public_list`](../app/roadbooks.php#L208): join `roadbooks ⨝ users`, solo `is_public = 1`
  con slug, ultimi 60, con una thumbnail (prima foto della galleria). Alimenta la galleria
  della home.
- [`public_get`](../app/roadbooks.php#L221): carica un roadbook via **slug**. Se è privato, lo
  serve **solo al proprietario** (`403` altrimenti), e include il `.rdbk`, la lista foto e i
  dati pubblici dell'autore (username, nome, bio, avatar). È la base della pagina challenge /
  vista pubblica.

---

## 6. Upload e pipeline media (upload.php + images.php)

### upload.php — i tre tipi di upload
[`upload.php`](../public/api/upload.php) richiede sempre un utente loggato
([upload.php:10](../public/api/upload.php#L10)) e applica lo stesso same-origin guard del
router ([upload.php:11](../public/api/upload.php#L11)). Accetta `multipart` con un campo file
(`photo` per immagini, `audio` per le note vocali; max **12 MB**, deve essere un vero
`is_uploaded_file`):

- **`type=avatar`** ([upload.php:45](../public/api/upload.php#L45)) → AVIF quadrato 256px in
  `public/avatars/<user_id>.avif`; aggiorna `users.avatar` e risponde con l'URL cache-busted.
- **`type=photo` + `roadbook=<id>`** ([upload.php:53](../public/api/upload.php#L53)) → foto
  galleria, max 1600px. Verifica la proprietà del roadbook, impone un tetto di **60 foto** per
  galleria, e accetta `lat`/`lon` opzionali (geotag) clampati al range valido. La riga viene
  inserita come `pending`, poi il file prende un nome **non indovinabile**
  (`bin2hex(random_bytes(8)).avif`) così le foto di roadbook privati non sono enumerabili; se
  l'elaborazione fallisce la riga viene rimossa.
- **`type=audio` + `roadbook=<id>`** ([upload.php:14](../public/api/upload.php#L14)) → nota
  vocale di un waypoint, **archiviata così com'è (nessun transcoding)** accanto alla sua
  trascrizione, così una trascrizione errata si può riascoltare. Verifica la proprietà del
  roadbook, impone un tetto di **200 note** per roadbook, accetta `lat`/`lon` opzionali, deriva
  l'estensione dal MIME del browser (`webm`/`ogg`/`m4a`/`mp3`/`wav`, default `webm`) e usa lo
  stesso nome **non indovinabile** in `public/audio/<roadbook_id>/`. Inserisce la riga in
  `roadbook_audio`. Gestita lato JSON da `audio_list`/`audio_delete` (vedi §2).

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

**Tabelle:** `users`, `roadbooks`, `roadbook_photos`, `roadbook_audio`, `api_tokens`. I token
(verify/reset/api) sono colonne/righe `CHAR(64)` con **solo l'hash**; `pending_email` tiene il
nuovo indirizzo finché il cambio non è confermato. Le FK sono `ON DELETE CASCADE`: cancellare
un utente porta via i suoi roadbook, e cancellare un roadbook porta via le sue foto e note
vocali; i suoi token restano legati all'utente.

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
- **Storage non quotato per utente:** tetto di 60 foto *per galleria*, 200 note vocali *per
  roadbook* e 12 MB *per upload*, ma nessun limite sul numero di roadbook né sullo spazio
  totale per account.
- **Foto e note vocali private non sono davvero private** a livello di accesso (vedi §9): la
  riservatezza è "by obscurity" via nome file casuale.
- **Pulizia bozze esternalizzata a un cron** non incluso nel repo: le bozze
  `rb_draft` mai finite (`note_count = 0`) restano finché un job esterno non le purga.
- **Un solo livello di condivisione** (pubblico/privato): niente link non-listati, niente
  permessi per-utente o collaborazione.
- **SendGrid hard-coded** come provider mail; nessun fallback SMTP.
