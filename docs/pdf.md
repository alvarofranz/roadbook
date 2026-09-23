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
([rb-pdf.js](../public/assets/js/rb-pdf.js)), che produce e fa scaricare un PDF
A4 con la classica tabella roadbook in stile cartaceo: una riga per nota, con vignetta
(tulip), distanze, numero, commento e coordinate.

I chiamanti sono due:

- l'**Editor** — `exportPdf` ([editor.js](../public/editor/editor.js)) ricalcola
  metriche e CAP, mostra un toast "Generating PDF…" e invoca
  `RBPdf.generate(rb, { iconBasePath: '../assets/icons/' })`, intercettando l'errore in un toast;
- la **pagina pubblica del roadbook** (`/challenge/<slug>`) — il pulsante `$('chPdf')`
  ([challenge.js](../public/challenge/challenge.js)) fa lo stesso con
  `iconBasePath: '/assets/icons/'`. È l'unico modo di "portarsi via" un roadbook pubblico:
  chi non ne è proprietario non può né forkarlo né scaricare il `.rdbk`.

Il PDF è quindi generabile anche **da chi non è autenticato**. Chi chiama passa `opts.link`,
l'URL assoluto (`RBPublicLink`) della pagina da cui il PDF rimanda alla sua versione digitale: la
pagina pubblica del roadbook se è pubblico, altrimenti — dalla pagina `/challenge` aperta da un
evento — la pagina dell'evento; senza link il PDF finisce con l'ultima nota (vedi §4).

```
Editor / challenge ──▶ RBPdf.generate(rb, opts)
        │                    │
        │   ensureJsPDF()    ▼   (lazy-load jspdf.umd.min.js)
        │   resolveIcons()   ▼   (icone → data: URI, senza mutare rb)
        │   NoteCanvas.toSVG ▼   (vignetta → SVG → PNG rasterizzato)
        │   buildDoc()       ▼   (impagina A4 → il documento)
        ▼
   app: foglio di sistema (RBShareFile) · web: download di <slug>.pdf
```

---

## 2. L'API `RBPdf.generate(rb, opts)`

Funzione `async` ([rb-pdf.js](../public/assets/js/rb-pdf.js)).

| Parametro          | Tipo   | Significato                                                        |
|--------------------|--------|-------------------------------------------------------------------|
| `rb`               | object | Il roadbook (`rb.notes`, `rb.track`, `rb.meta`, `rb.icons`).      |
| `opts.iconBasePath`| string | Cartella delle icone della palette standard. Default `'../assets/icons/'`. |

Comportamento:
- Se `rb` non ha note (`!rb.notes.length`) lancia `Error('Nothing to export.')`
  ([rb-pdf.js](../public/assets/js/rb-pdf.js)).
- Attende `ensureJsPDF()` (vedi §3), poi risolve `basePath` da `opts.iconBasePath`
  ([rb-pdf.js](../public/assets/js/rb-pdf.js)).
- Pre-rasterizza **tutte** le vignette in PNG (vedi §5) prima di impaginare.
- Chiama `buildDoc(...)` passando il logo da `rb.meta.logo` (o `null`)
  ([rb-pdf.js](../public/assets/js/rb-pdf.js)).

Non restituisce nulla di utile: nell'app il PDF si apre nel **foglio di sistema** (`RBShareFile`: anteprima, apri in…, salva in File, invia), perché un download dentro la WebView non si vede da nessuna parte (#904); sul web si scarica. Il nome del file è
`RB.slug(title) + '.pdf'` ([rb-pdf.js](../public/assets/js/rb-pdf.js)).

---

## 3. Lazy-load di jsPDF

La libreria jsPDF è **vendorizzata** accanto a `rb-pdf.js` e caricata **solo al primo uso**
da `ensureJsPDF()` ([rb-pdf.js](../public/assets/js/rb-pdf.js)).

- La directory di partenza si ricava da `document.currentScript.src`, troncato all'ultimo
  `/`: `ASSETS_DIR` ([rb-pdf.js](../public/assets/js/rb-pdf.js)). Il PDF
  caricherà quindi jsPDF **dalla propria cartella**, a prescindere da dove sia montata l'app.
- Se `window.jspdf.jsPDF` esiste già, ritorna subito. Altrimenti inietta uno `<script>` che
  punta a `jspdf.umd.min.js?v=3.0.1`; il `?v=` è un cache-buster da aggiornare a mano quando
  si ri-vendorizza la libreria ([rb-pdf.js](../public/assets/js/rb-pdf.js)).
- La `Promise` è memorizzata in `jspdfPromise` per non iniettare lo script due volte; in caso
  di errore di rete viene azzerata (così un tentativo successivo riprova) e si rigetta con
  `Error('Could not load the PDF library.')` ([rb-pdf.js](../public/assets/js/rb-pdf.js)).

> La libreria jsPDF in sé non è documentata qui: è un artefatto di terze parti
> (`jspdf.umd.min.js`) usato come back-end di disegno vettoriale.

---

## 4. Impaginazione A4 (`buildDoc`)

`buildDoc(jsPDF, rb, tulips, logo, username)` ([rb-pdf.js](../public/assets/js/rb-pdf.js))
crea il documento (`unit: 'mm', format: 'a4', compress: true`) e disegna pagina per pagina.

### Geometria della pagina (in mm)
Costanti in [rb-pdf.js](../public/assets/js/rb-pdf.js):

| Costante         | Valore | Note                                                      |
|------------------|:------:|-----------------------------------------------------------|
| `PW` × `PH`      | 210×297| A4.                                                       |
| `LEFT`           | 30     | Margine sinistro ampio: bordo di **rilegatura**.          |
| `TOP`/`RIGHT`/`BOTTOM` | 20/12/12 |                                                      |
| `CW`             | 168    | Larghezza contenuto (`PW − LEFT − RIGHT`).                |
| `CB`             | 285    | Fondo contenuto (`PH − BOTTOM`).                           |
| `HEADER_H`       | 18     | Altezza dell'intestazione, identica su ogni pagina.       |
| `ROWS`           | 6      | Righe per pagina, la prima compresa.                      |

Il numero di pagine-tabella è `ceil(righe / ROWS)` (`paginate`), più la copertina.

### Intestazione (#810)
Una sola intestazione, `header`, uguale su **ogni** pagina-tabella — la prima non ha un'intestazione
propria: a sinistra il **QR** verso la versione digitale del roadbook (quando c'è un `opts.link`),
disegnato a quadratini vettoriali dalla matrice di `RBQr.matrix` — nitido in stampa; al centro il
**titolo** (`rb.meta.title`, fallback `'Roadbook'`, rimpicciolito finché entra); a destra
"Page X of Y" (etichette tradotte via `RBt`). **Nessuna linea sotto**: la tabella ha già il suo bordo.
I km sono formattati da `km(m) = (m/1000).toFixed(2)`.

### Copertina, niente footer, niente chiusura (#784 · #810)

La **copertina** — `drawCover` — è centrata su una pagina simmetrica (non si rilega): titolo
(max 2 righe), descrizione (max 3), il **percorso** disegnato come vettore (`drawRoute`:
equirettangolare con la longitudine scalata per cos(lat), su un riquadro chiaro, pallino verde alla
partenza e scuro all'arrivo — saltato se il roadbook nasconde la mappa, `map_access:false`), poi tre
colonne **distanza · note · data** e la riga autore · organizzazione. Nient'altro. L'immagine del
roadbook (`meta.logo`) non compare come immagine: è lo **sfondo del riquadro del percorso**
(`drawBackdrop` — riempie il riquadro, ritagliata ai suoi angoli arrotondati, sotto un velo color
carta al 86 %), così resta solo una traccia di colore dietro la linea.

Le pagine-tabella **non hanno footer** e dopo l'ultima nota **non c'è nulla**: niente "generato da",
niente nome del file, niente blocco finale. `paginate(count)` (pura, esportata per Node e coperta da
`tests/pdf.test.js`) divide le righe a gruppi di `ROWS`. `qrcode.min.js` e `rb-qr.js` si caricano su
richiesta, come jsPDF, solo quando c'è un link.

### La riga-nota (`drawRow`)
`drawRow(n, tulip, close, x, y, h)` ([rb-pdf.js](../public/assets/js/rb-pdf.js))
disegna una riga a **3 colonne** dentro `CW`:

| Colonna     | Largh. (mm) | Contenuto                                                     |
|-------------|:-----------:|--------------------------------------------------------------|
| distanze    | `colDist` 26 | km totale (grande, in alto) · km parziale (piccolo, in basso) · numero nota in un riquadro |
| vignetta    | `colVig` 46  | il tulip PNG, fittato e centrato (rapporto 230/162)          |
| testo       | resto (≈96)  | commento centrato su più righe + linea di base con bearing e coordinate |

Dettagli fedeli al Reader:
- Le note "vicine alla successiva" (`close`) ricevono la cella distanza colorata
  **azzurro chiaro** (`191,227,255`), come nel Reader. La soglia è: la nota successiva ha
  `partial_distance < 50` m ([rb-pdf.js](../public/assets/js/rb-pdf.js)).
- Il commento è spezzato in righe con `doc.splitTextToSize` e **troncato a 4 righe**
  (`lines.slice(0, 4)`), centrato verticalmente nello spazio sopra la linea di base
  ([rb-pdf.js](../public/assets/js/rb-pdf.js)).
- La linea di base mostra `bearing_out` arrotondato (es. `123°`) a sinistra e
  `lat°  lon°` a 6 decimali a destra ([rb-pdf.js](../public/assets/js/rb-pdf.js)).

### Il loop di pagina
`while (i < N)` ([rb-pdf.js](../public/assets/js/rb-pdf.js)): dalla seconda pagina in
poi aggiunge una pagina, sceglie l'intestazione giusta, calcola l'altezza riga
`rowH = (CB − top) / rows` e disegna fino a `rows` note, poi `generate` consegna il documento
([rb-pdf.js](../public/assets/js/rb-pdf.js)).

---

## 5. Come finiscono le vignette nel PDF (rasterizzazione)

Le vignette **non** sono ridisegnate come vettori in jsPDF: sono **rasterizzate** in PNG e
inserite come immagini. È l'unico modo per riportare fedelmente le icone-segnale SVG e i
marker delle frecce.

Il percorso, per ogni nota ([rb-pdf.js](../public/assets/js/rb-pdf.js)):
1. `NoteCanvas.toSVG(note, resolver)` ([note-canvas.js](../public/assets/js/note-canvas.js))
   produce la **stessa vignetta SVG** che il Reader mostra nelle sue righe.
2. `svgToPng(svgStr, scale)` ([rb-pdf.js](../public/assets/js/rb-pdf.js)) la converte in
   PNG con sfondo bianco. Forza `width`/`height` sul tag `<svg>` a `230×162 × scale`, la
   disegna su un `<canvas>` (riempito di bianco) via un `Blob`/`Object URL`, e ritorna
   `canvas.toDataURL('image/png')`. La scala è **`3×`** ([rb-pdf.js](../public/assets/js/rb-pdf.js)),
   ovvero ≈380 dpi sul box 230×162.

### Risoluzione delle icone
`resolveIcons(rb, basePath)` ([rb-pdf.js](../public/assets/js/rb-pdf.js)) prepara una
mappa `nome → data: URI` per ogni icona usata dalle note, **senza mutare il roadbook**:
- Per ogni icona risolve il sorgente con `RB.iconSrc({ name }, rb, basePath)`; se è già un
  `data:` URI lo usa così com'è, altrimenti lo converte con `RB.urlToDataURL`
  ([rb-pdf.js](../public/assets/js/rb-pdf.js)).
- Questo è necessario perché un SVG caricato come `<image>` renderizza **solo dati inline**,
  mai URL esterni: ogni icona deve essere un `data:` URI prima di entrare nella vignetta.

Il `resolver` passato a `NoteCanvas.toSVG` legge dalla mappa, con fallback a
`RB.iconSrc(ic, rb, basePath)` ([rb-pdf.js](../public/assets/js/rb-pdf.js)).

---

## 6. Limiti e quirk

- **Note con tante icone/righe testo**: il commento è **troncato a 4 righe**
  ([rb-pdf.js](../public/assets/js/rb-pdf.js)); il testo eccedente non compare nel PDF.
- **Altezza riga fissa per pagina**: 6 righe per pagina, sempre con altezza uniforme `(CB − top)/rows`. Non c'è adattamento all'altezza del contenuto della
  singola nota.
- **Le foto della galleria non sono incluse**: il PDF rende solo la tabella roadbook (vignette
  + testo), coerentemente col fatto che le foto sono una feature server-side mai parte del modello.
- **CAP non ha una colonna dedicata**: il
  CAP (`cap`/`cap_distance`) vive dentro la vignetta tramite `NoteCanvas`, non come colonna a sé.
- **Rasterizzazione, non vettori**: le vignette sono PNG a 3× (≈380 dpi). Ottime in stampa, ma
  non vettoriali: zoom estremi possono mostrare i pixel; il peso del file cresce col numero di note.
- **Immagine illeggibile saltata in silenzio**: `drawBackdrop` ingoia l'errore; un'immagine
  corrotta lascia il riquadro del percorso semplice, senza avviso.
- **jsPDF caricato dalla cartella di `rb-pdf.js`**: se l'asset manca o la rete fallisce,
  `generate` rigetta e la pagina chiamante mostra un toast; nessun fallback offline oltre al retry implicito.
- **Dipende da `NoteCanvas`, `RB`, `RBt` e `RBConfig`**: `rb-pdf.js` presuppone che
  `note-canvas.js`, `roadbook-core.js` (per `iconSrc`, `urlToDataURL`, `slug`), `i18n.js` e
  `app.js` siano già caricati nella pagina. Entrambe le pagine chiamanti li caricano tutti, e i global
  sono letti solo al momento della generazione, non al load del modulo.
