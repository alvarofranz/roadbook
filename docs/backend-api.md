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
| `register` | Crea l'account e invia la mail di verifica ([auth.php:68](../app/auth.php#L68)) | nessuna |
| `verify` | Verifica l'email tramite token ([auth.php:97](../app/auth.php#L97)) | nessuna |
| `login` | Login, rigenera la sessione, restituisce anche un Bearer token ([auth.php:108](../app/auth.php#L108)) | nessuna |
| `logout` | Distrugge la sessione e revoca il Bearer token usato ([auth.php:124](../app/auth.php#L124)) | sessione |
| `forgot` | Invia la mail di reset password (risposta sempre positiva) ([auth.php:131](../app/auth.php#L131)) | nessuna |
| `reset` | Imposta una nuova password tramite token ([auth.php:149](../app/auth.php#L149)) | nessuna |
| `profile` | Aggiorna la bio dell'utente ([auth.php:45](../app/auth.php#L45)) | **richiesta** |
| `rb_list` | Elenca i roadbook dell'utente (metadati) ([roadbooks.php:13](../app/roadbooks.php#L13)) | **richiesta** |
| `rb_get` | Carica un proprio roadbook (JSON `.rdbk` completo) ([roadbooks.php:19](../app/roadbooks.php#L19)) | **richiesta** |
| `rb_draft` | Crea una bozza vuota per agganciarvi le foto durante la registrazione ([roadbooks.php:45](../app/roadbooks.php#L45)) | **richiesta** |
| `rb_save` | Salva/aggiorna un roadbook (pubblico o privato) ([roadbooks.php:51](../app/roadbooks.php#L51)) | **richiesta** |
| `rb_duplicate` | Duplica un proprio roadbook (file + riga + galleria) ([roadbooks.php:86](../app/roadbooks.php#L86)) | **richiesta** |
| `rb_delete` | Elimina un proprio roadbook (file + riga) ([roadbooks.php:183](../app/roadbooks.php#L183)) | **richiesta** |
| `ph_list` | Elenca le foto di un roadbook (pubblico, o proprio se privato) ([roadbooks.php:123](../app/roadbooks.php#L123)) | opzionale |
| `ph_delete` | Elimina una foto di un proprio roadbook ([roadbooks.php:136](../app/roadbooks.php#L136)) | **richiesta** |
| `public_list` | Galleria pubblica home: ultimi 60 roadbook pubblici ([roadbooks.php:149](../app/roadbooks.php#L149)) | nessuna |
| `public_get` | Carica un roadbook pubblico via slug (o proprio se privato) ([roadbooks.php:162](../app/roadbooks.php#L162)) | opzionale |

Le action che chiamano `require_user()` ([auth.php:43](../app/auth.php#L43)) rispondono `401`
se non c'è una sessione né un Bearer token valido. Quelle con auth *opzionale* usano
`current_user()`: funzionano da anonimo ma elevano i permessi se l'utente è loggato (es.
vedere i propri roadbook privati).

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
| `avatars_dir`, `photos_dir` | — (`public/avatars`, `public/photos`) | immagini servite via web |

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
  l'estensione non è caricata** ([bootstrap.php:55](../app/bootstrap.php#L55)). Usato su
  `register` (10/h), `login` (20/15min), `forgot` (8/15min) per IP.
- `client_ip()` — legge `REMOTE_ADDR` ([bootstrap.php:60](../app/bootstrap.php#L60)).

---

## 4. Autenticazione (auth.php)

### Token: random + hash con pepper
I token (verifica email, reset, API) sono 32 byte casuali esadecimali
([`new_token`](../app/auth.php#L7)). Nel DB si salva **solo** l'hash
`sha256(token + '|' + app_secret)` ([`token_hash`](../app/auth.php#L8)): il valore in chiaro
esiste solo nella mail o sul dispositivo. Le password usano `password_hash`/`password_verify`
(bcrypt di default).

### Registrazione e verifica email
[`register_user`](../app/auth.php#L68): valida nome/cognome, username (`^[a-zA-Z0-9_.-]{3,40}$`),
email e password (≥ 8 caratteri), passa per Turnstile, controlla unicità di username/email,
crea l'utente non verificato con un `verify_token` valido 24 h, e invia la mail con link
`/account/?verify=<raw>`. [`verify_email`](../app/auth.php#L97) consuma il token (controllo
scadenza) e setta `email_verified = 1`.

### Login e sessione
[`login_user`](../app/auth.php#L108): accetta **email *oppure* username** nello stesso campo,
verifica la password, **rifiuta gli account non verificati** (`403`), poi
`session_regenerate_id(true)` (anti session-fixation) e salva `$_SESSION['uid']`. Restituisce
anche un **Bearer token** ([`issue_api_token`](../app/auth.php#L21)) — vedi sotto.

### Bearer token per le app native
Una webview Capacitor non porta il cookie di sessione cross-origin, quindi le app native si
autenticano con un Bearer token (tabella `api_tokens`). [`current_user`](../app/auth.php#L27)
prima prova la sessione, poi ricade su `Authorization: Bearer <token>`
([`bearer_token`](../app/auth.php#L13), che legge anche `REDIRECT_HTTP_AUTHORIZATION` /
`apache_request_headers`), aggiornando `last_used_at`. Il web non tocca mai questo percorso.
`logout` revoca il token usato ([auth.php:125](../app/auth.php#L125)).

### Reset password
[`forgot_password`](../app/auth.php#L131): genera un `reset_token` valido 1 h e invia la mail,
ma **risponde sempre positivamente** per non rivelare se un'email è registrata
([auth.php:145](../app/auth.php#L145)). [`reset_password`](../app/auth.php#L149) consuma il
token e aggiorna l'hash.

### Account reviewer pre-verificato
La migrazione [007](../migrations/007_reviewer_account.sql) inserisce un utente
`reviewer / reviewer@rdbk.app` con `email_verified = 1` (bypassa la verifica) per la
revisione Google Play e il testing interno. È un **utente normale e non privilegiato**: può
fare solo ciò che può un qualsiasi utente loggato. L'upsert (`ON DUPLICATE KEY`) ne resetta la
password se rieseguita.

### Cloudflare Turnstile
[`verify_turnstile`](../app/auth.php#L52) protegge `register`/`login`/`forgot`. È un **no-op se
`turnstile_secret` è vuoto** (feature non ancora attivata): in locale e senza configurazione,
i form passano senza challenge.

---

## 5. Storage dei roadbook per-utente (roadbooks.php)

**Modello ibrido:** i *metadati* stanno nella tabella `roadbooks`; il *JSON `.rdbk` completo*
è un file su disco in `storage/users/<user_id>/<id>.rdbk`
([`rb_dir`](../app/roadbooks.php#L6), `mkdir 0700`), fuori dalla web root e servito **solo**
attraverso questi endpoint autenticati.

### Salvataggio (`rb_save`)
[`rb_save`](../app/roadbooks.php#L51) valida che il payload abbia `notes` e `track`, deriva
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
[`rb_draft`](../app/roadbooks.php#L45) crea una riga vuota (`note_count = 0`, titolo
"Recording…", `filename = 'pending'`) all'avvio della registrazione, così le foto scattate dal
vivo si agganciano subito a un `roadbook_id`. Le bozze mai finite vengono ripulite da un cron
(menzionato nel commento, non presente in questo repo).

### Lista, lettura, duplicazione, eliminazione
- [`rb_list`](../app/roadbooks.php#L13): metadati dei propri roadbook ordinati per
  `updated_at`.
- [`rb_get`](../app/roadbooks.php#L19): legge il file `.rdbk` di un roadbook **proprio**.
- [`rb_duplicate`](../app/roadbooks.php#L86): copia file `.rdbk`, riga DB **e** intera galleria
  foto (file + righe) in un nuovo roadbook; la copia parte **privata**, con titolo
  "… (copy)" e slug proprio.
- [`rb_delete`](../app/roadbooks.php#L183): cancella file e riga (la galleria sparisce in
  cascata via FK).

### Endpoint pubblici (challenge / community)
- [`public_list`](../app/roadbooks.php#L149): join `roadbooks ⨝ users`, solo `is_public = 1`
  con slug, ultimi 60, con una thumbnail (prima foto della galleria). Alimenta la galleria
  della home.
- [`public_get`](../app/roadbooks.php#L162): carica un roadbook via **slug**. Se è privato, lo
  serve **solo al proprietario** (`403` altrimenti), e include il `.rdbk`, la lista foto e i
  dati pubblici dell'autore (username, nome, bio, avatar). È la base della pagina challenge /
  vista pubblica.

---

## 6. Upload e pipeline immagini (upload.php + images.php)

### upload.php — i due tipi di upload
[`upload.php`](../public/api/upload.php) richiede sempre un utente loggato
([upload.php:9](../public/api/upload.php#L9)) e accetta `multipart` con il campo file `photo`
(max **12 MB**, deve essere un vero `is_uploaded_file`):

- **`type=avatar`** ([upload.php:17](../public/api/upload.php#L17)) → AVIF quadrato 256px in
  `public/avatars/<user_id>.avif`; aggiorna `users.avatar` e risponde con l'URL cache-busted.
- **`type=photo` + `roadbook=<id>`** ([upload.php:25](../public/api/upload.php#L25)) → foto
  galleria, max 1600px. Verifica la proprietà del roadbook, impone un tetto di **60 foto** per
  galleria, e accetta `lat`/`lon` opzionali (geotag) clampati al range valido. La riga viene
  inserita come `pending`, poi il file prende un nome **non indovinabile**
  (`bin2hex(random_bytes(8)).avif`) così le foto di roadbook privati non sono enumerabili; se
  l'elaborazione fallisce la riga viene rimossa.

### images.php — decodifica → AVIF
[`process_to_avif`](../app/images.php#L6) (GD): decodifica qualsiasi immagine, **scarta gli
input oltre 50 MP** (guardia anti decompression-bomb), corregge l'orientamento da EXIF,
opzionalmente ritaglia in quadrato, ridimensiona per stare entro `maxDim` e scrive un **AVIF
compresso**. **L'originale non viene mai salvato** (il tmp di PHP è auto-rimosso).

> Le foto sono una **funzione solo dell'app** (storage lato server, geotaggate): non finiscono
> mai dentro il file `.rdbk`, che resta autocontenuto e portabile (vedi `CLAUDE.md`).

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

**Tabelle:** `users`, `roadbooks`, `roadbook_photos`, `api_tokens`. I token (verify/reset/api)
sono colonne/righe `CHAR(64)` con **solo l'hash**. Le FK sono `ON DELETE CASCADE`: cancellare
un utente porta via i suoi roadbook, e cancellare un roadbook porta via le sue foto e
(idealmente) i suoi token restano legati all'utente.

---

## 9. Sicurezza — note oneste

- **CSRF:** difeso da `SameSite=Lax` + il vincolo POST-only sulle action di stato + il
  same-origin guard. Non c'è un token anti-CSRF esplicito: la difesa si regge su quei tre
  pilastri (e sull'header `Origin`, che però è facoltativo nel controllo —
  [index.php:15](../public/api/index.php#L15) salta il guard se `Origin` è assente).
- **Rate limiting:** dipende da **APCu**; se l'estensione non è installata, `rate_limit` è un
  **silenzioso no-op** e register/login/forgot non hanno alcun freno
  ([bootstrap.php:56](../app/bootstrap.php#L56)).
- **Iniezione SQL:** non possibile per come è scritto — prepared statement reali ovunque,
  nessuna concatenazione.
- **Foto priv<i>ate</i>:** non sono dietro auth a livello di file — stanno in `public/photos/` e
  sono servite staticamente dal web server. La protezione è il **nome casuale a 16 hex**
  (non enumerabile), non un controllo di accesso. Chi ha l'URL vede la foto anche se il
  roadbook è privato.
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

- **Niente endpoint per cancellare l'account** né per cambiare email/username/password da
  loggati (esiste solo `profile` per la bio); la password si cambia solo via flusso
  forgot/reset.
- **Niente re-invio della mail di verifica:** se il link a 24 h scade, l'account resta
  inattivabile dai soli endpoint qui presenti.
- **Rate limit fragile:** assente senza APCu (vedi §9).
- **Storage non quotato per utente:** tetto di 60 foto *per galleria* e 12 MB *per upload*, ma
  nessun limite sul numero di roadbook né sullo spazio totale per account.
- **Le foto private non sono davvero private** a livello di accesso (vedi §9): la riservatezza
  è "by obscurity" via nome file casuale.
- **Pulizia bozze esternalizzata a un cron** non incluso nel repo: le bozze
  `rb_draft` mai finite (`note_count = 0`) restano finché un job esterno non le purga.
- **Un solo livello di condivisione** (pubblico/privato): niente link non-listati, niente
  permessi per-utente o collaborazione.
- **SendGrid hard-coded** come provider mail; nessun fallback SMTP.
