# Roadbook Recorder — Grabar una trazada GPS en vivo

El **Recorder** es la herramienta que usar **en el terreno**. Graba la trazada GPS y te permite dejar notas, fotos geotaggeadas y notas de voz por el camino. El resultado es un draft que pasa al Editor para convertirse en el roadbook definitivo.

> Funciona **100% offline** para el GPS, las notas, las fotos y las notas de voz. Las fotos se quedan en una cola local hasta que haya red. Solo se necesita conexión para iniciar sesión, subir las fotos y guardar en tu perfil.

---

## Secuencia completa: desde la apertura hasta el guardado

### 1. Abre el Recorder

Abre el **Recorder** desde la barra de pestañas (el icono ⏺) o ve directamente a `/recorder/`.

> ![Inicio del Recorder](../assets/screenshots/rec01.jpg)

La pantalla inicial explica lo que hace el Recorder y muestra en vivo el **estado del GPS**: *Buscando GPS…*, *GPS demasiado débil para grabar* o *GPS listo* con su precisión (±m). **Empezar a grabar** solo se activa cuando el GPS es lo bastante bueno para grabar, así que una grabación nunca empieza a ciegas. Si no has iniciado sesión, un aviso te dice que la ruta y sus fotos esperan en tu dispositivo y que **Guardar** te pedirá iniciar sesión — puedes grabar igualmente.

> Los **admins** pueden empezar sin esperar al GPS (el botón lo indica) — útil en un ordenador, que no tiene: se guarda cada fix sea cual sea su precisión, y una nota sin ningún fix se coloca donde está centrado el mapa.

---

### 2. Empieza

Toca **Empezar a grabar**. La grabación empieza al instante: no hay nada que rellenar — el roadbook recibe su nombre más tarde, en el Editor.

---

### 3. Dashboard live — la grabación está en curso

> ![Dashboard de grabación](../assets/screenshots/rec03a.jpg)

Arriba, la barra de estado (hora · batería · precisión GPS) y cuatro indicadores:

| Elemento | Qué ves |
|----------|---------|
| **Tiempo** | Duración de la grabación (sin contar las pausas) |
| **km/h** | Velocidad actual |
| **Notas** | Número de notas colocadas |
| **km** | Distancia recorrida |

Debajo están los botones de captura (paso 4) y el mapa live (paso 5). **Pausa** y **Terminar** están en una barra abajo, cada uno a media anchura; en el móvil esa barra flota justo encima de la barra de pestañas.

---

### 4. Enriquece la trazada durante el recorrido

> ![Botones de captura](../assets/screenshots/rec04a.jpg)

La fila de captura tiene tres columnas, de la misma altura: la gran **Nota** (40%), las capturas (40%: **Foto** encima de **Nota de voz**) y los dos interruptores del mapa (20%: **Estilo de mapa** encima de **Rumbo arriba**).

| Botón | Acción | Cómo se usa |
|-------|--------|-------------|
| **📍 Nota** | Coloca una nota en tu posición GPS | Toca: la nota se coloca al instante. Suena una campanilla de éxito y aparece un gran check verde durante menos de un segundo. No hay nada que escribir — el texto de la nota se escribe después en el Editor |
| **📷 Foto** | Hace una foto geotaggeada | Abre la cámara trasera. La nota se coloca donde estabas al pulsar **Foto**, y la foto se engancha allí; la campanilla y el gran check verde llegan cuando la foto queda guardada en el dispositivo. Si cierras la cámara sin hacer la foto, no se coloca nada |
| **🎤 Nota de voz** | Graba una nota de voz | **Mantenlo pulsado** mientras hablas — el botón se pone rojo con los segundos; **suéltalo** y se detiene (como mucho un minuto). La nota se coloca donde estabas al pulsarlo; la campanilla y el gran check verde llegan al soltarlo, cuando el sonido queda guardado. Una grabación de menos de 2 segundos (o una pulsación corta) no coloca nada y avisa *Graba mínimo 2 segundos de audio para asignarlo a la nota.* Solo se guarda el sonido, sin transcripción: se convierte en el extra **Nota de voz** de la nota y, cuando navegas el roadbook, suena sola antes de que llegues a la nota (100 m antes, o la distancia que el autor fije en el Editor) |
| **🗺 Estilo de mapa** | Cambia el mapa base | Satélite ↔ topográfico |
| **➤ Rumbo arriba** | Orientación del mapa | El mapa gira con tu rumbo (encendido) o se queda con el norte arriba |

La barra inferior contiene los otros dos:

| Botón | Acción |
|-------|--------|
| **⏸ Pausa** | Suspende la grabación (paradas, esperas). Toca otra vez para reanudar |
| **🏁 Terminar** | Termina la grabación (paso 6) |

> **Consejo**: toca **Nota** en cada cruce, peligro o cambio de carretera sin apartar la vista del camino, y añade las palabras después en el Editor. Mantén pulsado **Nota de voz** al menos 2 segundos cuando unas pocas palabras lo digan mejor — las volverás a oír en la carretera. **Foto** y **Nota de voz** colocan la nota donde las pulsaste, aunque cuando la foto o el sonido quedan guardados ya estés más adelante. En ruta no hay deshacer: una nota colocada por error se borra en un segundo en el Editor.

---

### 5. Mapa live

> ![Mapa live](../assets/screenshots/rec05.jpg)

- La trazada es una **línea continua**
- Las notas son **puntos azules numerados**
- Las fotos tienen un **pin 📷**
- Arriba a la izquierda, en grande y sin etiqueta: la **distancia desde la última nota** (km, dos decimales; desde la salida antes de la primera nota)
- Tu marcador GPS se convierte en un **chevron** direccional cuando estás en movimiento

---

### 6. Termina la grabación

Toca **Terminar** (barra inferior) y confirma.

> ![Fin de la grabación](../assets/screenshots/rec06a.jpg)

Un diálogo muestra un breve resumen (km · notas · fotos) y hace una sola pregunta, con dos botones:

| Botón | Qué sucede |
|-------|------------|
| **💾 Guardar** | Con sesión iniciada: la grabación se guarda como **draft** de roadbook (con sus fotos y notas de voz) y el **Editor se abre** sobre ella al instante. Sin sesión: te lleva a la página de inicio de sesión y, una vez dentro, vuelves y se guarda del mismo modo; luego se abre el Editor |
| **🗑 Descartar** | Pide confirmación, nombrando lo que se perdería (trazada, notas, fotos), y luego descarta la grabación |

Aquí no hay botones de exportación: exportar (GPX, `.rdbk`, PDF…) se hace después desde el Editor.

> El diálogo no se cierra tocando fuera de él. Hasta que guardes o descartes, la grabación está a salvo — aunque la app se cierre de golpe, se te vuelve a ofrecer en la siguiente visita.

---

### 7. En el Editor

El Editor se abre con la trazada, las notas, las fotos y las notas de voz ya en su sitio: ponle nombre al roadbook, escribe el texto de las notas, escucha una nota de voz en la pestaña **Nota de voz** de su nota (y fija cuántos metros antes de la nota suena) y expórtalo si quieres. El draft queda guardado y también lo encuentras en **Mis roadbooks**.

## Comportamiento offline

| Qué | Con sesión + online | Con sesión + offline | Sin sesión |
|-----|---------------------|----------------------|------------|
| Trazada GPS | ✅ local + checkpoint | ✅ local + checkpoint | ✅ local + checkpoint |
| Notas y notas de voz | ✅ local | ✅ local | ✅ local |
| Fotos | ✅ cola → subida | ✅ cola local | ✅ cola local |
| Draft en el servidor | creado/actualizado en vivo | creado en la primera subida | creado al pulsar **Guardar**, tras iniciar sesión |
| Recuperación tras un cierre | ✅ automática | ✅ automática | ✅ automática |

---

## Recuperación de una sesión interrumpida

El Recorder guarda la sesión en tiempo real. Si la app se cierra (una llamada, un cierre inesperado, la batería), en el siguiente arranque te propone **reanudar** la grabación donde la dejaste. Rechazarlo **no la borra**: la grabación se queda en el dispositivo y solo se sustituye cuando empiezas una nueva.

---

## Siguiente paso

¿Tienes la trazada grabada? → [Editor: crea/modifica un roadbook →](03-editor.md)  
¿Quieres navegar? → [Reader: navega con GPS →](04-reader.md)
