# Tripmaster — Ordinateur de bord GPS

Le **Tripmaster** est un ordinateur de bord GPS sans roadbook : aucune note, aucun itinéraire à suivre, aucun score. Il affiche en temps réel l'odomètre total et partiel, la vitesse avec bandes d'alerte, le cap (heading), le chronomètre et le compteur de waypoints — utile pour les reconnaissances, les épreuves ou les sorties où seul l'instrumentation de bord est nécessaire.

> Fonctionne hors ligne à 100 %. La session est sauvegardée à chaque fix, donc un appel ou un verrouillage d'écran ne perdent rien.

---

## 1. Démarrage

Ouvrez **Tripmaster** (`/tripmaster/`) et touchez **Start**. Vous voyez immédiatement le tableau de bord en direct avec tous les instruments.

Au démarrage le Tripmaster vérifie automatiquement :
1. **Session interrompue** en cours → propose la reprise
2. **Trace GPX orpheline** → propose la récupération
3. **Rien** → repart à zéro

---

## 2. Le tableau de bord

```
┌──────────────────────────────────┐
│ ⏰ 14:32   🔋 85%   🛰 ±3m      │
├──────────────────────────────────┤
│                                  │
│  TOTAL           PARTIEL         │
│  12,34 km        0,56 km         │
│  [−10] [+10]    [−10] [+10]      │
│                                  │
│  VITESSE         CAP             │
│  45 km/h ▲      045° ↗           │
│  ⚠ max : 78 km/h                 │
│                                  │
│  CHRONO          WAYPOINT        │
│  12:34 ▶         5              │
│                                  │
├──────────────────────────────────┤
│ [🔴 STOP GPX] [🏁 Fin de trajet] │
└──────────────────────────────────┘
```

### Instruments :

| Instrument | Description |
|-----------|-------------|
| **Odomètre total** | Distance parcourue depuis le début de la session |
| **Odomètre partiel** | Distance depuis le dernier reset ou waypoint |
| **Vitesse** | Vitesse actuelle + maximale enregistrée |
| **Cap (Heading)** | Direction de marche en degrés avec aiguille |
| **Chronomètre** | Minuteur start/pause/reset |
| **Waypoint** | Compteur (seul le nombre, aucune position sauvegardée) |

---

## 3. Odomètre : total, partiel et corrections

Deux odomètres indépendants, tous deux avec correcteurs manuels ±10 m :

| Bouton | Action |
|----------|--------|
| **+10 / −10** (partiel) | Corrige le partiel |
| **+10 / −10** (total) | Corrige le total |

> Les correcteurs ne peuvent pas descendre sous 0.

### Reset du partiel

Maintenez le bouton de reset enfoncé **5 secondes** (protection anti-touche accidentelle). Le partiel s'efface aussi automatiquement quand vous appuyez sur **Mark waypoint**.

---

## 4. Vitesse et bandes d'alerte

Définissez une **vitesse à surveiller** pour recevoir des signaux visuels :

| Bande | Condition | Couleur (défaut) |
|-------|-----------|------------------|
| Sous la limite | `v < limite − 5` | Vert |
| En approche | `limite − 5 ≤ v < limite` | Orange |
| Dépassement | `v ≥ limite` | Rouge avec ⚠ |

> La configuration des bandes (limite et couleurs) se définit depuis le bouton des réglages de vitesse. Les couleurs et la limite sont sauvegardées et restaurées à la session suivante.

---

## 5. Chronomètre

Le chronomètre utilise l'horloge système, il continue donc de compter même si l'application passe en arrière-plan.

| Bouton | Action |
|----------|--------|
| **Start/Pause** | Démarre ou met en pause |
| **Reset** | Efface (uniquement chrono arrêté) |

> Le temps affiché inclut la période en arrière-plan : si vous mettez en pause et reprenez des heures plus tard, le comptage repart de là où il était.

---

## 6. Compteur de waypoint

Appuyez sur **Mark waypoint** pour :
- Incrémenter le compteur de waypoint
- Effacer le **partiel**

> Le compteur est uniquement un nombre — il n'enregistre pas de coordonnées. Pour enregistrer la position réelle, activez l'**enregistrement GPX**.

---

## 7. Enregistrement GPX

Activez l'enregistrement GPX depuis le bouton dédié pour avoir une trace de votre sortie :

- **Crash-safe** : point de contrôle à chaque fix, récupération si l'application se ferme
- Le bouton devient rouge **STOP** pendant l'enregistrement
- Modal de réglages pour configurer le nom de fichier et les options

---

## 8. Récupération de session interrompue

Au démarrage vérifie dans l'ordre :
1. **Session en cours** dans `localStorage` → propose la reprise avec toutes les données (odomètres, chrono, waypoint, GPX)
2. **GPX orphelin** → propose la récupération de la trace interrompue
3. **Rien** → repart à zéro

> Refuser la reprise **n'efface pas** la session : elle est écrasée dès que vous commencez à bouger, ou supprimée explicitement avec « End the trip ».

---

## 9. Raccourcis clavier (ordinateur)

| Touche | Action |
|-------|--------|
| `Espace` | Mark waypoint |
| `P` | Pause/Reprise chrono |
| `Esc` | Fin de trajet |

---

## 10. Étape suivante

Vous avez terminé la reconnaissance ? → [Recorder : enregistrer une trace →](02-recorder.md)  
Vous voulez créer un roadbook ? → [Editor : créer/modifier →](03-editor.md)
