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
  contestuali: `recLoginHint` (visibile ai **non loggati**: la traccia e le foto si registrano
  comunque, e le foto restano sul dispositivo fino al `.rdbk` locale) e `recBgHint` (visibile solo **fuori dall'app nativa**:
  solo l'app registra a schermo bloccato/in background). Entrambi sono governati da
  `updateRecUi()` una volta noto l'utente.
- **`recRunning`** — dashboard live (#768), pensata per chi guida e guarda solo di sfuggita:
  - quattro readout (tempo trascorso, velocità, numero note, km registrati);
  - la **riga di cattura**: un grande pulsante **Note** a sinistra e, alla sua destra, una griglia
    2×2 di icone alta quanto lui — **Photo** · **Annulla l'ultima nota** (chiede conferma
    nominandola) · **stile mappa** (`toggleBaseStyle`) · **course-up** (`setHeadingUp`);
  - la **mappa live**, con in alto a sinistra, grande e senza etichetta, la **distanza dall'ultima
    nota** (`#recSince`, km con due decimali: `recordedM` meno l'`at_m` salvato sulla nota);
  - la barra **Pause · End** (50 % ciascuno). Su un telefono (≤1024 px, dove c'è la tab bar)
    galleggia **sopra la tab bar** e la mappa prende esattamente l'altezza che resta, così la
    pagina non scorre.

La barra di stato globale (orologio, batteria, stato satellite/GPS) è `RBStatusBar`,
mostrata solo durante la registrazione ([recorder.js:38](../public/recorder/recorder.js#L38)).

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
  *autorevole* e crash-safe).
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

→ I pulsanti foto/audio sono **sempre attivi**, anche **da sloggato** (#147 F3): la cattura entra
comunque in coda. Da loggato viene caricata nel draft (subito o al primo flush); **da sloggato**
resta sul dispositivo (`ensureDraft` ritorna `null` senza `meUser`, quindi non si creano draft
orfani) e si salva in un **`.rdbk` self-contained** a fine registrazione (§8). Per salvare
sull'account, si accede **prima** di registrare.

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
- **Foto / audio**: i pulsanti sono **sempre attivi** (anche offline, pre-draft e **da sloggato**,
  #147 F2/F3). Ogni cattura entra in una **coda locale** (`RBMediaQueue`, blob in IndexedDB) che
  **sopravvive a reload/kill**.
  - *Loggato*: caricata **con retry** appena c'è rete; se il draft non c'è ancora viene creato al
    primo flush (`resolveRoadbook`→`ensureDraft`) e il suo id stampato sugli item; la coda si svuota
    da sola al ritorno online (evento `online` + retry periodico). Badge "N in attesa di upload".
  - *Sloggato*: nessun upload (`ensureDraft`→`null`); i media restano sul dispositivo e si salvano
    in un **`.rdbk` self-contained** a fine registrazione (§8). Badge "N salvate su questo dispositivo".
  - *Limite residuo*: per salvare foto/audio **sull'account** occorre accedere **prima** di
    registrare; non c'è (per scelta) upload differito dei media catturati da sloggato.
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

## 5. Note con un tocco (#768)

*Note* richiede un fix GPS (altrimenti toast *"Waiting for a GPS fix…"*). La nota cade **subito**
alla posizione corrente via `dropWaypoint(lat, lon)`: crea
`{ lat, lon, name: 'wptN', num, text: '', t: lastFixT, at_m: recordedM }`, la aggiunge a `wpts`,
ridisegna e salva. Il campo **`t`** è il timestamp dell'ultimo fix (#158): l'Editor lo userà per
ancorare la nota alla traccia **per tempo**; **`at_m`** è il contachilometri in quel momento, da cui
la distanza dall'ultima nota sulla mappa.

Nessun prompt, niente da leggere o scrivere mentre si guida: conferma **`RBSuccess.flash()`** — il
campanello di successo (`assets/sounds/success.mp3`) e un grande check a schermo per meno di un
secondo. Il testo della nota si scrive dopo, nell'Editor. Lo stesso campanello suona nel Reader a
ogni nota validata, automatica o manuale.

Una nota toccata per sbaglio si toglie con **Annulla l'ultima nota** della griglia, che chiede
conferma nominandola.

---

## 6. Foto geotaggate

Il pulsante *Photo* della griglia è **sempre disponibile**, a prescindere da login e draft
(#147 F3): la cattura entra in coda. Da loggato viene caricata nel
draft (creato best-effort/pigro, `ensureDraft`, §3); da sloggato resta sul dispositivo e va nel
`.rdbk` locale a fine registrazione (§8).

Il flusso:
- Tap → si apre subito la fotocamera (nessun requisito di login/draft).
- L'input `<input type="file" accept="image/*" capture="environment">`
  ([index.html](../public/recorder/index.html)) apre la **fotocamera posteriore**.
- La foto viene **accodata** (`RBMediaQueue.add('photo', file, { type: 'photo', lat, lon }, 'photo.jpg',
  token)`) per l'upload differito con retry; il `roadbook` si aggiunge subito se il draft esiste,
  altrimenti è risolto al flush (`resolveRoadbook`). `RBUpload` applica il downscale all'invio.
- Subito compare un **pin ottimistico** da un `objectURL` locale (`photos` con `{ token, url,
  lat, lon, local: true, pending: true }`), la mappa si ridisegna e la sessione si salva. Quando
  l'upload va a buon fine, `onDone` **riconcilia** quella voce con `{ id, url }` del server
  (via `token`) e revoca l'`objectURL`. Una foto con posizione lascia **sempre** anche una nota
  alla sua posizione (#282), con il campanello e il check di una nota normale (§5).

### Dove finiscono davvero le foto (quirk importante)
Le foto **non** sono parte della traccia GPX e non stanno in `roadbook.json`. Dove vivono
dipende dallo stato di login:

- **Loggato**: caricate **lato server, legate al draft roadbook** (`draftId`, tabella
  `roadbook_photos`); in `photos` resta il riferimento (`{ id, url, lat, lon }` una volta
  riconciliato dalla coda).
- **Sloggato**: restano nella **coda locale** (blob in IndexedDB) finché *Save* non passa dal login
  e il draft esiste: allora la coda le carica lì (§8).

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
- `RBGpxRecorder.end()` chiude il logging, scatena `onChange(false)` e **restituisce la traccia
  completa** (`r.pts`, `r.name`) tenendo il checkpoint. Se la traccia ha meno di 2 punti non c'è
  roadbook da costruire: se però sono state catturate note o foto, lo si dice e si chiede di
  scartarle **nominandole** — *No* torna a registrare (`RBGpxRecorder.resume`, #647).

---

## 8. Termine: Save o Discard (#791)

Un *End* confermato apre `finishModal(pts, name)`: il riepilogo (km · note · foto) e **una sola
domanda**, *Discard* o *Save*. Niente export né altre scelte qui: esportare si fa poi dall'Editor.

- **Save** — da loggato costruisce il roadbook dalla traccia + note (`RB.buildRoadbook`) e lo scrive
  **dentro il draft** che tiene già le foto (`rb_save` con `id = draftId`, `status:'draft'`), poi apre
  subito l'**Editor** su quel roadbook (`../editor/?rb=<id>`), dove si nomina, si scrive e si
  esporta. Da sloggato: mette la registrazione da parte (`PENDING_SAVE`) e passa dalla pagina di
  login, che la riporta qui: `saveAfterLogin` la salva e apre l'Editor (se il salvataggio fallisce,
  la domanda torna).
- **Discard** — `btn-danger` + cestino, chiede conferma nominando il riepilogo.

Il modale **è l'unica copia** della registrazione finché uno dei due esiti non arriva: **non è
dismissable** (né backdrop né Escape) e il checkpoint anti-crash si spegne **solo** a un salvataggio
riuscito, allo stash prima del login o a un Discard confermato. Un salvataggio fallito lascia tutto
com'era. Allo stop la sessione diventa un checkpoint **`finishing`** (`saveFinishing`: punti, note,
pin delle foto, `draftId`, km): un crash con il modale a schermo lo riapre al prossimo avvio (#647).

---

## 9. Funzioni chiave

| Funzione            | Ruolo |
|---------------------|-------|
| `begin()`           | avvia logging, meter, mappa, draft foto/audio (intitolato col nome) |
| `onFix(fix)`        | `RB.recJunkFix` (scarto) + `RB.recStepM` (campionamento adattivo) |
| `startMeter`/`stopMeter` | ciclo `RBGpsMeter` + cronometro |
| `dropWaypoint()`    | crea e registra un waypoint (con timestamp `t`) |
| `saveSession()`     | checkpoint metadati in localStorage |
| `finishModal()`     | Save (nel draft, poi l'Editor; da sloggato passando dal login) o Discard confermato; non dismissable (#460 · #791) |
| `land()`            | un esito ha messo la traccia al sicuro: pulisce il checkpoint e l'uscita diventa *Close* |
| `refreshMap()`      | ridisegno mappa live |
| `ensureDraft()`     | crea il draft una sola volta (memoizzato), pigro/best-effort — il resolver della coda (#147 F2); ritorna `null` da sloggato |
| `RBMediaQueue`      | coda foto/audio offline-first (IndexedDB): `add`/`flush`/`items`/`clear`/`count`; upload differito con retry (#147) |

---

## 10. Limiti

- **Cattura sempre disponibile** (#147 F1+F2+F3): offline, pre-draft e da sloggato. L'unico
  limite residuo: i media catturati **da sloggato non hanno un upload differito** verso l'account
  (scelta di design) — per salvarli sul server si accede **prima** di registrare; altrimenti si
  esporta il `.rdbk` locale con i media.
- **Le foto non stanno nel GPX né in `roadbook.json`**: da loggato vivono lato server (draft); da
  sloggato nel contenitore `.rdbk` ZIP esportato a fine registrazione. Uno *scarico GPX* non le
  include mai.
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
