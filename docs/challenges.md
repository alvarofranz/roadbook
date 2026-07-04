# Public Challenges RDBK

Come RDBK pubblica, scopre e apre le **sfide pubbliche** (public challenges): roadbook
condivisi dagli utenti e serviti dal database via l'API PHP. Documento di riferimento per il
modulo front-end `RBChallenges` ([challenges.js](../public/assets/js/challenges.js)) e per la
pagina pubblica della singola sfida.

> Una "challenge" non è un formato a parte: è semplicemente un `.rdbk` salvato nel profilo di
> un utente e reso **pubblico**. Il lato front-end qui documentato si limita a leggerlo;
> il dettaglio del backend (tabelle, slug, visibilità, foto) è nella documentazione dell'API.

---

## 1. Scopo

Le challenge danno a un roadbook salvato un **URL condivisibile e amichevole** e una pagina di
presentazione pubblica. Da lì si può:

- scoprirla nella **gallery** della home e in `/roadbooks/` (senza login);
- **navigarla** nel Reader (`/reader/<slug>`) — **richiede login** (#146);
- esportarne il **PDF**;
- **forkarla** nell'Editor (`/editor/<slug>`) solo se il proprietario l'ha marcata
  *riusabile* (flag `reusable`, #106).

**Lettura dietro login (#146)**: leggere il contenuto di un roadbook pubblico (la pagina
`/challenge/<slug>` e il Reader) richiede di essere autenticati — a un visitatore anonimo la
pagina mostra `RBNeedAuth` invece del roadbook. La gallery/elenco resta pubblica.

---

## 2. Il modulo `RBChallenges`

Un'unica IIFE ([challenges.js](../public/assets/js/challenges.js)) che espone il global
`window.RBChallenges` ([challenges.js:40](../public/assets/js/challenges.js#L40)). La radice
dell'app (`ROOT`) è derivata **dall'URL dello script stesso**
([challenges.js:5-6](../public/assets/js/challenges.js#L5)), così funziona sia dalla home sia
dalle sottocartelle dei tool senza percorsi hard-coded.

| Metodo | Cosa fa | Endpoint API |
|--------|---------|--------------|
| `listPublic(opts)` | Elenco dei roadbook pubblici per gallery e picker; con `{reusable:true}` filtra ai soli riusabili (la ricerca-fork dell'Editor) | `api/index.php?action=public_list[&reusable=1]` |
| `loadPublic(slug)` | Carica un singolo roadbook pubblico (roadbook + foto + owner + `reusable`) | `api/index.php?action=public_get&slug=…` |
| `pick(onPick, opts)` | Apre il picker modale e richiama `onPick(roadbook, slug)`; passa `opts` a `listPublic` | (usa `listPublic`/`loadPublic`) |
| `publicFromUrl()` | Estrae lo slug dall'URL amichevole corrente | — |
| `ROOT` | Radice dell'app, riusata altrove (es. home, gallery) | — |

### `listPublic()`
([challenges.js:8-11](../public/assets/js/challenges.js#L8)) — `fetch` GET su `public_list`,
ritorna `j.roadbooks` o `[]`. **Inghiotte ogni errore** (rete o JSON) tornando lista vuota: i
chiamanti mostrano solo lo stato "nessuna sfida", senza distinguere il guasto.

### `loadPublic(slug)`
([challenges.js:12-16](../public/assets/js/challenges.js#L12)) — `fetch` GET su `public_get`
con lo slug url-encoded. A differenza di `listPublic`, qui un `j.ok` falso **lancia**
(`throw new Error(j.error || 'Not found')`), così i chiamanti possono mostrare un messaggio di
errore. Ritorna l'oggetto grezzo dell'API: `{ slug, roadbook, photos, owner, ... }`.

### `publicFromUrl()`
([challenges.js:18-21](../public/assets/js/challenges.js#L18)) — vedi §4.

> Tutte le chiamate di rete usano `fetch` diretto, **non** il wrapper `RBApi` (che fa POST
> JSON). Le challenge sono GET di sola lettura, quindi `RBApi` non serve.

---

## 3. Il picker

`pick(onPick)` ([challenges.js:24-38](../public/assets/js/challenges.js#L24)) è il selettore
condiviso "apri una sfida pubblica nel tool corrente". Flusso:

1. apre subito un `RBModal` `wide` con uno stato di caricamento;
2. chiama `listPublic()` e **riscrive** l'`innerHTML` della `.modal-card` con le righe;
3. ogni riga è un `<button class="challenge-row">` con thumbnail (o placeholder
   `fa-map-location-dot`), titolo, `@username` e il riassunto `RBSummary(total_distance,
   note_count)` (`app.js`, formato "X.X km · N notes");
4. al click di una riga chiude il modale, fa `loadPublic(slug)` e invoca
   `onPick(j.roadbook, slug)`.

Chi lo usa e con quale intento:

- **Reader** ([reader.js:42](../public/reader/reader.js#L42)): `pick((r) => loadRb(r))` —
  apre la sfida per navigarla.
- **Editor** ([editor.js:313](../public/editor/editor.js#L313)):
  `pick((r) => { resetIdentity(); setRoadbook(r); })` — il fork **azzera l'identità** e parte
  come roadbook NUOVO (il salvataggio ne creerà uno proprio).

> Tutti i campi di testo passano per `RBesc` prima di finire nell'HTML; le righe sono
> costruite via `innerHTML`, quindi `RBesc` è l'unica barriera contro l'injection.

---

## 4. Gli URL amichevoli

`publicFromUrl()` ([challenges.js:18-21](../public/assets/js/challenges.js#L18)) ricava lo
slug dal `location.pathname` corrente con la regex:

```js
/\/(?:reader|editor)\/([A-Za-z0-9_-]+)\/?$/
```

Riconosce **solo** `/reader/<slug>` e `/editor/<slug>` (con barra finale opzionale); lo slug
ammette lettere, cifre, `_` e `-`. Ritorna lo slug o `null`.

Chi lo usa all'avvio della pagina:

- **Reader** ([reader.js:60-61](../public/reader/reader.js#L60)): se presente uno slug e non
  c'è una sessione da riprendere, fa `loadPublic` e `loadRb(j.roadbook)`.
- **Editor**: se presente uno slug, forka via `resetIdentity()` (azzera `currentRbId`, rimette lo
  stato a `draft`) e `setRoadbook(j.roadbook)`, quindi un salvataggio crea un roadbook nuovo invece
  di sovrascrivere l'originale.

> La pagina `/challenge/<slug>` **non** usa `publicFromUrl`: ricava lo slug da sé (vedi §5),
> perché quella regex matcha solo `reader`/`editor`.

---

## 5. La pagina della challenge (`/challenge/<slug>`)

`public/challenge/index.html` + `public/challenge/challenge.js` — la vetrina pubblica di una
singola sfida. Usa percorsi **assoluti** `/assets/…`
([index.html:57-65](../public/challenge/index.html#L57)), diversamente dai tool a un livello
di profondità. Oltre al core la pagina carica anche **maplibre-gl**, `config.js` e `rbmap.js`
([index.html:57-61](../public/challenge/index.html#L57)) per la mappa di anteprima (vedi sotto).

### Risoluzione dello slug
([challenge.js:7-9](../public/challenge/challenge.js#L7)) — prima il query param `?s=`, poi
l'ultimo segmento del path (`/challenge/<slug>`). Se manca o è `challenge`, mostra
"Challenge not found." e si ferma.

### Cosa mostra
Caricato `loadPublic(slug)` ([challenge.js:11](../public/challenge/challenge.js#L11)),
popola:

- **titolo** + `document.title`, **owner** (nome o `@username`) e avatar (rimosso se assente);
- una riga **meta**: `@username · RBSummary(…)`, eventuale badge di stato (`🔒 Ready`/`Draft`
  per un roadbook non ancora pubblico servito via evento), e il credito dichiarato nel
  roadbook (`author · organization · modified`);
- **logo evento** (`meta.logo`, data URI embedded) inserito prima del titolo se presente
  ([challenge.js:25](../public/challenge/challenge.js#L25));
- **descrizione** e una **gallery di foto** (le foto sono una feature server-side, mai dentro
  il `.rdbk`) come link che aprono l'immagine a piena risoluzione
  ([challenge.js:30-32](../public/challenge/challenge.js#L30));
- una **mappa di anteprima** in cima (vedi sotto);
- la **tabella delle note** nel layout canonico bianco "paper" del Reader, in sola lettura.

### La mappa di anteprima
([challenge.js:48-55](../public/challenge/challenge.js#L48)) — sopra la tabella, la pagina
mostra il tracciato con i marker numerati delle note via `RBMap.showRoadbook(rb)`, su tile
gratuite `RBMap.STYLE_TOPO` (nessuna chiave). **Toccare un marker** scrolla alla riga della
nota corrispondente (`map.onWaypoint(i)` → `chNotes.children[i].scrollIntoView`). Il container
`#chMap` parte `hidden`: viene mostrato e poi `resize`-ato perché era appena reso visibile.

La mappa compare **solo** quando entrambe le condizioni sono vere:

- il roadbook **consente la mappa**: `meta.map_access !== false` — un roadbook che la nasconde
  (es. una gara che tiene segreto il percorso) non mostra alcuna anteprima;
- c'è una **traccia reale** (`rb.track.length >= 2`); senza percorso vero la mappa è saltata.

### Le note via `NoteCanvas`
([challenge.js:36-43](../public/challenge/challenge.js#L36)) — ogni nota è una `.nrow readonly`
a 3 colonne (la 4ª colonna dei bottoni/stato del Reader qui non c'è):

- **distanza**: totale + parziale (`fkm`, metri → km a 2 decimali) + numero nota;
- **vignetta**: `NoteCanvas.toSVG(n, iconSrc)` — lo stesso render statico usato dalle righe del
  Reader;
- **testo**: testo nota, eventuale `CAP <gradi>° · <km>` e le coordinate.

Gli alias delle icone si risolvono con
`RB.iconSrc(ic, rb, '/assets/icons/')` ([challenge.js:33](../public/challenge/challenge.js#L33)),
rispettando la regola self-contained del formato (inline → `rb.icons` → palette standard).

### I bottoni d'azione
Per tutti:

- **Navigate** → `href = /reader/<slug>` (apre nel Reader, previo login #146);
- **Export PDF** → genera il PDF client-side (jsPDF).

**Nessun bottone Fork per i non proprietari**: un roadbook pubblico si legge, si naviga e si
esporta in PDF, ma non si forka né si scarica il `.rdbk`. Il fork nell'Editor
(`/editor/<slug>`) esiste solo per i roadbook che il proprietario ha reso **riusabili**
(`reusable`, #106): il picker-fork dell'Editor elenca solo quelli e `/editor/<slug>` rifiuta un
pubblico non riusabile con "This public roadbook cannot be copied.".

Se l'API segnala `is_owner`, compare invece **Edit** → `/editor/?rb=<id>`, che apre
direttamente il roadbook posseduto.

In caso di errore di `loadPublic`, mostra "This challenge does not exist or is private.".

---

## 6. La gallery della home

`home.js` ([home.js](../public/assets/js/home.js)) riusa `RBChallenges`: chiama `listPublic()`
e disegna le card con l'helper condiviso `RBGalleryCard`, ognuna linkata a
`${ROOT}challenge/<slug>`. Cache la lista in `cards` così un cambio lingua (`rb-lang`)
ri-renderizza senza rifetchare.

---

## 7. Limiti e quirk

- **`listPublic` nasconde gli errori**: rete giù e "nessuna sfida pubblica" sono
  indistinguibili per l'utente (sempre lista vuota).
- **Due risolutori di slug diversi**: la regex di `publicFromUrl` copre solo `reader`/`editor`;
  la pagina challenge ha la sua logica `?s=` / ultimo-segmento. Sono due percorsi separati da
  tenere allineati a mano.
- **Render via `innerHTML`**: picker e pagina costruiscono markup per concatenazione; la
  sicurezza dipende interamente dal passaggio disciplinato per `RBesc`. Un campo nuovo che
  dimentichi `RBesc` è una falla.
- **Fork solo se riusabile**: aprire `/editor/<slug>` funziona solo per un pubblico marcato
  `reusable` e azzera sempre identità e id (roadbook nuovo); un pubblico non riusabile viene
  rifiutato. Non esiste un "modifica l'originale" se non sei l'owner (in quel caso il link
  diventa `/editor/?rb=<id>`).
- **Nessun caching lato modulo** oltre a quello della home: il picker rifetcha `listPublic` a
  ogni apertura, e Reader/Editor rifetchano `loadPublic` a ogni avvio da URL.
- Il dettaglio di **come uno slug diventa pubblico** (creazione, visibilità, generazione dello
  slug, storage delle foto) è interamente backend e qui non è coperto: vedi la documentazione
  dell'API PHP.
