# Gestione Eventi

Gli **Eventi** ti permettono di organizzare raduni, incontri e competizioni basati su roadbook su RDBK.app. Un evento raccoglie roadbook, partecipanti e (opzionalmente) punteggi — tutto in un unico posto.

> Per creare eventi serve il **ruolo di organizzatore**. Vedi [Primi passi →](01-getting-started.md) o chiedi a un amministratore.

---

## 1 Preparazione dell'evento

---

## 1.1 Ruolo organizzatore — Prerequisiti

La creazione di eventi è riservata agli utenti con **ruolo organizzatore**.

| Passaggio | Cosa succede |
|-----------|-------------|
| **Richiedi** | Dalla [pagina eventi](/features/events/) clicca *Richiedi ruolo organizzatore* e presenta brevemente la proposta dell'evento — l'app invia una email all'admin. |
| **Concessione** | Un amministratore abilita il flag dal pannello Admin. |
| **Sei dentro** | *Gestione Eventi* compare nel menu account. |

---

## 1.2 Creare un evento

Accedi e vai su **Menu / Gestione Eventi**; poi clicca su *Nuovo evento*.

| Campo | Note |
|-------|------|
| **Titolo** | Nome pubblico dell'evento. |
| **Descrizione** | Descrivi l'evento; questo testo sarà visibile sulla pagina evento. |
| **Inizio / Fine** | Finestra temporale dell'evento (selettore calendario). |
| **Visibilità** | **Pubblico** — elencato su `/events/`, chiunque può trovarlo.<br>**Privato** — accessibile solo tramite link diretto `/event/<slug>`. |
| **Sito organizzatore** | Link opzionale mostrato sulla pagina evento. |
| **Sede evento** | Posiziona un pin sulla mappa — mostrato sulla pagina evento. |
| **Logo** | Caricato, automaticamente convertito in AVIF a 512 px. |

Una volta salvato, l'evento ha la sua pagina su `/event/<slug>` e tu sei il **proprietario**.

---

Ora completa l'evento!

---

## 1.3 Ruoli e permessi per l'evento

Per gestire un evento l'organizzatore può coinvolgere altri iscritti come co-organizzatori. Come team possono condividere roadbook e gestire le iscrizioni dei partecipanti per permettere loro l'uso digitale dei roadbook attraverso la piattaforma RDBK.app.

Ovviamente questo è opzionale: puoi sempre esportare i roadbook in PDF e distribuire copie stampate.

| Ruolo | Come si ottiene | Cosa si può fare |
|-------|----------------|------------------|
| **Proprietario** | Hai creato l'evento | Tutto — modificare, eliminare, gestire co-organizzatori, cambiare visibilità |
| **Co-organizzatore** | Invitato dal proprietario | Modificare parametri, aggiungere roadbook, gestire partecipanti. Non può eliminare o cambiare visibilità |
| **Partecipante (attivo)** | Iscritto con codice + attivato | Leggere roadbook pronti/pubblici, vedere classifiche |
| **Partecipante (in attesa)** | Inserito codice, non ancora attivato | Vista limitata fino all'attivazione |

### 1.3.1 Aggiungere co-organizzatori

Nell'editor evento → sezione **Organizzatori** → cerca per username, nome, email o organizzazione → aggiungi.
Solo il **proprietario** può aggiungere o rimuovere co-organizzatori.

---

## 1.4 Aggiungere roadbook

Nell'editor evento → sezione **Roadbook** → *Aggiungi roadbook* → il selettore mostra solo i **tuoi** roadbook.

Ogni roadbook ha una **modalità di punteggio**:

| Modalità | Utilizzo |
|----------|----------|
| **Libero** (default) | Nessun punteggio — i partecipanti seguono il percorso. |
| **Regole Roadbook-suite** | Classifica / competizione — il Reader valuta la percorrenza. |
| **Regole FIA** | Mostrate ma non ancora implementate. |

I roadbook possono essere riordinati (maniglie di trascinamento) e rimossi. Solo i roadbook di tua proprietà possono essere aggiunti.

---

## 1.5 Gestire le iscrizioni dei partecipanti

### 1.5.1 Generare un codice di iscrizione

Nell'editor evento → **Partecipanti** → *Genera codice*.
Viene creato un codice di 4–16 caratteri. Puoi personalizzarlo. Un link breve `/go/<codice>` e un QR sono automaticamente disponibili.

### 1.5.2 Condividere il codice per iscriversi all'evento

Invia il codice (o il link / QR) ai tuoi partecipanti. Il partecipante avrà bisogno di questo codice per effettuare la propria registrazione all'evento (vedi punto **2.1.1**).

Le persone che ricevono questo codice potranno preregistrarsi all'evento, ma dovranno essere attivate per poter vedere e usare i roadbook (vedi **2.1.1**).

## 2 Svolgimento dell'evento

---

## 2.1 Iscrizione + attivazione

Ogni partecipante deve prima iscriversi all'evento, poi essere **attivato** dall'organizzatore. L'attivazione garantisce che l'organizzatore confermi personalmente ogni persona — nessun auto-arruolamento.

---

### 2.1.1 Come un partecipante si iscrive

Ci sono due modi:

| Metodo | Come funziona |
|--------|--------------|
| **Tramite la pagina evento** | Il partecipante visita `/event/<slug>`, digita il codice di iscrizione nel modulo e clicca *Iscriviti*. |
| **Tramite il link breve** `/go/<codice>` | L'organizzatore stampa il link dell'evento e il suo QR code e lo posiziona all'ingresso del desk di registrazione dell'evento. I partecipanti scansionano il QR, accedono al sito ed effettuano la propria iscrizione alla piattaforma. In questo modo sono pronti per la fase di attivazione, che verrà completata al termine delle formalità di registrazione (es. controlli dei requisiti e pagamenti). |

In entrambi i casi il server genera un **codice di attivazione univoco a 6 caratteri** (es. `X3K9M2`) e registra il partecipante con stato `pending`.

> Il link `/go/` attiva anche la **modalità partecipante**: la navigazione è limitata agli strumenti relativi all'evento (Registratore, Editor, ecc. sono nascosti) e la home page reindirizza all'evento. Questo mantiene l'esperienza focalizzata per i partecipanti al raduno.

---

### 2.1.2 Cosa vede il partecipante dopo l'iscrizione

Una volta in stato pending, il partecipante vede una schermata di attivazione con:

- Un **codice QR** contenente il codice di attivazione a 6 caratteri
- Il codice stesso visualizzato come testo (es. `X3K9M2`)
- Un pulsante *Copia*
- L'istruzione: *"Mostra questo QR all'organizzatore dell'evento per attivare la tua partecipazione."*

Il partecipante mostra questo QR (o legge il codice ad alta voce) all'organizzatore **di persona** al check-in.

---

### 2.1.3 Come l'organizzatore attiva ogni partecipante

Nella pagina **Partecipanti** (`/admin/events/participants/?id=<id>`) l'organizzatore vede un elenco dei partecipanti in attesa. L'elenco **si aggiorna automaticamente ogni 10 secondi** così le nuove richieste di iscrizione appaiono in tempo reale.

Ci sono tre modi per attivare:

| Metodo | Come fare |
|--------|----------|
| **1. Clicca *Attiva*** | Accanto al nome di ogni partecipante in attesa, clicca il pulsante *Attiva*. Immediato — nessun codice necessario. |
| **2. Digita il codice di attivazione** | Nella parte superiore della pagina, digita il codice a 6 caratteri (es. `X3K9M2`) nel campo di input e premi Invio. |
| **3. Scansiona il QR code** | Clicca *Scansiona QR* per aprire la fotocamera del dispositivo. La fotocamera posteriore scansiona il QR del partecipante e il codice viene auto-compilato e inviato. Richiede browser basato su Chromium. |

L'organizzatore può anche **aggiungere partecipanti direttamente** — cerca per username o email e aggiungili con stato `active` in un unico passaggio, saltando completamente il flusso di pending/attivazione.

---

### 2.1.4 Dopo l'attivazione

Una volta che lo stato passa da `pending` a **`active`**, il partecipante:

- Vede *"Stai partecipando a questo evento"* sulla pagina evento
- Può leggere tutti i roadbook in stato **pronto** o **pubblico**
- Può usare il Roadbook Reader in modalità **Percorso** o **Competizione**

Se il partecipante si è iscritto tramite `/go/<codice>`, la navigazione rimane in **modalità partecipante** fino a quando non torna alla modalità completa tramite *"Passa alla modalità completa"* nel menu account.

---

## 2.2 Svolgere l'evento

I partecipanti aprono i roadbook nel **Reader** (`/reader/<slug>`):

| Modalità | Comportamento |
|----------|--------------|
| **Percorso** | Segui il percorso — nessun punteggio, nessun risultato. |
| **Competizione** | Segui e vieni valutato. Al traguardo viene prodotto un **QR risultato** firmato. Il QR risultato contiene i dati di percorrenza firmati con il token account del partecipante. L'organizzatore raccoglie questi QR (screenshot / foto) per la classifica. |

---

## 2.3 Classifica

1. Apri lo strumento **Classifica** (`/ranking/`) per uno specifico roadbook in competizione.
2. Carica i QR risultato raccolti dai partecipanti.
3. La classifica finale viene costruita automaticamente.

I link alla classifica appaiono sulla pagina evento per partecipanti attivi e organizzatori.

---

## 2.4 Gestire i partecipanti

Da **Gestione Eventi** → *Partecipanti* per il tuo evento:

| Azione | Come fare |
|--------|----------|
| **Elenca / cerca** | Tabella paginata con ricerca. I partecipanti in attesa sono evidenziati. Auto-ricarica ogni 10 s. |
| **Attiva** | Scansiona il QR del partecipante, digita il codice di attivazione, o clicca *Attiva*. |
| **Disattiva** | Clicca *Rimuovi* — il partecipante perde l'accesso. |
| **Aggiungi direttamente** | Cerca utenti e aggiungili senza codice di iscrizione. |
| **Esporta** | Download CSV della lista partecipanti. |

---

## 2.5 Pagina evento (`/event/<slug>`)

La pagina pubblica dell'evento mostra:

- Logo, titolo e descrizione
- Periodo
- Link al sito dell'organizzatore
- Sede dell'evento su una mappa
- Galleria dei roadbook allegati (con badge di stato)
- Modulo di iscrizione (per i partecipanti)
- Link alla classifica (una volta disponibili i risultati)

---

## 2.6 Limiti e note

- Solo i roadbook **di tua proprietà** possono essere aggiunti al tuo evento (gli admin possono aggiungere qualsiasi).
- Eliminare un evento è permanente — tutte le associazioni dei partecipanti vengono rimosse.
- La modalità di punteggio FIA è un placeholder; usa *Regole Roadbook-suite* per la competizione.
- I codici di iscrizione sono case-sensitive.

---

## 2.7 Prossimo passo

Vuoi vedere come appare un evento dal punto di vista di un partecipante? → [Navigare con il Reader →](04-reader.md)
Pronto per il punteggio? → [Usare il Tripmaster →](05-tripmaster.md)
