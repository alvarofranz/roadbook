# Pagine account, utente e statiche

Le pagine "non-strumento" di RDBK: la **home** (vetrina marketing + galleria challenge),
il **profilo** utente, **I miei roadbook** e la **privacy policy**. Documento di riferimento
per scopo, campi e funzioni reali di ciascuna pagina.

> Tutto il front-end funziona senza account: le pagine qui descritte aggiungono solo login,
> profilo, storage dei roadbook e condivisione. Il dialogo con il server passa sempre per
> `RBApi(action, body)` (POST JSON, same-origin, cookie di sessione). I dettagli di
> backend (PHP/MariaDB, schema, endpoint) sono fuori da questo documento — qui si citano
> solo le `action` consumate.

---

## 1. La home (`/`)

La home è una pagina **statica** (nessun account richiesto): vetrina di marketing più una
galleria delle challenge pubbliche. Markup in [index.html](../public/index.html), logica
della sola galleria in [home.js](../public/assets/js/home.js).

Ha una particolarità: lo **stesso documento serve sia il sito web sia l'app nativa**. Uno
script inline marca `<html class="native">` quando gira dentro Capacitor
([index.html:7](../public/index.html#L7)); il CSS allora nasconde i blocchi `.web-only` e
mostra `.app-only`.

| Blocco | Visibilità | Contenuto |
|--------|------------|-----------|
| Hero | solo web (`.web-only`) | Titolo, lead, e i 4 passi del workflow: registra → costruisci → usa con amici → organizza un evento ([index.html:24](../public/index.html#L24)) |
| Features | solo web | Le 7 card degli strumenti: Record route, Editor, Reader, Tripmaster, Validate & QR, Ranking, Accounts & sharing ([index.html:44](../public/index.html#L44)) |
| Install / Cross-platform | solo web | PWA installabile su Windows, macOS/iOS, Android ([index.html:63](../public/index.html#L63)) |
| App launcher | solo app nativa (`.app-only`) | Tre tile verso Reader, Tripmaster, Recorder ([index.html:77](../public/index.html#L77)) |
| Gallery / Public Challenges | web **e** app | Griglia delle challenge pubbliche, popolata da JS ([index.html:86](../public/index.html#L86)) |

La galleria è l'unico pezzo dinamico. [home.js](../public/assets/js/home.js) chiama
`RBChallenges.listPublic()` ([home.js:25](../public/assets/js/home.js#L25)) e disegna una
card per roadbook pubblico: thumbnail (o placeholder), titolo, `@username` e il riepilogo
distanza/note via `RBSummary` ([home.js:13](../public/assets/js/home.js#L13)). Ogni card
linka a `challenge/<slug>`. La lista viene **memorizzata in cache** (`cards`) così che un
cambio lingua ri-disegni senza rifare la fetch, agganciandosi all'evento `rb-lang`
([home.js:24](../public/assets/js/home.js#L24)).

---

## 2. Le voci di menu account (header globale)

L'header è reso da `app.js` su ogni pagina; al suo interno un piccolo "account control"
([app.js:301](../public/assets/js/app.js#L301)) interroga `RBApi('config')` per sapere se
c'è una sessione e cambia forma di conseguenza:

- **Non loggato** → una sola icona utente che linka a `account/` (Sign in / Create account)
  ([app.js:308](../public/assets/js/app.js#L308)).
- **Loggato** → un bottone con lo username che apre un menu a tendina con tre voci
  ([app.js:310](../public/assets/js/app.js#L310)):

| Voce | Icona | Destinazione |
|------|-------|--------------|
| **My roadbooks** | `fa-book` | `myroadbooks/` |
| **My profile** | `fa-user` | `account/` |
| **Sign out** | `fa-right-from-bracket` | `RBApi('logout')` poi `location.reload()` |

Quindi profilo e lista roadbook sono **due pagine distinte** raggiungibili da questo menu.

---

## 3. Il profilo (`/account/`)

Una sola pagina che fa da hub di autenticazione **e** da profilo. Markup in
[index.html](../public/account/index.html), logica in
[account.js](../public/account/account.js). Il commento di testa è esplicito: registrazione,
verifica, login, recupero/reset password e profilo (avatar + bio); i roadbook salvati
**vivono sulla loro pagina** ([account.js:2](../public/account/account.js#L2)).

### 3.1 Le viste

La pagina contiene cinque sezioni mutuamente esclusive; `show(id)` ne mostra una sola
nascondendo le altre ([account.js:14](../public/account/account.js#L14)):

| Vista | id | Scopo |
|-------|------|-------|
| Sign in | `vLogin` | login con email/username + password |
| Create account | `vRegister` | nome, cognome, username, email, password (min 8) |
| Reset password | `vForgot` | invio link di reset via email |
| Set a new password | `vReset` | nuova password (raggiunta dal link `?reset=…`) |
| Account / profilo | `vAccount` | il profilo vero e proprio |

`init()` ([account.js:59](../public/account/account.js#L59)) decide quale mostrare: legge
`RBApi('config')`, gestisce i parametri URL `?verify=…` e `?reset=…`, e **se `cfg.user`
esiste salta dritto al profilo** (`showAccount`). Altrimenti mostra il login.

### 3.2 Si apre già in modifica

Non c'è una modalità "sola lettura": appena loggato, `showAccount(user)`
([account.js:100](../public/account/account.js#L100)) mostra subito il form modificabile.
Popola l'intestazione e i campi:

| Elemento | Origine dato |
|----------|--------------|
| Nome visualizzato (`accName`) | `first_name + last_name`, fallback su `username` |
| Handle (`accHandle`) | `@username · email` |
| Avatar (`accAvatar`) | `user.avatar` con `?v=Date.now()` per **bustare la cache** HTTP/CDN dopo un re-upload ([account.js:104](../public/account/account.js#L104)); fallback `../assets/icon.svg` |
| Bio (`pfBio`) | `user.bio`, textarea `maxlength="500"` |

### 3.3 Le azioni del profilo

- **Cambia foto** — `pfAvatarBtn` fa scattare l'`<input type=file>` nascosto; al `change`
  l'immagine sale con `RBUpload({type:'avatar'}, f, 'avatar.jpg')` e, se ok, l'avatar viene
  aggiornato in pagina ([account.js:107](../public/account/account.js#L107)).
- **Save profile** — `pfSave` invia `RBApi('profile', { bio })`
  ([account.js:114](../public/account/account.js#L114)). **Salva solo la bio**: nome,
  username ed email non sono modificabili da qui (non hanno campi nel form).
- **Sign out** — `RBApi('logout')` poi reload ([account.js:105](../public/account/account.js#L105)).
- In fondo, un bottone **My roadbooks** verso `../myroadbooks/`
  ([index.html:117](../public/account/index.html#L117)).

### 3.4 Endpoint API usati

`config`, `verify`, `reset`, `login`, `register`, `forgot`, `logout`, `profile`, più
l'upload avatar via `RBUpload` (→ `upload.php`). Tutto attraverso `RBApi`/`RBUpload`.

### 3.5 Dettagli onesti

- **Cloudflare Turnstile** (anti-bot) è renderizzato su login/register/forgot **solo se**
  il server espone una site key in `config` ([account.js:17](../public/account/account.js#L17));
  senza configurazione i widget restano vuoti e inerti.
- Ogni campo password riceve un toggle "occhio" mostra/nascondi iniettato a runtime
  ([account.js:37](../public/account/account.js#L37)).
- I form usano `submit` con `preventDefault` per non ricaricare mai la pagina
  ([account.js:34](../public/account/account.js#L34)).

---

## 4. I miei roadbook (`/myroadbooks/`)

La lista dei roadbook salvati dall'utente loggato. Markup in
[index.html](../public/myroadbooks/index.html), logica in
[myroadbooks.js](../public/myroadbooks/myroadbooks.js).

**Richiede una sessione**: all'avvio legge `RBApi('config')` e, se non c'è utente,
**reindirizza a `../account/`** per il login ([myroadbooks.js:33](../public/myroadbooks/myroadbooks.js#L33)).

### 4.1 Il layout

Una **singola colonna a piena larghezza**, una riga per roadbook (leggibile sia su schermi
larghi sia stretti — `.rb-grid` è un `flex-direction: column`,
[index.html:18](../public/myroadbooks/index.html#L18)). In cima una barra con il titolo e il
bottone **New roadbook** verso l'Editor ([index.html:37](../public/myroadbooks/index.html#L37)).

### 4.2 Ogni riga

`loadRoadbooks()` ([myroadbooks.js:10](../public/myroadbooks/myroadbooks.js#L10)) chiama
`RBApi('rb_list')` e disegna per ogni roadbook ([myroadbooks.js:14](../public/myroadbooks/myroadbooks.js#L14)):

| Elemento | Contenuto |
|----------|-----------|
| Titolo + meta | `title`; sotto, riepilogo distanza/note (`RBSummary`) e **data ultima modifica** (`updated_at`, formattata nella locale del visitatore) |
| Badge | pillola **Public** (globo verde) o **Private** (lucchetto, muted) secondo `is_public` |
| Azione View | `<i fa-eye>` → `../challenge/<slug>` (anteprima pubblica) |
| Azione Edit | `<i fa-pen>` → `../editor/?rb=<id>` (apre nell'Editor per modifica) |
| Azione Save as | `<i fa-clone>` → duplica (vedi sotto) |
| Azione Delete | `<i fa-trash>` rosso → elimina (vedi sotto) |

La data viene formattata da `fmtDate`, che converte il DATETIME MySQL
(`YYYY-MM-DD HH:MM:SS`) in `Date` e poi in `toLocaleDateString()`
([myroadbooks.js:8](../public/myroadbooks/myroadbooks.js#L8)).

Se la lista è vuota, mostra "No roadbooks yet. Create one in the Editor."
([myroadbooks.js:13](../public/myroadbooks/myroadbooks.js#L13)).

### 4.3 Duplica ("Save as")

Il bottone clone invoca `RBApi('rb_duplicate', { id })`; al successo mostra un toast e
ricarica la lista ([myroadbooks.js:22](../public/myroadbooks/myroadbooks.js#L22)). È una
copia lato server — utile come "salva come" per partire da un roadbook esistente senza
toccare l'originale.

### 4.4 Elimina

Il cestino chiede conferma con `RBConfirm('Delete this roadbook?', 'Delete')` e, solo se
confermato, chiama `RBApi('rb_delete', { id })` e ricarica
([myroadbooks.js:26](../public/myroadbooks/myroadbooks.js#L26)).

### 4.5 Aprire in Reader / pubblico / Editor

- **Edit** porta nell'Editor con `?rb=<id>`: salvare lì re-aggancia lo stesso roadbook
  (il `?rb=<id>` fa sì che i salvataggi successivi aggiornino lo stesso record, vedi
  CLAUDE.md / Editor).
- **View** porta alla pagina **challenge** via `slug` — l'anteprima pubblica del roadbook,
  da cui poi si apre nel Reader.
- La voce "i miei roadbook" del menu e il bottone in fondo al profilo puntano entrambi qui.

> Nota: la riga non ha un link "apri nel Reader con `?rb=`" diretto; l'accesso da
> proprietario passa per Editor (modifica) o per la pagina challenge (anteprima).

### 4.6 Endpoint API usati

`config`, `rb_list`, `rb_duplicate`, `rb_delete`.

---

## 5. Privacy policy (`/privacy/`)

Pagina **statica**, solo testo, nessun JS oltre i soliti `i18n.js` + `app.js`. Markup in
[index.html](../public/privacy/index.html). È un requisito degli app store (vedi commit
"Add /privacy").

Riassunto del contenuto (data ultimo aggiornamento: 18 giugno 2026):

| Sezione | Punto chiave |
|---------|--------------|
| Location | Il GPS è letto **sul dispositivo** per navigare/registrare; la posizione live **non** va ai server; nell'app nativa la registrazione continua a schermo bloccato via foreground service ([index.html:37](../public/privacy/index.html#L37)) |
| Account (opzionale) | Gli strumenti base funzionano senza account; se creato, si memorizzano nome/cognome, username, email e password con **hash** sicuro ([index.html:48](../public/privacy/index.html#L48)) |
| Roadbook & foto | Salvati sul server solo se **tu** li salvi; ogni roadbook è **privato di default**, pubblico solo se pubblicato come challenge ([index.html:56](../public/privacy/index.html#L56)) |
| Camera & foto | La fotocamera è usata solo quando aggiungi una foto a un roadbook ([index.html:64](../public/privacy/index.html#L64)) |
| Cosa NON facciamo | Niente pubblicità, niente SDK di tracking di terze parti, niente vendita di dati, niente raccolta posizione in background ([index.html:68](../public/privacy/index.html#L68)) |
| Storage & sicurezza | Dati su server **in EU**; password e token con hash; HTTPS ([index.html:75](../public/privacy/index.html#L75)) |
| Diritti & scelte | Uso completo senza account; modifica/eliminazione roadbook e foto; richiesta di cancellazione account via email ([index.html:79](../public/privacy/index.html#L79)) |
| Bambini | Non rivolto a under 13 ([index.html:86](../public/privacy/index.html#L86)) |
| Contatto | [info@rdbk.app](mailto:info@rdbk.app) |

---

## 6. Limiti e quirk da segnalare

- **Profilo modificabile solo nella bio + avatar.** Nome, cognome, username ed email sono
  mostrati ma non hanno campi di modifica: `RBApi('profile', …)` invia solo `bio`
  ([account.js:114](../public/account/account.js#L114)). Per cambiarli serve un'azione di
  backend non esposta in questa UI.
- **Una pagina, cinque viste.** `/account/` è insieme login, registrazione, recupero
  password e profilo: lo stato dipende da `RBApi('config')` e dai parametri URL, non da
  route separate.
- **Turnstile è condizionale.** Se il server non fornisce la site key, i widget anti-bot
  restano vuoti — comportamento atteso in locale, da tenere presente quando si testano i
  form.
- **My roadbooks è gated.** Senza sessione fa redirect al login; non mostra mai una lista
  vuota "da ospite".
- **Nessun link Reader diretto dalla lista.** Da proprietario si apre l'Editor (`?rb=<id>`)
  o l'anteprima challenge (`slug`); l'apertura nel Reader con `?rb=` non è un'azione di riga.
- **La home serve due target.** Stesso HTML per web e app nativa, commutato da
  `.web-only`/`.app-only`; modifiche al layout vanno verificate in entrambe le modalità.
- **La galleria dipende dall'API challenge.** Senza backend (o senza challenge pubbliche)
  mostra lo stato vuoto `gallery.empty`; la home resta comunque navigabile.
