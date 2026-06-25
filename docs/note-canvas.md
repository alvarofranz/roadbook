# NoteCanvas — l'editor e il render delle vignette

Come RDBK disegna la **vignetta** di una nota: il diagramma stile *tulip* (rally) con il
tronco della strada, i vettori di giunzione, le icone trascinabili e la gradazione di
pericolo. Documento di riferimento per il modulo
[note-canvas.js](../public/assets/js/note-canvas.js).

> Una vignetta è **icone + giunzioni su un box di riferimento 230×162**, con origine al
> **centro** e asse **+y verso l'alto**, angoli **orari** — esattamente il modello del
> formato `.rdbk`. Il modulo offre UN editor interattivo (`NoteCanvas`) e UN render
> statico di sola lettura (`NoteCanvas.toSVG`).

---

## 1. Cosa contiene il modulo

Una sola IIFE espone due superfici pubbliche più alcuni helper privati:

| Nome | Tipo | Usato da |
|------|------|----------|
| `NoteCanvas` (classe) | editor interattivo SVG | Editor |
| `NoteCanvas.toSVG(note, resolveIcon)` | render statico → stringa SVG | Reader, pagina challenge, PDF |
| `trunkSegments` · `dangerMarks` · `ROAD_STYLE` · `svg` · `r1` · `clampIconSize` | helper privati | condivisi tra editor e render |

Tutto è SVG (auto-scala). L'editor disegna esattamente la stessa geometria che poi
`toSVG` ripropone in sola lettura, perciò ciò che si vede nell'Editor è ciò che vede il
navigatore nel Reader.

> **Importabile da Node (per i test).** In coda al file
> [note-canvas.js:256](../public/assets/js/note-canvas.js#L256), `if (typeof module !== 'undefined'
> && module.exports) module.exports = window.NoteCanvas;` — un **no-op nel browser** (dove `module`
> non esiste, e resta solo il global `window.NoteCanvas`), ma nel runner Vitest esporta la classe
> così com'è. È lo stesso schema di `roadbook-core.js`
> ([roadbook-core.js:716](../public/assets/js/roadbook-core.js#L716)): nessuno step di build sul
> web, e `NoteCanvas.toSVG` diventa testabile in unità (vedi `tests/roadbook-core.test.js`, che
> importa la classe e copre il render della vignetta).

---

## 2. Il box di riferimento 230×162 e le coordinate

Il modello di una vignetta usa coordinate **centrate** (origine al centro del box, +y in
alto), mentre l'SVG ha lo `0,0` in alto a sinistra con y verso il basso. La classe tiene le
due cose separate con un `viewBox="0 0 230 162"` e due conversioni
([note-canvas.js:43](../public/assets/js/note-canvas.js#L43)):

| Funzione | Direzione | Formula |
|----------|-----------|---------|
| `toV(px, py)` | modello → viewBox | `[115 + px, 81 − py]` |
| `toM(vx, vy)` | viewBox → modello | `[vx − 115, 81 − vy]` |
| `evToV(e)` | evento pointer → viewBox | inversa di `getScreenCTM()` |

`toV`/`toM` sono l'unica fonte di verità per "+y in alto": il segno meno sulla y inverte
l'asse, il `115`/`81` è il centro (`230/2`, `162/2`). `evToV`
([note-canvas.js:46](../public/assets/js/note-canvas.js#L46)) trasforma le coordinate
schermo del puntatore in coordinate viewBox passando per la matrice inversa dell'SVG, così
il drag funziona a qualsiasi scala/zoom del contenitore.

Lo stesso schema si ripete (privato) dentro `toSVG`
([note-canvas.js:168](../public/assets/js/note-canvas.js#L168)) con `cx=W/2` (115), `cy=H/2`
(81) e un `toV` locale: i due render restano allineati perché condividono la stessa convenzione.

---

## 3. Il tronco del tulip (`trunkSegments`)

Il "tronco" è la strada disegnata sempre allo stesso modo, derivata dai campi della nota e
non modificabile a mano ([note-canvas.js:208](../public/assets/js/note-canvas.js#L208)):

- la **provenienza** entra dritta dal bordo inferiore (`cx,154`) fino al centro (`cx,cy`),
  stilizzata da `road_type_in`;
- la **strada da seguire** esce dal centro con una freccia (`marker-end`), lunga `L=63`,
  orientata sulla virata reale.

L'angolo di uscita è la **variazione di rotta** `(bearing_out − bearing_in)` normalizzata a
`0..360` ([note-canvas.js:214](../public/assets/js/note-canvas.js#L214)); `θ=0` = dritto in
su, senso **orario** come una bussola. La punta è quindi
`cx + sin(θ)·L`, `cy − cos(θ)·L` ([note-canvas.js:221](../public/assets/js/note-canvas.js#L221)),
così il diagramma mostra già la direzione da prendere (dritto = prosegui, destra = svolta a
destra…).

### Colore
- La strada da seguire è **blu** (`#3b82f6`); la provenienza è blu anch'essa **tranne sulla
  prima nota** (`note.num > 1`), perché la nota iniziale non ha una provenienza reale —
  lì il tratto in ingresso resta grigio (`#9aa4b2`)
  ([note-canvas.js:220](../public/assets/js/note-canvas.js#L220)).

### Stile per tipo di strada (`ROAD_STYLE`)
Il tronco usa una tabella di stile **propria**, indipendente dalle larghezze di
`RB.ROAD_TYPES` usate sulla mappa ([note-canvas.js:201](../public/assets/js/note-canvas.js#L201)):

| `road_type` | Resa nel tulip | width | tratteggio | doppia |
|:-----------:|----------------|:-----:|:----------:|:------:|
| 1 motorway | linea spessa **doppia** | 12 | no | sì |
| 2 asphalt | linea spessa singola | 8 | no | no |
| 3 track | linea sottile | 4 | no | no |
| 4 off-piste | linea sottile **tratteggiata** | 4 | sì | no |
| 0/altro | fallback su 3 (track) | 4 | no | no |

L'autostrada è resa "doppia" sovrapponendo una linea bianca centrale di spessore
`max(3, width·0.3)` sopra la linea spessa ([note-canvas.js:67](../public/assets/js/note-canvas.js#L67)
e [:169](../public/assets/js/note-canvas.js#L169)).

---

## 4. Le giunzioni (vettori pivot/tip/width/road_type)

Le giunzioni sono i rami che partono dal centro per indicare incroci/diramazioni da NON
prendere. Ogni giunzione è `{ pivot:[x,y], tip:[x,y], width, road_type }` in coordinate
modello. Vengono disegnate in grigio (`#9aa4b2`) con un **tick** terminale
(`marker-end="url(#vignette-box-tick)"`) e tratteggiate se il loro tipo strada è off-piste
([note-canvas.js:70](../public/assets/js/note-canvas.js#L70)).

`addJunction()` ([note-canvas.js:151](../public/assets/js/note-canvas.js#L151)) ne crea una
con default `pivot:[0,0]`, `tip:[45,25]`, ereditando `road_type` da `road_type_out` della
nota (fallback 3) e la `width` dalla tabella `RB.ROAD_TYPES` corrispondente.

Quando una giunzione è selezionata compaiono **due maniglie** di drag
([note-canvas.js:77](../public/assets/js/note-canvas.js#L77)):
- una sul **pivot**;
- una appena **oltre la punta** (spostata di 11 px lungo la direzione del vettore) così il
  dito non copre il tick mentre si trascina; lo spostamento viene poi sottratto per
  riportare il valore reale in `tip`.

La toolbar di una giunzione ([note-canvas.js:137](../public/assets/js/note-canvas.js#L137))
offre: un `<select>` per il **tipo di strada**, `−`/`+` per la **width** (clampata 1..10) e
il cestino per eliminare.

---

## 5. Le icone — drag / scale / rotate / flip

Ogni icona è `{ name, pos:[x,y], angle, size, flip_x }`. Sono trascinabili e si renderizzano
come `<image>` dentro un `<g>` ruotato attorno al loro centro
([note-canvas.js:90](../public/assets/js/note-canvas.js#L90)):

- **posizione** (`pos`): trascinando il gruppo si aggiorna `ic.pos` via `toM`
  ([note-canvas.js:97](../public/assets/js/note-canvas.js#L97));
- **rotazione** (`angle`): `transform="rotate(angle cx cy)"` — orario, di passo 15° dai
  pulsanti;
- **flip orizzontale** (`flip_x`): `translate(2·cx) scale(-1 1)` sull'`<image>`
  ([note-canvas.js:95](../public/assets/js/note-canvas.js#L95));
- **dimensione** (`size`): box quadrato `size×size` centrato.

### Ridimensionamento
Quando un'icona è selezionata si mostra un riquadro tratteggiato (ambra) e una **maniglia
d'angolo** azzurra ([note-canvas.js:102](../public/assets/js/note-canvas.js#L102)).
Trascinandola la dimensione è `clampIconSize(round(hypot(dx,dy)·√2))` — ovvero la diagonale
dal centro all'angolo, invariante rispetto alla rotazione. I pulsanti `−`/`+` in toolbar
agiscono a passi di 4 ([note-canvas.js:131](../public/assets/js/note-canvas.js#L131)).
`clampIconSize` limita la taglia a **10..120**
([note-canvas.js:232](../public/assets/js/note-canvas.js#L232)).

### Aggiunta dalla palette
Le icone arrivano in due modi:
- **click-to-add** → `addIcon(ic)` ([note-canvas.js:150](../public/assets/js/note-canvas.js#L150));
- **drag & drop** dalla palette: il `dragover`/`drop` sul contenitore legge
  `text/plain`, converte la posizione del drop in coordinate modello e chiama il callback
  registrato con `onDropIcon(cb)` ([note-canvas.js:35](../public/assets/js/note-canvas.js#L35),
  [:56](../public/assets/js/note-canvas.js#L56)).

> La **palette ricercabile** non vive in questo modulo: NoteCanvas riceve solo le icone già
> scelte (via `addIcon`/drop). La UI di ricerca/elenco è nel chiamante (l'Editor).

---

## 6. Selezione, drag e callback

- `setNote(note)` ([note-canvas.js:48](../public/assets/js/note-canvas.js#L48)) carica la
  nota, normalizza `icons` (array) e `junctions` (array o `null`), deseleziona e ridisegna.
- `select(sel)` imposta la selezione `{type:'icon'|'junctions', i}` e notifica
  `onSelect(sel)` ([note-canvas.js:121](../public/assets/js/note-canvas.js#L121)); toccare
  lo sfondo deseleziona ([note-canvas.js:32](../public/assets/js/note-canvas.js#L32)).
- `_startDrag` ([note-canvas.js:114](../public/assets/js/note-canvas.js#L114)) installa i
  listener `pointermove`/`pointerup` su `window`, ridisegna ad ogni mossa e chiama
  `onChange()` **solo al rilascio** (un singolo cambio per gesto, non per frame).

I tre callback passati al costruttore: `onChange` (qualcosa è cambiato → l'Editor salva /
ricalcola), `onSelect` (la selezione è cambiata) e `resolveIcon` (vedi §7).

---

## 7. Risoluzione delle icone (`resolveIcon`)

NoteCanvas **non sa** dove stanno i file delle icone: riceve dal chiamante un resolver
`resolveIcon(ic) → href`, con default banale `ic => ic.name`
([note-canvas.js:14](../public/assets/js/note-canvas.js#L14)). In pratica l'Editor, il
Reader e la pagina challenge passano `RB.iconSrc`, che risolve in ordine
([roadbook-core.js:368](../public/assets/js/roadbook-core.js#L368)):

1. `data:` inline nel nome → usato così com'è;
2. icona embeddata in `rb.icons[base]` (match esatto, poi case-insensitive);
3. fallback al percorso della palette standard (`assets/icons/`).

Questo è ciò che rende il render coerente sia per un `.rdbk` self-contained (icone
embeddate) sia per le note costruite dalla palette standard. `toSVG` accetta lo stesso
resolver come secondo argomento.

---

## 8. La gradazione di pericolo `!` / `!!` / `!!!`

`dangerMarks(note)` ([note-canvas.js:190](../public/assets/js/note-canvas.js#L190)) legge
`note.danger` (1..3) e produce `!`, `!!` o `!!!` (clampato a 3). Viene disegnato in **rosso**
nell'angolo in alto a sinistra **dentro il box del diagramma** (`x:8, y:40`), mai nella
colonna di testo ([note-canvas.js:88](../public/assets/js/note-canvas.js#L88) per l'editor,
[:184](../public/assets/js/note-canvas.js#L184) per `toSVG`).

> In `toSVG` i marker di pericolo portano i propri attributi di presentazione inline
> (`fill`, `font-family`, `font-weight`, `font-size`), così la stringa SVG è **autonoma** e
> resa identica fuori dal DOM (es. PDF). Nell'editor lo stesso testo prende lo stile dalla
> classe CSS `.vignette-danger`.

---

## 9. Il render statico `NoteCanvas.toSVG`

### `NoteCanvas.toSVG(note, resolveIcon)` → stringa SVG
([note-canvas.js:167](../public/assets/js/note-canvas.js#L167)) Render di sola lettura,
identico per geometria all'editor: stessi `trunkSegments`, stesse giunzioni, stesse icone,
stesso pericolo, ma come **stringa** `<svg>…</svg>` da iniettare. È quello che mostra ogni
riga `.nrow` del Reader, la pagina challenge e l'export PDF. È l'unico render statico del
modulo: la classe interattiva e questa funzione sono le sole superfici pubbliche (§1).

---

## 10. Limiti / quirk

- **Massimo 3 livelli di pericolo**: `danger` oltre 3 viene clampato; non c'è gradazione
  più fine.
- **Una sola giunzione per gesto**: le maniglie pivot/tip esistono solo quando la giunzione
  è selezionata; non c'è multi-selezione né drag di gruppo.
- **`size` clampata 10..120, `width` di giunzione 1..10**, `angle` a passi di 15° dai
  pulsanti (drag libero non disponibile per la rotazione).
- **Lo stile del tronco è fisso**: `road_type_in`/`road_type_out` determinano il disegno,
  non sono modificabili direttamente dalla vignetta (si cambiano sulla nota).
- **La prima nota perde il colore blu in ingresso** per design (nessuna provenienza reale);
  è voluto, ma può sorprendere chi confronta la nota 1 con le altre.
- **Nessuna palette qui dentro**: la ricerca/elenco icone è responsabilità del chiamante;
  NoteCanvas riceve solo nomi già scelti.
- **`toSVG` non valida la nota**: campi mancanti vengono trattati con default (`pos:[0,0]`,
  `size:32`, `angle:0`); un `name` icona non risolvibile produce un `<image>` con `href`
  rotto, non un placeholder.
