# Tripmaster — Computer di bordo GPS

Il **Tripmaster** è un computer di bordo GPS senza roadbook: nessuna nota, nessun tracciato da seguire, nessun punteggio. Mostra in tempo reale odometro totale e parziale, velocità con bande di allerta, heading (CAP), cronometro e contatore waypoint — utile per ricognizioni, prove o uscite dove serve solo la strumentazione di bordo.

> Funziona offline al 100%. La sessione è salvata a ogni fix, quindi una telefonata o un blocco schermo non perdono nulla.

---

## 1. Avvio

Apri **Tripmaster** (`/tripmaster/`) e tocca **Start**. Subito vedi la dashboard live con tutti gli strumenti.

All'avvio il Tripmaster controlla automaticamente:
1. **Sessione interrotta** in corso → propone ripresa
2. **Traccia GPX orfana** → propone recupero
3. **Niente** → parte pulito

---

## 2. La dashboard

```
┌──────────────────────────────────┐
│ ⏰ 14:32   🔋 85%   🛰 ±3m      │
├──────────────────────────────────┤
│                                  │
│  TOTALE          PARZIALE        │
│  12.34 km        0.56 km         │
│  [−10] [+10]    [−10] [+10]      │
│                                  │
│  VELOCITÀ        CAP             │
│  45 km/h ▲      045° ↗           │
│  ⚠ max: 78 km/h                  │
│                                  │
│  CRONOMETRO      WAYPOINT        │
│  12:34 ▶         5              │
│                                  │
├──────────────────────────────────┤
│ [🔴 STOP GPX] [🏁 End trip]     │
└──────────────────────────────────┘
```

### Strumenti:

| Strumento | Descrizione |
|-----------|-------------|
| **Odometro totale** | Distanza percorsa dall'inizio della sessione |
| **Odometro parziale** | Distanza dall'ultimo reset o waypoint |
| **Velocità** | Velocità corrente + massima registrata |
| **Heading (CAP)** | Direzione di marcia in gradi con ago |
| **Cronometro** | Timer start/pausa/reset |
| **Waypoint** | Contatore (solo numero, nessuna posizione salvata) |

---

## 3. Odometro: totale, parziale e correzioni

Due odometri indipendenti, entrambi con correttori manuali ±10 m:

| Pulsante | Azione |
|----------|--------|
| **+10 / −10** (parziale) | Corregge il parziale |
| **+10 / −10** (totale) | Corregge il totale |

> I correttori non possono andare sotto 0.

### Reset del parziale

Tieni premuto il pulsante di reset per **5 secondi** (protezione anti-tocco accidentale). Il parziale si azzera anche automaticamente quando premi **Mark waypoint**.

---

## 4. Velocità e bande di allerta

Imposta una **velocità da sorvegliare** per ricevere segnali visivi:

| Banda | Condizione | Colore (default) |
|-------|-----------|------------------|
| Sotto limite | `v < limite − 5` | Verde |
| In avvicinamento | `limite − 5 ≤ v < limite` | Arancione |
| Supero | `v ≥ limite` | Rosso con ⚠ |

> La configurazione delle bande (limite e colori) si imposta dal pulsante delle impostazioni velocità. I colori e il limite vengono salvati e ripristinati alla prossima sessione.

---

## 5. Cronometro

Il cronometro usa l'orologio di sistema, quindi continua a contare anche se l'app va in background.

| Pulsante | Azione |
|----------|--------|
| **Start/Pause** | Avvia o mette in pausa |
| **Reset** | Azzera (solo a cronometro fermo) |

> Il tempo mostrato include il periodo in background: se metti in pausa e riprendi ore dopo, il conteggio riparte da dove era.

---

## 6. Contatore waypoint

Premi **Mark waypoint** per:
- Incrementare il contatore waypoint
- Azzerare il **parziale**

> Il contatore è solo un numero — non salva coordinate. Per registrare la posizione effettiva, attiva la **registrazione GPX**.

---

## 7. Registrazione GPX

Attiva la registrazione GPX dal pulsante dedicato per avere una traccia della tua uscita:

- **Crash-safe**: checkpoint a ogni fix, recupero se l'app si chiude
- Il pulsante diventa rosso **STOP** durante la registrazione
- Settings modal per configurare nome file e opzioni

---

## 8. Recupero sessione interrotta

All'avvio controlla in ordine:
1. **Sessione in corso** in `localStorage` → propone ripresa con tutti i dati (odometri, cronometro, waypoint, GPX)
2. **GPX orfano** → propone recupero traccia interrotta
3. **Niente** → parte pulito

> Rifiutare la ripresa **non cancella** la sessione: viene sovrascritta appena inizi a muoverti, o cancellata esplicitamente con "End the trip".

---

## 9. Scorciatoie tastiera (desktop)

| Tasto | Azione |
|-------|--------|
| `Spazio` | Mark waypoint |
| `P` | Pause/Resume cronometro |
| `Esc` | End trip |

---

## 10. Prossimo passo

Hai completato la ricognizione? → [Recorder: registra una traccia →](02-recorder.md)  
Vuoi creare un roadbook? → [Editor: crea/modifica →](03-editor.md)
