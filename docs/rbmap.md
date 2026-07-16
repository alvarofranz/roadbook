# RBMap — helper della mappa

`RBMap` è il wrapper attorno a **MapLibre GL** condiviso da due tool: l'**Editor**
(editing completo del roadbook sulla mappa) e il **Reader** (la mini-mappa interattiva
per-nota). Disegna la traccia + i waypoint, gestisce la registrazione live, i pin foto,
un marker di edit trascinabile, l'editing dei vertici della traccia e un toggle tra
sfondo satellite e topografico. Documento di riferimento per l'API pubblica e i suoi
limiti.

> **Non è Mapbox.** Nonostante il nome storico, il modulo usa
> [MapLibre GL](https://maplibre.org/) con tile **gratuite, senza chiave**: il **topo** è
> CyclOSM (`RASTER_TOPO`), il **satellite** è ESRI World Imagery (`RASTER_SATELLITE`),
> **OSM** è OpenFreeMap standard (`RASTER_OSM`); OpenFreeMap serve anche i glyph/font.
> Non serve un token in `config.js` per la mappa di base; una chiave MapTiler eventuale
> migliora solo il satellite.

---

## 1. Costruzione e inizializzazione

`new RBMap(containerId, opts)` costruisce la mappa sul `<div>` con quell'id
([rbmap.js:13](../public/assets/js/rbmap.js#L13)).

- `opts.layerToggle` è un'opzione **nostra**, non di MapLibre: viene estratta e il resto
  di `opts` passa pari pari al costruttore `maplibregl.Map`
  ([rbmap.js:15](../public/assets/js/rbmap.js#L15)).
- Default: stile **satellite**, centro `[-3.6, 37.178]`, zoom 12, controllo di
  attribuzione attivo ([rbmap.js:22](../public/assets/js/rbmap.js#L22)).
- Controlli aggiunti d'ufficio: `NavigationControl` (con `visualizePitch`) in alto a
  destra, `ScaleControl` metrica, e — se `layerToggle:true` — il bottone di toggle stile
  ([rbmap.js:32-34](../public/assets/js/rbmap.js#L32)).

### Degrado robusto (mai uccidere la pagina)
- Se **MapLibre non è caricato**, il container mostra "Map unavailable." e il costruttore
  esce ([rbmap.js:17](../public/assets/js/rbmap.js#L17)).
- Se **non c'è WebGL**, il `try/catch` cattura l'errore, mostra "Map unavailable (WebGL)."
  e lascia `this.map = null` ([rbmap.js:26](../public/assets/js/rbmap.js#L26)).
- Per questo **ogni metodo pubblico controlla `this.map`** prima di agire: su un
  dispositivo senza mappa le chiamate sono no-op silenziose.

### Il ciclo `ready` e la coda di attesa
La mappa diventa utilizzabile solo all'evento `load`. Fino ad allora `this.ready` è
`false`. Conseguenze ([rbmap.js:59](../public/assets/js/rbmap.js#L59)):

- Una `showRoadbook()` chiamata **prima** del load viene messa in coda (`this._pending`)
  e ridisegnata al load ([rbmap.js:135](../public/assets/js/rbmap.js#L135)).
- I metodi che richiedono i layer (`setPosition`, `setLiveTrack`, `setPhotos`,
  `setOverlay`, `select`, `_paintVerts`) richiedono **sia** `this.map` **sia**
  `this.ready` e altrimenti escono senza fare nulla.
- Al load la mappa fa `resize()` e ripristina l'ultima selezione.

### I listener registrati una sola volta
I listener legati ai **layer** (click/hover su waypoint, foto, vertici) e il drag dei
vertici sono registrati **una volta** nel costruttore
([rbmap.js:35-58](../public/assets/js/rbmap.js#L35)). Sono pensati per **sopravvivere agli
swap di stile**: ri-registrarli a ogni `setStyle` li farebbe scattare doppio. Restano
inerti finché i rispettivi callback (`_onWpt`, `_onPhoto`, `_vertOnDrag`) non vengono
armati dai metodi pubblici.

---

## 2. I layer disegnati (`_init`)

`_init()` crea tutte le source/layer GeoJSON, inizialmente vuote
([rbmap.js:93](../public/assets/js/rbmap.js#L93)). Viene chiamato al primo `load` **e a
ogni swap di stile** (MapLibre azzera source e layer custom su `setStyle`).

| Source / Layer | Tipo | Cosa rappresenta | Colore |
|----------------|------|------------------|--------|
| `rb-track`     | line | la traccia del roadbook (`MultiLineString` se ci sono tagli) | rosso `#ff5a45` |
| `rb-gap`       | line dashed | i connettori dei **tagli aperti** (buchi non riempiti, Editor) | sabbia `#e8b059` |
| `rb-sel`       | circle | l'alone della nota **selezionata** | sabbia translucido |
| `rb-wpts` / `rb-wpts-l` | circle + symbol | i waypoint + l'etichetta col numero nota | **blu `#3b82f6`** / testo bianco |
| `rb-live`      | line | la sub-traccia "adjust" / registrazione in overlay | verde `#3ad29f` |
| `rb-photos` / `rb-photos-i` | circle + symbol | i pin foto + l'etichetta testuale **`IMG`** | blu `#3a8dff` |
| `rb-pos`       | circle | il puntino "sei qui" | azzurro `#5aa9ff` |
| `rb-verts`     | circle | le maniglie dei vertici (move-points tool) | bianco bordo rosso |
| `rb-vsel`      | circle | l'anello del vertice **selezionato** | arancione |

I layer waypoint (`rb-wpts`/`rb-wpts-l`) vengono portati in cima con `moveLayer` dopo gli
altri add (incluso `rb-vsel`), così i marker restano afferrabili.

### Rilievo 3D (`_terrain`)
`_terrain()` aggiunge una source `raster-dem` da tile Terrarium AWS (gratis, senza
chiave), imposta il terreno con esagerazione 1.3 e alza il max pitch a 80°
([rbmap.js:84](../public/assets/js/rbmap.js#L84)). È in un `try/catch`: offline il terreno
semplicemente non c'è.

---

## 3. Disegnare la traccia + i waypoint (`showRoadbook`)

`showRoadbook(rb, noFit, gapIdx)` è il metodo principale di rendering
([rbmap.js:132](../public/assets/js/rbmap.js#L132)).

- Memorizza `rb` e `gapIdx` (`_lastRb`/`_lastGaps`) così uno swap di stile può ridisegnare.
- **`gapIdx`** (uso Editor): lista di indici nella traccia il cui segmento successivo è un
  **taglio aperto**. La traccia viene spezzata in pezzi a quei punti e disegnata come
  `MultiLineString`; i buchi diventano segmenti tratteggiati su `rb-gap`
  ([rbmap.js:137-144](../public/assets/js/rbmap.js#L137)).
- I waypoint vengono ridisegnati da `rb.notes`, ognuno con `num` (numero nota) e `i`
  (indice nell'array) nelle proprietà del feature.
- `noFit` salta l'inquadratura automatica; altrimenti `_fit(rb)` fa `fitBounds`
  sull'estensione della traccia con padding 40
  ([rbmap.js:181](../public/assets/js/rbmap.js#L181)).

### Selezione di una nota
- `select(note, noEase)` disegna l'alone su `rb-sel` e, se non `noEase`, fa `easeTo` sulla
  nota ([rbmap.js:175](../public/assets/js/rbmap.js#L175)). Ricorda `_lastSel` per
  ri-evidenziare dopo uno swap.
- `onWaypoint(cb)` registra il callback chiamato al click su un waypoint: riceve l'indice
  intero della nota ([rbmap.js:186](../public/assets/js/rbmap.js#L186), listener a
  [rbmap.js:37](../public/assets/js/rbmap.js#L37)).

---

## 4. Registrazione live (`setLiveTrack`)

`setLiveTrack(pts, wpts, photos)` ridisegna la traccia che cresce durante la registrazione
GPS ([rbmap.js:152](../public/assets/js/rbmap.js#L152)).

- `pts` → la traccia come `LineString` (riusa la source `rb-track`).
- `wpts` (opzionale) → i waypoint istantanei, numerati `i+1`.
- `photos` (opzionale) → delega a `setPhotos`.

Metodi correlati:
- **`setPosition(lat, lon, follow[, heading])`** — il marker "sei qui"; `follow=true`
  ricentra con `easeTo`. Con un `heading` (rotta in gradi) il puntino diventa un chevron
  direzionale (`.rb-pos-arrow`, `rotationAlignment:'map'`) e — se l'heading-up è attivo —
  la mappa ruota in modo che la marcia sia in alto. Senza `heading` resta il puntino tondo
  (es. l'Editor) ([rbmap.js:152](../public/assets/js/rbmap.js#L152)).
- **`setHeadingUp(on)`** + opzione costruttore **`{headingToggle:true}`** — bottone di
  controllo che alterna heading-up ↔ nord bloccato (off → torna a nord). Usato dal Recorder.
- **`setOverlay(pts)`** — overlay verde su `rb-live` per una sub-traccia "adjust on the
  trail" in corso, mantenendo visibile la traccia base
  ([rbmap.js:171](../public/assets/js/rbmap.js#L171)).

---

## 5. Pin foto (`setPhotos`)

`setPhotos(photos, onClick)` disegna i pin foto geolocalizzati su `rb-photos`
([rbmap.js:162](../public/assets/js/rbmap.js#L162)).

- Filtra le foto con `lat != null` (le foto senza posizione non hanno pin).
- L'intero oggetto foto viene serializzato JSON nella proprietà `d` del feature, così il
  listener di click lo può riconsegnare al callback `onClick(photo)`
  ([rbmap.js:38](../public/assets/js/rbmap.js#L38)).
- `onClick` si registra solo se passato; poi resta memorizzato in `_onPhoto`.

---

## 6. Trascinamento di vertici e note (tool Move)

Nel tool **Move** (`points`) sia i punti traccia sia le **note** (waypoint) sono
trascinabili. Il vecchio marker rosso pan-only è stato rimosso (#61): la nota si sposta
trascinando direttamente il suo marker blu, esattamente come un punto traccia.

### Vertici traccia e note (move-points tool)
- **`setVertexEditor(track, onDrag, onCommit, onSelect)`** — arma/disarma lo strumento: con
  `track` + callback mostra ogni vertice come maniglia trascinabile; `onSelect(i)` scatta sul
  **tap** (senza drag) di un vertice; con `null` azzera tutto.
- `onDrag(i, lat, lon)` scatta **live** mentre si trascina il vertice `i`; `onCommit()` al
  rilascio. La logica di drag (disabilita il pan, cambia cursore) è nei listener registrati
  una sola volta; armare/disarmare gli editor azzera anche i flag di drag, così un flag
  residuo non ingoia il tap successivo su un marker.
- **`showVertices(track)`** mostra i puntini vertice in sola lettura (senza drag/select),
  **`setSelectedVertex(pt)`** disegna l'anello arancione del vertice selezionato.
- **`setWaypointEditor(onDrag, onCommit)`** — arma/disarma il drag delle **note** (layer
  `rb-wpts`): `onDrag(noteIndex, lat, lon)` live, `onCommit()` al rilascio. L'Editor sposta
  il vertice traccia sotto la nota, così la linea la segue (la nota è mobile come un trk, #61).
- **`setCursor(cursor)`** imposta il cursore base della mappa (es. crosshair mentre si
  disegna o si taglia) ([rbmap.js:117](../public/assets/js/rbmap.js#L117)).
- **`setPin(pt)`** mette un singolo marker sabbia (seed di disegno / ancora di taglio);
  `null` lo toglie ([rbmap.js:119](../public/assets/js/rbmap.js#L119)).

---

## 7. Toggle layer satellite ↔ topo ↔ OSM

- **`setBaseStyle(styleUrl, onReady)`** — cambia lo stile base. Poiché MapLibre **azzera
  ogni source/layer custom** su `setStyle`, mette `ready=false`, attende `style.load`, poi
  rifà `_init()` + `_terrain()` e richiama `onReady`
  ([rbmap.js:64](../public/assets/js/rbmap.js#L64)).
- **`toggleBaseStyle()`** — cicla satellite→topo→OSM→satellite e **ridipinge** l'ultimo
  roadbook + selezione nel callback `onReady`
  ([rbmap.js:74](../public/assets/js/rbmap.js#L74)).
- Il bottone di toggle (`{layerToggle:true}`) è un piccolo controllo MapLibre che mostra
  il nome dello stile corrente sotto l'icona (`<span class="rb-map-style-label">`),
  titolo tradotto via `RBt('Map style')`
  ([rbmap.js:216](../public/assets/js/rbmap.js#L216)).
- Gli URL canonici degli stili sono esposti come `RBMap.STYLE_SATELLITE` /
  `RBMap.STYLE_TOPO` / `RBMap.STYLE_OSM` così l'Editor può riusare il proprio toggle
  ([rbmap.js:234](../public/assets/js/rbmap.js#L234)).

`_mapLayer` (index 0-2) traccia quale stile è attualmente vivo
([rbmap.js:31](../public/assets/js/rbmap.js#L31)).

### Distruzione
`destroy()` smonta il contesto GL (`map.remove()`); il Reader chiude così la mappa inline
per-nota ([rbmap.js:81](../public/assets/js/rbmap.js#L81)).

---

## 8. Chi lo usa

| Consumatore | Uso |
|-------------|-----|
| **Editor**  | editing completo: `showRoadbook` con `gapIdx`, `setVertexEditor`/`setWaypointEditor`/`refreshVertices`, `setPin`/`setCursor`, `setLiveTrack`/`setOverlay` per la registrazione e l'adjust, toggle stile proprio via `RBMap.STYLE_*`. |
| **Reader**  | mini-mappa interattiva per-nota: costruita con `{layerToggle:true}` per avere il toggle gratis, `showRoadbook` + `select`, `setPosition` per il "sei qui", `destroy` alla chiusura. |

---

## 9. Limiti e quirk

- **Non è Mapbox.** Il nome `RBMap` e i riferimenti storici a "Mapbox" sono obsoleti: il
  codice usa MapLibre GL con tile senza chiave (satellite ESRI World Imagery, topo CyclOSM).
  Una chiave MapTiler eventuale in `RB_CONFIG` migliora solo il satellite.
- **Source condivisa traccia.** `setLiveTrack` e `showRoadbook` scrivono **entrambi** su
  `rb-track`: live usa un `LineString`, il roadbook un `MultiLineString`. Sono modalità
  mutuamente esclusive sulla stessa source, non sovrapponibili.
- **Tutto si appoggia a tile/glyph esterni gratuiti** (ESRI World Imagery, CyclOSM,
  OpenFreeMap per i font): offline o se il servizio è giù, la mappa degrada senza errori ma
  senza dati.
- **Coda a un solo elemento.** Solo `showRoadbook` è messa in coda prima del `ready`; gli
  altri metodi (posizione, foto, overlay, selezione) chiamati troppo presto sono no-op
  silenziosi e vanno richiamati dopo il load.
- **Pulizia manuale dei marker DOM.** `setPin` usa `maplibregl.Marker`
  (nodi DOM), non layer GeoJSON: vanno rimossi esplicitamente (passando `null`) — non
  spariscono da soli a uno swap di stile come fanno invece le source.
