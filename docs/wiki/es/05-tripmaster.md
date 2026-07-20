# Tripmaster — Ordenador de a bordo GPS

El **Tripmaster** es un ordenador de a bordo GPS sin roadbook: ninguna nota, ningún trazado que seguir, ninguna puntuación. Muestra en tiempo real odómetro total y parcial, velocidad con bandas de alerta, heading (CAP), cronómetro y contador de waypoint — útil para reconocimientos, pruebas o salidas donde solo se necesita el instrumental de a bordo.

> Funciona offline al 100%. La sesión se guarda en cada fix, por lo que una llamada o un bloqueo de pantalla no pierden nada.

---

## 1. Arranque

Abre **Tripmaster** (`/tripmaster/`) y toca **Start**. Al instante ves el dashboard live con todos los instrumentos.

Al arrancar el Tripmaster comprueba automáticamente:
1. **Sesión interrumpida** en curso → propone reanudar
2. **Trazada GPX huérfana** → propone recuperar
3. **Nada** → parte limpio

---

## 2. El dashboard

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

### Instrumentos:

| Instrumento | Descripción |
|-----------|-------------|
| **Odómetro total** | Distancia recorrida desde el inicio de la sesión |
| **Odómetro parcial** | Distancia desde el último reset o waypoint |
| **Velocidad** | Velocidad actual + máxima registrada |
| **Heading (CAP)** | Dirección de marcha en grados con aguja |
| **Cronómetro** | Timer start/pausa/reset |
| **Waypoint** | Contador (solo número, ninguna posición guardada) |

---

## 3. Odómetro: total, parcial y correcciones

Dos odómetros independientes, ambos con correctores manuales ±10 m:

| Botón | Acción |
|----------|--------|
| **+10 / −10** (parcial) | Corrige el parcial |
| **+10 / −10** (total) | Corrige el total |

> Los correctores no pueden bajar de 0.

### Reset del parcial

Mantén pulsado el botón de reset durante **5 segundos** (protección anti-toque accidental). El parcial se pone a cero también automáticamente al pulsar **Mark waypoint**.

---

## 4. Velocidad y bandas de alerta

Define una **velocidad a vigilar** para recibir señales visuales:

| Banda | Condición | Color (por defecto) |
|-------|-----------|------------------|
| Bajo límite | `v < limite − 5` | Verde |
| En aproximación | `limite − 5 ≤ v < limite` | Naranja |
| Superado | `v ≥ limite` | Rojo con ⚠ |

> La configuración de las bandas (límite y colores) se ajusta desde el botón de ajustes de velocidad. Los colores y el límite se guardan y restauran en la próxima sesión.

---

## 5. Cronómetro

El cronómetro usa el reloj del sistema, por lo que sigue contando aunque la app pase a segundo plano.

| Botón | Acción |
|----------|--------|
| **Start/Pause** | Inicia o pausa |
| **Reset** | Pone a cero (solo con cronómetro parado) |

> El tiempo mostrado incluye el periodo en segundo plano: si pausas y reanudas horas después, el conteo retoma desde donde estaba.

---

## 6. Contador de waypoint

Pulsa **Mark waypoint** para:
- Incrementar el contador de waypoint
- Poner a cero el **parcial**

> El contador es solo un número — no guarda coordenadas. Para registrar la posición real, activa la **registrazione GPX**.

---

## 7. Registración GPX

Activa la registración GPX desde el botón dedicado para tener una trazada de tu salida:

- **Crash-safe**: checkpoint en cada fix, recuperación si la app se cierra
- El botón se pone rojo **STOP** durante la registración
- Settings modal para configurar nombre de archivo y opciones

---

## 8. Recuperación de sesión interrumpida

Al arrancar comprueba por orden:
1. **Sesión en curso** en `localStorage` → propone reanudar con todos los datos (odómetros, cronómetro, waypoint, GPX)
2. **GPX huérfano** → propone recuperar trazada interrumpida
3. **Nada** → parte limpio

> Rechazar la reanudación **no borra** la sesión: se sobrescribe en cuanto empiezas a moverte, o se borra explícitamente con "End the trip".

---

## 9. Atajos de teclado (escritorio)

| Tecla | Acción |
|-------|--------|
| `Espacio` | Mark waypoint |
| `P` | Pause/Resume cronómetro |
| `Esc` | End trip |

---

## 10. Siguiente paso

¿Completaste el reconocimiento? → [Recorder: registra una trazada →](02-recorder.md)  
¿Quieres crear un roadbook? → [Editor: crea/modifica →](03-editor.md)
