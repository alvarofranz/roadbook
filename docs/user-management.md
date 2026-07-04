# Gestione utenti (admin)

Come funziona la **gestione utenti** di RDBK: il pannello admin (`/admin`), il modello di
permessi, le azioni amministrative sugli account e le funzioni self-service (cambio password,
cambio email con ri-verifica, eliminazione account, cambio password forzato). Documento di
riferimento per chi tocca auth/admin lato back-end o le pagine relative.

> Il dominio è diviso tra back-end e front-end. Lato server vive in
> [app/auth.php](../app/auth.php) (autenticazione + permessi) e
> [app/admin.php](../app/admin.php) (azioni admin), esposto dal router
> [public/api/index.php](../public/api/index.php). Lato client il pannello è
> [public/admin/](../public/admin/) e le funzioni self-service stanno in
> [public/account/](../public/account/). Lo schema è versionato in
> [migrations/](../migrations/). Per il resto dell'API vedi [backend-api](backend-api.md).

---

## 1. Modello dei permessi

Due ruoli: **`is_admin`** (amministrazione completa) e **`is_organizer`** (#121, gestisce i
propri eventi). Esiste anche una **quota disco per-utente** (#99), applicata in scrittura.

L'admin **effettivo** è dato da `is_admin` del DB **oppure** dall'email presente in
`ADMIN_EMAILS` nel `.env` (`is_admin()` / `is_locked_admin()` in app/auth.php):

```php
function is_locked_admin(string $email): bool {           // superuser .env (failsafe)
    return in_array(strtolower($email), $CFG['admin_emails'], true);
}
function is_admin(?array $u): bool {
    if ((int)($u['is_admin'] ?? 0) === 1) return true;    // flag DB
    return is_locked_admin((string)($u['email'] ?? ''));  // bootstrap .env
}
```

L'**organizer effettivo** è `is_organizer(u) = is_admin(u) || u.is_organizer` (`app/auth.php`):
un admin gestisce ogni evento, un utente con il flag gestisce i propri. Gate delle azioni
eventi in [events.php](../app/events.php) (vedi [backend-api](backend-api.md)).

`$CFG['admin_emails']` è popolato in [app/bootstrap.php](../app/bootstrap.php) dalla variabile
d'ambiente `ADMIN_EMAILS` (lista separata da virgole, normalizzata a minuscolo).

**Superuser "bloccati" (failsafe).** Gli account elencati in `ADMIN_EMAILS` sono il
salvavita del proprietario: restano admin anche se "rimossi" dal pannello, e **non possono
essere declassati, bloccati o eliminati** (controllo `locked` nelle azioni admin). Questo
evita di restare chiusi fuori dal proprio sito.

Il gate delle API admin è `require_admin()` (app/auth.php): richiede sessione valida **e**
admin effettivo, altrimenti `403`.

### Bootstrap del primo admin
Non esiste un'UI per creare il primo admin (sarebbe un uovo-e-gallina). Il primo admin si
inietta via `.env`:

```
ADMIN_EMAILS=proprietario@example.com
```

Una volta che quell'account può accedere al pannello, può promuovere altri tramite il flag DB.

---

## 2. Modello dati

Lo schema `users` è esteso da diverse migrazioni (vedi anche [backend-api](backend-api.md) §schema):

| Migrazione | Colonna aggiunta | Tipo | Significato |
|---|---|---|---|
| [008_admin.sql](../migrations/008_admin.sql) | `is_admin` | `TINYINT(1)` def. 0 | ruolo amministratore (flag DB) |
| [009_admin_user_flags.sql](../migrations/009_admin_user_flags.sql) | `must_change_password` | `TINYINT(1)` def. 0 | l'utente deve cambiare password al prossimo accesso |
| [009_admin_user_flags.sql](../migrations/009_admin_user_flags.sql) | `blocked` | `TINYINT(1)` def. 0 | account bloccato (login rifiutato) |
| [010_voice_lang.sql](../migrations/010_voice_lang.sql) | `voice_lang` | `VARCHAR(16)` def. `''` | lingua speech-to-text delle note vocali (`''` = segue il dispositivo) |
| [011_pending_email.sql](../migrations/011_pending_email.sql) | `pending_email` | `VARCHAR(190)` NULL | nuovo indirizzo email in attesa di conferma (cambio email) |
| [013_default_location.sql](../migrations/013_default_location.sql) | `default_lat` / `default_lon` | `DECIMAL(10,7)` NULL | posizione mappa di default dell'utente |
| [014_ui_lang.sql](../migrations/014_ui_lang.sql) | `ui_lang` | `VARCHAR(5)` NULL | lingua UI preferita (una delle 5 lingue; NULL = segue il browser) |
| [016_user_quota.sql](../migrations/016_user_quota.sql) | `quota_bytes` | `BIGINT` NULL | override della quota disco (NULL = default di sistema, `DEFAULT_QUOTA_BYTES` 50 MB) |
| [020_organizer_role.sql](../migrations/020_organizer_role.sql) | `is_organizer` | `TINYINT(1)` def. 0 | ruolo organizzatore eventi (#121) |
| [021_terms_consent.sql](../migrations/021_terms_consent.sql) | `terms_accepted_at` / `terms_version` | timestamp / stringa | consenso alle Condizioni d'uso registrato alla registrazione (#135) |

Colonne preesistenti rilevanti: `email_verified` (verifica email), `password_hash`
(bcrypt via `password_hash`). I roadbook usano ora un enum `status` (draft/ready/public, #96)
e un flag `reusable` (#106) — vedi [backend-api](backend-api.md).

> ⚠️ **Applicazione in produzione.** Il runner automatico applica `migrations/*.sql`
> **solo su un DB vuoto** (salta tutto se la tabella `users` esiste già). Su un database
> popolato le **nuove** migrazioni vanno eseguite a mano, una sola volta e in ordine
> (sono `ALTER TABLE ... ADD COLUMN`, non idempotenti). Vedi §7.

---

## 3. Azioni amministrative (back-end)

Tutte in [app/admin.php](../app/admin.php), tutte dietro `require_admin()` nel router.

| Azione API | Funzione | Cosa fa |
|---|---|---|
| `admin_users` | `admin_users()` | elenca gli utenti con uso disco, ruolo, flag, n. roadbook (filtrabile per evento) |
| `admin_verify` | `admin_verify()` | forza l'attivazione (`email_verified=1`, azzera il token) per chi non ha cliccato il link |
| `admin_set_role` | `admin_set_role()` | promuove/declassa admin **o** organizer (rifiuta la demozione admin di un superuser `.env`) |
| `admin_block` | `admin_block()` | blocca/sblocca (rifiuta su superuser `.env` e su se stessi) |
| `admin_update` | `admin_update_user()` | modifica nome/cognome/username/email; password opzionale → forza il cambio; anche `quota_bytes` e `is_organizer` |
| `admin_delete` | `admin_delete_user()` | elimina utente + file (rifiuta su superuser `.env` e su se stessi) |
| `admin_activity` | `admin_activity()` | timeline attività dell'utente (#86, IP anonimizzati) |
| `admin_user_roadbooks` / `admin_set_status` / `admin_move_roadbook` | — | vista per-utente dei roadbook, cambio stato, riassegnazione owner (#126) |
| `admin_roadbooks` / `admin_unpublish` | — | moderazione dei roadbook pubblici |
| `admin_settings` / `admin_save_settings` / `admin_logs` | — | banner del sito + log operativi (#103/#86) |

Dettagli rilevanti:

- **`admin_update_user`** ([app/admin.php](../app/admin.php)): valida username/email (unici,
  formato), aggiorna l'identità, e **se** è fornita una password (≥8 char) imposta il nuovo
  hash con `must_change_password = 1`. La password è quindi *temporanea*: serve solo per il
  primo accesso.
- **`admin_block`**: imposta `blocked`. Non puoi bloccare te stesso né un superuser `.env`.
- **Eliminazione dati.** Le funzioni di cleanup file (`purge_user_files`, `user_roadbook_ids`,
  `user_disk_bytes`, `dir_size`, `rrmdir`) vivono in admin.php. L'ordine è: si raccolgono
  **prima** gli id dei roadbook dell'utente (`user_roadbook_ids`, servono a risolvere le
  cartelle media), si esegue la **DELETE della riga** utente (le righe collegate —
  roadbook/foto/note vocali/token — cadono per `ON DELETE CASCADE`), e **solo dopo** si
  cancellano i file (`purge_user_files($uid, $rbIds)`). Così una DELETE fallita non lascia mai
  un account vivo senza i suoi file.

### Login: account bloccato
In `login_user()` (app/auth.php) il controllo del blocco sta **dopo** la verifica della
password e **prima** di quella sull'email verificata:

```php
if (!$u || !password_verify($pass, $u['password_hash'])) fail('Wrong email/username or password.', 401);
if ((int)($u['blocked'] ?? 0)) fail('Your account has been blocked — contact the administrator.', 403);
if (!(int)$u['email_verified']) fail('Please verify your email first (check your inbox).', 403);
```

---

## 4. Self-service dell'utente

In [app/auth.php](../app/auth.php), esposte da `change_password` / `change_email` /
`verify_email_change` / `account_delete`, e legate dalla pagina account.

- **`current_user()`** (app/auth.php) restituisce sempre `is_admin`, `is_organizer`,
  `email_verified` e `must_change_password` come interi, così il front-end può fare check di
  verità affidabili; include anche le preferenze `ui_lang`, `voice_lang`, `organization` e la
  posizione di default `default_lat`/`default_lon` (numeri o `null`).
- **`change_password()`** (app/auth.php): normalmente richiede la
  password attuale; se l'utente ha `must_change_password` attivo la imposta **senza** la
  attuale (l'admin gliene ha data una temporanea). In entrambi i casi il flag viene azzerato.
- **Cambio email con ri-verifica.** [`change_email()`](../app/auth.php#L239) valida il nuovo
  indirizzo, ne controlla l'unicità (anche contro i `pending_email` altrui) e lo salva in
  **`pending_email`**, poi invia un link di conferma `/account/?verifyemail=<raw>` **al nuovo
  indirizzo** (token 24 h che riusa `verify_token`/`verify_expires`). L'email attuale resta
  attiva finché la conferma non avviene. [`verify_email_change()`](../app/auth.php#L258) apre il
  link (basato su token, senza sessione, come il reset), rifà il controllo di unicità e fa lo
  switch `email ← pending_email`. È self-service: lo username, invece, lo cambia solo un admin.
- **`account_delete()`** ([app/auth.php:113](../app/auth.php#L113)): verifica la password,
  cancella i file (`purge_user_files`) e la riga, e distrugge la sessione.

---

## 5. Pannello admin (front-end)

[public/admin/index.html](../public/admin/index.html) + [admin.js](../public/admin/admin.js),
una IIFE che parla a `/api` con la sessione (cookie). Stile tabellare con CSS locale nella
pagina (badge, azioni per riga).

- **`init()`**: gate via `config` — non loggato → invito al login; non admin → "Solo
  amministratori".
- **`load()`**: `admin_users` → render della tabella; ogni riga ha i pulsanti contestuali
  cablati a `data-*` (`data-role`, `data-verify`, `data-block`, `data-edit`, `data-del`).
- **`rowHtml(u)`**: badge `admin` / `blocked` / `must change password` / `unverified`;
  pulsanti **Activate** (solo se non verificato), **Edit**, **Make/Remove admin**,
  **Block/Unblock**, **Delete**. Il superuser `.env` mostra il badge `superuser` e nasconde
  le azioni distruttive; le azioni su se stessi sono nascoste.
- **`editUser(u)`**: apre un `RBModal` (classe `narrow`) con i campi identità + una password
  temporanea opzionale; usa le classi condivise `.field` / `.field-label` / `.hint`. Al salva
  chiama `admin_update`.

Colonne tabella: **User** (nome + handle + badge) · **Email** · **Roadbooks** · **Disk**
(`fmtSize`) · azioni.

---

## 6. Pagina account: viste rilevanti

[public/account/index.html](../public/account/index.html) + [account.js](../public/account/account.js).
Oltre a login/register/forgot/reset:

- **`#vForce`** — cambio password **forzato**: se al login (o in `config`)
  `user.must_change_password` è attivo, si mostra questa vista *prima* del profilo; invia
  `change_password` con la sola nuova password, poi ricarica nel profilo.
- **Cambio password** (`#pwForm`), **Cambio email** (`#emailForm`, doppio campo per evitare
  refusi → `change_email`) e **Elimina account** (`#delForm`, con `RBConfirmDanger`) nel
  profilo, con feedback via `RBToast` (visibile anche scrollati in basso).
- **Conferma del nuovo indirizzo:** se la pagina account viene aperta con `?verifyemail=<raw>`
  (il link inviato al nuovo indirizzo), `init()` chiama `verify_email_change`, rilegge l'utente
  via `config` e mostra il profilo aggiornato.
- **Link al pannello admin** (`#adminLink`) mostrato solo se `user.is_admin`.

---

## 7. Deploy e produzione

Il deploy è un push su `main` (vedi [CLAUDE.md](../CLAUDE.md)). Due cose **non** sono coperte
dal deploy automatico:

1. **Migrazioni su DB esistente.** Le nuove `migrations/*.sql` si applicano a produzione,
   una volta e in ordine, tramite il **pannello VPS** (regola schema-first: la colonna deve
   esistere in prod *prima* del codice che la legge, altrimenti login e pannello vanno in
   errore SQL). Dettagli e chiave in [DB.md](../DB.md). Le migrazioni arrivano ormai fino a
   `027` (tra cui 015 status, 016 quota, 017 activity_log, 018 settings, 019 events, 020
   organizer, 021 terms, 022–023 partecipazione, 025 lock, 026 reusable, 027 indici liste).
2. **`ADMIN_EMAILS` nel `.env` di produzione.** Va valorizzato con l'email del primo admin;
   il `.env` non è nel repo e non viene toccato dal deploy. Finché è vuoto, in produzione
   nessuno è admin e `/admin` resta inaccessibile.

---

## 8. Limiti e quirk

- **Quota disco fissa per default.** La quota è `DEFAULT_QUOTA_BYTES` (50 MB) salvo override
  per-utente in `quota_bytes`; applicata solo agli upload di foto/audio (413 al superamento),
  non ai file `.rdbk`.
- **Due ruoli, non granulari.** `is_admin` e `is_organizer` sono binari; non ci sono permessi
  più fini oltre a questi.
- **Password temporanea in chiaro nel form.** Il campo password dell'edit-utente è di tipo
  testo (l'admin deve poterla comunicare); viene comunque salvata solo come hash.
- **Migrazioni non idempotenti.** Ogni `ALTER TABLE ... ADD COLUMN` va applicata una sola
  volta in ordine (vedi §7 e [DB.md](../DB.md), pannello VPS).
- **Bootstrap del primo admin solo via `.env`.** È voluto (failsafe), ma significa che senza
  accesso al `.env` di produzione non si può aprire il pannello la prima volta.
