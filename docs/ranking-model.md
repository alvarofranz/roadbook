# Modello di Ranking RDBK

Come RDBK trasforma una navigazione in modalità **Competition** in un punteggio e una
classifica. Documento di riferimento per il modello dati e la logica di calcolo.

> Tutti i punteggi seguono la convenzione **"meno è meglio"**: sono *penalità* in punti,
> e il vincitore è quello con il totale di penalità `Final` più basso.

---

## 1. Il flusso dei dati

Il ranking non misura nulla da sé: **consuma il risultato firmato** prodotto dal Reader.

```
Reader (Competition) ──finish()──▶ stringa META (55 char) + firma HMAC
        │                                   │
        │  penalità (core)                  ▼
        │  (acc/cap/skip/extra/speed)   QR code  ──scan / incolla──▶ Ranking
        ▼                                                              │
   nota validata ←─ GPS / tap manuale                      RB.rankEntry() → classifica
```

- **Reader** ([reader.js](../public/reader/reader.js)) accumula le penalità durante la guida e,
  al `Finish`, le impacchetta in una stringa a larghezza fissa, la firma e ne fa un QR.
- **Ranking** ([ranking.js](../public/ranking/ranking.js)) raccoglie quei QR (fotocamera o
  incolla), verifica la firma, ricostruisce i campi e calcola le colonne + il punteggio finale
  con `RB.rankEntry(meta, avgTarget)`.
- Il ponte tra i due è il **payload META** e le **formule di punteggio**, definiti una volta
  sola nel core ([roadbook-core.js](../public/assets/js/roadbook-core.js)): `buildMeta`/`parseMeta`,
  `signMeta`/`verifyMeta`, le penalità (`validationPenalties`/`skipPenalty`/`speedPenalty`) e
  `rankEntry` — così produttore (Reader) e consumatore (Ranking) restano d'accordo, con i
  test di [tests/scoring.test.js](../tests/scoring.test.js) a garantirlo (#169).

---

## 2. Il payload del risultato (stringa META)

È una stringa **a larghezza fissa di 55 caratteri** (49 numerici + il campo testo `rb` da 6),
seguita da `-` e dai primi 10 caratteri esadecimali della firma HMAC-SHA256. Esempio:

```
0070618541230154300012000004500300027001234023monza1-a1b2c3d4e5
└┬┘└──┬─┘└──┬─┘└──┬─┘└┬┘└┬┘└┬┘└┬┘└┬┘└─┬┘└┬┘└──┬─┘ └────┬────┘
team date  start  end  ac sk ex cap sp  km  av   rb     firma
```

| Campo      | Largh. | Significato                                   | Codifica            |
|------------|:-----:|-----------------------------------------------|---------------------|
| `team`     | 3     | Numero del veicolo                            | intero              |
| `date`     | 6     | Data della prova                              | `ddmmyy`            |
| `start`    | 6     | Ora del primo punto validato                  | `hhmmss`            |
| `end`      | 6     | Ora dell'ultimo punto validato                | `hhmmss`            |
| `accuracy` | 4     | Penalità di precisione                        | punti (1 pt = 1 m)  |
| `skip`     | 4     | Penalità per note saltate                     | punti               |
| `extra`    | 4     | Penalità per "sforamento" (overshoot)         | punti (1 pt = 1 m)  |
| `cap`      | 4     | Penalità di bussola (CAP)                     | punti (1 pt = 1 m)  |
| `speed`    | 4     | Penalità di velocità                          | punti               |
| `km`       | 5     | Distanza totale percorsa                      | **decimi** di km    |
| `avg`      | 3     | Velocità media raggiunta                      | **decimi** di km/h  |
| `rb`       | 6     | Prefisso dello slug del roadbook (match nel Ranking) | testo, padding a spazi |

Note di codifica (in [buildMeta](../public/assets/js/roadbook-core.js#L326)):
- I campi numerici sono **clampati a 0** se negativi e **saturati a tutti-9** in overflow
  (un `-` o un valore troncato a sinistra non possono mai corrompere la stringa).
- `km` e `avg` sono in *decimi* (interi): `12345` → 1234.5 km, `305` → 30.5 km/h.
  È così che si stanno in 5 e 3 cifre mantenendo un decimale.
- Le penalità sono **clampate a 9999** (4 cifre) al momento del `finish`.

---

## 3. Da dove vengono le penalità (motore del Reader)

La valorizzazione delle penalità nasce durante la navigazione, non nel ranking.

### Sezione a punteggio
Le penalità maturano **solo dentro la sezione cronometrata**. La sezione è delimitata dalle
icone speciali nelle note ([reader.js:280](../public/reader/reader.js#L280)):
- inizio = `I02_partenza.png`, fine = `I01_arrivo.png`;
- `scoredSet` contiene tutte le note tra una partenza (inclusa) e il primo arrivo successivo;
- **se nessuna nota ha l'icona di partenza, l'intero roadbook è a punteggio** (`scoredSet = null`).

> Implicazione: le sezioni cronometrate sono delimitate da icone START→FINISH
> (`RB.scoredNoteSet`) e possono essere **più d'una** (start/finish multipli); le formule qui
> sotto vivono nel core e il Reader le richiama accumulando in `pen`.

### `accuracy` — precisione di posizione
Ad ogni nota validata (dentro la sezione, con un fix GPS disponibile, esclusa la nota 0):
si somma la distanza in metri tra la posizione GPS reale e la nota.
`RB.validationPenalties(notes, i, here).acc` — **1 punto per metro**.

### `cap` — fedeltà alla bussola
Se la nota *precedente* aveva un CAP (`cap` + `cap_distance`), si calcola il punto-bersaglio
proiettando quel rilevamento (`destPoint`) e si somma la distanza tra il fix reale e il
bersaglio (`RB.validationPenalties(...).cap`) — **1 punto per metro**.

### `skip` — note saltate
Se si valida una nota più avanti scavalcandone alcune a punteggio, ogni nota saltata costa
`P_SKIP = 450` punti (`RB.skipPenalty(scoredSet, from, to)`).

### `extra` — sforamento (overshoot)
Quando si entra nel raggio di `MANUAL_RADIUS_M = 100 m` dalla nota attiva, il contatore si
"arma"; se ci si allontana di nuovo senza validare, ogni metro percorso da armati viene
accumulato (`extraAccum += disp` → `pen.extra` alla validazione) — **1 punto per metro**.

### `speed` — eccesso di velocità
Quando è in vigore un limite (`speedLimitOfNote`, dichiarativo o dai nomi-icona) e la velocità
massima nel segmento lo supera, si pagano `P_SPEED_PER_KMH = 10` punti per ogni km/h di
eccesso, una volta per segmento (`RB.speedPenalty(maxKmh, limit)`).

### `km` e `avg`
- `km` = odometro totale (sincronizzato sulla distanza cumulativa delle note ad ogni
  validazione, così assorbe la deriva GPS), in decimi di km.
- `avg` = `km / durata` tra primo e ultimo punto validato, in decimi di km/h.

> **Solo `skip` e `speed` sono indipendenti dal GPS.** `accuracy`, `cap` ed `extra`
> richiedono un fix: una prova **manuale senza GPS** ha 0 su quei tre campi.

---

## 4. Il calcolo della classifica (`RB.rankEntry`)

La pagina ranking passa ogni META parsato per `RB.rankEntry(meta, avgTarget)` (nel core,
condiviso con i test), che ricostruisce 5 colonne e il punteggio finale. La sola lettura del
DOM (la media target dal campo dell'interfaccia) resta nella pagina; il motore è puro.

| Colonna       | Formula                                  |
|---------------|------------------------------------------|
| **Accuracy**  | `accuracy + skip + extra`                |
| **CAP**       | `cap`                                     |
| **Speed**     | `speed`                                    |
| **Regularity**| vedi §5                                   |
| **Final**     | `Accuracy + CAP + Speed + Regularity`     |

- La colonna "Accuracy" **aggrega tre penalità del payload** (precisione + salti + sforamento):
  in tabella si vede un numero solo.
- Le righe sono ordinate per `Final` crescente; la prima riga è evidenziata (`.top`).
- `Final` più basso = posizione migliore.

---

## 5. La regolarità in dettaglio

La regolarità premia chi percorre la sezione nel **tempo atteso** per una certa velocità media.

```js
avg      = targetAvg dell'interfaccia || m.avg/10 || 30               // km/h
expected = round(3600 * km / avg)                                    // secondi attesi
actual   = end - start   (+86400 se ha passato la mezzanotte)        // secondi reali
early    = max(0, expected - actual)        // arrivato troppo presto
late     = max(0, actual - expected)        // arrivato troppo tardi
reg      = early + max(0, late - REG_GRACE_S)   // REG_GRACE_S = 59 s
```

- La velocità di riferimento è il **`targetAvg` impostato dall'organizzatore** (default 30 km/h);
  la media effettivamente raggiunta (`m.avg`) è solo informativa. Così il `targetAvg` governa
  davvero la penalità di regolarità per i risultati scansionati.
- **In anticipo**: penalizzato 1 punto/secondo, **senza tolleranza**.
- **In ritardo**: 59 secondi di **tolleranza** (`REG_GRACE_S`), poi 1 punto/secondo.
- Il campo `targetAvg` nell'interfaccia ricalcola la colonna in tempo reale.

---

## 6. Firma e validità

- La firma è `HMAC-SHA256(meta, signKey)` troncata a 10 hex; `signKey` vive in
  `config.js` lato client ([roadbook-core.js:354](../public/assets/js/roadbook-core.js#L354)).
- Essendo la chiave nel client, la firma protegge da **manomissioni casuali/accidentali**,
  non da un falsario determinato. È comunque molto meglio di un QR in chiaro non verificabile.
- In ranking, un risultato con firma non valida **viene comunque aggiunto** ma marcato con
  un'icona di avviso ⚠ ([ranking.js:27](../public/ranking/ranking.js#L27),
  [ranking.js:95](../public/ranking/ranking.js#L95)); la validità finisce anche nel CSV.

---

## 7. Input, persistenza, export

- **Input**: scansione QR via `BarcodeDetector` (fotocamera ambiente) o incolla manuale del
  testo del codice.
- **Persistenza**: `localStorage` chiave `rb_ranking` (sopravvive al refresh; è locale al
  dispositivo del giudice — nessun salvataggio server).
- **Gestione righe**: cancellazione per riga (con conferma) e "Clear all".
- **Export CSV**: `rank, vehicle, km, accuracy, cap, speed, regularity, final, valid`.

---

## 8. Limiti del modello attuale

- Le sezioni cronometrate START→FINISH possono essere **più d'una** (`RB.scoredNoteSet`), ma il
  payload aggrega comunque le penalità in un unico totale.
- Il payload è **a 55 caratteri fissi** (49 numerici + il campo `rb` da 6): ogni nuovo campo va
  aggiunto a `META_KEYS` + `META_WIDTHS` insieme (allarga il payload) e va adeguato il Reader e il
  Ranking. Attenzione: `rb` è **testo** riempito con spazi, quindi `verifyMeta` **non deve fare
  trim** del META (il padding fa parte della stringa firmata). È il vincolo chiave da tenere
  presente per estensioni tipo cronometraggio FIA per-settore.
- **Il raggio di convalida per-nota** è dato da `RB.detectionRadius` (`wp_radius` → default del
  roadbook → default del tipo → 30 m), poi ristretto dai vicini in `reachRadius`: non è un
  valore uniforme fisso, ma non esistono raggi `open`/`clear` distinti per tipo di controllo.
- Le penalità posizionali (accuracy/CAP/extra) **dipendono dal GPS**: una prova manuale senza
  segnale le azzera.
- La regolarità è di fatto inerte per i risultati firmati (vedi §5).
