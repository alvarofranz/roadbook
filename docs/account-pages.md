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
| Features | solo web | Le card degli strumenti: Track Recorder, Roadbook Editor, Roadbook Reader, Tripmaster, Event classification, più *Events* (coming soon) |
| Install / Cross-platform | solo web | PWA installabile su Windows, macOS/iOS, Android ([index.html:63](../public/index.html#L63)) |
| App launcher | solo app nativa (`.app-only`) | Tre tile verso Reader, Tripmaster, Recorder ([index.html:77](../public/index.html#L77)) |
| Gallery / Public Challenges | web **e** app | Griglia delle challenge pubbliche, popolata da JS ([index.html:86](../public/index.html#L86)) |

La galleria è l'unico pezzo dinamico. [home.js](../public/assets/js/home.js) chiama
`RBChallenges.listPublic()` e disegna un **teaser di 6** roadbook pubblici via `RBGalleryCard`:
thumbnail, titolo, `@username` e il riepilogo distanza/note via `RBSummary`; ogni card linka a
`challenge/<slug>`. Una card **senza foto** riceve un SVG statico della **forma della rotta**
(fetch lazy, saltato se `map_access:false`) invece di una generica icona. La lista è **in cache**
(`cards`) così un cambio lingua ri-disegna senza rifare la fetch (evento `rb-lang`). La lista
completa e ricercabile vive su `/roadbooks`.

---

## 2. Le voci di menu account (header globale)

L'header è reso da `app.js` su ogni pagina; al suo interno un piccolo "account control"
([app.js:301](../public/assets/js/app.js#L301)) interroga `RBApi('config')` per sapere se
c'è una sessione e cambia forma di conseguenza:

- **Non loggato** → una sola icona utente che linka alla pagina account via `RBLoginUrl()`
  (con `?next=` al percorso corrente).
- **Loggato** → un bottone con lo username che apre un menu a tendina:

| Voce | Icona | Destinazione | Quando |
|------|-------|--------------|--------|
| **My profile** | `fa-user` | `account/` | sempre |
| **My roadbooks** | `fa-book` | `myroadbooks/` | sempre |
| **Public Roadbooks** | `fa-globe` | `admin/roadbooks/` | solo admin |
| **User management** | `fa-users-gear` | `admin/` | solo admin |
| **Site settings** | `fa-sliders` | `admin/config/` | solo admin |
| **Event management** | `fa-flag-checkered` | `admin/events/` | admin, **oppure** organizer / co-organizzatore (`is_organizer`/`manages_events`) |
| **Sign out** | `fa-right-from-bracket` | `RBApi('logout')` poi `location.reload()` | sempre |

Quindi profilo e lista roadbook sono **due pagine distinte** raggiungibili da questo menu; le
voci admin/eventi appaiono solo per chi ne ha i permessi.

---

## 3. Il profilo (`/account/`)

Una sola pagina che fa da hub di autenticazione **e** da profilo. Markup in
[index.html](../public/account/index.html), logica in
[account.js](../public/account/account.js). Il commento di testa è esplicito: registrazione,
verifica, login, recupero/reset password e profilo (avatar + bio); i roadbook salvati
**vivono sulla loro pagina** ([account.js:2](../public/account/account.js#L2)).

### 3.1 Le viste

La pagina contiene sei sezioni mutuamente esclusive; `show(id)` ne mostra una sola
nascondendo le altre ([account.js:15](../public/account/account.js#L15)):

| Vista | id | Scopo |
|-------|------|-------|
| Sign in | `vLogin` | login con email/username + password |
| Create account | `vRegister` | nome, cognome, username, email, password (min 8) + conferma (`password_confirm`) e **accettazione dei Termini** (`accept_terms`, obbligatoria) |
| Reset password | `vForgot` | invio link di reset via email |
| Set a new password | `vReset` | nuova password (raggiunta dal link `?reset=…`) |
| Forced change | `vForce` | cambio password obbligato quando un admin ha impostato una password temporanea (`must_change_password`) |
| Account / profilo | `vAccount` | il profilo vero e proprio |

`init()` ([account.js:87](../public/account/account.js#L87)) decide quale mostrare: legge
`RBApi('config')`, gestisce i parametri URL `?verify=…`, `?reset=…` e `?verifyemail=…`
(conferma del cambio email, §3.4), e **se `cfg.user` esiste salta dritto al profilo**
(`showAccount`, o `showForce` se deve ancora cambiare la password temporanea). Altrimenti
mostra il login.

### 3.2 Si apre già in modifica

Non c'è una modalità "sola lettura": appena loggato, `showAccount(user)`
([account.js:206](../public/account/account.js#L206)) mostra subito il form modificabile.
Popola l'intestazione e i campi:

| Elemento | Origine dato |
|----------|--------------|
| Nome visualizzato (`accName`) | `first_name + last_name`, fallback su `username` |
| Handle (`accHandle`) | `@username · email` |
| Avatar (`accAvatar`) | `user.avatar` con `?v=Date.now()` per **bustare la cache** HTTP/CDN dopo un re-upload ([account.js:213](../public/account/account.js#L213)); fallback `../assets/icon.svg` |
| Nome / cognome (`pfFirst` / `pfLast`) | `user.first_name` / `user.last_name`, `maxlength="80"` |
| Bio (`pfBio`) | `user.bio`, textarea `maxlength="500"` |
| Organizzazione (`pfOrg`) | `user.organization` (testo libero — filtra la ricerca organizzatori negli eventi, #123) |
| Lingua note vocali (`pfVoiceLang`) | `user.voice_lang` (vuoto = "Automatic (device)") |
| Posizione di default (`pfLocMap`) | `user.default_lat` / `user.default_lon` (§3.3) |
| Link Admin (`adminLink`) | visibile solo se `user.is_admin` |

### 3.3 Le card del profilo

Il profilo è una pila di card (`.auth-card.profile-form`); ciascuna è autonoma, con il
proprio bottone di salvataggio — non esiste un unico "Save" globale.

- **Cambia foto** — `pfAvatarBtn` fa scattare l'`<input type=file>` nascosto; al `change`
  l'immagine sale con `RBUpload({type:'avatar'}, f, 'avatar.jpg')` e, se ok, l'avatar viene
  aggiornato in pagina ([account.js:221](../public/account/account.js#L221)).
- **Save profile** — `pfSave` invia `RBApi('profile', { first_name, last_name, bio,
  organization, voice_lang })`. Salva quindi **nome, cognome, bio, organizzazione e lingua delle
  note vocali** in un colpo solo, e ri-sincronizza il nome mostrato nell'intestazione. Lingua note
  vocali = preferenza per-account usata da Recorder ed Editor per il riconoscimento vocale; con
  valore vuoto ricade sulla lingua del dispositivo.
- **Default map location** — una card con una mini-mappa (`#pfLocMap`, `RBMap` con
  `RBMap.STYLE_TOPO`, tile topografiche gratuite) e un pin trascinabile
  ([account.js:183](../public/account/account.js#L183)). Si imposta toccando la mappa,
  trascinando il pin, con **Use my location** (GPS via `navigator.geolocation`) o si svuota
  con **Clear**; le coordinate scelte si salvano col proprio bottone **Save location** via
  `RBApi('save_location', { default_lat, default_lon })`
  ([account.js:189](../public/account/account.js#L189)). La posizione salvata centra l'Editor
  a partenza vuota (es. "Draw on the map", [editor.js:1662](../public/editor/editor.js#L1662))
  e il Recorder prima del primo fix GPS ([recorder.js:61](../public/recorder/recorder.js#L61)).
- **Change email** — emaila un link di conferma al **nuovo** indirizzo; l'email cambia solo
  dopo la conferma (§3.4). Doppio campo (new + confirm) con controllo di uguaglianza, poi
  `RBApi('change_email', { email })` ([account.js:153](../public/account/account.js#L153)).
- **Change password** — current + new + confirm (con conferma di uguaglianza), via
  `RBApi('change_password', { current, new })`; al successo memorizza la nuova credenziale
  nel password manager (§3.5) e svuota i campi ([account.js:146](../public/account/account.js#L146)).
- **Delete account** — chiede conferma con `RBConfirmDanger` (che nomina l'azione
  irreversibile), poi `RBApi('account_delete', { password })` e, se ok, torna alla home
  ([account.js:159](../public/account/account.js#L159)).
- **Sign out** — `RBApi('logout')` poi reload ([account.js:214](../public/account/account.js#L214)).
- In fondo, un bottone **My roadbooks** verso `../myroadbooks/`
  ([index.html:197](../public/account/index.html#L197)).

### 3.4 Cambio email con ri-verifica

Il cambio email è a **due fasi**, per non lasciare l'account agganciato a un indirizzo non
provato. Inviato `change_email`, il server NON sostituisce l'email: la mette da parte (in
`pending_email`) e spedisce un link di conferma al nuovo indirizzo. Aprendo quel link si
torna su `/account/?verifyemail=…`; `init()` chiama
`RBApi('verify_email_change', { token })` ([account.js:105](../public/account/account.js#L105)),
ri-legge `config` (l'email può essere cambiata) e rientra nel profilo aggiornato. Solo a
questo punto l'email è effettivamente cambiata.

### 3.5 Salvataggio nel password manager

I form di RDBK postano via `fetch` (nessuna navigazione), quindi il browser non vede mai
una submission di credenziali e da solo non offrirebbe di salvare/aggiornare la password.
`storeCredential(id, password)` ([account.js:42](../public/account/account.js#L42)) è il
trigger esplicito: dopo un login andato a buon fine e dopo un cambio password (anche quello
forzato) chiama `navigator.credentials.store(new PasswordCredential({ id, password }))`, e il
gestore password del browser propone di salvare/aggiornare. Richiede **HTTPS + un browser
Chromium**; altrove è un no-op silenzioso (manca `window.PasswordCredential`).

### 3.6 Endpoint API usati

`config`, `verify`, `verify_email_change`, `reset`, `login`, `register`, `forgot`, `logout`,
`profile`, `save_location`, `change_email`, `change_password`, `account_delete`, più l'upload
avatar via `RBUpload` (→ `upload.php`). Tutto attraverso `RBApi`/`RBUpload`.

### 3.7 Dettagli onesti

- **Cloudflare Turnstile** (anti-bot) è renderizzato su login/register/forgot **solo se**
  il server espone una site key in `config` ([account.js:18](../public/account/account.js#L18));
  senza configurazione i widget restano vuoti e inerti.
- Ogni campo password riceve un toggle "occhio" mostra/nascondi iniettato a runtime
  ([account.js:65](../public/account/account.js#L65)).
- I form usano `submit` con `preventDefault` per non ricaricare mai la pagina
  ([account.js:35](../public/account/account.js#L35)).
- **Rate limiting del login.** Su un 429 del server (`retry_after`), il bottone Sign in si
  disabilita con un conto alla rovescia live finché la finestra non si libera
  ([account.js:50](../public/account/account.js#L50)).

---

## 4. I miei roadbook (`/myroadbooks/`)

La lista dei roadbook salvati dall'utente loggato. Markup in
[index.html](../public/myroadbooks/index.html); [myroadbooks.js](../public/myroadbooks/myroadbooks.js)
si limita a **verificare la sessione** (`RBApi('config')`; senza utente **reindirizza a
`../account/`**) e poi monta la lista con l'helper condiviso `RBRoadbookList`.

**La lista è `RBRoadbookList`** (in `app.js`, riusato anche dalla landing dell'Editor): fa
`RBApi('rb_list')` e disegna una riga per roadbook. Ricerca, paginazione e azioni sono
documentate in dettaglio una volta sola in [app-shell](app-shell.md); qui il riassunto.

### 4.1 Il layout

Una **singola colonna a piena larghezza**, una riga per roadbook (`.rb-grid` è
`flex-direction: column`). In cima una barra con il titolo e il bottone **New roadbook** verso
l'Editor. Oltre i cinque roadbook compare una **casella di ricerca** (filtro per titolo via
`RB.filterRoadbooks`); oltre una pagina compare un **paginatore** (12 per pagina). Ricerca e
paginatore ridisegnano solo le righe, non la casella.

### 4.2 Ogni riga

| Elemento | Contenuto |
|----------|-----------|
| Titolo + meta | `title`; sotto, riepilogo distanza/note (`RBSummary`) e **data ultima modifica** (`updated_at`, nella locale del visitatore) |
| Stato | un **select** `draft` · `ready` · `public` (non più un badge Public/Private): il cambio chiama `rb_status` e ri-renderizza dalla verità del server |
| Read | `<i fa-book-open>` → `../reader/?rb=<id>` — apre nel **Reader**, anche i roadbook **privati** del proprietario |
| View | `<i fa-eye>` → `../challenge/<slug>` (anteprima pubblica) |
| Copy link | `<i fa-link>` → copia il link Reader pubblico (`RBCopy`/`RBReaderLink`), **solo se `public`** |
| Edit | `<i fa-pen>` → `../editor/?rb=<id>` |
| Export | `<i fa-file-export>` → `../editor/?rb=<id>&export=1` (apre l'Editor e fa partire subito il popup di export) |
| Save as | `<i fa-clone>` → duplica lato server (`rb_duplicate`) |
| Delete | `<i fa-trash>` rosso → conferma che **nomina il roadbook** (`RBConfirmDanger`), poi `rb_delete` |

In cima alla lista c'è anche una riga di **uso spazio** (`used_bytes / quota_bytes`, #99). Se la
lista è vuota, mostra "No roadbooks yet. Create one in the Editor."

### 4.3 Duplica ("Save as")

Il bottone clone invoca `RBApi('rb_duplicate', { id })`; al successo un toast e la lista si
ricarica. È una copia lato server — utile come "salva come" per partire da un roadbook
esistente senza toccare l'originale.

### 4.4 Elimina

Il cestino chiede conferma con `RBConfirmDanger` (la conferma **nomina il roadbook**) e, solo se
confermato, chiama `RBApi('rb_delete', { id })` e ricarica.

### 4.5 Aprire in Reader / pubblico / Editor

- **Read** apre direttamente il **Reader** sul roadbook (`../reader/?rb=<id>`), anche se privato:
  il proprietario è autorizzato lato server (`rb_get` gated su id + user_id).
- **Edit** porta nell'Editor con `?rb=<id>`: salvare lì re-aggancia lo stesso roadbook (i
  salvataggi successivi aggiornano lo stesso record).
- **View** porta alla pagina **challenge** via `slug` — l'anteprima pubblica del roadbook.
- La voce "i miei roadbook" del menu e il bottone in fondo al profilo puntano entrambi qui.

### 4.6 Endpoint API usati

`config`, `rb_list`, `rb_status`, `rb_duplicate`, `rb_delete`.

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

- **Username non modificabile.** Avatar, nome, cognome, bio, lingua note vocali, posizione
  di default, email e password si cambiano da qui; lo **username** è mostrato (`@handle`) ma
  non ha campo di modifica — per cambiarlo serve un'azione di backend non esposta in questa UI.
- **Cambio email differito.** L'email non cambia all'invio del form: resta `pending_email`
  finché non si apre il link di conferma sul nuovo indirizzo (§3.4). Se non si conferma,
  l'account tiene l'email vecchia.
- **Salvataggio password manager solo su Chromium/HTTPS.** `storeCredential` usa la
  Credential Management API; su Firefox/Safari o su http è un no-op silenzioso (§3.5) — il
  prompt "salva password" semplicemente non appare.
- **Una pagina, sei viste.** `/account/` è insieme login, registrazione, recupero
  password, cambio forzato e profilo: lo stato dipende da `RBApi('config')` e dai parametri
  URL (`?verify`, `?reset`, `?verifyemail`), non da route separate.
- **Turnstile è condizionale.** Se il server non fornisce la site key, i widget anti-bot
  restano vuoti — comportamento atteso in locale, da tenere presente quando si testano i
  form.
- **My roadbooks è gated.** Senza sessione fa redirect al login; non mostra mai una lista
  vuota "da ospite".
- **La home serve due target.** Stesso HTML per web e app nativa, commutato da
  `.web-only`/`.app-only`; modifiche al layout vanno verificate in entrambe le modalità.
- **La galleria dipende dall'API challenge.** Senza backend (o senza challenge pubbliche)
  mostra lo stato vuoto `gallery.empty`; la home resta comunque navigabile.
