# Il Reader RDBK

Il **Reader** è il navigatore — il copilota digitale. Apre un roadbook (file `.rdbk` o
sfida pubblica) e lo trasforma in una tabella di note stile cartaceo guidata dal GPS:
nota attiva centrata, odometro vivo, bussola CAP, validazione manuale o automatica e, alla fine,
il **report della run** (#618) — con, in gara, penalità e QR firmato col risultato. Una sessione in corso viene
*checkpointata* in `localStorage` a ogni fix, così una telefonata, un blocco schermo o la
chiusura della scheda da parte del sistema non perdono nulla.

> Tutto il codice del Reader vive in un'unica IIFE: [reader.js](../public/reader/reader.js),
> con il markup statico in [index.html](../public/reader/index.html).
> Le primitive condivise (GPS via `RBGpsMeter`, logging GPX via `RBGpxRecorder`, mappa via
> `RBMap`, vignetta via `NoteCanvas.toSVG`, geo-matematica/firma via `RB.*`) sono citate ma
> non documentate qui — vedi i rispettivi moduli.
>
> La parte **punteggio, penalità, payload META e QR firmato** è già documentata in
> [ranking-model.md](./ranking-model.md): qui non viene ripetuta, ci si limita a rimandarci.

---

## 1. Caricare un roadbook

La schermata iniziale (`#loadScreen`) offre tre ingressi:

- **Carica file `.rdbk`** — `#pickRb` apre il file picker; `RBZip.readRdbk` estrae
  `roadbook.json` dal contenitore ZIP (o legge un `.rdbk` JSON puro pre-container) e lo passa a
  `loadRb`.
- **Carica uno dei tuoi RB** — `#pickMine`, visibile solo da loggati: un picker dei roadbook
  salvati sul profilo.
- **Carica da roadbook pubblici** — `#pickChallenge` apre il picker DB-backed
  (`RBChallenges.pick`).

**Accesso richiesto (#146)**: aprire un roadbook **pubblico** (dal picker o da `/reader/<slug>`)
richiede di essere loggati — da non loggati parte `RBNeedAuth` invece del caricamento. Perciò
`config` viene letto in testa all'avvio per conoscere lo stato di login (`meUser`). File `.rdbk`
locali e roadbook propri per `?rb=` non sono soggetti al gate.

`loadRb` normalizza lo schema con
`RB.importRoadbook` (così aprono anche i vecchi file italiani pre-standard), rifiuta i
roadbook senza note, legge il flag roadbook-level `map_access` (`mapAllowed`,
[reader.js:92](../public/reader/reader.js#L92)) che decide se il Reader ha una mappa (§6), e
apre il **modal di modalità** (§5).

### Altri ingressi (oltre al picker manuale)
All'avvio una IIFE asincrona ([reader.js:51-73](../public/reader/reader.js#L51)) decide in
ordine di priorità:

1. **Ripresa di una sessione interrotta** — se in `localStorage` c'è un checkpoint valido
   (chiavi `rb_session` + `rb_session_roadbook`), chiede conferma con `RBConfirm` e, se
   accettata, fa `resumeSession`. Rifiutare **non** cancella la sessione (un tap sbagliato
   non deve distruggere una gara): viene sostituita all'avvio di una nuova corsa o cancellata
   solo all'uscita esplicita.
2. **Roadbook da URL** (`loadFromUrl`) — due forme:
   - **Roadbook pubblico** via `/reader/<slug>` (es. il pulsante "Naviga" di un roadbook
     pubblico): `RBChallenges.publicFromUrl` + `loadPublic`, previo login (#146).
   - **Roadbook personale/privato per id (#71)** via `/reader/?rb=<id>`: lo carica dal profilo
     con `RBApi('rb_get', { id })` — endpoint gated sul proprietario (e sui co-organizzatori
     dell'evento, #123), così solo chi ne ha diritto apre i roadbook privati. Affianca il
     percorso pubblico `<slug>` e l'upload del file.
3. **Recupero di un GPX orfano** — `RBGpxRecorder.offerRecovery`.

### Apertura `.rdbk` dal sistema operativo (PWA installata)
Se il browser espone la **File Handling API** (`launchQueue` + `LaunchParams`), il Reader
registra un consumer che apre un `.rdbk` aperto direttamente dall'OS — toccando il file nel file
manager o "Apri con" la PWA installata. Durante una run aprire un altro file la butterebbe via,
quindi prima chiede (`RBConfirmDanger`, nominando la run: titolo · nota attiva/totale); con un Sì la
run si chiude come un'uscita (`endRun`: GPS rilasciato, checkpoint cancellato, eventuale GPX al suo
modal) e lo stato della run riparte da zero (`resetRun`) prima di aprire il file.

---

## 2. La tabella note stile cartaceo

Il cuore della vista è `#noteList`, ricostruito interamente da `renderNotes`
([reader.js:212](../public/reader/reader.js#L212)). Ogni nota è una riga `.nrow` a **3
colonne** (la griglia bianca "carta" è definita in `app.css`; il Reader sovrascrive solo
dimensioni e padding in [index.html:38-46](../public/reader/index.html#L38)):

| Colonna | Classe | Contenuto |
|---------|--------|-----------|
| 1 — Distanze + numero | `.col-distance` | totale `distance` · parziale `+partial_distance` (km, 2 decimali) · numero nota, con accanto il **badge del tipo di waypoint** FIA (`RB.wpBadgeSVG(n.wp_type, 22)`) |
| 2 — Vignetta | `.col-vignette` | il pittogramma renderizzato da `NoteCanvas.toSVG(n, iconSrc)`; linee strada più marcate e un **cerchietto di convalida** al centro (dove i due segmenti si incontrano); su telefono (≤600px) la colonna è più larga e il tulip più grande |
| 3 — Indicazioni | `.col-text` | testo nota · riga CAP opzionale (con qualificatore FIA Average/Calculated/Turning in `.note-cap`) · riga **limite di velocità** opzionale (`.note-speed`) · coordinate `lat, lon` |

- La risoluzione icone passa per `iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/')`
  ([reader.js:206](../public/reader/reader.js#L206)): inline `data:` → `rb.icons` → palette
  standard.
- La riga CAP (`.note-cap`) appare solo se la nota ha un `cap`, mostrando `CAP n°` ed
  eventualmente la `cap_distance` in km ([reader.js:219](../public/reader/reader.js#L219)).
- Non c'è una colonna pulsanti (#569): la sua larghezza va al testo. La riga attiva intera è il
  bersaglio della validazione manuale e la mappa è un solo pulsante nella barra d'azione (§6).
- Sotto ogni riga c'è un contenitore `.nmap` nascosto, slot per la mappa per-nota (§6).
- Dopo il render, gli handler vengono ricablati: il tap sulla riga **attiva**
  → `advanceNote` (validazione manuale, rifiutata a modo auto acceso), e
  il tap su **qualsiasi altra** riga → `jumpToNote` (spostamento cursore, con conferma — §7).
- **Rebuild completo vs aggiornamento in place**: `renderNotes` ricostruisce l'intera lista
  solo ai cambi *strutturali* (avvio, toggle Auto, cambio lingua). Avanzamento e validazione
  aggiornano invece solo lo **stato** delle righe con `updateNoteStates` (classi
  done/skipped/active), senza ridisegnare
  ogni vignetta — così anche la mini-mappa per-nota aperta sopravvive all'avanzamento.
- **Auto-scroll**: la vista si sposta sulla nota attiva *solo quando l'indice attivo
  cambia davvero* (`lastScrollIdx`), non a ogni ridisegno, e mette la nota da raggiungere
  **esattamente in cima** alla lista (#844): quella appena validata non serve più, e la strada davanti
  prende tutto lo spazio. Il materiale messo prima di una nota (#542) fa parte della nota, quindi la
  cima è il suo primo blocco.
- Il testo delle note va a capo tra le parole e sillaba nella lingua della pagina
  (`overflow-wrap: break-word; hyphens: auto`), mai tagliando una parola a caso.
- Un cambio lingua a metà sessione (`rb-lang`) forza un re-render delle righe tradotte.

---

## 3. I colori di stato delle note

Le classi di stato sulla `.nrow` sono assegnate da `renderNotes`/`updateNoteStates`; il colore
vero è in `app.css`.

| Stato | Classe | Quando | Aspetto |
|-------|--------|--------|---------|
| **Raggiunta** | `.done` | `reached.has(i)` — validata davvero | verde |
| **Materiale** | `.block` (`.block-photo` · `.block-ad` · `.block-text`) | una foto, una pubblicità o un testo che la nota porta con sé (`RB.noteBlocks`, #542): disegnata prima o dopo la riga della nota, senza numero né stato — non è un waypoint | carta, testo a tutta larghezza |
| **Saltata** | `.skipped` | `i < activeIdx` ma non in `reached` (superata senza validare) | **rossa** — un rosa pallido si leggeva come "fatta" (#529) |
| **Attiva** | `.active` | `i === activeIdx` | bordo rosso |
| **Imminente** | (nessuna) | nota futura | bianco |
| **In avvicinamento** | `.near` (solo sulla riga attiva) | distanza GPS dalla nota attiva ≤ `MANUAL_RADIUS_M` (100 m) | azzurro tenue |
| **In arrivo** | `.arriving` (solo sulla riga attiva) | distanza GPS ≤ `reachRadius` — il raggio in cui scatta la convalida automatica | azzurro pieno |
| **Coppia ravvicinata** | `.tight` (sulla `.col-distance`) | la nota *successiva* ha `partial_distance < 50` | grigio-azzurro |

Distinzioni chiave:
- La differenza fra **raggiunta** e **saltata** dipende interamente dal `Set` `reached`: una
  nota oltrepassata che non è dentro `reached` è considerata saltata.
- `.near` e `.arriving` sono gli **unici stati guidati dal GPS in tempo reale** (`paintApproach`,
  chiamata da `refreshLive` a ogni fix affidabile): appartengono solo alla nota attiva e
  vengono ripuliti dalle altre righe da `updateNoteStates`. La riga attiva porta anche il
  readout `.togo` con la distanza che resta da percorrere (#387).
- Lo stato **`.tight`** è agganciato alla `partial_distance` della nota *seguente*, non al GPS
  — è una proprietà statica del roadbook (una coppia di note a meno di 50 m), non dice nulla
  su dove si trovi chi guida.

---

## 4. La barra odometro in alto

`.odometer-bar` si vede solo in navigazione (l'anteprima la nasconde), dove è una riga del guscio
applicativo (sotto) — non è mai posizionata. È una griglia
disegnata come una riga nota (#567): nella colonna **sinistra** prog. con part. subito sotto —
come ogni nota mostra totale sopra parziale, così il parziale live si legge allineato a quello
delle note — e a destra bussola · ora sulla prima riga, GPS · velocità sulla seconda. I readout
si aggiornano a ogni fix in `onFix`
([reader.js:155](../public/reader/reader.js#L155)):

| Elemento | ID | Sorgente |
|----------|-----|----------|
| Titolo roadbook | `#navTitle` | `rb.meta.title`, riga full-width |
| **Totale** (prog.) | `#odoTotal` | `tripTotalM/1000`, 2 decimali |
| **Parziale** (part.) | `#odoPartial` | `tripPartialM/1000`, 2 decimali |
| **Bussola + freccia** | `#odoBrg` / `#odoBrgArrow` | rilevamento alla prossima nota (`RB.geo.bearingDeg`), altrimenti `meter.heading`; freccia ruotata *relativa* al proprio heading (0° = su = dritto) |
| **Ora** | `#odoClock` | orologio di sistema, aggiornato ogni secondo da un `setInterval` ([reader.js:120](../public/reader/reader.js#L120)) |
| **GPS** | `#gpsDot` / `#gpsTxt` | `setGps`: pallino `ok`/`bad` e `±N m`; verde se `accuracy ≤ 25 m` ([reader.js:157](../public/reader/reader.js#L157), [reader.js:181](../public/reader/reader.js#L181)) |
| **Velocità** | `#odoSpeed` | `speedKmh` del fix (`RBGpsMeter`), arrotondata, in km/h — il readout che il navigatore legge davvero mentre ci si muove (#529) |

L'odometro avanza di `disp` (lo spostamento per-fix **già giudicato** da `RBGpsMeter` /
`RB.odometerStep`: solo terreno realmente percorso) sia sul totale sia sul parziale. Un fix non
affidabile — `fix.trusted === false`, accuratezza oltre `FIX_ACC_MAX_M` — aggiorna **solo** il
readout GPS ed esce subito da `onFix`: non è dove siamo, quindi non può muovere un contatore,
una nota o un marker (#383).

### Il guscio applicativo (#429)
In navigazione il Reader **possiede lo schermo**, e `#navScreen` racchiude già esattamente i figli
giusti — barra odometro · lista note · riga d'azione. Quindi è lui il **guscio**:

```
body.rb-immersive #navScreen   position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden
├── .odometer-bar              flex: none
├── #noteList                  flex: 1; min-height: 0; overflow-y: auto     ← l'UNICO scroller
└── .fabrow                    position: static; flex: none
```

Un tempo le barre erano `position: fixed` e la loro posizione veniva **calcolata** contro
`window.innerHeight`. Su iOS quel viewport non sta fermo: si assesta dopo il load, cambia quando
la WebView viene ridimensionata o si ruota il telefono, e si muove mentre la toolbar di Safari si
richiude. Un valore preso nell'istante sbagliato non veniva più corretto, e il risultato era una
barra che **galleggiava in mezzo alla lista** con le righe delle note che passavano dietro la
riga d'azione. Nel guscio non c'è niente da calcolare: le barre sono righe di flusso, non possono
galleggiare, non possono essere coperte e non possono essere obsolete; il rubber-band di iOS
avviene dentro la lista, dove deve stare. `min-height: 0` è ciò che permette al figlio flex di
rimpicciolirsi e scrollare invece di spingere le barre fuori schermo. Gli inset di sicurezza
(status bar, home indicator) sono gestiti una volta sola, sul guscio.

Conseguenze da tenere a mente:
- **il documento non scrolla affatto** in navigazione (`overflow: hidden` sul guscio): chi cerca
  `window.scrollY` sta guardando il posto sbagliato. `scrollActiveIntoView` lavora nelle coordinate
  della lista (`list.scrollTop`);
- `#noteList` non ha più `padding-bottom` a fare da segnaposto per l'altezza delle barre;
- niente di condiviso può galleggiarci sopra: chip di lingua e chip flottanti sono nascosti in
  `body.rb-immersive`/`body.rb-fs` (il chip lingua stava sui pulsanti d'azione mentre si guidava),
  e il banner GPS-web pure — la partenza è già stata filtrata dalla sua modale.

Resta una sola variabile CSS, `--bottom-stack`, pubblicata da `publishBottomStack()`: l'altezza
della riga d'azione, presa **da lei** (`offsetHeight`), non dal viewport. La leggono le uniche
cose ancora fissate al bordo dal livello condiviso — l'avviso cookie (#401) e il **toast**, che
altrimenti finisce dietro i pulsanti proprio quando è l'unico messaggio che spiega perché un tap
non ha fatto nulla (#431). In anteprima le barre sono `display: none`, `offsetHeight` è 0 e la
variabile viene rimossa da sé.

### Sincronizzazione dell'odometro alla distanza nota
A ogni validazione, se la nota ha una `distance`, il totale viene **riallineato** alla
distanza cumulativa della nota: `tripTotalM = n.distance`
([reader.js:274](../public/reader/reader.js#L274) in manuale-trip;
[reader.js:322](../public/reader/reader.js#L322) in `validateAt`). Così l'odometro assorbe la
deriva GPS e traiettorie diverse, ripartendo "pulito" a ogni nota; il parziale azzera
(`tripPartialM = 0`).

---

## 5. Il modal di avvio

**Navigate** (o l'apertura da un evento) apre la finestra di avvio `#startModal`
(`openStartDialog`) con le opzioni di sessione, lette da `readStartOpts`:

- **Registra una traccia GPX** (`#optGpx`) — se attivo, `RBGpxRecorder.begin()` parte dopo lo
  start ([reader.js:97](../public/reader/reader.js#L97), [reader.js:103](../public/reader/reader.js#L103)).
- **Suono su nota** (`#optSound`, default attivo) — quando una nota viene raggiunta/validata
  (sia trip `markReached` sia competition `validateAt`, auto o manuale) suona il **campanello di
  successo** (`RBSuccess.ring()`, `assets/sounds/success.mp3`, #768) — lo stesso della nota nel
  Recorder; l'**ultima** nota suona invece la fanfara dell'arrivo (`RBSuccess.fanfare()`, #843). Il
  tap di avvio li sblocca (`RBSuccess.unlock()`, un gesto utente) così possono suonare anche su una
  convalida GPS automatica. Si mescolano con la musica di un'altra app, senza fermarla (#842).

**La modalità non si sceglie** (#617): la gara esiste per la classifica di un evento, quindi
`openStartDialog` chiede `event_get` solo quando il Reader è aperto con `?event=<slug>` e, se quel
roadbook (cercato per lo **slug del roadbook caricato**, quello che restituiscono `public_get` /
`rb_get` / `admin_rb_get` — mai l'ultimo pezzo dell'URL) ha `scoring_mode ≠ free`, la run è in
**competition** — `#startGo` apre `#teamModal` per il **numero veicolo** (`team`, 1–999, solo cifre)
e poi `startNav(true)`; il modal lo dice in `#startComp`. *Cancel* sul numero veicolo torna alla
finestra di avvio (Esc la chiude). Tutto il resto parte subito come **trip** (`startNav(false)`). Il punteggio è in
[ranking-model.md](./ranking-model.md).

`auto` parte sempre `true` e si commuta durante la corsa con l'interruttore Auto nella barra di
navigazione (`#autoBtn`).

### Fine della run e report (#618 · #619)
**Finish** è nella barra d'azione in ogni run (prima dell'ultima nota chiede conferma: le note
non raggiunte contano come saltate — e in gara pagano davvero `RB.skipPenalty(scoredSet, activeIdx,
notes.length)` prima della firma); validare l'ultima nota finisce la run da sola. `finishRun`
chiude la zona di velocità aperta (a punteggio solo se lo è la nota su cui finisce), ferma il GPS e
costruisce il **report**: distanza, tempo,
media, note raggiunte/totali e quali saltate, zone di limite di velocità rispettate/superate (col
peggior eccesso) e, in gara, penalità + risultato firmato (`signedResult`). Le zone si seguono in
**ogni** run (`passLimit`/`closeZone`, condivise da `markReached` e `validateAt`) — anche sulle
note **saltate**: il cartello era sulla strada comunque, quindi ogni salto (tap su un'altra riga,
auto-validazione di una nota più avanti, "Salta e continua") passa i loro limiti con `passOver`;
in gara una zona del tratto a punteggio costa anche la sua penalità.

Il report va **prima sul dispositivo** (`RBRun.enqueue`, `assets/js/run-report.js`), poi il
checkpoint della sessione si cancella e parte l'upload (`run_save`): offline o senza login resta in
coda e sale al prossimo `RBRun.flush` (all'avvio del Reader, all'evento `online`). Chi vede la run è
un interruttore **Private / Public** nel report (#820): con la preferenza `public`/`private` parte già
scelto e la run si salva subito; con `ask` nulla è scelto (con *Remember my choice*) e **Done** resta
disattivato finché non si sceglie, perché una run non scelta non lascerebbe mai il dispositivo.
Una volta salvata, lo stesso interruttore la cambia (`run_update`), e Share manda la pagina `/run/<id>`
solo finché è pubblica. Il report parte dalla card (con un segnaposto della sua misura mentre si
disegna), Share subito sotto, poi l'interruttore, le cifre e il QR di gara. Una run di gara di un roadbook di evento entra da sola nella
classifica condivisa. **End** (esci) resta l'uscita *senza* report, confermata.

**Il log GPX finisce con la run.** Sia **Done** sul report sia **End** passano per `endRun`, che —
se `RBGpxRecorder.recording` — chiude il log e apre il modal "traccia registrata"
(`RBGpxRecorder.handOver`) **dopo** aver chiuso il report: il report non è congedabile, quindi i
due modal sono in sequenza, mai sovrapposti. Solo gli esiti espliciti del modal (Download ·
Converti · Scarta confermato) cancellano il checkpoint della traccia (#460); si lascia la pagina
quando il modal ha finito. Una run del Reader non lascia quindi mai un checkpoint GPX orfano.

Il checkpoint della run (`rb_session`, via `RBCheckpoint`) porta anche `rbSlug`, `eventSlug` e
`openedAs`: una run ripresa dopo un crash firma col prefisso del roadbook giusto e resta legata al
suo evento, anche se riaperta da `/reader/` senza parametri.

Mentre il report si legge, il Reader crea la **card condivisibile** della run (#785,
`RBRunCard.render`, `assets/js/run-card.js`): un PNG 1080×1350 fatto sul dispositivo, con tutto il
percorso sulla mappa (`RBCoverMap.render`) e ogni nota — verde raggiunta, rosa saltata —, sfumato
verso il basso dove stanno esito, titolo, @utente · data e quattro cifre (distanza · tempo · media ·
note raggiunte). Se il roadbook nasconde la mappa, la card porta solo le cifre; offline il percorso si
disegna senza tile. Il report la mostra con **Share** (`RBShareFile`: foglio di condivisione del
sistema nell'app, Web Share nel browser, download altrimenti) e **Save image**; appena la run è salvata
sul profilo, la card sale con lei (`RBUpload` `type=run_card`) e compare su quella run nel profilo.
Anche lo **Share** del QR del risultato passa da `RBShareFile`.

Una run **pubblica** ha la sua pagina condivisibile, **`/run/<id>`** (#803, `public/run/index.php`): resa dal server,
perché i suoi meta Open Graph portino la card come **og:image** (i crawler delle anteprime non eseguono JS).
Mostra la card e le cifre e porta al profilo (`/u/<user>#run-<id>`) e, se pubblico, al roadbook; una run
privata o inesistente è un 404. Appena la run è salvata pubblica, *Share* nel report — e sul profilo —
manda quel link insieme all'immagine.

### Il reach adattivo (`reachRadius`)
Il raggio entro cui una nota è "in portata" non è fisso. `reachRadius(i)` parte dal **raggio
di rilevamento della nota** — `RB.detectionRadius(note, meta)`, cioè `wp_radius` per-nota →
`meta.default_wp_radius` → default del tipo di waypoint → `CONST.REACH_DEFAULT_M` (30 m) — poi
lo limita a **metà del gap along-track più piccolo** verso un vicino (usando `partial_distance`,
così i reach di due note non si sovrappongono) e lo *flooring* sopra il rumore GPS:

```
reach = max(REACH_MIN_M=18, min(detectionRadius, min(gapPrev, gapNext) / 2))
```
Non c'è un cap fisso: il limite superiore è il raggio di rilevamento della nota (default di sistema 30 m).
Note rally fitte ottengono un gate stretto; note distanziate arrivano al raggio del tipo.

---

## 6. La mappa interattiva per-nota

Solo se il roadbook la permette (`mapAllowed()`, `meta.map_access`), una mappa per volta. La
apre e la chiude **un solo pulsante nella barra d'azione** (`#mapBtn`, #569), per la nota
attiva, acceso mentre una mappa è aperta; nel preview si apre toccando la riga. La mappa
**appartiene alla nota attiva** (#571): quando la nota cambia (validazione auto o manuale, salto)
`updateNoteStates` chiama `moveNoteMap`, che ri-aggancia **la stessa** mappa GL sotto la nuova riga
(zoom, layer e heading-up restano) e la ri-punta sul suo waypoint; dopo l'ultima nota si chiude.
Nell'angolo in alto a sinistra `.nmap-togo` mostra numero della nota e distanza ancora da
percorrere (`paintMapTogo`, aggiornato da `refreshLive` a ogni fix). `toggleNoteMap`
([reader.js:239](../public/reader/reader.js#L239)) apre un `RBMap` nello slot `.nmap` sotto la
riga come un **primo piano di dove si trova chi guida**: centro su `lastHere` a
`NOTE_MAP_ZOOM` (16) e **solo il waypoint di quella nota** (`showRoadbook({track: [], notes: [n]},
true)`), evidenziato con `select(n, true)` — `noEase` per non spostare il centro dal pilota. Senza
fix GPS la nota stessa è l'unica posizione nota e diventa il centro. Prima erano l'intera traccia
e tutti i pin a zoom 13: troppo grosso per leggere un incrocio, e gli altri pin sono rumore
quando la domanda è "dove sono rispetto a QUESTO waypoint" (#427). La vista d'insieme del
percorso resta sulla pagina pubblica del roadbook e nell'Editor. Toccare la mappa
aperta la richiude. `closeInlineMap` ([reader.js:251](../public/reader/reader.js#L251))
distrugge pulitamente la mappa GL — ed è chiamata **all'inizio di ogni `renderNotes`**, dato
che la lista viene ricostruita per intero. Se MapLibre non è configurato, mostra un toast.

### Posizione GPS sulla mappa (#265)

Durante una navigazione attiva, la mappa per-nota mostra il **pallino blu** della posizione
GPS corrente (`rb-pos`, cerchio azzurro `#5aa9ff`) aggiornato a ogni fix:

- **`geolocate: true`** passato a `new RBMap()` → aggiunge il pulsante GeolocateControl
  (mirino) in alto a destra, che l'utente può cliccare per centrare sulla propria posizione
- **`onFix()`** memorizza in `lastHere`/`lastAcc` l'ultima posizione **affidabile** (è da
  quella che si misura ogni distanza del Reader) e chiama
  `inlineMap.setPosition(lat, lon, true, heading)`: il `follow` tiene **te al centro** e ruota
  la mappa sulla tua direzione di marcia, quindi destra e sinistra sulla mappa sono destra e
  sinistra dal parabrezza (#536). Un fix spazzatura non entra: `onFix` esce prima
- **All'apertura** la mappa nasce già girata sulla rotta corrente (`bearing`) e centrata su
  `lastHere`; `RBMap` **ricorda l'ultima posizione** (`_lastPos`) e la riapplica appena è pronta
  o dopo uno scambio di stile, così un fix arrivato mentre la mappa caricava non va perso
- **Il pulsante heading-up** (`headingToggle: true`) è tra i controlli della mappa: chi preferisce
  il nord bloccato lo ottiene con un tap
- **La rotta** è la direzione in cui ti stai davvero muovendo (`RB.courseFrom`, #565): il
  bearing del terreno percorso negli ultimi `COURSE_WINDOW_M` (15 m, la scia `RB.courseTrail`
  che `RBGpsMeter` allunga solo con step accettati come movimento reale). La rotta per-fix del
  telefono (Doppler) vale solo da `COURSE_DEVICE_KMH` (12 km/h) in su: sotto, in bici o a piedi,
  salta di decine di gradi tra un fix e l'altro. Senza abbastanza terreno resta l'ultima rotta,
  quindi il rumore GPS non fa ruotare la mappa. In course-up il **chevron è fisso in alto**
  (tu che vai avanti, `rotationAlignment:'viewport'`) e la mappa gira sotto di lui
- **Guida al waypoint** (#485 · #849): `setGuide(from, to, path)` disegna **solo una linea** gialla
  dalla posizione live al waypoint, lungo **la strada ancora da fare** (`RB.routeAhead(...).path`:
  la traccia dal punto proiettato fino alla nota, quindi piega dove piega la strada). Senza
  traccia è la linea retta. Nessuna freccia: l'inizio lo segna il chevron, la fine l'alone del
  waypoint. Sotto i 5 m sparisce (sei arrivato).
- **Distanze** (#846 · #847): ogni distanza si legge come la scrive il roadbook, in km con due
  decimali. Il "mancano" della riga attiva e della mappa è misurato **lungo il percorso**
  (`RB.routeAhead`: il fix proiettato sulla traccia tra la nota precedente e la successiva), così
  il parziale fatto + quello che manca = il parziale della nota. Il raggio di validazione resta
  in linea retta, perché è quello che misura. A ogni cambio di nota (validata, saltata o scelta)
  gli odometri si **ri-ancorano** sul percorso (`reanchor`): il totale diventa la posizione reale
  lungo la traccia, il parziale la distanza dalla nota precedente. Una nota validata in anticipo
  lascia il parziale sotto zero (mostrato 0.00) finché non la passi.
- Quando non c'è una navigazione attiva (modalità preview), `lastHere` è null e la mappa
  mostra solo il pulsante GeolocateControl — l'utente può comunque cliccare il mirino per
  attivare la geolocalizzazione del browser

---

## 7. Avanzamento: automatico e manuale

### Automatico — attraversamento del raggio (`RB.noteReached`)
La validazione automatica scatta **appena il percorso guidato entra nel reach** della nota
attiva. La domanda non viene posta al singolo fix ma al **segmento** fra la posizione affidabile
precedente (`fix.from`) e quella corrente: `RB.noteReached(note, from, here, reachRadius(i))`
proietta la nota sul segmento (`nearestOnTrack`) e confronta la distanza minima col reach.

Il motivo è il bug #384: i fix arrivano circa una volta al secondo, quindi a 90 km/h il telefono
si sposta ~25 m fra due fix e un gate stretto (il floor `REACH_MIN_M` è 18 m) può stare
**interamente nel buco** fra due posizioni — si passa esattamente sopra il waypoint e il test
sul punto singolo non vede nulla. Il segmento non si può saltare. Quando `from` è `null` (primo
fix, o fix successivo a un salto implausibile: non c'è percorso di cui parlare) si ricade sul
punto singolo.

Conseguenze del design:

- Vale **a qualunque velocità**, purché i fix siano affidabili (§ `RBGpsMeter`: un fix non
  affidabile non entra nemmeno nella logica delle note).
- È **immune al cascade**: i reach non possono sovrapporsi (`reachRadius` li limita a metà del
  gap col vicino), quindi il gate della nota successiva si apre solo dopo che la corrente
  avanza; note ammassate si validano *una a una*, mai tutte insieme. Per lo stesso motivo un
  singolo fix valida **una sola** nota: un buco GPS lungo che scavalca più note ne valida la
  prima e lascia le altre "saltate" (in competizione è la scelta meno costosa: validarle dalla
  posizione attuale caricherebbe penalità di accuratezza enormi).
- **Guarda una nota avanti** (`RB.autoReachedIdx`, #529): il segmento guidato viene testato sulla
  nota attiva e, se quella è stata mancata, sulla **successiva navigabile**. Raggiungendo la
  successiva è lei a essere validata e la mancata resta *saltata* — **rossa** sul roadbook — con
  il prezzo che un salto ha già (`RB.skipPenalty` in competizione, tramite `autoValidate`). Senza
  questo la corsa restava ferma per sempre su un waypoint in cui non si sarebbe più entrati.

`auto` è commutabile a metà sessione col pulsante `#autoBtn` — ed è l'**unica** autorità mentre è
acceso: in auto la validazione manuale è rifiutata (vedi sotto).

### Manuale — tap
Il tap sulla riga **attiva** (tutta la riga) chiama
`advanceNote()`. Non esiste un pulsante "Convalida" in basso: la validazione sta **sulla nota**,
dove guarda chi naviga (#529).

- **Solo a modo auto spento.** Con `auto` acceso `advanceNote` rifiuta subito e spiega come
  prendere il comando ("Auto validation is on — switch it off to validate notes by hand."): decide
  il GPS, non il dito. Il guard sta in `advanceNote`, quindi copre in un colpo solo il tap sulla
  riga, il pulsantino di spunta e il comando *next* del remoto. Il pulsantino di spunta viene
  disegnato solo a modo manuale.

- In **Trip mode** (`!competition`) `advanceNote` chiama `markReached`: marca verde, azzera il
  parziale, sincronizza il totale sulla `distance` della nota e avanza. Nessun punteggio, nessun
  gate di prossimità — un viaggio si segue a vista.
- In **Competition** valida con punteggio. Il tracking manuale funziona **anche senza alcun
  GPS**; quando *c'è* un fix vale il gate di prossimità `RB.manualGate` — `MANUAL_RADIUS_M = 100 m`
  **allargato dell'accuratezza del fix**, perché l'incertezza del telefono non è colpa di chi
  guida (#385) — e il rifiuto dice la distanza reale invece di un generico "troppo lontano".
- **Il rifiuto non è un vicolo cieco** (#431). Rifiutare è giusto: una convalida a punteggio non
  si può falsificare da lontano. Ma prima il cursore restava fermo e il pulsante non faceva più
  nulla a ogni pressione successiva, quindi chi aveva davvero mancato un waypoint ci rimaneva
  incastrato. Una nota non raggiunta è **saltata**, cosa che il punteggio già modella, quindi è
  esattamente quello che viene offerto: "Too far from note 4 · 5.00 km — Skip it and continue?
  Penalty: 450 pts". Accettando, la nota **non** entra in `reached` (resta rossa), il cursore
  avanza e `RB.skipPenalty` viene addebitata una volta. Mai una convalida finta da lontano, che
  falserebbe il punteggio di accuratezza.
- Il tap su **un'altra** riga è `jumpToNote(i)`: spostamento esplicito del cursore, **con
  conferma** che nomina la nota e dice il prezzo (le note intermedie restano non validate; in
  competizione `RB.skipPenalty`, 450 pt per nota valutata). Prima era un semplice tap su riga
  senza conferma: mirare al pulsantino e mancarlo spostava il cursore, marcava righe come
  saltate, riallineava l'odometro sulla nota toccata e in competizione bruciava centinaia di
  punti in silenzio (#386).
- Indietro: in Trip mode è permesso (conferma inclusa, o senza conferma dal pedale remoto —
  `setActiveNote`, una pressione su un dispositivo dedicato *è* la conferma); in Competition no,
  e lo dice con un toast invece di ignorare il tap.

`validateAt` ([reader.js:303](../public/reader/reader.js#L303)) è il punto comune di
validazione (auto e manuale): avvia/aggiorna l'orologio (`startedAt`/`endedAt`), accumula le
penalità (dettaglio in [ranking-model.md](./ranking-model.md)), marca `reached`, azzera il
parziale e l'arancione, sincronizza il totale e avanza `activeIdx`. All'ultima nota mostra un
toast "Tap Finish".

Il tap sulla riga attiva, il pulsantino "raggiunta" e il comando *next* del remoto passano tutti
da `advanceNote()`: `validateAt(activeIdx)` in competition (lontano dalla nota chiede se saltarla),
`markReached(activeIdx)` in trip —
un solo punto di ingresso, così nessuna via scavalca né il gate di prossimità della competizione
né il rifiuto del modo auto. La validazione automatica passa invece da `autoValidate(i, here)`,
che addebita il salto quando la nota raggiunta non è quella attiva e poi chiama `validateAt`.

---

## 8. Pausa e wake-lock

Il pulsante `#pauseBtn` ([reader.js:342](../public/reader/reader.js#L342)) ferma il watch GPS
(`meter.stop()`) e rilascia il **wake lock** per risparmiare batteria (es. sosta pranzo);
mostra "Paused" e pallino GPS spento. Il `resume` riavvia lo stesso meter. Mentre è in pausa
l'odometro non avanza, e nemmeno dopo: `stop()` azzera l'ancora dell'odometro, la traccia della
rotta e l'ultima posizione di velocità, quindi il primo fix dopo Resume riparte da lì (`disp` 0,
`from` null) — la strada fatta in pausa non entra in un solo passo e non valida note lungo una
linea retta. Il watch GPS e il wake lock
sono gestiti internamente da `RBGpsMeter` — vedi quel modulo.

Il pulsante `#endBtn` esce dalla navigazione previa conferma (il progresso note va perso):
`endRun` (sessione cancellata, GPX al suo modal) e poi torna alla home.

---

## 9. Checkpoint di sessione (resilienza a crash/kill)

Il prompt "Resume the run in progress?" si fa solo quando **ha senso chiederlo** (#436): quando
questa visita non ha un bersaglio suo (`/reader/` nudo) oppure quando la corsa salvata **è** questo
roadbook — il checkpoint registra `openedAs` (lo slug, `?rb=` o `?admin_rb=`) proprio per poterlo
distinguere. Aprire un roadbook *diverso* è una scelta esplicita: interrogare l'utente sulla corsa
precedente in quel momento è solo rumore. E un "No" viene **ricordato** (`declined` sul
checkpoint), quindi si chiede una volta sola; i dati restano (la corsa successiva li sovrascrive,
l'uscita esplicita li cancella), così declinare non distrugge niente.

`saveSession` ([reader.js:136](../public/reader/reader.js#L136)) serializza i contatori vivi
(modalità, team, indice attivo, `reached`, odometri, penalità, limiti velocità, orologio
gara, stato GPX) nella chiave `rb_session`, scritta **a ogni fix e a ogni cambio di stato**.
Il roadbook intero è scritto una sola volta all'avvio in `rb_session_roadbook`
([reader.js:116](../public/reader/reader.js#L116)). `resumeSession`
([reader.js:142](../public/reader/reader.js#L142)) ricostruisce lo stato e, se c'era un GPX in
corso, riprende anche quello. `RB_BUSY = true` ([reader.js:107](../public/reader/reader.js#L107))
impedisce l'auto-refresh di versione a metà gara.

---

## 10. Punteggio, QR e ranking

Tutta la logica di **sezione cronometrata, penalità (accuracy/CAP/skip/extra/speed), payload
META a 55 caratteri, firma HMAC e QR del risultato** è documentata altrove:
vedi **[ranking-model.md](./ranking-model.md)**. Le sezioni cronometrate e le formule di
penalità vivono nel core (`RB.scoredNoteSet`/`RB.isScoredIdx`, `RB.validationPenalties`,
`RB.skipPenalty`, `RB.speedPenalty`, #169); il Reader le richiama, accumula in `validateAt`, e
in `finish` impacchetta e firma il risultato generandone il QR (`#qrModal`, con Save/Share).

Il QR è disegnato da **`RBQr.dataURL(payload)`** come **PNG** (512 px). La libreria vendor sa
emettere solo GIF, e un GIF consegnato al sistema sotto un nome `.png` è ciò che rompeva sia il
salvataggio sia la condivisione dall'app (#392): nome, tipo dichiarato e byte devono coincidere.
`RBQr` è anche l'unico posto dove un QR viene renderizzato (prima il codice di attivazione evento
ne aveva una copia propria).

---

## 11. Limiti e quirk

- **Settori cronometrati** delimitati da icone START→FINISH (`RB.scoredNoteSet`): più settori
  selettivi separati SONO rappresentabili (start/finish multipli) — vedi
  [ranking-model.md](./ranking-model.md) §8.
- **`reachRadius` usa `partial_distance` along-track, non la distanza geometrica** verso il
  vicino: se due note sono vicine "in linea d'aria" ma lontane lungo la traccia (tornante), il
  gate resta largo e i loro reach potrebbero comunque sovrapporsi nello spazio.
- **Penalità posizionali dipendenti dal GPS**: una gara manuale senza segnale azzera
  accuracy/CAP/extra (vedi [ranking-model.md](./ranking-model.md)).
- **Un buco GPS lungo scavalca più note**: un solo fix valida una sola nota (vedi §7), quindi
  le altre restano "saltate". Voluto: validarle dalla posizione attuale costerebbe penalità di
  accuratezza enormi.
- **Il floor del reach è 18 m** (`REACH_MIN_M`): un `wp_radius` più stretto nel roadbook non
  rende il gate più fine di così, perché sotto quella soglia si chiederebbe al GPS una
  precisione che non ha. La convalida automatica resta comunque affidabile perché il test è
  sull'attraversamento del segmento, non sul singolo fix (§7).
- **Rifiutare la ripresa non cancella la sessione**: è un comportamento voluto (anti
  tap-accidentale), ma significa che una sessione vecchia può ripresentarsi finché non si
  avvia una nuova corsa o si esce esplicitamente.
- **`endBtn` scarta il progresso note senza salvarlo**: l'unico modo per conservare un
  risultato è `Finish` (Competition) → QR.
