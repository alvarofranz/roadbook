# Reader — Navegar un roadbook con GPS

El **Reader** es el copiloto digital: carga un roadbook y lo convierte en una tabla de notas estilo papel guiada por el GPS. Odómetros medidos a lo largo de la ruta, validación automática o manual, un informe al final del recorrido y — en la competición de un evento — un resultado firmado para la clasificación.

> La navegación y la validación funcionan 100% sin conexión. La conexión solo hace falta para iniciar sesión, para cargar un roadbook de tu perfil o de la galería pública y para guardar el informe.

---

## 1. Cargar un roadbook

Abre el Reader (`/reader/`). La pantalla inicial ofrece:

| Entrada | Qué pasa |
|---------|----------|
| **Cargar archivo .rdbk** | Importa un roadbook completo (traza + notas + iconos) |
| **Abrir desde Mis roadbooks** | Elige uno de los roadbooks guardados en tu perfil (con sesión iniciada) |
| **Galería pública** | Los roadbooks públicos, justo debajo: toca uno para abrirlo |

**Desde un enlace**: `/reader/<slug>` abre un roadbook público, `?rb=<id>` uno tuyo.

> Para abrir un roadbook público tienes que haber iniciado sesión.

Un roadbook se abre primero en **vista previa de solo lectura**: la lista de notas, sin GPS. Quizá solo quieras mirarlo. Toca **Navegar** para empezar.

---

## 2. Empezar un recorrido

**Navegar** abre el diálogo de inicio:

| Opción | Descripción |
|--------|-------------|
| **Grabar una traza GPX** | Registra la traza GPS del recorrido (a prueba de cierres) |
| **Sonido en cada nota** | Una campanilla en cada nota validada, una fanfarria en la última. Suena por encima de tu música en lugar de pararla |
| **Mando externo** | Avanza con un pedal o un clicker Bluetooth (ver §4) |

No hay modo que elegir: un roadbook abierto desde un evento que lo **puntúa** va en **competición** (se pide tu número de vehículo, se aplican penalizaciones, el resultado firmado va a la clasificación del evento); todo lo demás va como **viaje**.

---

## 3. La pantalla de navegación

El Reader ocupa toda la pantalla:

1. **Barra del odómetro** arriba: título, total (*prog.*) sobre el parcial (*parc.*), rumbo, hora, estado del GPS y velocidad
2. **Lista de notas**: una fila por nota, en tres columnas — distancia total y parcial con el número de la nota (y su tipo de waypoint, si lo tiene) · la viñeta · el texto, el CAP, el límite de velocidad y las coordenadas
3. **Barra de acciones** abajo: interruptor **Auto** · **Mapa de la nota** · **Pausa** · GPX · **Finalizar** · **Terminar**

Estados de las notas: **alcanzada** (verde) · **saltada** (rosa) · **activa** (borde rojo) · pendiente (blanca). Al acercarte a la nota activa se vuelve **azul** y muestra la distancia que falta, en km con dos decimales.

Cuando se valida una nota, la siguiente sube **arriba del todo en la lista**: la carretera de delante tiene todo el espacio.

### Distancias a lo largo de la ruta
La distancia que falta se mide **a lo largo de la carretera**, como los parciales del propio roadbook, no en línea recta: el parcial recorrido más la distancia que falta es siempre igual al parcial de la nota. En cada cambio de nota los dos odómetros se reajustan sobre la ruta, así que el parcial marca 0.00 justo en la nota.

---

## 4. Avance: automático o manual

### Automático (por defecto)
La nota activa se valida en cuanto entras en su **radio de validación**.

- El radio viene de la nota (`wp_radius`), luego del valor por defecto del roadbook, luego de su tipo de waypoint, luego 30 m; nunca baja de 18 m, por encima del ruido del GPS
- Se comprueba el **tramo recorrido entre dos posiciones GPS**, no solo las posiciones: a velocidad un teléfono avanza 25 m entre dos de ellas, y un waypoint estrecho se colaría entre medias
- Una posición de la que el teléfono no está seguro (poca precisión) se ignora: no puede validar una nota ni sumar distancia

### Manual
Apaga **Auto**: entonces un toque **en cualquier punto de la fila de la nota activa** la marca hecha (el objetivo es toda la fila, ningún botón pequeño al que apuntar en marcha). Con Auto encendido solo valida el GPS.

- En competición una validación manual exige estar a menos de 100 m de la nota, más el margen que necesite la precisión del GPS
- Tocar **otra** nota lleva el recorrido allí y pregunta antes: las notas intermedias quedan sin validar, y en competición cada nota puntuada saltada cuesta 450 puntos
- En competición no se puede volver a una nota ya validada

### Manos libres con un mando externo
Marca **Mando externo** en el diálogo de inicio para avanzar sin tocar la pantalla.

- Un **pedal pasapáginas** Bluetooth, un disparador de cámara o un mando de presentaciones se empareja como teclado: nada que configurar, funciona sin conexión, en el navegador y en la app
- **Avanzar**: → · ↓ · Av Pág · Espacio · Intro — **Atrás**: ← · ↑ · Re Pág (solo en viaje: en competición una nota validada no se deshace)
- El ajuste se recuerda en el dispositivo, y las teclas se ignoran mientras escribes o con un diálogo abierto

---

## 5. Mapa de la nota

Solo si el roadbook permite el mapa: **Mapa de la nota** en la barra de acciones abre un minimapa bajo la nota activa; tócalo otra vez para cerrarlo.

- Muestra la traza, tu posición en directo y, en la esquina, el número de la nota con la distancia que falta
- Te guía **una línea amarilla**: la carretera que queda hasta la nota
- Cuando se valida la nota, el mapa te sigue a la siguiente

---

## 6. Pausa, finalizar, terminar

| Botón | Qué hace |
|-------|----------|
| **Pausa** | Detiene el GPS y el bloqueo de pantalla encendida para ahorrar batería (una parada para comer); los odómetros no avanzan en pausa |
| **Finalizar** | Cierra el recorrido y abre su informe. Antes de la última nota pregunta antes: las notas no alcanzadas cuentan como saltadas |
| **Terminar** (el icono de salida) | Abandona el recorrido sin informe, tras una confirmación |

---

## 7. El informe del recorrido

Cada recorrido termina con su **informe**: notas alcanzadas y saltadas, zonas con límite de velocidad, tiempo y distancia. Arriba está la tarjeta del recorrido, debajo el botón **Compartir** y un solo interruptor para dejarlo **Privado** o hacerlo **Público** (visible en tu perfil `/u/<username>`). Compartir antes de elegir pregunta antes, porque compartir hace público el recorrido.

El informe se guarda primero en el dispositivo y se sube en cuanto hay conexión.

### En competición — el resultado firmado
Un recorrido en competición produce además un **resultado firmado con HMAC** (un QR que puedes compartir o descargar) y entra en la clasificación compartida del evento, donde los organizadores lo verifican.

---

## 8. Recuperar una sesión interrumpida

El recorrido se guarda solo en el dispositivo. Si se interrumpe (una llamada, un cierre inesperado, el teléfono que cierra la app), en la siguiente visita el Reader pregunta **¿Reanudar el recorrido en curso?** y sigue exactamente donde estabas. Una traza GPX que se estaba grabando se recupera igual.

> Rechazar no borra nada, y la pregunta no vuelve para ese recorrido. Nunca se hace cuando el enlace indica otro roadbook.

---

## 9. Siguiente paso

¿Terminaste de navegar? → [Tripmaster: ordenador de a bordo GPS →](05-tripmaster.md)
¿Quieres crear un roadbook? → [Editor: crear/editar →](03-editor.md)
