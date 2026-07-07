# Gestione delle traduzioni (label i18n)

Come tradurre/correggere le **label dell'interfaccia** di RDBK.app con l'editor in-contesto
(#118), e come far arrivare le modifiche in produzione. Documento operativo per chi traduce
(niente competenze tecniche richieste) e per chi poi committa.

## Come funziona l'i18n (in breve)
- L'**inglese** è la lingua sorgente (testo inline nell'HTML + `public/assets/js/i18n.js`).
- Le altre 4 lingue vivono ognuna nel suo file: `public/assets/js/i18n.{es,it,de,fr}.js`.
- **Regola di parità (imposta dai test):** ogni chiave presente in una lingua deve esistere in
  **tutte e quattro**. `npm test` fallisce se manca una traduzione → il deploy si blocca.
- **Le traduzioni NON vivono in un database.** Sono file statici committati: si modificano via
  editor, si esporta un *delta*, un dev lo committa. (Scelta di design "Option B": niente carico
  runtime dal server.)

## L'editor in-contesto (chi traduce)
Serve un account **admin**. L'editor è caricato solo per gli admin e resta spento finché non lo
accendi.

1. **Accedi come admin** e apri una qualsiasi pagina del sito.
2. In basso a sinistra compare un **chip con l'icona lingua**. Cliccalo → **modalità traduzione ON**:
   tutte le label traducibili si evidenziano e appare una **barra in basso**.
3. **Modifica una label:**
   - **Tasto destro** su una label → popup per editare **solo quella** (le 4 lingue).
   - Oppure barra → **Page labels** → popup con **tutte le label della pagina** (4 lingue ciascuna).
4. Digitando vedi l'**anteprima live** sulla pagina. Ogni modifica è **salvata automaticamente**
   come *in sospeso* (nel browser) e **resta anche cambiando pagina** — puoi girare il sito e
   tradurre man mano. Il contatore accanto a *Export* mostra quante modifiche hai in sospeso.
5. **Esporta:** barra (o popup) → **Export** →
   - **Copy** (consigliato): copia il delta negli appunti — **incollalo** direttamente nel canale
     concordato (chat/messaggio). È a prova di accenti.
   - **Download**: scarica `i18n-delta.txt` (UTF-8 con BOM). Se lo apri su Windows, usa un editor
     che rispetta l'UTF-8; **Copy** evita ogni problema di codifica.
6. Consegna il delta a chi committa (vedi sotto). *Clear pending* svuota le modifiche in sospeso
   (dopo che sono state committate, o se erano prove).

> Con il **tasto destro** puoi tradurre anche una label che oggi è **solo in inglese**: crei di
> fatto una nuova chiave nelle 4 lingue.

## Pubblicare le modifiche (chi committa — dev)
Il delta è un blocco per lingua, es.:
```
/* → paste inside window.RBi18nLangs.es in public/assets/js/i18n.es.js */
    "gallery.title": "Últimos roadbook pubblici",
    ...
```
1. Per ogni blocco, **incolla/sostituisci** le chiavi dentro l'oggetto `window.RBi18nLangs.<lang>`
   del file `public/assets/js/i18n.<lang>.js` corrispondente (aggiorna la chiave se esiste, aggiungila
   se è nuova). **Mantieni tutte e 4 le lingue in parità.**
2. `npm test` (deve restare verde: copre la parità i18n).
3. Committa e rilascia con il normale flusso di deploy (`node source/stamp-version.mjs <versione>`
   → push su `main`), così i nuovi file arrivano ai client col cache-buster.

## Limiti / note
- **Niente "salva sul sito" diretto:** per scelta, il definitivo passa da *Export → commit → deploy*.
- **Codifica:** usa **Copy** per trasferire il delta senza rischi; il Download è UTF-8+BOM.
- L'editor lavora sulle chiavi già presenti nelle lingue + quelle viste navigando; non fa lo scan
  di tutte le pagine in una volta (le "vedi" aprendo le pagine).
- Dettagli del sistema i18n: vedi `CLAUDE.md` (sezioni i18n e `i18n-edit.js`).
