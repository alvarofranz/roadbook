# Il guscio applicativo condiviso

Tutto ciò che ogni pagina di RDBK eredita gratis: gli helper globali `RB*`, l'header e il
footer renderizzati a runtime, il service worker con auto-refresh di versione, il pulsante di
installazione PWA e l'animazione della home. Documento di riferimento per
[app.js](../public/assets/js/app.js) e [home.js](../public/assets/js/home.js).

> `app.js` è caricato su **ogni** pagina (home + ogni tool). È un solo IIFE che, al caricamento,
> disegna l'interfaccia comune e popola il namespace `window.RB*`. Le pagine spediscono un
> `<header class="topbar">` vuoto e si affidano a questo file per riempirlo.

---

## 1. Bootstrap e radice dell'app

Lo script ricava la propria radice dall'URL dello `<script>` che lo carica, così funziona
identico alla radice del dominio e in una sottocartella:

```js
const here = (document.currentScript && document.currentScript.src) || location.href;
const ROOT = here.replace(/assets\/js\/app\.js.*$/, ''); // .../roadbook/
```

`ROOT` è il prefisso usato per ogni link, fetch e risorsa generati dal guscio.

C'è anche un rilevamento della **shell nativa** Capacitor:
`isNativeApp()` è vero solo dentro un webview nativo. In quel caso il documento riceve la classe
`native` (safe-area) e viene caricato il bridge `native.bundle.js`. In un browser normale tutto
questo è inerte.

**Nessuno zoom della pagina (#933).** Un'app non si ingrandisce sotto il dito: il viewport di ogni
pagina porta `maximum-scale=1, user-scalable=no`, `app.css` mette `touch-action: manipulation` su
tutto (niente doppio tap che zooma) e, poiché Safari iOS ignora il meta sul pizzico, `app.js`
rifiuta `gesturestart` ovunque tranne dentro una mappa (`.maplibregl-map`), che resta zoomabile.

---

## 2. Header, tab bar e footer globali

`renderChrome()` costruisce l'intera "chrome" comune. Viene chiamato subito; un secondo controllo
a `DOMContentLoaded` lo ri-esegue come rete di sicurezza se l'header è rimasto senza `.topnav`.

**Un catalogo, due presentazioni.** `SECTION` è l'unica fonte di verità della navigazione: per
ogni sezione `path`, etichetta i18n, icona FontAwesome canonica e `covers` (i prefissi di route
che la accendono). Due liste ne scelgono l'ordine — lo stesso ovunque (#807), vedi
[menu.md](menu.md):

| Lista | Dove | Voci |
|-------|------|------|
| `WEB_NAV` | top bar (`.topnav`) del **web desktop**, e colonna *Product* del footer | Roadbooks · Editor · Recorder · Navigate · Events |
| `APP_TABS` | **bottom tab bar** icon-only (`nav.app-tabbar`) su **ogni vista mobile** — web, PWA e app nativa | Back · Roadbooks · Editor · Recorder · Navigate · Events · Profile |

Su mobile il CSS nasconde la top bar e mostra la tab bar; su desktop il contrario. Non esiste un
menu hamburger né un menu a tutto schermo. *Navigate* copre Reader e Tripmaster (hub
`/navigate/`), *Events* copre `/event/` e `/ranking/`, *Profile* copre `/account/`. La voce attiva
è quella il cui nome coincide con il primo segmento del path, altrimenti quella che lo "copre".
Le etichette comuni (`NAV_TRANSLATE`: Navigate, Events, Profile, Roadbooks) sono `data-i18n`; i
nomi di prodotto restano in inglese. Nella tab bar *Back* fa `history.back()` (o torna alla home)
e *Profile* apre il menu account in un *dropup* (§3).

**Logo / brand.** L'header contiene il brand `RDBK.app` con il logo (`assets/logo.png`) che linka
alla home.

**Footer (#729).** `renderChrome` crea anche il `<footer class="foot">`: il brand con il claim e
i badge degli store (`[data-get-app="stores"]`), tre colonne — *Product* (`WEB_NAV`), *Resources*
e *Legal* (da `SITE_LINKS`: Help · Install · The .rdbk standard · What’s new · About · Privacy ·
Terms of Use · Contact) — e una riga in basso con il selettore lingua (`.lang`, costruito da
`i18n.js`), il copyright e la versione (`#appVersion`, §5). Il footer è nascosto su mobile: la
pagina Profile ripete gli stessi link (`RBSiteLinksHTML()` in `#accSiteLinks`) e ha il proprio
selettore lingua in fondo.

**Banner di sito (#103).** `renderBanner(banner)` inietta, sotto l'header, un avviso di sito
(`.site-banner`, livello `info`/`warning`, chiudibile) preso dal payload `config.banner`.

---

## 3. Il controllo account

`accountControl()` è una IIFE asincrona che chiede chi è loggato con `RBConfig()` (la chiamata
`config` con fallback offline), rende il banner di sito e mette il controllo account in coda
alla `.topnav`:

- **Anonimo** → un link *Sign in* via `RBLoginUrl()` (che aggiunge `?next=` con il percorso
  corrente, così dopo il login si torna dov'eri); nella tab bar il tab *Profile* porta lì.
- **Loggato** → un pulsante con lo username che apre l'`account-menu`. Il menu è **una lista
  sola**, `accountMenuHTML(user, participant, p)`, resa sia nel dropdown desktop (`acc…`) sia
  nel dropup della tab bar (`tab…`) e cablata da un solo `wireAccountMenu`:
  - *My profile* (`/u/<username>`) · *Account settings*;
  - fuori dalla modalità partecipante: *My roadbooks* · *Public roadbooks*;
  - i link di gestione di `manageLinks()` (#303): admin → *Event management*, *User management*,
    *Site settings*, *Roadbook trash*, *Logs*; organizzatore o co-organizzatore
    (`is_organizer` / `manages_events`) → *Event management*;
  - *My activity*; in modalità partecipante *Switch to full mode*;
  - in fondo *Help* · *App Info* · *Sign out*.
- **Modalità partecipante** (#163): la top bar nasconde i tool e mette in testa il link di ritorno
  all'evento; la home reindirizza a `/event/<slug>`.
- Se loggato, la **lingua UI** dell'account viene applicata all'avvio e ogni cambio dal
  selettore è persistito (`set_lang`). Un nuovo account riceve una volta la domanda sulla
  posizione predefinita (`askForLocation`, #749).

Ogni voce del menu porta la sua etichetta come `<span data-i18n>` (`menuLabel`), così un menu
aperto segue il cambio di lingua (#495). Il menu si apre col click sul pulsante (con
`stopPropagation` così il listener globale non lo richiude subito) e si chiude cliccando altrove.

> Il **login vero e proprio** vive nella pagina account, non qui (vedi `docs/account-pages.md`).
> Vale la pena ricordare un dettaglio del flusso: quando l'API risponde con un 429 di
> rate-limit, la risposta porta un `retry_after` (secondi) e `account.js` (`rateLimited`)
> mostra un toast e avvia un **conto alla rovescia live "Try again in M:SS"** sul bottone Sign
> in, tenendolo disabilitato finché la finestra non si esaurisce.

---

## 4. Service worker

Registrazione network-first con auto-reload all'aggiornamento:

- registra `sw.js` con `updateViaCache: 'none'` (la cache non serve mai il SW vecchio);
- memorizza `swReg` (riusato dal hard refresh) e forza subito un `reg.update()`;
- su `controllerchange` ricarica una sola volta, ma **solo se c'era già un controller** prima
  (`hadController`): così la primissima installazione non provoca un reload inatteso
 .

---

## 5. Sistema di versione (auto-refresh)

Quando `version.json` cambia, il guscio aggiorna **tutto** — SW, cache e app — sia da browser sia
da PWA installata.

`RBLiveVersion(root)` è **l'unico** punto che legge un `version.json` (mai dalla cache): `root`
sceglie quale — `API_ROOT` è la release viva del server, `ROOT` la copia servita con la pagina
(nell'app, il contenuto web incluso nel binario). Restituisce `{version, build}` oppure `null`
se irraggiungibile. Accanto ci sono `RBPlatformName()` (la piattaforma a parole) e
`RBRunningRelease()` (la release realmente in esecuzione: il binario nativo nell'app, altrimenti
lo stamp `?v=` con cui è stata servita questa pagina). Li usano `checkVersion`, il pop-up
**App Info** e la pagina About.

`checkVersion()`:

- chiede la release viva a `RBLiveVersion()`;
- scrive `v<versione> · build: <build>` in `#appVersion` nel footer;
- alla **prima** lettura registra solo il riferimento (`appVer`), senza ricaricare;
- se in seguito la versione cambia, esegue `hardRefresh()`.

`hardRefresh()` aggiorna il SW, cancella **tutte**
le cache e fa `location.reload()`.

`checkVersion` gira: subito, ogni **60 secondi** (`setInterval`) e ad ogni ritorno in primo piano
(`visibilitychange`).

**Quirk — niente reload durante una sessione attiva.** Se un tool imposta `window.RB_BUSY` (es. il
Reader durante una gara), la versione nuova viene memorizzata ma il refresh è **rimandato**
(`pendingRefresh`); appena `RB_BUSY` torna falso, al tick successivo scatta il `hardRefresh`. Se la
fetch fallisce (offline) non succede nulla: si riprova al tick dopo.

---

## 6. Il chip Install

Helper di stato: `isStandalone()` (già installata), `isIOS()` (iPhone/iPad, incluso l'iPad che si
presenta come `MacIntel` touch), `RBDevice()` (`ios` · `android` · `desktop`, condiviso con la
guida `/install/`).

- Il chip **Install** vive nella pila flottante dei chip (`chipStack()`, sopra la tab bar su
  mobile, in basso a destra su desktop) e non compare mai nell'app nativa, in una PWA già
  installata, sulla pagina `/install/` stessa, né dopo che l'utente l'ha chiuso con la sua ×
  (ricordato per dispositivo, #793).
- Su `beforeinstallprompt` il guscio memorizza l'evento e mostra il chip; su iOS (dove quell'evento
  non scatta mai) il chip compare a `DOMContentLoaded`.
- `onInstall()` apre **sempre** la guida `/install/` (#720): su un telefono mette in testa le app
  native, su un computer offre lei stessa l'installazione one-tap tramite `RBInstallPrompt.fire()`.

---

## 7. Il guardiano del lavoro non salvato (cross-tool)

Ogni tool fa il **checkpoint** del proprio lavoro in corso su `localStorage` e, **sulla propria
pagina**, propone di riprenderlo all'avvio (il Recorder, il Tripmaster, il Reader con un
`RBConfirm("Resume…")`, l'Editor con il recupero della bozza). Il problema che questo risolve è la
**visibilità tra tool diversi**: se inizi una registrazione e poi passi al Reader, quella
registrazione resterebbe orfana e invisibile. Il guscio la fa emergere **ovunque tranne** nel tool
che la possiede.

**Il chip.** `refreshPendingPill()` mette nella pila flottante dei chip (la stessa del chip
Install, visibile su ogni layout) una pillola **"Unsaved work · N"** che compare **solo** se c'è
lavoro in sospeso in un *altro* tool. Cliccandola si apre una `RBModal` (`openPendingModal`) con una riga per ciascun lavoro:

- **Resume** → un link al tool relativo (`reader/`, `recorder/`, …), che poi esegue il **proprio**
  flusso di recupero;
- **Discard** → `RBConfirmDanger` che **nomina** l'elemento (tipo + descrizione), poi rimuove le sue
  chiavi da `localStorage` e ridisegna la lista (regola "conferma prima di distruggere dati").

**La logica pura sta nel core.** `listPending()` legge le chiavi di `PENDING_KEYS`, le passa a
**`RB.pendingWork(snapshot)`** (in [roadbook-core.js](../public/assets/js/roadbook-core.js)) e
**filtra via il tool corrente** (quello già si occupa del proprio recupero). `pendingWork` applica
lo **stesso** guard "è recuperabile?" che ogni tool usa sul proprio checkpoint e ritorna un
descrittore per voce — `{ tool, url, keys[], kind, title?, noteCount?, distanceM?, noteIdx?,
noteTotal? }` — senza i18n (il guscio formatta etichetta e dettaglio via `RBt`). È funzione pura e
**testata** in `tests/roadbook-core.test.js`.

| Chiave `localStorage` | Tool | Guard "in sospeso" | Dettaglio mostrato |
|---|---|---|---|
| `rb_editor_draft` | Editor | bozza con `rb.meta` + `notes[]` | titolo · N note |
| `rb_recorder_session` | Recorder | `recording === true` | km registrati |
| `rb_tripmaster_session` | Tripmaster | un contatore/timer/GPX attivo | km |
| `rb_session` + `rb_session_roadbook` | Reader | `pen` presente **e** roadbook con `notes[]` | titolo · nota N/tot · km |

> Poiché la pillola dipende da `RB.pendingWork`, `roadbook-core.js` è caricato **su ogni pagina con
> l'header** — incluse home, account, privacy e standard, che prima non lo caricavano — così il
> guardiano funziona dappertutto.

---

## 8. Gli helper globali `RB*`

Ogni pagina riusa questi invece di reimplementarli. Firme reali:

### Interfaccia

#### `RBModal(cardHtml, cardClass, onDismiss, opts) → { el, q(sel), close }`
La modale base di **ogni** dialogo. Crea `.modal` > `.modal-card`, inietta `cardHtml` e applica il
focus-trap. **Due forme, una o l'altra:**
- **Si può lasciare senza decidere nulla** (il default): la chiude il **cerchio rosso con la ✕
  bianca centrato sul vertice in alto a destra** (`RBModalX`), lo sfondo o Escape — tutti invocano
  `onDismiss` se passata. Non porta **mai** un pulsante *Close* / *Cancel* suo: il contenuto
  scorre in `.modal-body`, fuori dal quale sta la ✕, così la card non la ritaglia.
- **Chiede una decisione** (`opts = { dismissable: false }`): niente ✕, né sfondo né Escape (il
  focus resta intrappolato); si esce solo dai suoi pulsanti — `RBConfirm` (No / Sì), il tratto
  successivo di una catena, la forma di ogni modale che tiene l'unica copia del lavoro
  dell'utente (vedi `CLAUDE.md`, *A modal holding the only copy…*).

`{ dismissable: false, corner: true }` è un modulo: la ✕ lo lascia, ma un tocco sullo sfondo non
perde quanto scritto. Ritorna `el` (l'overlay), `q(sel)` (query dentro la modale) e `close()`.
I dialoghi statici del Reader prendono la stessa ✕ da `openModal(id, onClose)`.

`cardClass` è un **modificatore** della `.modal-card` (definito in `app.css`):

| Modificatore | Effetto |
|--------------|---------|
| `narrow` | card stretta (usata da `RBConfirm`, `RBNeedAuth`) |
| `slim`   | card sottile |
| `wide`   | card larga |
| `center` | contenuto centrato (es. `narrow center` in `RBNeedAuth`) |
| `split`  | due pannelli (`.panes`) affiancati su tablet e desktop, impilati a tutto schermo su telefono |

#### `RBFocusTrap(card, onEscape) → release()`
Gestione del focus per una `.modal-card`: porta
il focus dentro, cicla il Tab all'interno e su Escape chiama `onEscape`. Ritorna `release()` che
sgancia il listener e ripristina il focus precedente. Usata da `RBModal` **e** dai dialoghi statici
del Reader — una sola casa per la logica.

#### `RBConfirm(msg, danger) → Promise<boolean>`
Conferma stilizzata costruita su `RBModal` (card `narrow`, una decisione: niente ✕). Risolve `true`/`false`. `msg` passa per
`RBt` (le chiavi inglesi si traducono, le stringhe già tradotte/composte passano invariate).
`danger === true` colora il pulsante di conferma come azione distruttiva.

**I pulsanti sono sempre No / Sì**, e non sono configurabili (#435). Prima il pulsante affermativo
prendeva un'etichetta dal chiamante ("Recover", "Delete", "Resume"…) e il negativo diceva
*Cancel*: ma *Cancel* è la parola sbagliata per la metà negativa di una domanda — si legge come
"annulla quello che stavo facendo", non "no". Una conferma fa una domanda, e i pulsanti la
rispondono; tutto ciò che è specifico della decisione sta in `msg`, che è esattamente dove una
conferma di cancellazione deve già nominare ciò che sta cancellando.

#### `RBConfirmDanger(msg) → Promise<boolean>`
Scorciatoia per `RBConfirm(msg, true)` — la conferma usata per **ogni azione che distrugge dati**
(cancellazioni, discard), che per convenzione **nomina** l'oggetto rimosso.

#### `RBWebGpsWarn(msg?)`
Banner che avverte che la GPS del browser è
inaffidabile sui telefoni. Chiamata una volta per pagina dai tool di navigazione (Recorder,
Reader, Tripmaster). Inerte nell'app nativa (`.webgps-banner` è nascosto da `.native`). Si chiude
per **sessione** (`sessionStorage`), quindi non assilla ma riappare a ogni visita — la scelta è
temporanea e rispecchia il fatto che l'inaffidabilità è una proprietà persistente del browser.
`msg` è una chiave i18n che di default è `web.gps.warn`.

Va in `body.prepend`, **nel flusso**, e il CSS non gli dà alcun `position`: prende il suo spazio e
spinge giù la pagina. Fissato in alto copriva ciò che il tool ci ancora — su un telefono, dove va
a capo su tre righe (151 px), nascondeva l'odometro totale del Reader e rendeva del tutto
inaccessibile il pulsante "Navigate" dell'anteprima (#403). È un avviso una-tantum, non una barra
di stato: scorrere via è il comportamento giusto.

#### `RBCopy(text, okMsg?)`
L'**unico** modo di copiare negli appunti. `okMsg` nomina cosa è stato copiato; il messaggio di
errore è lo stesso per tutti. La Clipboard API asincrona non è sempre lì da attendere: fuori da un
contesto sicuro, in WebView vecchie o quando la scrittura viene rifiutata, `navigator.clipboard`
può essere `undefined` — e un `navigator.clipboard.writeText(...)` non protetto **lancia dove il
chiamante non può intercettare**, quindi la copia non avviene in silenzio e non compare nemmeno il
toast di errore (#423, il pulsante Copia del QR di evento). Quindi: si verifica che l'API ci sia,
e in caso contrario (o se rifiuta) si ripiega su una `textarea` usa-e-getta fuori schermo
(`.copy-shuttle`) selezionata e copiata con `execCommand` — deprecato ma è l'unica strada in un
contesto non sicuro, e non chiede permessi. Nessuna pagina chiama la Clipboard API da sé: lo
verifica [tests/ui-contracts.test.js](../tests/ui-contracts.test.js).

#### `RBBusy(el, { onEnd }) → { ok(), reset() }`
Il pulsante che ha lanciato un'operazione asincrona ne **riporta l'esito su sé stesso**: disabilitato
con uno spinner mentre gira, poi — su `ok()` — verde con la spunta per 3 s, e infine di nuovo com'era.
`reset()` rimette semplicemente il pulsante com'era: un fallimento (il motivo è nel toast), oppure un
chiamante che sul pulsante dipinge il proprio esito — il modale di fine registrazione del Recorder
segna lì la destinazione raggiunta. Un toast è facile da perdere e sparisce in pochi
secondi, quindi dopo un salvataggio non si sapeva se il roadbook fosse davvero sul server (#459); la
risposta sta sul pulsante che si è premuto.

Sostituisce l'icona **solo** se c'è un `<i>`, così un pulsante con etichetta tiene testo e larghezza e
nulla salta. Riabilitare è lasciato all'`onEnd` del chiamante quando ne ha uno: un roadbook appena
salvato non ha più niente da salvare, quindi il suo *Save* torna disabilitato — e `.btn:disabled` ora
si vede (opacità .45), perché un pulsante inerte è esso stesso la risposta a "si è salvato?". Lo
spinner dentro un pulsante prende `currentColor`: quello standard è un anello `--line` con la cima
`--sand`, invisibile su un `.btn-primary` sabbia. Un `el` che non esiste restituisce uno stub inerte —
`leaveEditor` salva senza alcun pulsante a schermo. Comportamento verificato in
[tests/busy-button.test.js](../tests/busy-button.test.js).

#### Le help tip (`.help-tip` + `data-tip`, #859)
L'aiuto di un campo è un'icona ⓘ `.help-tip` il cui `data-tip` porta il testo (tradotto via
`data-i18n-tip`). Non c'è una funzione da chiamare: `app.js` delega gli eventi a livello di documento e
tutte le tip condividono **una sola bolla** (`.tip-bubble`), `position: fixed` sul viewport così che
nessun pannello che scorre la tagli, messa **sopra** la sua ⓘ (sotto solo se sopra non c'è spazio)
perché non copra mai il campo che spiega, e tenuta a 8 px dentro lo schermo. Si apre con hover, focus
o tap; si chiude uscendo, perdendo il focus, scorrendo o toccando altrove. Verificato da
[tests/help-tips.test.js](../tests/help-tips.test.js).

### La regola delle barre condivise

Quattro bug di fila (#401 · #403 · #404 · #405) sono venuti dallo stesso errore — una barra che il
livello condiviso ancora a un bordo del viewport, con uno `z-index` molto sopra la pagina, senza
riservare spazio. Il contratto, verificato staticamente da
[tests/shared-chrome.test.js](../tests/shared-chrome.test.js):

| Regola | Come |
|--------|------|
| Una barra ancorata a un bordo **prende spazio** oppure **pubblica la sua altezza** | il banner GPS sta nel flusso; l'avviso cookie pubblica `--notice-h` e il `padding-bottom` di `body` lo riserva (in tutte le modalità, immersive compresa); il Reader pubblica `--bottom-stack` (vedi [reader.md](reader.md)) |
| Una **modale è il livello più alto** | `.modal` sta sopra ogni barra condivisa: altrimenti disegnavano sui suoi pulsanti, e un avviso non si può nemmeno chiudere mentre una modale è aperta (il backdrop mangia il click) |
| Su telefono un avviso resta **compatto** | l'avviso cookie tiene il pulsante accanto al testo: impilato era alto 177 px su 390, un quinto dello schermo, e arrivava sul pulsante di avvio del Recorder |
| Uno strumento che possiede lo schermo usa un **guscio applicativo**, non barre fissate | il Reader in navigazione è un `position: fixed; inset: 0` a colonna flex, con la lista note come unico scroller e le barre come righe di flusso — vedi [reader.md § Il guscio applicativo](reader.md). Fissare le barre e calcolarne la posizione contro `window.innerHeight` non regge su iOS, dove quel viewport si muove dopo il load, al resize e alla rotazione (#429) |

#### `RBWebGpsConfirm(comp) → Promise<boolean>`
Gate **one-time** (deciso una volta per browser, `localStorage`) che precede ogni azione
critica per la GPS in un browser: start di registrazione (Recorder) e inizio di navigazione
(Reader). Mostra una modale su `RBModal` (card `narrow`) e risolve `true` se l'utente prosegue,
`false` se annulla. Se l'utente sceglie "usa comunque la web" la scelta viene ricordata e il gate
non riappare. `comp === true` seleziona la variante con copia più severa (prova a punteggio:
`web.gps.comp.*`); altrimenti usa `web.gps.*`.

#### `RBNeedAuth(msg)` → (apre una modale, nessun ritorno)
Prompt "serve un account" con CTA verso
`account/`. `msg` ha un default tradotto.

#### `RBToast(msg)`
Toast tradotto nell'elemento `#toast`, su ogni
pagina: se la pagina non ne ha uno, lo crea alla prima chiamata. Imposta `role=status`/`aria-live=polite`,
mostra il messaggio per **2500 ms**, poi lo nasconde.

### Dati / rete

#### `RBApi(action, body) → Promise<object>`
POST JSON a `api/index.php` con
`{ action, ...body }`. Ritorna la risposta parsata, oppure `{ ok: false, error: 'Network error.' }`
in caso di fallimento di rete. Nelle app native aggiunge l'header `Authorization: Bearer <token>`
e cattura il token dalle risposte di login (inerte nel browser, dove vale il cookie di sessione
httponly).

#### `RBUpload(fields, file, name) → Promise<object>`
Carica **un'immagine** su `upload.php`. Riduce prima il file con `RBImg.toBlob`, poi lo invia come
campo `photo` insieme ai `fields` extra (`type` = avatar/event_logo/photo/cover, §6 di
[backend-api](backend-api.md)). Ritorna il JSON, o `{ ok: false, error: 'Upload failed.' }` in errore.

#### `RBDownload(data, filename)`
Scarica un Blob **o** una URL stringa. Nel browser
crea un `<a download>` e lo clicca; **nell'app** `<a download>` è ignorato dalla WebView, quindi
ogni file (GPX, `.rdbk`, CSV, PDF…) va al **foglio di condivisione del sistema**
(`RBNative.shareFile`): salva in File / Download, apri in un'altra app, invia. L'utente vede sempre
dove va e decide lui — mai un salvataggio silenzioso in una cartella che nessuno trova.

### Immagini

#### `RBImg` — downscaler lato client
Riduce le foto nel browser **prima** dell'upload,
così non superano mai `post_max_size` di PHP. Usato da avatar, galleria e logo evento.

- `RBImg.toBlob(file, max = 900, q = 0.82) → Promise<Blob>`
  — un JPEG piccolo per l'upload. Se il file non è
  un'immagine, o qualcosa fallisce, ritorna il file originale (degrada con grazia).
- `RBImg.toDataURL(file, max = 256) → Promise<string>`
  — una data: URI **PNG** per l'embedding (es. il
  logo evento — mantiene la trasparenza). Helper privato `_canvas(file, max)` per il ridimensionamento.

### Utility stringa

#### `RBesc(s) → string`
HTML-escape (`& < > "`) per interpolazione sicura
in `innerHTML`.

#### `RBSummary(distanceM, noteCount) → string`
Sottotitolo one-liner di un roadbook: `"12.3 km · 45 notes"` (la parola unità è tradotta via `RBt`).

### Altri primitivi condivisi

Aggiunti man mano che le feature (eventi, gestione, registrazione vocale) li hanno richiesti;
vivono qui in **un solo posto** e sono riusati ovunque.

#### Le card: `RBGalleryCard` · `RBRoadbookCard` · `RBEventCard` · `RBFillRoutes` (#770)
**Un solo disegno** per ogni galleria. `RBGalleryCard({ href, thumb, title, meta, icon?, placeholder?,
overlays?, badges?, stats?, body? })` costruisce l'anatomia: in alto il **media** (foto,
rotta o logo, scurito al piede da un gradiente perché ciò che ci sta sopra si legga) con i `badges`
in alto a sinistra, le azioni `overlays` in alto a destra (`.card-actions`, es. `RBCopyLinkOverlay`)
e le `stats` (`[icona|null, valore, etichetta]`) al piede, tutte come pillole scure traslucide;
sotto, titolo (max 2 righe) e riga `meta`. L'immagine copre sempre il riquadro, foto o logo che sia. HTML in `meta`/`overlays`/`body`/`placeholder`/`badges` già sanificato dal chiamante.

Le pagine non la chiamano direttamente, ma tramite due builder:
- **`RBRoadbookCard(r, { href, overlays?, body?, category? })`** — veicoli (`RBVehicleIcons`) e
  categoria dell'evento sul media, distanza e numero di note al piede, `@autore` sotto. Usata da home,
  galleria Roadbooks, pagina evento, profilo pubblico e dal carosello dell'app.
- **`RBEventCard(e)`** — la sua immagine, un foglietto di calendario con il primo giorno, lo stato
  (*Upcoming* sabbia · *Live* verde · *Ended* spento), numero di roadbook e veicoli al piede,
  organizzatore e intervallo di date sotto.

Una card roadbook **senza foto** parte con un placeholder `data-route`: **`RBFillRoutes(container)`**
(chiamata da chi disegna) carica il roadbook una sola volta per slug (`public_get`, direttamente —
non serve `challenges.js` sulla pagina) e lo sostituisce con un SVG
statico della **forma della rotta** (nessuna basemap). Chi nasconde la mappa (`map_allowed:false`)
resta sull'icona.

#### `RBPager(el, page, pages, onGo, label?)`
Renderizza in `el` i controlli di paginazione (precedente / `pagina / totale` [`· label`] /
successivo); i pulsanti chiamano `onGo(p)`. Con una sola pagina mostra solo l'eventuale `label`.

#### `RBSuccess` — `ring()` · `fanfare()` · `flash()` · `unlock()`
Il segnale di "fatto" (#768): il campanello `assets/sounds/success.mp3`. `flash()` lo suona e mostra
un grande check a schermo per meno di un secondo (una nota caduta nel Recorder o in *Adjust on the
trail*); `ring()` suona soltanto (il Reader, a ogni nota validata); `fanfare()` suona le trombe
`assets/sounds/fanfare.mp3` quando il roadbook è completato (l'ultima nota, #843).

I suoni si **mescolano con la musica** di un'altra app, non la fermano (#842): vengono decodificati una
volta e suonati con Web Audio, non con un `<audio>` — Chrome e la WebView Android chiedono l'audio
focus solo per gli elementi media — e su iOS la pagina dichiara il suo audio `transient`
(`navigator.audioSession`, WebKit 16.4+), una sessione mescolabile. Su iOS una sessione mescolabile
segue l'interruttore del silenzioso. Il contesto audio parte solo da un gesto dell'utente: la pagina
che suonerà più tardi senza gesto (la validazione automatica via GPS del Reader) chiama `unlock()`
dal tap che avvia la sessione, che decodifica anche entrambi i suoni in anticipo.

Si **riprende dalle interruzioni audio di iOS** (#937: una telefonata, Siri, un'altra app che prende
l'audio): un suono non aspetta mai una ripresa più di `RESUME_WAIT_MS` (400 ms) — se il contesto non
riparte, quel suono si perde, mai il successivo; ogni tocco (`pointerdown` · `touchend` · `keydown`,
in fase di capture) mentre il contesto non è `running` lo riprende, e un contesto `interrupted`, che
iOS spesso non lascia più ripartire, viene chiuso e sostituito da uno nuovo.

#### `RBRequireUser(msgEl, { admin?, account? }) → Promise<user|null>`
Gate di una pagina di gestione: risolve l'utente loggato, o scrive il messaggio standard in `msgEl`
e ritorna `null` (con `admin: true` esige anche il ruolo admin).

#### Utility varie

| Helper | Ruolo |
|--------|-------|
| `RBLoginUrl()` | URL della pagina account con `?next=` al percorso corrente |
| `RBSetMeta({ title, description, canonical })` | imposta `<title>`/meta description/canonical della pagina |
| `RBFmtDate(iso)` · `RBDateRange(startIso, endIso)` | data localizzata · intervallo `start – end` |
| `RBDateField(input)` | rende un input data localizzato |
| `RBFmtSize(bytes)` | dimensione leggibile (KB/MB), usata dall'uso-spazio |
| `RBCopy(text, okMsg?)` | copia negli appunti (vedi sopra) |
| `RBDebounce(fn, ms = 300)` | `fn` parte `ms` dopo l’ultima chiamata (`.cancel()` la annulla) — le ricerche che interrogano il server, sempre insieme a un contatore di sequenza che scarta le risposte superate |
| `RBCsv(rows)` | righe (array di celle, intestazione in testa) → Blob CSV con BOM UTF-8 e quoting RFC-4180: l’unico modo in cui un export scrive un CSV (attività, partecipanti, classifica) |
| `RBBusy(el, { onEnd })` | il pulsante che ha lanciato un'operazione ne riporta l'esito (vedi sopra) |
| `RBTurnstile(el, siteKey) → { token(), reset() }` | l'unico loader di Cloudflare Turnstile (moduli account, commenti #809): rende il widget in `el` dal `load` dello script (#863); senza chiave o dentro l'app non fa nulla e `token()` è `null` — il server esenta le origin dell'app |
| `RBDeviceLabel()` | stringa grezza del dispositivo, per gli admin (#870): superficie (App · PWA · Web), browser e modello/OS letti dallo user agent — mai un identificativo; `run_save` la salva in `roadbook_runs.device` |

### Lista roadbook condivisa

#### `RBRoadbookList(container, onChange?) → Promise<number>`
La lista dei roadbook salvati dell'utente loggato, **condivisa** da *My roadbooks* e dalla landing
dell'Editor (lì non c'è una seconda implementazione: entrambe chiamano questo helper). Fa
`RBApi('rb_list')`, e se non c'è nessun roadbook scrive un messaggio tradotto e ritorna `0`; una
chiamata fallita non è una lista vuota (offline sul campo non deve mai leggersi "non hai roadbook",
#218), quindi scrive l'errore — o l'avviso offline — e ritorna `0`. `onChange` scatta dopo un
duplica/elimina, perché la pagina aggiorni ciò che sta accanto (es. il cestino, #238).
Altrimenti ritorna il numero di roadbook e disegna, in testa, una riga di **uso spazio**
(`used_bytes / quota_bytes`, #99) e, per ogni riga (`rowHtml`):

- il riassunto `RBSummary` + data ultima modifica, e un **select di stato** (`draft` · `ready` ·
  `public`, da `RB.ROADBOOK_STATUSES`) che chiama `rb_status` al cambio e ri-renderizza dalla
  verità del server;
- azioni con percorsi relativi (funzionano da `/editor/` come da `/myroadbooks/`):
  - **Read** → `../reader/?rb=<id>` — apre quel roadbook nel Reader, **anche se privato/personale**;
  - **View** → `../challenge/<slug>` — la vetrina pubblica;
  - **Copy link** → copia il link Reader pubblico (`RBCopy`), **solo se `public`**;
  - **Edit** → `../editor/?rb=<id>`;
  - **Export** → `../editor/?rb=<id>&export=1` — apre l'Editor e fa **scattare subito il popup
    Export** (l'Editor toglie poi il flag `export=1` dall'URL, così un refresh non lo riapre);
  - **Duplicate** (`rb_duplicate`) e **Delete** (con la conferma `RBConfirmTrash`, che **nomina il
    titolo** e dice che il roadbook va nel cestino).

**Ricerca + paginazione.** La barra di ricerca viene mostrata **solo se la lista ha più di 5
voci**; filtra in locale via `RB.filterRoadbooks(all, q)` (match case-insensitive sul titolo). La
paginazione è **client-side a 12 per pagina** e il pager (via `RBPager`, nel `.pager`) appare
**solo oltre la prima pagina**. `render()` ridisegna solo le righe e il pager ad ogni
ricerca/cambio pagina, **senza ricostruire la barra di ricerca** (così il focus e il testo
digitato non si perdono); duplica/elimina/cambio-stato ri-chiamano `RBRoadbookList` per intero.

---

## 9. `home.js` — la galleria della home

[home.js](../public/assets/js/home.js) anima la **galleria di roadbook pubblici (challenge)** in
homepage. È una piccola IIFE che esce subito se non trova `#galleryGrid`.

- Chiama `RBChallenges.listPublic()` per i roadbook pubblici dal database e li mette in cache in
  `cards`; ne mostra solo un **teaser di 6** (la lista completa vive su `/roadbooks`).
- `render()` disegna le card con **`RBRoadbookCard`** (vedi sopra) e poi `RBFillRoutes(grid)` per
  la forma della rotta delle card senza foto. Ogni card linka a `challenge/<slug>`.
- Lista vuota o errore di fetch → messaggio tradotto `gallery.empty`.
- Si riaggancia all'evento `rb-lang` per **ri-renderizzare al cambio lingua senza rifare la fetch**
  (usa la cache `cards`).

---

## 10. Limiti e quirk

- **Un solo IIFE, niente export.** Tutto vive su `window.RB*`; non c'è modularità a moduli ES.
  L'ordine di caricamento conta: `RBModal`/`RBesc`/`RBt` devono esistere prima dell'uso (la chrome
  usa `RBt` per le etichette, quindi `i18n.js` va caricato prima).
- **`renderChrome` viene chiamato fino a due volte** (subito + rete di sicurezza a
  `DOMContentLoaded`): è idempotente perché riusa l'`<header>` esistente, ma la seconda passata
  scatta solo se il nav manca.
- **`appVersion` nel footer dipende dalla fetch.** Offline o al primissimo caricamento può restare
  vuoto finché `checkVersion` non riesce.
- **Il refresh di versione è rimandato, non perso, durante `RB_BUSY`** — ma se la tab resta
  `RB_BUSY` per sempre, l'utente resta sulla versione vecchia finché la sessione non finisce.
- **Il chip Install su iOS è euristico**: si basa su user-agent / `maxTouchPoints`, perché
  Safari non espone `beforeinstallprompt`. Porta alla guida `/install/`, non a un vero prompt.
- **L'autenticazione a token è solo per la shell nativa.** Nel browser `RBApi`/`RBUpload` non
  leggono né inviano alcun token: si affidano al cookie di sessione `same-origin`.
- **`RBUpload` carica una sola immagine** per chiamata (campo `photo`); più file richiedono più
  chiamate.
- **`RBImg.toBlob` degrada in silenzio**: se il canvas/encoding fallisce ritorna il file originale,
  quindi un upload può finire più grande del previsto senza errore visibile.

#### `RBTour(id, steps)` — i tour guidati (#906)
La prima volta che si apre uno strumento, i suoi comandi principali vengono indicati uno per uno:
schermo scurito, un foro con un anello dorato che pulsa sopra il comando, e un fumetto che lo indica
con titolo, una frase, i puntini di avanzamento, **Salta tutorial** e **Avanti**.

- **Si chiede una volta sola**, per sempre (`RBConfirm`, No / Sì). Con un No non compare più nessun
  tour, da nessuna parte.
- Dopo un Sì, **ogni strumento mostra il suo tour una volta**. Conta come visto dal
  primo passo, così un tour interrotto non torna. Salta ed Esc lo chiudono per sempre.
- Le risposte del dispositivo stanno in `rb_tour` (`{ optin, seen }`).
- Un passo il cui comando non è sullo schermo viene saltato.
- `steps: [{ target, title, text }]` sono stringhe sorgente inglesi brevi, tradotte con `RBt`.
- I tour: Reader (all'inizio della navigazione, da fermi), Recorder (all'inizio della registrazione),
  Editor (al primo roadbook aperto), Tripmaster (alla prima visita). `tests/guided-tours.test.js` li
  prova e controlla che ogni passo indichi un comando che esiste.
