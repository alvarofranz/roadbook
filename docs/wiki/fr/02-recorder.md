# Roadbook Recorder — Enregistrer une trace GPS en direct

Le **Recorder** est l'outil à utiliser **sur le terrain**. Il enregistre la trace GPS et vous permet de poser des notes et des photos géolocalisées en chemin. Le résultat est un brouillon qui passe à l'Editor pour la création du roadbook définitif.

> Fonctionne **hors ligne** à 100 % pour GPS + waypoint + médias. Les médias restent en file d'attente locale tant qu'il n'y a pas de réseau. Une connexion n'est nécessaire que pour : la connexion initiale, l'envoi différé, la sauvegarde sur le profil.

---

## Séquence complète : de l'ouverture à la sauvegarde

### 1. Ouvrir le Recorder

Ouvrez le **Recorder** depuis le menu principal ou allez directement sur `/recorder/`.

> ![Démarrage Recorder](../assets/screenshots/rec01.jpg)

Vous verrez l'écran initial avec le bouton **Start recording**. Si vous n'êtes pas connecté, un avertissement apparaît : *« Non connecté : les photos sont gardées sur cet appareil et enregistrées dans un .rdbk local à la fin. Connectez-vous pour les enregistrer sur votre compte. »* — vous pouvez tout de même enregistrer.

---

### 2. Démarrer un nouvel enregistrement

Touchez **Start recording**.

> ![Nom de session](../assets/screenshots/rec02.jpg)

Un modal s'ouvre pour le **nom** de la session (par défaut : date/heure `AAAA-MM-JJ HH-MM`). Vous pouvez le modifier. Touchez **Confirmer**.

---

### 3. Tableau de bord en direct — l'enregistrement est en cours

Pendant l'enregistrement, l'écran affiche en haut quatre indicateurs :

> ![Tableau de bord d'enregistrement](../assets/screenshots/rec03a.jpg)

| Élément | Ce que vous voyez |
|----------|-----------|
| **Temps** | Durée de l'enregistrement (hors pauses) |
| **km/h** | Vitesse actuelle |
| **Notes** | Nombre de notes posées |
| **km** | Distance parcourue |

En dessous viennent les boutons de capture (étape 4) et la carte en direct (étape 5). **Pause** et **End** se trouvent dans une barre en bas, chacun sur la moitié de la largeur ; sur un téléphone, cette barre flotte juste au-dessus de la barre d'onglets inférieure.

---

### 4. Enrichir la trace pendant le parcours

La rangée de capture comporte un grand bouton **Note** à gauche et, à sa droite, une grille 2×2 de boutons à icône aussi haute que lui :

| Bouton | Action | Comment l'utiliser |
|----------|--------|-------------|
| **📍 Note** | Pose une note à la position GPS actuelle | Touchez : la note est posée instantanément (nécessite un fix GPS). Une clochette de réussite retentit et une grande coche verte apparaît à l'écran pendant moins d'une seconde. Rien à écrire : le texte de la note se rédige plus tard dans l'Editor |
| **📷 Photo** | Prend une photo géolocalisée | Ouvre l'appareil photo arrière. La photo est rattachée à la position GPS actuelle et y pose toujours aussi une note |
| **↩ Annuler la dernière note** | Supprime la dernière note | Demande d'abord confirmation, en nommant la note supprimée |
| **🗺 Style de carte** | Change le fond de carte | Satellite ↔ topographique |
| **🧭 Heading up** | Orientation de la carte | La carte tourne avec votre cap (heading up) ou reste nord en haut |

La barre du bas contient les deux autres :

| Bouton | Action |
|----------|--------|
| **⏸ Pause** | Suspend le GPS et le chronomètre (arrêts, attentes). Touchez à nouveau pour reprendre |
| **🏁 End** | Termine l'enregistrement (étape 6) |

> ![Boutons waypoint et médias](../assets/screenshots/rec04a.jpg)

> **Conseil** : touchez **Note** à chaque carrefour, danger ou changement de route sans quitter la route des yeux, et ajoutez les mots plus tard dans l'Editor. Utilisez **Photo** pour les panneaux et points visuels.

---

### 5. Carte en direct

> ![Carte en direct](../assets/screenshots/rec05.jpg)

- La trace est une **ligne continue**
- Les notes sont des **pastilles bleues numérotées**
- Les photos ont une **épingle 📷**
- En haut à gauche, en grand et sans libellé : la **distance depuis la dernière note** (km, deux décimales ; depuis le départ avant la première note)
- Votre marqueur GPS devient un **chevron** directionnel quand vous êtes en mouvement

---

### 6. Fin de l'enregistrement

Touchez **End** (barre du bas) pour terminer l'enregistrement.

> ![Récapitulatif d'enregistrement](../assets/screenshots/rec06a.jpeg)

Le modal de récapitulatif s'ouvre avec les données de la session : points parcourus, km, notes, photos. Vous choisissez alors quoi faire :

| Option | Quand l'utiliser | Ce qui se passe |
|---------|---------------|--------------|
| **💾 Save to server** | Vous êtes connecté et voulez retrouver tout sur le profil | Sauvegarde le **brouillon** sur le serveur (trace + waypoints + médias). Vous restez dans le Recorder avec le bouton **Edit** pour ouvrir dans l'Editor |
| **📦 Export .rdbk** | Vous voulez un fichier portable hors ligne | Crée un `.rdbk` ZIP (roadbook.json + photos). Télécharge le fichier |
| **✏️ Open in Editor** | Vous voulez peaufiner la route tout de suite | Transmet la trace et les waypoints à l'Editor. Les photos déjà sur le serveur restent liées |
| **📍 Export GPX** | Vous en avez seulement besoin pour un autre logiciel | Télécharge un `.gpx` standard (trace + notes comme waypoints nommés). Photos **non** incluses |

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
| Notes | ✅ local | ✅ local | ✅ local |
| Photo | ✅ file → envoi | ✅ file locale | ✅ file locale |
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

## Étape suivante

Vous avez la trace enregistrée ? → [Editor : créer/modifier un roadbook →](03-editor.md)  
Vous voulez naviguer ? → [Reader : naviguer avec GPS →](04-reader.md)
