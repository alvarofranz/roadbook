# Gestione utenti (admin)

Come funziona la **gestione utenti** di RDBK: il pannello admin (`/admin`), il modello di
permessi, le azioni amministrative sugli account e le funzioni self-service (cambio password,
eliminazione account, cambio password forzato). Documento di riferimento per chi tocca
auth/admin lato back-end o le pagine relative.

> Il dominio è diviso tra back-end e front-end. Lato server vive in
> [app/auth.php](../app/auth.php) (autenticazione + permessi) e
> [app/admin.php](../app/admin.php) (azioni admin), esposto dal router
> [public/api/index.php](../public/api/index.php). Lato client il pannello è
> [public/admin/](../public/admin/) e le funzioni self-service stanno in
> [public/account/](../public/account/). Lo schema è versionato in
> [migrations/](../migrations/). Per il resto dell'API vedi [backend-api](backend-api.md).

---

## 1. Modello dei permessi

Un solo flag di ruolo: **`is_admin`**. Non ci sono ruoli intermedi né quote disco (il disco
è solo visualizzato, non limitato).

L'admin **effettivo** è dato da `is_admin` del DB **oppure** dall'email presente in
`ADMIN_EMAILS` nel `.env` ([app/auth.php:53](../app/auth.php#L53), `is_admin()`):

```php
function is_admin(?array $u): bool {
    if ((int)($u['is_admin'] ?? 0) === 1) return true;        // flag DB
    return in_array(strtolower($u['email']), $CFG['admin_emails'], true); // bootstrap .env
}
```

`$CFG['admin_emails']` è popolato in [app/bootstrap.php](../app/bootstrap.php) dalla variabile
d'ambiente `ADMIN_EMAILS` (lista separata da virgole, normalizzata a minuscolo).

**Superuser "bloccati" (failsafe).** Gli account elencati in `ADMIN_EMAILS` sono il
salvavita del proprietario: restano admin anche se "rimossi" dal pannello, e **non possono
essere declassati, bloccati o eliminati** (controllo `locked` nelle azioni admin). Questo
evita di restare chiusi fuori dal proprio sito.

Il gate delle API admin è `require_admin()` ([app/auth.php:59](../app/auth.php#L59)): richiede
sessione valida **e** admin effettivo, altrimenti `403`.

### Bootstrap del primo admin
Non esiste un'UI per creare il primo admin (sarebbe un uovo-e-gallina). Il primo admin si
inietta via `.env`:

```
ADMIN_EMAILS=proprietario@example.com
```

Una volta che quell'account può accedere al pannello, può promuovere altri tramite il flag DB.

---

## 2. Modello dati

Lo schema `users` è esteso da due migrazioni (vedi anche [backend-api](backend-api.md) §schema):

| Migrazione | Colonna aggiunta | Tipo | Significato |
|---|---|---|---|
| [008_admin.sql](../migrations/008_admin.sql) | `is_admin` | `TINYINT(1)` def. 0 | ruolo amministratore (flag DB) |
| [009_admin_user_flags.sql](../migrations/009_admin_user_flags.sql) | `must_change_password` | `TINYINT(1)` def. 0 | l'utente deve cambiare password al prossimo accesso |
| [009_admin_user_flags.sql](../migrations/009_admin_user_flags.sql) | `blocked` | `TINYINT(1)` def. 0 | account bloccato (login rifiutato) |

Colonne preesistenti rilevanti: `email_verified` (verifica email), `password_hash`
(bcrypt via `password_hash`).

> ⚠️ **Applicazione in produzione.** Il runner automatico applica `migrations/*.sql`
> **solo su un DB vuoto** (salta tutto se la tabella `users` esiste già). Su un database
> popolato le **nuove** migrazioni vanno eseguite a mano, una sola volta e in ordine
> (sono `ALTER TABLE ... ADD COLUMN`, non idempotenti). Vedi §7.

---

## 3. Azioni amministrative (back-end)

Tutte in [app/admin.php](../app/admin.php), tutte dietro `require_admin()` nel router.

| Azione API | Funzione | Cosa fa |
|---|---|---|
| `admin_users` | `admin_users()` | elenca gli utenti con uso disco, ruolo, flag, n. roadbook |
| `admin_verify` | `admin_verify()` | forza l'attivazione (`email_verified=1`, azzera il token) per chi non ha cliccato il link |
| `admin_set_role` | `admin_set_role()` | promuove/declassa admin (rifiuta la demozione di un superuser `.env`) |
| `admin_block` | `admin_block()` | blocca/sblocca (rifiuta su superuser `.env` e su se stessi) |
| `admin_update` | `admin_update_user()` | modifica nome/cognome/username/email; password opzionale → forza il cambio |
| `admin_delete` | `admin_delete_user()` | elimina utente + file (rifiuta su superuser `.env` e su se stessi) |

Dettagli rilevanti:

- **`admin_update_user`** ([app/admin.php](../app/admin.php)): valida username/email (unici,
  formato), aggiorna l'identità, e **se** è fornita una password (≥8 char) imposta il nuovo
  hash con `must_change_password = 1`. La password è quindi *temporanea*: serve solo per il
  primo accesso.
- **`admin_block`**: imposta `blocked`. Non puoi bloccare te stesso né un superuser `.env`.
- **Eliminazione dati.** Le funzioni di cleanup file (`purge_user_files`, `user_disk_bytes`,
  `dir_size`, `rrmdir`) vivono in admin.php; rimuovono i file *prima* della riga DB così i
  roadbook risolvono ancora i path. Le righe collegate (roadbook/foto/token) cadono per
  `ON DELETE CASCADE`.

### Login: account bloccato
In `login_user()` ([app/auth.php:161](../app/auth.php#L161)) il controllo del blocco sta
**dopo** la verifica della password e **prima** di quella sull'email verificata:

```php
if (!$u || !password_verify($pass, $u['password_hash'])) fail('Wrong email/username or password.', 401);
if ((int)($u['blocked'] ?? 0)) fail('Your account has been blocked — contact the administrator.', 403);
if (!(int)$u['email_verified']) fail('Please verify your email first (check your inbox).', 403);
```

---

## 4. Self-service dell'utente

In [app/auth.php](../app/auth.php), esposte da `change_password` / `account_delete`, e legate
dalla pagina account.

- **`current_user()`** ([app/auth.php:27](../app/auth.php#L27)) restituisce sempre
  `is_admin`, `email_verified` e `must_change_password` come interi, così il front-end può
  fare check di verità affidabili.
- **`change_password()`** ([app/auth.php:70](../app/auth.php#L70)): normalmente richiede la
  password attuale; se l'utente ha `must_change_password` attivo la imposta **senza** la
  attuale (l'admin gliene ha data una temporanea). In entrambi i casi il flag viene azzerato.
- **`account_delete()`** ([app/auth.php:84](../app/auth.php#L84)): verifica la password,
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
- **Cambio password** (`#pwForm`) e **Elimina account** (`#delForm`) nel profilo, con feedback
  via `RBToast` (visibile anche scrollati in basso).
- **Link al pannello admin** (`#adminLink`) mostrato solo se `user.is_admin`.

---

## 7. Deploy e produzione

Il deploy è un push su `main` (vedi [CLAUDE.md](../CLAUDE.md)). Due cose **non** sono coperte
dal deploy automatico:

1. **Migrazioni su DB esistente.** Applicare a mano, una volta, su produzione:
   `migrations/008_admin.sql` poi `migrations/009_admin_user_flags.sql`. Senza queste colonne
   il login e il pannello vanno in errore SQL.
2. **`ADMIN_EMAILS` nel `.env` di produzione.** Va valorizzato con l'email del primo admin;
   il `.env` non è nel repo e non viene toccato dal deploy. Finché è vuoto, in produzione
   nessuno è admin e `/admin` resta inaccessibile.

---

## 8. Limiti e quirk

- **Niente quote disco.** L'uso disco è solo informativo (`user_disk_bytes`); non c'è alcun
  limite applicato in scrittura.
- **Un solo livello di ruolo.** `is_admin` è binario; non esistono permessi granulari.
- **Password temporanea in chiaro nel form.** Il campo password dell'edit-utente è di tipo
  testo (l'admin deve poterla comunicare); viene comunque salvata solo come hash.
- **Migrazioni non idempotenti.** Rieseguire 008/009 su un DB dove le colonne esistono dà
  errore "column exists" — vanno lanciate una sola volta (vedi §7).
- **Bootstrap del primo admin solo via `.env`.** È voluto (failsafe), ma significa che senza
  accesso al `.env` di produzione non si può aprire il pannello la prima volta.
