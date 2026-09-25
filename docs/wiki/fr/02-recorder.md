# Roadbook Recorder — Enregistrer une trace GPS en direct

Le **Recorder** est l'outil à utiliser **sur le terrain**. Il enregistre la trace GPS et vous permet de poser des notes, des photos géolocalisées et des notes vocales en chemin. Le résultat est un brouillon qui passe à l'Editor pour devenir le roadbook définitif.

> Fonctionne **100 % hors ligne** pour le GPS, les notes, les photos et les notes vocales. Les photos restent dans une file d'attente locale tant qu'il n'y a pas de réseau. Une connexion n'est nécessaire que pour se connecter, envoyer les photos et sauvegarder sur votre profil.

---

## Séquence complète : de l'ouverture à la sauvegarde

### 1. Ouvrir le Recorder

Ouvrez le **Recorder** depuis la barre d'onglets (l'icône ⏺) ou allez directement sur `/recorder/`.

> ![Démarrage du Recorder](../assets/screenshots/rec01.jpg)

L'écran de départ explique ce que fait le Recorder et affiche en direct l'**état du GPS** : *Recherche du GPS…*, *GPS trop faible pour enregistrer* ou *GPS prêt* avec sa précision (±m). **Démarrer l'enregistrement** ne s'active que lorsque le GPS est assez bon pour enregistrer, si bien qu'un enregistrement ne commence jamais à l'aveugle. Si vous n'êtes pas connecté, un avertissement indique que l'itinéraire et ses photos attendent sur votre appareil et qu'**Enregistrer** vous demandera de vous connecter — vous pouvez tout de même enregistrer.

> Les **admins** peuvent démarrer sans attendre le GPS (le bouton le dit) — pratique sur un ordinateur, qui n'en a pas : chaque position est gardée quelle que soit sa précision, et une note sans aucune position se pose là où la carte est centrée.

---

### 2. Démarrer

Touchez **Démarrer l'enregistrement**. L'enregistrement démarre aussitôt : rien à remplir — le roadbook reçoit son nom plus tard, dans l'Editor.

---

### 3. Tableau de bord en direct — l'enregistrement est en cours

> ![Tableau de bord d'enregistrement](../assets/screenshots/rec03a.jpg)

En haut, la barre d'état (heure · batterie · précision GPS) et quatre indicateurs :

| Élément | Ce que vous voyez |
|---------|-------------------|
| **Temps** | Durée de l'enregistrement (hors pauses) |
| **km/h** | Vitesse actuelle |
| **Notes** | Nombre de notes posées |
| **km** | Distance parcourue |

En dessous viennent les boutons de capture (étape 4) et la carte en direct (étape 5). **Pause** et **Terminer** se trouvent dans une barre en bas, chacun sur la moitié de la largeur ; sur un téléphone, cette barre flotte juste au-dessus de la barre d'onglets.

---

### 4. Enrichir la trace pendant le parcours

> ![Boutons de capture](../assets/screenshots/rec04a.jpg)

La rangée de capture comporte trois colonnes de même hauteur : la grande **Note** (40 %), les captures (40 % : **Photo** au-dessus de **Note vocale**) et les deux interrupteurs de la carte (20 % : **Style de carte** au-dessus de **Cap en haut**).

| Bouton | Action | Comment l'utiliser |
|--------|--------|--------------------|
| **📍 Note** | Pose une note à votre position GPS | Touchez : la note est posée instantanément. Une clochette de réussite retentit et une grande coche verte apparaît pendant moins d'une seconde. Rien à écrire — le texte de la note se rédige plus tard dans l'Editor |
| **📷 Photo** | Prend une photo géolocalisée | Ouvre l'appareil photo arrière. La photo est rattachée à votre position et y pose toujours aussi une note |
| **🎤 Note vocale** | Enregistre une note vocale | **Maintenez-le** pendant que vous parlez — une note se pose à cet endroit et le bouton passe au rouge avec les secondes ; **relâchez** et il s'arrête (une minute au plus). Seul le son est gardé, sans transcription : il devient l'extra **Note vocale** de la note et, quand vous naviguez le roadbook, il se joue tout seul avant que vous n'atteigniez la note (100 m avant, ou la distance que l'auteur fixe dans l'Editor) |
| **🗺 Style de carte** | Change le fond de carte | Satellite ↔ topographique |
| **➤ Cap en haut** | Orientation de la carte | La carte tourne avec votre cap (allumé) ou reste nord en haut |

La barre du bas contient les deux autres :

| Bouton | Action |
|--------|--------|
| **⏸ Pause** | Suspend l'enregistrement (arrêts, attentes). Touchez à nouveau pour reprendre |
| **🏁 Terminer** | Termine l'enregistrement (étape 6) |

> **Conseil** : touchez **Note** à chaque carrefour, danger ou changement de route sans quitter la route des yeux, et ajoutez les mots plus tard dans l'Editor. Maintenez **Note vocale** quand quelques mots le disent mieux — vous les réentendrez sur la route. Il n'y a pas d'annulation sur le parcours : une note posée par erreur se supprime en une seconde dans l'Editor.

---

### 5. Carte en direct

> ![Carte en direct](../assets/screenshots/rec05.jpg)

- La trace est une **ligne continue**
- Les notes sont des **pastilles bleues numérotées**
- Les photos ont une **épingle 📷**
- En haut à gauche, en grand et sans libellé : la **distance depuis la dernière note** (km, deux décimales ; depuis le départ avant la première note)
- Votre marqueur GPS devient un **chevron** directionnel quand vous êtes en mouvement

---

### 6. Terminer l'enregistrement

Touchez **Terminer** (barre du bas) et confirmez.

> ![Fin de l'enregistrement](../assets/screenshots/rec06a.jpg)

Une boîte de dialogue affiche un bref récapitulatif (km · notes · photos) et pose une seule question, avec deux boutons :

| Bouton | Ce qui se passe |
|--------|-----------------|
| **💾 Enregistrer** | Connecté : l'enregistrement est sauvegardé comme **brouillon** de roadbook (avec ses photos et ses notes vocales) et l'**Editor s'ouvre** aussitôt dessus. Non connecté : vous êtes dirigé vers la page de connexion et, une fois connecté, vous revenez et il est sauvegardé de la même façon, puis l'Editor s'ouvre |
| **🗑 Abandonner** | Demande confirmation en nommant ce qui serait perdu (trace, notes, photos), puis abandonne l'enregistrement |

Il n'y a pas de boutons d'export ici : l'export (GPX, `.rdbk`, PDF…) se fait ensuite depuis l'Editor.

> La boîte de dialogue ne se ferme pas en touchant à l'extérieur. Tant que vous n'avez ni enregistré ni abandonné, l'enregistrement reste en sécurité — même si l'app plante, il vous est proposé à nouveau lors de votre prochaine visite.

---

### 7. Dans l'Editor

L'Editor s'ouvre avec la trace, les notes, les photos et les notes vocales déjà en place : donnez un nom au roadbook, écrivez le texte des notes, écoutez une note vocale dans l'onglet **Note vocale** de sa note (et fixez combien de mètres avant la note elle se joue), et exportez-le si vous le souhaitez. Le brouillon est sauvegardé et vous le retrouvez aussi dans **Mes roadbooks**.

## Comportement hors ligne

| Quoi | Connecté + en ligne | Connecté + hors ligne | Non connecté |
|------|---------------------|-----------------------|--------------|
| Trace GPS | ✅ locale + point de contrôle | ✅ locale + point de contrôle | ✅ locale + point de contrôle |
| Notes et notes vocales | ✅ local | ✅ local | ✅ local |
| Photos | ✅ file → envoi | ✅ file locale | ✅ file locale |
| Brouillon serveur | créé/mis à jour en direct | créé au premier envoi | créé avec **Enregistrer**, après connexion |
| Récupération après un plantage | ✅ automatique | ✅ automatique | ✅ automatique |

---

## Récupération d'une session interrompue

Le Recorder sauvegarde la session en temps réel. Si l'application se ferme (un appel, un plantage, la batterie), au prochain démarrage il vous propose de **reprendre** l'enregistrement là où vous l'aviez laissé. Refuser **ne le supprime pas** : l'enregistrement reste sur l'appareil et n'est remplacé que lorsque vous en démarrez un nouveau.

---

## Étape suivante

Vous avez la trace enregistrée ? → [Editor : créer/modifier un roadbook →](03-editor.md)  
Vous voulez naviguer ? → [Reader : naviguer avec GPS →](04-reader.md)
