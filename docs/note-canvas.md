# NoteCanvas — l'editor e il render delle vignette

Come RDBK disegna la **vignetta** di una nota: il diagramma stile *tulip* (rally) con il
tronco della strada, i vettori di giunzione, le icone trascinabili e la gradazione di
pericolo. Documento di riferimento per il modulo
[note-canvas.js](../public/assets/js/note-canvas.js).

> Una vignetta è **simboli + giunzioni su un box di riferimento 230×162**, con origine al
> **centro** e asse **+y verso l'alto**, angoli **orari** — esattamente il modello del
> formato `.rdbk`. Il modulo offre UN editor interattivo (`NoteCanvas`) e UN render
> statico di sola lettura (`NoteCanvas.toSVG`).

---

## 1. Cosa contiene il modulo

Una sola IIFE espone due superfici pubbliche più alcuni helper privati:

| Nome | Tipo | Usato da |
|------|------|----------|
| `NoteCanvas` (classe) | editor interattivo SVG | Editor |
| `NoteCanvas.toSVG(note, resolveIcon, ctx)` | render statico → stringa SVG | Reader, pagina challenge, PDF |
| `NoteCanvas.rowsHTML(rb, opts)` | le righe "carta" del roadbook (distanze · vignetta · testo) | Reader, pagina challenge |
| `trunkRoads` · `roadMarkup` · `smoothPath` · `shownTulip` · `dangerMarks` · `svg` · `r1` · `clampIconSize` | helper privati | condivisi tra editor e render |

Tutto è SVG (auto-scala). L'editor disegna esattamente la stessa geometria che poi
`toSVG` ripropone in sola lettura, perciò ciò che si vede nell'Editor è ciò che vede il
navigatore nel Reader.

> **Importabile da Node (per i test).** In coda al file
> [note-canvas.js](../public/assets/js/note-canvas.js), `if (typeof module !== 'undefined'
> && module.exports) module.exports = window.NoteCanvas;` — un **no-op nel browser** (dove `module`
> non esiste, e resta solo il global `window.NoteCanvas`), ma nel runner Vitest esporta la classe
> così com'è. È lo stesso schema di `roadbook-core.js`
> ([roadbook-core.js](../public/assets/js/roadbook-core.js)): nessuno step di build sul
> web, e `NoteCanvas.toSVG` diventa testabile in unità (vedi `tests/roadbook-core.test.js`, che
> importa la classe e copre il render della vignetta).

---

## 2. Il box di riferimento 230×162 e le coordinate

Il modello di una vignetta usa coordinate **centrate** (origine al centro del box, +y in
alto), mentre l'SVG ha lo `0,0` in alto a sinistra con y verso il basso. La classe tiene le
due cose separate con un `viewBox="0 0 230 162"` e due conversioni
([note-canvas.js](../public/assets/js/note-canvas.js)):

| Funzione | Direzione | Formula |
|----------|-----------|---------|
| `toV(px, py)` | modello → viewBox | `[115 + px, 81 − py]` |
| `toM(vx, vy)` | viewBox → modello | `[vx − 115, 81 − vy]` |
| `evToV(e)` | evento pointer → viewBox | inversa di `getScreenCTM()` |

`toV`/`toM` sono l'unica fonte di verità per "+y in alto": il segno meno sulla y inverte
l'asse, il `115`/`81` è il centro (`230/2`, `162/2`). `evToV`
([note-canvas.js](../public/assets/js/note-canvas.js)) trasforma le coordinate
schermo del puntatore in coordinate viewBox passando per la matrice inversa dell'SVG, così
il drag funziona a qualsiasi scala/zoom del contenitore.

Lo stesso schema si ripete (privato) dentro `toSVG`
([note-canvas.js](../public/assets/js/note-canvas.js)) con `cx=W/2` (115), `cy=H/2`
(81) e un `toV` locale: i due render restano allineati perché condividono la stessa convenzione.

---

## 3. Il tronco del tulip (`trunkRoads`)

Il "tronco" è la strada derivata dalla nota e dalla traccia attorno a lei, non modificabile a
mano ([note-canvas.js](../public/assets/js/note-canvas.js)). `trunkRoads(note, ctx)` restituisce
le strade come `{ d, roadType, arrow }`, e ognuna si disegna con `roadMarkup` (§3, *Tratto per tipo
di strada*) come uno o due **`<path>`** (`d`):

- la **provenienza** entra dal bordo inferiore fino al centro (`cx,cy`), stilizzata da
  `road_type_in`;
- la **strada da seguire** esce dal centro con una freccia (`marker-end`), stilizzata da
  `road_type`.

`ctx` è **`RB.tulipContext(rb, i)`** = `{ isEnd, isFirst, shape }` — dove sta la nota nel
roadbook e la forma della strada attorno a lei ([roadbook-core.md](roadbook-core.md)). Chi
disegna lo passa sempre (`trunkRoads(note, ctx)`, `NoteCanvas.toSVG(note, resolveIcon, ctx)`,
`setNote(note, ctx)`): una chiamata sola per ogni render, così Editor, Reader, pagina pubblica,
PDF ed export OpenRally disegnano lo stesso tulip. Senza `ctx` la nota si disegna come una nota
di mezzo, a strade dritte.

- **Prima e ultima nota.** La nota di **FINE** (`isEnd`, da `RB.isEndNote`) non ha uscita
  affatto (#447): oltre l'arrivo non c'è nulla da seguire, quindi una freccia punterebbe al
  nulla; in gara quella nota è l'arco d'arrivo. La provenienza si ferma al centro, dove il punto
  di convalida segna il posto. La nota di **PARTENZA** (`isFirst`, da `RB.isFirstNote`) non ha
  provenienza (#472).

### La forma disegnata dall'autore (#945)
Ogni strada del tulip prende la forma che l'autore ha dato alla traccia attorno alla nota:
`ctx.shape` = `RB.tulipShape(rb, i, isEnd, isFirst)` = `{ entry, exit, turn }`
([roadbook-core.js](../public/assets/js/roadbook-core.js)).

- **Il segnale è la traccia stessa:** nei **30 m** su un lato della nota (prima per la strada da cui
  arrivi, dopo per quella da cui esci — lungo la traccia, fermandosi alla nota vicina) **4 o più
  punti** vogliono dire che quella strada è stata disegnata apposta, punto per punto, e il tulip la
  segue; con meno è la strada dritta classica. Per curvare una freccia si aggiungono punti sulla
  mappa (modo P); per raddrizzarla si tolgono. Un tratto fitto ma dritto resta dritto.
- Il tratto si ripulisce dal jitter (**Douglas-Peucker**, 0,5 m: i punti dell’autore restano come li ha messi), si **ruota** perché `bearing_in`
  punti in su e si **scala** perché la lunghezza lungo la strada sia quella fissa della vignetta —
  **73 px** l'ingresso, **95 px** l'uscita curva (più lunga dei 63 px dell'uscita dritta classica,
  perché la curva si legga) — ridotta attorno alla nota solo dove uscirebbe dal box, così la freccia
  resta sempre dentro, a 14 px dal bordo.
- I punti contati sono quelli **dentro il cerchio** di 30 m attorno alla nota — l'anello tratteggiato
  dell'Editor: quello che vedi dentro, conta. Una forma che tornerebbe sopra la nota (l'uscita sotto
  il centro, l'ingresso sopra) resta classica; una curva disegnata può passare accanto a un incrocio
  dell'autore (il disegno è suo). Solo l'uscita dritta automatica evita gli incroci.
- Nessun segmento troppo corto da leggere (≥ 5 px), e l'ultimo dell'uscita — dove punta la freccia —
  di almeno 14 px.

`smoothPath(pts)` fa passare per quei punti una curva liscia (Catmull-Rom come Bézier cubiche),
che finisce lungo il suo ultimo segmento — dove punta la freccia. Nel `.rdbk` non si memorizza nulla.

### La strada dritta
Senza forma (`shape.entry` `null`) l'ingresso è verticale, da
`cx,154` al centro; senza forma (`shape.exit` `null`) l'uscita, lunga `L=63`, prende l'angolo della **variazione di rotta**
`(bearing_out − bearing_in)` normalizzata a `0..360`; `θ=0` = dritto in su, senso **orario**
come una bussola. La punta è quindi `cx + sin(θ)·L`, `cy − cos(θ)·L`, così il diagramma mostra
già la direzione da prendere (dritto = prosegui, destra = svolta a destra…). L'angolo è quello dove va la strada nei suoi **primi 20 m** (`shape.turn`), non nel
primo metro (il `bearing_out` memorizzato), che su una traccia registrata è rumore GPS — un angolo
retto letto come 37°; se così passerebbe su un incrocio dell'autore, resta l'angolo memorizzato.

> I bearing arrivano dalla traccia (`RB.deriveBearings`), che **salta i vertici duplicati**: un
> vicino coincidente dava bearing 0° e quindi una freccia puntata dove capita — una nota dritta
> disegnata come svolta secca (#452, vedi [roadbook-core.md](roadbook-core.md)).

### Tratto per tipo di strada (`roadMarkup`)
`roadMarkup(roadType, d, ink, marker)` è **l'unico renderer** delle strade — tronco e giunzioni,
nell'editor e in `toSVG` — e restituisce gli attributi SVG di una strada come lista (una doppia linea
è il suo tratto più un centro bianco). Legge `RB.roadType(id)` (`RB.ROAD_TYPES`, i tratti del FIA Road
Book Lexicon): **ogni strada è larga `RB.ROAD_WIDTH` (8)**, il tipo si legge dal tratto e dal colore.

| `road_type` | Resa nel tulip | tratteggio | doppia | colore del tronco |
|:-----------:|----------------|:----------:|:------:|-------------------|
| 1 Tarmac | linea **doppia**: 8 con un centro bianco da `RB.DOUBLE_GAP` (2) | no | sì | verde `#22c55e` |
| 2 Track (default) | linea continua | no | no | `#ff5a45` |
| 3 Low-visible track | trattini lungo–corto `24 8 8 8` | sì | no | `#ff5a45` |
| 4 Off track | trattini corti `8 8` | sì | no | `#ff5a45` |
| 5 Bike lane | linea continua (#561) | no | no | viola `#532b78` |
| altro | come 2 (`RB.roadType` ricade sul default) | no | no | `#ff5a45` |

Le strade tratteggiate usano estremità `butt` (le estremità tonde a questo spessore mangerebbero i
vuoti). Il tronco prende il colore del suo tipo (`ink` assente); le giunzioni passano `ink` = grigio
`#9aa4b2` (§4). La **prima nota** non disegna provenienza affatto (`isFirst`, #472).

Le giunzioni (§4) si disegnano **prima**, sotto il tronco: dove coincidono si legge la strada da
seguire. Nel canvas interattivo il tronco ha `pointer-events: none`, così un tocco arriva comunque
alla giunzione sotto, e le maniglie della giunzione selezionata stanno sopra entrambi.

---

## 4. Le giunzioni (vettori from/to/road_type)

Le giunzioni sono i rami che partono dal centro per indicare incroci/diramazioni da NON
prendere. Ogni giunzione è `{ from:[x,y], to:[x,y], road_type }` in coordinate modello. Vengono
disegnate in grigio (`#9aa4b2`) con un **tick** terminale e il tratto del loro tipo di strada via
`roadMarkup` (§3): off track = tratteggiata, tarmac = **doppia linea**, come il tronco. Lo spessore è
quello di ogni strada: non è un campo.

`addJunction()` ne crea una con `from:[0,0]`, `to:[45,25]` e il `road_type` della nota.

Quando una giunzione è selezionata compaiono **due maniglie** di drag
([note-canvas.js](../public/assets/js/note-canvas.js)):
- una su **`from`**;
- una appena **oltre `to`** (spostata di 11 px lungo la direzione del vettore) così il
  dito non copre il tick mentre si trascina; lo spostamento viene poi sottratto per
  riportare il valore reale in `to`.

La toolbar di una giunzione ([note-canvas.js](../public/assets/js/note-canvas.js))
offre solo un `<select>` per il **tipo di strada** (i nomi di `RB.ROAD_TYPES`, tradotti) e il
cestino per eliminarla.

---

## 5. I simboli — drag / scale / rotate / flip

Ogni simbolo (`note.symbols[]`) è `{ name, position:[x,y], angle, size, mirrored }`. Sono trascinabili e si renderizzano
come `<image>` dentro un `<g>` ruotato attorno al loro centro
([note-canvas.js](../public/assets/js/note-canvas.js)):

- **posizione** (`position`): trascinando il gruppo si aggiorna `ic.position` via `toM`
  ([note-canvas.js](../public/assets/js/note-canvas.js));
- **rotazione** (`angle`): `transform="rotate(angle cx cy)"` — orario, di passo 15° dai
  pulsanti;
- **specchiatura** (`mirrored`): `translate(2·cx) scale(-1 1)` sull'`<image>`
  ([note-canvas.js](../public/assets/js/note-canvas.js));
- **dimensione** (`size`): box quadrato `size×size` centrato.

### Ridimensionamento
Quando un'icona è selezionata si mostra un riquadro tratteggiato (ambra) e una **maniglia
d'angolo** azzurra ([note-canvas.js](../public/assets/js/note-canvas.js)).
Trascinandola la dimensione è `clampIconSize(round(hypot(dx,dy)·√2))` — ovvero la diagonale
dal centro all'angolo, invariante rispetto alla rotazione. I pulsanti `−`/`+` in toolbar
agiscono a passi di 4 ([note-canvas.js](../public/assets/js/note-canvas.js)).
`clampIconSize` limita la taglia a **10..120**
([note-canvas.js](../public/assets/js/note-canvas.js)).

### Aggiunta dalla palette
Le icone arrivano in due modi:
- **click-to-add** → `addIcon(ic)` ([note-canvas.js](../public/assets/js/note-canvas.js));
- **drag & drop** dalla palette: il `dragover`/`drop` sul contenitore legge
  `text/plain`, converte la posizione del drop in coordinate modello e chiama il callback
  registrato con `onDropIcon(cb)` ([note-canvas.js](../public/assets/js/note-canvas.js)).

> La **palette ricercabile** non vive in questo modulo: NoteCanvas riceve solo le icone già
> scelte (via `addIcon`/drop). La UI di ricerca/elenco è nel chiamante (l'Editor).

---

## 6. Selezione, drag e callback

- `setNote(note, ctx)` ([note-canvas.js](../public/assets/js/note-canvas.js)) carica la
  nota con il suo `ctx` (`RB.tulipContext`, §3), deseleziona e ridisegna. La nota arriva già nella
  forma in memoria (`RB.readRoadbook`/`RB.blankNote`: `symbols` e `junctions` sempre array).
- `select(sel)` imposta la selezione `{type:'icon'|'junctions', i}` e ridisegna (con la
  toolbar dell'elemento selezionato); toccare lo sfondo deseleziona
  ([note-canvas.js](../public/assets/js/note-canvas.js)).
- `_startDrag` installa i listener `pointermove`/`pointerup` su `window`. Il modello si
  aggiorna a ogni `pointermove` (posizione finale esatta), ma il rebuild dell'SVG è
  **accorpato a un render per frame** via `requestAnimationFrame` — un `render()` per
  animation frame invece che per mossa. `onChange()` è chiamato **solo al rilascio** (un
  singolo cambio per gesto).

Le opzioni del costruttore: `toolbarEl` (l'elemento, fuori dal canvas, che ospita la toolbar
dell'elemento selezionato — obbligatorio), `onChange` (qualcosa è cambiato → l'Editor salva /
ricalcola), `resolveIcon` (vedi §7) e `missingIcon` (il segnaposto di un nome che non si
risolve, #521).

---

## 7. Risoluzione dei simboli (`resolveIcon`)

NoteCanvas **non sa** dove stanno le immagini dei simboli: riceve dal chiamante un resolver
`resolveIcon(ic) → href`, con default banale `ic => ic.name`
([note-canvas.js](../public/assets/js/note-canvas.js)). In pratica l'Editor, il Reader e la pagina
challenge passano `RB.symbolSrc(ic, rb, basePath)` ([roadbook-core.js](../public/assets/js/roadbook-core.js)):
la libreria del roadbook (`rb.symbols[name]`) — dove sta ogni simbolo di un `.rdbk` — altrimenti,
mentre un simbolo della palette non è ancora incorporato, la palette standard sotto `basePath`
(`assets/icons/`). `toSVG` accetta lo stesso resolver come secondo argomento.

---

## 8. La gradazione di pericolo `!` / `!!` / `!!!`

`dangerMarks(note)` ([note-canvas.js](../public/assets/js/note-canvas.js)) legge
`note.danger` (1..3) e produce `!`, `!!` o `!!!` (clampato a 3). Viene disegnato in **rosso**
nell'angolo in alto a sinistra **dentro il box del diagramma** (`x:8, y:40`), mai nella
colonna di testo, sia nell'editor sia in `toSVG`.

> In `toSVG` i marker di pericolo portano i propri attributi di presentazione inline
> (`fill`, `font-family`, `font-weight`, `font-size`), così la stringa SVG è **autonoma** e
> resa identica fuori dal DOM (es. PDF). Nell'editor lo stesso testo prende lo stile dalla
> classe CSS `.vignette-danger`.

---

## 9. Il render statico `NoteCanvas.toSVG`

### `NoteCanvas.toSVG(note, resolveIcon, ctx)` → stringa SVG
Render di sola lettura, identico per geometria all'editor: stessi `trunkRoads` con lo stesso
`ctx = RB.tulipContext(rb, i)` (la forma reale della traccia, niente provenienza sulla prima nota
e niente uscita sull'ultima, #945/#447/#472), stesse giunzioni, stesse icone, stesso pericolo, ma
come **stringa** `<svg>…</svg>` da iniettare. È quello che mostra ogni riga `.nrow` del Reader e
della pagina challenge (via `NoteCanvas.rowsHTML`), l'export PDF e l'export OpenRally. È l'unico
render statico del modulo: la classe interattiva e questa funzione sono le sole superfici
pubbliche (§1).

### Il tulip importato (`imported_tulip`, #943)
Una nota importata (es. da OpenRally) conserva il suo **tulip originale**: un'immagine opaca che
**è** l'intera vignetta, salvata sulla nota come `imported_tulip = { image: data URI, shown }` (nel
file `shown` compare solo come `false`). L'originale non si cancella mai; con `shown: false` si
mostra il tulip dell'editor (tronco, giunzioni, simboli).

- `shownTulip(note)` → l'immagine, **solo se è mostrata**: quando c'è, `toSVG` la rende da sola a
  tutto box — niente tronco/giunzioni/pericolo generati, perché il disegno importato li incorpora
  già — e il `render()` dell'editor fa lo stesso: niente da selezionare né trascinare.
- Il toggle dell'Editor inverte `imported_tulip.shown` (vedi [editor.md](editor.md)).

La scelta (originale o tulip dell'editor) viaggia nel roadbook, quindi Reader, pagina pubblica, PDF
ed export OpenRally mostrano quella stessa.

---

## 10. Limiti / quirk

- **Massimo 3 livelli di pericolo**: `danger` oltre 3 viene clampato; non c'è gradazione
  più fine.
- **Una sola giunzione per gesto**: le maniglie from/to esistono solo quando la giunzione
  è selezionata; non c'è multi-selezione né drag di gruppo.
- **`size` clampata 10..120**, `angle` a passi di 15° dai
  pulsanti (drag libero non disponibile per la rotazione).
- **Il tronco non si edita dalla vignetta**: `road_type_in`/`road_type` ne determinano lo
  stile (si cambiano sulla nota) e la traccia ne determina la forma (si cambia sulla mappa).
- **La prima nota non ha strada in ingresso** per design (nessuna provenienza reale);
  è voluto, ma può sorprendere chi confronta la nota 1 con le altre.
- **Nessuna palette qui dentro**: la ricerca/elenco simboli è responsabilità del chiamante;
  NoteCanvas riceve solo nomi già scelti.
- **`toSVG` non valida la nota**: la validazione è di `RB.validateRoadbook`; `toSVG` tratta i campi
  opzionali mancanti con default (`size:32`, `angle:0`, niente incroci né simboli); un `name` non risolvibile produce un `<image>` con `href`
  rotto, non un placeholder.
