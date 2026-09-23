# RBMap — helper della mappa

`RBMap` è il wrapper attorno a **MapLibre GL** condiviso da due tool: l'**Editor**
(editing completo del roadbook sulla mappa) e il **Reader** (la mini-mappa interattiva
per-nota). Disegna la traccia + i waypoint, gestisce la registrazione live, i pin foto,
un marker di edit trascinabile, l'editing dei vertici della traccia e un toggle tra
sfondo satellite e topografico. Documento di riferimento per l'API pubblica e i suoi
limiti.

> **Tile gratuite, senza chiave.** Il modulo usa [MapLibre GL](https://maplibre.org/) con tre
> stili raster: il **satellite** è ESRI World Imagery (`RASTER_SATELLITE`), il **topo** è
> OpenTopoMap, con curve di livello e ombreggiatura (`RASTER_TOPO`), **OSM** è la mappa standard
> di OpenStreetMap (`RASTER_OSM`); OpenFreeMap serve i glyph/font e il rilievo 3D viene dalle tile
> Terrarium di AWS. Nessun token in `config.js`: `RB_CONFIG.styleSatellite` / `styleTopo` /
> `styleOsm` sostituiscono uno stile con quello di un provider a licenza.

---

## 1. Costruzione e inizializzazione

`new RBMap(containerId, opts)` costruisce la mappa sul `<div>` con quell'id
([rbmap.js](../public/assets/js/rbmap.js)).

- `opts.layerToggle` è un'opzione **nostra**, non di MapLibre: viene estratta e il resto
  di `opts` passa pari pari al costruttore `maplibregl.Map`
  ([rbmap.js](../public/assets/js/rbmap.js)).
- Default: stile **satellite**, centro `[-3.6, 37.178]`, zoom 12, controllo di
  attribuzione attivo ([rbmap.js](../public/assets/js/rbmap.js)).
- Controlli aggiunti d'ufficio: `NavigationControl` (con `visualizePitch`) in alto a
  destra, `ScaleControl` metrica, e — se `layerToggle` — il bottone di toggle stile (§7).
  `layerToggle` è `true` oppure `{ short, remember }`: `remember: '<chiave>'` legge lo stile
  salvato in `localStorage` sotto quella chiave **prima** di creare la mappa (che apre così
  sull'ultima scelta) e lo riscrive a ogni cambio di stile.

### Degrado robusto (mai uccidere la pagina)
- Se **MapLibre non è caricato**, il container mostra "Map unavailable." e il costruttore
  esce ([rbmap.js](../public/assets/js/rbmap.js)).
- Se **non c'è WebGL**, il `try/catch` cattura l'errore, mostra "Map unavailable (WebGL)."
  e lascia `this.map = null` ([rbmap.js](../public/assets/js/rbmap.js)).
- Per questo **ogni metodo pubblico controlla `this.map`** prima di agire: su un
  dispositivo senza mappa le chiamate sono no-op silenziose.

### Il ciclo `ready` e la coda di attesa
La mappa diventa utilizzabile solo all'evento `load`. Fino ad allora `this.ready` è
`false`. Conseguenze ([rbmap.js](../public/assets/js/rbmap.js)):

- Una `showRoadbook()` chiamata **prima** del load viene messa in coda (`this._pending`)
  e ridisegnata al load ([rbmap.js](../public/assets/js/rbmap.js)).
- I metodi che richiedono i layer (`setPosition`, `setLiveTrack`, `setPhotos`,
  `setOverlay`, `select`, `_paintVerts`) richiedono **sia** `this.map` **sia**
  `this.ready` e altrimenti escono senza fare nulla.
- Al load la mappa fa `resize()` e **ripristina quello che le era già stato detto**: ultima
  selezione, ultima posizione (`_lastPos` → `_replayPosition`) e ultima guida. Senza il replay
  della posizione una mappa course-up che aveva ricevuto il suo unico fix mentre caricava si
  apriva col nord in alto e senza chevron (#536); lo stesso ripristino avviene dopo uno scambio
  di stile base.

### I listener registrati una sola volta
I listener legati ai **layer** (click/hover su waypoint, foto, vertici) e il drag dei
vertici sono registrati **una volta** nel costruttore
([rbmap.js](../public/assets/js/rbmap.js)). Sono pensati per **sopravvivere agli
swap di stile**: ri-registrarli a ogni `setStyle` li farebbe scattare doppio. Restano
inerti finché i rispettivi callback (`_onWpt`, `_onPhoto`, `_vertOnDrag`) non vengono
armati dai metodi pubblici.

---

## 2. I layer disegnati (`_init`)

`_init()` crea tutte le source/layer GeoJSON, inizialmente vuote
([rbmap.js](../public/assets/js/rbmap.js)). Viene chiamato al primo `load` **e a
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
([rbmap.js](../public/assets/js/rbmap.js)). È in un `try/catch`: offline il terreno
semplicemente non c'è. `_terrain()` gira di nuovo a ogni cambio di stile, quindi **non**
registra listener: quello su `sourcedata` che, a DEM caricato e mappa `idle`, rifà giudicare
ai marker DOM se il rilievo li copre (#741) è registrato **una volta** nel costruttore (gli
eventi della mappa sopravvivono a `setStyle`).

---

## 3. Disegnare la traccia + i waypoint (`showRoadbook`)

`showRoadbook(rb, noFit, gapIdx)` è il metodo principale di rendering
([rbmap.js](../public/assets/js/rbmap.js)).

- Memorizza `rb` e `gapIdx` (`_lastRb`/`_lastGaps`) così uno swap di stile può ridisegnare.
- **`gapIdx`** (uso Editor): lista di indici nella traccia il cui segmento successivo è un
  **taglio aperto**. La traccia viene spezzata in pezzi a quei punti e disegnata come
  `MultiLineString`; i buchi diventano segmenti tratteggiati su `rb-gap`
  ([rbmap.js](../public/assets/js/rbmap.js)).
- I waypoint vengono ridisegnati da `rb.notes`, ognuno con `num` (numero nota) e `i`
  (indice nell'array) nelle proprietà del feature.
- `noFit` salta l'inquadratura automatica; altrimenti `_fit(rb)` fa `fitBounds`
  sull'estensione della traccia con padding 40
  ([rbmap.js](../public/assets/js/rbmap.js)).

### Selezione di una nota
- `select(note, noEase)` disegna l'alone su `rb-sel` e, se non `noEase`, fa `easeTo` sulla
  nota ([rbmap.js](../public/assets/js/rbmap.js)). Ricorda `_lastSel` per
  ri-evidenziare dopo uno swap.
- `onWaypoint(cb)` registra il callback chiamato al click su un waypoint: riceve l'indice
  intero della nota ([rbmap.js](../public/assets/js/rbmap.js), listener a
  [rbmap.js](../public/assets/js/rbmap.js)).

---

## 4. Registrazione live (`setLiveTrack`)

`setLiveTrack(pts, wpts, photos)` ridisegna la traccia che cresce durante la registrazione
GPS ([rbmap.js](../public/assets/js/rbmap.js)).

- `pts` → la traccia come `LineString` (riusa la source `rb-track`).
- `wpts` (opzionale) → i waypoint istantanei, numerati `i+1`.
- `photos` (opzionale) → delega a `setPhotos`.

Metodi correlati:
- **`setPosition(lat, lon, follow[, heading])`** — il marker "sei qui"; `follow=true`
  ricentra con `easeTo`. Con un `heading` (rotta in gradi) il puntino diventa un chevron
  direzionale (`.rb-pos-arrow`) e — se l'heading-up è attivo — la mappa ruota in modo che la
  marcia sia in alto, col chevron fisso dritto in alto sullo schermo (`rotationAlignment:
  'viewport'`, #565); a nord bloccato il chevron è ancorato alla mappa e mostra la rotta. Senza `heading` resta il puntino tondo
  (es. l'Editor) ([rbmap.js](../public/assets/js/rbmap.js)).
- **`headingUp()`** / **`setHeadingUp(on)`** — legge / imposta heading-up ↔ nord bloccato (off →
  torna a nord); l'opzione costruttore **`{headingToggle:true}`** aggiunge il bottone di controllo.
  Il Recorder usa il proprio pulsante nella griglia di cattura.
- **`setOverlay(pts)`** — overlay verde su `rb-live` per una sub-traccia "adjust on the
  trail" in corso, mantenendo visibile la traccia base; memorizzato (`_lastOverlay`) e
  ridipinto da `_replay()` dopo un cambio di stile (#788)
  ([rbmap.js](../public/assets/js/rbmap.js)).

---

## 5. Pin foto (`setPhotos`)

`setPhotos(photos, onClick)` disegna i pin foto geolocalizzati su `rb-photos`
([rbmap.js](../public/assets/js/rbmap.js)).

- Filtra le foto con `lat != null` (le foto senza posizione non hanno pin).
- L'intero oggetto foto viene serializzato JSON nella proprietà `d` del feature, così il
  listener di click lo può riconsegnare al callback `onClick(photo)`
  ([rbmap.js](../public/assets/js/rbmap.js)).
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
  disegna o si taglia) ([rbmap.js](../public/assets/js/rbmap.js)).
- **`setPin(pt)`** mette un singolo marker sabbia (seed di disegno / ancora di taglio);
  `null` lo toglie ([rbmap.js](../public/assets/js/rbmap.js)).

---

## 7. Toggle layer satellite ↔ topo ↔ OSM

- **`setBaseStyle(styleUrl, onReady)`** — cambia lo stile base. Poiché MapLibre **azzera
  ogni source/layer custom** su `setStyle`, mette `ready=false`, attende `style.load`, poi
  rifà `_init()` + `_terrain()` e richiama `onReady`
  ([rbmap.js](../public/assets/js/rbmap.js)).
- **`toggleBaseStyle()`** — cicla satellite→topo→OSM→satellite e **ridipinge** l'ultimo
  roadbook + selezione nel callback `onReady`
  ([rbmap.js](../public/assets/js/rbmap.js)).
- Il bottone di toggle (`layerToggle`) è un piccolo controllo MapLibre
  (`button.rb-mapctl-layers`) che mostra lo stile corrente sotto l'icona
  (`<span class="rb-map-style-label">`): il nome intero (`Satellite · Topo · OSM`, titolo
  `RBt('Map style')`: *nome*) oppure, con `short: true`, un codice compatto
  (`SAT · TOPO · OSM`) che entra in un bottone da 34 px, col titolo che nomina le tre mappe
  (l'Editor, #700). Titolo e `aria-label` sono la stessa stringa tradotta, riscritta in
  `update()` a ogni cambio di stile e di lingua (`rb-lang`).
- `RBMap.STYLE_TOPO` è esposto per le mappe che aprono sul topografico invece del satellite
  (account, admin, eventi, pagina pubblica).

`_mapLayer` (index 0-2) traccia quale stile è attualmente vivo
([rbmap.js](../public/assets/js/rbmap.js)).

### Distruzione
`destroy()` smonta il contesto GL (`map.remove()`); il Reader chiude così la mappa inline
per-nota ([rbmap.js](../public/assets/js/rbmap.js)).

---

## 8. Chi lo usa

| Consumatore | Uso |
|-------------|-----|
| **Editor**  | editing completo: `showRoadbook` con `gapIdx`, `setVertexEditor`/`setWaypointEditor`/`refreshVertices`, `setPin`/`setCursor`, `setLiveTrack`/`setOverlay` per la registrazione e l'adjust, toggle stile di RBMap con `layerToggle: { short: true, remember: 'rb_map_style' }`. |
| **Reader**  | mini-mappa interattiva per-nota: costruita con `{layerToggle:true, geolocate:true, headingToggle:true}`, `showRoadbook` + `select`, `setPosition(..., follow=true, heading)` a ogni fix — **tu al centro, la mappa girata sulla tua rotta** (#536) — `setGuide` per la freccia corta che punta alla nota (#890), `destroy` alla chiusura. |

---

## 9. Limiti e quirk

- **Tile di terzi, online.** I tre stili vengono da server pubblici gratuiti (ESRI, OpenTopoMap,
  OpenStreetMap) con i loro limiti d'uso, e la mappa non funziona senza rete; un provider a licenza
  si imposta con `RB_CONFIG.styleSatellite` / `styleTopo` / `styleOsm`.
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
