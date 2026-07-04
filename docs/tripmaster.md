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
([tripmaster.js:12](../public/tripmaster/tripmaster.js#L12)):

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

L'avvio è in `start()` ([tripmaster.js:42](../public/tripmaster/tripmaster.js#L42)):

- imposta `window.RB_BUSY = true` per **impedire l'auto-refresh** di versione mentre la gita
  è in corso ([tripmaster.js:43](../public/tripmaster/tripmaster.js#L43));
- mostra la **status bar** condivisa `RBStatusBar` (orologio · batteria · satellite/GPS);
- istanzia `RBGpsMeter` con `onFix` come callback;
- avvia un `setInterval` a 500 ms che aggiorna l'orologio di sistema (`tmClock`) e il display
  del cronometro (`tmTimer`).

Ad ogni fix, `onFix(fix)` ([tripmaster.js:54](../public/tripmaster/tripmaster.js#L54)):

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

L'orologio centrale del cruscotto (`tmClock`) è invece locale: è aggiornato dall'intervallo a
500 ms in `start()` ([tripmaster.js:48](../public/tripmaster/tripmaster.js#L48)).

> In landscape su schermi bassi (`max-height: 540px`) l'`header.topbar` viene nascosto via CSS
> ([index.html:55](../public/tripmaster/index.html#L55)) per lasciare spazio al cruscotto.

---

## 4. Odometro: totale, parziale e correzioni ±10 m

Sono due odometri indipendenti, affiancati nel layout `.tm-odo`
([index.html:63](../public/tripmaster/index.html#L63)). Entrambi hanno correttori manuali
`+10 m` / `−10 m`, perché in fuoristrada la deriva GPS va corretta a mano sul riferimento del
roadbook cartaceo.

| Pulsante | Azione | Riga |
|----------|--------|------|
| `tmPlus10` | `partialM += 10` | [tripmaster.js:90](../public/tripmaster/tripmaster.js#L90) |
| `tmMinus10` | `partialM = max(0, partialM − 10)` | [tripmaster.js:91](../public/tripmaster/tripmaster.js#L91) |
| `tmTotPlus10` | `totalM += 10` | [tripmaster.js:93](../public/tripmaster/tripmaster.js#L93) |
| `tmTotMinus10` | `totalM = max(0, totalM − 10)` | [tripmaster.js:94](../public/tripmaster/tripmaster.js#L94) |

- I correttori del **parziale agiscono solo sul parziale**; quelli del **totale solo sul
  totale**. I due odometri sono completamente separati.
- I correttori sono **clampati a 0** verso il basso (mai negativi); verso l'alto non c'è limite.

### Reset del parziale: hold-to-reset 5 s

Il reset del parziale è protetto contro i tocchi accidentali
([tripmaster.js:113](../public/tripmaster/tripmaster.js#L113)):

- **Pointer**: bisogna **tenere premuto 5 secondi** (`setTimeout` di 5000 ms; la barra
  `.hold-fill` si riempie via CSS). Un tap-and-release rapido (< 600 ms) non azzera nulla ma
  mostra il toast "Hold to reset." per spiegare il gesto
  ([tripmaster.js:117](../public/tripmaster/tripmaster.js#L117)).
- **Tastiera** (Enter/Space): l'hold non è raggiungibile senza puntatore, quindi si conferma
  via `RBConfirm`; il `click` sintetico successivo viene inghiottito per non far partire due
  volte l'azione ([tripmaster.js:124-129](../public/tripmaster/tripmaster.js#L124)).

Il reset effettivo (`doReset`) azzera **solo** `partialM`
([tripmaster.js:112](../public/tripmaster/tripmaster.js#L112)).

> Nota: marcare un waypoint con `tmNoteBtn` azzera **anch'esso** il parziale (vedi §7) — ma
> senza l'hold, perché è un'azione esplicita e desiderata ad ogni nuovo riferimento.

---

## 5. Velocità e bande di allerta

La velocità corrente viene da `meter.speedKmh`; viene mostrata arrotondata in `tmSpeed`, e il
massimo in `tmMax` ([tripmaster.js:76](../public/tripmaster/tripmaster.js#L76)).

L'utente può impostare una **velocità da sorvegliare** (`saLimit`, 0 = disattivata) e quattro
colori di banda, persistiti in `localStorage` sotto la chiave `rb_speedalert`
([tripmaster.js:65](../public/tripmaster/tripmaster.js#L65)). Il modale di configurazione è in
`tmSpeedAlert` ([tripmaster.js:133](../public/tripmaster/tripmaster.js#L133)).

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
ago direzionale `tmCapArrow` ([tripmaster.js:81](../public/tripmaster/tripmaster.js#L81)):

- se l'heading non è disponibile, il valore è `—` e l'ago è nascosto;
- l'ago ruota su `--cap-rotation`, con **0° = su = Nord**, e ruota fino all'heading di marcia.

---

## 7. Cronometro

Il cronometro usa il **wall-clock**, così continua a contare anche se l'app viene messa in
background o uccisa ([tripmaster.js:13](../public/tripmaster/tripmaster.js#L13)):

- `timerOn` = in marcia;
- `timerStart` = `Date.now()` dell'ultimo avvio;
- `timerAcc` = millisecondi accumulati nelle sessioni precedenti.

Il tempo mostrato è `timerAcc + (timerOn ? Date.now() − timerStart : 0)`, formattato `m:ss`
nell'intervallo a 500 ms ([tripmaster.js:49](../public/tripmaster/tripmaster.js#L49)).

| Pulsante | Azione | Riga |
|----------|--------|------|
| `tmTimerBtn` | Start/Pause: alterna `timerOn`, accumula in `timerAcc` alla pausa | [tripmaster.js:104](../public/tripmaster/tripmaster.js#L104) |
| `tmTimerReset` | Azzera: `timerOn = false`, `timerAcc = 0` | [tripmaster.js:105](../public/tripmaster/tripmaster.js#L105) |

`renderTimerButton()` ([tripmaster.js:97](../public/tripmaster/tripmaster.js#L97)) scambia
l'icona (cronometro ↔ pausa), evidenzia il pulsante con `.btn-primary` quando attivo e mostra
il pulsante reset solo quando c'è tempo da azzerare (`!timerOn && timerAcc === 0` lo nasconde).

---

## 8. Contatore waypoint

Il pulsante "mark note" (`tmNoteBtn`) incrementa `waypoints`, aggiorna il display e
**azzera il parziale** ([tripmaster.js:95](../public/tripmaster/tripmaster.js#L95)):

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
[tripmaster.js:157](../public/tripmaster/tripmaster.js#L157). Il Tripmaster gli passa solo:

- `toast` per i messaggi;
- un callback `onChange(recording)` che trasforma `tmRecBtn` in un inequivocabile pulsante
  rosso di **STOP** quando si registra, e salva la sessione.

Il pulsante avvia il modale impostazioni (`RBGpxRecorder.settings()`) o ferma la registrazione
(`RBGpxRecorder.stop()`) ([tripmaster.js:165](../public/tripmaster/tripmaster.js#L165)). I fix
sono alimentati dentro `onFix` via `RBGpxRecorder.feed(...)`. Settings modal, checkpoint del
file e recupero post-crash della traccia sono documentati nel doc di `RBGpxRecorder`.

---

## 10. Persistenza e ripristino dopo kill

La sessione vive in `localStorage` sotto `rb_tripmaster_session` (`SESSION_KEY`).

- **Salvataggio**: `saveSession()` ([tripmaster.js:17](../public/tripmaster/tripmaster.js#L17))
  serializza tutto lo stato (odometri, max, waypoint, stato cronometro, stato registrazione GPX
  + nome file) ed è chiamato **ad ogni `render()`** (cioè ad ogni fix) e ad ogni cambio di
  cronometro/registrazione.

- **All'avvio** ([tripmaster.js:24](../public/tripmaster/tripmaster.js#L24)) la IIFE iniziale
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
> ([tripmaster.js:27](../public/tripmaster/tripmaster.js#L27)): un tocco sbagliato non deve mai
> distruggere una gita. La sessione viene **sovrascritta** appena il mezzo si muove, oppure
> cancellata esplicitamente all'uscita.

- **Uscita**: "End the trip" (`tmExit`) chiede conferma, poi `clearSession()` e ricarica la
  pagina ([tripmaster.js:106](../public/tripmaster/tripmaster.js#L106)).

---

## 11. Limiti e quirk

- **Il parziale può essere azzerato da due gesti diversi** con comportamento incoerente:
  l'hold-to-reset è protetto a 5 s, ma "mark note" (§8) lo azzera istantaneamente al primo tap.
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
