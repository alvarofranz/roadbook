# Roadbook Recorder — Grabar una trazada GPS en vivo

El **Recorder** es la herramienta que usar **en el terreno**. Registra la trazada GPS y te permite dejar notas y fotos geotaggeadas por el camino. El resultado es un draft que pasa al Editor para la creación del roadbook definitivo.

> Funciona **offline** al 100% para GPS + waypoint + media. Los media se quedan en cola local hasta que haya red. Se necesita conexión solo para: login inicial, subida diferida, guardado en el perfil.

---

## Secuencia completa: desde la apertura hasta el guardado

### 1. Abre el Recorder

Abre el **Recorder** desde el menú principal o ve directamente a `/recorder/`.

> ![Recorder start](../assets/screenshots/rec01.jpg)

Verás la pantalla inicial con el botón **Start recording**. Si no has iniciado sesión, aparece un aviso: *"Sin sesión: la ruta y sus fotos esperan en este dispositivo, y Guardar te pide iniciar sesión."* — puedes grabar igualmente.

---

### 2. Inicia una nueva grabación

Toca **Start recording**.

> ![Nombre de sesión](../assets/screenshots/rec02.jpg)

Se abre un modal para el **nombre** de la sesión (por defecto: fecha/hora `YYYY-MM-DD HH-MM`). Puedes cambiarlo. Toca **Confirma**.

---

### 3. Dashboard live — la grabación está en curso

Durante la grabación, la pantalla muestra arriba cuatro indicadores:

> ![Dashboard de grabación](../assets/screenshots/rec03a.jpg)

| Elemento | Qué ves |
|----------|-----------|
| **Tiempo** | Duración de la grabación (excluidas pausas) |
| **km/h** | Velocidad actual |
| **Notas** | Número de notas colocadas |
| **km** | Distancia recorrida |

Debajo están los botones de captura (paso 4) y el mapa live (paso 5). **Pause** y **End** están en una barra abajo, cada uno a media anchura; en el móvil esa barra flota justo encima de la barra de pestañas inferior.

---

### 4. Enriquece la trazada durante el recorrido

La fila de captura tiene un botón grande **Nota** a la izquierda y, a su derecha, una cuadrícula 2×2 de botones con icono de su misma altura:

| Botón | Acción | Cómo se usa |
|----------|--------|-------------|
| **📍 Nota** | Coloca una nota en la posición GPS actual | Toca: la nota se coloca al instante (requiere fix GPS). Suena una campanilla de éxito y aparece en pantalla un gran check verde durante menos de un segundo. No hay nada que escribir: el texto de la nota se escribe después en el Editor |
| **📷 Foto** | Dispara una foto geotag | Abre la cámara trasera. La foto se engancha a la posición GPS actual y siempre coloca también una nota allí |
| **↩ Deshacer última nota** | Elimina la última nota | Pide confirmación antes, nombrando la nota que elimina |
| **🗺 Estilo del mapa** | Cambia el mapa base | Satélite ↔ topográfico |
| **🧭 Heading up** | Orientación del mapa | El mapa gira con tu rumbo (heading up) o se queda con el norte arriba |

La barra inferior contiene los otros dos:

| Botón | Acción |
|----------|--------|
| **⏸ Pause** | Suspende GPS y cronómetro (paradas, esperas). Toca otra vez para reanudar |
| **🏁 End** | Termina la grabación (paso 6) |

> ![Botones de waypoint y media](../assets/screenshots/rec04a.jpg)

> **Consejo**: toca **Nota** en cada cruce, peligro o cambio de carretera sin apartar la vista del camino, y añade las palabras después en el Editor. Usa **Foto** para señales y puntos visuales.

---

### 5. Mapa live

> ![Mapa live](../assets/screenshots/rec05.jpg)

- La trazada es una **línea continua**
- Las notas son **puntos azules numerados**
- Las fotos tienen un **pin 📷**
- Arriba a la izquierda, en grande y sin etiqueta: la **distancia desde la última nota** (km, dos decimales; desde la salida antes de la primera nota)
- Tu marcador GPS se convierte en un **chevron** direccional cuando estás en movimiento

---

### 6. Fin de la grabación

Toca **End** (barra inferior) y confirma para terminar la grabación.

> ![Resumen de grabación](../assets/screenshots/rec06a.jpeg)

Un diálogo muestra un breve resumen (km · notas · fotos) y hace una sola pregunta, con dos botones:

| Botón | Qué sucede |
|--------|--------------|
| **💾 Guardar** | Con sesión iniciada: la grabación se guarda como **draft** de roadbook (con sus fotos) y el **Editor se abre** sobre él al instante. Sin sesión: te lleva a la página de inicio de sesión y, una vez dentro, vuelves y se guarda del mismo modo; luego se abre el Editor |
| **🗑 Descartar** | Pide confirmación, nombrando lo que se perdería (trazada, notas, fotos), y luego descarta la grabación |

Aquí no hay botones de exportación: exportar (GPX, `.rdbk`, PDF…) se hace después desde el Editor.

> El diálogo no se cierra tocando fuera de él. Hasta que guardes o descartes, la grabación está a salvo: aunque la app se cierre de golpe, se te vuelve a ofrecer en la siguiente visita.

---

### 7. En el Editor

El Editor se abre con la trazada, las notas y las fotos ya cargadas: ponle nombre al roadbook, escribe el texto de las notas y expórtalo si quieres. El draft queda guardado y lo recuperas también en **Mis roadbooks** desde el menú principal.

## Comportamiento offline

| Qué | Logueado + online | Logueado + offline | Sin login |
|------|------------------|-------------------|----------|
| Trazada GPS | ✅ local + checkpoint | ✅ local + checkpoint | ✅ local + checkpoint |
| Notas | ✅ local | ✅ local | ✅ local |
| Foto | ✅ cola → subida | ✅ cola local | ✅ cola local |
| Draft servidor | creado/actualizado live | creado en el primer flush | creado al pulsar **Guardar**, tras iniciar sesión |
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

## Siguiente paso

¿Tienes la trazada grabada? → [Editor: crea/modifica un roadbook →](03-editor.md)  
¿Quieres navegar? → [Reader: navega con GPS →](04-reader.md)
