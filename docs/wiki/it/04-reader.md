# Reader — Navigare un roadbook con GPS

Il **Reader** è il copilota digitale: carica un roadbook e lo trasforma in una tabella di note stile cartaceo guidata dal GPS. Odometri misurati lungo il percorso, validazione automatica o manuale, un report a fine percorso e — nella competizione di un evento — un risultato firmato per la classifica.

> Navigazione e validazione funzionano offline al 100%. La connessione serve solo per accedere, per caricare un roadbook dal profilo o dalla galleria pubblica e per salvare il report.

---

## 1. Caricare un roadbook

Apri il Reader (`/reader/`). La schermata iniziale offre:

| Ingresso | Cosa succede |
|----------|--------------|
| **Carica file .rdbk** | Importa un roadbook completo (traccia + note + icone) |
| **Apri da I miei roadbook** | Scegli uno dei roadbook salvati sul tuo profilo (da loggato) |
| **Galleria pubblica** | I roadbook pubblici, subito sotto: toccane uno per aprirlo |

**Da un link**: `/reader/<slug>` apre un roadbook pubblico, `?rb=<id>` uno dei tuoi.

> Per aprire un roadbook pubblico devi aver fatto l'accesso.

Un roadbook si apre prima in **anteprima di sola lettura**: la lista delle note, senza GPS. Magari vuoi solo guardarlo. Tocca **Naviga** per partire.

---

## 2. Avviare un percorso

**Naviga** apre il dialogo di avvio:

| Opzione | Descrizione |
|---------|-------------|
| **Registra una traccia GPX** | Registra la traccia GPS del percorso (a prova di crash) |
| **Suono su nota** | Un campanello a ogni nota validata, una fanfara sull'ultima. Suona sopra la tua musica invece di fermarla |

Non c'è una modalità da scegliere: un roadbook aperto da un evento che lo **punteggia** gira in **competizione** (ti viene chiesto il numero del veicolo, si applicano le penalità, il risultato firmato va nella classifica dell'evento); tutto il resto gira come **viaggio**.

---

## 3. La schermata di navigazione

Il Reader occupa tutto lo schermo:

1. **Barra odometro** in alto: titolo, totale (*prog.*) sopra il parziale (*parz.*), direzione, ora, stato del GPS e velocità
2. **Lista delle note**: una riga per nota, in tre colonne — distanza totale e parziale con il numero della nota (e il suo tipo di waypoint, se c'è) · la vignetta · il testo, il CAP, il limite di velocità e le coordinate
3. **Barra delle azioni** in basso: interruttore **Auto** · **Mappa della nota** · **Pausa** · GPX · **Termina** · **Esci**

Stati delle note: **raggiunta** (verde) · **saltata** (rosa) · **attiva** (bordo rosso) · da fare (bianca). Avvicinandoti alla nota attiva diventa **blu** e mostra la distanza che manca, in km con due decimali.

Quando una nota viene validata, la successiva sale **in cima alla lista**: la strada davanti ha tutto lo spazio.

### Distanze lungo il percorso
La distanza che manca si misura **lungo la strada**, come i parziali del roadbook stesso, non in linea d'aria: il parziale percorso più la distanza che manca è sempre uguale al parziale della nota. A ogni cambio di nota entrambi gli odometri si riallineano sul percorso, così il parziale segna 0.00 esattamente alla nota.

---

## 4. Avanzamento: automatico o manuale

### Automatico (default)
La nota attiva si valida appena entri nel suo **raggio di validazione**.

- Il raggio viene dalla nota (`validation_radius`), poi dal default del roadbook, poi dal tipo di waypoint, poi 30 m; non scende mai sotto i 18 m, sopra il rumore del GPS
- Si controlla la **strada percorsa tra due fix GPS**, non solo i fix: in velocità un telefono si sposta di 25 m tra due posizioni, e un waypoint stretto altrimenti ci scivolerebbe in mezzo
- Una posizione di cui il telefono non è sicuro (scarsa precisione) viene ignorata: non può né validare una nota né aggiungere distanza

### Manuale
Spegni **Auto**: allora un tocco **in qualsiasi punto della riga della nota attiva** la segna fatta (il bersaglio è tutta la riga, nessun pulsantino da centrare in movimento). Con Auto acceso valida solo il GPS.

- In competizione una validazione manuale richiede di essere entro 100 m dalla nota, più il margine che serve alla precisione del GPS
- Toccare **un'altra** nota sposta lì il percorso e chiede prima conferma: le note in mezzo restano non validate, e in competizione ogni nota a punteggio saltata costa 450 punti
- In competizione non si torna su una nota già validata

### A mani libere con un telecomando
Qualsiasi telecomando che invii tasti — un pedale voltapagina, un controller da rally sul manubrio, un clicker — guida il Reader mentre navighi. Funziona e basta: non c'è niente da attivare.

- Di serie: → · ↓ · Pag ↓ · Spazio · Invio convalidano la nota, ← · ↑ · Pag ↑ tornano indietro (solo in viaggio: in gara una nota convalidata non si annulla)
- I tuoi pulsanti: in **Profilo → Telecomando**, tocca **Assegna** accanto a un'azione e premi il pulsante del telecomando. Puoi assegnare convalida / successiva, precedente, Auto, la mappa della nota, pausa e i comandi del Tripmaster
- I pulsanti restano sul dispositivo e vengono ignorati mentre scrivi o c'è una finestra aperta

---

## 5. Mappa della nota

Solo se il roadbook consente la mappa: **Mappa della nota** nella barra delle azioni apre una mini-mappa sotto la nota attiva; toccala di nuovo per chiuderla.

- Mostra la traccia, la tua posizione live e, nell'angolo, il numero della nota con la distanza che manca
- Ti guida **una freccia gialla** corta: dalla tua posizione punta dritta alla nota
- Quando la nota viene validata, la mappa ti segue sulla successiva

---

## 6. Pausa, termina, esci

| Pulsante | Cosa fa |
|----------|---------|
| **Pausa** | Ferma il GPS e il blocco dello schermo acceso per risparmiare batteria (una sosta pranzo); gli odometri non avanzano in pausa |
| **Termina** | Chiude il percorso e apre il report. Prima dell'ultima nota chiede conferma: le note non raggiunte contano come saltate |
| **Esci** (l'icona di uscita) | Abbandona il percorso senza report, dopo una conferma |

---

## 7. Il report del percorso

Ogni percorso finisce con il suo **report**: note raggiunte e saltate, zone con limite di velocità, tempo e distanza. In testa c'è la card del percorso, sotto il pulsante **Condividi** e un solo interruttore per tenerlo **Privato** o renderlo **Pubblico** (visibile sul tuo profilo `/u/<username>`). Condividere prima di aver scelto chiede conferma, perché condividere rende pubblico il percorso.

Il report si salva prima sul dispositivo e si carica appena c'è connessione.

### In competizione — il risultato firmato
Un percorso in competizione produce anche un **risultato firmato HMAC** (un QR da condividere o scaricare) ed entra nella classifica condivisa dell'evento, dove gli organizzatori lo verificano.

---

## 8. Recupero di una sessione interrotta

Il percorso si salva da solo sul dispositivo. Se viene interrotto (una chiamata, un crash, il telefono che chiude l'app), alla visita successiva il Reader chiede **Riprendere il percorso in corso?** e continua esattamente da dove eri. Una traccia GPX in registrazione si recupera allo stesso modo.

> Rifiutare non cancella nulla, e la domanda non torna per quel percorso. Non viene mai posta quando il link indica un altro roadbook.

---

## 9. Prossimo passo

Finito di navigare? → [Tripmaster: computer di bordo GPS →](05-tripmaster.md)
Vuoi creare un roadbook? → [Editor: crea/modifica →](03-editor.md)
