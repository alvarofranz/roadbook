# Recorder RDBK

Il **Recorder** è un registratore di tracce GPX *live* dedicato, scorporato di recente
dall'Editor in un folder a sé (`public/recorder/`). Registra un percorso col GPS,
lo disegna in tempo reale su una mappa, e lungo il cammino permette di lasciare
waypoint con testo e di scattare foto geotaggate. Al termine si scarica il GPX
oppure si converte tutto (traccia + waypoint + foto) in un roadbook nell'Editor.

> Il Recorder non possiede logica GPS o di logging propria: **orchestra le primitive
> condivise**. Il loop GPS è `RBGpsMeter`, il logging crash-safe è `RBGpxRecorder`,
> la mappa è `RBMap`, foto e note vocali passano dalla coda offline-first `RBMediaQueue`
> (upload differito con retry via `RBUpload`/`RBUploadAudio`). Per i dettagli di ciascuna,
> vedere i rispettivi documenti — qui si descrive solo come il Recorder le usa.

---

## 1. Scopo e struttura della pagina

La pagina ha due stati esclusivi, commutati via attributo `hidden`
([recorder.js:35-37](../public/recorder/recorder.js#L35)):

- **`recIdle`** — schermata di avvio con il pulsante *Start recording* più due avvisi
  contestuali: `recLoginHint` (visibile ai **non loggati**: la traccia si registra comunque,
  ma foto/audio richiedono il login) e `recBgHint` (visibile solo **fuori dall'app nativa**:
  solo l'app registra a schermo bloccato/in background). Entrambi sono governati da
  `updateRecUi()` una volta noto l'utente.
- **`recRunning`** — dashboard live: quattro readout (tempo trascorso, velocità,
  numero waypoint, km registrati), la fila di pulsanti azione (Pause · Waypoint ·
  WP audio · WP Foto), la mappa live e il pulsante *Finish*. Su smartphone (≤430px)
  la spaziatura verticale è compatta (padding ridotto, gap unico della `.dash`,
  margini ridondanti azzerati) così la mappa guadagna schermo.

La barra di stato globale (orologio, batteria, stato satellite/GPS) è `RBStatusBar`,
mostrata solo durante la registrazione ([recorder.js:38](../public/recorder/recorder.js#L38)).
Il pulsante *Photo* è nascosto di default e compare solo a draft creato (§3, §6).

Le dipendenze sono caricate dall'HTML nell'ordine: MapLibre, `config.js`,
`roadbook-core.js`, `rbmap.js`, `gps-meter.js`, `gpx-recorder.js`, `i18n.js`,
`app.js`, `status-bar.js`, infine `recorder.js`
([index.html:76-85](../public/recorder/index.html#L76)).

---

## 2. La registrazione live

### Avvio
*Start recording* apre prima il modale impostazioni di `RBGpxRecorder`
(`RBGpxRecorder.settings`), pre-riempito con un **nome roadbook di default** = data+ora
`YYYY-MM-DD HH-MM` (`recName()`, #148); solo alla conferma chiama `begin()`.

`begin()` azzera tutto lo stato (`recordedM`, `track`, `wpts`, `photos`, contatore tempo),
avvia il logging crash-safe con `RBGpxRecorder.begin()` — che a sua volta accende, via
callback `onChange`, la barra di stato e la vista *running* — poi fa partire il meter GPS,
ridisegna la mappa e (solo se loggato) crea il **draft** per foto/audio, **intitolandolo col
nome scelto** (`rb_draft` con `name`, #148) così non appare mai come "Recording…".

### Campionamento consapevole dell'accuratezza
Ogni fix GPS arriva a `onFix(fix)`, che usa gli **stessi helper condivisi del core**
dell'Editor (una sola definizione delle soglie):

1. Aggiorna lo stato satellite della barra con l'accuratezza corrente e il marker heading-up.
2. **Scarta i fix-spazzatura** con `RB.recJunkFix(accuracy)` (accuratezza troppo alta):
   il fix aggiorna solo barra e marker, non la traccia.
3. Se in pausa, non accumula nulla.
4. Somma lo spostamento del fix all'odometro `recordedM`.
5. **Passo di campionamento adattivo**: il punto entra nella traccia solo se dista
   dall'ultimo campione almeno `step = RB.recStepM(accuracy)` metri. Fix preciso ⇒ dettaglio
   fitto; fix debole ⇒ passo più largo, niente jitter.

| Comportamento                  | Regola (core)                            |
|--------------------------------|------------------------------------------|
| Fix scartato dalla traccia     | `RB.recJunkFix(accuracy)`                |
| Passo minimo di campionamento  | `RB.recStepM(accuracy)` m                |
| Altitudine memorizzata         | `coords.altitude` se finita, altrimenti `null` |

> Nota: l'odometro `recordedM` somma lo spostamento di **ogni** fix accettato (non-spazzatura),
> anche quando il punto non viene campionato per il passo adattivo. Il conteggio km può quindi
> essere leggermente più alto del numero di punti in traccia.

### Pausa / ripresa
*Pause* commuta il flag `paused` e gestisce il cronometro: in pausa congela il tempo
trascorso in `elapsedAcc` e ferma `lastSampled` (così la ripresa non traccia una linea
retta sul gap); alla ripresa riparte `segStart`
([recorder.js:106-110](../public/recorder/recorder.js#L106)). Il cronometro registrato
è `elapsedAcc + (Date.now() - segStart)` ([recorder.js:99](../public/recorder/recorder.js#L99)),
quindi conta solo il tempo di effettiva registrazione.

### Autosave e recovery
Due livelli di persistenza:

- **La traccia** è checkpointata da `RBGpxRecorder` (è lui a possedere la traccia
  *autorevole*, crash-safe, e il file live).
- **I metadati** (km, tempo, pausa, waypoint, foto, `draftId`, nome file) li salva il
  Recorder in `localStorage` chiave `rb_recorder_session` via `saveSession()`
  ([recorder.js:26-28](../public/recorder/recorder.js#L26)), richiamata ad ogni tick e
  ad ogni modifica. `saveSession` **non scrive nulla** se la registrazione non è attiva,
  per non sovrascrivere una sessione recuperabile non ancora ripresa.

All'avvio ([recorder.js:45-60](../public/recorder/recorder.js#L45)) la sequenza è
**resume → rescue → idle**:
1. Se esiste una sessione `recording`, chiede *"Resume the recording in progress?"*
   con i km salvati; se confermata, riprende il file via `RBGpxRecorder.resume()` e
   ripristina i metadati. La traccia locale `track` riparte **vuota** e si riempie man
   mano (la copia autorevole è in `RBGpxRecorder`).
2. Se la si declina, `clearSession()` e si passa a `RBGpxRecorder.offerRecovery()`
   (recupero di un file orfano lasciato da un crash).

`window.RB_BUSY = true` durante la registrazione impedisce all'app l'auto-refresh di
versione a metà sessione ([recorder.js:35](../public/recorder/recorder.js#L35)).

---

## 3. Dove finiscono i dati: locale vs server (e il *draft*)

Punto chiave, spesso frainteso: **traccia e foto/audio seguono percorsi diversi**.

- **Traccia + waypoint** restano **in locale** per tutta la registrazione: la traccia
  autorevole è in `RBGpxRecorder` (checkpoint in `localStorage` + file `.gpx` scritto live
  su disco dove l'API File System Access è disponibile); i metadati/waypoint nel session
  checkpoint del Recorder. **Non vengono inviati al server durante la registrazione** (la
  posizione live non lascia il device). Arrivano al server **solo quando si salva il
  roadbook** (Convert into roadbook → Editor → Save, §8).
- **Foto e audio** vengono **bufferizzati in una coda locale** (`RBMediaQueue`, IndexedDB) e
  **caricati sul server con retry** appena possibile — per l'upload serve un contenitore server:
  il **draft**. La coda fa sì che un calo di rete a metà registrazione **non perda** più foto/audio
  (offline-first, #147; vedi §3 "Comportamento offline").

### Il draft server — contenitore di foto/audio
Foto e audio finiscono in un **roadbook vuoto** lato server (`status='draft'`, `total_distance 0`,
`note_count 0`): solo un **contenitore identificato da `draftId`** (`/photos/<draftId>/`,
`/audio/<draftId>/`, righe `roadbook_photos`/`roadbook_audio`), legati per id + coordinate. **La
traccia non viene mai spinta nel draft**: il draft nasce solo per reggere foto/audio finché la
registrazione non diventa un roadbook salvato.

Il draft si crea **best-effort e in modo pigro** (`ensureDraft()`, #147 F2): `begin()` prova
subito, ma se è offline non fallisce — le catture entrano comunque in coda e il draft viene creato
**al primo flush** utile (quando torna la rete), tramite il *resolver* passato a
`RBMediaQueue.init` (`resolveRoadbook`). `ensureDraft` è memoizzato, quindi una raffica di catture
condivide **un solo** draft; l'id, una volta ottenuto, viene stampato sugli item in coda.

→ Senza login **niente foto/audio** (i pulsanti restano nascosti, §6): la cattura da signed-out è
la fase successiva (F3). Con login, i pulsanti sono **sempre attivi** — anche offline o prima che
il draft esista.

### Cosa sta in quale formato, e quando va sul server
| Dato            | Nel `.rdbk`   | Nel GPX | Quando raggiunge il server |
|-----------------|---------------|---------|----------------------------|
| Traccia         | Sì (`track`)  | Sì (`trk`) | **Solo al salvataggio** del roadbook (Convert → Editor → Save) |
| Waypoint / note | Sì (`notes`)  | Sì (`wpt`) | idem |
| Foto            | **No, mai**   | **No**  | Via **coda locale → upload differito con retry** (nel draft) |
| Audio           | **No, mai**   | **No**  | Via **coda locale → upload differito con retry** (nel draft) |

Foto e audio non sono **mai** dentro il file `.rdbk` né nel GPX: sono file lato server
referenziati dal roadbook per id + coordinate. Viaggiano col roadbook solo sul server / nell'app.

### Differenze di piattaforma
| Aspetto | App nativa (Android / iOS) | Browser / PWA (PC · Android · iOS Safari) |
|---|---|---|
| GPS in background | **Sì** — `RBNative.geo` = `@capgo/background-geolocation` (foreground service): registra a **schermo bloccato / app in background** (Android mostra la notifica "Recording your route"; iOS via background-location del plugin) | `navigator.geolocation.watchPosition` + **wakeLock** (schermo acceso). A schermo bloccato / app in background il watch è sospeso/limitato — **iOS Safari** è il più penalizzato (JS sospeso); serve app in primo piano |
| File `.gpx` live su disco | no (solo checkpoint localStorage) | **solo PC Chromium** (File System Access); altrove solo localStorage |
| Fotocamera / microfono | API web (`<input capture>`, `getUserMedia`) — il bridge nativo espone **solo il GPS** | API web |

### Comportamento offline (mobile)
- **Traccia + waypoint di testo**: funzionano **pienamente offline** (GPS locale + checkpoint).
  Nessuna rete richiesta.
- **Foto / audio** (utente **loggato**): i pulsanti sono **sempre attivi**, anche offline o prima
  che il draft esista (#147 F2). Ogni cattura entra in una **coda locale** (`RBMediaQueue`, blob in
  IndexedDB) e viene caricata **con retry** appena c'è rete; se il draft non c'è ancora viene creato
  al primo flush (`resolveRoadbook`→`ensureDraft`) e il suo id stampato sugli item. La coda si
  svuota da sola al ritorno online (evento `online` + retry periodico) e **sopravvive a reload/kill**
  (i blob restano in IndexedDB). Un contatore "N in attesa di upload" appare sotto i comandi finché
  la coda non è vuota.
  - *Limite attuale*: la cattura richiede comunque il **login**; da signed-out foto/audio non sono
    ancora possibili (buffering da non loggato = fase F3 dell'issue #147).
- La **traccia** sopravvive comunque in locale: la si può scaricare in GPX subito oppure —
  tornata la rete — riprendere la sessione e salvarla sul server.

---

## 4. La mappa live

`RBMap('recMap', { zoom: 15, headingToggle: true })` è istanziata all'avvio del modulo
([recorder.js:22](../public/recorder/recorder.js#L22)). Ad ogni fix la posizione
corrente aggiorna il marker (`map.setPosition`, anche per i fix scartati dalla traccia),
passando una **rotta smussata** (`course`): l'heading GPS quando ci si muove, altrimenti il
bearing del tragitto recente. La mappa è **heading-up** (marcia in alto) con un toggle per
bloccarla a nord; il puntino diventa un chevron direzionale
([recorder.js:82](../public/recorder/recorder.js#L82)). Ad ogni nuovo campione/waypoint/foto,
`refreshMap()` ridisegna traccia + waypoint + foto via
`map.setLiveTrack(track, wpts, photos)` ([recorder.js:123](../public/recorder/recorder.js#L123)).

`track` qui è una **copia locale leggera usata solo per il disegno**; la traccia
autorevole vive in `RBGpxRecorder`. Dopo un resume parte vuota e si ricostruisce dai
fix successivi.

### Posizione di default prima del primo fix (#74)
All'avvio, `RBApi('config')` identifica l'utente; se è loggato e ha salvato una posizione
di default nel profilo (`meUser.default_lat`/`default_lon`) — e non c'è ancora un fix GPS —
la mappa ci centra subito (`map.map.jumpTo`, zoom 13,
[recorder.js:60-62](../public/recorder/recorder.js#L60)), così non si parte sulla vista mondo
in attesa del satellite. Il primo fix reale prende poi il sopravvento sul marker.

---

## 5. Waypoint con testo (e dettatura)

*Waypoint* richiede un fix GPS (altrimenti toast *"Waiting for a GPS fix…"*). Il flusso è:

1. **Drop immediato** alla posizione corrente via `dropWaypoint(lat, lon, text)`: crea
   `{ lat, lon, name: 'wptN', num, text, t: lastFixT }`, lo aggiunge a `wpts`, ridisegna e
   salva. Il campo **`t`** è il timestamp dell'ultimo fix (#158): l'Editor lo userà per
   ancorare il waypoint alla traccia **per tempo**.
2. Apre il **prompt di testo condiviso** `RBWaypointPrompt(note.num, cb, { mic: true, lang:
   voiceLang })` — lo stesso primitivo usato altrove: si auto-chiude dopo **5 s** salvo si
   inizi a digitare, e include il microfono di dettatura dove supportato.

### Speech-to-text
La lingua del riconoscimento vocale è `voiceLang()`: la **preferenza dell'account**
(`meUser.voice_lang`, impostabile in `/account/`) oppure, se assente o da sloggati,
`navigator.language`. È la stessa lingua usata sia dal mic del prompt *Waypoint* sia dalla
trascrizione best-effort di *WP audio*. Il microfono pulsa mentre ascolta (classe `.on`).

### "WP audio" (registrazione vocale, press-and-hold)
Il pulsante **"WP audio"** (`#recWptAudio`, `.btn-accent`/sand; visibile dove c'è
speech-to-text **o** registrazione audio) è il flusso pensato per il telefono in movimento:
**tieni premuto per registrare**, senza modale. Alla pressione rilascia subito un waypoint
alla posizione corrente, poi:

- **Audio (primario):** registra la **clip vocale** via `getUserMedia` + `MediaRecorder` e la
  **accoda** (`RBMediaQueue.add('audio', …)` → upload differito con retry a `RBUploadAudio` →
  tabella `roadbook_audio`, come le foto) — solo da **loggato + bozza** (`meUser && draftId`).
  La clip si rivede/riascolta nell'Editor, **sulla riga della nota** più vicina.
- **Testo (best-effort):** in parallelo tenta `SpeechRecognition` → `note.text`. **Il microfono
  è esclusivo**, quindi la registrazione lo prende per prima: il testo dal vivo esce **solo dove
  il mic è condivisibile (desktop)**; su **Android/iOS** = **audio sì, testo no**. (Per il solo
  testo dal vivo c'è il mic del modale *Waypoint*, che è STT-only.)
- **Countdown al rilascio:** lasciando il tasto parte un conto alla rovescia **sul pulsante**
  (5→0 la prima volta, 2→0 dopo una ri-pressione) durante il quale **continua a registrare**;
  a **0 salva** automaticamente (il waypoint è già creato → nessun OK). **Ripremere** durante il
  countdown lo annulla e riprende a registrare (prossimo countdown = 2). Il rilascio è gestito a
  livello `document` (un dito che scivola via chiude comunque); niente `setPointerCapture`
  (instabile su Android).
- **Feedback:** toast diagnostici — *Microphone unavailable* / *No audio captured* / *Voice note
  saved* — così un fallimento non è silenzioso.

Trascrivere la clip *registrata* in testo (post-registrazione, nell'Editor) è tracciato in **#133**.

> Il pulsante foto è etichettato **"WP Foto"**.

---

## 6. Foto geotaggate

Le foto sono una **funzione per utenti loggati**. Il pulsante *WP Foto* è rivelato dal solo
**login** (`updateRecUi`: `recPhoto.hidden = !meUser`) — **non** dal draft: una foto scattata
offline o prima che il draft esista viene comunque accodata e caricata dopo (#147 F2). Il draft si
crea best-effort/pigro (`ensureDraft`, §3).

Il flusso:
- Non loggato → `RBNeedAuth`. Loggato → si apre subito la fotocamera (nessun requisito di draft).
- L'input `<input type="file" accept="image/*" capture="environment">`
  ([index.html](../public/recorder/index.html)) apre la **fotocamera posteriore**.
- La foto viene **accodata** (`RBMediaQueue.add('photo', file, { type: 'photo', lat, lon }, 'photo.jpg',
  token)`) per l'upload differito con retry; il `roadbook` si aggiunge subito se il draft esiste,
  altrimenti è risolto al flush (`resolveRoadbook`). `RBUpload` applica il downscale all'invio.
- Subito compare un **pin ottimistico** da un `objectURL` locale (`photos` con `{ token, url,
  lat, lon, local: true, pending: true }`), la mappa si ridisegna e la sessione si salva. Quando
  l'upload va a buon fine, `onDone` **riconcilia** quella voce con `{ id, url }` del server
  (via `token`) e revoca l'`objectURL`. Poi `RBPhotoPreview(url, cb)` mostra l'anteprima:
  confermando la callback lascia un waypoint vuoto alla posizione della foto.

### Dove finiscono davvero le foto (quirk importante)
Le foto **non** sono parte della traccia GPX né del file `.rdbk` (per design: il formato
`.rdbk` non contiene foto). Vengono caricate **lato server, legate al draft roadbook**
identificato da `draftId`. In `photos` resta solo il riferimento (`{ id, url, lat, lon }` una
volta riconciliato dalla coda). Di conseguenza:

- Senza login non c'è draft, quindi **niente foto** (il pulsante resta nascosto).
- Allo *scarico GPX* le foto **non** sono incluse (il GPX porta solo traccia + waypoint).
  Le foto sopravvivono solo se si sceglie *Convert into roadbook*, che passa il `draftId`
  all'Editor (§8).

---

## 7. Salvataggio su disco e file handle crash-safe

Il logging su file è interamente delegato a `RBGpxRecorder`. Il Recorder lo configura
una volta con `RBGpxRecorder.init({ toast, onChange })`
([recorder.js:32-41](../public/recorder/recorder.js#L32)), dove `onChange(recording)`
commuta le viste idle/running, mostra/nasconde la barra di stato e imposta `RB_BUSY`.

- `RBGpxRecorder.begin()` apre la sessione e (dove l'API File System Access è disponibile)
  un **file handle** su cui scrive i punti man mano (`RBGpxRecorder.add(here, tnow)` ad
  ogni campione, [recorder.js:94](../public/recorder/recorder.js#L94)) — così un crash non
  perde la traccia già scritta.
- Il **selettore file** (gestito da `RBGpxRecorder`, non dal Recorder) è ciò che permette
  di scegliere/creare il file `.gpx` di destinazione del log live; vedere il documento di
  `gpx-recorder.js` per il dettaglio del comportamento e dei fallback dove l'API non è
  disponibile.
- `RBGpxRecorder.finish()` ([recorder.js:114](../public/recorder/recorder.js#L114)) chiude
  il logging, scatena `onChange(false)` (ritorno a idle) e **restituisce la traccia completa**
  (`r.pts`, `r.name`). Se la traccia ha meno di 2 punti, si avvisa *"Route too short to save."*
  e non si salva nulla.

---

## 8. Termine: salva sul server, esporta GPX o apri nell'Editor

A *Finish* confermato si apre `finishModal(pts, name)` con il riepilogo
(punti · km · waypoint · foto) e **tre** azioni (più *Close*). L'azione **primaria dipende dal
login**:

- **Save to server** *(loggato, primaria, #143)*: in un tap costruisce il roadbook dalla
  traccia + waypoint (`RB.buildRoadbook`) e lo scrive **dentro il draft già esistente**
  (`rb_save` con `id = draftId`, `status:'draft'`), così le **foto e le note vocali già
  caricate restano attaccate** senza passare dall'Editor. **Si resta sul Recorder**: una
  piccola conferma offre un link *Edit* (`../editor/?rb=<id>`) per rifinire.
- **Sign in to save** *(sloggato)*: al posto della primaria, un pulsante che apre `RBNeedAuth`.
- **Open in the editor**: mette in `sessionStorage` la traccia (`rb_trip_track`), i waypoint
  (`rb_trip_wpts`), il **nome scelto** (`rb_trip_name`, #54) e — se c'è — il `draftId`
  (`rb_trip_draft`, il ponte verso le foto già sul server), poi naviga a `../editor/?trip=1`.
- **Export GPX**: serializza con `RB.gpxDocument(name, pts, gpxWpts)`, dove i waypoint diventano
  `{ lat, lon, name, t }` (testo del waypoint o `wptN` se vuoto, più il timestamp). Il file
  scende via `RBDownload`. Le foto/audio **non** sono nel GPX.

`clearSession()` viene chiamata subito dopo `finish()`, quindi la sessione di recovery è
scartata appena la traccia è in mano al modale finale.

---

## 9. Funzioni chiave

| Funzione            | Ruolo |
|---------------------|-------|
| `begin()`           | avvia logging, meter, mappa, draft foto/audio (intitolato col nome) |
| `onFix(fix)`        | `RB.recJunkFix` (scarto) + `RB.recStepM` (campionamento adattivo) |
| `startMeter`/`stopMeter` | ciclo `RBGpsMeter` + cronometro |
| `dropWaypoint()`    | crea e registra un waypoint (con timestamp `t`) |
| `saveSession()`     | checkpoint metadati in localStorage |
| `finishModal()`     | salva sul server · apri nell'Editor · esporta GPX |
| `refreshMap()`      | ridisegno mappa live |
| `ensureDraft()`     | crea il draft una sola volta (memoizzato), pigro/best-effort — il resolver della coda (#147 F2) |
| `RBMediaQueue`      | coda foto/audio offline-first (IndexedDB) + upload differito con retry (#147) |

---

## 10. Limiti

- **Foto/audio solo per utenti loggati (#147 F1+F2)**: senza login i pulsanti sono nascosti e
  foto/audio non esistono. Da loggato invece la cattura funziona **offline e prima che il draft
  esista** (coda + retry, draft creato al primo flush). Resta fuori solo il **buffering da
  signed-out** (fase F3).
- **Le foto vivono solo lato server**, legate al draft: non sono nel GPX né nel `.rdbk`.
  Scaricando il GPX si perdono; sopravvivono solo via *Convert into roadbook* (che porta
  il `draftId` all'Editor). Un draft mai convertito resta sul server.
- **Odometro vs traccia**: `recordedM` somma lo spostamento di ogni fix accettato, mentre
  in traccia entrano solo i punti oltre il passo adattivo — i km possono superare la
  densità della polilinea.
- **Soglia accuratezza non configurabile**: i fix peggiori sono scartati dalla traccia da
  `RB.recJunkFix` (regola del core), senza possibilità di configurazione dalla UI del Recorder.
- **La traccia locale `track` è solo per il disegno**: dopo un resume riparte vuota e la
  mappa mostra la sola parte registrata da quel momento, anche se la traccia autorevole
  (in `RBGpxRecorder`) è completa.
- **Conversione monodirezionale**: il passaggio dei dati all'Editor avviene via
  `sessionStorage`; chiudere/ricaricare l'Editor prima di salvare perde traccia e
  waypoint passati (le foto restano sul server finché il draft esiste).
