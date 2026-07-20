# Reader — Navigare un roadbook con GPS

Il **Reader** è il copilota digitale: carica un roadbook e lo trasforma in una tabella di note stile cartaceo guidata dal GPS. Odometro, bussola CAP, validazione automatica o manuale e — in modalità Competition — un QR firmato col risultato.

> Funziona offline al 100% per navigazione e validazione. Serve connessione solo per: login, caricare roadbook dal profilo/dalla galleria pubblica, salvare risultati.

---

## 1. Caricare un roadbook

Apri il Reader (`/reader/`) — la schermata iniziale offre 3 ingressi:

| Ingresso | Come fare | Cosa succede |
|----------|-----------|--------------|
| **Carica file `.rdbk`** | Tap "Carica .rdbk" → scegli file | Importa roadbook completo (traccia + note + icone) |
| **I tuoi roadbook** | Tap "I tuoi roadbook" (solo se loggato) | Picker dei roadbook salvati sul tuo profilo |
| **Roadbook pubblici** | Tap "Roadbook pubblici" | Picker delle challenge pubbliche della galleria |

**Da URL** (automatico):
- `/reader/<slug>` → carica roadbook pubblico direttamente
- `?rb=<id>` → carica un tuo roadbook salvato per ID

> Per aprire un roadbook pubblico devi essere loggato.

---

## 2. Scegli la modalità di navigazione

Dopo il caricamento si apre il modal di avvio con queste opzioni:

| Opzione | Descrizione |
|---------|-------------|
| **Mappa per nota** | Mostra/nasconde la mini-mappa sotto ogni nota |
| **Registra GPX** | Salva la traccia GPS della navigazione (crash-safe) |
| **Suono su nota** | Breve beep quando una nota viene validata |

Poi scegli la **modalità**:

| Modalità | Quando usarla | Cosa fa |
|----------|---------------|---------|
| **Trip mode** | Uso libero, ricognizioni, uscite senza punteggio | Segue il roadbook liberamente, nessun punteggio |
| **Competition** | Gare, eventi con classifica | Valida con penalità, genera QR firmato per Ranking |

---

## 3. La schermata di navigazione

```
┌─────────────────────────────────────────┐
│ Titolo roadbook                          │
│ Totale: 12.34 km  |  Parziale: 0.56 km  │
│ Bussola: 045° ↗  |  GPS: ±3m 🟢         │
├─────────────────────────────────────────┤
│ #  │ Vignetta │ Indicazioni   │ [Mappa] │
│ 1  │  ┌───┐   │ Svolta a dx   │  [☗]   │
│    │  │ ╱  │   │ CAP 045°     │         │
│    │  └───┘   │ Asfalto       │         │
│─── │───────── │────────────── │─────────│
│ 2  │  ┌───┐   │ Dritto        │  [☗]   │
│    │  │ ↑  │   │ Sterrato      │         │
│    │  └───┘   │               │         │
│    │   ✅     │ RAGGIUNTA     │         │
├─────────────────────────────────────────┤
│              [⏸ Pausa] [🏁 Fine]         │
└─────────────────────────────────────────┘
```

### Elementi della schermata

1. **Barra odometro** (sticky in alto): titolo, totale, parziale, bussola CAP, ora, stato GPS, batteria
2. **Tabella note**: ogni nota su una riga con distanza, vignetta tulip, testo, CAP, tipo strada
3. **Stati nota**: ✅ Raggiunta (verde) · ⏭ Saltata (rosa) · ▶ Attiva (bordo rosso) · bianco (futura)
4. **Colonne**: Distanze + numero | Vignetta | Indicazioni | Pulsanti (mappa, raggiunta)

---

## 4. Avanzamento: automatico vs manuale

### Automatico (default)
Appena il GPS entra nel **raggio di validazione** della nota attiva, la nota viene segnata come raggiunta automaticamente.

- Il raggio è adattivo: dipende dal `wp_radius` della nota, con un massimo che evita sovrapposizioni
- Funziona indipendentemente dalla velocità
- Attiva/disattiva con l'interruttore **Auto** nella barra

### Manuale
Tap sulla nota attiva o sul pulsante "Raggiunta" per convalidare.

- In Trip: marca verde e sincronizza l'odometro
- In Competition: valida con punteggio (serve GPS entro 100 m)
- Non si può validare all'indietro

---

## 5. Barra CAP (tra due note)

Quando la nota precedente ha un CAP, appare una barra in basso con:
- **Rotta da tenere** (es. CAP 045°)
- **Velocità corrente**
- **Distanza alla destinazione**
- **Freccia direzionale**

È un ausilio "a bussola" per navigare tra due note senza perdersi.

---

## 6. Mappa interattiva per nota

Opzionale: tap sul pulsante mappa di una riga apre una mini-mappa sotto la nota.

- Centro sulla nota a zoom ~13
- Mostra l'intera traccia + pin per contesto
- Pallino blu GPS in tempo reale
- Tap sulla mappa aperta la richiude

> La mappa per nota è utile per confermare la posizione sul terreno quando il testo della nota è ambiguo.

---

## 7. Funzionalità aggiuntive

| Funzione | Come usarla |
|----------|-------------|
| **Correzione odometro** | Nudge ±10 m quando serve; validare una nota sincronizza il totale alla distanza di quella nota |
| **Pausa** | Ferma GPS e wake lock per risparmiare batteria (soste pranzo, attese) |
| **Sound on note** | Beep WebAudio breve quando una nota viene validata (auto o manuale) |
| **Registrazione GPX** | Crash-safe: checkpoint a ogni fix, recupero se l'app si chiude |
| **Recupero sessione** | Se interrotta (telefonata, crash), riprende esattamente da dove eri |
| **Cambio lingua** | Cambia lingua a metà sessione senza perdere dati |

---

## 8. In Competition — QR risultato

In modalità Competition, alla fine della navigazione viene generato un **QR firmato HMAC** (55 caratteri) che contiene:
- Risultato completo: penalità, tempi, velocità
- Firmato contro il server (non falsificabile)

Consegnare il QR all'organizzatore per la classifica (Ranking).

---

## 9. Recupero sessione interrotta

All'avvio il Reader controlla in ordine:
1. **Sessione in corso** in `localStorage` → propone ripresa
2. **Roadbook da URL** → lo carica direttamente
3. **GPX orfano** → propone recupero traccia
4. **Niente** → parte pulito

> Rifiutare la ripresa **non cancella la sessione**: viene sovrascritta solo quando inizi una nuova corsa o esci esplicitamente.

---

## 10. Prossimo passo

Hai completato la navigazione? → [Tripmaster: computer di bordo GPS →](05-tripmaster.md)  
Vuoi creare un roadbook? → [Editor: crea/modifica →](03-editor.md)
