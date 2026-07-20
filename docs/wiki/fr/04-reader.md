# Reader — Naviguer un roadbook avec GPS

Le **Reader** est le copilote numérique : il charge un roadbook et le transforme en un tableau de notes style papier guidé par le GPS. Odomètre, boussole CAP, validation automatique ou manuelle et — en mode Competition — un QR signé avec le résultat.

> Fonctionne hors ligne à 100 % pour la navigation et la validation. Une connexion n'est nécessaire que pour : la connexion, charger des roadbooks depuis le profil/la galerie publique, sauvegarder les résultats.

---

## 1. Charger un roadbook

Ouvrez le Reader (`/reader/`) — l'écran initial propose 3 entrées :

| Entrée | Comment faire | Ce qui se passe |
|----------|-----------|--------------|
| **Charger un fichier `.rdbk`** | Touchez « Carica .rdbk » → choisissez le fichier | Importe un roadbook complet (trace + notes + icônes) |
| **Vos roadbooks** | Touchez « I tuoi roadbook » (uniquement si connecté) | Sélecteur des roadbooks sauvegardés sur votre profil |
| **Roadbooks publics** | Touchez « Roadbook pubblici » | Sélecteur des challenges publics de la galerie |

**Depuis l'URL** (automatique) :
- `/reader/<slug>` → charge un roadbook public directement
- `?rb=<id>` → charge un de vos roadbooks sauvegardés par ID

> Pour ouvrir un roadbook public vous devez être connecté.

---

## 2. Choisissez le mode de navigation

Après le chargement s'ouvre le modal de démarrage avec ces options :

| Option | Description |
|---------|-------------|
| **Carte par note** | Affiche/masque la mini-carte sous chaque note |
| **Enregistrer GPX** | Sauvegarde la trace GPS de la navigation (crash-safe) |
| **Son à la note** | Bip court quand une note est validée |

Puis choisissez le **mode** :

| Mode | Quand l'utiliser | Ce qu'il fait |
|----------|---------------|---------|
| **Trip mode** | Usage libre, reconnaissances, sorties sans score | Suit le roadbook librement, aucun score |
| **Competition** | Courses, événements avec classement | Valide avec pénalité, génère un QR signé pour le Ranking |

---

## 3. L'écran de navigation

```
┌─────────────────────────────────────────┐
│ Titre du roadbook                       │
│ Total : 12,34 km  |  Partiel : 0,56 km  │
│ Boussole : 045° ↗  |  GPS : ±3m 🟢       │
├─────────────────────────────────────────┤
│ #  │ Vignette │ Indications   │ [Carte] │
│ 1  │  ┌───┐   │ Tourne à droite│  [☗]   │
│    │  │ ╱  │   │ CAP 045°      │         │
│    │  └───┘   │ Asphalte       │         │
│─── │───────── │────────────── │─────────│
│ 2  │  ┌───┐   │ Tout droit     │  [☗]   │
│    │  │ ↑  │   │ Chemin de terre│         │
│    │  └───┘   │                │         │
│    │   ✅     │ ATTEINTE        │         │
├─────────────────────────────────────────┤
│              [⏸ Pause] [🏁 Fin]          │
└─────────────────────────────────────────┘
```

### Éléments de l'écran

1. **Barre odomètre** (collante en haut) : titre, total, partiel, boussole CAP, heure, état GPS, batterie
2. **Tableau des notes** : chaque note sur une ligne avec distance, vignette tulipe, texte, CAP, type de route
3. **États de note** : ✅ Atteinte (vert) · ⏭ Sautée (rose) · ▶ Active (bord rouge) · blanc (à venir)
4. **Colonnes** : Distances + numéro | Vignette | Indications | Boutons (carte, atteinte)

---

## 4. Avancement : automatique vs manuel

### Automatique (défaut)
Dès que le GPS entre dans le **rayon de validation** de la note active, la note est marquée comme atteinte automatiquement.

- Le rayon est adaptatif : dépend du `wp_radius` de la note, avec un maximum évitant les chevauchements
- Fonctionne indépendamment de la vitesse
- Activez/désactivez avec l'interrupteur **Auto** dans la barre

### Manuel
Tap sur la note active ou sur le bouton « Atteinte » pour valider.

- En Trip : marque en vert et synchronise l'odomètre
- En Competition : valide avec score (GPS requis dans les 100 m)
- Impossible de valider en arrière

---

## 5. Barre CAP (entre deux notes)

Quand la note précédente a un CAP, une barre apparaît en bas avec :
- **Route à tenir** (ex. CAP 045°)
- **Vitesse actuelle**
- **Distance à la destination**
- **Flèche directionnelle**

C'est une aide « à la boussole » pour naviguer entre deux notes sans se perdre.

---

## 6. Carte interactive par note

Optionnelle : tap sur le bouton carte d'une ligne ouvre une mini-carte sous la note.

- Centrée sur la note à un zoom ~13
- Affiche toute la trace + épingle pour le contexte
- Pastille GPS bleue en temps réel
- Tap sur la carte ouverte la referme

> La carte par note est utile pour confirmer la position sur le terrain quand le texte de la note est ambigu.

---

## 7. Fonctionnalités supplémentaires

| Fonction | Comment l'utiliser |
|----------|-------------|
| **Correction odomètre** | Ajustement ±10 m quand nécessaire ; valider une note synchronise le total à la distance de cette note |
| **Pause** | Arrête le GPS et le wake lock pour économiser la batterie (arrêts déjeuner, attentes) |
| **Son à la note** | Bip WebAudio court quand une note est validée (auto ou manuel) |
| **Enregistrement GPX** | Crash-safe : point de contrôle à chaque fix, récupération si l'application se ferme |
| **Récupération de session** | Si interrompue (appel, crash), reprend exactement là où vous étiez |
| **Changement de langue** | Changez de langue en pleine session sans perdre de données |

---

## 8. En Competition — QR résultat

En mode Competition, à la fin de la navigation est généré un **QR signé HMAC** (55 caractères) qui contient :
- Résultat complet : pénalités, temps, vitesses
- Signé contre le serveur (non falsifiable)

Remettez le QR à l'organisateur pour le classement (Ranking).

---

## 9. Récupération de session interrompue

Au démarrage le Reader vérifie dans l'ordre :
1. **Session en cours** dans `localStorage` → propose la reprise
2. **Roadbook depuis l'URL** → le charge directement
3. **GPX orphelin** → propose la récupération de la trace
4. **Rien** → repart à zéro

> Refuser la reprise **n'efface pas la session** : elle n'est écrasée que lorsque vous démarrez une nouvelle course ou sortez explicitement.

---

## 10. Étape suivante

Vous avez terminé la navigation ? → [Tripmaster : ordinateur de bord GPS →](05-tripmaster.md)  
Vous voulez créer un roadbook ? → [Editor : créer/modifier →](03-editor.md)
