# Gestión de eventos

Los **Eventos** te permiten organizar rallies, encuentros y competiciones basados en roadbooks en RDBK.app. Un evento reúne roadbooks, participantes y (opcionalmente) puntuaciones — todo bajo un mismo techo.

> Para crear eventos necesitas el **rol de organizador**. Consulta [Primeros pasos →](01-getting-started.md) o pregunta a un administrador.

---

## 1 Preparación del evento

---

## 1.1 Rol de organizador — Requisitos

La creación de eventos está restringida a usuarios con **rol de organizador**.

| Paso | Qué sucede |
|------|------------|
| **Solicitar** | Desde la [página de eventos](/features/events/) haz clic en *Solicitar rol de organizador* y presenta brevemente la propuesta del evento — la app envía un email al administrador. |
| **Conceder** | Un administrador activa el flag en el panel de Admin. |
| **Ya estás dentro** | *Gestión de eventos* aparece en tu menú de cuenta. |

---

## 1.2 Crear un evento

Inicia sesión y ve a **Menú / Gestión de eventos**; luego haz clic en *Nuevo evento*.

| Campo | Notas |
|-------|-------|
| **Título** | Nombre público del evento. |
| **Descripción** | Describe el evento; este texto será visible en la página del evento. |
| **Inicio / Fin** | Ventana del evento (selector de calendario). |
| **Visibilidad** | **Público** — listado en `/events/`, cualquiera puede encontrarlo.<br>**Privado** — accesible solo mediante enlace directo `/event/<slug>`. |
| **Sitio del organizador** | Enlace opcional mostrado en la página del evento. |
| **Sede del evento** | Coloca un pin en el mapa — se muestra en la página del evento. |
| **Logo** | Subido, convertido automáticamente a AVIF a 512 px. |

Una vez guardado, el evento tiene su propia página en `/event/<slug>` y tú eres el **propietario**.

---

¡Ahora completa el evento!

---

## 1.3 Roles y permisos para el evento

Para gestionar un evento, el organizador puede involucrar a otros suscriptores como co-organizadores. Como equipo pueden compartir roadbooks y gestionar las suscripciones de los participantes para permitirles el uso digital de los roadbooks a través de la plataforma RDBK.app.

Por supuesto, esto es opcional: siempre puedes exportar roadbooks en PDF y distribuir copias impresas.

| Rol | Cómo se obtiene | Qué se puede hacer |
|-----|----------------|-------------------|
| **Propietario** | Creaste el evento | Todo — editar, eliminar, gestionar co-organizadores, cambiar visibilidad |
| **Co-organizador** | Invitado por el propietario | Editar parámetros, añadir roadbooks, gestionar participantes. No puede eliminar ni cambiar visibilidad |
| **Participante (activo)** | Registrado con código + activado | Leer roadbooks listos/públicos, ver clasificaciones |
| **Participante (pendiente)** | Introdujo código, aún no activado | Vista limitada hasta la activación |

### 1.3.1 Añadir co-organizadores

En el editor del evento → sección **Organizadores** → busca por nombre de usuario, nombre, email u organización → añade.
Solo el **propietario** puede añadir o eliminar co-organizadores.

---

## 1.4 Añadir roadbooks

En el editor del evento → sección **Roadbooks** → *Añadir roadbook* → el selector muestra solo **tus** roadbooks.

Cada roadbook tiene un **modo de puntuación**:

| Modo | Uso |
|------|-----|
| **Libre** (por defecto) | Sin puntuación — los participantes siguen la ruta. |
| **Reglas Roadbook-suite** | Clasificación / competición — el Reader puntúa el recorrido. |
| **Reglas FIA** | Mostradas pero aún no implementadas. |

Los roadbooks se pueden reordenar (asas de arrastre) y eliminar. Solo se pueden añadir roadbooks de tu propiedad.

---

## 1.5 Gestionar las inscripciones de participantes

### 1.5.1 Generar un código de acceso

En el editor del evento → **Participantes** → *Generar código*.
Se crea un código de 4–16 caracteres. Puedes personalizarlo. Un enlace corto `/go/<código>` y un QR están automáticamente disponibles.

### 1.5.2 Compartir el código para unirse al evento

Envía el código (o el enlace / QR) a tus participantes. El participante necesitará este código para realizar su registro en el evento (ver punto **2.1.1**).

Las personas que reciban este código podrán preregistrarse al evento, pero deberán ser activadas para poder ver y usar los roadbooks (ver **2.1.1**).

## 2 Ejecución del evento

---

## 2.1 Unirse + activar

Cada participante debe primero unirse al evento y luego ser **activado** por el organizador. La activación garantiza que el organizador confirme personalmente a cada persona — sin autoinscripción automática.

---

### 2.1.1 Cómo se une un participante

Hay dos formas:

| Método | Cómo funciona |
|--------|-------------|
| **A través de la página del evento** | El participante visita `/event/<slug>`, escribe el código de acceso en el formulario y hace clic en *Unirse*. |
| **A través del enlace corto** `/go/<código>` | El organizador imprime el enlace del evento y su código QR y lo coloca en la entrada del mostrador de registro del evento. Los participantes escanean el QR, acceden al sitio y realizan su propia suscripción a la plataforma. Así están listos para el paso de activación, que se completará al finalizar las formalidades de registro (ej. verificación de requisitos y pagos). |

En ambos casos, el servidor genera un **código de activación único de 6 caracteres** (ej. `X3K9M2`) y registra al participante con estado `pending`.

> El enlace `/go/` también activa el **modo participante**: la navegación se limita a las herramientas relacionadas con el evento (Grabadora, Editor, etc. están ocultos) y la página de inicio redirige al evento. Esto mantiene la experiencia enfocada para los asistentes al rally.

---

### 2.1.2 Qué ve el participante después de unirse

Una vez en estado pending, el participante ve una pantalla de activación con:

- Un **código QR** que contiene el código de activación de 6 caracteres
- El código mismo mostrado como texto (ej. `X3K9M2`)
- Un botón *Copiar*
- La instrucción: *"Muestra este QR al organizador del evento para activar tu participación."*

El participante muestra este QR (o lee el código en voz alta) al organizador **en persona** durante el check-in.

---

### 2.1.3 Cómo activa el organizador a cada participante

En la página **Participantes** (`/admin/events/participants/?id=<id>`) el organizador ve una lista de participantes pendientes. La lista **se actualiza automáticamente cada 10 segundos** para que las nuevas solicitudes de inscripción aparezcan en vivo.

Hay tres formas de activar:

| Método | Cómo |
|--------|------|
| **1. Haz clic en *Activar*** | Junto al nombre de cada participante pendiente, haz clic en el botón *Activar*. Instantáneo — sin código necesario. |
| **2. Escribe el código de activación** | En la parte superior de la página, escribe el código de 6 caracteres (ej. `X3K9M2`) en el campo de entrada y presiona Enter. |
| **3. Escanea el código QR** | Haz clic en *Escanear QR* para abrir la cámara del dispositivo. La cámara trasera escanea el QR del participante y el código se autocompleta y envía. Requiere navegador basado en Chromium. |

El organizador también puede **añadir participantes directamente** — busca por nombre de usuario o email y agrégalos con estado `active` en un solo paso, saltando por completo el flujo de pendiente/activación.

---

### 2.1.4 Después de la activación

Una vez que el estado cambia de `pending` a **`active`**, el participante:

- Ve *"Estás participando en este evento"* en la página del evento
- Puede leer todos los roadbooks en estado **listo** o **público**
- Puede usar el Roadbook Reader en modo **Recorrido** o **Competición**

Si el participante se unió a través de `/go/<código>`, su navegación permanece en **modo participante** hasta que vuelva al modo completo a través de *"Cambiar al modo completo"* en el menú de cuenta.

---

## 2.2 Realizar el evento

Los participantes abren los roadbooks en el **Reader** (`/reader/<slug>`):

| Modo | Comportamiento |
|------|---------------|
| **Recorrido** | Sigue la ruta — sin puntuación, sin resultado. |
| **Competición** | Sigue y recibe puntuación. Al final se genera un **QR de resultado** firmado. El QR de resultado contiene los datos del recorrido firmados con el token de cuenta del participante. El organizador recolecta estos QR (captura / foto) para la clasificación. |

---

## 2.3 Clasificación

1. Abre la herramienta **Clasificación** (`/ranking/`) para un roadbook de competición específico.
2. Carga los QR de resultado recolectados de los participantes.
3. La clasificación final se construye automáticamente.

Los enlaces a la clasificación aparecen en la página del evento para participantes activos y organizadores.

---

## 2.4 Gestionar participantes

Desde **Gestión de eventos** → *Participantes* para tu evento:

| Acción | Cómo hacerlo |
|--------|-------------|
| **Listar / buscar** | Tabla paginada con búsqueda. Los participantes pendientes están resaltados. Auto-recarga cada 10 s. |
| **Activar** | Escanea el QR del participante, escribe su código de activación, o haz clic en *Activar*. |
| **Desactivar** | Haz clic en *Eliminar* — el participante pierde el acceso. |
| **Añadir directamente** | Busca usuarios y añádelos sin código de acceso. |
| **Exportar** | Descarga CSV de la lista de participantes. |

---

## 2.5 Página del evento (`/event/<slug>`)

La página pública del evento muestra:

- Logo, título y descripción
- Período
- Enlace al sitio del organizador
- Sede del evento en un mapa
- Galería de roadbooks adjuntos (con badges de estado)
- Formulario de inscripción (para participantes)
- Enlaces a la clasificación (una vez disponibles los resultados)

---

## 2.6 Límites y notas

- Solo los roadbooks **de tu propiedad** pueden añadirse a tu evento (los admin pueden añadir cualquiera).
- Eliminar un evento es permanente — todas las asociaciones de participantes se eliminan.
- El modo de puntuación FIA es un placeholder; usa *Reglas Roadbook-suite* para la competición.
- Los códigos de acceso distinguen entre mayúsculas y minúsculas.

---

## 2.7 Siguiente paso

¿Quieres ver cómo se ve un evento desde la perspectiva de un participante? → [Navegar con el Reader →](04-reader.md)
¿Listo para la puntuación? → [Usar el Tripmaster →](05-tripmaster.md)
