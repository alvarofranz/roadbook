# Roadbook Recorder — Registrare una traccia GPS live

Il **Recorder** è lo strumento da usare **sul campo**. Registra la traccia GPS e ti permette di lasciare note e foto geotaggate lungo il percorso. Il risultato è un draft che passa all'Editor per la creazione del roadbook definitivo.

> Funziona **offline** al 100% per GPS + waypoint + media. I media restano in coda locale finché non c'è rete. Serve connessione solo per: login iniziale, upload differito, salvataggio sul profilo.

---

## Sequenza completa: dall'apertura al salvataggio

### 1. Apri il Recorder

Apri il **Recorder** dal menu principale o vai direttamente su `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Vedrai la schermata iniziale con il pulsante **Start recording**. Se non sei loggato, compare un avviso: *"Non autenticato: le foto restano su questo dispositivo e finiscono in un .rdbk locale al termine. Accedi per salvarle sul tuo account."* — puoi registrare lo stesso.

---

### 2. Avvia una nuova registrazione

Tocca **Start recording**.

> ![Nome sessione](../assets/screenshots/rec02.jpg)

Si apre un modal per il **nome** della sessione (default: data/ora `YYYY-MM-DD HH-MM`). Puoi cambiarlo. Tocca **Conferma**.

---

### 3. Dashboard live — la registrazione è in corso

Durante la registrazione, lo schermo mostra in alto quattro indicatori:

> ![Dashboard registrazione](../assets/screenshots/rec03a.jpg)

| Elemento | Cosa vedi |
|----------|-----------|
| **Tempo** | Durata della registrazione (escluso pause) |
| **km/h** | Velocità attuale |
| **Note** | Numero di note piazzate |
| **km** | Distanza percorsa |

Sotto ci sono i pulsanti di cattura (passo 4) e la mappa live (passo 5). **Pause** ed **End** stanno in una barra in basso, metà larghezza ciascuno; sul telefono quella barra galleggia appena sopra la barra delle schede in basso.

---

### 4. Arricchisci la traccia durante il percorso

La riga di cattura ha un grande pulsante **Nota** a sinistra e, alla sua destra, una griglia 2×2 di pulsanti a icona alta quanto lui:

| Pulsante | Azione | Come si usa |
|----------|--------|-------------|
| **📍 Nota** | Piazza una nota alla posizione GPS attuale | Tocca: la nota viene piazzata all'istante (serve GPS fix). Suona un campanello di conferma e compare a schermo un grande check verde per meno di un secondo. Non c'è niente da scrivere: il testo della nota si scrive dopo nell'Editor |
| **📷 Foto** | Scatta foto geotag | Apre la fotocamera posteriore. La foto viene agganciata alla posizione GPS attuale e piazza sempre anche una nota lì |
| **↩ Annulla ultima nota** | Elimina l'ultima nota | Chiede prima conferma, nominando la nota che elimina |
| **🗺 Stile mappa** | Cambia la mappa di base | Satellite ↔ topografica |
| **🧭 Heading up** | Orientamento mappa | La mappa ruota con la tua rotta (heading up) o resta con il nord in alto |

La barra in basso contiene gli altri due:

| Pulsante | Azione |
|----------|--------|
| **⏸ Pause** | Sospende GPS e cronometro (soste, attese). Tocca di nuovo per riprendere |
| **🏁 End** | Termina la registrazione (passo 6) |

> ![Pulsanti waypoint e media](../assets/screenshots/rec04a.jpg)

> **Consiglio**: tocca **Nota** a ogni incrocio, pericolo o cambio di strada senza staccare gli occhi dalla strada, e aggiungi le parole dopo nell'Editor. Usa **Foto** per segnali e punti visivi.

---

### 5. Mappa live

> ![Mappa live](../assets/screenshots/rec05.jpg)

- La traccia è una **linea continua**
- Le note sono **pallini blu numerati**
- Le foto hanno un **pin 📷**
- In alto a sinistra, grande e senza etichetta: la **distanza dall'ultima nota** (km, due decimali; dalla partenza prima della prima nota)
- Il tuo marker GPS diventa un **chevron** direzionale quando sei in movimento

---

### 6. Fine registrazione

Tocca **End** (barra in basso) per terminare la registrazione.

> ![Riepilogo registrazione](../assets/screenshots/rec06a.jpeg)

Si apre il modal di riepilogo con i dati della sessione: punti percorso, km, note, foto. Qui scegli cosa fare:

| Opzione | Quando usarla | Cosa succede |
|---------|---------------|--------------|
| **💾 Save to server** | Sei loggato e vuoi ritrovare tutto sul profilo | Salva il **draft** sul server (traccia + waypoint + media). Resti nel Recorder con il pulsante **Edit** per aprire nell'Editor |
| **📦 Export .rdbk** | Vuoi un file portatile offline | Crea un `.rdbk` ZIP (roadbook.json + foto). Scarica il file |
| **✏️ Open in Editor** | Vuoi rifinire subito la rotta | Passa traccia e waypoint all'Editor. Foto già su server restano collegate |
| **📍 Export GPX** | Ti serve solo per altro software | Scarica `.gpx` standard (traccia + note come waypoint con nome). Foto **non** incluse |

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
| Note | ✅ locale | ✅ locale | ✅ locale |
| Foto | ✅ coda → upload | ✅ coda locale | ✅ coda locale |
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

## Prossimo passo

Hai la traccia registrata? → [Editor: crea/modifica un roadbook →](03-editor.md)  
Vuoi navigare? → [Reader: naviga con GPS →](04-reader.md)
