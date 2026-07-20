# Editor — Créer et modifier un roadbook

L'**Editor** est le centre de création : ici vous transformez une trace brute (ou une page blanche) en un roadbook complet avec notes, CAP, danger, types de route, icônes, vignettes tulipe.

> **Fonctionne hors ligne** pour l'édition pure. Une connexion est nécessaire pour : la connexion, charger/sauvegarder sur le profil, envoyer photos/audio, importer des challenges publics, export PDF/GPX (utilise des bibliothèques lazy-loaded).

---

## Démarrage — Choisissez la source

Ouvrez **Editor** (`/editor/`). La page d'accueil (`#loadFrom`) propose 4 cartes + 2 sources cachées :

> 📸 *Capture : écran initial de l'Editor avec les 4 cartes de source (GPX, Draw on the map, .rdbk, Roadbook public)*

| Source | Comment faire | Ce que vous obtenez |
|----------|-----------|--------------|
| **GPX** | Touchez « GPX » → choisissez un fichier `.gpx` (optionnel `.wpt`) | `RB.parseGPX` → `buildRoadbook` → roadbook avec trace + waypoints |
| **Draw on the map** | Touchez « Draw on the map » | Carte en mode *draw* : les 2 premiers taps créent le roadbook à partir de zéro |
| **.rdbk** | Touchez « .rdbk » → choisissez un fichier ZIP/JSON | Importe un roadbook complet (médias dans `pendingMedia`, voir ci-dessous) |
| **Roadbook public** | Touchez « Roadbook public » → sélecteur de challenge | **Fork** d'un roadbook `public` + `reusable` → nouveau roadbook privé vous appartenant |

**Sources automatiques** (au démarrage, par priorité) :
1. `?trip=1` → trace/waypoint/photo depuis Recorder/Tripmaster via `sessionStorage`
2. Brouillon non sauvegardé dans `localStorage` (`rb_editor_draft`) → confirmation de récupération
3. `?rb=<id>` → charge votre roadbook sauvegardé (connexion requise)

> Importer (GPX, .rdbk, public) **efface l'identité** (`resetIdentity`) : `currentRbId=0`, statut=`draft`, `reusable=false`. Ainsi vous n'écrasez pas l'original par erreur.

---

## Vue Carte — La barre d'outils

La carte est le cœur. Barre verticale `.map-tools` (seuls ☰ · Undo · Redo visibles ; **Move** est par défaut, aucun bouton).

> 📸 *Capture : carte de l'Editor avec la barre d'outils verticale et la trace chargée*

### Outils de mode (exclusifs)

| Outil | Activation | Ce qu'il fait |
|------|-------------|---------|
| **Move** (défaut) | `Esc` ou fin de cut/draw | Faites glisser **n'importe quel point** (trace OU note). La ligne suit. Métriques recalculées au relâchement |
| **Draw** | Depuis l'accueil « Draw on the map » | Le tap étend depuis l'extrémité ouverte la plus proche. Tap sur un bord de coupe ouvert → le ferme |
| **Cut** | Menu ☰ → Cut / touche `C` | Tap 2 points → coupe (laisse un trou = *gap*). Unique outil de mode avec bouton dans la barre |

### One-shot (menu ☰)

| Outil | Fonction |
|------|----------|
| **Add GPX** | Jonction intelligente : si les deux extrémités touchent la route (≤200m) → remplace le tronçon interne ; sinon unit à l'extrémité la plus proche (auto-orientation) |
| **Simplify** | Douglas-Peucker (tolérance 0,5–50m, défaut 2m). **Recalcule les métriques à partir de zéro** → le total ne peut que diminuer. Les notes restent sur leurs sommets (ancrages préservés) |
| **Adjust** | Ré-enregistrement en direct d'un tronçon (gps-meter partagé). Remplace le segment entre `adjP1` et `adjP2` et ré-accroche les notes |
| **Undo / Redo** | Snapshot debounced 400ms, max 30. Ctrl/Cmd+Z / Ctrl+Y (Shift+Z) |

> **Reverse** (inversion du parcours) se trouve dans **Settings** (vue Config), pas ici.

---

## Gestion des coupes ouvertes (*gaps*)

Une coupe interne laisse un **trou réel** (pas un segment). Mémorisé comme une paire de **points** `{a,b}` (pas des indices) → survit au décalage d'index.

- **Remplir** : dessinez par-dessus (Draw ferme le gap en touchant le bord opposé)
- **Fermer à plat** : à l'export/save → `confirmOpenCuts` demande confirmation → ferme en ligne droite
- `resolveGaps()` les résout en indices à la demande

---

## Liste de notes + Éditeur en ligne

Colonne de droite : lignes `.note-mini`. Tap sur une ligne → **l'éditeur en ligne se déplace** sous cette ligne (unique `#noteEditZone` physiquement déplacée). Le canvas de vignettes (`#canvasWrap`) se déplace DANS la cellule tulipe.

> 📸 *Capture : panneau de notes avec l'éditeur en ligne ouvert sur une note*

### Champs d'une note

| Champ | Comment on l'édite | Notes |
|-------|---------------|------|
| **Texte** | `textarea` en place (conserve le focus) | Met à jour le modèle sans rebuild |
| **Type de route** | Select « Road » → définit `road_type_out` | Seule la route que vous **quittez** est autorisée ; l'arrivée dérive de `road_out` de la note précédente |
| **Danger** | Select `—` / `!` / `!!` / `!!!` → `n.danger` | 0 = retire |
| **CAP** | Toggle de ligne → calcule `bearingDeg` + `haversineM` vers la note suivante | Dernière note : pas de CAP |
| **Icônes / Vignettes** | `NoteCanvas` sur `#noteCanvas` | Palette standard + custom embarquées (voir § ci-dessous) |

### Glisser sur la carte (outil Move)
La note se fait glisser depuis le marqueur bleu → déplace **le sommet de trace** dessous → la ligne le suit. La note bouge comme un point de trace.

### Réordonner / Supprimer
Flèches ↑/↓ (change `sel` ±1), `Del` → `delNote` (minimum 2 notes). **Ne recentre pas la carte** (fix #65).

---

## Palette d'icônes

`renderIcons` fusionne :
- **Standard** (`assets/icons/index.json` → `loadStd`)
- **Custom** embarquées dans le roadbook (`rb.icons`)

> 📸 *Capture : palette d'icônes avec catégories et recherche en direct*

Puces de catégories + recherche en direct (`filterIcons`). Tap ou **glisser-déposer** sur la vignette pour ajouter. Custom : `#iconFile` → data-URI. Badge × pour supprimer (bloqué si utilisé).

> À l'import .rdbk Roadbook Suite : icônes renommées 1:1 (tableau dans `editor.md` §9.5), flip Y + recentrées + ×1.5 (×3 départ/arrivée). Icônes sans fichier → repli `W28_general_danger.svg` + note dans le texte *« Note : ajouter l'icône <nom> »*.

---

## Vue Config — Détails du roadbook

Deuxième vue (`showView('config')`), onglet `#viewConfig` :

> 📸 *Capture : vue Config avec les champs titre, description, statut, profil waypoint*

| Section | Champs |
|---------|-------|
| **Titre / Description / Auteur / Organisation** | `oninput` → `markDirty`, `stampMeta` horodate `modified` (AAAA-MM-JJ) à chaque save/export |
| **Logo événement** | `RBImg.toDataURL(f, 256)` → data-URI dans `meta.logo` (auto-contenu) |
| **Statut** | `setStatus()` : **draft · ready · public** (plus binaire). Seul `public` publie dans la galerie |
| **Réutilisable** | `cfgReusable` → `reusable` (uniquement si `public`) — permet le fork par d'autres (#106) |
| **Profil waypoint** | `cfgProfile` → `meta.profile` : `basic` (défaut) ou `rally` (vocabulaire FIA complet) |
| **Rayon de validation par défaut** | `cfgWpRadius` → `meta.default_wp_radius` (m) pour les notes sans `wp_radius` propre |
| **Accès carte dans le Reader** | `cfgMapAccess` → `meta.map_access` (false = masque la carte, ex. courses) |
| **Photos** | Galerie sur carte + envoi géolocalisé + lightbox (voir ci-dessous) |
| **Supprimer le roadbook** | Uniquement si `currentRbId > 0` (sauvegardé). `RBConfirmDanger` nomme le titre → `rb_delete` (corbeille 30j) |

---

## Photos : galerie sur carte, envoi géolocalisé, lightbox

**Nécessite un roadbook sauvegardé** (`currentRbId > 0` / `draftId`) + connexion.

> 📸 *Capture : galerie photo sur carte avec épingles et lightbox ouverte*

### Envoi (tous convergent vers `addPhotos`)

1. **EXIF GPS** → `RBImg.gps(file)` lit le GPS dans les 256 premiers Ko du JPEG. Si présent → envoi immédiat avec ces coordonnées
2. **À la main sur la carte** → si EXIF manque (PNG/HEIC/sans GPS) : photo en file → `promptPlacePhoto` → tap sur la carte (curseur de visée, un tap par photo en file)
3. **Copier-coller** (Ctrl/Cmd+V) → écouteur `paste` → même flux EXIF/épingle

### Lightbox
Tap sur épingle / miniature → visionneuse plein écran (ne couvre que la carte, **pas** le panneau de notes → vous continuez à éditer). Flèches ‹/›, `←`/`→`, `Esc`. Actions :
- **Waypoint** → crée un waypoint sur la position de la photo
- **Move on map** → mode *positionner* → le prochain tap met à jour les coordonnées via `ph_move`
- **Delete** → `ph_delete` (avec confirmation) + met à jour le lightbox + épingle

---

## Notes vocales (WP audio) — lecteur + transcription

Côté serveur (`roadbook_audio`, `audio_list`/`audio_delete`). Apparaissent comme **lecteur audio** sur la ligne de note la plus proche (≤80m). Bouton **« ➜ texte »** (`transcribeInto`) :

> 📸 *Capture : lecteur audio avec le bouton de transcription sur une note*
- **Whisper** via `RBTranscribe` (transformers.js/WASM, modèle `Xenova/whisper-tiny`, cache navigateur)
- L'audio **ne quitte pas l'appareil**, aucun coût serveur
- Langue = `voice_lang` du compte ou auto-détectée
- Première utilisation : modale de téléchargement du modèle (~dizaines de Mo), puis fonctionne **hors ligne**
- Le texte est **ajouté** à la note (jamais écrasé)

---

## Export & Save to profile

Bouton **Export** → pop-up avec tous les formats. **Save** (sauvegarde profil) séparé. Chaque export ferme le pop-up, confirme **une fois** les coupes ouvertes, recalcule les métriques.

> 📸 *Capture : pop-up Export avec les formats disponibles (.rdbk, PDF, GPX, OpenRally, KMZ)*

| Format | Fonction | Sortie |
|---------|----------|--------|
| **.rdbk** | `exportRdbk(includeMedia)` | ZIP : `roadbook.json` auto-contenu (`embedUsed` embarque les icônes utilisées, élimine les inutilisées) + optionnel `photos/`/`audio/`/`media.json` |
| **PDF** | `exportPdf` | A4 via `RBPdf.generate` (jsPDF lazy, `rb-pdf.js`) |
| **GPX** | `exportCustomGpx` | Cases composables (Trace / Waypoint / icônes Garmin / icônes OSMAnd / fichier OpenRally séparé) |
| **OpenRally** | `exportOpenRally` | `RB.openRallyDocument` → `…_OR.gpx` (GPX 1.1 + namespace `openrally:`) |
| **KMZ** | `exportKmz` | `RB.kmlDocument` + `RBZip.write({ 'doc.kml': kml })` → `.kmz` |

### embedUsed (règle auto-contenue)
Chaque symbole utilisé finit dans `rb.icons` comme data-URI ; non référencé → supprimé. Garantit la portabilité.

### Options GPX (issue #34)
Cases : **Trace** (obligatoire pour Garmin/OSMAnd), **Waypoint**, **icônes Garmin**, **icônes OSMAnd**, **OpenRally**. Garmin + OSMAnd coexistent dans un fichier. Nommage : `slug_data_WPT_grm_osm_OR.gpx`.

### Save to profile
`doSave` → horodate meta, recalcule, embarque icônes → `RBApi('rb_save')`. Succès : enregistre `currentRbId`, efface `dirty`, nettoie le brouillon, fixe `?rb=<id>` dans l'URL (le rechargement continue d'éditer le même). **« Save as »** → efface l'identité, ajoute « (copy) », sauvegarde une nouvelle entité privée.

---

## Co-editing, verrou, fermeture (#123 · #154 · #166)

| Aspect | Règle |
|---------|--------|
| **Propriété** | `setOwnership(isOwner, owner)` : le co-éditeur voit la note *Seul le propriétaire peut changer la visibilité* ; la sauvegarde du co-éditeur **conserve l'état de publication du propriétaire** |
| **Soft lock** | `setLock(lock)` : si `lock.mine===false` → Editor en lecture seule + `lockBanner` (@utilisateur est en train de modifier). Celui qui détient le verrou le renouvelle toutes les 4 min (`rb_lock_refresh`), le libère à la fermeture (`sendBeacon` → `rb_lock_release`). Forçable (`rb_lock_force`) |
| **Fermer** | `leaveEditor` (bouton `#closeEditor`) : modifications non sauvegardées → *Sauvegarder et fermer · Fermer sans sauvegarder · Annuler* → retourne à l'**accueil de l'Editor** (liste des roadbooks), pas à l'accueil ; nettoie `?rb=`/`/<slug>` |

---

## Démarrage, brouillon, récupération

- `markDirty()` → point de contrôle debounced 2s dans `localStorage` (`rb_editor_draft`)
- `beforeunload` + `visibilitychange` vident le brouillon avant fermeture/kill
- **Priorité au démarrage** : `config` → `?trip=1` (Recorder/Tripmaster) → brouillon `localStorage` (confirmation `RBConfirm`, le refus **n'efface pas**) → `?export=1` (ouvre le pop-up d'export immédiatement) → `?rb=<id>` (charge le sauvegardé) → position par défaut de la carte depuis le profil (`default_lat/lon`)

---

## Import .rdbk Roadbook Suite — fidélité pour le Ranking

`RB.importRoadbook` convertit : clés italiennes → canoniques, `bivio[]→junctions[]` (flip Y), icônes flip Y + recentrées + ×1.5, **recalcule les métriques depuis la trace** (cap, distances, types de route). Pour un `.rdbk` canonique : **aucun recalcul à l'import** (champs identiques).

**Champs Ranking préservés à l'import :**
- `lat/lon` (accuracy/extra) ✅
- `cap/cap_distance` (pénalité CAP) ✅ — `recomputeCaps` recalcule uniquement là où `cap!=null`
- `distance/partial_distance` (km, reach) ✅
- `icons` I02_partenza / I01_arrivo (section score) ✅
- `icons` Sxx_* (limites de vitesse) ✅

En **export/save** : `recomputeMetrics` accroche les notes à la trace (lat/lon, distance, cap), `recomputeCaps` réaligne les CAP actifs. Cohérent pour le score.

---

## Limites & particularités

- `makeNote` émet `num: 0` → numérotation correcte après `recomputeMetrics` (les lignes l'appellent immédiatement)
- L'auteur par défaut peut écraser un champ vide à la connexion (dépend de l'ordre des promesses `account`)
- `spliceByIndex` ré-accroche toutes les notes avec `nearestIdx` → peut déplacer une note de façon non intuitive si une variante passe près d'une note « ancienne »
- Coupes ouvertes → fermées en ligne droite (précédées de `confirmOpenCuts`)
- Les photos nécessitent un roadbook **déjà sauvegardé** (`currentRbId > 0` / `draftId`)

---

## Étape suivante

Vous avez le roadbook prêt ? → [Reader : naviguer →](reader.md)  
Vous voulez un ordinateur de bord GPS ? → [Tripmaster →](05-tripmaster.md)
