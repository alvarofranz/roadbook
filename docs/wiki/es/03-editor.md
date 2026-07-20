# Editor — Crear y modificar un roadbook

El **Editor** es el centro de creación: aquí transformas una trazada en bruto (o una hoja en blanco) en un roadbook completo con notas, CAP, danger, tipos de carretera, iconos, viñetas tulip.

> **Funciona offline** para edición pura. Se necesita conexión para: login, cargar/guardar en el perfil, subida de fotos/audio, importar challenge públicas, export PDF/GPX (usa librerías lazy-loaded).

---

## Arranque — Elige la fuente

Abre **Editor** (`/editor/`). La landing (`#loadFrom`) ofrece 4 tarjetas + 2 fuentes ocultas:

> 📸 *Screenshot: pantalla inicial del Editor con las 4 tarjetas de fuente (GPX, Draw on the map, .rdbk, Roadbook público)*

| Fuente | Cómo hacerlo | Qué obtienes |
|----------|-----------|--------------|
| **GPX** | Tap "GPX" → elige archivo `.gpx` (opcional `.wpt`) | `RB.parseGPX` → `buildRoadbook` → roadbook con trazada + waypoint |
| **Draw on the map** | Tap "Draw on the map" | Mapa en modo *draw*: los primeros 2 taps crean el roadbook desde cero |
| **.rdbk** | Tap ".rdbk" → elige archivo ZIP/JSON | Importa roadbook completo (media en `pendingMedia`, ver abajo) |
| **Roadbook público** | Tap "Roadbook público" → picker de challenge | **Fork** de un roadbook `public` + `reusable` → nuevo roadbook privado tuyo |

**Fuentes automáticas** (al arrancar, prioridad):
1. `?trip=1` → trazada/waypoint/fotos desde Recorder/Tripmaster vía `sessionStorage`
2. Draft no guardado en `localStorage` (`rb_editor_draft`) → confirmar recuperación
3. `?rb=<id>` → carga tu roadbook guardado (requiere login)

> Importar (GPX, .rdbk, público) **pone a cero la identidad** (`resetIdentity`): `currentRbId=0`, status=`draft`, `reusable=false`. Así no sobrescribes el original por error.

---

## Vista Map — La barra de herramientas

El mapa es el corazón. Barra vertical `.map-tools` (solo ☰ · Undo · Redo visibles; **Move es por defecto**, ningún botón).

> 📸 *Screenshot: mapa del Editor con barra de herramientas vertical y trazada cargada*

### Mode tool (exclusivos)

| Herramienta | Activación | Qué hace |
|------|-------------|---------|
| **Move** (por defecto) | `Esc` o fin de cut/draw | Arrastra **cualquier punto** (trazada O nota). La línea sigue. Métricas recalculadas al soltar |
| **Draw** | Desde landing "Draw on the map" | Tap extiende desde el extremo abierto más cercano. Tap borde de corte abierto → lo cierra |
| **Cut** | Menú ☰ → Cut / tecla `C` | Tap 2 puntos → corta (deja hueco = *gap*). Único mode tool con botón en barra |

### One-shot (menú ☰)

| Herramienta | Función |
|------|----------|
| **Add GPX** | Unión inteligente: si ambos extremos tocan la ruta (≤200m) → sustituye tramo interno; si no, une al extremo más cercano (auto-orienta) |
| **Simplify** | Douglas-Peucker (tolerancia 0,5–50m, por defecto 2m). **Recalcula métricas desde cero** → el total solo puede disminuir. Las notas permanecen en sus vértices (anchors preservados) |
| **Adjust** | Re-grabación live de un tramo (gps-meter compartido). Sustituye el segmento entre `adjP1` y `adjP2` y re-engancha las notas |
| **Undo / Redo** | Snapshot debounced 400ms, máx 30. Ctrl/Cmd+Z / Ctrl+Y (Shift+Z) |

> **Reverse** (inversión del recorrido) está en **Settings** (vista Config), no aquí.

---

## Gestión de cortes abiertos (*gaps*)

Un corte interno deja un **hueco real** (no un segmento). Almacenado como par de **puntos** `{a,b}` (no índices) → sobrevive a desplazamientos de índice.

- **Rellena**: dibuja encima (Draw cierra el gap tocando el borde opuesto)
- **Cierra en recta**: al export/save → `confirmOpenCuts` pide confirmación → cierra como línea recta
- `resolveGaps()` los resuelve en índices bajo demanda

---

## Lista de notas + Editor inline

Columna derecha: filas `.note-mini`. Tap fila → **el editor inline se desplaza** bajo esa fila (único `#noteEditZone` desplazado físicamente). El canvas de viñetas (`#canvasWrap`) se desplaza DENTRO de la celda tulip.

> 📸 *Screenshot: panel de notas con editor inline abierto sobre una nota*

### Campos por nota

| Campo | Cómo se edita | Nota |
|-------|---------------|------|
| **Texto** | `textarea` in place (mantiene el foco) | Actualiza el modelo sin rebuild |
| **Road type** | Select "Road" → fija `road_type_out` | Solo la carretera que **dejas** está autorizada; la llegada se deriva de `road_out` de la nota anterior |
| **Danger** | Select `—` / `!` / `!!` / `!!!` → `n.danger` | 0 = elimina |
| **CAP** | Toggle fila → calcula `bearingDeg` + `haversineM` hacia la nota siguiente | Última nota: nada de CAP |
| **Iconos / Viñeta** | `NoteCanvas` en `#noteCanvas` | Paleta estándar + custom embebidos (ver § abajo) |

### Drag en el mapa (herramienta Move)
La nota se arrastra desde el marcador azul → mueve **vértice de trazada** de debajo → la línea lo sigue. La nota se mueve como un punto de trazada.

### Reordenar / Eliminar
Flechas ↑/↓ (cambia `sel` ±1), `Del` → `delNote` (mínimo 2 notas). **No recentra mapa** (fix #65).

---

## Paleta de iconos

`renderIcons` fusiona:
- **Standard** (`assets/icons/index.json` → `loadStd`)
- **Custom** embebidos en el roadbook (`rb.icons`)

> 📸 *Screenshot: paleta de iconos con categorías y búsqueda live*

Chips de categorías + búsqueda live (`filterIcons`). Tap o **drag&drop** sobre la viñeta para añadir. Custom: `#iconFile` → data-URI. Badge × para eliminar (bloqueado si está en uso).

> Al importar .rdbk de Roadbook Suite: iconos renombrados 1:1 (tabla en `editor.md` §9.5), flip Y + recentrados + ×1.5 (×3 salida/llegada). Iconos sin archivo → fallback `W28_general_danger.svg` + nota en el texto *"Nota: agregar icono <nombre>"*.

---

## Vista Config — Detalles del roadbook

Segunda vista (`showView('config')`), tab `#viewConfig`:

> 📸 *Screenshot: vista Config con campos título, descripción, estado, perfil waypoint*

| Sección | Campos |
|---------|-------|
| **Título / Descripción / Autor / Organización** | `oninput` → `markDirty`, `stampMeta` timbra `modified` (YYYY-MM-DD) en cada save/export |
| **Logo del evento** | `RBImg.toDataURL(f, 256)` → data-URI en `meta.logo` (auto-contenido) |
| **Estado** | `setStatus()`: **draft · ready · public** (ya no binario). Solo `public` publica en galería |
| **Reutilizable** | `cfgReusable` → `reusable` (solo si `public`) — permite fork por otros (#106) |
| **Perfil waypoint** | `cfgProfile` → `meta.profile`: `basic` (por defecto) o `rally` (vocabulario FIA completo) |
| **Radio de validación por defecto** | `cfgWpRadius` → `meta.default_wp_radius` (m) para notas sin `wp_radius` propio |
| **Acceso al mapa en el Reader** | `cfgMapAccess` → `meta.map_access` (false = oculta mapa, ej. carreras) |
| **Fotos** | Galería en mapa + subida geolocalizada + lightbox (ver abajo) |
| **Borrar roadbook** | Solo si `currentRbId > 0` (guardado). `RBConfirmDanger` nombra el título → `rb_delete` (papelera 30 días) |

---

## Fotos: galería en mapa, subida geolocalizada, lightbox

**Requiere roadbook guardado** (`currentRbId > 0` / `draftId`) + login.

> 📸 *Screenshot: galería de fotos en mapa con pin y lightbox abierto*

### Subida (todas confluyen en `addPhotos`)

1. **EXIF GPS** → `RBImg.gps(file)` lee GPS de los primeros 256 KB JPEG. Si está presente → subida inmediata con esas coord
2. **A mano en el mapa** → si falta EXIF (PNG/HEIC/sin GPS): foto en cola → `promptPlacePhoto` → tap en el mapa (cursor de mira, un tap por foto en cola)
3. **Copiar-pegar** (Ctrl/Cmd+V) → listener `paste` → mismo flujo EXIF/pin

### Lightbox
Tap pin / miniatura → visor a pantalla completa (cubre solo el mapa, **no** el panel de notas → sigues editando). Flechas ‹/›, `←`/`→`, `Esc`. Acciones:
- **Waypoint** → crea waypoint en la posición de la foto
- **Move on map** → modo *posiciona* → el próximo tap actualiza coord vía `ph_move`
- **Delete** → `ph_delete` (con confirmación) + actualiza lightbox + pin

---

## Notas de voz (WP audio) — reproductor + transcripción

Server-side (`roadbook_audio`, `audio_list`/`audio_delete`). Aparecen como **reproductor de audio** en la fila de nota más cercana (≤80m). Botón **"➜ texto"** (`transcribeInto`):

> 📸 *Screenshot: reproductor de audio con botón de transcripción en una nota*
- **Whisper** vía `RBTranscribe` (transformers.js/WASM, modelo `Xenova/whisper-tiny`, caché del navegador)
- El audio **no sale del dispositivo**, ningún coste de servidor
- Idioma = `voice_lang` de la cuenta o auto-detectado
- Primer uso: modal de descarga de modelo (~decenas de MB), luego funciona **offline**
- El texto se **añade** a la nota (nunca overwrite)

---

## Export & Save to profile

Botón **Export** → pop-up con todos los formatos. **Save** (guardado de perfil) separado. Cada export cierra pop-up, confirma **una vez** los cortes abiertos, recalcula métricas.

> 📸 *Screenshot: pop-up Export con formatos disponibles (.rdbk, PDF, GPX, OpenRally, KMZ)*

| Formato | Función | Output |
|---------|----------|--------|
| **.rdbk** | `exportRdbk(includeMedia)` | ZIP: `roadbook.json` auto-contenido (`embedUsed` embebe iconos usados, poda los no usados) + opcional `photos/`/`audio/`/`media.json` |
| **PDF** | `exportPdf` | A4 vía `RBPdf.generate` (jsPDF lazy, `rb-pdf.js`) |
| **GPX** | `exportCustomGpx` | Checkbox componibles (Trazada / Waypoint / iconos Garmin / iconos OSMAnd / archivo OpenRally separado) |
| **OpenRally** | `exportOpenRally` | `RB.openRallyDocument` → `…_OR.gpx` (GPX 1.1 + namespace `openrally:`) |
| **KMZ** | `exportKmz` | `RB.kmlDocument` + `RBZip.write({ 'doc.kml': kml })` → `.kmz` |

### embedUsed (regla auto-contenida)
Cada símbolo usado acaba en `rb.icons` como data-URI; los no referenciados → eliminados. Garantiza portabilidad.

### Opciones GPX (issue #34)
Checkbox: **Trazada** (obligatoria para Garmin/OSMAnd), **Waypoint**, **iconos Garmin**, **iconos OSMAnd**, **OpenRally**. Garmin + OSMAnd conviven en un archivo. Naming: `slug_data_WPT_grm_osm_OR.gpx`.

### Save to profile
`doSave` → timbra meta, recalcula, embebe iconos → `RBApi('rb_save')`. Éxito: registra `currentRbId`, pone a cero `dirty`, limpia draft, fija `?rb=<id>` en la URL (reload sigue editando el mismo). **"Save as"** → pone a cero identidad, añade "(copy)", guarda nueva entidad privada.

---

## Co-editing, lock, cierre (#123 · #154 · #166)

| Aspecto | Regla |
|---------|--------|
| **Propiedad** | `setOwnership(isOwner, owner)`: el co-editor ve nota *Solo el propietario puede cambiar la visibilidad*; el save del co-editor **mantiene el estado de publicación del propietario** |
| **Soft lock** | `setLock(lock)`: si `lock.mine===false` → Editor read-only + `lockBanner` (@usuario está modificando). Quien tiene el lock renueva 4 min (`rb_lock_refresh`), libera al cerrar (`sendBeacon` → `rb_lock_release`). Forzable (`rb_lock_force`) |
| **Cierra** | `leaveEditor` (botón `#closeEditor`): cambios no guardados → *Guardar y cerrar · Cerrar sin guardar · Cancelar* → vuelve a la **landing del Editor** (lista de roadbook), no a home; limpia `?rb=`/`/<slug>` |

---

## Arranque, draft, recovery

- `markDirty()` → checkpoint debounced 2s en `localStorage` (`rb_editor_draft`)
- `beforeunload` + `visibilitychange` vacían draft antes de cierre/kill
- **Precedencia de arranque**: `config` → `?trip=1` (Recorder/Tripmaster) → `localStorage` draft (confirmar `RBConfirm`, rechazo **no** borra) → `?export=1` (abre pop-up export al instante) → `?rb=<id>` (carga guardado) → posición por defecto del mapa desde perfil (`default_lat/lon`)

---

## Import .rdbk Roadbook Suite — fidelidad para Ranking

`RB.importRoadbook` convierte: claves italianas → canónicas, `bivio[]→junctions[]` (flip Y), iconos flip Y + recentrados + ×1.5, **recálculo de métricas desde la trazada** (bearing, distancias, tipos de carretera). Para `.rdbk` canónico: **ningún recálculo en import** (campos idénticos).

**Campos Ranking preservados en import:**
- `lat/lon` (accuracy/extra) ✅
- `cap/cap_distance` (penalidad CAP) ✅ — `recomputeCaps` recalcula solo donde `cap!=null`
- `distance/partial_distance` (km, reach) ✅
- `icons` I02_partenza / I01_arrivo (sección de puntuación) ✅
- `icons` Sxx_* (límites de velocidad) ✅

En **export/save**: `recomputeMetrics` engancha notas a la trazada (lat/lon, distance, bearing), `recomputeCaps` realinea CAP activos. Coherente para puntuación.

---

## Límites & quirk

- `makeNote` emite `num: 0` → numeración correcta tras `recomputeMetrics` (las filas lo llaman al instante)
- Autor por defecto puede sobrescribir campo vacío al login (depende del orden de promise `account`)
- `spliceByIndex` re-engancha todas las notas con `nearestIdx` → puede mover nota de forma no intuitiva si la variante pasa cerca de nota "vieja"
- Cortes abiertos → cerrados en línea recta (precedido de `confirmOpenCuts`)
- Fotos requieren roadbook **ya guardado** (`currentRbId > 0` / `draftId`)

---

## Siguiente paso

¿Tienes el roadbook listo? → [Reader: navega →](reader.md)  
¿Quieres un ordenador de a bordo GPS? → [Tripmaster →](05-tripmaster.md)
