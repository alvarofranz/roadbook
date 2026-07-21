# Gestion des événements

Les **Événements** vous permettent d'organiser des rallyes, des rencontres et des compétitions autour de roadbooks sur RDBK.app. Un événement rassemble roadbooks, participants et (optionnellement) scores — le tout sous un même toit.

> Pour créer des événements, vous avez besoin du **rôle d'organisateur**. Voir [Premiers pas →](01-getting-started.md) ou demandez à un administrateur.

---

## 1 Préparation de l'événement

---

## 1.1 Rôle d'organisateur — Prérequis

La création d'événements est réservée aux utilisateurs avec le **rôle d'organisateur**.

| Étape | Ce qui se passe |
|-------|----------------|
| **Demander** | Depuis la [page événements](/features/events/) cliquez sur *Demander le rôle d'organisateur* et présentez brièvement la proposition d'événement — l'application envoie un email à l'admin. |
| **Accorder** | Un administrateur active le flag dans le panneau Admin. |
| **Vous y êtes** | *Gestion des événements* apparaît dans votre menu de compte. |

---

## 1.2 Créer un événement

Connectez-vous et allez dans **Menu / Gestion des événements** ; puis cliquez sur *Nouvel événement*.

| Champ | Notes |
|-------|-------|
| **Titre** | Nom public de l'événement. |
| **Description** | Décrivez l'événement ; ce texte sera visible sur la page de l'événement. |
| **Début / Fin** | Fenêtre de l'événement (sélecteur de calendrier). |
| **Visibilité** | **Public** — listé sur `/events/`, tout le monde peut le trouver.<br>**Privé** — accessible uniquement par lien direct `/event/<slug>`. |
| **Site de l'organisateur** | Lien optionnel affiché sur la page de l'événement. |
| **Quartier général** | Placez un pin sur la carte — affiché sur la page de l'événement. |
| **Logo** | Téléchargé, automatiquement converti en AVIF à 512 px. |

Une fois sauvegardé, l'événement a sa propre page sur `/event/<slug>` et vous en êtes le **propriétaire**.

---

Maintenant, complétez l'événement !

---

## 1.3 Rôles et permissions pour l'événement

Pour gérer un événement, l'organisateur peut impliquer d'autres abonnés en tant que co-organisateurs. En équipe, ils peuvent partager des roadbooks et gérer les inscriptions des participants pour leur permettre l'utilisation numérique des roadbooks via la plateforme RDBK.app.

Bien sûr, cela est facultatif : vous pouvez toujours exporter les roadbooks en PDF et distribuer des copies imprimées.

| Rôle | Comment l'obtenir | Ce que vous pouvez faire |
|------|------------------|------------------------|
| **Propriétaire** | Vous avez créé l'événement | Tout — modifier, supprimer, gérer les co-organisateurs, changer la visibilité |
| **Co-organisateur** | Invité par le propriétaire | Modifier les paramètres, ajouter des roadbooks, gérer les participants. Ne peut pas supprimer ni changer la visibilité |
| **Participant (actif)** | Inscrit avec un code + activé | Lire les roadbooks prêts/publics, voir les classements |
| **Participant (en attente)** | Code saisi, pas encore activé | Vue limitée jusqu'à l'activation |

### 1.3.1 Ajouter des co-organisateurs

Dans l'éditeur d'événement → section **Organisateurs** → recherchez par nom d'utilisateur, nom, email ou organisation → ajoutez.
Seul le **propriétaire** peut ajouter ou supprimer des co-organisateurs.

---

## 1.4 Ajouter des roadbooks

Dans l'éditeur d'événement → section **Roadbooks** → *Ajouter un roadbook* → le sélecteur montre seulement **vos** roadbooks.

Chaque roadbook a un **mode de score** :

| Mode | Utilisation |
|------|------------|
| **Libre** (défaut) | Aucun score — les participants suivent le parcours. |
| **Règles Roadbook-suite** | Classement / compétition — le Reader évalue le parcours. |
| **Règles FIA** | Affichées mais pas encore implémentées. |

Les roadbooks peuvent être réorganisés (poignées de glissement) et supprimés. Seuls les roadbooks vous appartenant peuvent être ajoutés.

---

## 1.5 Gérer les inscriptions des participants

### 1.5.1 Générer un code d'inscription

Dans l'éditeur d'événement → **Participants** → *Générer un code*.
Un code de 4 à 16 caractères est créé. Vous pouvez le personnaliser. Un lien court `/go/<code>` et un QR sont automatiquement disponibles.

### 1.5.2 Partager le code pour rejoindre l'événement

Envoyez le code (ou le lien / QR) à vos participants. Le participant aura besoin de ce code pour effectuer son inscription à l'événement (voir point **2.1.1**).

Les personnes recevant ce code pourront se préinscrire à l'événement, mais devront être activées pour voir et utiliser les roadbooks (voir **2.1.1**).

## 2 Exécution de l'événement

---

## 2.1 Inscription + activation

Chaque participant doit d'abord rejoindre l'événement, puis être **activé** par l'organisateur. L'activation garantit que l'organisateur confirme personnellement chaque personne — pas d'auto-inscription automatique.

---

### 2.1.1 Comment un participant rejoint

Il y a deux façons :

| Méthode | Comment ça fonctionne |
|---------|----------------------|
| **Via la page de l'événement** | Le participant visite `/event/<slug>`, saisit le code d'inscription dans le formulaire et clique sur *Rejoindre*. |
| **Via le lien court** `/go/<code>` | L'organisateur imprime le lien de l'événement et son code QR et le place à l'entrée du bureau d'inscription de l'événement. Les participants scannent le QR, accèdent au site et effectuent leur propre abonnement à la plateforme. Ainsi, ils sont prêts pour l'étape d'activation, qui sera effectuée à la finalisation des formalités d'inscription (ex. vérifications des conditions et paiements). |

Dans les deux cas, le serveur génère un **code d'activation unique de 6 caractères** (ex. `X3K9M2`) et enregistre le participant avec le statut `pending`.

> Le lien `/go/` active également le **mode participant** : la navigation est limitée aux outils liés à l'événement (Enregistreur, Éditeur, etc. sont masqués) et la page d'accueil redirige vers l'événement. Cela maintient l'expérience concentrée pour les participants au rallye.

---

### 2.1.2 Ce que voit le participant après avoir rejoint

Une fois en statut pending, le participant voit un écran d'activation avec :

- Un **code QR** contenant le code d'activation à 6 caractères
- Le code lui-même affiché sous forme de texte (ex. `X3K9M2`)
- Un bouton *Copier*
- L'instruction : *"Montrez ce QR à l'organisateur de l'événement pour activer votre participation."*

Le participant montre ce QR (ou lit le code à haute voix) à l'organisateur **en personne** lors de l'enregistrement.

---

### 2.1.3 Comment l'organisateur active chaque participant

Sur la page **Participants** (`/admin/events/participants/?id=<id>`), l'organisateur voit une liste des participants en attente. La liste **se raffraîchit automatiquement toutes les 10 secondes** pour que les nouvelles demandes d'inscription apparaissent en direct.

Il y a trois façons d'activer :

| Méthode | Comment faire |
|---------|--------------|
| **1. Cliquez sur *Activer*** | À côté du nom de chaque participant en attente, cliquez sur le bouton *Activer*. Instantané — aucun code nécessaire. |
| **2. Saisissez le code d'activation** | En haut de la page, saisissez le code à 6 caractères (ex. `X3K9M2`) dans le champ de saisie et appuyez sur Entrée. |
| **3. Scannez le code QR** | Cliquez sur *Scanner QR* pour ouvrir la caméra de l'appareil. La caméra arrière scanne le QR du participant et le code est automatiquement rempli et soumis. Nécessite un navigateur basé sur Chromium. |

L'organisateur peut également **ajouter des participants directement** — recherchez par nom d'utilisateur ou email et ajoutez-les avec le statut `active` en une seule étape, en contournant complètement le flux d'attente/activation.

---

### 2.1.4 Après l'activation

Une fois que le statut passe de `pending` à **`active`**, le participant :

- Voit *"Vous participez à cet événement"* sur la page de l'événement
- Peut lire tous les roadbooks en statut **prêt** ou **public**
- Peut utiliser le Roadbook Reader en mode **Parcours** ou **Compétition**

Si le participant a rejoint via `/go/<code>`, sa navigation reste en **mode participant** jusqu'à ce qu'il revienne en mode complet via *"Passer en mode complet"* dans le menu de compte.

---

## 2.2 Déroulement de l'événement

Les participants ouvrent les roadbooks dans le **Reader** (`/reader/<slug>`):

| Mode | Comportement |
|------|-------------|
| **Parcours** | Suivre le parcours — aucun score, aucun résultat. |
| **Compétition** | Suivre et être évalué. À l'arrivée, un **QR de résultat** signé est produit. Le QR de résultat contient les données du parcours signées avec le jeton de compte du participant. L'organisateur collecte ces QR (capture d'écran / photo) pour le classement. |

---

## 2.3 Classement

1. Ouvrez l'outil **Classement** (`/ranking/`) pour un roadbook de compétition spécifique.
2. Chargez les QR de résultat collectés auprès des participants.
3. Le classement final est construit automatiquement.

Les liens vers le classement apparaissent sur la page de l'événement pour les participants actifs et les organisateurs.

---

## 2.4 Gérer les participants

Depuis **Gestion des événements** → *Participants* pour votre événement :

| Action | Comment faire |
|--------|--------------|
| **Lister / rechercher** | Tableau paginé avec recherche. Les participants en attente sont surlignés. Actualisation automatique toutes les 10 s. |
| **Activer** | Scannez le QR du participant, saisissez son code d'activation, ou cliquez sur *Activer*. |
| **Désactiver** | Cliquez sur *Supprimer* — le participant perd l'accès. |
| **Ajouter directement** | Recherchez des utilisateurs et ajoutez-les sans code d'inscription. |
| **Exporter** | Téléchargement CSV de la liste des participants. |

---

## 2.5 Page de l'événement (`/event/<slug>`)

La page publique de l'événement affiche :

- Logo, titre et description
- Période
- Lien vers le site de l'organisateur
- Quartier général sur une carte
- Galerie des roadbooks attachés (avec badges de statut)
- Formulaire d'inscription (pour les participants)
- Liens vers le classement (une fois les résultats disponibles)

---

## 2.6 Limites et notes

- Seuls les roadbooks **vous appartenant** peuvent être ajoutés à votre événement (les admins peuvent ajouter n'importe lesquels).
- La suppression d'un événement est permanente — toutes les associations de participants sont supprimées.
- Le mode de score FIA est un placeholder ; utilisez *Règles Roadbook-suite* pour la compétition.
- Les codes d'inscription sont sensibles à la casse.

---

## 2.7 Prochaine étape

Vous voulez voir à quoi ressemble un événement du point de vue d'un participant ? → [Naviguer avec le Reader →](04-reader.md)
Prêt pour le score ? → [Utiliser le Tripmaster →](05-tripmaster.md)
