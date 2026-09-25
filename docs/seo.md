# SEO — RDBK.app

How search-engine metadata works across the site, and the exact title/description copy per page and language. Reference for reviewing or updating SEO.

## Architecture

The site is a **client-side i18n PWA**: one URL per page, text swapped by JS from the browser language — there are **no per-language URLs**. So SEO is handled pragmatically:

- Each page ships a **static English** `<title>`, `<meta name="description">`, Open Graph + Twitter Card tags and a `<link rel="canonical">` — what non-JS crawlers see.
- The `<title>` and description are **localized at runtime** by the i18n layer: `<title data-i18n="seo.<page>.title">` and `<meta name="description" data-i18n-content="seo.<page>.desc">` (the `data-i18n-content` handler lives in `public/assets/js/i18n.js`). `hreflang` is not used (it needs distinct per-language URLs).
- Open Graph / Twitter tags stay static English (social crawlers don't run JS).
- Tool tables (feature pages) keep the English **brand tool names** in every language.

## Indexing policy

- **Indexed + in `sitemap.xml`:** home, about, privacy, terms, standard, validator, roadbooks, events, and the five `/features/*` pages.
- **`noindex`:** the tools (editor, reader, recorder, tripmaster, ranking), account, myroadbooks and every `/admin/*` page — they are apps, not landing pages.
- **`robots.txt`** allows everything except `/api/`, and points to `https://rdbk.app/sitemap.xml`.

## Structured data (JSON-LD)

Static English, like the Open Graph tags, and checked by `tests/seo-pages.test.js`:

- **`/`** — `WebApplication` published by the `Organization` (`https://rdbk.app/#organization`), whose founders are the two people of `/about/`.
- **`/about/`** — `AboutPage`, the `Organization` and one `Person` per founder (`#alvaro-franz`, `#maurizio-andreotti`) with their LinkedIn profiles in `sameAs`.
- **`/standard/`** — a `TechArticle` about the format and a `FAQPage` whose questions are exactly the page's visible `<details class="faq">` (the same English text; the answers stripped of markup).

## Dynamic pages (per-content meta)

`/challenge/<slug>` and `/event/<slug>` set their title, description, canonical and og:* at runtime from the loaded roadbook/event via the shared `RBSetMeta({ title, description, canonical })` helper in `public/assets/js/app.js`. Their static HTML carries only a generic fallback description + og basics.

A public roadbook is public (#884): `/challenge/<slug>` renders it for anyone, signed in or not, and is indexed (`index, follow`) with its own title, description and canonical. So is `/event/<slug>`.

## Per-page title & description (all languages)

### `/`

| Lang | Title | Description |
|---|---|---|
| English | RDBK.app — digital roadbooks for your adventures | Create, navigate, validate and rank roadbooks for any adventure. Free PWA and the open .rdbk format. |
| Italiano | RDBK.app — roadbook digitali per le tue avventure | Crea, naviga, valida e classifica roadbook per ogni avventura. PWA gratuita e il formato aperto .rdbk. |
| Español | RDBK.app — roadbooks digitales para tus aventuras | Crea, navega, valida y clasifica roadbooks para cualquier aventura. PWA gratuita y el formato abierto .rdbk. |
| Deutsch | RDBK.app — digitale Roadbooks für deine Abenteuer | Erstelle, navigiere, validiere und werte Roadbooks für jedes Abenteuer aus. Kostenlose PWA und das offene .rdbk-Format. |
| Français | RDBK.app — roadbooks numériques pour vos aventures | Créez, naviguez, validez et classez des roadbooks pour toute aventure. PWA gratuite et le format ouvert .rdbk. |

### `/about/`

| Lang | Title | Description |
|---|---|---|
| English | Who we are — RDBK.app | The people and mission behind RDBK.app — free digital roadbook tools and the open .rdbk format for every adventure. |
| Italiano | Chi siamo — RDBK.app | Le persone e la missione dietro RDBK.app — strumenti gratuiti per roadbook digitali e il formato aperto .rdbk per ogni avventura. |
| Español | Quiénes somos — RDBK.app | Las personas y la misión detrás de RDBK.app — herramientas gratuitas de roadbooks digitales y el formato abierto .rdbk para cada aventura. |
| Deutsch | Wer wir sind — RDBK.app | Die Menschen und die Mission hinter RDBK.app — kostenlose Werkzeuge für digitale Roadbooks und das offene .rdbk-Format für jedes Abenteuer. |
| Français | Qui sommes-nous — RDBK.app | Les personnes et la mission derrière RDBK.app — des outils gratuits de roadbooks numériques et le format ouvert .rdbk pour chaque aventure. |

### `/privacy/`

| Lang | Title | Description |
|---|---|---|
| English | Privacy Policy — RDBK.app | How RDBK.app handles your data — accounts, roadbooks and photos — on our free digital roadbook tools. |
| Italiano | Informativa sulla privacy — RDBK.app | Come RDBK.app tratta i tuoi dati — account, roadbook e foto — nei nostri strumenti gratuiti per roadbook digitali. |
| Español | Política de privacidad — RDBK.app | Cómo trata RDBK.app tus datos — cuentas, roadbooks y fotos — en nuestras herramientas gratuitas de roadbooks digitales. |
| Deutsch | Datenschutzerklärung — RDBK.app | Wie RDBK.app mit deinen Daten umgeht — Konten, Roadbooks und Fotos — in unseren kostenlosen Werkzeugen für digitale Roadbooks. |
| Français | Politique de confidentialité — RDBK.app | Comment RDBK.app traite vos données — comptes, roadbooks et photos — dans nos outils gratuits de roadbooks numériques. |

### `/terms/`

| Lang | Title | Description |
|---|---|---|
| English | Terms of Use — RDBK.app | The terms for using RDBK.app, the free digital roadbook suite and the open .rdbk format. |
| Italiano | Condizioni d’uso — RDBK.app | Le condizioni per usare RDBK.app, la suite gratuita per roadbook digitali e il formato aperto .rdbk. |
| Español | Condiciones de uso — RDBK.app | Las condiciones para usar RDBK.app, la suite gratuita de roadbooks digitales y el formato abierto .rdbk. |
| Deutsch | Nutzungsbedingungen — RDBK.app | Die Bedingungen für die Nutzung von RDBK.app, der kostenlosen Suite für digitale Roadbooks und dem offenen .rdbk-Format. |
| Français | Conditions d’utilisation — RDBK.app | Les conditions d’utilisation de RDBK.app, la suite gratuite de roadbooks numériques et le format ouvert .rdbk. |

### `/standard/`

| Lang | Title | Description |
|---|---|---|
| English | The .rdbk standard: the open format for digital roadbooks — RDBK.app | The .rdbk format: the open standard for digital roadbooks, used by off-road riders and organizers worldwide. A ZIP with a self-contained roadbook.json — track, notes, tulips, symbols, voice notes — plus photos. Full spec and FAQ. |
| Italiano | Lo standard .rdbk: il formato aperto per i roadbook digitali — RDBK.app | Il formato .rdbk: lo standard aperto per i roadbook digitali, usato da piloti off-road e organizzatori in tutto il mondo. Uno ZIP con un roadbook.json autosufficiente — traccia, note, vignette, simboli, note vocali — più foto. Specifica completa e FAQ. |
| Español | El estándar .rdbk: el formato abierto para roadbooks digitales — RDBK.app | El formato .rdbk: el estándar abierto para roadbooks digitales, usado por pilotos off-road y organizadores de todo el mundo. Un ZIP con un roadbook.json autocontenido — traza, notas, viñetas, símbolos, notas de voz — más fotos. Especificación completa y FAQ. |
| Deutsch | Der .rdbk-Standard: das offene Format für digitale Roadbooks — RDBK.app | Das .rdbk-Format: der offene Standard für digitale Roadbooks, weltweit genutzt von Offroad-Fahrern und Veranstaltern. Ein ZIP mit einer eigenständigen roadbook.json — Track, Notizen, Vignetten, Symbole, Sprachnotizen — plus Fotos. Vollständige Spezifikation und FAQ. |
| Français | Le standard .rdbk : le format ouvert des roadbooks numériques — RDBK.app | Le format .rdbk : le standard ouvert des roadbooks numériques, utilisé par les pilotes tout-terrain et les organisateurs du monde entier. Un ZIP avec un roadbook.json autonome — trace, notes, vignettes, symboles, notes vocales — plus photos. Spécification complète et FAQ. |

### `/validator/`

| Lang | Title | Description |
|---|---|---|
| English | .rdbk validator — RDBK.app | Check that a .rdbk roadbook follows the open standard: every error with its exact place, in your browser — the file is never uploaded. |
| Italiano | Validatore .rdbk — RDBK.app | Verifica che un roadbook .rdbk segua lo standard aperto: ogni errore nel suo punto esatto, nel tuo browser — il file non viene mai caricato. |
| Español | Validador .rdbk — RDBK.app | Comprueba que un roadbook .rdbk sigue el estándar abierto: cada error en su lugar exacto, en tu navegador — el archivo nunca se sube. |
| Deutsch | .rdbk-Validator — RDBK.app | Prüfe, ob ein .rdbk-Roadbook dem offenen Standard folgt: jeder Fehler an seiner genauen Stelle, in deinem Browser — die Datei wird nie hochgeladen. |
| Français | Validateur .rdbk — RDBK.app | Vérifiez qu’un roadbook .rdbk suit le standard ouvert : chaque erreur à son endroit exact, dans votre navigateur — le fichier n’est jamais envoyé. |

### `/roadbooks/`

| Lang | Title | Description |
|---|---|---|
| English | Public Roadbooks — RDBK.app | Browse public roadbooks shared by the community — 4x4, moto, bike and running routes to read, navigate or export. |
| Italiano | Roadbook pubblici — RDBK.app | Sfoglia i roadbook pubblici condivisi dalla community — percorsi 4x4, moto, bici e corsa da leggere, navigare o esportare. |
| Español | Roadbooks públicos — RDBK.app | Explora los roadbooks públicos compartidos por la comunidad — rutas 4x4, moto, bici y running para leer, navegar o exportar. |
| Deutsch | Öffentliche Roadbooks — RDBK.app | Durchstöbere öffentliche Roadbooks der Community — 4x4-, Motorrad-, Fahrrad- und Laufstrecken zum Lesen, Navigieren oder Exportieren. |
| Français | Roadbooks publics — RDBK.app | Parcourez les roadbooks publics partagés par la communauté — parcours 4x4, moto, vélo et course à lire, naviguer ou exporter. |

### `/events/`

| Lang | Title | Description |
|---|---|---|
| English | Events — RDBK.app | Discover roadbook events and rallies: browse upcoming events and their public roadbooks. |
| Italiano | Eventi — RDBK.app | Scopri eventi e rally con roadbook: sfoglia gli eventi in arrivo e i loro roadbook pubblici. |
| Español | Eventos — RDBK.app | Descubre eventos y rallies con roadbook: explora los próximos eventos y sus roadbooks públicos. |
| Deutsch | Events — RDBK.app | Entdecke Roadbook-Events und Rallyes: durchstöbere kommende Events und ihre öffentlichen Roadbooks. |
| Français | Événements — RDBK.app | Découvrez les événements et rallyes avec roadbook : parcourez les événements à venir et leurs roadbooks publics. |

### `/features/editor/`

| Lang | Title | Description |
|---|---|---|
| English | Roadbook Editor — RDBK.app | Build a digital roadbook from a GPX or record it live — design rally notes, CAP headings, waypoints and icons, then export a self-contained .rdbk. |
| Italiano | Roadbook Editor — RDBK.app | Crea un roadbook digitale da un GPX o registralo dal vivo — progetta note rally, CAP, waypoint e icone, poi esporta un .rdbk autosufficiente. |
| Español | Roadbook Editor — RDBK.app | Crea un roadbook digital desde un GPX o grábalo en directo — diseña notas rally, CAP, waypoints e iconos, y exporta un .rdbk autónomo. |
| Deutsch | Roadbook Editor — RDBK.app | Erstelle ein digitales Roadbook aus einer GPX oder nimm es live auf — gestalte Rally-Notizen, CAP, Wegpunkte und Icons und exportiere ein eigenständiges .rdbk. |
| Français | Roadbook Editor — RDBK.app | Créez un roadbook numérique depuis un GPX ou enregistrez-le en direct — concevez notes rallye, CAP, waypoints et icônes, puis exportez un .rdbk autonome. |

### `/features/reader/`

| Lang | Title | Description |
|---|---|---|
| English | Roadbook Reader — RDBK.app | Navigate any roadbook with GPS: odometer, bearing, live map, CAP direction bar and automatic waypoint validation. |
| Italiano | Roadbook Reader — RDBK.app | Naviga qualsiasi roadbook con il GPS: contachilometri, rilevamento, mappa live, barra di direzione CAP e validazione automatica dei waypoint. |
| Español | Roadbook Reader — RDBK.app | Navega cualquier roadbook con GPS: cuentakilómetros, rumbo, mapa en vivo, barra de dirección CAP y validación automática de waypoints. |
| Deutsch | Roadbook Reader — RDBK.app | Navigiere jedes Roadbook mit GPS: Kilometerzähler, Kurs, Live-Karte, CAP-Richtungsleiste und automatische Wegpunkt-Validierung. |
| Français | Roadbook Reader — RDBK.app | Naviguez n’importe quel roadbook au GPS : odomètre, cap, carte en direct, barre de direction CAP et validation automatique des waypoints. |

### `/features/recorder/`

| Lang | Title | Description |
|---|---|---|
| English | Roadbook Recorder — RDBK.app | Record your route live with GPS — accuracy-aware sampling, pause/resume, crash-safe GPX and geotagged photos. |
| Italiano | Roadbook Recorder — RDBK.app | Registra il tuo percorso dal vivo con il GPS — campionamento consapevole dell’accuratezza, pausa/ripresa, GPX a prova di crash e foto geotaggate. |
| Español | Roadbook Recorder — RDBK.app | Graba tu ruta en directo con GPS — muestreo según la precisión, pausa/reanudación, GPX a prueba de fallos y fotos geolocalizadas. |
| Deutsch | Roadbook Recorder — RDBK.app | Zeichne deine Strecke live mit GPS auf — genauigkeitsbewusstes Sampling, Pause/Fortsetzen, absturzsicheres GPX und geotaggte Fotos. |
| Français | Roadbook Recorder — RDBK.app | Enregistrez votre parcours en direct au GPS — échantillonnage selon la précision, pause/reprise, GPX à l’épreuve des plantages et photos géolocalisées. |

### `/features/tripmaster/`

| Lang | Title | Description |
|---|---|---|
| English | Tripmaster — RDBK.app | A precise GPS trip computer: partial and total odometer, speed alerts, heading, stopwatch and GPX recording — no roadbook needed. |
| Italiano | Tripmaster — RDBK.app | Un computer di viaggio GPS preciso: contachilometri parziale e totale, avvisi di velocità, direzione, cronometro e registrazione GPX — senza roadbook. |
| Español | Tripmaster — RDBK.app | Un ordenador de viaje GPS preciso: cuentakilómetros parcial y total, alertas de velocidad, rumbo, cronómetro y grabación GPX — sin roadbook. |
| Deutsch | Tripmaster — RDBK.app | Ein präziser GPS-Tripcomputer: Teil- und Gesamtkilometerzähler, Geschwindigkeitswarnungen, Kurs, Stoppuhr und GPX-Aufzeichnung — ohne Roadbook. |
| Français | Tripmaster — RDBK.app | Un ordinateur de bord GPS précis : odomètre partiel et total, alertes de vitesse, cap, chronomètre et enregistrement GPX — sans roadbook. |

### `/features/ranking/`

| Lang | Title | Description |
|---|---|---|
| English | Event classification — RDBK.app | Score a rally from signed result QRs — accuracy, CAP, speed and regularity rankings into a final classification, with CSV export. |
| Italiano | Event classification — RDBK.app | Assegna i punteggi di un rally dai QR di risultato firmati — classifiche di precisione, CAP, velocità e regolarità in una classifica finale, con export CSV. |
| Español | Event classification — RDBK.app | Puntúa un rally desde códigos QR de resultado firmados — clasificaciones de precisión, CAP, velocidad y regularidad en una clasificación final, con exportación CSV. |
| Deutsch | Event classification — RDBK.app | Werte eine Rally aus signierten Ergebnis-QR-Codes aus — Wertungen für Genauigkeit, CAP, Geschwindigkeit und Gleichmäßigkeit zu einer Endwertung, mit CSV-Export. |
| Français | Event classification — RDBK.app | Notez un rallye à partir de QR de résultats signés — classements précision, CAP, vitesse et régularité en un classement final, avec export CSV. |

---

*This file is generated from the `seo.*` keys in `public/assets/js/i18n*.js` (the source of truth). To change a title/description, edit the i18n files and regenerate.*
