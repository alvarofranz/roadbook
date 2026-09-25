# Recorder RDBK

Il **Recorder** (`public/recorder/`) è il registratore di percorsi col GPS live. Registra la
traccia, la disegna in tempo reale su una mappa e lungo il cammino permette di lasciare **note
con un tocco** e di scattare **foto geotaggate**. Alla fine c'è una sola domanda: **Save** (il
roadbook bozza si salva e si apre nell'Editor) o **Discard** (#791).

> Il Recorder non possiede logica GPS o di logging propria: **orchestra le primitive
> condivise**. Il loop GPS è `RBGpsMeter`, il logging crash-safe è `RBGpxRecorder`,
> la mappa è `RBMap`, le foto passano dalla coda offline-first `RBMediaQueue`
> (upload differito con retry via `RBUpload`). Per i dettagli di ciascuna,
> vedere i rispettivi documenti — qui si descrive solo come il Recorder le usa.

---

## 1. Scopo e struttura della pagina

La pagina ha due stati esclusivi, commutati via attributo `hidden` dal callback `onChange` di
`RBGpxRecorder`:

- **`recIdle`** — schermata di avvio con il pulsante *Start recording* più due avvisi
  contestuali: `recLoginHint` (visibile ai **non loggati**: la traccia e le foto aspettano sul
  dispositivo, e *Save* chiede di accedere) e `recBgHint` (visibile solo **fuori dall'app nativa**:
  solo l'app registra a schermo bloccato/in background). Entrambi sono governati da
  `updateRecUi()` una volta noto l'utente. *Start* resta **disabilitato finché l'avvio non ha
  deciso** (§2 "Autosave e recovery").
- **`recRunning`** — dashboard live (#768), pensata per chi guida e guarda solo di sfuggita:
  - quattro readout (tempo trascorso, velocità, numero note, km registrati);
  - la **riga di cattura** (#992), tre colonne alte uguali: il grande **Note** (40 %), le catture
    (40 %: **Photo** sopra **Voice note**) e i due interruttori della mappa (20 %: **stile mappa**
    `toggleBaseStyle` sopra **course-up** `headingUp`/`setHeadingUp`) — `.rec-capture` `2fr 2fr 1fr`,
    colonne `.rec-col`. Non c'è annulla sul percorso: una nota sbagliata si cancella nell'Editor;
  - la **mappa live**, con in alto a sinistra, grande e senza etichetta, la **distanza dall'ultima
    nota** (`#recSince`, km con due decimali: `recordedM` meno l'`at_m` salvato sulla nota);
  - la barra **Pause · End** (50 % ciascuno). Su un telefono (≤1024 px, dove c'è la tab bar)
    galleggia **sopra la tab bar** e la mappa prende esattamente l'altezza che resta, così la
    pagina non scorre.

La barra di stato globale (orologio, batteria, stato GPS) è `RBStatusBar`, mostrata solo durante
la registrazione.

---

## 2. La registrazione live

### Avvio
*Start recording* registra subito (#936): superato l'avviso GPS-web una tantum
(`RBWebGpsConfirm`), chiama `begin()` senza chiedere nulla. Il percorso prende come nome data+ora
`YYYY-MM-DD HH-MM` (`recName()`, #148); il roadbook si intitola nell'Editor, quando si salva.

`begin()` azzera tutto lo stato (`recordedM`, `track`, `wpts`, `photos`, contatore tempo),
avvia il logging crash-safe con `RBGpxRecorder.begin({ name: recName() })` — che a sua volta accende, via
callback `onChange`, la barra di stato e la vista *running* — poi fa partire il meter GPS,
ridisegna la mappa e (solo se loggato) crea il **draft** per le foto, **intitolandolo con quel
nome** (`rb_draft` con `name`, #148) così non appare mai come "Recording…".

### Campionamento consapevole dell'accuratezza
Ogni fix GPS arriva a `onFix(fix)`, che usa gli **stessi helper condivisi del core**
dell'Editor (una sola definizione delle soglie):

1. Aggiorna lo stato GPS della barra con l'accuratezza corrente e il marker heading-up.
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

Se il GPS non ottiene nessun fix, un toast lo dice: *"GPS could not get a fix. Move to an open
area and restart the recording."*

### Pausa / ripresa
*Pause* commuta il flag `paused` e gestisce il cronometro: in pausa congela il tempo
trascorso in `elapsedAcc` e azzera `lastSampled` alla ripresa (così la ripresa non traccia una
linea retta sul gap); alla ripresa riparte `segStart`. Il cronometro è
`elapsedAcc + (Date.now() - segStart)`, quindi conta solo il tempo di effettiva registrazione.
Anche *End* congela il cronometro prima di chiedere: se la traccia è troppo corta e si risponde
*No* (§7), la registrazione riprende con il tempo e **tutti i punti** raccolti fin lì.

### Autosave e recovery
Tre checkpoint in `localStorage`, tutti anche nello storage durevole dell'app nativa
(`native/src/durable.js`, #778):

- **La traccia** — `rb_trip_gpx`, di `RBGpxRecorder` (è lui a possedere la traccia *autorevole*,
  scritta al più ogni 3 s).
- **I metadati** — `rb_recorder_session` via `saveSession()`: km, tempo, pausa, note, pin delle
  foto, `draftId`, nome. Richiamata ad ogni tick e ad ogni modifica; **non scrive nulla** prima che
  una registrazione parta, per non sovrascrivere una sessione recuperabile non ancora ripresa.
  Allo stop diventa un checkpoint **`finishing`** (`holdFinished` → `finishedRecord()`: punti, note,
  pin, `draftId`, km), e da lì `saveSession()` scrive in quello (o nello stash del login, quando è
  lui la copia): una foto caricata o il draft creato con la domanda Save / Discard a schermo
  arrivano al checkpoint, così un crash non perde il pin né crea un secondo draft.
- **Lo stash del login** — `rb_recorder_pending_save`: la registrazione finita che *Save* mette da
  parte prima di passare dalla pagina di login (§8).

Un pin di foto non ancora caricata perde nel checkpoint il suo `objectURL` (muore con la pagina) e
tiene il `token`: al ripristino `restorePhotos` ritrova il blob in coda (`RBMediaQueue.get(token)`),
così il pin, la sua nota con la foto (#792) e il conteggio sopravvivono a un crash e al giro del
login.

All'avvio la sequenza è **pending-save → finishing → resume → rescue → idle**; *Start* è
disabilitato e la coda media parte solo quando la sequenza ha finito (così un tocco su *Start* non
sovrascrive i checkpoint di una registrazione non conclusa, e una foto caricata al load trova già il
suo pin):
1. Uno stash del login: da loggato si salva (`saveAfterLogin`), altrimenti si ripropone la domanda.
2. Un checkpoint `finishing`: si riapre la domanda Save / Discard (#647).
3. Una sessione `recording` non declinata: chiede *"Resume the recording in progress?"* con i km
   salvati; se confermata, riprende il log via `RBGpxRecorder.resume()` e ripristina i metadati. La
   traccia locale `track` riparte **vuota** e si riempie man mano (la copia autorevole è in
   `RBGpxRecorder`). Un **No** non cancella nulla (#436): marca `declined` entrambi i checkpoint
   (`RBCheckpoint.decline` · `RBGpxRecorder.decline()`), che restano e non vengono più proposti;
   la prossima registrazione li sostituisce.
4. Altrimenti `RBGpxRecorder.offerRecovery()` (recupero di una traccia orfana lasciata da un crash).

`window.RB_BUSY = true` durante la registrazione, e poi finché la registrazione finita non arriva a
destinazione, impedisce all'app l'auto-refresh di versione a metà sessione.

---

## 3. Dove finiscono i dati: locale vs server (e il *draft*)

Punto chiave: **traccia e foto seguono percorsi diversi**.

- **Traccia + note** restano **in locale** per tutta la registrazione (i checkpoint del §2). **Non
  vengono inviate al server durante la registrazione** (la posizione live non lascia il device).
  Arrivano al server **solo con Save** (§8).
- **Le foto** vengono **bufferizzate in una coda locale** (`RBMediaQueue`, IndexedDB) e **caricate
  sul server con retry** appena possibile — per l'upload serve un contenitore server: il **draft**.
  Un calo di rete a metà registrazione non perde foto (offline-first, #147).

### Il draft server — contenitore delle foto
Le foto finiscono in un **roadbook vuoto** lato server (`status='draft'`, `total_distance 0`,
`note_count 0`): un **contenitore identificato da `draftId`** (`/photos/<draftId>/`, righe
`roadbook_photos`), legate per id + coordinate. *Save* scrive poi il roadbook **dentro lo stesso
draft** (`rb_save` con `id = draftId`).

Il draft si crea **best-effort e in modo pigro** (`ensureDraft()`, #147 F2): `begin()` prova
subito, ma se è offline non fallisce — le catture entrano comunque in coda e il draft viene creato
**al primo flush** utile, tramite il *resolver* passato a `RBMediaQueue.init` (`resolveRoadbook`).
`ensureDraft` è memoizzato, quindi una raffica di catture condivide **un solo** draft.

Il pulsante foto è **sempre attivo**, anche **da sloggato** (#147 F3): la cattura entra comunque in
coda. Da loggato viene caricata nel draft (subito o al primo flush); **da sloggato** resta sul
dispositivo (`ensureDraft` ritorna `null` senza `meUser`, e anche quando la pagina non tiene una
registrazione — una foto rimasta in coda da un'altra non crea un draft vuoto) finché
*Save* non passa dal login e il draft esiste: allora la coda la carica lì (se la pagina viene
lasciata prima, l'Editor la attacca al roadbook che salva, #648).

Se IndexedDB non riesce a tenere la foto (spazio pieno, navigazione privata), `RBMediaQueue.add`
fallisce: il Recorder lo dice (*Could not save.*) e marca il pin `failed` — vive solo in questa
pagina, e un reload non lo riporta.

### Cosa sta dove
| Dato            | Nel roadbook salvato | Quando raggiunge il server |
|-----------------|----------------------|----------------------------|
| Traccia         | Sì (`track`)         | Solo con **Save** |
| Note            | Sì (`notes`); la nota di una foto porta la foto come extra *Photo* (#792) | idem |
| Foto            | Nella galleria del draft (non in `roadbook.json`) | Via **coda locale → upload differito con retry** |

### Differenze di piattaforma
| Aspetto | App nativa (Android / iOS) | Browser / PWA |
|---|---|---|
| GPS in background | **Sì** — `RBNative.geo` = `@capgo/background-geolocation` (foreground service): registra a **schermo bloccato / app in background** (Android mostra la notifica "Recording your route") | `navigator.geolocation.watchPosition` + **wakeLock** (schermo acceso). A schermo bloccato / app in background il watch è sospeso — **iOS Safari** è il più penalizzato; serve app in primo piano |
| Fotocamera | API web (`<input capture>`) — il bridge nativo espone **solo il GPS** | API web |

### Comportamento offline (mobile)
- **Traccia + note**: funzionano **pienamente offline** (GPS locale + checkpoint).
- **Foto**: sempre catturabili; ogni cattura entra in coda (blob in IndexedDB) che **sopravvive a
  reload/kill**. Da loggato si carica con retry appena c'è rete (evento `online` + retry periodico),
  badge "N awaiting upload"; da sloggato resta sul dispositivo, badge "N kept on this device".

---

## 4. La mappa live

`RBMap('recMap', { zoom: 15 })` è istanziata all'avvio del modulo. Ad ogni fix la posizione
corrente aggiorna il marker (`map.setPosition`, anche per i fix scartati dalla traccia),
passando una **rotta smussata** (`course`): l'heading GPS quando ci si muove, altrimenti il
bearing del tragitto recente. La mappa è **heading-up** (marcia in alto) con il pulsante
course-up della griglia per bloccarla a nord; il puntino diventa un chevron direzionale. Ad ogni
nuovo campione/nota/foto, `refreshMap()` ridisegna traccia + note + foto via
`map.setLiveTrack(track, wpts, photos)`.

`track` qui è una **copia locale leggera usata solo per il disegno**; la traccia
autorevole vive in `RBGpxRecorder`. Dopo un resume parte vuota e si ricostruisce dai
fix successivi.

### Posizione di default prima del primo fix (#74)
All'avvio, `RBConfig()` identifica l'utente; se è loggato e ha salvato una posizione
di default nel profilo (`meUser.default_lat`/`default_lon`) — e non c'è ancora un fix GPS —
la mappa ci centra subito (`map.map.jumpTo`, zoom 13), così non si parte sulla vista mondo
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

Non c'è annulla sul percorso: una nota toccata per sbaglio si cancella in un attimo nell'Editor.

**Nota vocale (#992).** Si **tiene premuto** il microfono: al `pointerdown` `markSpot()` prende il
punto (posizione, ora, odometro) e `RBVoice.start` apre il microfono (il pulsante diventa rosso con i
secondi); al rilascio (`pointerup`/`pointercancel`/`pointerleave`) la registrazione si ferma — al
massimo `RBVoice.MAX_S` (60 s). Solo allora, e solo se dura almeno `RBVoice.MIN_S` (2 s), la nota cade
nel punto della pressione (`dropWaypoint(spot)`, al suo posto lungo il percorso) con campanello e
check (#998); più corta non succede nulla e un toast dice di registrare almeno 2 secondi. Si tiene solo
il suono, senza trascrizione: il data URI finisce su `note.voice` (nel checkpoint di crash) e al
salvataggio diventa l'extra **Voice note** della nota (`withExtras` → `{ type: 'voice', audio }`), che
il Reader riproduce prima della nota. Finire con una nota vocale in corso la tiene se è abbastanza lunga. Il pulsante manca dove il browser non sa registrare (`RBVoice.supported`).

---

## 6. Foto geotaggate

Il flusso:
- Tap su *Photo* → si apre subito la fotocamera posteriore
  (`<input type="file" accept="image/*" capture="environment">`), senza requisiti di login/draft.
- La foto viene **accodata** (`RBMediaQueue.add('photo', file, { type: 'photo', lat, lon }, 'photo.jpg',
  token)`) per l'upload differito con retry; il `roadbook` si aggiunge subito se il draft esiste,
  altrimenti è risolto al flush (`resolveRoadbook`). `RBUpload` applica il downscale all'invio.
- Subito compare un **pin ottimistico** da un `objectURL` locale (`photos` con `{ token, url,
  lat, lon, local: true, pending: true }`), la mappa si ridisegna e la sessione si salva. Quando
  l'upload va a buon fine, `onDone` **riconcilia** quella voce con `{ id, url }` del server
  (via `token`) e revoca l'`objectURL`.
- Una foto con posizione lascia **sempre** anche una nota (#282), nel punto in cui si è premuto
  *Photo* (`markSpot()` al tap), e il campanello e il check di una nota normale (§5) arrivano solo
  quando la foto è in coda sul dispositivo (#998): una fotocamera chiusa senza scatto non lascia
  nulla, una foto che il dispositivo non riesce a tenere lo dice e non lascia la nota. La nota ricorda
  la sua foto (`photo: token`) e al salvataggio la porta come extra *Photo* (#792) — letta dal blob in
  coda se non è ancora caricata.

---

## 7. Il logging della traccia

Il logging è interamente delegato a `RBGpxRecorder`. Il Recorder lo configura una volta con
`RBGpxRecorder.init({ toast, onChange })`, dove `onChange(recording)` commuta le viste
idle/running, mostra/nasconde la barra di stato e imposta `RB_BUSY`.

- `RBGpxRecorder.begin()` apre la sessione; `RBGpxRecorder.add(here, tnow)` aggiunge ogni campione
  e lo mette nel checkpoint `localStorage` (al più ogni 3 s) — così un crash non perde la traccia.
- `RBGpxRecorder.end()` chiude il logging, scatena `onChange(false)` e **restituisce la traccia
  completa** (`r.pts`, `r.name`) tenendo il checkpoint. Se la traccia ha meno di 2 punti non c'è
  roadbook da costruire: se però sono state catturate note o foto, lo si dice e si chiede di
  scartarle **nominandole** — *No* torna a registrare da tutti i punti raccolti
  (`RBGpxRecorder.resume(name, r.pts)`, #647); *Sì* (o niente da perdere) scarta come il Discard
  del §8.

---

## 8. Termine: Save o Discard (#791)

Un *End* confermato apre `finishModal()` sulla registrazione tenuta da `holdFinished`: il riepilogo (km · note · foto) e **una sola
domanda**, *Discard* o *Save*. Niente export né altre scelte qui: esportare si fa poi dall'Editor.

- **Save** — da loggato costruisce il roadbook dalla traccia + note (`RB.buildRoadbook`) e lo scrive
  **dentro il draft** che tiene già le foto (`rb_save` con `id = draftId`, `status:'draft'`), poi apre
  subito l'**Editor** su quel roadbook (`../editor/?rb=<id>`), dove si nomina, si scrive e si
  esporta. Da sloggato: mette la registrazione da parte (`rb_recorder_pending_save`: punti, note,
  pin delle foto, `draftId`, nome, km) e passa dalla pagina di login, che la riporta qui:
  `saveAfterLogin` la salva e apre l'Editor. Lo stash resta il checkpoint della registrazione
  **finché il salvataggio non riesce o non si sceglie Discard**: se il salvataggio fallisce (o il
  login viene saltato) la domanda torna, con tutto ancora lì.
- **Discard** — `btn-danger` + cestino, chiede conferma nominando il riepilogo. Poi
  `discardRecording()` butta via **tutto**: i checkpoint, le foto ancora in coda sul dispositivo
  (`RBMediaQueue.drop(tokens)` — altrimenti finirebbero caricate nel roadbook successivo) e il
  draft con le foto già caricate (`rb_delete` + `rb_purge`, best-effort: offline resta una bozza).

Il modale **è l'unica copia** della registrazione finché uno dei due esiti non arriva: **non è
dismissable** (né backdrop né Escape) e i checkpoint si spengono **solo** a un salvataggio riuscito
o a un Discard confermato (`clearRecording()`); lo stash prima del login prende il posto degli altri
due. Un salvataggio fallito lascia tutto com'era. Un crash con il modale a schermo lo riapre al
prossimo avvio (#647).

---

## 9. Funzioni chiave

| Funzione            | Ruolo |
|---------------------|-------|
| `begin()`           | avvia logging, meter, mappa, draft delle foto (intitolato col nome) |
| `onFix(fix)`        | `RB.recJunkFix` (scarto) + `RB.recStepM` (campionamento adattivo) |
| `startMeter`/`stopMeter` | ciclo `RBGpsMeter` + cronometro |
| `dropWaypoint()`    | crea e registra una nota (con timestamp `t` e odometro `at_m`) |
| `saveSession()` / `holdFinished()` | checkpoint della sessione in corso o finita (sessione · `finishing` · stash) in localStorage |
| `persistedPhotos()` / `restorePhotos()` | i pin delle foto nei checkpoint, e di ritorno con il blob dalla coda |
| `finishModal()`     | Save (nel draft, poi l'Editor; da sloggato passando dal login) o Discard confermato; non dismissable (#460 · #791) |
| `clearRecording()`  | la registrazione è arrivata (o è stata scartata): spegne tutti i checkpoint |
| `discardRecording()`| Discard: checkpoint, foto in coda e draft |
| `refreshMap()`      | ridisegno mappa live |
| `ensureDraft()`     | crea il draft una sola volta (memoizzato), pigro/best-effort — il resolver della coda (#147 F2); ritorna `null` da sloggato |
| `RBMediaQueue`      | coda foto offline-first (IndexedDB): `add`/`flush`/`get`/`drop`; upload differito con retry (#147) |

---

## 10. Limiti

- **Le foto non stanno in `roadbook.json`**: vivono lato server nel draft (e nella nota di una foto
  come extra *Photo*); da sloggato aspettano in coda sul dispositivo fino al Save.
- **Odometro vs traccia**: `recordedM` somma lo spostamento di ogni fix accettato, mentre
  in traccia entrano solo i punti oltre il passo adattivo — i km possono superare la
  densità della polilinea.
- **Soglia accuratezza non configurabile**: i fix peggiori sono scartati dalla traccia da
  `RB.recJunkFix` (regola del core), senza possibilità di configurazione dalla UI del Recorder.
- **La traccia locale `track` è solo per il disegno**: dopo un resume riparte vuota e la
  mappa mostra la sola parte registrata da quel momento, anche se la traccia autorevole
  (in `RBGpxRecorder`) è completa.
- **Una registrazione declinata resta** (#436): non viene più proposta, ma il chip "Unsaved work"
  del guscio la elenca ancora finché la prossima registrazione non la sostituisce o non la si
  scarta da lì.

## Salute del GPS prima di partire (#901)

La landing apre subito un `RBGpsMeter` e mostra la salute del GPS in una scheda: *cercando*, *debole*,
*pronto* (discreto o buono) con la precisione, oppure *posizione bloccata*. La scala è una sola,
`RB.gpsHealth(acc)`: `good` ≤ `CONST.GPS_GOOD_M` (15 m), `fair` fino a `FIX_ACC_MAX_M` (35 m, ancora
registrato), `weak` oltre, cioè un fix che la registrazione scarterebbe, e `none` senza fix. È la stessa
scala che legge la barra di stato. **Avvia** si sblocca solo a fine avvio e con un fix fresco (non più
vecchio di 10 s) almeno `fair`, così una registrazione non parte mai alla cieca. Il watch passa alla
registrazione quando parte (`stopPreview`) e torna dopo uno Scarta.

**Un admin può partire alla cieca (#993)** — su un computer non c'è GPS: *Avvia* resta attivo con
*"Admin: start without waiting for the GPS"*, e per quella registrazione (`blindStart`) ogni fix si
tiene qualunque sia la precisione e una nota o una foto senza fix cade al centro della mappa
(`notePosition()`).

Il blocco vale **solo per partire**. Durante la registrazione un segnale perso non la ferma mai: i fix
cattivi vengono saltati (`recJunkFix`), un avviso dice che la registrazione continua, e la traccia
riprende quando tornano i fix.
