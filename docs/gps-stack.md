# Lo stack GPS condiviso di RDBK

Come RDBK riceve la posizione dal dispositivo, la trasforma in un dato pulito e la
registra su disco in modo a prova di crash. Documento di riferimento per i tre moduli
condivisi che ogni strumento con il GPS riusa invece di reimplementarli:

| Modulo | Globale | Ruolo |
|--------|---------|-------|
| [gps-meter.js](../public/assets/js/gps-meter.js) | `RBGpsMeter` | il **loop GPS**: watch posizione + wake lock, un fix pulito per posizione |
| [gpx-recorder.js](../public/assets/js/gpx-recorder.js) | `RBGpxRecorder` | il **logger GPX** crash-safe: modal impostazioni, checkpoint, file live, recovery |
| [status-bar.js](../public/assets/js/status-bar.js) | `RBStatusBar` | la **barra di stato**: orologio · batteria · qualità del segnale GPS |

> I tre moduli sono indipendenti: la pagina li orchestra. Tipicamente crea un
> `RBGpsMeter`, e a ogni fix che riceve lo gira al `RBGpxRecorder` (per registrare) e
> al `RBStatusBar` (per mostrare il segnale). Nessuno dei tre conosce gli altri.

---

## 1. Chi usa cosa

| Strumento | `RBGpsMeter` | `RBGpxRecorder` | `RBStatusBar` |
|-----------|:---:|:---:|:---:|
| **Reader** (navigazione) | sì | sì (log opzionale) | no¹ |
| **Tripmaster** | sì | sì | sì |
| **Recorder** | sì | sì (è il suo scopo) | sì |
| **Editor** — "Adjust on the trail" | no² | sì (`add`/`finish`) | no |

1. Il Reader ha una sua spia GPS in pagina (`setGps` locale, [reader.js:181](../public/reader/reader.js#L181)),
   non la barra condivisa.
2. L'Editor in registrazione usa un **proprio** `navigator.geolocation.watchPosition`
   ([editor.js:491](../public/editor/editor.js#L491)) con una sua logica di campionamento
   per-distanza, e si limita a versare i punti nel `RBGpxRecorder`. Non passa per
   `RBGpsMeter`.

---

## 2. `RBGpsMeter` — il loop GPS condiviso

Una **classe** ([gps-meter.js:10](../public/assets/js/gps-meter.js#L10)). Si istanzia una
volta passando due callback; da lì in poi emette un oggetto pulito a ogni posizione.

```js
const meter = new RBGpsMeter(onFix, onError);
```

- `onFix({ here, coords, disp, speedKmh, heading, tnow })` — chiamata a ogni fix.
- `onError()` — chiamata **una volta** se il GPS è assente o negato.

### Il modello del fix

L'oggetto passato a `onFix` ([gps-meter.js:52](../public/assets/js/gps-meter.js#L52)):

| Campo | Tipo | Significato |
|-------|------|-------------|
| `here` | `{lat, lon}` | la posizione corrente |
| `coords` | `GeolocationCoordinates` | il fix grezzo (`accuracy`, `altitude`, `speed`, `heading`…) |
| `disp` | metri | spostamento "da odometro" dall'ultimo punto **contato** (vedi sotto) |
| `speedKmh` | km/h | velocità, dal GPS o derivata (vedi sotto) |
| `heading` | gradi \| `null` | direzione del dispositivo, quando disponibile |
| `tnow` | ms | `Date.now()` del fix |

### Lo spostamento `disp` (gate anti-rumore)

`disp` non è la distanza grezza tra due fix: è **0** finché lo spostamento non supera
`RB.CONST.MIN_DISP_M` (5 m, [roadbook-core.js:49](../public/assets/js/roadbook-core.js#L49)).
Solo quando lo supera, `disp` vale quella distanza e `lastPos` avanza
([gps-meter.js:41-44](../public/assets/js/gps-meter.js#L41)). Questo dà un odometro che non
"striscia" da fermo per via del jitter GPS: chi somma `disp` ottiene una distanza pulita.

### La velocità `speedKmh` (con fallback)

Si usa il valore del GPS (`coords.speed`, m/s → km/h) quando è valido. Se il dispositivo
smette di riportarlo, si **deriva** dallo spostamento sul tempo trascorso
(`haversineM / dt`, [gps-meter.js:45-49](../public/assets/js/gps-meter.js#L45)), così il
tachimetro non resta "incollato" all'ultimo valore.

### Ciclo di vita

| Metodo | Effetto |
|--------|---------|
| `constructor(onFix, onError)` | salva le callback, *definisce* l'handler di visibilità e chiama `resume()` |
| `resume()` | (ri)avvia il watch, **aggiunge** il listener `visibilitychange` e riacquisisce il wake lock; no-op se già attivo |
| `stop()` | ferma il watch, **rimuove** il listener `visibilitychange` e rilascia il wake lock |

`stop()` + `resume()` sono la coppia Pausa/Riprendi (il Reader li usa così,
[reader.js:345](../public/reader/reader.js#L345)).

### Native vs browser

Se gira dentro l'app Capacitor (`window.RBNative.available`) il watch è quello **nativo**
in background (il logging sopravvive a schermo bloccato); altrimenti è il
`navigator.geolocation.watchPosition` standard con `enableHighAccuracy: true`,
`maximumAge: 1000`, `timeout: 15000`. Entrambe le sorgenti consegnano a `_fix()` un oggetto
con la stessa forma di `GeolocationCoordinates`, così il resto del codice è identico
([gps-meter.js:26-33](../public/assets/js/gps-meter.js#L26)).

Poiché la GPS nel browser è strutturalmente meno affidabile che nell'app nativa (vedi sotto
"Accessibilità e UX"), i tool espongono due avvisi condivisi definiti in `app.js`:
`RBWebGpsWarn` (banner flottante persistente, solo browser) e `RBWebGpsConfirm` (gate one-time
prima di registrazione/navigazione, con copia più severa per le prove di competizione). Dettagli
in [app-shell.md § `RB*` helper](app-shell.md#rbconfirmmsg-oklabel-danger--promiseboolean).

### Il wake lock

`_wake()` richiede `navigator.wakeLock.request('screen')` per tenere lo schermo acceso. I wake
lock vengono persi quando la tab passa in background: il listener `visibilitychange`
(aggiunto da `resume()`, rimosso da `stop()`) lo **riacquisisce** al ritorno in primo piano, ma
solo se il meter è ancora `_running` — così una coppia stop/resume non lascia listener orfani.

---

## 3. `RBGpxRecorder` — il logging GPX crash-safe

Un **singleton** (IIFE, [gpx-recorder.js:8](../public/assets/js/gpx-recorder.js#L8)): esiste
un solo recorder per pagina, con stato interno (`on`, `pts`, `fileHandle`…). Registra una
traccia GPX e fa di tutto per non perderla.

### L'API pubblica

([gpx-recorder.js:117-122](../public/assets/js/gpx-recorder.js#L117))

| Membro | Cosa fa |
|--------|---------|
| `init({ onChange, toast })` | aggancia i callback della pagina: `onChange(recording)` riflette on/off in UI, `toast` mostra i messaggi |
| `settings(opts)` | apre il modal impostazioni (intervallo, nome file, file picker opzionale) e all'OK avvia la registrazione ([gpx-recorder.js:70](../public/assets/js/gpx-recorder.js#L70)) |
| `begin(opts)` | avvia la registrazione senza UI ([gpx-recorder.js:30](../public/assets/js/gpx-recorder.js#L30)) |
| `feed(coords, here, tnow)` | intake **campionato**: un punto per intervallo, fix scadenti scartati ([gpx-recorder.js:32](../public/assets/js/gpx-recorder.js#L32)) |
| `add(here, tnow)` | intake **diretto**: il chiamante ha già deciso che il punto va salvato ([gpx-recorder.js:38](../public/assets/js/gpx-recorder.js#L38)) |
| `finish()` | chiude il log, fa il flush finale e **ritorna** la traccia, senza UI ([gpx-recorder.js:40](../public/assets/js/gpx-recorder.js#L40)) |
| `stop()` | chiama `finish()` e mostra il modal "traccia registrata" ([gpx-recorder.js:49](../public/assets/js/gpx-recorder.js#L49)) |
| `resume(savedName)` | riprende un log interrotto da un reload, dal checkpoint ([gpx-recorder.js:54](../public/assets/js/gpx-recorder.js#L54)) |
| `offerRecovery()` | offre di recuperare un checkpoint orfano (crash senza sessione) ([gpx-recorder.js:60](../public/assets/js/gpx-recorder.js#L60)) |
| `recording` (getter) | `true` mentre registra |
| `fileName` (getter) | il nome del file corrente |

### Due modi di alimentarlo: `feed` vs `add`

- **`feed(coords, here, tnow)`** è il modo "telemetro": campiona da sé a `sampleMs`
  (default 3 s, configurabile) e **scarta** i fix con `accuracy > 35 m`
  ([gpx-recorder.js:33](../public/assets/js/gpx-recorder.js#L33)). Lo usano Tripmaster
  ([tripmaster.js:58](../public/tripmaster/tripmaster.js#L58)), Recorder
  ([recorder.js:94](../public/recorder/recorder.js#L94)) e Reader
  ([reader.js:159](../public/reader/reader.js#L159)), girando direttamente il `coords`,
  `here` e `tnow` del fix di `RBGpsMeter`.
- **`add(here, tnow)`** salta ogni filtro: registra il punto e basta. Lo usa l'Editor in
  "Adjust on the trail" ([editor.js:515](../public/editor/editor.js#L515)), che fa già il
  suo campionamento per-distanza e l'aliasing dell'accuratezza a monte.

### Persistenza crash-safe (due livelli)

`persist(tnow)` accorpa entrambi i livelli in **una sola finestra da 3 s** (guardia condivisa
`lastPersist`), per evitare la ri-serializzazione O(n²) dell'intero array a ogni punto:

1. **Checkpoint localStorage** (chiave `rb_trip_gpx`): l'intero array di punti + il nome —
   riscritto una volta per finestra da 3 s, non a ogni punto. Sopravvive a un crash/chiusura.
2. **File live** (File System Access): se l'utente ha scelto un file nel modal, la traccia
   viene riscritta su disco nella stessa finestra (`writeFile`, di per sé non throttlato). Il
   file picker compare solo sui dispositivi che supportano `showSaveFilePicker`.

L'opzione `begin({ checkpoint: false })` disattiva il checkpoint localStorage del recorder,
per quando il chiamante tiene un proprio checkpoint più ricco
([gpx-recorder.js:28-30](../public/assets/js/gpx-recorder.js#L28)).

### Recovery dopo un kill

Due percorsi distinti, in base a se la pagina ha una sessione da riprendere:

- **`resume(savedName)`** — la pagina sapeva di stare registrando (il suo checkpoint di
  sessione lo dice) e ricarica i punti dal checkpoint del recorder, rimettendolo in stato
  `on`. Usato da Tripmaster ([tripmaster.js:34](../public/tripmaster/tripmaster.js#L34)),
  Recorder ([recorder.js:50](../public/recorder/recorder.js#L50)) e Reader
  ([reader.js:151](../public/reader/reader.js#L151)). **Nota:** un file handle live **non**
  sopravvive a un reload — dopo `resume` la traccia continua solo su localStorage.
- **`offerRecovery()`** — non c'è sessione da riprendere ma resta un checkpoint orfano (≥2
  punti): mostra un `RBConfirm` e, se accettato, apre il modal della traccia recuperata
  ([gpx-recorder.js:60](../public/assets/js/gpx-recorder.js#L60)). Ogni strumento lo chiama
  all'avvio.

### Il modal "traccia registrata"

`finishedModal` ([gpx-recorder.js:103](../public/assets/js/gpx-recorder.js#L103)) mostra punti
+ km e offre **Download GPX** (nascosto se già salvato su file) e **Convert into roadbook**,
che parcheggia la traccia in `sessionStorage` e apre l'Editor con `?trip=1`
([gpx-recorder.js:113](../public/assets/js/gpx-recorder.js#L113)).

### Impostazioni persistite

L'intervallo di campionamento si salva in `localStorage` (chiave `rb_gpx_settings`) e
viene riletto all'avvio del modulo ([gpx-recorder.js:13](../public/assets/js/gpx-recorder.js#L13),
[gpx-recorder.js:96](../public/assets/js/gpx-recorder.js#L96)). `opts.sampleRate === false`
nasconde il campo intervallo (per chi campiona a modo suo), e `opts.onStart` sostituisce il
`begin()` di default ([gpx-recorder.js:69-100](../public/assets/js/gpx-recorder.js#L69)).

---

## 4. `RBStatusBar` — la barra di stato

Un **singleton** (IIFE, [status-bar.js:6](../public/assets/js/status-bar.js#L6)): una barra
appiccicosa sotto l'header globale con orologio, batteria e qualità del segnale GPS. La usano
Recorder e Tripmaster mentre una sessione GPS è attiva.

### L'API pubblica

| Metodo | Cosa fa |
|--------|---------|
| `show()` | crea la barra (una volta), la mostra e avvia il tick dell'orologio (1 s) |
| `hide()` | nasconde la barra e ferma il tick |
| `setGps(acc)` | aggiorna la cella GPS con l'accuratezza in metri dell'ultimo fix |
| `watchBattery(onUpdate)` | sottoscrive il feed batteria: `onUpdate({ pct, charging, icon })` scatta alla sottoscrizione e a ogni cambio livello/carica; ritorna `false` dove la Battery API non c'è. Riusato dall'indicatore batteria dell'odometro del Reader |

La barra si crea pigramente in `ensure()` e si inserisce subito dopo `header.topbar`.

### Le tre celle

- **Orologio** — ridisegnato ogni secondo dal timer di `show()`.
- **Batteria** — via Battery Status API, *best-effort*: non tutti i browser la espongono
  (es. iOS Safari), nel qual caso mostra `N/A`
  ([status-bar.js:20](../public/assets/js/status-bar.js#L20),
  [status-bar.js:29](../public/assets/js/status-bar.js#L29)). L'icona segue il livello e
  diventa un fulmine in carica.
- **GPS** — la Geolocation API espone l'**accuratezza**, non un conteggio di satelliti:
  la barra traduce i metri in qualità del segnale ([status-bar.js:36-41](../public/assets/js/status-bar.js#L36)):

  | Accuratezza | Classe | Etichetta |
  |-------------|--------|-----------|
  | `null` | `bad` | "No GPS" |
  | ≤ 15 m | `ok` | `±N m` |
  | ≤ 35 m | `mid` | `±N m` |
  | > 35 m | `bad` | `±N m` |

  La pagina passa `setGps(fix.coords.accuracy)` a ogni fix
  ([tripmaster.js:55](../public/tripmaster/tripmaster.js#L55),
  [recorder.js:84](../public/recorder/recorder.js#L84)).

---

## 5. Come si incastrano (Tripmaster, esempio canonico)

Il Tripmaster mostra il flusso completo dei tre moduli
([tripmaster.js:44-58](../public/tripmaster/tripmaster.js#L44)):

```js
RBStatusBar.show();                                   // accende la barra
meter = new RBGpsMeter(onFix, () => toast('No geolocation'));

function onFix(fix) {
    RBStatusBar.setGps(fix.coords.accuracy);          // qualità segnale in barra
    // … aggiorna odometro con fix.disp, tachimetro con fix.speedKmh …
    RBGpxRecorder.feed(fix.coords, fix.here, fix.tnow); // registra (campionato)
}
```

All'avvio chiama anche `RBGpxRecorder.init({ onChange, toast })`, e tenta una
`resume()`/`offerRecovery()` per riprendere o recuperare una traccia interrotta.

---

## 6. Limiti e quirk da conoscere

- **`RBGpsMeter` non ha pausa "morbida".** `stop()` chiude del tutto il watch e rilascia il
  wake lock; `resume()` riapre tutto da capo. Non c'è uno stato intermedio.
- **Il wake lock è best-effort.** Errori e API mancanti sono silenziati
  ([gps-meter.js:54](../public/assets/js/gps-meter.js#L54)); su browser senza Wake Lock lo
  schermo può spegnersi e — nel browser, non nell'app nativa — sospendere il watch.
- **Soglia scarto-fix condivisa, altre soglie distinte.** Lo scarto a > 35 m dell'intake di
  registrazione è ora l'unico helper `RB.recJunkFix`, usato dal logger GPX (`feed`), dal
  Recorder e dall'Editor (e il passo di campionamento è `RB.recStepM`). Restano invece distinte
  la soglia "ok ≤ 25 m" del Reader e il "bad > 35 m" della barra di stato.
- **Il file live non sopravvive a un reload.** Dopo `resume()` la traccia continua solo su
  localStorage; il file handle scelto prima del crash va riselezionato per tornare a
  scrivere su disco.
- **Un solo recorder per pagina.** `RBGpxRecorder` è un singleton: non si possono registrare
  due tracce in parallelo nella stessa pagina.
- **`RBStatusBar` mostra qualità del segnale, non satelliti.** L'icona è un disco satellitare
  ma il dato è l'accuratezza in metri — il Web non espone il numero di satelliti.
- **Batteria assente su alcuni dispositivi.** Dove la Battery Status API manca (iOS Safari)
  la cella batteria resta `N/A` per tutta la sessione.
- **L'altitudine può mancare.** `feed`/`add` salvano `ele: null` quando `coords.altitude` non
  è un numero finito; i GPX risultanti possono avere punti senza quota.
