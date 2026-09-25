# Reader — Naviguer un roadbook avec le GPS

Le **Reader** est le copilote numérique : il charge un roadbook et le transforme en tableau de notes façon papier, piloté par le GPS. Des compteurs mesurés le long du parcours, une validation automatique ou manuelle, un rapport en fin de parcours et — dans la compétition d'un événement — un résultat signé pour le classement.

> La navigation et la validation fonctionnent 100 % hors ligne. Une connexion n'est nécessaire que pour se connecter, charger un roadbook depuis son profil ou la galerie publique, et enregistrer le rapport.

---

## 1. Charger un roadbook

Ouvrez le Reader (`/reader/`). L'écran d'accueil propose :

| Entrée | Ce qui se passe |
|--------|-----------------|
| **Charger un fichier .rdbk** | Importe un roadbook complet (trace + notes + icônes) |
| **Ouvrir depuis Mes roadbooks** | Choisit un des roadbooks enregistrés sur votre profil (connecté) |
| **Galerie publique** | Les roadbooks publics, juste en dessous : touchez-en un pour l'ouvrir |

**Depuis un lien** : `/reader/<slug>` ouvre un roadbook public, `?rb=<id>` un des vôtres.

**Depuis l'app** : dans l'app RDBK (Android et iOS), ouvrez un `.rdbk` depuis Fichiers, un téléchargement ou une discussion et choisissez RDBK — il s'ouvre ici.

> Pour ouvrir un roadbook public, il faut être connecté.

Un roadbook s'ouvre d'abord en **aperçu en lecture seule** : la liste des notes, sans GPS. Vous voulez peut-être seulement le regarder. Touchez **Naviguer** pour partir.

---

## 2. Démarrer un parcours

**Naviguer** lance la navigation tout de suite : aucune fenêtre, aucune option. Le parcours enregistre toujours sa trace GPS (à l'épreuve des plantages) : la trace appartient au parcours et son rapport l'emporte, en carte de la *Trace parcourue* et en GPX à télécharger. Une clochette sonne à chaque note validée et une fanfare à la dernière, par-dessus votre musique au lieu de l'arrêter.

Il n'y a pas de mode à choisir : un roadbook ouvert depuis un événement qui le **note** roule en **compétition** (votre numéro de véhicule est demandé, les pénalités s'appliquent, le résultat signé va au classement de l'événement) ; tout le reste roule en **balade**.

---

## 3. L'écran de navigation

Le Reader occupe tout l'écran :

1. **Tableau de bord des compteurs** en première ligne (sans titre) : total (*prog.*) au-dessus du partiel (*part.*), cap, heure, état du GPS et vitesse
2. **Liste des notes** : une ligne par note, en trois colonnes — distance totale et partielle avec le numéro de la note (et son type de waypoint, s'il y en a un) · la vignette · le texte, le CAP, la limite de vitesse et les coordonnées
3. **Barre d'actions** en bas, deux rangées de deux : interrupteur **Auto** · **Carte de la note**, puis **Pause** · **Terminer**

États des notes : **atteinte** (vert) · **sautée** (rose) · **active** (bordure rouge) · à venir (blanc). En approchant de la note active, elle devient **bleue** et affiche la distance restante, en km avec deux décimales.

Quand une note est validée, la suivante monte **tout en haut de la liste** : la route devant vous a toute la place.

### Distances le long du parcours
La distance restante se mesure **le long de la route**, comme les partiels du roadbook lui-même, pas à vol d'oiseau : le partiel parcouru plus la distance restante égale toujours le partiel de la note. À chaque changement de note, les deux compteurs se recalent sur le parcours, si bien que le partiel affiche 0.00 exactement à la note.

### Notes vocales
Une note peut porter une **note vocale** (maintenue dans le Recorder ou enregistrée dans l'Editor). Pendant la navigation, elle se joue toute seule à l'approche de la note — à la distance choisie par son auteur, 100 m avant par défaut, mesurée le long du parcours. Chacune se joue une fois par parcours ; quand plusieurs arrivent en même temps, elles se jouent l'une après l'autre.

---

## 4. Avancement : automatique ou manuel

### Automatique (par défaut)
La note active se valide dès que vous entrez dans son **rayon de validation**.

- Le rayon vient de la note (`validation_radius`), puis du défaut du roadbook, puis de son type de waypoint, sinon 30 m ; il ne descend jamais sous 18 m, au-dessus du bruit GPS
- C'est le **trajet parcouru entre deux positions GPS** qui est testé, pas seulement les positions : à vitesse, un téléphone avance de 25 m entre deux positions, et un waypoint serré passerait sinon entre les deux
- Une position dont le téléphone n'est pas sûr (précision faible) est ignorée : elle ne peut ni valider une note ni ajouter de distance

### Manuel
Coupez **Auto** : un appui **n'importe où sur la ligne de la note active** la marque alors comme faite (la cible est toute la ligne, pas un petit bouton à viser en roulant). Avec Auto activé, seul le GPS valide.

- En compétition, une validation manuelle exige d'être à moins de 100 m de la note, plus la marge qu'exige la précision de votre GPS
- Toucher **une autre** note y déplace le parcours et demande d'abord : les notes intermédiaires restent non validées, et en compétition chaque note notée sautée coûte 450 points
- En compétition, on ne peut pas revenir sur une note déjà validée

### Mains libres avec une télécommande
Toute télécommande qui envoie des touches — une pédale tourne-page, une commande de rallye au guidon, un clicker — pilote le Reader pendant la navigation. Elle fonctionne, tout simplement : rien à activer.

- Par défaut : → · ↓ · Page ↓ · Espace · Entrée valident la note, ← · ↑ · Page ↑ reviennent en arrière (en balade seulement : en compétition une note validée ne s'annule pas)
- Tes propres boutons : dans **Profil → Télécommande**, touche **Attribuer** à côté d'une action et appuie sur le bouton de la télécommande. Tu peux attribuer valider / suivante, précédente, Auto, la carte de la note, pause et les commandes du Tripmaster
- Les boutons restent sur l'appareil et sont ignorés pendant la saisie ou quand une fenêtre est ouverte

---

## 5. Carte de la note

Seulement si le roadbook autorise la carte : **Carte de la note** dans la barre d'actions ouvre une mini-carte sous la note active ; touchez-la à nouveau pour la fermer.

- Elle montre la trace, votre position en direct et, dans le coin, le numéro de la note avec la distance restante
- **Une courte flèche jaune** vous guide : depuis votre position, elle pointe droit vers la note
- Quand la note est validée, la carte vous suit sur la suivante

---

## 6. Pause et terminer

| Bouton | Ce qu'il fait |
|--------|---------------|
| **Pause** | Arrête le GPS et le maintien de l'écran allumé pour économiser la batterie (une pause déjeuner) ; les compteurs n'avancent pas en pause |
| **Terminer** | La seule sortie d'un parcours : le clôt et ouvre son rapport. Avant la dernière note, il demande d'abord : les notes non atteintes comptent comme sautées |

---

## 7. Le rapport du parcours

Chaque parcours se termine par son **rapport** : notes atteintes et sautées, zones à vitesse limitée, temps et distance, plus la **Trace parcourue** sur une carte avec son GPX à télécharger. En tête, la carte de votre parcours, juste dessous **Partager** et un seul interrupteur pour le garder **Privé** ou le rendre **Public** (visible sur votre profil `/u/<username>`). Partager avant d'avoir choisi demande d'abord, car partager rend le parcours public.

Le rapport est d'abord enregistré sur l'appareil, puis envoyé dès qu'il y a une connexion.

### En compétition — le résultat signé
Un parcours en compétition produit aussi un **résultat signé HMAC** (un QR à partager ou télécharger) et entre dans le classement partagé de l'événement, où les organisateurs le vérifient.

---

## 8. Récupérer une session interrompue

Le parcours se sauvegarde tout seul sur l'appareil. S'il est interrompu (un appel, un plantage, le téléphone qui ferme l'app), à la visite suivante le Reader demande **Reprendre le parcours en cours ?** et reprend exactement là où vous étiez. La trace enregistrée jusque-là se récupère avec lui.

> Refuser ne supprime rien, et la question ne revient pas pour ce parcours. Elle n'est jamais posée quand le lien désigne un autre roadbook.

---

## 9. Étape suivante

Fini de naviguer ? → [Tripmaster : ordinateur de bord GPS →](05-tripmaster.md)
Envie de créer un roadbook ? → [Editor : créer/modifier →](03-editor.md)
