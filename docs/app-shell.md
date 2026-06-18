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
identico alla radice del dominio e in una sottocartella ([app.js:11](../public/assets/js/app.js#L11)):

```js
const here = (document.currentScript && document.currentScript.src) || location.href;
const ROOT = here.replace(/assets\/js\/app\.js.*$/, ''); // .../roadbook/
```

`ROOT` è il prefisso usato per ogni link, fetch e risorsa generati dal guscio.

C'è anche un rilevamento della **shell nativa** Capacitor ([app.js:15](../public/assets/js/app.js#L15)):
`isNativeApp()` è vero solo dentro un webview nativo. In quel caso il documento riceve la classe
`native` (safe-area) e viene caricato il bridge `native.bundle.js`. In un browser normale tutto
questo è inerte.

---

## 2. Header e footer globali

`renderChrome()` ([app.js:27](../public/assets/js/app.js#L27)) costruisce l'intera "chrome"
comune. Viene chiamato subito; un secondo controllo a `DOMContentLoaded`
([app.js:72](../public/assets/js/app.js#L72)) lo ri-esegue come rete di sicurezza se qualcosa è
andato in race.

**Navigazione.** L'elenco dei tool cambia a seconda della piattaforma
([app.js:33](../public/assets/js/app.js#L33)):

| Contesto | Tool nel menu |
|----------|---------------|
| App nativa (companion da campo) | Reader · Tripmaster · Recorder |
| Sito web | Recorder · Editor · Reader · Tripmaster · Ranking |

Il link al tool corrente riceve la classe `active`, decisa confrontando il path relativo alla
`ROOT` con il prefisso del tool ([app.js:30](../public/assets/js/app.js#L30)).

**Logo / brand.** L'header contiene il brand `RDBK.app` con il logo
(`assets/logo.png`) che linka alla home ([app.js:41](../public/assets/js/app.js#L41)).

**Menu mobile full-viewport.** Un `<button class="navtoggle">` (icona hamburger) apre/chiude la
`<nav class="topnav">`. `setOpen(open)` ([app.js:46](../public/assets/js/app.js#L46)):

- aggiunge/toglie `.open` al nav e `.nav-open` all'header (quest'ultima toglie il blur così il
  menu può coprire l'intera viewport);
- sincronizza `aria-expanded`;
- alterna l'icona tra barre (`fa-bars`) e croce (`fa-xmark`).

Il menu si chiude cliccando fuori ([app.js:53](../public/assets/js/app.js#L53)) o cliccando un
link / un pulsante che **non** sia `.account-button` ([app.js:54](../public/assets/js/app.js#L54)) —
il pulsante account resta aperto per mostrare il proprio sottomenu.

**Footer.** `renderChrome` crea anche il `<footer class="foot">`
([app.js:56](../public/assets/js/app.js#L56)) con: marchio, link allo standard `.rdbk`, GitHub,
licenza WTFPL, la versione corrente (`#appVersion`, popolata dal sistema di versione) e il
selettore lingua EN/ES/IT. Se `RBi18n` non è caricato, il selettore lingua viene nascosto
([app.js:68](../public/assets/js/app.js#L68)).

---

## 3. Il controllo account nel menu

`accountControl()` ([app.js:301](../public/assets/js/app.js#L301)) è una IIFE asincrona che
chiede all'API chi è loggato (`RBApi('config')`, campo `user`) e inserisce un controllo nel nav:

- **Anonimo** → un'icona-link a `account/` (Sign in / Create account)
  ([app.js:308](../public/assets/js/app.js#L308)).
- **Loggato** → un pulsante con lo username che apre un `account-menu` con: *My roadbooks*,
  *My profile* e *Sign out* ([app.js:310](../public/assets/js/app.js#L310)).

Il menu si apre col click sul pulsante (con `stopPropagation` così il listener globale non lo
richiude subito) e si chiude cliccando altrove ([app.js:320](../public/assets/js/app.js#L320)).
*Sign out* chiama `RBApi('logout')` e ricarica la pagina.

---

## 4. Service worker

Registrazione network-first con auto-reload all'aggiornamento
([app.js:79](../public/assets/js/app.js#L79)):

- registra `sw.js` con `updateViaCache: 'none'` (la cache non serve mai il SW vecchio);
- memorizza `swReg` (riusato dal hard refresh) e forza subito un `reg.update()`;
- su `controllerchange` ricarica una sola volta, ma **solo se c'era già un controller** prima
  (`hadController`): così la primissima installazione non provoca un reload inatteso
  ([app.js:82](../public/assets/js/app.js#L82)).

---

## 5. Sistema di versione (auto-refresh)

Quando `version.json` cambia, il guscio aggiorna **tutto** — SW, cache e app — sia da browser sia
da PWA installata.

`checkVersion()` ([app.js:93](../public/assets/js/app.js#L93)):

- fa `fetch('version.json', { cache: 'no-store' })` e legge `version`;
- scrive `v<versione>` in `#appVersion` nel footer;
- alla **prima** lettura registra solo il riferimento (`appVer`), senza ricaricare;
- se in seguito la versione cambia, esegue `hardRefresh()`.

`hardRefresh()` ([app.js:109](../public/assets/js/app.js#L109)) aggiorna il SW, cancella **tutte**
le cache e fa `location.reload()`.

`checkVersion` gira: subito, ogni **60 secondi** (`setInterval`) e ad ogni ritorno in primo piano
(`visibilitychange`) ([app.js:114](../public/assets/js/app.js#L114)).

**Quirk — niente reload durante una sessione attiva.** Se un tool imposta `window.RB_BUSY` (es. il
Reader durante una gara), la versione nuova viene memorizzata ma il refresh è **rimandato**
(`pendingRefresh`); appena `RB_BUSY` torna falso, al tick successivo scatta il `hardRefresh`
([app.js:96](../public/assets/js/app.js#L96), [app.js:104](../public/assets/js/app.js#L104)). Se la
fetch fallisce (offline) non succede nulla: si riprova al tick dopo.

---

## 6. Pulsante di installazione (PWA) + iOS

Helper di stato ([app.js:119](../public/assets/js/app.js#L119)): `isStandalone()` (già installata),
`isIOS()` (iPhone/iPad, incluso l'iPad che si presenta come `MacIntel` touch).

Flusso ([app.js:123](../public/assets/js/app.js#L123)):

- su `beforeinstallprompt` il guscio intercetta l'evento, lo memorizza (`deferred`) e mostra il
  pulsante;
- su `appinstalled` nasconde il pulsante;
- `ensureBtn()` crea il pulsante una sola volta dentro la `.topnav` (mai se già standalone)
  ([app.js:126](../public/assets/js/app.js#L126));
- `onInstall()` ([app.js:140](../public/assets/js/app.js#L140)): se c'è il `deferred` lancia il
  prompt nativo; altrimenti, su **iOS** (dove `beforeinstallprompt` non scatta mai) apre una modale
  con le istruzioni Safari in 3 passi (`showIosModal`, [app.js:152](../public/assets/js/app.js#L152)).

Su iOS non standalone il pulsante viene mostrato già a `DOMContentLoaded`
([app.js:150](../public/assets/js/app.js#L150)).

---

## 7. Gli helper globali `RB*`

Ogni pagina riusa questi invece di reimplementarli. Firme reali:

### Interfaccia

#### `RBModal(cardHtml, cardClass, onDismiss) → { el, q(sel), close }`
([app.js:214](../public/assets/js/app.js#L214)) — La modale base di **ogni** dialogo. Crea
`.modal` > `.modal-card`, inietta `cardHtml`, applica il focus-trap e si chiude cliccando sullo
sfondo o con Escape (invocando `onDismiss` se passata). Ritorna `el` (l'overlay), `q(sel)`
(query dentro la modale) e `close()`.

`cardClass` è un **modificatore** della `.modal-card` (definito in `app.css`):

| Modificatore | Effetto |
|--------------|---------|
| `narrow` | card stretta (usata da `RBConfirm`, `RBNeedAuth`) |
| `slim`   | card sottile |
| `wide`   | card larga |
| `center` | contenuto centrato (es. `narrow center` in `RBNeedAuth`) |

#### `RBFocusTrap(card, onEscape) → release()`
([app.js:199](../public/assets/js/app.js#L199)) — Gestione del focus per una `.modal-card`: porta
il focus dentro, cicla il Tab all'interno e su Escape chiama `onEscape`. Ritorna `release()` che
sgancia il listener e ripristina il focus precedente. Usata da `RBModal` **e** dai dialoghi statici
del Reader — una sola casa per la logica.

#### `RBConfirm(msg, okLabel) → Promise<boolean>`
([app.js:280](../public/assets/js/app.js#L280)) — Conferma stilizzata costruita su `RBModal`
(card `narrow`). Risolve `true`/`false`. `msg` e `okLabel` passano per `RBt` (le chiavi inglesi si
traducono, le stringhe già tradotte/composte passano invariate).

#### `RBNeedAuth(msg)` → (apre una modale, nessun ritorno)
([app.js:290](../public/assets/js/app.js#L290)) — Prompt "serve un account" con CTA verso
`account/`. `msg` ha un default tradotto.

#### `RBToast(msg)`
([app.js:234](../public/assets/js/app.js#L234)) — Toast tradotto nell'elemento `#toast` della
pagina (ogni tool ne spedisce uno vuoto). Imposta `role=status`/`aria-live=polite`, mostra il
messaggio per **2500 ms**, poi lo nasconde. Se `#toast` non c'è, non fa nulla.

### Dati / rete

#### `RBApi(action, body) → Promise<object>`
([app.js:258](../public/assets/js/app.js#L258)) — POST JSON a `api/index.php` con
`{ action, ...body }`. Ritorna la risposta parsata, oppure `{ ok: false, error: 'Network error.' }`
in caso di fallimento di rete. Nelle app native aggiunge l'header `Authorization: Bearer <token>`
e cattura il token dalle risposte di login (inerte nel browser, dove vale il cookie di sessione
httponly — vedi [app.js:244](../public/assets/js/app.js#L244)).

#### `RBUpload(fields, file, name) → Promise<object>`
([app.js:269](../public/assets/js/app.js#L269)) — Carica **un'immagine** su `upload.php`. Riduce
prima il file con `RBImg.toBlob`, poi lo invia come campo `photo` insieme ai `fields` extra.
Ritorna il JSON, o `{ ok: false, error: 'Upload failed.' }` in errore.

#### `RBDownload(data, filename)`
([app.js:263](../public/assets/js/app.js#L263)) — Scarica un Blob **o** una URL stringa creando un
`<a download>` e cliccandolo.

### Immagini

#### `RBImg` — downscaler lato client
([app.js:167](../public/assets/js/app.js#L167)) — Riduce le foto nel browser **prima** dell'upload,
così non superano mai `post_max_size` di PHP. Usato da avatar, galleria e logo evento.

- `RBImg.toBlob(file, max = 900, q = 0.82) → Promise<Blob>`
  ([app.js:183](../public/assets/js/app.js#L183)) — un JPEG piccolo per l'upload. Se il file non è
  un'immagine, o qualcosa fallisce, ritorna il file originale (degrada con grazia).
- `RBImg.toDataURL(file, max = 256) → Promise<string>`
  ([app.js:189](../public/assets/js/app.js#L189)) — una data: URI **PNG** per l'embedding (es. il
  logo evento — mantiene la trasparenza). Helper privato `_canvas(file, max)` per il ridimensionamento.

### Utility stringa

#### `RBesc(s) → string`
([app.js:229](../public/assets/js/app.js#L229)) — HTML-escape (`& < > "`) per interpolazione sicura
in `innerHTML`.

#### `RBSummary(distanceM, noteCount) → string`
([app.js:231](../public/assets/js/app.js#L231)) — Sottotitolo one-liner di un roadbook:
`"12.3 km · 45 notes"` (la parola unità è tradotta via `RBt`).

---

## 8. `home.js` — la galleria della home

[home.js](../public/assets/js/home.js) anima la **galleria di roadbook pubblici (challenge)** in
homepage. È una piccola IIFE che esce subito se non trova `#galleryGrid`
([home.js:4](../public/assets/js/home.js#L4)).

- Chiama `RBChallenges.listPublic()` per i roadbook pubblici dal database e li mette in cache in
  `cards` ([home.js:25](../public/assets/js/home.js#L25)).
- `render()` ([home.js:10](../public/assets/js/home.js#L10)) costruisce le card: thumbnail (o un
  placeholder con icona mappa), titolo, `@username` e il sottotitolo via `RBSummary`. Ogni card
  linka a `challenge/<slug>`.
- Lista vuota o errore di fetch → messaggio tradotto `gallery.empty`.
- Si riaggancia all'evento `rb-lang` per **ri-renderizzare al cambio lingua senza rifare la fetch**
  (usa la cache `cards`) ([home.js:24](../public/assets/js/home.js#L24)).

---

## 9. Limiti e quirk

- **Un solo IIFE, niente export.** Tutto vive su `window.RB*`; non c'è modularità a moduli ES.
  L'ordine di caricamento conta: `RBModal`/`RBesc`/`RBt` devono esistere prima dell'uso (l'header
  usa `RBt` per il pulsante Install, quindi `i18n.js` va caricato prima).
- **`renderChrome` viene chiamato fino a due volte** (subito + rete di sicurezza a
  `DOMContentLoaded`): è idempotente perché riusa l'`<header>` esistente, ma la seconda passata
  scatta solo se il nav manca.
- **`appVersion` nel footer dipende dalla fetch.** Offline o al primissimo caricamento può restare
  vuoto finché `checkVersion` non riesce.
- **Il refresh di versione è rimandato, non perso, durante `RB_BUSY`** — ma se la tab resta
  `RB_BUSY` per sempre, l'utente resta sulla versione vecchia finché la sessione non finisce.
- **Il pulsante Install su iOS è euristico**: si basa su user-agent / `maxTouchPoints`, perché
  Safari non espone `beforeinstallprompt`. Mostra istruzioni manuali, non un vero prompt.
- **L'autenticazione a token è solo per la shell nativa.** Nel browser `RBApi`/`RBUpload` non
  leggono né inviano alcun token: si affidano al cookie di sessione `same-origin`.
- **`RBUpload` carica una sola immagine** per chiamata (campo `photo`); più file richiedono più
  chiamate.
- **`RBImg.toBlob` degrada in silenzio**: se il canvas/encoding fallisce ritorna il file originale,
  quindi un upload può finire più grande del previsto senza errore visibile.
