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

> Pour ouvrir un roadbook public, il faut être connecté.

Un roadbook s'ouvre d'abord en **aperçu en lecture seule** : la liste des notes, sans GPS. Vous voulez peut-être seulement le regarder. Touchez **Naviguer** pour partir.

---

## 2. Démarrer un parcours

**Naviguer** ouvre la fenêtre de départ :

| Option | Description |
|--------|-------------|
| **Enregistrer une trace GPX** | Enregistre la trace GPS du parcours (à l'épreuve des plantages) |
| **Son à chaque note** | Une clochette à chaque note validée, une fanfare à la dernière. Elle joue par-dessus votre musique au lieu de l'arrêter |
| **Télécommande externe** | Avancez avec une pédale ou un déclencheur Bluetooth (voir §4) |

Il n'y a pas de mode à choisir : un roadbook ouvert depuis un événement qui le **note** roule en **compétition** (votre numéro de véhicule est demandé, les pénalités s'appliquent, le résultat signé va au classement de l'événement) ; tout le reste roule en **balade**.

---

## 3. L'écran de navigation

Le Reader occupe tout l'écran :

1. **Barre des compteurs** en haut : titre, total (*prog.*) au-dessus du partiel (*part.*), cap, heure, état du GPS et vitesse
2. **Liste des notes** : une ligne par note, en trois colonnes — distance totale et partielle avec le numéro de la note (et son type de waypoint, s'il y en a un) · la vignette · le texte, le CAP, la limite de vitesse et les coordonnées
3. **Barre d'actions** en bas : interrupteur **Auto** · **Carte de la note** · **Pause** · GPX · **Terminer** · **Quitter**

États des notes : **atteinte** (vert) · **sautée** (rose) · **active** (bordure rouge) · à venir (blanc). En approchant de la note active, elle devient **bleue** et affiche la distance restante, en km avec deux décimales.

Quand une note est validée, la suivante monte **tout en haut de la liste** : la route devant vous a toute la place.

### Distances le long du parcours
La distance restante se mesure **le long de la route**, comme les partiels du roadbook lui-même, pas à vol d'oiseau : le partiel parcouru plus la distance restante égale toujours le partiel de la note. À chaque changement de note, les deux compteurs se recalent sur le parcours, si bien que le partiel affiche 0.00 exactement à la note.

---

## 4. Avancement : automatique ou manuel

### Automatique (par défaut)
La note active se valide dès que vous entrez dans son **rayon de validation**.

- Le rayon vient de la note (`wp_radius`), puis du défaut du roadbook, puis de son type de waypoint, sinon 30 m ; il ne descend jamais sous 18 m, au-dessus du bruit GPS
- C'est le **trajet parcouru entre deux positions GPS** qui est testé, pas seulement les positions : à vitesse, un téléphone avance de 25 m entre deux positions, et un waypoint serré passerait sinon entre les deux
- Une position dont le téléphone n'est pas sûr (précision faible) est ignorée : elle ne peut ni valider une note ni ajouter de distance

### Manuel
Coupez **Auto** : un appui **n'importe où sur la ligne de la note active** la marque alors comme faite (la cible est toute la ligne, pas un petit bouton à viser en roulant). Avec Auto activé, seul le GPS valide.

- En compétition, une validation manuelle exige d'être à moins de 100 m de la note, plus la marge qu'exige la précision de votre GPS
- Toucher **une autre** note y déplace le parcours et demande d'abord : les notes intermédiaires restent non validées, et en compétition chaque note notée sautée coûte 450 points
- En compétition, on ne peut pas revenir sur une note déjà validée

### Mains libres avec une télécommande externe
Cochez **Télécommande externe** dans la fenêtre de départ pour avancer sans toucher l'écran.

- Une **pédale tourne-page** Bluetooth, un déclencheur photo ou une télécommande de présentation s'appaire comme un clavier : rien à configurer, cela marche hors ligne, dans le navigateur comme dans l'app
- **Avancer** : → · ↓ · Page ↓ · Espace · Entrée — **Reculer** : ← · ↑ · Page ↑ (en balade seulement : en compétition une note validée ne s'annule pas)
- Le réglage est mémorisé sur l'appareil, et les touches sont ignorées pendant la saisie ou quand une fenêtre est ouverte

---

## 5. Carte de la note

Seulement si le roadbook autorise la carte : **Carte de la note** dans la barre d'actions ouvre une mini-carte sous la note active ; touchez-la à nouveau pour la fermer.

- Elle montre la trace, votre position en direct et, dans le coin, le numéro de la note avec la distance restante
- **Une courte flèche jaune** vous guide : depuis votre position, elle pointe droit vers la note
- Quand la note est validée, la carte vous suit sur la suivante

---

## 6. Pause, terminer, quitter

| Bouton | Ce qu'il fait |
|--------|---------------|
| **Pause** | Arrête le GPS et le maintien de l'écran allumé pour économiser la batterie (une pause déjeuner) ; les compteurs n'avancent pas en pause |
| **Terminer** | Clôt le parcours et ouvre son rapport. Avant la dernière note, il demande d'abord : les notes non atteintes comptent comme sautées |
| **Quitter** (l'icône de sortie) | Abandonne le parcours sans rapport, après une confirmation |

---

## 7. Le rapport du parcours

Chaque parcours se termine par son **rapport** : notes atteintes et sautées, zones à vitesse limitée, temps et distance. En tête, la carte de votre parcours, juste dessous **Partager** et un seul interrupteur pour le garder **Privé** ou le rendre **Public** (visible sur votre profil `/u/<username>`). Partager avant d'avoir choisi demande d'abord, car partager rend le parcours public.

Le rapport est d'abord enregistré sur l'appareil, puis envoyé dès qu'il y a une connexion.

### En compétition — le résultat signé
Un parcours en compétition produit aussi un **résultat signé HMAC** (un QR à partager ou télécharger) et entre dans le classement partagé de l'événement, où les organisateurs le vérifient.

---

## 8. Récupérer une session interrompue

Le parcours se sauvegarde tout seul sur l'appareil. S'il est interrompu (un appel, un plantage, le téléphone qui ferme l'app), à la visite suivante le Reader demande **Reprendre le parcours en cours ?** et reprend exactement là où vous étiez. Une trace GPX en cours d'enregistrement se récupère de la même façon.

> Refuser ne supprime rien, et la question ne revient pas pour ce parcours. Elle n'est jamais posée quand le lien désigne un autre roadbook.

---

## 9. Étape suivante

Fini de naviguer ? → [Tripmaster : ordinateur de bord GPS →](05-tripmaster.md)
Envie de créer un roadbook ? → [Editor : créer/modifier →](03-editor.md)
