# Reader — Navegar un roadbook con GPS

El **Reader** es el copiloto digital: carga un roadbook y lo transforma en una tabla de notas estilo papel guiada por el GPS. Odómetro, brújula CAP, validación automática o manual y — en modo Competition — un QR firmado con el resultado.

> Funciona offline al 100% para navegación y validación. Se necesita conexión solo para: login, cargar roadbook desde el perfil/la galería pública, guardar resultados.

---

## 1. Cargar un roadbook

Abre el Reader (`/reader/`) — la pantalla inicial ofrece 3 entradas:

| Entrada | Cómo hacerlo | Qué sucede |
|----------|-----------|--------------|
| **Carica file `.rdbk`** | Tap "Carica .rdbk" → elige archivo | Importa roadbook completo (trazada + notas + iconos) |
| **I tuoi roadbook** | Tap "I tuoi roadbook" (solo si logueado) | Picker de los roadbook guardados en tu perfil |
| **Roadbook pubblici** | Tap "Roadbook pubblici" | Picker de las challenge públicas de la galería |

**Desde URL** (automático):
- `/reader/<slug>` → carga roadbook público directamente
- `?rb=<id>` → carga un tuo roadbook guardado por ID

> Para abrir un roadbook público debes estar logueado.

---

## 2. Elige el modo de navegación

Tras la carga se abre el modal de inicio con estas opciones:

| Opción | Descripción |
|---------|-------------|
| **Mappa per nota** | Muestra/oculta la mini-mapa bajo cada nota |
| **Registra GPX** | Guarda la trazada GPS de la navegación (crash-safe) |
| **Suono su nota** | Breve beep cuando una nota se valida |

Luego eliges la **modalidad**:

| Modalidad | Cuándo usarla | Qué hace |
|----------|---------------|---------|
| **Trip mode** | Uso libre, reconocimientos, salidas sin puntuación | Sigue el roadbook libremente, ninguna puntuación |
| **Competition** | Carreras, eventos con clasificación | Valida con penalidad, genera QR firmado para Ranking |

---

## 3. La pantalla de navegación

```
┌─────────────────────────────────────────┐
│ Titolo roadbook                          │
│ Totale: 12.34 km  |  Parziale: 0.56 km  │
│ Bussola: 045° ↗  |  GPS: ±3m 🟢         │
├─────────────────────────────────────────┤
│ #  │ Vignetta │ Indicazioni   │ [Mappa] │
│ 1  │  ┌───┐   │ Svolta a dx   │  [☗]   │
│    │  │ ╱  │   │ CAP 045°     │         │
│    │  └───┘   │ Asfalto       │         │
│─── │───────── │────────────── │─────────│
│ 2  │  ┌───┐   │ Dritto        │  [☗]   │
│    │  │ ↑  │   │ Sterrato      │         │
│    │  └───┘   │               │         │
│    │   ✅     │ RAGGIUNTA     │         │
├─────────────────────────────────────────┤
│              [⏸ Pausa] [🏁 Fine]         │
└─────────────────────────────────────────┘
```

### Elementos de la pantalla

1. **Barra odómetro** (sticky arriba): título, total, parcial, brújula CAP, hora, estado GPS, batería
2. **Tabla de notas**: cada nota en una fila con distancia, viñeta tulip, texto, CAP, tipo de carretera
3. **Estados de nota**: ✅ Raggiunta (verde) · ⏭ Saltata (rosa) · ▶ Attiva (borde rojo) · blanco (futura)
4. **Columnas**: Distancias + número | Viñeta | Indicaciones | Botones (mapa, raggiunta)

---

## 4. Avance: automático vs manual

### Automático (por defecto)
En cuanto el GPS entra en el **radio de validación** de la nota activa, la nota se marca como alcanzada automáticamente.

- El radio es adaptativo: depende del `wp_radius` de la nota, con un máximo que evita solapamientos
- Funciona independientemente de la velocidad
- Activa/desactiva con el interruptor **Auto** en la barra

### Manual
Tap sobre la nota activa o en el botón "Raggiunta" para convalidar.

- En Trip: marca en verde y sincroniza el odómetro
- En Competition: valida con puntuación (requiere GPS dentro de 100 m)
- No se puede validar hacia atrás

---

## 5. Barra CAP (entre dos notas)

Cuando la nota anterior tiene un CAP, aparece una barra abajo con:
- **Ruta a mantener** (ej. CAP 045°)
- **Velocidad actual**
- **Distancia al destino**
- **Flecha direccional**

Es una ayuda "a brújula" para navegar entre dos notas sin perderse.

---

## 6. Mapa interactivo por nota

Opcional: tap en el botón de mapa de una fila abre una mini-mapa bajo la nota.

- Centrado en la nota a zoom ~13
- Muestra toda la trazada + pin para contexto
- Punto azul GPS en tiempo real
- Tap en el mapa abierto lo cierra

> El mapa por nota es útil para confirmar la posición en el terreno cuando el texto de la nota es ambiguo.

---

## 7. Funcionalidades adicionales

| Función | Cómo usarla |
|----------|-------------|
| **Correzione odometro** | Nudge ±10 m cuando hace falta; validar una nota sincroniza el total a la distancia de esa nota |
| **Pausa** | Detiene GPS y wake lock para ahorrar batería (paradas para comer, esperas) |
| **Sound on note** | Beep WebAudio breve cuando una nota se valida (auto o manual) |
| **Registrazione GPX** | Crash-safe: checkpoint en cada fix, recuperación si la app se cierra |
| **Recupero sessione** | Si se interrumpe (llamada, crash), reanuda exactamente desde donde estabas |
| **Cambio lingua** | Cambia el idioma a mitad de sesión sin perder datos |

---

## 8. En Competition — QR resultado

En modo Competition, al final de la navegación se genera un **QR firmado HMAC** (55 caracteres) que contiene:
- Resultado completo: penalidades, tiempos, velocidades
- Firmado contra el servidor (no falsificable)

Entrega el QR al organizador para la clasificación (Ranking).

---

## 9. Recuperación de sesión interrumpida

Al arrancar el Reader comprueba por orden:
1. **Sesión en curso** en `localStorage` → propone reanudar
2. **Roadbook desde URL** → lo carga directamente
3. **GPX huérfano** → propone recuperar trazada
4. **Nada** → parte limpio

> Rechazar la reanudación **no borra la sesión**: se sobrescribe solo cuando inicias una nueva carrera o sales explícitamente.

---

## 10. Siguiente paso

¿Completaste la navegación? → [Tripmaster: ordenador de a bordo GPS →](05-tripmaster.md)  
¿Quieres crear un roadbook? → [Editor: crea/modifica →](03-editor.md)
