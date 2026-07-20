# Roadbook Recorder — Registrare una traccia GPS live

Il **Recorder** è lo strumento da usare **sul campo**. Registra la traccia GPS e ti permette di arricchirla con waypoint, foto geotaggate e note vocali. Il risultato è un draft che passa all'Editor per la creazione del roadbook definitivo.

> Funziona **offline** al 100% per GPS + waypoint + media. I media restano in coda locale finché non c'è rete. Serve connessione solo per: login iniziale, upload differito, salvataggio sul profilo.

---

## Sequenza completa: dall'apertura al salvataggio

### 1. Apri il Recorder

Apri il **Recorder** dal menu principale o vai direttamente su `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Vedrai la schermata iniziale con il pulsante **Start recording**. Se non sei loggato, compare un avviso: *"Foto e audio richiedono login"* — puoi registrare lo stesso, ma i media resteranno solo sul device.

---

### 2. Avvia una nuova registrazione

Tocca **Start recording**.

> ![Nome sessione](../assets/screenshots/rec02.jpg)

Si apre un modal per il **nome** della sessione (default: data/ora `YYYY-MM-DD HH-MM`). Puoi cambiarlo. Tocca **Conferma**.

---

### 3. Dashboard live — la registrazione è in corso

La dashboard live mostra tutti i dati in tempo reale:

> ![Dashboard registrazione](../assets/screenshots/rec03a.jpg)

| Elemento | Cosa vedi |
|----------|-----------|
| **Tempo** | Durata della registrazione (escluso pause) |
| **Velocità** | Velocità istantanea + massima |
| **Waypoint** | Contatore waypoint piazzati |
| **Distanza** | Km percorsi |
| **Mappa** | Mappa heading-up (marcia in alto) con traccia e waypoint |

> La mappa è **heading-up** di default — la direzione di marcia è sempre verso l'alto. Tocca il controllo in alto a destra per bloccare a Nord.

---

### 4. Arricchisci la traccia durante il percorso

Durante la registrazione hai a disposizione 4 pulsanti:

| Pulsante | Azione | Come si usa |
|----------|--------|-------------|
| **⏸ Pause** | Sospende GPS e cronometro | Tocca per mettere in pausa (soste, attese). Riprendi con lo stesso pulsante |
| **📍 Waypoint** | Crea un waypoint alla posizione GPS attuale | Tocca → scrivi il testo (auto-chiude 5 s). Usa il mic per dettare |
| **🎤 WP audio** | Registra clip vocale | **Tieni premuto** per registrare. Rilascia → countdown 5→0 → salva. Su desktop trascrive automaticamente |
| **📷 WP Foto** | Scatta foto geotag | Apre la fotocamera posteriore. La foto viene agganciata alla posizione GPS attuale |

> ![Pulsanti waypoint e media](../assets/screenshots/rec04a.jpg)

> **Consiglio**: usa **Waypoint** per riferimenti scritti (incroci, pericoli, cambi di strada), **WP audio** per note lunghe mentre guidi, **WP Foto** per segnali e punti visivi.

---

### 5. Mappa live

> ![Mappa live](../assets/screenshots/rec05.jpg)

- La traccia è una **linea continua**
- I waypoint sono **pallini blu numerati**
- Le foto hanno un **pin 📷**
- Il tuo marker GPS diventa un **chevron** direzionale quando sei in movimento
- Tocca un waypoint/foto → info e azioni (elimina, modifica testo)

---

### 6. Fine registrazione

Tocca **Finish** per terminare la registrazione.

> ![Riepilogo registrazione](../assets/screenshots/rec06a.jpeg)

Si apre il modal di riepilogo con i dati della sessione: punti percorso, km, waypoint, foto. Qui scegli cosa fare:

| Opzione | Quando usarla | Cosa succede |
|---------|---------------|--------------|
| **💾 Save to server** | Sei loggato e vuoi ritrovare tutto sul profilo | Salva il **draft** sul server (traccia + waypoint + media). Resti nel Recorder con il pulsante **Edit** per aprire nell'Editor |
| **📦 Export .rdbk** | Vuoi un file portatile offline | Crea un `.rdbk` ZIP (roadbook.json + foto + audio). Scarica il file |
| **✏️ Open in Editor** | Vuoi rifinire subito la rotta | Passa traccia e waypoint all'Editor. Foto già su server restano collegate |
| **📍 Export GPX** | Ti serve solo per altro software | Scarica `.gpx` standard (traccia + waypoint con nome). Foto e audio **non** inclusi |

> 📸 *Screenshot: opzioni salvataggio — Save to server, Export .rdbk, Open in Editor, Export GPX*

> **Best practice**: se loggato → **Save to server** → poi **Open in Editor**.  
> Se sloggato → **Export .rdbk** → poi da casa: login → Editor → importa `.rdbk` → Save to profile.

---

### 7. Dopo il salvataggio

Se hai scelto **Save to server**, il Recorder mostra il pulsante **Edit** che ti porta direttamente all'Editor con la traccia e i waypoint già caricati. Il draft è salvato e lo ritrovi anche in **I miei roadbook** dal menu principale.

## Comportamento offline

| Cosa | Loggato + online | Loggato + offline | Sloggato |
|------|------------------|-------------------|----------|
| Traccia GPS | ✅ locale + checkpoint | ✅ locale + checkpoint | ✅ locale + checkpoint |
| Waypoint testo | ✅ locale | ✅ locale | ✅ locale |
| Foto | ✅ coda → upload | ✅ coda locale | ✅ coda locale |
| Audio | ✅ coda → upload | ✅ coda locale | ✅ coda locale |
| Draft server | creato/aggiornato live | creato al primo flush | mai creato |
| Recupero post-crash | ✅ automatico | ✅ automatico | ✅ automatico |

---

## Recupero sessione interrotta

Il Recorder salva la sessione in tempo reale. Se l'app si chiude (telefonata, crash, batteria), all'avvio successivo ti propone:

1. **Resume** — riprendi la registrazione da dove l'avevi lasciata
2. **Recupero GPX** — se la sessione è persa, recupera la traccia GPX orfana
3. **Parti pulito** — ignora e ricomincia

> 📸 *Screenshot: modal recupero sessione interrotta*

> Rifiutare il resume **non cancella** la sessione: viene sovrascritta solo quando inizi una nuova registrazione o esci con "End the trip".

---

## Scorciatoie tastiera (desktop)

| Tasto | Azione |
|-------|--------|
| `Spazio` | Waypoint (serve GPS fix) |
| `A` | WP audio (tieni premuto) |
| `F` | WP Foto |
| `P` | Pause / Resume |
| `Esc` | Finish / chiudi modal |

---

## Prossimo passo

Hai la traccia registrata? → [Editor: crea/modifica un roadbook →](03-editor.md)  
Vuoi navigare? → [Reader: naviga con GPS →](04-reader.md)
