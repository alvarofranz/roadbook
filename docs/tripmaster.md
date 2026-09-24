# Tripmaster

Il **Tripmaster** è un computer di bordo GPS **senza roadbook**: nessuna nota, nessun
tracciato da seguire, nessun punteggio. Mostra in tempo reale gli strumenti di un trip
computer da rally raid — odometro totale e parziale, velocità con bande di allerta,
heading (CAP), cronometro, contatore di waypoint — e registra opzionalmente una traccia
GPX a prova di crash. Tutta la sessione è salvata su `localStorage` ad ogni fix, così una
telefonata, un blocco schermo o un kill della tab non perdono nulla.

> A differenza del Reader, il Tripmaster **non misura nulla rispetto a un percorso**: è uno
> strumento "libero", utile per ricognizioni, prove o semplici uscite dove serve solo la
> strumentazione di bordo.

Il file è un'unica IIFE in [tripmaster.js](../public/tripmaster/tripmaster.js); la pagina
è [index.html](../public/tripmaster/index.html).

---

## 1. Lo stato della sessione

Tutto lo stato vive in poche variabili modulo
([tripmaster.js](../public/tripmaster/tripmaster.js)):

| Variabile | Significato |
|-----------|-------------|
| `totalM` | Odometro totale, in metri |
| `partialM` | Odometro parziale (settore), in metri |
| `maxKmh` | Velocità massima registrata |
| `waypoints` | Contatore dei waypoint marcati |
| `timerOn` / `timerStart` / `timerAcc` | Stato del cronometro (vedi §6) |
| `meter` | L'istanza condivisa `RBGpsMeter` |

Le distanze sono in **metri interi** e si convertono in km solo per la visualizzazione
(`(totalM / 1000).toFixed(2)`), in linea con la convenzione del progetto.

---

## 2. Il ciclo GPS

Il Tripmaster non possiede un proprio loop di posizionamento: usa il dashboard GPS condiviso
**`RBGpsMeter`** ([gps-meter.js](../public/assets/js/gps-meter.js)), che fornisce un oggetto
pulito per ogni fix. Si veda il documento dedicato per il dettaglio del watch e del wake lock.

L'avvio è in `start()` ([tripmaster.js](../public/tripmaster/tripmaster.js)):

- imposta `window.RB_BUSY = true` per **impedire l'auto-refresh** di versione mentre la gita
  è in corso ([tripmaster.js](../public/tripmaster/tripmaster.js));
- mostra la **status bar** condivisa `RBStatusBar` (orologio · batteria · satellite/GPS);
- istanzia `RBGpsMeter` con `onFix` come callback;
- avvia un `setInterval` a 500 ms che aggiorna il display del cronometro (`tmTimer`).

Ad ogni fix, `onFix(fix)` ([tripmaster.js](../public/tripmaster/tripmaster.js)):

1. passa l'accuratezza alla status bar (`RBStatusBar.setGps`);
2. somma lo spostamento `fix.disp` sia a `totalM` sia a `partialM`;
3. aggiorna `maxKmh` se la velocità del fix è un nuovo massimo;
4. alimenta il registratore GPX (`RBGpxRecorder.feed`);
5. richiama `render()`.

> L'odometro accumula `fix.disp`, lo spostamento già filtrato da `RBGpsMeter`. Tutta la logica
> di soglia/accuratezza (quando un movimento "conta") vive lì, non qui.

---

## 3. L'header / status bar

L'header globale è la barra condivisa **`RBStatusBar`** ([status-bar.js](../public/assets/js/status-bar.js)),
mostrata da `start()` e mantenuta dal Tripmaster aggiornandone solo lo stato GPS via
`RBStatusBar.setGps(accuratezza)` ad ogni fix. La barra ospita orologio, **batteria** e
indicatore **satellite/GPS**; la sua logica è documentata altrove.

L'orologio è **solo** quello della status bar: il cruscotto non ne ha un secondo (#721).

**Layout (#721).** Le letture sono un griglia di schede: *velocità* (con campanella: toccarla
imposta l'allarme, e la scheda mostra "Alert N" quando è attivo) · *CAP* · *max km/h*, poi
*cronometro* · *note* sulla riga sotto. Le azioni sono una griglia a due colonne: **Mark note**
grande e primario su tutta la riga (conta la nota e azzera il parziale), poi *Record GPX* · *Leave*.
Da 900 px il cruscotto è a due
colonne — odometri e schede a sinistra, azioni in colonna a destra con Mark note la più alta.

> In landscape su schermi bassi (`max-height: 540px`) l'`header.topbar` viene nascosto via CSS
> ([index.html](../public/tripmaster/index.html)) per lasciare spazio al cruscotto.

---

## 4. Odometro: totale, parziale e correzioni ±10 m

Sono due odometri indipendenti, affiancati nel layout `.tm-odo`
([index.html](../public/tripmaster/index.html)). Entrambi hanno correttori manuali
`+10 m` / `−10 m`, perché in fuoristrada la deriva GPS va corretta a mano sul riferimento del
roadbook cartaceo.

| Pulsante | Azione |
|----------|--------|
| `tmPlus10` | `partialM += 10` |
| `tmMinus10` | `partialM = max(0, partialM − 10)` |
| `tmTotPlus10` | `totalM += 10` |
| `tmTotMinus10` | `totalM = max(0, totalM − 10)` |

- I correttori del **parziale agiscono solo sul parziale**; quelli del **totale solo sul
  totale**. I due odometri sono completamente separati.
- I correttori sono **clampati a 0** verso il basso (mai negativi); verso l'alto non c'è limite.

### Reset del parziale: tieni premuta la card 2 s (#983)

Il reset del parziale è protetto contro i tocchi accidentali
([tripmaster.js](../public/tripmaster/tripmaster.js)):

- **Pointer**: si preme **in qualsiasi punto della card del parziale** (`#tmPartialTile`, tranne
  i ±10 m) e si **tiene premuto 2 secondi** (`HOLD_MS`). Mentre si tiene la card diventa
  **rossa** (la `.hold-fill` la riempie via CSS), la riga della didascalia mostra "Hold 2 s to
  reset" e la ↺ si accende: tutto sopra il dito, che di solito sta sul numero. A reset avvenuto
  la card lampeggia **verde per 500 ms** (`DONE_MS`). Rilasciare prima annulla, senza cambiare nulla.
- **Tastiera** (Enter/Space sulla ↺): l'hold non è raggiungibile senza puntatore, quindi si conferma
  via `RBConfirm`; il `click` sintetico successivo viene inghiottito per non far partire due
  volte l'azione ([tripmaster.js](../public/tripmaster/tripmaster.js)).

Il reset effettivo (`doReset`) azzera **solo** `partialM`
([tripmaster.js](../public/tripmaster/tripmaster.js)).

> Nota: marcare un waypoint con `tmNoteBtn` azzera **anch'esso** il parziale (vedi §7) — ma
> senza l'hold, perché è un'azione esplicita e desiderata ad ogni nuovo riferimento.

---

## 5. Velocità e bande di allerta

La velocità corrente viene da `meter.speedKmh`; viene mostrata arrotondata in `tmSpeed`, e il
massimo in `tmMax` ([tripmaster.js](../public/tripmaster/tripmaster.js)).

L'utente può impostare una **velocità da sorvegliare** (`saLimit`, 0 = disattivata) e quattro
colori di banda, persistiti in `localStorage` sotto la chiave `rb_speedalert`
([tripmaster.js](../public/tripmaster/tripmaster.js)). Il modale di configurazione è in
`tmSpeedAlert` ([tripmaster.js](../public/tripmaster/tripmaster.js)).

Il colore della banda è scelto da `speedBandColor(v)`, che delega la fascia (0..3) al core
`RB.speedBand(v, saLimit)` e la mappa sui colori scelti, attorno al limite `L = saLimit`:

| Banda | Condizione | Colore (default) |
|-------|-----------|------------------|
| 0 | `v < L − 5` | verde |
| 1 | `L − 5 ≤ v < L` | arancione |
| 2 | `L ≤ v < L + 5` | rosso |
| 3 | `v ≥ L + 5` | rosso |

Il colore risultante:

- tinge il **numero della velocità** (variabile CSS `--speed-band`);
- tinge lo **sfondo dell'intera colonna centrale** `#tmMain` via la variabile CSS `--tm-band`
  (nessuno stile inline), con transizione morbida;
- aggiunge la classe `.over` quando `speedKmh ≥ saLimit`, che mostra un'icona di avviso ⚠ come
  **segnale non-cromatico** di superamento.

---

## 6. Heading (CAP)

L'heading di marcia viene da `meter.heading` (gradi), mostrato arrotondato in `tmCap` con un
ago direzionale `tmCapArrow` ([tripmaster.js](../public/tripmaster/tripmaster.js)):

- se l'heading non è disponibile, il valore è `—` e l'ago è nascosto;
- l'ago ruota su `--cap-rotation`, con **0° = su = Nord**, e ruota fino all'heading di marcia.

---

## 7. Cronometro

Il cronometro usa il **wall-clock**, così continua a contare anche se l'app viene messa in
background o uccisa ([tripmaster.js](../public/tripmaster/tripmaster.js)):

- `timerOn` = in marcia;
- `timerStart` = `Date.now()` dell'ultimo avvio;
- `timerAcc` = millisecondi accumulati nelle sessioni precedenti.

Il tempo mostrato è `timerAcc + (timerOn ? Date.now() − timerStart : 0)`, formattato `m:ss`
nell'intervallo a 500 ms ([tripmaster.js](../public/tripmaster/tripmaster.js)).

| Pulsante | Azione |
|----------|--------|
| `tmTimerBtn` | la scheda stessa del cronometro (#721): Start/Pause, alterna `timerOn`, accumula in `timerAcc` alla pausa |
| `tmTimerReset` | Azzera: `timerOn = false`, `timerAcc = 0` |

`renderTimer()` ([tripmaster.js](../public/tripmaster/tripmaster.js)) scambia
l'icona (cronometro ↔ pausa) con la sua etichetta accessibile (*Start the timer* / *Pause the
timer*), marca la scheda `.tm-timer` con `.running` quando è attivo e mostra
il pulsante reset solo quando c'è tempo da azzerare (`!timerOn && timerAcc === 0` lo nasconde).

---

## 8. Contatore waypoint

Il pulsante "Mark note" (`tmNoteBtn`) incrementa `waypoints`, aggiorna il display e
**azzera il parziale** ([tripmaster.js](../public/tripmaster/tripmaster.js)):

```js
$('tmNoteBtn').onclick = () => { waypoints++; $('tmNotes').textContent = waypoints; partialM = 0; render(); };
```

> È un **conteggio puro**: non salva coordinate né crea note. Il suo unico effetto laterale è
> azzerare il parziale, modellando il flusso "raggiunto un riferimento → riparto da zero".
> Per registrare la posizione effettiva serve la registrazione GPX (§9).

---

## 9. Registrazione GPX crash-safe

La registrazione è interamente delegata al modulo condiviso **`RBGpxRecorder`**
([gpx-recorder.js](../public/assets/js/gpx-recorder.js)), inizializzato a
[tripmaster.js](../public/tripmaster/tripmaster.js). Il Tripmaster gli passa solo:

- `toast` per i messaggi;
- un callback `onChange(recording)` che trasforma `tmRecBtn` in un inequivocabile pulsante
  rosso di **STOP** quando si registra, e salva la sessione.

Il pulsante avvia subito la registrazione (`RBGpxRecorder.begin()`, nome di default data+ora) o
la ferma (`RBGpxRecorder.stop()`) ([tripmaster.js](../public/tripmaster/tripmaster.js)). I fix
sono alimentati dentro `onFix` via `RBGpxRecorder.feed(...)`, che campiona da sé ogni `SAMPLE_MS`.
Checkpoint del file e recupero post-crash della traccia sono documentati nel doc di `RBGpxRecorder`.

---

## 10. Persistenza e ripristino dopo kill

La sessione vive in `localStorage` sotto `rb_tripmaster_session` (`SESSION_KEY`), letta e scritta con `RBCheckpoint`.

- **Salvataggio**: `saveSession()` ([tripmaster.js](../public/tripmaster/tripmaster.js))
  serializza tutto lo stato (odometri, max, waypoint, stato cronometro, stato registrazione GPX
  + nome file) ed è chiamato **ad ogni `render()`** (cioè ad ogni fix) e ad ogni cambio di
  cronometro/registrazione.

- **All'avvio** ([tripmaster.js](../public/tripmaster/tripmaster.js)) la IIFE iniziale
  decide fra tre strade:
  1. **Riprendi**: se esiste una sessione con dati significativi (`totalM > 0`, waypoint,
     cronometro attivo/accumulato o registrazione GPX), chiede conferma via `RBConfirm` e, se
     accettata, ripristina tutto lo stato e riprende la registrazione GPX
     (`RBGpxRecorder.resume`).
  2. **Recupero GPX**: se non c'è una sessione, offre il recupero di un'eventuale traccia GPX
     interrotta (`RBGpxRecorder.offerRecovery()`).
  3. **Fresca**: altrimenti parte da zero.
  In tutti i casi chiama poi `start()`.

> **Rifiutare la ripresa NON cancella la sessione**
> (#436 · #644): viene **marcata** `declined` e non si chiede più; resta intatta finché questa
> gita non ha dati propri (km, note, cronometro, GPX) — `saveSession` non la tocca prima — oppure
> finché la si cancella esplicitamente all'uscita. Una sessione rifiutata che stava registrando
> offre comunque il recupero del GPX.

- **Uscita**: **Leave** (`tmExit`, `fa-right-from-bracket`, #645) chiede conferma, poi `clearSession()` e ricarica la
  pagina ([tripmaster.js](../public/tripmaster/tripmaster.js)).

---

## 11. Limiti e quirk

- **Il parziale può essere azzerato da due gesti diversi** con comportamento incoerente:
  il reset tenendo premuta la card è protetto a 2 s, ma "Mark note" (§8) lo azzera istantaneamente al primo tap.
  È intenzionale, ma chi non lo sa può perdere il parziale credendo di aver solo contato un
  waypoint.
- **Rifiutare la ripresa lascia la sessione vecchia su disco** finché non ci si muove: se si
  apre il Tripmaster solo per controllare e poi si chiude senza muoversi, alla riapertura
  ricomparirà la stessa proposta di ripresa.
- **Il contatore waypoint non memorizza posizioni**: è un numero, non una lista di punti. Per i
  punti reali serve la traccia GPX.
- **Le bande di allerta velocità sono fisse a ±5 km/h** attorno al limite: la larghezza delle
  bande non è configurabile, solo i colori e il limite lo sono.
- **Nessuna gestione esplicita dell'assenza di GPS oltre il toast iniziale**: senza segnale gli
  odometri semplicemente non avanzano e l'heading resta `—`; non c'è un avviso persistente che
  spieghi perché i numeri sono fermi (l'unico indizio è l'indicatore GPS nella status bar).
- **`maxKmh` non si azzera mai** se non terminando la gita: non esiste un reset del solo
  massimo, a differenza del parziale e del cronometro.
