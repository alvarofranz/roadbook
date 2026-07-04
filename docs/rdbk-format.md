# Il formato aperto `.rdbk`

Lo standard di file dietro a RDBK.app: un roadbook digitale è **un solo file JSON
autonomo** che porta con sé l'intero percorso — traccia GPS, note, rilevamenti, diagrammi
di incrocio **e i propri simboli**. Documento di riferimento per lo schema, le convenzioni
e i dettagli che la [pagina pubblica dello standard](../public/standard/index.html)
(`/standard`) espone.

> Convenzione cardine: **tutte le distanze sono numeri interi in metri**. Niente
> chilometri, niente decimali nel modello dati. Le coordinate sono gradi decimali WGS-84;
> i rilevamenti sono gradi orari da nord (0–360); gli angoli dei simboli sono gradi orari.

---

## 1. A cosa serve il formato

Un `.rdbk` è pensato per essere **letto, seguito, condiviso e archiviato** senza alcun
allegato esterno. Le sue quattro proprietà di design:

- **Autonomo.** Il file incorpora i simboli che usa (come data URI), quindi rende in modo
  identico ovunque — offline, anni dopo — senza pacchetti di icone esterni da perdere.
- **Un file, JSON puro.** Apribile in qualsiasi editor di testo, parsabile con una riga in
  qualunque linguaggio, versionabile con `git diff`.
- **Pronto per la mappa.** La traccia GPS completa viaggia insieme alle note, così ogni
  reader può disegnare il percorso e posizionare l'utente su di esso.
- **I simboli sono di prima classe.** Ogni nota può portare pittogrammi posizionati,
  ruotati e scalabili e vettori di incrocio colorati — non solo una riga di testo.

**File:** estensione `.rdbk`, codifica **UTF-8 JSON**, media type
**`application/x-roadbook`**.

---

## 2. Struttura del documento

Un file `.rdbk` è un singolo oggetto JSON con quattro chiavi di primo livello:

```jsonc
{
  "meta":  { … },   // metadati del documento
  "track": [ … ],   // la polilinea GPS (punti ordinati)
  "notes": [ … ],   // note di navigazione, ordinate lungo la traccia
  "icons": { … }    // libreria di simboli incorporata (nome → data URI)
}
```

Lo scheletro è prodotto da `buildRoadbook` in
[roadbook-core.js](../public/assets/js/roadbook-core.js#L161); i metadati derivati
(distanza totale, numero note), i tipi di strada e le note vengono ricalcolati da
`recomputeMetrics`/`recomputeCaps`/`normalizeRoadTypes`.

---

## 3. `meta`

| Campo            | Tipo     | Significato                                                                 |
|------------------|----------|------------------------------------------------------------------------------|
| `title`          | string   | Titolo leggibile del roadbook.                                              |
| `total_distance` | integer  | Lunghezza totale del percorso in metri (derivata da `track`).               |
| `note_count`     | integer  | Numero di note.                                                             |
| `description`    | string   | Opzionale. Testo libero mostrato nella pagina pubblica della challenge.     |
| `author`         | string   | Opzionale. Nome dell'autore del roadbook.                                   |
| `organization`   | string   | Opzionale. Club organizzatore / organizzatore dell'evento.                  |
| `modified`       | string   | Opzionale. Data di ultima modifica, ISO `YYYY-MM-DD`.                       |
| `logo`           | string   | Opzionale. Logo evento come data URI base64 (incorporato, come i simboli).  |
| `map_access`     | boolean  | Opzionale. Se un reader può mostrare la mappa durante la navigazione. Assente o `true` = consentito; `false` nasconde la mappa (es. gare in cui leggere la mappa sarebbe sleale). |
| `profile`        | string   | Opzionale. Ambito del vocabolario dei tipi di waypoint (`wp_type`): `basic` (default, solo i marcatori essenziali) o `rally` (set FIA completo). Assente = `basic`. Scopo solo editoriale (decide quali tipi propone l'editor). |
| `default_wp_radius` | integer | Opzionale. Raggio di convalida (metri) di default a livello roadbook, usato dai waypoint senza un proprio `wp_radius`. |

---

## 4. `track`

Un array **ordinato** di punti che descrive la polilinea del percorso. Le note vi fanno
riferimento per indice (`idx`). Ogni punto può portare un `ele` opzionale — l'altitudine
in metri interi.

```jsonc
"track": [
  { "lat": 45.82712, "lon": 9.41164, "ele": 1245 },
  { "lat": 45.82740, "lon": 9.41180 }
]
```

---

## 5. `notes`

Il cuore di un roadbook: una lista ordinata di waypoint, ognuno con un'istruzione, un
rilevamento e dei simboli. Un reader evidenzia la nota attiva e valida il progresso contro
la traccia GPS.

| Campo              | Tipo            | Significato                                                                        |
|--------------------|-----------------|------------------------------------------------------------------------------------|
| `num`              | integer         | Numero della nota, in base 1 (ordine di visualizzazione).                          |
| `idx`              | integer         | Indice dentro `track` dove si trova la nota.                                       |
| `lat`, `lon`       | number          | Posizione della nota (gradi decimali).                                             |
| `distance`         | integer         | Distanza cumulativa dalla partenza (metri).                                        |
| `partial_distance` | integer         | Distanza dalla nota precedente (metri).                                            |
| `text`             | string          | L'istruzione / commento.                                                           |
| `cap`              | integer \| null | CAP — il rilevamento in gradi (0–360) da tenere fino alla nota successiva, se mostrato. |
| `cap_distance`     | integer \| null | Distanza in linea retta per cui tenere quel rilevamento (metri).                   |
| `bearing_in`       | number          | Rilevamento della traccia in arrivo alla nota (gradi).                             |
| `bearing_out`      | number          | Rilevamento della traccia in uscita dalla nota (gradi).                            |
| `road_type_in`     | 0–4             | Superficie in arrivo — vedi [§7 Tipi di strada](#7-tipi-di-strada).                |
| `road_type_out`    | 0–4             | Superficie in uscita.                                                              |
| `danger`           | 1–3, opzionale  | Gradazione di pericolo stile FIA. Resa come `!` / `!!` / `!!!` in rosso dentro il box del diagramma (mai nella colonna del testo). Assente o 0 = nessun pericolo. |
| `wp_type`          | string, opzionale | Tipo di waypoint FIA (`RB.WP_TYPES`): i 7 tipi `masked`/`control`/`security`/`navigation`/`precise`/`visible`/`eclipse` più i marcatori `start`/`finish`, gli estremi di settore (`ss_start`/`ss_end`), di zona (`dz`/`fz`, `dn`/`fn`, `dt`/`ft`) e i controlli (`cp`/`pc`/`stop`). Reso come pastiglia colorata (acronimo) accanto al numero nota e mappato a un `sym` Garmin/OSMAnd nell'export GPX. I tipi `rally` compaiono nell'editor solo con `meta.profile = "rally"`. |
| `wp_radius`        | integer, opzionale | Raggio di convalida specifico della nota (metri). `RB.detectionRadius(note, meta)` ne applica la precedenza a runtime: `wp_radius` per-nota → `meta.default_wp_radius` → default del tipo → `CONST.REACH_DEFAULT_M` (30 m); il Reader lo usa come geofence per il rilevamento automatico. |
| `icons`            | array           | Simboli posizionati — vedi [§6 Simboli](#6-simboli).                                |
| `junctions`        | array \| null   | Vettori di incrocio — vedi [§8 Vettori di incrocio](#8-vettori-di-incrocio).       |

```jsonc
{
  "num": 12, "idx": 184,
  "lat": 45.8321, "lon": 9.4002,
  "distance": 8420, "partial_distance": 630,
  "text": "Tieni la destra sulla pista in ghiaia",
  "cap": 247, "cap_distance": 300,
  "bearing_in": 92, "bearing_out": 247,
  "road_type_in": 2, "road_type_out": 3,
  "danger": 2,
  "icons": [
    { "name": "S03_30km.svg", "pos": [40, 22], "angle": 0, "size": 32, "flip_x": false }
  ],
  "junctions": [
    { "pivot": [0, 0], "tip": [45, 25], "width": 3, "road_type": 3 }
  ]
}
```

> **`road_type_in` è derivato, non autorale.** La strada continua finché una nota non
> cambia `road_type_out`; perciò `road_type_in` di ogni nota è sempre il `road_type_out`
> della nota precedente, ricalcolato da `normalizeRoadTypes`
> ([roadbook-core.js:204](../public/assets/js/roadbook-core.js#L204)). Si autora solo
> `road_type_out`.

---

## 6. Simboli (`icons` di nota + libreria `icons` di primo livello)

### Sistema di coordinate

L'array `icons` di una nota colloca i pittogrammi su un box di riferimento fisso di
**230 × 162**. L'**origine è il centro** del box; **`+y` punta in alto**; l'`angle` è in
gradi **orari**. Questo fa sì che la nota renda identica a qualsiasi dimensione di
visualizzazione.

| Campo    | Tipo     | Significato                                                  |
|----------|----------|-------------------------------------------------------------|
| `name`   | string   | Chiave del simbolo; cercata nella libreria `icons`.         |
| `pos`    | [x, y]   | Posizione del centro in unità di riferimento, dal centro del box, +y in alto. |
| `size`   | number   | Lato del box in unità di riferimento (quadrato).            |
| `angle`  | number   | Rotazione, gradi orari.                                     |
| `flip_x` | boolean  | Specchiatura orizzontale.                                   |

### La regola self-contained

I simboli veri e propri vivono **dentro il file**, in `icons`, una mappa da nome del
simbolo a un data URI. È questo che rende un `.rdbk` portabile: ogni simbolo che disegna è
incorporato.

```jsonc
"icons": {
  "S03_30km.svg": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…",
  "P07_ponte.png": "data:image/png;base64,iVBORw0KGgoAAAANS…"
}
```

L'ordine di risoluzione di un simbolo (`RB.iconSrc`): un data URI inline sull'icona → la
`icons` del file (case-insensitive) → un set di simboli dell'host (la palette standard in
[`public/assets/icons/`](../public/assets/icons/)). **Un writer conforme DEVE incorporare
in `icons` ogni simbolo referenziato da una qualsiasi nota**, così il file resta autonomo.

### Limiti di velocità

Il limite di velocità è **dichiarativo** sul campo `speed_limit` della nota; il nome del
simbolo resta un fallback. `speedLimitOfNote(note)` ritorna prima `note.speed_limit`, poi lo
legge dalle icone:

- `speed_limit: 30` ⇒ 30 km/h; `speed_limit: 0` ⇒ limite **annullato**;
- (fallback icone) `S03_30km` ⇒ 30 km/h (pattern `^S\d{2}_(\d{1,3})km`); `S99_end` ⇒ 0.

---

## 7. Tipi di strada

`road_type_in` / `road_type_out` (e il `road_type` dei vettori di incrocio) usano un
identificatore 0–4 ([roadbook-core.js:39](../public/assets/js/roadbook-core.js#L39)):

| id  | Tipo                  | Resa                                       |
|-----|-----------------------|--------------------------------------------|
| `0` | Default               | neutro, tratto medio                       |
| `1` | Autostrada / asfalto veloce | continuo, tratto più largo           |
| `2` | Asfalto               | continuo, tratto largo                     |
| `3` | Pista / sterrato      | continuo, tratto medio (default fuoristrada) |
| `4` | Off-piste             | **tratteggiato**, tratto più sottile       |

La vignetta di una nota è un *tulip*: la strada da cui si arriva entra sempre dal bordo
inferiore al centro del box (disegnata secondo `road_type_in`), la strada su cui si esce va
dal centro a una freccia in alto (secondo `road_type_out`), e i vettori di incrocio si
diramano dal centro. Lo spessore del tratto è indicativo del tipo di strada.

---

## 8. Vettori di incrocio (`junctions`)

Oltre al testo, una nota può disegnare l'incrocio stesso: uno o più vettori sullo stesso
box 230 × 162. Ogni vettore va da un `pivot` a un `tip` (punta della freccia), colorato per
tipo di strada e disegnato con uno spessore `width`.

| Campo       | Tipo    | Significato                                       |
|-------------|---------|---------------------------------------------------|
| `pivot`     | [x, y]  | Inizio del vettore (unità di riferimento, +y in alto). |
| `tip`       | [x, y]  | Punta / freccia del vettore.                      |
| `width`     | number  | Spessore del tratto.                              |
| `road_type` | 0–4     | Tipo di strada → colore del vettore.              |

```jsonc
"junctions": [
  { "pivot": [0, 0], "tip": [45, 25], "width": 3, "road_type": 3 },
  { "pivot": [0, 0], "tip": [-30, 40], "width": 2, "road_type": 4 }
]
```

Il valore è `null` quando la nota non disegna incroci espliciti.

---

## 9. Cosa NON contiene

- **Le foto non sono nel `.rdbk`.** Le foto geotaggate sono una **funzione dell'app**: sono
  memorizzate lato server, mai incorporate nel file. Un `.rdbk` resta un documento di sola
  navigazione (traccia + note + simboli).
- **Nessun dato personale** nel file né nel token risultato (vedi sotto).
- Niente tempi GPS per-punto nel modello `notes`: il logging GPX live è separato (lo
  produce il `gpxDocument`, [roadbook-core.js:303](../public/assets/js/roadbook-core.js#L303)).

---

## 10. Token risultato (opzionale, per gli eventi)

Quando un roadbook è seguito in gara, un reader può emettere un **token risultato a
larghezza fissa di 49 caratteri** (adatto a un QR), una sequenza di campi numerici con
zero-padding e senza dati personali: `team`(3) · `date`(6, DDMMYY) · `start`(6, HHMMSS) ·
`end`(6, HHMMSS) · `accuracy`(4) · `skip`(4) · `extra`(4) · `cap`(4) · `speed`(4) ·
`km`(5, deci-km) · `avg`(3, deci-km/h). Può essere suffissato con `-<sig>`, un HMAC
troncato sul token, per evidenza di manomissione tra reader e giudice. Il dettaglio del
modello di punteggio è in [ranking-model.md](ranking-model.md).

---

## 11. Esempio completo (minimo)

```jsonc
{
  "meta": { "title": "Demo loop", "total_distance": 1210, "note_count": 2,
            "author": "Alex Driver", "organization": "Rally Club", "modified": "2026-06-09",
            "logo": "data:image/png;base64,iVBORw0KGgo…" },
  "track": [
    { "lat": 45.8271, "lon": 9.4116 },
    { "lat": 45.8290, "lon": 9.4135 },
    { "lat": 45.8305, "lon": 9.4150 }
  ],
  "notes": [
    {
      "num": 1, "idx": 0, "lat": 45.8271, "lon": 9.4116,
      "distance": 0, "partial_distance": 0, "text": "Start",
      "cap": null, "cap_distance": null, "bearing_in": 0, "bearing_out": 45,
      "road_type_in": 3, "road_type_out": 3, "icons": [], "junctions": null
    },
    {
      "num": 2, "idx": 2, "lat": 45.8305, "lon": 9.4150,
      "distance": 1210, "partial_distance": 1210, "text": "Finish",
      "cap": null, "cap_distance": null, "bearing_in": 45, "bearing_out": 0,
      "road_type_in": 3, "road_type_out": 3,
      "icons": [ { "name": "i01_arrivo.png", "pos": [0, 0], "angle": 0, "size": 40, "flip_x": false } ],
      "junctions": null
    }
  ],
  "icons": { "i01_arrivo.png": "data:image/png;base64,iVBORw0KGgoAAAANS…" }
}
```

---

## 12. Conformità

- I file sono UTF-8 JSON, estensione `.rdbk`, media type `application/x-roadbook`.
- Un **reader** conforme DEVE rendere `track` e `notes` in ordine e risolvere i simboli da
  `icons` per primi.
- Un **writer** conforme DEVE incorporare in `icons` ogni simbolo referenziato da una nota,
  così il file è autonomo.
- I campi sconosciuti DEVONO essere preservati nel round-trip e ignorati se non compresi
  (compatibilità in avanti).

---

## 13. Limiti

- **Le foto restano fuori dal file.** Un `.rdbk` condiviso senza l'app perde le foto
  geotaggate: sono una funzione server-side, non parte dello standard.
- **Il limite di velocità è una convenzione di naming, non un campo.** Vive nel nome del
  simbolo (`S03_30km`, `S99_end`); un simbolo nominato fuori dal pattern `^S\d{2}_(\d{1,3})km`
  non sarà riconosciuto come limite, e non c'è un modo dichiarativo per imporlo.
- **`road_type` ha solo 5 valori** (0–4) e codifica insieme superficie e resa grafica; non
  c'è un campo separato per attributi della strada (larghezza reale, fondo specifico).
- **`danger` è una scala 1–3** stile FIA: non rappresenta tipologie di pericolo, solo la
  gravità.
- **Il token risultato è a 49 caratteri fissi**: estensioni di gara (settori multipli,
  controlli orari, validazione per-waypoint) non ci stanno senza ridisegnare token e firma.
  Vedi i limiti del modello in [ranking-model.md](ranking-model.md#8-limiti-del-modello-attuale).
- **`cap`/`cap_distance` sono per-nota e in linea retta**: descrivono un singolo segmento a
  bussola verso la nota successiva, non una sequenza di sub-rilevamenti.
