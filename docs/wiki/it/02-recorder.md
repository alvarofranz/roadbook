# Roadbook Recorder — Registrare una traccia GPS live

Il **Recorder** è lo strumento da usare **sul campo**. Registra la traccia GPS e ti permette di lasciare note e foto geotaggate lungo il percorso. Il risultato è un draft che passa all'Editor per la creazione del roadbook definitivo.

> Funziona **offline** al 100% per GPS + waypoint + media. I media restano in coda locale finché non c'è rete. Serve connessione solo per: login iniziale, upload differito, salvataggio sul profilo.

---

## Sequenza completa: dall'apertura al salvataggio

### 1. Apri il Recorder

Apri il **Recorder** dal menu principale o vai direttamente su `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Vedrai la schermata iniziale con il pulsante **Start recording**. Se non sei loggato, compare un avviso: *"Non autenticato: il percorso e le sue foto aspettano su questo dispositivo, e Salva ti chiede di accedere."* — puoi registrare lo stesso.

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

Tocca **End** (barra in basso) e conferma per terminare la registrazione.

> ![Riepilogo registrazione](../assets/screenshots/rec06a.jpeg)

Un dialogo mostra un breve riepilogo (km · note · foto) e pone una sola domanda, con due pulsanti:

| Pulsante | Cosa succede |
|---------|--------------|
| **💾 Salva** | Se sei loggato: la registrazione viene salvata come **draft** di roadbook (con le sue foto) e si **apre subito l'Editor** su di esso. Se non sei loggato: vai alla pagina di accesso e, una volta entrato, torni e viene salvata allo stesso modo; poi si apre l'Editor |
| **🗑 Scarta** | Chiede conferma, indicando cosa andrebbe perso (traccia, note, foto), poi elimina la registrazione |

Qui non ci sono pulsanti di esportazione: l'esportazione (GPX, `.rdbk`, PDF…) si fa dopo dall'Editor.

> Il dialogo non si chiude toccando fuori. Finché non salvi o scarti, la registrazione resta al sicuro: anche se l'app va in crash, ti viene riproposta alla visita successiva.

---

### 7. Nell'Editor

L'Editor si apre con la traccia, le note e le foto già caricate: dai un nome al roadbook, scrivi il testo delle note ed esportalo se vuoi. Il draft è salvato e lo ritrovi anche in **I miei roadbook** dal menu principale.

## Comportamento offline

| Cosa | Loggato + online | Loggato + offline | Sloggato |
|------|------------------|-------------------|----------|
| Traccia GPS | ✅ locale + checkpoint | ✅ locale + checkpoint | ✅ locale + checkpoint |
| Note | ✅ locale | ✅ locale | ✅ locale |
| Foto | ✅ coda → upload | ✅ coda locale | ✅ coda locale |
| Draft server | creato/aggiornato live | creato al primo flush | creato con **Salva**, dopo il login |
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
