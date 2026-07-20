# Roadbook Recorder — Grabar una trazada GPS en vivo

El **Recorder** es la herramienta que usar **en el terreno**. Registra la trazada GPS y te permite enriquecerla con waypoint, fotos geotaggeadas y notas de voz. El resultado es un draft que pasa al Editor para la creación del roadbook definitivo.

> Funciona **offline** al 100% para GPS + waypoint + media. Los media se quedan en cola local hasta que haya red. Se necesita conexión solo para: login inicial, subida diferida, guardado en el perfil.

---

## Secuencia completa: desde la apertura hasta el guardado

### 1. Abre el Recorder

Abre el **Recorder** desde el menú principal o ve directamente a `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Verás la pantalla inicial con el botón **Start recording**. Si no has iniciado sesión, aparece un aviso: *"Foto y audio requieren login"* — puedes grabar igualmente, pero los media se quedarán solo en el dispositivo.

---

### 2. Inicia una nueva grabación

Toca **Start recording**.

> ![Nombre de sesión](../assets/screenshots/rec02.jpg)

Se abre un modal para el **nombre** de la sesión (por defecto: fecha/hora `YYYY-MM-DD HH-MM`). Puedes cambiarlo. Toca **Confirma**.

---

### 3. Dashboard live — la grabación está en curso

El dashboard live muestra todos los datos en tiempo real:

> ![Dashboard de grabación](../assets/screenshots/rec03a.jpg)

| Elemento | Qué ves |
|----------|-----------|
| **Tiempo** | Duración de la grabación (excluidas pausas) |
| **Velocidad** | Velocidad instantánea + máxima |
| **Waypoint** | Contador de waypoint colocados |
| **Distancia** | Km recorridos |
| **Mapa** | Mapa heading-up (marcha arriba) con trazada y waypoint |

> El mapa es **heading-up** por defecto — la dirección de marcha siempre apunta hacia arriba. Toca el control arriba a la derecha para fijarlo al Norte.

---

### 4. Enriquece la trazada durante el recorrido

Durante la grabación tienes a disposición 4 botones:

| Botón | Acción | Cómo se usa |
|----------|--------|-------------|
| **⏸ Pause** | Suspende GPS y cronómetro | Toca para pausar (paradas, esperas). Reanuda con el mismo botón |
| **📍 Waypoint** | Crea un waypoint en la posición GPS actual | Toca → escribe el texto (se autocierra en 5 s). Usa el micrófono para dictar |
| **🎤 WP audio** | Graba clip de voz | **Mantén pulsado** para grabar. Suelta → cuenta atrás 5→0 → guarda. En escritorio transcribe automáticamente |
| **📷 WP Foto** | Dispara foto geotag | Abre la cámara trasera. La foto se engancha a la posición GPS actual |

> ![Botones de waypoint y media](../assets/screenshots/rec04a.jpg)

> **Consejo**: usa **Waypoint** para referencias escritas (cruces, peligros, cambios de carretera), **WP audio** para notas largas mientras conduces, **WP Foto** para señales y puntos visuales.

---

### 5. Mapa live

> ![Mapa live](../assets/screenshots/rec05.jpg)

- La trazada es una **línea continua**
- Los waypoint son **puntos azules numerados**
- Las fotos tienen un **pin 📷**
- Tu marcador GPS se convierte en un **chevron** direccional cuando estás en movimiento
- Toca un waypoint/foto → info y acciones (eliminar, editar texto)

---

### 6. Fin de la grabación

Toca **Finish** para terminar la grabación.

> ![Resumen de grabación](../assets/screenshots/rec06a.jpeg)

Se abre el modal de resumen con los datos de la sesión: puntos de recorrido, km, waypoint, fotos. Aquí eliges qué hacer:

| Opción | Cuándo usarla | Qué sucede |
|---------|---------------|--------------|
| **💾 Save to server** | Estás logueado y quieres recuperar todo en el perfil | Guarda el **draft** en el servidor (trazada + waypoint + media). Sigues en el Recorder con el botón **Edit** para abrir en el Editor |
| **📦 Export .rdbk** | Quieres un archivo portátil offline | Crea un `.rdbk` ZIP (roadbook.json + fotos + audio). Descarga el archivo |
| **✏️ Open in Editor** | Quieres refinar ya la ruta | Pasa trazada y waypoint al Editor. Las fotos ya en el servidor permanecen enlazadas |
| **📍 Export GPX** | Te sirve solo para otro software | Descarga `.gpx` estándar (trazada + waypoint con nombre). Fotos y audio **no** incluidos |

> 📸 *Screenshot: opciones de guardado — Save to server, Export .rdbk, Open in Editor, Export GPX*

> **Buenas prácticas**: si estás logueado → **Save to server** → luego **Open in Editor**.  
> Si no estás logueado → **Export .rdbk** → luego en casa: login → Editor → importa `.rdbk` → Save to profile.

---

### 7. Tras el guardado

Si elegiste **Save to server**, el Recorder muestra el botón **Edit** que te lleva directamente al Editor con la trazada y los waypoint ya cargados. El draft queda guardado y lo recuperas también en **I miei roadbook** desde el menú principal.

## Comportamiento offline

| Qué | Logueado + online | Logueado + offline | Sin login |
|------|------------------|-------------------|----------|
| Trazada GPS | ✅ local + checkpoint | ✅ local + checkpoint | ✅ local + checkpoint |
| Waypoint de texto | ✅ local | ✅ local | ✅ local |
| Foto | ✅ cola → subida | ✅ cola local | ✅ cola local |
| Audio | ✅ cola → subida | ✅ cola local | ✅ cola local |
| Draft servidor | creado/actualizado live | creado en el primer flush | nunca creado |
| Recuperación post-crash | ✅ automática | ✅ automática | ✅ automática |

---

## Recuperación de sesión interrumpida

El Recorder guarda la sesión en tiempo real. Si la app se cierra (llamada, crash, batería), al siguiente arranque te propone:

1. **Resume** — reanuda la grabación desde donde la dejaste
2. **Recupero GPX** — si la sesión se perdió, recupera la trazada GPX huérfana
3. **Partir limpio** — ignora y recomienza

> 📸 *Screenshot: modal de recuperación de sesión interrumpida*

> Rechazar el resume **no borra** la sesión: se sobrescribe solo cuando inicias una nueva grabación o sales con "End the trip".

---

## Atajos de teclado (escritorio)

| Tecla | Acción |
|-------|--------|
| `Espacio` | Waypoint (requiere fix GPS) |
| `A` | WP audio (mantener pulsado) |
| `F` | WP Foto |
| `P` | Pause / Resume |
| `Esc` | Finish / cerrar modal |

---

## Siguiente paso

¿Tienes la trazada grabada? → [Editor: crea/modifica un roadbook →](03-editor.md)  
¿Quieres navegar? → [Reader: navega con GPS →](04-reader.md)
