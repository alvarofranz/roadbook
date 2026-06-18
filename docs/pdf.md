# Export PDF del roadbook (RBPdf)

Come RDBK genera un **PDF A4 stampabile** del roadbook direttamente sul dispositivo,
senza alcun server. Documento di riferimento per il modulo
[rb-pdf.js](../public/assets/js/rb-pdf.js) (`window.RBPdf`).

> Tutto avviene **lato client**: il PDF è costruito in memoria con jsPDF (vendorizzato e
> caricato pigramente) e scaricato dal browser. Il roadbook in ingresso **non viene mai
> mutato** — nessuna icona incorporata, nessun campo riscritto.

---

## 1. Scopo e collocazione

`rb-pdf.js` espone una sola funzione pubblica, `RBPdf.generate(rb, opts)`
([rb-pdf.js:168](../public/assets/js/rb-pdf.js#L168)), che produce e fa scaricare un PDF
A4 con la classica tabella roadbook in stile cartaceo: una riga per nota, con vignetta
(tulip), distanze, numero, commento e coordinate.

L'unico chiamante è l'**Editor**: il pulsante PDF (`$('exportPdf')`,
[editor.js:966](../public/editor/editor.js#L966)) ricalcola metriche e CAP, mostra un toast
"Generating PDF…" e invoca `RBPdf.generate(rb, { iconBasePath: '../assets/icons/' })`,
intercettando l'eventuale errore in un toast ([editor.js:971](../public/editor/editor.js#L971)).

```
Editor exportPdf ──▶ RBPdf.generate(rb, opts)
        │                    │
        │   ensureJsPDF()    ▼   (lazy-load jspdf.umd.min.js)
        │   resolveIcons()   ▼   (icone → data: URI, senza mutare rb)
        │   NoteCanvas.toSVG ▼   (vignetta → SVG → PNG rasterizzato)
        │   buildDoc()       ▼   (impagina A4 → doc.save(...))
        ▼
   download del file <slug>.pdf
```

---

## 2. L'API `RBPdf.generate(rb, opts)`

Funzione `async` ([rb-pdf.js:157](../public/assets/js/rb-pdf.js#L157)).

| Parametro          | Tipo   | Significato                                                        |
|--------------------|--------|-------------------------------------------------------------------|
| `rb`               | object | Il roadbook (`rb.notes`, `rb.track`, `rb.meta`, `rb.icons`).      |
| `opts.iconBasePath`| string | Cartella delle icone della palette standard. Default `'../assets/icons/'`. |

Comportamento:
- Se `rb` non ha note (`!rb.notes.length`) lancia `Error('Nothing to export.')`
  ([rb-pdf.js:158](../public/assets/js/rb-pdf.js#L158)).
- Attende `ensureJsPDF()` (vedi §3), poi risolve `basePath` da `opts.iconBasePath`
  ([rb-pdf.js:160](../public/assets/js/rb-pdf.js#L160)).
- Pre-rasterizza **tutte** le vignette in PNG (vedi §5) prima di impaginare.
- Chiama `buildDoc(...)` passando il logo da `rb.meta.logo` (o `null`)
  ([rb-pdf.js:165](../public/assets/js/rb-pdf.js#L165)).

Non restituisce nulla di utile: l'effetto è il download del file. Il nome del file è
`RB.slug(title) + '.pdf'` ([rb-pdf.js:153](../public/assets/js/rb-pdf.js#L153)).

---

## 3. Lazy-load di jsPDF

La libreria jsPDF è **vendorizzata** accanto a `rb-pdf.js` e caricata **solo al primo uso**
da `ensureJsPDF()` ([rb-pdf.js:17](../public/assets/js/rb-pdf.js#L17)).

- La directory di partenza si ricava da `document.currentScript.src`, troncato all'ultimo
  `/`: `ASSETS_DIR` ([rb-pdf.js:14-15](../public/assets/js/rb-pdf.js#L14)). Il PDF
  caricherà quindi jsPDF **dalla propria cartella**, a prescindere da dove sia montata l'app.
- Se `window.jspdf.jsPDF` esiste già, ritorna subito. Altrimenti inietta uno `<script>` che
  punta a `jspdf.umd.min.js?v=3.0.1`; il `?v=` è un cache-buster da aggiornare a mano quando
  si ri-vendorizza la libreria ([rb-pdf.js:22](../public/assets/js/rb-pdf.js#L22)).
- La `Promise` è memorizzata in `jspdfPromise` per non iniettare lo script due volte; in caso
  di errore di rete viene azzerata (così un tentativo successivo riprova) e si rigetta con
  `Error('Could not load the PDF library.')` ([rb-pdf.js:24](../public/assets/js/rb-pdf.js#L24)).

> La libreria jsPDF in sé non è documentata qui: è un artefatto di terze parti
> (`jspdf.umd.min.js`) usato come back-end di disegno vettoriale.

---

## 4. Impaginazione A4 (`buildDoc`)

`buildDoc(jsPDF, rb, tulips, logo)` ([rb-pdf.js:77](../public/assets/js/rb-pdf.js#L77))
crea il documento (`unit: 'mm', format: 'a4', compress: true`) e disegna pagina per pagina.

### Geometria della pagina (in mm)
Costanti in [rb-pdf.js:60-64](../public/assets/js/rb-pdf.js#L60):

| Costante         | Valore | Note                                                      |
|------------------|:------:|-----------------------------------------------------------|
| `PW` × `PH`      | 210×297| A4.                                                       |
| `LEFT`           | 30     | Margine sinistro ampio: bordo di **rilegatura**.          |
| `TOP`/`RIGHT`/`BOTTOM` | 20/12/12 |                                                      |
| `CW`             | 168    | Larghezza contenuto (`PW − LEFT − RIGHT`).                |
| `CB`             | 285    | Fondo contenuto (`PH − BOTTOM`).                           |
| `H1` / `H2`      | 50 / 12| Altezza intestazione: prima pagina / pagine successive.   |
| `ROWS_FIRST` / `ROWS_REST` | 4 / 6 | Righe-nota per pagina.                            |

Il numero totale di pagine è calcolato in anticipo:
`N ≤ ROWS_FIRST ? 1 : 1 + ceil((N − ROWS_FIRST) / ROWS_REST)`
([rb-pdf.js:82](../public/assets/js/rb-pdf.js#L82)).

### Intestazioni
- **Prima pagina** — `firstHeader` ([rb-pdf.js:84](../public/assets/js/rb-pdf.js#L84)):
  intestazione alta (50 mm) con, a sinistra, i due totali (km totali e numero note) in grande,
  separati da una linea verticale; al centro/destra il **logo evento** (se presente, fittato in
  60×24 mm) e sotto il **titolo** centrato; in alto a destra "Page X of Y" (etichette tradotte
  via `RBt`). Una linea orizzontale chiude l'intestazione.
- **Pagine successive** — `runHeader` ([rb-pdf.js:98](../public/assets/js/rb-pdf.js#L98)):
  intestazione sottile (12 mm) con logo piccolo a sinistra, titolo al centro, "Page X of Y" a
  destra.

Il titolo è `rb.meta.title` con fallback `'Roadbook'`; il totale è
`rb.meta.total_distance` con fallback alla `distance` dell'ultima nota
([rb-pdf.js:80-81](../public/assets/js/rb-pdf.js#L80)). I km sono formattati da
`km(m) = (m/1000).toFixed(2)` ([rb-pdf.js:65](../public/assets/js/rb-pdf.js#L65)).

Il logo è collocato da `placeLogo` ([rb-pdf.js:68](../public/assets/js/rb-pdf.js#L68)), che lo
fitta in una scatola `maxW×maxH` mantenendo le proporzioni e lo ancora per centro-x/top-y; un
logo illeggibile viene semplicemente saltato (`try/catch`).

### La riga-nota (`drawRow`)
`drawRow(n, tulip, close, x, y, h)` ([rb-pdf.js:107](../public/assets/js/rb-pdf.js#L107))
disegna una riga a **3 colonne** dentro `CW`:

| Colonna     | Largh. (mm) | Contenuto                                                     |
|-------------|:-----------:|--------------------------------------------------------------|
| distanze    | `colDist` 26 | km totale (grande, in alto) · km parziale (piccolo, in basso) · numero nota in un riquadro |
| vignetta    | `colVig` 46  | il tulip PNG, fittato e centrato (rapporto 230/162)          |
| testo       | resto (≈96)  | commento centrato su più righe + linea di base con bearing e coordinate |

Dettagli fedeli al Reader:
- Le note "vicine alla successiva" (`close`) ricevono la cella distanza colorata
  **azzurro chiaro** (`191,227,255`), come nel Reader. La soglia è: la nota successiva ha
  `partial_distance < 50` m ([rb-pdf.js:148](../public/assets/js/rb-pdf.js#L148),
  [rb-pdf.js:110](../public/assets/js/rb-pdf.js#L110)).
- Il commento è spezzato in righe con `doc.splitTextToSize` e **troncato a 4 righe**
  (`lines.slice(0, 4)`), centrato verticalmente nello spazio sopra la linea di base
  ([rb-pdf.js:131-133](../public/assets/js/rb-pdf.js#L131)).
- La linea di base mostra `bearing_out` arrotondato (es. `123°`) a sinistra e
  `lat°  lon°` a 6 decimali a destra ([rb-pdf.js:136-137](../public/assets/js/rb-pdf.js#L136)).

### Il loop di pagina
`while (i < N)` ([rb-pdf.js:141](../public/assets/js/rb-pdf.js#L141)): dalla seconda pagina in
poi aggiunge una pagina, sceglie l'intestazione giusta, calcola l'altezza riga
`rowH = (CB − top) / rows` e disegna fino a `rows` note, poi `doc.save(...)`
([rb-pdf.js:153](../public/assets/js/rb-pdf.js#L153)).

---

## 5. Come finiscono le vignette nel PDF (rasterizzazione)

Le vignette **non** sono ridisegnate come vettori in jsPDF: sono **rasterizzate** in PNG e
inserite come immagini. È l'unico modo per riportare fedelmente le icone-segnale SVG e i
marker delle frecce.

Il percorso, per ogni nota ([rb-pdf.js:163-164](../public/assets/js/rb-pdf.js#L164)):
1. `NoteCanvas.toSVG(note, resolver)` ([note-canvas.js:160](../public/assets/js/note-canvas.js#L160))
   produce la **stessa vignetta SVG** che il Reader mostra nelle sue righe.
2. `svgToPng(svgStr, scale)` ([rb-pdf.js:45](../public/assets/js/rb-pdf.js#L45)) la converte in
   PNG con sfondo bianco. Forza `width`/`height` sul tag `<svg>` a `230×162 × scale`, la
   disegna su un `<canvas>` (riempito di bianco) via un `Blob`/`Object URL`, e ritorna
   `canvas.toDataURL('image/png')`. La scala è **`3×`** ([rb-pdf.js:164](../public/assets/js/rb-pdf.js#L164)),
   ovvero ≈380 dpi sul box 230×162.

### Risoluzione delle icone
`resolveIcons(rb, basePath)` ([rb-pdf.js:34](../public/assets/js/rb-pdf.js#L34)) prepara una
mappa `nome → data: URI` per ogni icona usata dalle note, **senza mutare il roadbook**:
- Per ogni icona risolve il sorgente con `RB.iconSrc({ name }, rb, basePath)`; se è già un
  `data:` URI lo usa così com'è, altrimenti lo converte con `RB.urlToDataURL`
  ([rb-pdf.js:39-40](../public/assets/js/rb-pdf.js#L40)).
- Questo è necessario perché un SVG caricato come `<image>` renderizza **solo dati inline**,
  mai URL esterni: ogni icona deve essere un `data:` URI prima di entrare nella vignetta.

Il `resolver` passato a `NoteCanvas.toSVG` legge dalla mappa, con fallback a
`RB.iconSrc(ic, rb, basePath)` ([rb-pdf.js:162](../public/assets/js/rb-pdf.js#L162)).

---

## 6. Limiti e quirk

- **Note con tante icone/righe testo**: il commento è **troncato a 4 righe**
  ([rb-pdf.js:131](../public/assets/js/rb-pdf.js#L131)); il testo eccedente non compare nel PDF.
- **Altezza riga fissa per pagina**: 4 righe sulla prima pagina, 6 sulle successive, sempre
  con altezza uniforme `(CB − top)/rows`. Non c'è adattamento all'altezza del contenuto della
  singola nota.
- **Le foto della galleria non sono incluse**: il PDF rende solo la tabella roadbook (vignette
  + testo), coerentemente col fatto che le foto sono una feature server-side mai parte del modello.
- **CAP non ha una colonna dedicata**: l'intestazione mostra solo km totali e numero note; il
  CAP (`cap`/`cap_distance`) vive dentro la vignetta tramite `NoteCanvas`, non come colonna a sé.
- **Rasterizzazione, non vettori**: le vignette sono PNG a 3× (≈380 dpi). Ottime in stampa, ma
  non vettoriali: zoom estremi possono mostrare i pixel; il peso del file cresce col numero di note.
- **Logo illeggibile saltato in silenzio**: `placeLogo` ingoia l'errore
  ([rb-pdf.js:74](../public/assets/js/rb-pdf.js#L74)); un logo corrotto sparisce senza avviso.
- **jsPDF caricato dalla cartella di `rb-pdf.js`**: se l'asset manca o la rete fallisce,
  `generate` rigetta e l'Editor mostra un toast; nessun fallback offline oltre al retry implicito.
- **Dipende da `NoteCanvas` e `RB`**: `rb-pdf.js` presuppone che `note-canvas.js` e
  `roadbook-core.js` (per `iconSrc`, `urlToDataURL`, `slug`) siano già caricati nella pagina.
