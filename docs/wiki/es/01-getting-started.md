# Guía rápida — Primeros pasos con RDBK.app

¡Bienvenido! RDBK.app es una PWA (Progressive Web App) para crear, compartir y seguir roadbook digitales. Funciona **íntegramente en el navegador** — nada que instalar, pero también puedes "instalarla" como app en el teléfono.

La app funciona **offline** para registro, edición y navegación. Se necesita conexión solo para: login, guardado en el perfil, subida de fotos/audio, páginas públicas.

---

## 1. Elige qué hacer — las 4 herramientas principales y las opciones

| Herramienta | Para qué sirve | Cuándo usarla |
|------|--------------|---------------|
| **Roadbook Recorder** | Registra una trazada GPS live, la puedes enriquecer con waypoint en los puntos que quieras fijar como notas; además puedes asociar también fotos del cruce y cómodas notas de voz para tomar apuntes sobre cómo se deberá dibujar el tulip o avisos varios | Durante el reconocimiento / la recogida de datos en el terreno |
| **Editor** | Crear o modificar un roadbook a partir de una grabación, de un GPX o de un roadbook en formato openrally; optimiza la trazada, revisa las notas de voz y las fotos del reconocimiento, completa las notas y los tulip dibujándolos; la gestión de las flechas y de los CAP es automática en base a la trazada subyacente. Al final puedes exportarlo en formato RDBK, openrally y PDF si prefieres imprimirlo | Tras la grabación (o desde cero) para preparar el roadbook definitivo |
| **Roadbook Reader** | Permite la navegación de los roadbook en formato digital en modo turístico o competición, puede marcar automáticamente las notas alcanzadas y además se puede activar también un mapa (opcional) que presenta la posición de la nota individual respecto a la del vehículo | Durante el evento / la salida — es el "copiloto" |
| **Roadbook Player** | Ordenador de a bordo GPS sin roadbook: odómetro total/parcial, velocidad, heading, cronómetro, contador de waypoint, registro GPX | Reconocimientos libres, pruebas, salidas sin roadbook predeterminado |

> **OTRAS POSIBILIDADES**:  
> - en la **PÁGINA DE INICIO** encuentras una galería de los roadbook públicos que puedes consultar o recorrer
> - si estás registrado puedes guardar en RDBK.app tus roadbook (draft/ready/public) y compartirlos entre teléfono y PC
> - en la sección **Eventos** encuentras eventos organizados por los Clubes
> - ... ¡y siempre puedes organizar un evento aprovechando la gestión digital de tus roadbook!

---

## 2. Flujo típico "de cero a carrera"

```
┌─────────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Recorder   │ ──→ │ Editor  │ ──→ │  Save   │ ──→ │ Reader  │ ←── │  Event  │
│  (campo)    │     │ (escribe)│     │ (perfil)│    │ (navega)│     │ (organ.)│
└─────────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
      │                   │                │                │              │
  GPS live           Dibuja/       Guardado en       Sigue          Crea evento,
  waypoint           importa        cloud +         notas +         asocia RB,
  foto/audio         GPX/.rdbk      opcional        CAP +          invita con
                       iconos/símbolos  .rdbk local     puntuación      join code
```

---

## 3. Por qué crear una cuenta

El login te permite guardar tus roadbook en la nube y recuperarlos en cualquier dispositivo — puedes registrar una trazada con el teléfono durante un reconocimiento y luego editarla cómodamente desde el PC sin volverte loco moviendo archivos.

1. Toca **Account** (arriba a la derecha) → **Regístrate**
2. Introduce: nombre, apellidos, nombre de usuario, email, contraseña (≥ 8 caracteres)
3. Marca **Acepto los Términos de uso**
4. Completa el challenge Turnstile (si está activo)
5. Recibirás un email: haz clic en **Verifica mi email** en 24 h
6. Vuelve a la app y haz **Login** con email/nombre de usuario + contraseña

> **Acceso con Google / Apple**: si ves el botón "Continuar con Google" o "Continuar con Apple", puedes usarlo para crear/acceder sin contraseña. Con Apple puedes mantener tu correo privado (Ocultar mi correo).

---

## 4. Conceptos clave que conviene saber ya

| Concepto | Qué significa |
|----------|----------------|
| **Estado roadbook** | `draft` = borrador privado · `ready` = listo pero privado · `public` = visible para todos en la galería |
| **Guardado local vs cloud** | En el Editor: **Export .rdbk** = archivo ZIP en tu dispositivo (offline, portable). **Save to profile** = guardado en el servidor, lo recuperas desde cualquier dispositivo con login |
| **Fotos y notas de voz** | No entran en el `.rdbk` a menos que marques "Incluir fotos y audio" en el export. Viven en el servidor (hace falta login). Sin login quedan en el dispositivo y van al `.rdbk` local |
| **Join code de eventos** | Código corto (ej. `DA2C09`) que te da el organizador. Abre `/go/DA2C09` → entras en el evento y ves los roadbook `ready` reservados a los participantes |
| **Puntuación de carrera (Ranking)** | Solo en modo **Competition** en el Reader. Genera un QR firmado de 55 caracteres al final de la prueba.

---

## 5. Primeras cosas que probar (5 minutos)

1. **Registra una trazada** → Recorder → "Start recording" → camina/conduce → "Finish" → "Open in Editor"
2. **Dibuja una ruta** → Editor → "Draw on the map" → toca dos puntos → añade notas (toca fila → editor inline)
3. **Exporta .rdbk** → Editor → Export → .rdbk → descarga el archivo ZIP
4. **Abre en Reader** → Reader → "Carica file .rdbk" → elige el archivo → "Trip mode" → empieza a navegar
5. **Prueba Tripmaster** → Tripmaster → Start → ves odómetro, velocidad, heading live

---

## 6. Dónde encontrar ayuda

| Qué | Dónde |
|------|------|
| Términos de uso | `/terms/` (enlace en el pie) |
| Privacidad | `/privacy/` |
| Estándar `.rdbk` | `/standard/` — especificación completa del formato |
| Reportar bug / pedir función | GitHub Issues (enlace en el pie → About) |
| Contacto | `/contact/` |

---

## 7. Siguiente paso

Elige la herramienta que necesitas y lee su guía:

- 📍 [Registrar una trazada →](02-recorder.md)
- ✏️ [Crear/modificar un roadbook →](03-editor.md)
- 🧭 [Navegar con el Reader →](04-reader.md)
- 📊 [Usar el Tripmaster →](05-tripmaster.md)
