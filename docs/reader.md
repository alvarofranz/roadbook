# Il Reader RDBK

Il **Reader** è il navigatore — il copilota digitale. Apre un roadbook (file `.rdbk` o
sfida pubblica) e lo trasforma in una tabella di note stile cartaceo guidata dal GPS:
nota attiva centrata, odometro vivo, bussola CAP, validazione manuale o automatica e — in
modalità Competition — un QR firmato col risultato. Una sessione in corso viene
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

La schermata iniziale (`#loadScreen`) offre due ingressi:

- **Carica file `.rdbk`** — `#pickRb` apre il file picker; il JSON viene parsato e passato a
  `loadRb` ([reader.js:40-41](../public/reader/reader.js#L40)).
- **Carica da sfide pubbliche** — `RBChallenges.pick` apre il picker DB-backed
  ([reader.js:42](../public/reader/reader.js#L42)).

`loadRb` ([reader.js:83](../public/reader/reader.js#L83)) normalizza lo schema con
`RB.importRoadbook` (così aprono anche i vecchi file italiani pre-standard), rifiuta i
roadbook senza note, legge il flag roadbook-level `map_access` (`mapAllowed`,
[reader.js:92](../public/reader/reader.js#L92)) per mostrare/nascondere l'opzione mappa, e
apre il **modal di modalità** (§5).

### Altri ingressi (oltre al picker manuale)
All'avvio una IIFE asincrona ([reader.js:51-73](../public/reader/reader.js#L51)) decide in
ordine di priorità:

1. **Ripresa di una sessione interrotta** — se in `localStorage` c'è un checkpoint valido
   (chiavi `rb_session` + `rb_session_roadbook`), chiede conferma con `RBConfirm` e, se
   accettata, fa `resumeSession`. Rifiutare **non** cancella la sessione (un tap sbagliato
   non deve distruggere una gara): viene sostituita all'avvio di una nuova corsa o cancellata
   solo all'uscita esplicita.
2. **Sfida da URL** — un roadbook aperto via `/reader/<slug>` (es. il pulsante "Naviga" di una
   sfida): `RBChallenges.publicFromUrl` + `loadPublic`.
3. **Recupero di un GPX orfano** — `RBGpxRecorder.offerRecovery`.

### Apertura `.rdbk` dal sistema operativo (PWA installata)
Se il browser espone la **File Handling API** (`launchQueue` + `LaunchParams`), il Reader
registra un consumer che apre un `.rdbk` aperto direttamente dall'OS
([reader.js:75-80](../public/reader/reader.js#L75)) — toccando il file nel file manager o
"Apri con" la PWA installata.

---

## 2. La tabella note stile cartaceo

Il cuore della vista è `#noteList`, ricostruito interamente da `renderNotes`
([reader.js:212](../public/reader/reader.js#L212)). Ogni nota è una riga `.nrow` a **4
colonne** (la griglia bianca "carta" è definita in `app.css`; il Reader sovrascrive solo
dimensioni e padding in [index.html:38-46](../public/reader/index.html#L38)):

| Colonna | Classe | Contenuto |
|---------|--------|-----------|
| 1 — Distanze + numero | `.col-distance` | totale `distance` · parziale `+partial_distance` (km, 2 decimali) · numero nota |
| 2 — Vignetta | `.col-vignette` | il pittogramma renderizzato da `NoteCanvas.toSVG(n, iconSrc)`; linee strada più marcate e un **cerchietto di convalida** al centro (dove i due segmenti si incontrano); su telefono (≤600px) la colonna è più larga e il tulip più grande |
| 3 — Indicazioni | `.col-text` | testo nota · riga CAP opzionale · coordinate `lat, lon` |
| 4 — Pulsanti | `.col-buttons` | pulsante "raggiunta" (solo manuale, nota attiva) · pulsante mappa (se attivo) |

- La risoluzione icone passa per `iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/')`
  ([reader.js:206](../public/reader/reader.js#L206)): inline `data:` → `rb.icons` → palette
  standard.
- La riga CAP (`.note-cap`) appare solo se la nota ha un `cap`, mostrando `CAP n°` ed
  eventualmente la `cap_distance` in km ([reader.js:219](../public/reader/reader.js#L219)).
- Sotto ogni riga c'è un contenitore `.nmap` nascosto, slot per la mappa per-nota (§6).
- Dopo il render, gli handler vengono ricablati: `[data-reach]` → `markReached`,
  `[data-map]` → `toggleNoteMap`, e il tap sull'intera riga → `tapNote`
  ([reader.js:229-231](../public/reader/reader.js#L229)).
- **Auto-scroll**: la vista si ricentra sulla nota attiva *solo quando l'indice attivo
  cambia davvero* (`lastScrollIdx`), non a ogni ridisegno per stato "approaching"
  ([reader.js:233](../public/reader/reader.js#L233)).
- Un cambio lingua a metà sessione (`rb-lang`) forza un re-render delle righe tradotte
  ([reader.js:333](../public/reader/reader.js#L333)).

---

## 3. I colori di stato delle note

Le classi di stato sulla `.nrow` sono assegnate in `renderNotes`
([reader.js:215-218](../public/reader/reader.js#L215)); il colore vero è in `app.css`.

| Stato | Classe | Quando | Aspetto |
|-------|--------|--------|---------|
| **Raggiunta** | `.done` | `reached.has(i)` — validata davvero | verde |
| **Saltata** | `.skipped` | `i < activeIdx` ma non in `reached` (superata senza validare) | rosa |
| **Attiva** | `.active` | `i === activeIdx` | bordo rosso |
| **Imminente** | (nessuna) | nota futura | bianco |
| **≤50 m alla prossima** | `.close` (sulla `.col-distance`) | la nota *successiva* ha `partial_distance < 50` | blu |
| **Approaching** | `.warn` (con `.active`) | solo in auto, dentro il reach e ancora in avvicinamento | arancione |

Distinzioni chiave:
- La differenza fra **raggiunta** e **saltata** dipende interamente dal `Set` `reached`: una
  nota oltrepassata che non è dentro `reached` è considerata saltata
  ([reader.js:19](../public/reader/reader.js#L19), [reader.js:216](../public/reader/reader.js#L216)).
- Lo stato **`.close`** (blu) è agganciato alla `partial_distance` della nota *seguente*, non
  al GPS — è una proprietà statica del roadbook ([reader.js:218](../public/reader/reader.js#L218)).
- Lo stato **`.warn`** (arancione, "approaching") è dinamico e deriva da `autoAdvance` (§7):
  `approaching = dist <= reach && !passed` ([reader.js:200](../public/reader/reader.js#L200)).

---

## 4. La barra odometro in alto

`.odometer-bar` ([index.html:70-78](../public/reader/index.html#L70)) è una barra *sticky*
(sotto l'header; in landscape basso l'header sparisce e la barra sale a `top:0`). Su una sola
riga raccoglie tutti i readout, aggiornati a ogni fix in `onFix`
([reader.js:155](../public/reader/reader.js#L155)):

| Elemento | ID | Sorgente |
|----------|-----|----------|
| Titolo roadbook | `#navTitle` | `rb.meta.title`, riga full-width |
| **Totale** (prog.) | `#odoTotal` | `tripTotalM/1000`, 2 decimali |
| **Parziale** (part.) | `#odoPartial` | `tripPartialM/1000`, 2 decimali |
| **Bussola + freccia** | `#odoBrg` / `#odoBrgArrow` | rilevamento alla prossima nota (`RB.geo.bearingDeg`), altrimenti `meter.heading`; freccia ruotata *relativa* al proprio heading (0° = su = dritto) |
| **Ora** | `#odoClock` | orologio di sistema, aggiornato ogni secondo da un `setInterval` ([reader.js:120](../public/reader/reader.js#L120)) |
| **GPS** | `#gpsDot` / `#gpsTxt` | `setGps`: pallino `ok`/`bad` e `±N m`; verde se `accuracy ≤ 25 m` ([reader.js:157](../public/reader/reader.js#L157), [reader.js:181](../public/reader/reader.js#L181)) |
| **Batteria** | `#odoBatt` / `#odoBattIcon` | Battery Status API best-effort (`startBattery`); icona per livello/carica; `N/A` se l'API manca ([reader.js:124-133](../public/reader/reader.js#L124)) |

L'odometro avanza di `disp` (lo spostamento per-fix fornito da `RBGpsMeter`) sia sul totale
sia sul parziale ([reader.js:158](../public/reader/reader.js#L158)).

### La barra CAP in basso
`.capbar` ([index.html:82-87](../public/reader/index.html#L82)) appare **solo quando la nota
precedente porta un CAP** ([reader.js:257-269](../public/reader/reader.js#L257)). Mostra:
rotta da tenere (`prev.cap`), velocità corrente, distanza viva alla destinazione e una
freccia direzionale data-driven. È un ausilio di navigazione "a bussola" tra due note.

### Sincronizzazione dell'odometro alla distanza nota
A ogni validazione, se la nota ha una `distance`, il totale viene **riallineato** alla
distanza cumulativa della nota: `tripTotalM = n.distance`
([reader.js:274](../public/reader/reader.js#L274) in manuale-trip;
[reader.js:322](../public/reader/reader.js#L322) in `validateAt`). Così l'odometro assorbe la
deriva GPS e traiettorie diverse, ripartendo "pulito" a ogni nota; il parziale azzera
(`tripPartialM = 0`).

---

## 5. Il modal di avvio

`loadRb` apre `#modeModal` ([index.html:99-116](../public/reader/index.html#L99)) con le
opzioni di sessione, lette da `readModeOpts` ([reader.js:96](../public/reader/reader.js#L96)):

- **Avanzamento** — segmented control `Automatic (GPS)` vs `Manual (tap)`; `auto` deriva da
  quale segmento è acceso ([reader.js:93-94](../public/reader/reader.js#L93)).
- **Mostra pulsante mappa per nota** (`#optMap`) — solo se `mapAllowed()`; controlla `showMap`.
- **Registra una traccia GPX** (`#optGpx`) — se attivo, `RBGpxRecorder.begin()` parte dopo lo
  start ([reader.js:97](../public/reader/reader.js#L97), [reader.js:103](../public/reader/reader.js#L103)).
- **Suono su nota** (`#optSound`, default attivo) — quando una nota viene raggiunta/validata
  (sia trip `markReached` sia competition `validateAt`, auto o manuale) parte un breve **beep**
  WebAudio (`beep()`, ~880 Hz, nessun file → CSP-safe). Il contesto audio viene sbloccato sul
  tap di avvio (un gesto utente) così può suonare anche su una convalida GPS automatica.

Poi si sceglie la **modalità**:

- **Trip mode** (`#modeTrip`) — segue il roadbook liberamente, **nessun punteggio**; avvia
  subito `startNav(false)`.
- **Competition mode** (`#modeComp`) — apre prima `#teamModal` per il **numero veicolo**
  (`team`, 1–999, sanificato a sole cifre), poi `startNav(true)`
  ([reader.js:98-105](../public/reader/reader.js#L98)). Il punteggio e il QR finale sono
  trattati in [ranking-model.md](./ranking-model.md).

### Il reach adattivo (`reachRadius`)
Il raggio entro cui una nota è "in portata" non è fisso: `reachRadius(i)`
([reader.js:185](../public/reader/reader.js#L185)) lo limita a **metà del gap along-track più
piccolo** verso un vicino (usando `partial_distance`, così i reach di due note non possono
sovrapporsi), poi lo *flooring* sopra il rumore GPS:

```
reach = clamp(min(gapPrev, gapNext) / 2, REACH_MIN_M=18, REACH_MAX_M=20)
```
Il cap a **20 m** tiene la convalida automatica stretta sul punto (era 50 m).

Note rally fitte ottengono un gate stretto; sentieri radi ottengono il cap di 50 m.

---

## 6. La mappa interattiva per-nota

Opzionale (`showMap`), una mappa per volta. `toggleNoteMap`
([reader.js:239](../public/reader/reader.js#L239)) apre un `RBMap` nello slot `.nmap` sotto la
riga: centro sulla nota a zoom ~13, con l'intera traccia + pin per contesto
(`showRoadbook(rb, true)` senza auto-fit) e la nota evidenziata (`select`). Toccare la mappa
aperta la richiude. `closeInlineMap` ([reader.js:251](../public/reader/reader.js#L251))
distrugge pulitamente la mappa GL — ed è chiamata **all'inizio di ogni `renderNotes`**, dato
che la lista viene ricostruita per intero. Se MapLibre non è configurato, mostra un toast.

---

## 7. Avanzamento: automatico e manuale

### Automatico — closest approach (`autoAdvance`)
La validazione automatica **non** scatta entrando in una bolla fissa, ma al *punto di minimo
avvicinamento* ([reader.js:194](../public/reader/reader.js#L194)). Per la nota attiva si
traccia la distanza minima vista (`approachMin`) e la posizione dove è avvenuta
(`approachPos`); la nota si valida quando:

```
passed = approachMin <= reach && dist > approachMin + PASS_MARGIN_M   // PASS_MARGIN_M = 8 m
```

cioè quando si è entrati nel reach **e** ci si è allontanati di almeno 8 m dal punto più
vicino — segno di averlo oltrepassato. Conseguenze del design:

- È **indipendente dalla velocità** (nessun delta fix-a-fix).
- È **immune al cascade**: il tracker della nota successiva (`approachIdx` resettato) parte
  solo dopo che la corrente avanza, quindi note ammassate si validano *una a una* mentre ci
  si passa accanto, mai tutte insieme ([reader.js:195](../public/reader/reader.js#L195)).
- Lo stato arancione `approaching` è `dist <= reach && !passed`; un cambio di questo flag
  forza un re-render anche senza validare ([reader.js:200-202](../public/reader/reader.js#L200)).
- Validando, si punteggia contro `approachPos` (il punto più vicino realmente toccato), non
  contro il fix corrente ([reader.js:201](../public/reader/reader.js#L201)).

`auto` è anche commutabile a metà sessione col pulsante `#autoBtn`
([reader.js:331](../public/reader/reader.js#L331)).

### Manuale — tap
- In **Trip mode** (`!competition`), `tapNote` è navigazione libera: imposta `activeIdx`,
  azzera il parziale, ridisegna — nessun punteggio ([reader.js:291](../public/reader/reader.js#L291)).
  Il pulsante "raggiunta" (`markReached`) marca verde e sincronizza l'odometro
  ([reader.js:271](../public/reader/reader.js#L271)).
- In **Competition**, `tapNote` ([reader.js:290](../public/reader/reader.js#L290)) valida con
  punteggio. Il tracking manuale funziona **anche senza alcun GPS**; quando *c'è* un fix, vale
  il gate di prossimità di `MANUAL_RADIUS_M = 100 m` ("Too far from note") per impedire
  validazioni lontane ([reader.js:295-296](../public/reader/reader.js#L295)).
- Non si può validare all'indietro (`i < activeIdx` viene ignorato).

`validateAt` ([reader.js:303](../public/reader/reader.js#L303)) è il punto comune di
validazione (auto e manuale): avvia/aggiorna l'orologio (`startedAt`/`endedAt`), accumula le
penalità (dettaglio in [ranking-model.md](./ranking-model.md)), marca `reached`, azzera il
parziale e l'arancione, sincronizza il totale e avanza `activeIdx`. All'ultima nota mostra un
toast "Tap Finish".

Il pulsante centrale `#validateBtn` instrada secondo la modalità: `tapNote(activeIdx)` in
competition, `markReached(activeIdx)` in trip ([reader.js:326](../public/reader/reader.js#L326)).

---

## 8. Pausa e wake-lock

Il pulsante `#pauseBtn` ([reader.js:342](../public/reader/reader.js#L342)) ferma il watch GPS
(`meter.stop()`) e rilascia il **wake lock** per risparmiare batteria (es. sosta pranzo);
mostra "Paused" e pallino GPS spento. Il `resume` riavvia lo stesso meter. Mentre è in pausa
l'odometro semplicemente non avanza (nessun fix, nessun `disp`). Il watch GPS e il wake lock
sono gestiti internamente da `RBGpsMeter` — vedi quel modulo.

Il pulsante `#endBtn` ([reader.js:350](../public/reader/reader.js#L350)) esce dalla
navigazione previa conferma (il progresso note va perso): cancella la sessione e torna alla
home.

---

## 9. Checkpoint di sessione (resilienza a crash/kill)

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
META a 49 caratteri, firma HMAC e QR del risultato** è documentata altrove:
vedi **[ranking-model.md](./ranking-model.md)**. Nel Reader vive nelle funzioni `buildScored`
([reader.js:282](../public/reader/reader.js#L282)), nell'accumulo dentro `onFix`/`validateAt`,
e in `finish` ([reader.js:357](../public/reader/reader.js#L357)) che impacchetta e firma il
risultato e ne genera il QR (`#qrModal`, con Save/Share).

---

## 11. Limiti e quirk

- **Una sola sezione a punteggio** start→finish (`buildScored`): più settori selettivi
  separati non sono rappresentabili — vedi [ranking-model.md](./ranking-model.md) §8.
- **Raggio uniforme** per tutte le note: `reachRadius` è adattivo 18–50 m, ma non esistono
  raggi `open`/`clear` per-nota distinti per tipo di controllo.
- **`reachRadius` usa `partial_distance` along-track, non la distanza geometrica** verso il
  vicino: se due note sono vicine "in linea d'aria" ma lontane lungo la traccia (tornante), il
  gate resta largo e i loro reach potrebbero comunque sovrapporsi nello spazio.
- **`PASS_MARGIN_M = 8 m`**: per validare in auto serve allontanarsi di 8 m oltre il punto più
  vicino. Su una nota all'estremità finale del percorso (dove non ci si allontana più) la
  validazione automatica può non scattare — resta il fallback manuale o il pulsante centrale.
- **Penalità posizionali dipendenti dal GPS**: una gara manuale senza segnale azzera
  accuracy/CAP/extra (vedi [ranking-model.md](./ranking-model.md)).
- **Indicatore batteria best-effort**: la Battery Status API non è esposta su tutti i browser
  (es. Safari/iOS) → mostra `N/A`.
- **Rifiutare la ripresa non cancella la sessione**: è un comportamento voluto (anti
  tap-accidentale), ma significa che una sessione vecchia può ripresentarsi finché non si
  avvia una nuova corsa o si esce esplicitamente.
- **`endBtn` scarta il progresso note senza salvarlo**: l'unico modo per conservare un
  risultato è `Finish` (Competition) → QR.
