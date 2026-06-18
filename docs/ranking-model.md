# Modello di Ranking RDBK

Come RDBK trasforma una navigazione in modalità **Competition** in un punteggio e una
classifica. Documento di riferimento per il modello dati e la logica di calcolo.

> Tutti i punteggi seguono la convenzione **"meno è meglio"**: sono *penalità* in punti,
> e il vincitore è quello con il totale di penalità `Final` più basso.

---

## 1. Il flusso dei dati

Il ranking non misura nulla da sé: **consuma il risultato firmato** prodotto dal Reader.

```
Reader (Competition) ──finish()──▶ stringa META (49 char) + firma HMAC
        │                                   │
        │  motore penalità                  ▼
        │  (acc/cap/skip/extra/speed)   QR code  ──scan / incolla──▶ Ranking
        ▼                                                              │
   nota validata ←─ GPS / tap manuale                          compute() → classifica
```

- **Reader** ([reader.js](../public/reader/reader.js)) accumula le penalità durante la guida e,
  al `Finish`, le impacchetta in una stringa a larghezza fissa, la firma e ne fa un QR.
- **Ranking** ([ranking.js](../public/ranking/ranking.js)) raccoglie quei QR (fotocamera o
  incolla), verifica la firma, ricostruisce i campi e calcola le colonne + il punteggio finale.
- Il ponte tra i due è il **payload META**, definito una volta sola in
  [roadbook-core.js](../public/assets/js/roadbook-core.js) (`buildMeta`/`parseMeta`,
  `signMeta`/`verifyMeta`).

---

## 2. Il payload del risultato (stringa META)

È una stringa **a larghezza fissa di 49 caratteri**, tutta numerica, seguita da `-` e dai
primi 10 caratteri esadecimali della firma HMAC-SHA256. Esempio:

```
0070618541230154300012000004500300027001234023-a1b2c3d4e5
└┬┘└──┬─┘└──┬─┘└──┬─┘└┬┘└┬┘└┬┘└┬┘└┬┘└─┬┘└┬┘ └────┬────┘
team date  start  end  ac sk ex cap sp  km  av    firma
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

> Implicazione: il modello supporta **una sola sezione contigua** start→finish. Più settori
> selettivi separati non sono rappresentabili nel payload attuale.

### `accuracy` — precisione di posizione
Ad ogni nota validata (dentro la sezione, con un fix GPS disponibile, esclusa la nota 0):
si somma la distanza in metri tra la posizione GPS reale e la nota.
`pen.acc += haversineM(here, nota)` — **1 punto per metro**
([reader.js:311](../public/reader/reader.js#L311)).

### `cap` — fedeltà alla bussola
Se la nota *precedente* aveva un CAP (`cap` + `cap_distance`), si calcola il punto-bersaglio
proiettando quel rilevamento (`destPoint`) e si somma la distanza tra il fix reale e il
bersaglio. `pen.cap += haversineM(here, target)` — **1 punto per metro**
([reader.js:313](../public/reader/reader.js#L313)).

### `skip` — note saltate
Se si valida una nota più avanti scavalcandone alcune a punteggio, ogni nota saltata costa
`P_SKIP = 450` punti ([reader.js:298](../public/reader/reader.js#L298), `CONST.P_SKIP`).

### `extra` — sforamento (overshoot)
Quando si entra nel raggio di `MANUAL_RADIUS_M = 100 m` dalla nota attiva, il contatore si
"arma"; se ci si allontana di nuovo senza validare, ogni metro percorso da armati viene
accumulato. `extraAccum += disp` → `pen.extra` alla validazione — **1 punto per metro**
([reader.js:164-166](../public/reader/reader.js#L164)).

### `speed` — eccesso di velocità
Quando è in vigore un limite (ricavato dai nomi-icona, `speedLimitOfNote`) e la velocità
massima nel segmento lo supera, si pagano `P_SPEED_PER_KMH = 10` punti per ogni km/h di
eccesso, una volta per segmento ([reader.js:320](../public/reader/reader.js#L320)).

### `km` e `avg`
- `km` = odometro totale (sincronizzato sulla distanza cumulativa delle note ad ogni
  validazione, così assorbe la deriva GPS), in decimi di km.
- `avg` = `km / durata` tra primo e ultimo punto validato, in decimi di km/h.

> **Solo `skip` e `speed` sono indipendenti dal GPS.** `accuracy`, `cap` ed `extra`
> richiedono un fix: una prova **manuale senza GPS** ha 0 su quei tre campi.

---

## 4. Il calcolo della classifica (`compute`)

La pagina ranking ([ranking.js:64](../public/ranking/ranking.js#L64)) ricostruisce 5 colonne
e il punteggio finale da ogni risultato.

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
avg      = m.avg>0 ? m.avg/10 : (targetAvg dell'interfaccia || 30)   // km/h
expected = round(3600 * km / avg)                                    // secondi attesi
actual   = end - start   (+86400 se ha passato la mezzanotte)        // secondi reali
early    = max(0, expected - actual)        // arrivato troppo presto
late     = max(0, actual - expected)        // arrivato troppo tardi
reg      = early + max(0, late - REG_GRACE_S)   // REG_GRACE_S = 59 s
```

- **In anticipo**: penalizzato 1 punto/secondo, **senza tolleranza**.
- **In ritardo**: 59 secondi di **tolleranza** (`REG_GRACE_S`), poi 1 punto/secondo.
- Il campo `targetAvg` nell'interfaccia ricalcola la colonna in tempo reale.

### ⚠ Quirk da segnalare (probabile bug di precedenza)
La velocità di riferimento usa **prima `m.avg` (la media *raggiunta* dal veicolo)** e solo in
mancanza ricade sul `targetAvg` impostato dall'organizzatore. Ma poiché
`avg_raggiunta = km / durata`, si ha `expected = 3600·km / (km/durata) ≈ actual`, quindi
**`reg ≈ 0` per ogni risultato firmato** (che ha sempre `avg` valorizzato). In pratica la
colonna Regolarità è *neutralizzata* per i QR scansionati, e il `targetAvg` non ha effetto.

Se l'intento è una regolarità "alla media decisa dall'organizzatore", la precedenza va
**invertita**: usare `targetAvg` come riferimento e tenere `m.avg` solo come informazione.
Da confermare con la logica di gara desiderata prima di toccarlo.

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

- **Una sola sezione** start→finish; nessun supporto a settori selettivi multipli.
- Il payload è **a 49 caratteri fissi**: nuovi campi (es. tempi per-settore, controlli orari,
  validazione per-waypoint) **non ci stanno** senza ridisegnare META + firma e adeguare il
  Reader e il Ranking. È il vincolo chiave da tenere presente per estensioni tipo OpenRally
  (waypoint tipizzati / cronometraggio FIA).
- **Tutte le note sono trattate come controlli con raggio uniforme** (adattivo 18–50 m,
  `reachRadius`): non esistono raggi `open`/`clear` per-nota.
- Le penalità posizionali (accuracy/CAP/extra) **dipendono dal GPS**: una prova manuale senza
  segnale le azzera.
- La regolarità è di fatto inerte per i risultati firmati (vedi §5).
