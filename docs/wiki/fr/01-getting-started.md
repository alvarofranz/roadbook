# Guide rapide — Premiers pas avec RDBK.app

Bienvenue ! RDBK.app est une PWA (Progressive Web App) pour créer, partager et suivre des roadbooks numériques. Elle fonctionne **entièrement dans le navigateur** — rien à installer, mais vous pouvez aussi l'« installer » comme une application sur votre téléphone.

L'application fonctionne **hors ligne** pour l'enregistrement, l'édition et la navigation. Une connexion n'est nécessaire que pour : la connexion, la sauvegarde sur le profil, l'envoi de photos/audio, les pages publiques.

---

## 1. Choisissez quoi faire — les 4 outils principaux et les options

| Outil | À quoi il sert | Quand l'utiliser |
|------|--------------|---------------|
| **Roadbook Recorder** | Enregistre une trace GPS en direct, que vous pouvez enrichir de waypoints aux endroits où vous souhaitez placer des notes ; vous pouvez aussi associer des photos de carrefour et de pratiques notes vocales pour prendre des repères sur la façon de dessiner la tulipe ou divers avertissements | Lors de la reconnaissance / du repérage sur le terrain |
| **Editor** | Créer ou modifier un roadbook à partir d'un enregistrement, d'un GPX ou d'un roadbook au format openrally ; optimise la trace, revoit les notes vocales et les photos du repérage, complète les notes et les tulipes en les dessinant ; la gestion des flèches et des CAP est automatique selon la trace sous-jacente. À la fin vous pouvez l'exporter au format RDBK, openrally et PDF si vous préférez l'imprimer | Après l'enregistrement (ou à partir de zéro) pour préparer le roadbook définitif |
| **Roadbook Reader** | Permet de naviguer dans les roadbooks numériques en mode touristique ou compétition, peut marquer automatiquement les notes atteintes et dispose en outre d'une carte (optionnelle) qui présente la position de chaque note par rapport à celle du véhicule | Pendant l'événement / la sortie — c'est le « copilote » |
| **Roadbook Player** | Ordinateur de bord GPS sans roadbook : odomètre total/partiel, vitesse, cap, chronomètre, compteur de waypoints, enregistrement GPX | Reconnaissances libres, épreuves, sorties sans roadbook prédéfini |

> **AUTRES POSSIBILITÉS** :  
> - dans la **PAGE D'ACCUEIL** vous trouvez une galerie des roadbooks publics que vous pouvez consulter ou parcourir
> - si vous êtes inscrit vous pouvez sauvegarder vos roadbooks (brouillon/prêt/public) sur RDBK.app et les partager entre téléphone et PC
> - dans la section **Événements** vous trouvez des événements organisés par les Clubs
> - ... et vous pouvez toujours organiser un événement en exploitant la gestion numérique de vos roadbooks !

---

## 2. Flux typique « de zéro à la course »

```
┌─────────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Recorder   │ ──→ │ Editor  │ ──→ │  Save   │ ──→ │ Reader  │ ←── │  Event  │
│  (terrain)  │     │ (écrit) │     │ (profil)│     │ (navigue)│    │ (organ.)│
└─────────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
      │                   │                │                │              │
  GPS live           Dessine/        Sauvegardé sur     Suivez         Créez l'événement,
  waypoint           importe        cloud +            notes +        associez RB,
  photo/audio        GPX/.rdbk      .rdbk local        CAP +          inviter avec
                      icônes/symboles optionnel      score          code d'accès
```

---

## 3. Pourquoi créer un compte

La connexion vous permet de sauvegarder vos roadbooks sur le cloud et de les retrouver sur n'importe quel appareil — vous pouvez enregistrer une trace avec le téléphone lors d'un repérage puis l'éditer confortablement depuis le PC sans vous embêter à déplacer des fichiers.

1. Touchez **Compte** (en haut à droite) → **Inscription**
2. Saisissez : nom, prénom, nom d'utilisateur, e-mail, mot de passe (≥ 8 caractères)
3. Cochez **J'accepte les Conditions d'utilisation**
4. Complétez le défi Turnstile (si actif)
5. Vous recevrez un e-mail : cliquez sur **Vérifier mon e-mail** sous 24 h
6. Revenez dans l'application et faites **Connexion** avec e-mail/nom d'utilisateur + mot de passe

> **Connexion Google** : si vous voyez le bouton « Continuer avec Google », vous pouvez l'utiliser pour créer/accéder sans mot de passe.

---

## 4. Concepts clés à connaître immédiatement

| Concept | Signification |
|----------|----------------|
| **Statut du roadbook** | `draft` = brouillon privé · `ready` = prêt mais privé · `public` = visible par tous dans la galerie |
| **Sauvegarde locale vs cloud** | Dans l'Editor : **Export .rdbk** = fichier ZIP sur votre appareil (hors ligne, portable). **Save to profile** = sauvegardé sur le serveur, retrouvé sur tout appareil connecté |
| **Photos & notes vocales** | Elles ne vont pas dans le `.rdbk` à moins de cocher « Inclure photos et audio » à l'export. Elles vivent sur le serveur (connexion requise). Hors connexion elles restent sur l'appareil et vont dans le `.rdbk` local |
| **Code d'accès événement** | Code court (ex. `DA2C09`) que l'organisateur vous donne. Ouvrez `/go/DA2C09` → vous entrez dans l'événement, voyez les roadbooks `ready` réservés aux participants |
| **Score de course (Ranking)** | Uniquement en mode **Competition** dans le Reader. Génère un QR signé de 55 caractères en fin d'épreuve. |

---

## 5. Premières choses à essayer (5 minutes)

1. **Enregistrer une trace** → Recorder → « Start recording » → marchez/conduisez → « Finish » → « Open in Editor »
2. **Dessiner un itinéraire** → Editor → « Draw on the map » → touchez deux points → ajoutez des notes (touchez la ligne → éditeur en ligne)
3. **Exporter .rdbk** → Editor → Export → .rdbk → téléchargez le fichier ZIP
4. **Ouvrir dans le Reader** → Reader → « Carica file .rdbk » → choisissez le fichier → « Trip mode » → commencez à naviguer
5. **Essayer le Tripmaster** → Tripmaster → Start → voyez odomètre, vitesse, cap en direct

---

## 6. Où trouver de l'aide

| Choix | Où |
|------|------|
| Conditions d'utilisation | `/terms/` (lien dans le pied de page) |
| Confidentialité | `/privacy/` |
| Standard `.rdbk` | `/standard/` — spécification complète du format |
| Signaler un bug / demander une fonctionnalité | GitHub Issues (lien dans le pied de page → About) |
| Contact | `/contact/` |

---

## 7. Étape suivante

Choisissez l'outil dont vous avez besoin et lisez son guide :

- 📍 [Enregistrer une trace →](02-recorder.md)
- ✏️ [Créer/modifier un roadbook →](03-editor.md)
- 🧭 [Naviguer avec le Reader →](04-reader.md)
- 📊 [Utiliser le Tripmaster →](05-tripmaster.md)
