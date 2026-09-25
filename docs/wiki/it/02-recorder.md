# Roadbook Recorder — Registrare una traccia GPS live

Il **Recorder** è lo strumento da usare **sul campo**. Registra la traccia GPS e ti permette di lasciare note, foto geotaggate e note vocali lungo il percorso. Il risultato è un draft che passa all'Editor per diventare il roadbook definitivo.

> Funziona **offline al 100%** per il GPS, le note, le foto e le note vocali. Le foto restano in coda locale finché non c'è rete. Serve connessione solo per accedere, caricare le foto e salvare sul profilo.

---

## Sequenza completa: dall'apertura al salvataggio

### 1. Apri il Recorder

Apri il **Recorder** dalla barra delle schede (l'icona ⏺) o vai direttamente su `/recorder/`.

> ![Avvio del Recorder](../assets/screenshots/rec01.jpg)

La schermata iniziale spiega cosa fa il Recorder e mostra dal vivo lo **stato del GPS**: *Ricerca del GPS…*, *GPS troppo debole per registrare* oppure *GPS pronto* con la sua precisione (±m). **Avvia registrazione** si attiva solo quando il GPS è abbastanza buono per registrare, così una registrazione non parte mai alla cieca. Se non sei loggato, un avviso ti dice che il percorso e le sue foto aspettano sul dispositivo e che **Salva** ti chiederà di accedere — puoi registrare lo stesso.

> Gli **admin** possono partire senza aspettare il GPS (il pulsante lo dice) — utile su un computer, che non ne ha: ogni fix viene tenuto qualunque sia la sua precisione, e una nota senza alcun fix viene piazzata dove è centrata la mappa.

---

### 2. Avvia

Tocca **Avvia registrazione**. La registrazione parte subito: non c'è niente da compilare — il roadbook riceve il suo nome dopo, nell'Editor.

---

### 3. Dashboard live — la registrazione è in corso

> ![Dashboard della registrazione](../assets/screenshots/rec03a.jpg)

In alto, la barra di stato (ora · batteria · precisione GPS) e quattro indicatori:

| Elemento | Cosa vedi |
|----------|-----------|
| **Tempo** | Durata della registrazione (escluse le pause) |
| **km/h** | Velocità attuale |
| **Note** | Numero di note piazzate |
| **km** | Distanza percorsa |

Sotto ci sono i pulsanti di cattura (passo 4) e la mappa live (passo 5). **Pausa** e **Termina** stanno in una barra in basso, metà larghezza ciascuno; sul telefono quella barra galleggia appena sopra la barra delle schede.

---

### 4. Arricchisci la traccia durante il percorso

> ![Pulsanti di cattura](../assets/screenshots/rec04a.jpg)

La riga di cattura ha tre colonne, alte uguali: la grande **Nota** (40%), le catture (40%: **Foto** sopra **Nota vocale**) e i due interruttori della mappa (20%: **Stile mappa** sopra **Direzione in alto**).

| Pulsante | Azione | Come si usa |
|----------|--------|-------------|
| **📍 Nota** | Piazza una nota alla tua posizione GPS | Tocca: la nota viene piazzata all'istante. Suona un campanello di conferma e compare un grande check verde per meno di un secondo. Non c'è niente da scrivere — il testo della nota si scrive dopo nell'Editor |
| **📷 Foto** | Scatta una foto geotaggata | Apre la fotocamera posteriore. La foto viene agganciata alla tua posizione e piazza sempre anche una nota lì |
| **🎤 Nota vocale** | Registra una nota vocale | **Tienilo premuto** mentre parli — una nota viene piazzata proprio lì e il pulsante diventa rosso con i secondi; **rilascialo** e si ferma (al massimo un minuto). Si conserva solo il suono, senza trascrizione: diventa l'extra **Nota vocale** della nota e, quando navighi il roadbook, si riproduce da sola prima che tu arrivi alla nota (100 m prima, o la distanza che l'autore imposta nell'Editor) |
| **🗺 Stile mappa** | Cambia la mappa di base | Satellite ↔ topografica |
| **➤ Direzione in alto** | Orientamento della mappa | La mappa ruota con la tua rotta (acceso) o resta con il nord in alto |

La barra in basso contiene gli altri due:

| Pulsante | Azione |
|----------|--------|
| **⏸ Pausa** | Sospende la registrazione (soste, attese). Tocca di nuovo per riprendere |
| **🏁 Termina** | Termina la registrazione (passo 6) |

> **Consiglio**: tocca **Nota** a ogni incrocio, pericolo o cambio di strada senza staccare gli occhi dalla strada, e aggiungi le parole dopo nell'Editor. Tieni premuto **Nota vocale** quando poche parole lo dicono meglio — te le risentirai sulla strada. Sul percorso non c'è un annulla: una nota piazzata per sbaglio si elimina in un secondo nell'Editor.

---

### 5. Mappa live

> ![Mappa live](../assets/screenshots/rec05.jpg)

- La traccia è una **linea continua**
- Le note sono **pallini blu numerati**
- Le foto hanno un **pin 📷**
- In alto a sinistra, grande e senza etichetta: la **distanza dall'ultima nota** (km, due decimali; dalla partenza prima della prima nota)
- Il tuo marker GPS diventa un **chevron** direzionale quando sei in movimento

---

### 6. Termina la registrazione

Tocca **Termina** (barra in basso) e conferma.

> ![Fine della registrazione](../assets/screenshots/rec06a.jpg)

Un dialogo mostra un breve riepilogo (km · note · foto) e pone una sola domanda, con due pulsanti:

| Pulsante | Cosa succede |
|----------|--------------|
| **💾 Salva** | Se sei loggato: la registrazione viene salvata come **draft** di roadbook (con le sue foto e note vocali) e si **apre subito l'Editor** su di essa. Se non sei loggato: vai alla pagina di accesso e, una volta entrato, torni e viene salvata allo stesso modo; poi si apre l'Editor |
| **🗑 Scarta** | Chiede conferma, indicando cosa andrebbe perso (traccia, note, foto), poi elimina la registrazione |

Qui non ci sono pulsanti di esportazione: l'esportazione (GPX, `.rdbk`, PDF…) si fa dopo dall'Editor.

> Il dialogo non si chiude toccando fuori. Finché non salvi o scarti, la registrazione resta al sicuro — anche se l'app va in crash, ti viene riproposta alla visita successiva.

---

### 7. Nell'Editor

L'Editor si apre con la traccia, le note, le foto e le note vocali già al loro posto: dai un nome al roadbook, scrivi il testo delle note, ascolta una nota vocale nella scheda **Nota vocale** della sua nota (e imposta quanti metri prima della nota si riproduce) ed esportalo se vuoi. Il draft è salvato e lo ritrovi anche in **I miei roadbook**.

## Comportamento offline

| Cosa | Loggato + online | Loggato + offline | Sloggato |
|------|------------------|-------------------|----------|
| Traccia GPS | ✅ locale + checkpoint | ✅ locale + checkpoint | ✅ locale + checkpoint |
| Note e note vocali | ✅ locale | ✅ locale | ✅ locale |
| Foto | ✅ coda → upload | ✅ coda locale | ✅ coda locale |
| Draft sul server | creato/aggiornato live | creato al primo upload | creato con **Salva**, dopo l'accesso |
| Recupero dopo un crash | ✅ automatico | ✅ automatico | ✅ automatico |

---

## Recupero di una sessione interrotta

Il Recorder salva la sessione in tempo reale. Se l'app si chiude (una telefonata, un crash, la batteria), all'avvio successivo ti propone di **riprendere** la registrazione da dove l'avevi lasciata. Rifiutare **non la cancella**: la registrazione resta sul dispositivo e viene sostituita solo quando ne inizi una nuova.

---

## Prossimo passo

Hai la traccia registrata? → [Editor: crea/modifica un roadbook →](03-editor.md)  
Vuoi navigare? → [Reader: naviga con GPS →](04-reader.md)
