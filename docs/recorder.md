# Recorder RDBK

Il **Recorder** è un registratore di tracce GPX *live* dedicato, scorporato di recente
dall'Editor in un folder a sé (`public/recorder/`). Registra un percorso col GPS,
lo disegna in tempo reale su una mappa, e lungo il cammino permette di lasciare
waypoint con testo e di scattare foto geotaggate. Al termine si scarica il GPX
oppure si converte tutto (traccia + waypoint + foto) in un roadbook nell'Editor.

> Il Recorder non possiede logica GPS o di logging propria: **orchestra le primitive
> condivise**. Il loop GPS è `RBGpsMeter`, il logging crash-safe è `RBGpxRecorder`,
> la mappa è `RBMap`, le foto passano da `RBUpload`. Per i dettagli di ciascuna,
> vedere i rispettivi documenti — qui si descrive solo come il Recorder le usa.

---

## 1. Scopo e struttura della pagina

La pagina ha due stati esclusivi, commutati via attributo `hidden`
([recorder.js:35-37](../public/recorder/recorder.js#L35)):

- **`recIdle`** — schermata di avvio con il solo pulsante *Start recording*.
- **`recRunning`** — dashboard live: quattro readout (tempo trascorso, velocità,
  numero waypoint, km registrati), la fila di pulsanti azione (Pause · Waypoint ·
  WP audio · WP Foto), la mappa live e il pulsante *Finish*. Su smartphone (≤430px)
  la spaziatura verticale è compatta (padding ridotto, gap unico della `.dash`,
  margini ridondanti azzerati) così la mappa guadagna schermo.

La barra di stato globale (orologio, batteria, stato satellite/GPS) è `RBStatusBar`,
mostrata solo durante la registrazione ([recorder.js:38](../public/recorder/recorder.js#L38)).
Il pulsante *Photo* è nascosto di default e compare solo a draft creato (§5).

Le dipendenze sono caricate dall'HTML nell'ordine: MapLibre, `config.js`,
`roadbook-core.js`, `rbmap.js`, `gps-meter.js`, `gpx-recorder.js`, `i18n.js`,
`app.js`, `status-bar.js`, infine `recorder.js`
([index.html:76-85](../public/recorder/index.html#L76)).

---

## 2. La registrazione live

### Avvio
*Start recording* apre prima il modale impostazioni di `RBGpxRecorder`
(`RBGpxRecorder.settings`), e solo alla conferma chiama `begin()`
([recorder.js:63](../public/recorder/recorder.js#L63)).

`begin()` ([recorder.js:65](../public/recorder/recorder.js#L65)) azzera tutto lo
stato (`recordedM`, `track`, `wpts`, `photos`, contatore tempo), avvia il logging
crash-safe con `RBGpxRecorder.begin()` — che a sua volta accende, via callback
`onChange`, la barra di stato e la vista *running* — poi fa partire il meter GPS,
ridisegna la mappa e (solo se loggato) crea il draft per le foto.

### Campionamento consapevole dell'accuratezza
Ogni fix GPS arriva a `onFix(fix)` ([recorder.js:82](../public/recorder/recorder.js#L82)):

1. Aggiorna lo stato satellite della barra con l'accuratezza corrente.
2. **Scarta i fix-spazzatura**: se `accuracy > 35 m` il fix viene ignorato per la
   traccia (aggiorna solo la barra) ([recorder.js:86](../public/recorder/recorder.js#L86)).
3. Se in pausa, non accumula nulla.
4. Somma lo spostamento del fix all'odometro `recordedM`.
5. **Passo di campionamento adattivo**: il punto entra nella traccia solo se dista
   dall'ultimo campione almeno `step = max(2.5, accuracy × 0.35)` metri
   ([recorder.js:91-92](../public/recorder/recorder.js#L91)). Fix preciso ⇒ dettaglio
   fitto; fix debole ⇒ passo più largo, niente jitter.

| Comportamento                  | Soglia / formula                         |
|--------------------------------|------------------------------------------|
| Fix scartato dalla traccia     | `accuracy > 35 m`                        |
| Passo minimo di campionamento  | `max(2.5, accuracy × 0.35)` m            |
| Altitudine memorizzata         | `coords.altitude` se finita, altrimenti `null` |

> Nota: l'odometro `recordedM` somma lo spostamento di **ogni** fix accettato
> (`accuracy ≤ 35`), anche quando il punto non viene campionato per il passo adattivo.
> Il conteggio km può quindi essere leggermente più alto del numero di punti in traccia.

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

## 3. La mappa live

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

## 4. Waypoint con testo (e dettatura)

*Waypoint* ([recorder.js:132](../public/recorder/recorder.js#L132)) richiede un fix GPS
(altrimenti toast *"Waiting for a GPS fix…"*). Il flusso è:

1. **Drop immediato** alla posizione corrente via `dropWaypoint()`
   ([recorder.js:125](../public/recorder/recorder.js#L125)): crea
   `{ lat, lon, name: 'wptN', num, text }`, lo aggiunge a `wpts`, ridisegna e salva.
2. Apre un modale rapido di testo **senza pressione**: il pulsante mostra
   *"Edit later (5)…"* e si auto-chiude dopo 5 secondi, **a meno che** non si inizi a
   digitare — in quel caso il countdown si ferma e il pulsante diventa *"Save note"*
   ([recorder.js:142-147](../public/recorder/recorder.js#L142)).

### Speech-to-text
Se il browser espone `SpeechRecognition`/`webkitSpeechRecognition`, compare un pulsante
microfono che detta direttamente nel campo (tap per avviare, tap per fermare)
([recorder.js:149-162](../public/recorder/recorder.js#L149)). La lingua del
riconoscimento segue l'UI: `it-IT`, `es-ES`, `en-US`, altrimenti `navigator.language`.
Il microfono pulsa mentre ascolta (classe `.on`, [index.html](../public/recorder/index.html)).

### "WP audio" (registrazione vocale, press-and-hold)
Il pulsante **"WP audio"** (`#recWptAudio`, `.btn-accent`/sand; visibile dove c'è
speech-to-text **o** registrazione audio) è il flusso pensato per il telefono in movimento:
**tieni premuto per registrare**, senza modale. Alla pressione rilascia subito un waypoint
alla posizione corrente, poi:

- **Audio (primario):** registra la **clip vocale** via `getUserMedia` + `MediaRecorder` e
  la salva sul server (`RBUploadAudio` → tabella `roadbook_audio`, come le foto) — solo da
  **loggato + bozza** (`meUser && draftId`). La clip si rivede/riascolta nell'Editor, **sulla
  riga della nota** più vicina.
- **Testo (best-effort):** in parallelo tenta `SpeechRecognition` → `note.text`. **Il microfono
  è esclusivo**, quindi la registrazione lo prende per prima: il testo dal vivo esce **solo dove
  il mic è condivisibile (desktop)**; su **Android/iOS** = **audio sì, testo no**. (Per il solo
  testo dal vivo c'è il mic del modale *Waypoint*, che è STT-only.)
- **Countdown al rilascio:** lasciando il tasto parte un conto alla rovescia **sul pulsante**
  (3→0 la prima volta, 2→0 dopo una ri-pressione) durante il quale **continua a registrare**;
  a **0 salva** automaticamente (il waypoint è già creato → nessun OK). **Ripremere** durante il
  countdown lo annulla e riprende a registrare (prossimo countdown = 2). Il rilascio è gestito a
  livello `document` (un dito che scivola via chiude comunque); niente `setPointerCapture`
  (instabile su Android).
- **Feedback:** toast diagnostici — *Microphone unavailable* / *No audio captured* / *Voice note
  saved* — così un fallimento non è silenzioso.

Trascrivere la clip *registrata* in testo (post-registrazione, nell'Editor) è tracciato in **#133**.

> Il pulsante foto è etichettato **"WP Foto"**.

---

## 5. Foto geotaggate

Le foto sono una **funzione per utenti loggati**. Il pulsante *Photo* è nascosto finché
non esiste un *draft roadbook*: in `begin()`, se l'utente è loggato (`meUser`), si chiama
`RBApi('rb_draft')` e a draft creato (`draftId`) il pulsante compare
([recorder.js:71](../public/recorder/recorder.js#L71)). Dopo un resume, il pulsante è
visibile solo se la sessione conteneva già un `draftId`
([recorder.js:53](../public/recorder/recorder.js#L53)).

Il flusso ([recorder.js:166-187](../public/recorder/recorder.js#L166)):
- Non loggato → `RBNeedAuth`. Senza `draftId` → toast di attesa fix.
- L'input `<input type="file" accept="image/*" capture="environment">`
  ([index.html:73](../public/recorder/index.html#L73)) apre la **fotocamera posteriore**.
- L'upload va a `RBUpload` con `type: 'photo'`, `roadbook: draftId` e — se c'è un fix —
  le coordinate correnti come geotag ([recorder.js:171-177](../public/recorder/recorder.js#L171)).
- La foto restituita (`{ id, url, lat, lon }`) entra in `photos`, ridisegna la mappa e
  salva la sessione. Poi un modale anteprima offre *OK* o *Convert into waypoint*
  (che lascia un waypoint vuoto alla posizione della foto).

### Dove finiscono davvero le foto (quirk importante)
Le foto **non** sono parte della traccia GPX né del file `.rdbk` (per design: il formato
`.rdbk` non contiene foto). Vengono caricate **lato server, legate al draft roadbook**
identificato da `draftId`. In `photos` resta solo `{ id, url, lat, lon }`. Di conseguenza:

- Senza login non c'è draft, quindi **niente foto** (il pulsante resta nascosto).
- Allo *scarico GPX* le foto **non** sono incluse (il GPX porta solo traccia + waypoint).
  Le foto sopravvivono solo se si sceglie *Convert into roadbook*, che passa il `draftId`
  all'Editor (§7).

---

## 6. Salvataggio su disco e file handle crash-safe

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

## 7. Termine: download GPX o conversione in roadbook

A *Finish* confermato si apre `finishModal(pts, name)`
([recorder.js:190](../public/recorder/recorder.js#L190)) con il riepilogo
(punti · km · waypoint · foto) e due azioni:

- **Download GPX** ([recorder.js:199](../public/recorder/recorder.js#L199)): serializza con
  `RB.gpxDocument(name, pts, gpxWpts)`, dove i waypoint diventano `{ lat, lon, name }`
  usando il testo del waypoint (o il nome `wptN` se vuoto). Il file scende via `RBDownload`.
  Le foto **non** sono nel GPX.
- **Convert into roadbook** ([recorder.js:205](../public/recorder/recorder.js#L205)): mette
  in `sessionStorage` la traccia (`rb_trip_track`), i waypoint (`rb_trip_wpts`) e — se c'è —
  il `draftId` (`rb_trip_draft`, il ponte verso le foto già caricate sul server), poi
  naviga a `../editor/?trip=1`. È l'Editor a leggere queste chiavi e costruire il roadbook.

`clearSession()` viene chiamata subito dopo `finish()`
([recorder.js:115](../public/recorder/recorder.js#L115)), quindi la sessione di recovery
è scartata appena la traccia è in mano al modale finale.

---

## 8. Funzioni chiave

| Funzione            | Riga                                                       | Ruolo |
|---------------------|------------------------------------------------------------|-------|
| `begin()`           | [recorder.js:65](../public/recorder/recorder.js#L65)       | avvia logging, meter, mappa, draft foto |
| `onFix(fix)`        | [recorder.js:82](../public/recorder/recorder.js#L82)       | filtro accuratezza + campionamento adattivo |
| `startMeter`/`stopMeter` | [recorder.js:73](../public/recorder/recorder.js#L73) | ciclo `RBGpsMeter` + cronometro |
| `dropWaypoint()`    | [recorder.js:125](../public/recorder/recorder.js#L125)     | crea e registra un waypoint |
| `saveSession()`     | [recorder.js:26](../public/recorder/recorder.js#L26)       | checkpoint metadati in localStorage |
| `finishModal()`     | [recorder.js:190](../public/recorder/recorder.js#L190)     | download GPX o conversione in roadbook |
| `refreshMap()`      | [recorder.js:123](../public/recorder/recorder.js#L123)     | ridisegno mappa live |

---

## 9. Limiti

- **Foto solo per utenti loggati**: senza login il pulsante è nascosto e le foto non
  esistono. Senza `draftId` (es. prima del fix o se `rb_draft` fallisce) la fotocamera
  non si apre.
- **Le foto vivono solo lato server**, legate al draft: non sono nel GPX né nel `.rdbk`.
  Scaricando il GPX si perdono; sopravvivono solo via *Convert into roadbook* (che porta
  il `draftId` all'Editor). Un draft mai convertito resta sul server.
- **Odometro vs traccia**: `recordedM` somma lo spostamento di ogni fix accettato, mentre
  in traccia entrano solo i punti oltre il passo adattivo — i km possono superare la
  densità della polilinea.
- **Soglia accuratezza fissa a 35 m**: i fix peggiori sono scartati dalla traccia senza
  possibilità di configurazione dalla UI del Recorder.
- **La traccia locale `track` è solo per il disegno**: dopo un resume riparte vuota e la
  mappa mostra la sola parte registrata da quel momento, anche se la traccia autorevole
  (in `RBGpxRecorder`) è completa.
- **Conversione monodirezionale**: il passaggio dei dati all'Editor avviene via
  `sessionStorage`; chiudere/ricaricare l'Editor prima di salvare perde traccia e
  waypoint passati (le foto restano sul server finché il draft esiste).
