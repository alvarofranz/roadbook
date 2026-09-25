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
([index.html](../public/index.html)); il CSS allora nasconde i blocchi `.web-only` e
mostra `.app-only`.

| Blocco | Visibilità | Contenuto |
|--------|------------|-----------|
| Hero | solo web (`.web-only`) | Titolo, lead, e i 4 passi del workflow: registra → costruisci → usa con amici → organizza un evento ([index.html](../public/index.html)) |
| Features | solo web | Le card degli strumenti: Roadbook Recorder, Roadbook Editor, Roadbook Reader, Tripmaster, Event classification, più *Events* (coming soon) |
| Install / Cross-platform | solo web | PWA installabile su Windows, macOS/iOS, Android ([index.html](../public/index.html)) |
| App launcher | solo app nativa (`.app-only`) | Tre tile verso Reader, Tripmaster, Recorder ([index.html](../public/index.html)) |
| Gallery / Public Challenges | web **e** app | Griglia delle challenge pubbliche, popolata da JS ([index.html](../public/index.html)) |

La galleria è l'unico pezzo dinamico. [home.js](../public/assets/js/home.js) chiama
`RBChallenges.listPublic()` e disegna un **teaser di 6** roadbook pubblici con la card condivisa
`RBRoadbookCard` (veicoli, distanza, note, `@autore`); ogni card linka a `challenge/<slug>`. Una card
**senza foto** riceve la **forma della rotta** (`RBFillRoutes`, saltata se `map_allowed:false`). La lista è **in cache**
(`cards`) così un cambio lingua ri-disegna senza rifare la fetch (evento `rb-lang`). La lista
completa e ricercabile vive su `/roadbooks`.

---

## 2. Le voci di menu account (header globale)

L'header è reso da `app.js` su ogni pagina; al suo interno un piccolo "account control"
([app.js](../public/assets/js/app.js)) interroga `RBApi('config')` per sapere se
c'è una sessione e cambia forma di conseguenza:

- **Non loggato** → una sola icona utente che linka alla pagina account via `RBLoginUrl()`
  (con `?next=` al percorso corrente).
- **Loggato** → un bottone con lo username che apre un menu a tendina:

| Voce | Icona | Destinazione | Quando |
|------|-------|--------------|--------|
| **My profile** | `fa-circle-user` | il profilo pubblico `u/<username>` (`RBProfileLink`; `u/?name=` nell'app) | sempre |
| **Account settings** | `fa-gear` | `account/` | sempre |
| **My roadbooks** | `fa-folder-open` | `myroadbooks/` | sempre (non in participant mode) |
| **Public roadbooks** | `fa-book-open` | `roadbooks/` — l'unico accesso su mobile e nell'app (#671) | sempre (non in participant mode) |
| **User management** | `fa-users-gear` | `admin/` | solo admin |
| **Site settings** | `fa-sliders` | `admin/config/` | solo admin |
| **Event management** | `fa-flag-checkered` | `admin/events/` | admin, **oppure** organizer / co-organizzatore (`is_organizer`/`manages_events`) |
| **Help** | `fa-circle-question` | `wiki/` — in fondo, separato, subito prima di App Info (#743) | sempre |
| **Sign out** | `fa-right-from-bracket` | `RBSignOut()` (lo stesso del bottone nella pagina account) | sempre |

Quindi profilo pubblico, impostazioni e lista roadbook sono **pagine distinte** raggiungibili da
questo menu; le voci admin/eventi appaiono solo per chi ne ha i permessi.

### Il profilo pubblico (`/u/<username>`, #620)
[u/index.html](../public/u/index.html) + [profile-page.js](../public/assets/js/profile-page.js)
(lo script sta in `/assets/js/`: qualunque file dentro `/u/` potrebbe essere scambiato per uno
username). `profile_get` fornisce avatar, bio, organizzazione, i totali delle run **pubbliche**, le
run raggruppate per roadbook (con quante volte è stato completato) e i roadbook pubblici; mai nome
reale né email. Il proprietario vede anche le run private (col lucchetto) e per ognuna *Make
public/private* (`run_update`) ed elimina (`run_delete`, confermato). Tile e dettagli di ogni run
sono lo stesso `RBRun.statsHTML/detailsHTML` del report del Reader.

---

## 3. Il profilo (`/account/`)

Una sola pagina che fa da hub di autenticazione **e** da profilo. Markup in
[index.html](../public/account/index.html), logica in
[account.js](../public/account/account.js). Il commento di testa è esplicito: registrazione,
verifica, login, recupero/reset password e profilo (avatar + bio); i roadbook salvati
**vivono sulla loro pagina** ([account.js](../public/account/account.js)).

### 3.1 Le viste

La pagina contiene sei sezioni mutuamente esclusive; `show(id)` ne mostra una sola
nascondendo le altre ([account.js](../public/account/account.js)):

| Vista | id | Scopo |
|-------|------|-------|
| Sign in | `vLogin` | login con email/username + password |
| Create account | `vRegister` | nome, cognome, username, email, password (min 8) + conferma (`password_confirm`) e **accettazione dei Termini** (`accept_terms`, obbligatoria) |
| Reset password | `vForgot` | invio link di reset via email |
| Set a new password | `vReset` | nuova password (raggiunta dal link `?reset=…`) |
| Forced change | `vForce` | cambio password obbligato quando un admin ha impostato una password temporanea (`must_change_password`) |
| Account / profilo | `vAccount` | il profilo vero e proprio |

`init()` ([account.js](../public/account/account.js)) decide quale mostrare: legge
`RBApi('config')`, gestisce i parametri URL `?verify=…`, `?reset=…` e `?verifyemail=…`
(conferma del cambio email, §3.4), e **se `cfg.user` esiste salta dritto al profilo**
(`showAccount`, o `showForce` se deve ancora cambiare la password temporanea). Altrimenti
mostra il login.

### 3.2 Si apre già in modifica

Non c'è una modalità "sola lettura": appena loggato, `showAccount(user)`
([account.js](../public/account/account.js)) mostra subito il form modificabile.
Popola l'intestazione e i campi:

| Elemento | Origine dato |
|----------|--------------|
| Nome visualizzato (`accName`) | `first_name + last_name`, fallback su `username` |
| Handle (`accHandle`) | `@username · email` |
| Avatar (`accAvatar`) | `user.avatar`, il cui URL salvato porta la versione dell'upload (`?v=`), così un re-upload si vede subito e poi resta in cache; fallback `../assets/icon.svg` |
| Nome / cognome (`pfFirst` / `pfLast`) | `user.first_name` / `user.last_name`, `maxlength="80"` |
| Bio (`pfBio`) | `user.bio`, textarea `maxlength="500"` |
| Organizzazione (`pfOrg`) | `user.organization` (testo libero — filtra la ricerca organizzatori negli eventi, #123) |
| Posizione di default (`pfLocMap`) | `user.default_lat` / `user.default_lon` (§3.3) |
| Link Admin (`adminLink`) | visibile solo se `user.is_admin` |

### 3.3 Le card del profilo

Il profilo è una pila di card (`.auth-card.profile-form`); ciascuna è autonoma, con il
proprio bottone di salvataggio — non esiste un unico "Save" globale.

- **Cambia foto** — `pfAvatarBtn` fa scattare l'`<input type=file>` nascosto; al `change`
  l'immagine sale con `RBUpload({type:'avatar'}, f, 'avatar.jpg')` e, se ok, l'avatar viene
  aggiornato in pagina ([account.js](../public/account/account.js)).
- **Save profile** — `pfSave` invia `RBApi('profile', { first_name, last_name, bio,
  organization })`. Salva quindi **nome, cognome, bio e organizzazione** in un colpo solo, e
  ri-sincronizza il nome mostrato nell'intestazione.
- **Default map location** (`#defaultLocation`) — una card con una mini-mappa (`#pfLocMap`, `RBMap` con
  `RBMap.STYLE_TOPO`, tile topografiche gratuite) e un pin trascinabile
  ([account.js](../public/account/account.js)). Si imposta toccando la mappa,
  trascinando il pin, con **Use my location** (GPS via `navigator.geolocation`) o si svuota
  con **Clear**; le coordinate scelte si salvano col proprio bottone **Save location** via
  `RBApi('save_location', { default_lat, default_lon })`
  Un account senza posizione se la vede chiedere **una volta** (#749, `askForLocation` in
  `app.js`): *Use my location* la salva subito, *Choose on the map* porta qui
  (`account/#defaultLocation`), *Not now* resta ricordato sul dispositivo. Mai sopra questa
  pagina, un tool a schermo intero o un altro dialogo.
  ([account.js](../public/account/account.js)). La posizione salvata centra l'Editor
  a partenza vuota (es. "Draw on the map", [editor.js](../public/editor/editor.js))
  e il Recorder prima del primo fix GPS ([recorder.js](../public/recorder/recorder.js)).
- **Change email** — emaila un link di conferma al **nuovo** indirizzo; l'email cambia solo
  dopo la conferma (§3.4). Doppio campo (new + confirm) con controllo di uguaglianza, poi
  `RBApi('change_email', { email })` ([account.js](../public/account/account.js)).
- **Change password** — current + new + confirm (con conferma di uguaglianza), via
  `RBApi('change_password', { current, new })`; al successo memorizza la nuova credenziale
  nel password manager (§3.5) e svuota i campi ([account.js](../public/account/account.js)).
- **Delete account** — chiede conferma con `RBConfirmDanger` (che nomina l'azione
  irreversibile), poi `RBApi('account_delete', { password })` e, se ok, torna alla home
  ([account.js](../public/account/account.js)).
- **Sign out** — `RBSignOut()`, condiviso col menu account.
- **Run reports** (#619) — la scelta fissa per i nuovi report: *Ask me each time* / *Always
  public* / *Always private* (`runs_settings`); il report nel Reader la chiede quando è `ask`.
- **View my public profile** — il link a `/u/<username>` nella testata.
- In fondo, un bottone **My roadbooks** verso `../myroadbooks/`
  ([index.html](../public/account/index.html)).

### 3.4 Cambio email con ri-verifica

Il cambio email è a **due fasi**, per non lasciare l'account agganciato a un indirizzo non
provato. Inviato `change_email`, il server NON sostituisce l'email: la mette da parte (in
`pending_email`) e spedisce un link di conferma al nuovo indirizzo. Aprendo quel link si
torna su `/account/?verifyemail=…`; `init()` chiama
`RBApi('verify_email_change', { token })` ([account.js](../public/account/account.js)),
ri-legge `config` (l'email può essere cambiata) e rientra nel profilo aggiornato. Solo a
questo punto l'email è effettivamente cambiata.

### 3.5 Salvataggio nel password manager

I form di RDBK postano via `fetch` (nessuna navigazione), quindi il browser non vede mai
una submission di credenziali e da solo non offrirebbe di salvare/aggiornare la password.
`storeCredential(id, password)` ([account.js](../public/account/account.js)) è il
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
  il server espone una site key in `config` ([account.js](../public/account/account.js));
  senza configurazione i widget restano vuoti e inerti. Nell'**app nativa non viene mai
  caricato** (il widget è domain-locked e non gira in WebView) e il backend esenta gli
  Origin app fidati dal challenge (`verify_turnstile`).
- Ogni campo password riceve un toggle "occhio" mostra/nascondi iniettato a runtime
  ([account.js](../public/account/account.js)).
- I form usano `submit` con `preventDefault` per non ricaricare mai la pagina
  ([account.js](../public/account/account.js)).
- **Rate limiting del login.** Su un 429 del server (`retry_after`), il bottone Sign in si
  disabilita con un conto alla rovescia live finché la finestra non si libera
  ([account.js](../public/account/account.js)).

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
| Copy link | `<i fa-link>` → copia il link Reader pubblico (`RBCopy`), **solo se `public`** |
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
| Location | Il GPS è letto **sul dispositivo** per navigare/registrare; la posizione live **non** va ai server; nell'app nativa la registrazione continua a schermo bloccato via foreground service ([index.html](../public/privacy/index.html)) |
| Account (opzionale) | Gli strumenti base funzionano senza account; se creato, si memorizzano nome/cognome, username, email e password con **hash** sicuro ([index.html](../public/privacy/index.html)) |
| Roadbook & foto | Salvati sul server solo se **tu** li salvi; ogni roadbook è **privato di default**, pubblico solo se pubblicato come challenge ([index.html](../public/privacy/index.html)) |
| Camera & foto | La fotocamera è usata solo quando aggiungi una foto a un roadbook ([index.html](../public/privacy/index.html)) |
| Cosa NON facciamo | Niente pubblicità, niente SDK di tracking di terze parti, niente vendita di dati, niente raccolta posizione in background ([index.html](../public/privacy/index.html)) |
| Storage & sicurezza | Dati su server **in EU**; password e token con hash; HTTPS ([index.html](../public/privacy/index.html)) |
| Diritti & scelte | Uso completo senza account; modifica/eliminazione roadbook e foto; richiesta di cancellazione account via email ([index.html](../public/privacy/index.html)) |
| Bambini | Non rivolto a under 13 ([index.html](../public/privacy/index.html)) |
| Contatto | [info@rdbk.app](mailto:info@rdbk.app) |

---

## 6. Le altre pagine statiche e di marketing

Pagine di solo contenuto (HTML statico + i18n + `app.js`), senza logica propria degna di un
documento a sé:

- **About (`/about/`)** — "Chi siamo": la storia (da Roadbook System a RDBK.app), il team e i
  ringraziamenti. Markup in [about/index.html](../public/about/index.html) con qualche stile
  inline scoped alla pagina; nessun JS proprio.
- **Terms of Use (`/terms/`)** — le condizioni d'uso, in **italiano** (contenuto non i18n-keyato,
  solo il `<title>`/description lo sono). Porta un `<meta name="terms-version">` machine-readable
  che la registrazione registra come versione accettata (#135, vedi
  [backend-api](backend-api.md)). Email di contatto: `rdbk.admin@gmail.com`.
- **Contact (`/contact/`)** — pagina contatti (#161): intro, il **modulo di contatto** e, subito
  sotto, una riga (`.contact-legal`) con i rimandi a Privacy e About. Il modulo ([contact.js](../public/contact/contact.js))
  chiede nome, email (precompilati se sei loggato), l'argomento (sei pillole: domanda · idea · qualcosa
  non funziona · eventi · privacy · altro — 2 × 3 su un telefono, 3 × 2 da 620 px) e il messaggio (10–5000 caratteri); *Invia* si attiva solo a
  modulo completo e non parte due volte (`RBBusy`). Il server (`contact_send`, [app/contact.php](../app/contact.php))
  ricontrolla tutto, poi Turnstile, un rate limit per IP (5/ora) e un honeypot (`website`: un bot che
  lo riempie riceve `ok` e nulla parte); la mail va via SendGrid a `CONTACT_TO` con copia a
  `CONTACT_CC` (`.env`, separati da virgola) e `Reply-To` = il mittente. Nulla viene salvato. Linkata
  dal footer globale, in sitemap, i18n in tutte e 5 le lingue.
- **Standard (`/standard/`)** — la specifica del formato `.rdbk` (versione 1); documentata a parte
  in [rdbk-format](rdbk-format.md).
- **Validator (`/validator/`)** — si trascina o si sceglie un `.rdbk` (o un `roadbook.json`) e lo si
  valida nel browser con le stesse funzioni del resto dell'app (`RBZip.inspect` · `RB.validateRoadbook`
  · `RB.validateMedia`): nulla viene caricato né salvato. Mostra il verdetto, i dati del file e i
  primi 100 errori e warning col loro percorso. Linkato dalla landing di `/standard` (il suo primo pulsante), in sitemap;
  documentato in [rdbk-format](rdbk-format.md) §13.
- **Feature pages (`/features/<tool>/`)** — una pagina "How it works" per ogni tool (recorder ·
  editor · reader · tripmaster · ranking): marketing + spiegazione, con SEO dedicato e le stringhe
  `fp.*` tradotte in tutte le lingue (parità garantita dal test i18n, vedi [i18n](i18n.md)). I nomi
  brand dei tool restano in inglese in ogni lingua. Le pagine sono a due livelli di profondità →
  asset via `../../assets/…`. Ogni tool usa la sua **icona canonica** (vedi `CLAUDE.md`).

> Cartelle di `public/` **senza documento e che non ne richiedono uno**: `photos/` ed
> `event-logos/` (dati runtime, gitignored), `assets/fontawesome/` (vendored) e `assets/icons/`
> (palette, descritta in [rdbk-format](rdbk-format.md) e `CLAUDE.md`).

---

## 7. Limiti e quirk da segnalare

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
