# Roadbook Recorder — Enregistrer une trace GPS en direct

Le **Recorder** est l'outil à utiliser **sur le terrain**. Il enregistre la trace GPS et vous permet de l'enrichir de waypoints, photos géolocalisées et notes vocales. Le résultat est un brouillon qui passe à l'Editor pour la création du roadbook définitif.

> Fonctionne **hors ligne** à 100 % pour GPS + waypoint + médias. Les médias restent en file d'attente locale tant qu'il n'y a pas de réseau. Une connexion n'est nécessaire que pour : la connexion initiale, l'envoi différé, la sauvegarde sur le profil.

---

## Séquence complète : de l'ouverture à la sauvegarde

### 1. Ouvrir le Recorder

Ouvrez le **Recorder** depuis le menu principal ou allez directement sur `/recorder/`.

> ![Démarrage Recorder](../assets/screenshots/rec01.jpg)

Vous verrez l'écran initial avec le bouton **Start recording**. Si vous n'êtes pas connecté, un avertissement apparaît : *« Photos et audio nécessitent une connexion »* — vous pouvez tout de même enregistrer, mais les médias resteront uniquement sur l'appareil.

---

### 2. Démarrer un nouvel enregistrement

Touchez **Start recording**.

> ![Nom de session](../assets/screenshots/rec02.jpg)

Un modal s'ouvre pour le **nom** de la session (par défaut : date/heure `AAAA-MM-JJ HH-MM`). Vous pouvez le modifier. Touchez **Confirmer**.

---

### 3. Tableau de bord en direct — l'enregistrement est en cours

Le tableau de bord en direct affiche toutes les données en temps réel :

> ![Tableau de bord d'enregistrement](../assets/screenshots/rec03a.jpg)

| Élément | Ce que vous voyez |
|----------|-----------|
| **Temps** | Durée de l'enregistrement (hors pauses) |
| **Vitesse** | Vitesse instantanée + maximale |
| **Waypoint** | Compteur de waypoints placés |
| **Distance** | Km parcourus |
| **Carte** | Carte orientée cap (marche en haut) avec trace et waypoints |

> La carte est **orientée cap** par défaut — la direction de marche est toujours vers le haut. Touchez le contrôle en haut à droite pour verrouiller au Nord.

---

### 4. Enrichir la trace pendant le parcours

Pendant l'enregistrement vous disposez de 4 boutons :

| Bouton | Action | Comment l'utiliser |
|----------|--------|-------------|
| **⏸ Pause** | Suspend le GPS et le chronomètre | Touchez pour mettre en pause (arrêts, attentes). Reprenez avec le même bouton |
| **📍 Waypoint** | Crée un waypoint à la position GPS actuelle | Touchez → écrivez le texte (auto-ferme après 5 s). Utilisez le micro pour dicter |
| **🎤 WP audio** | Enregistre un clip vocal | **Maintenez enfoncé** pour enregistrer. Relâchez → compte à rebours 5→0 → sauvegarde. Sur ordinateur, transcrit automatiquement |
| **📷 WP Photo** | Prend une photo géolocalisée | Ouvre l'appareil photo arrière. La photo est rattachée à la position GPS actuelle |

> ![Boutons waypoint et médias](../assets/screenshots/rec04a.jpg)

> **Conseil** : utilisez **Waypoint** pour les repères écrits (carrefours, dangers, changements de route), **WP audio** pour les notes longues pendant que vous conduisez, **WP Photo** pour les panneaux et points visuels.

---

### 5. Carte en direct

> ![Carte en direct](../assets/screenshots/rec05.jpg)

- La trace est une **ligne continue**
- Les waypoints sont des **pastilles bleues numérotées**
- Les photos ont une **épingle 📷**
- Votre marqueur GPS devient un **chevron** directionnel quand vous êtes en mouvement
- Touchez un waypoint/photo → infos et actions (supprimer, modifier le texte)

---

### 6. Fin de l'enregistrement

Touchez **Finish** pour terminer l'enregistrement.

> ![Récapitulatif d'enregistrement](../assets/screenshots/rec06a.jpeg)

Le modal de récapitulatif s'ouvre avec les données de la session : points parcourus, km, waypoints, photos. Vous choisissez alors quoi faire :

| Option | Quand l'utiliser | Ce qui se passe |
|---------|---------------|--------------|
| **💾 Save to server** | Vous êtes connecté et voulez retrouver tout sur le profil | Sauvegarde le **brouillon** sur le serveur (trace + waypoints + médias). Vous restez dans le Recorder avec le bouton **Edit** pour ouvrir dans l'Editor |
| **📦 Export .rdbk** | Vous voulez un fichier portable hors ligne | Crée un `.rdbk` ZIP (roadbook.json + photos + audio). Télécharge le fichier |
| **✏️ Open in Editor** | Vous voulez peaufiner la route tout de suite | Transmet la trace et les waypoints à l'Editor. Les photos déjà sur le serveur restent liées |
| **📍 Export GPX** | Vous en avez seulement besoin pour un autre logiciel | Télécharge un `.gpx` standard (trace + waypoints nommés). Photos et audio **non** inclus |

> 📸 *Capture : options de sauvegarde — Save to server, Export .rdbk, Open in Editor, Export GPX*

> **Bonne pratique** : si connecté → **Save to server** → puis **Open in Editor**.  
> Si hors connexion → **Export .rdbk** → puis depuis chez vous : connexion → Editor → importez `.rdbk` → Save to profile.

---

### 7. Après la sauvegarde

Si vous avez choisi **Save to server**, le Recorder affiche le bouton **Edit** qui vous mène directement à l'Editor avec la trace et les waypoints déjà chargés. Le brouillon est sauvegardé et vous le retrouvez aussi dans **Mes roadbooks** depuis le menu principal.

## Comportement hors ligne

| Choix | Connecté + en ligne | Connecté + hors ligne | Hors connexion |
|------|------------------|-------------------|----------|
| Trace GPS | ✅ locale + point de contrôle | ✅ locale + point de contrôle | ✅ locale + point de contrôle |
| Waypoint texte | ✅ local | ✅ local | ✅ local |
| Photo | ✅ file → envoi | ✅ file locale | ✅ file locale |
| Audio | ✅ file → envoi | ✅ file locale | ✅ file locale |
| Brouillon serveur | créé/mis à jour en direct | créé au premier flush | jamais créé |
| Récupération post-crash | ✅ automatique | ✅ automatique | ✅ automatique |

---

## Récupération de session interrompue

Le Recorder sauvegarde la session en temps réel. Si l'application se ferme (appel, crash, batterie), au prochain démarrage il vous propose :

1. **Resume** — reprendre l'enregistrement là où vous l'aviez laissé
2. **Récupération GPX** — si la session est perdue, récupère la trace GPX orpheline
3. **Repartir à zéro** — ignore et recommence

> 📸 *Capture : modal de récupération de session interrompue*

> Refuser la reprise **ne supprime pas** la session : elle n'est écrasée que lorsque vous démarrez un nouvel enregistrement ou sortez avec « End the trip ».

---

## Raccourcis clavier (ordinateur)

| Touche | Action |
|-------|--------|
| `Espace` | Waypoint (nécessite un fix GPS) |
| `A` | WP audio (maintenir enfoncé) |
| `F` | WP Photo |
| `P` | Pause / Reprise |
| `Esc` | Finish / fermer le modal |

---

## Étape suivante

Vous avez la trace enregistrée ? → [Editor : créer/modifier un roadbook →](03-editor.md)  
Vous voulez naviguer ? → [Reader : naviguer avec GPS →](04-reader.md)
