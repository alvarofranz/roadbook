# Compliance col lexicon FIA (issue #9)

Confronto sistematico tra il **lexicon roadbook FIA cross-country** (Annexe III §5.14,
ed. 10.12.2025) e ciò che RDBK rappresenta oggi — come icona di palette, come campo del
modello dati, o non rappresentato. Documento di riferimento per la
[issue #9](https://github.com/alvarofranz/roadbook/issues/9): *"the roadbook layout and
graphics shall be compliant with the FIA lexicon"*.

> Fonte FIA: `fia-lexicon-cross-country-2026-251210.pdf` (le icone FIA sono fornite da
> rallynavigator.com). Lato RDBK: la palette in [public/assets/icons/](../public/assets/icons/)
> + `index.json`, il mapping di import in
> [roadbook-core.js §SUITE_ICON_ALIASES](../public/assets/js/roadbook-core.js#L189) e il
> modello dati `.rdbk` (vedi [rdbk-format](rdbk-format.md)). Per la mappatura RB Suite→palette
> vedi [editor.md §9.5](editor.md).

Legenda stato:
- **✓** match diretto (icona equivalente o campo dedicato)
- **≈** match approssimato (soggetto vicino, non identico)
- **⊘** non è un'icona da noi: è gestito dal **modello dati** (road_type, danger, cap, junctions, waypoint=nota)
- **✗** non rappresentato

---

## 1. Quadro d'insieme

Il lexicon FIA è più ampio del nostro set perché copre l'intero dominio rally-raid:
pittogrammi ambientali, **tipi di waypoint**, **CAPS**, **dune/sabbia**, **controlli di gara**
e abbreviazioni testuali. RDBK è un roadbook generalista: copre bene **terreno/altimetria,
riferimenti, segnali stradali, acqua e animali**, mentre il livello operativo di gara FIA è
in parte modellato come dati (danger, cap, road_type) e in parte non rappresentato.

| Area FIA | Copertura RDBK |
|---|---|
| Segnali stradali (stop, precedenza, divieti, pericoli, limiti) | **Alta** — set Vienna `W*/B*/C*/D*` + `S*` limiti |
| Terreno / altimetria / superficie | **Alta** — `A*` + `T*/t*` |
| Riferimenti ambientali (case, alberi, acqua, ferrovia…) | **Media** — `P*`, mancano molti elementi desertici |
| Direzione / tipo strada | **⊘ dati** — `junctions[]` + `road_type` 0–4 |
| Pericolo / CAP | **⊘ dati** — campo `danger` 1–3, `cap`/`cap_distance` |
| Tipi di waypoint (Masked/Control/Security/…) | **Nessuna** |
| Dune / sabbia (cuvette, dunette, livelli) | **Nessuna** (solo sabbia/guado generici) |
| Controlli di gara (SS, CP, neutralizz., transfer, TC, assistenza, zone) | **Nessuna** |

---

## 2. Segnali di sicurezza e stradali

| FIA | RDBK | Stato |
|---|---|---|
| Danger Level 1 / 2 / 3 | campo `danger` 1–3 → `!` / `!!` / `!!!` nella vignette | ⊘ ✓ |
| Global danger in the note | `W28_general_danger.svg` | ✓ |
| Speed limit (start) | `S01_10km`…`S12_120km` `.svg` | ✓ |
| Speed limit (finish) | `S99_end.svg` | ✓ |
| Stop | `B02_stop.svg` | ✓ |
| Give way / precedenza | `B01_give_way.svg` | ✓ |
| Red line under km = danger 2 | campo `danger=2` (resa testuale, non grafica identica) | ≈ |
| Start / Finish Difficult Overtaking Zone (DZ) | — | ✗ |

Pericoli stradali (dal set Vienna, ora tutti raggiungibili anche dai file Suite via alias):
strettoia `W07`, curva dx/sx `W01`/`W02`, strada tortuosa `W03`, sdrucciolevole `W11`,
frana/caduta massi `W13`, passaggio a livello `W24`, mezzi agricoli `W27`, rotatoria `D06`,
lavori in corso `W26`, divieto di accesso `C01`.

---

## 3. Terreno, altimetria, superficie

| FIA | RDBK | Stato |
|---|---|---|
| Lateral inclination | `A01`/`A02_inclinazione_laterale` | ✓ |
| Step up / Step down | `A04_salita_gradini` / `A03_discesa_gradini` | ✓ |
| Up hill / Down hill / Slope | `A06_salita` / `A05_discesa` | ✓ |
| Bump / Dip / Compression / Ditch | `A10_cunetta` / `A11_dosssi` / `A12_dosso` | ≈ |
| Hole | `A13_buco` | ✓ |
| Twisty / sinuous | `A14_twist` (+ `s20`→`W03`) | ✓ |
| Rocks | `A15_roccie` | ✓ |
| Sandy | `t06_sand` | ✓ |
| Stone / stony / Gravel | `T01_terreno_pietroso` | ≈ |
| Wading / water cross | `T02_terreno_inondato` | ≈ |
| Summit / Ruts / Bumpy-broken | — (parziale via `A*`) | ✗/≈ |

---

## 4. Riferimenti ambientali (SYMBOLS)

| FIA | RDBK | Stato |
|---|---|---|
| Rail road | `P06_ferrovia` | ✓ |
| Bridge (above/under) | `P07_ponte` | ≈ |
| Fence gate | `p05_cancello` | ≈ |
| Buildings / houses / Village | `P01_centro_abitato` / `P02_gruppo_case` | ✓ |
| Ruine / abandoned | `P04_rovina` | ✓ |
| Fort / castle / Tower / Antenna | `P12_torre_atalaya` | ≈ |
| Tanks / Silos | `P13_silos` | ≈ |
| Petrol station & fuel | `I10_stazione_servizio` | ✓ |
| Animals (individual / herd) | `I03_animali` | ✓ |
| Tree | `P08_albero` | ✓ |
| Palm tree | `P09_pino` | ≈ |
| Vegetation | `P11_bosco` | ≈ |
| River (water) | `t04_river` | ✓ |
| Lake / puddle | `P14_estanque` | ✓ |
| Small / Large / Sandy wadi | `T05_rambla` | ✓ (sandy ≈) |
| Road works | `W26_road_works` | ✓ |
| Towards / direction | `junctions[]` (vettori bivio) | ⊘ |
| **Mancanti:** Fence, Barbed fence, Post, Electric pole/line, High-voltage tower, Well, Barrels, Tires, Sign posts, Restricted area, Church/mosque, Cemetery, Bivouac, Tunnel, Pipeline, Wall, Native camp, Monument, Cairn, Mountain, Camel grass, Plain/chott, Notable elements, Reset/recal trip, Distance | — | ✗ |

> RDBK ha inoltre pittogrammi **non** nel lexicon FIA (utili al roadbook generalista):
> escursionisti `I04`, bici/moto `I05`, acqua potabile/non `I07`/`I06`, meccanico `I08`,
> parcheggio `I09`, ristoro `I11`, medico `I12`, controlli frequenti `i14`, albero secco `P10`,
> capannone `p15`, pannelli solari `p16`, campo da calcio `p17`, canaloni `A07`–`A09`.

---

## 5. Tipi di waypoint · CAPS · dune · controlli (non rappresentati)

Queste aree del lexicon FIA non hanno corrispondenza grafica in RDBK; alcune sono coperte
solo parzialmente dal modello dati.

| Area FIA | Elementi | RDBK |
|---|---|---|
| **Tipi di WP** | Masked · Control · Security · Navigation · Precise · Visible · Eclipse · WP number | ✗ (la nota non tipizza il waypoint) |
| **CAPS** | Exit cap · Average cap · Calculated cap (HP) · Cap that turns | ⊘ parziale — un solo `cap`/`cap_distance`, senza tipizzazione |
| **Dune / sabbia** | Sandy plain · Big bowl "cuvette" · Sand spit · Dune · Broken dune · Many dunes · Small dune "dunette" · Dunes difficulty level · Concrete pass | ✗ |
| **On-track / direttive** | Principal/Parallel track · Sight driving! · Off track forbidden · Follow principal/road · Low-visible track | ✗ (il *tipo* strada è `road_type` 0–4, non i glifi direttivi) |
| **Controlli di gara** | Start/Arrival SS · Check point · Neutralisation · Transfer · Time control · Assistance · Tyre/Fuel zone · End zone | ✗ |
| **Abbreviazioni** | VG, L/R, KpL, ET, NBX, BIG/SMALL, … (testo) | ✗ (testo libero nella nota) |

---

## 6. Sintesi e raccomandazioni

**Coperto bene:** segnali stradali (completi via set Vienna), terreno/altimetria, superficie,
acqua, animali, riferimenti edilizi principali. I cartelli della Roadbook Suite trovano ora
**tutti** un equivalente (vedi [editor.md §9.5](editor.md)).

**Gap principali verso la piena compliance FIA**, in ordine di utilità:
1. **Pittogrammi ambientali desertici/rally** mancanti (recinzioni, pali/linee elettriche,
   pozzo, monumento, cairn, montagna, chott, tunnel, bivacco…). → estendere la palette `P*`.
2. **Dune / sabbia** — categoria assente; rilevante solo per rally-raid sahariani.
3. **Tipi di waypoint** e **CAPS tipizzati** — richiedono un'estensione del *modello dati*
   `.rdbk` (non solo icone), quindi una decisione di formato.
4. **Controlli di gara** (SS/CP/neutralizzazioni/zone) — anch'essi modello dati, fuori dallo
   scopo attuale del roadbook generalista.

> Nota di scopo: RDBK è un roadbook **multi-disciplina** (4x4, moto, bici, running), non solo
> FIA cross-country. La compliance grafica sui **segnali e sul terreno** è raggiungibile con
> sole icone; la compliance sul livello **operativo di gara** (WP typing, CAPS, controlli)
> implica estendere il formato `.rdbk` ed è una scelta di prodotto da valutare a parte.
