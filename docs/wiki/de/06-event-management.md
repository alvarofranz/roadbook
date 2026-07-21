# Event-Verwaltung

Mit **Events** kannst du Rallyes, Treffen und Wettbewerbe rund um Roadbooks auf RDBK.app organisieren. Ein Event bündelt Roadbooks, Teilnehmer und (optional) Wertungen — alles unter einem Dach.

> Zum Erstellen von Events benötigst du die **Organisator-Rolle**. Siehe [Erste Schritte →](01-getting-started.md) oder frage einen Administrator.

---

## 1 Event-Vorbereitung

---

## 1.1 Organisator-Rolle — Voraussetzungen

Das Erstellen von Events ist auf Benutzer mit **Organisator-Rolle** beschränkt.

| Schritt | Was passiert |
|---------|-------------|
| **Anfragen** | Auf der [Event-Seite](/features/events/) klicke *Organisator-Rolle anfordern* und stelle kurz die Event-Idee vor — die App sendet eine E-Mail an den Admin. |
| **Gewähren** | Ein Admin aktiviert das Flag im Admin-Panel. |
| **Du bist dabei** | *Event-Verwaltung* erscheint in deinem Kontomenü. |

---

## 1.2 Ein Event erstellen

Melde dich an und gehe zu **Menü / Event-Verwaltung**; klicke dann auf *Neues Event*.

| Feld | Hinweise |
|------|----------|
| **Titel** | Öffentlicher Name des Events. |
| **Beschreibung** | Beschreibe das Event; dieser Text wird auf der Event-Seite sichtbar sein. |
| **Beginn / Ende** | Event-Zeitraum (Kalenderauswahl). |
| **Sichtbarkeit** | **Öffentlich** — gelistet auf `/events/`, jeder kann es finden.<br>**Privat** — nur über direkten Link `/event/<slug>` zugänglich. |
| **Organisator-Website** | Optionaler Link, der auf der Event-Seite angezeigt wird. |
| **Event-Zentrale** | Setze einen Pin auf die Karte — wird auf der Event-Seite angezeigt. |
| **Logo** | Hochgeladen, automatisch in AVIF bei 512 px konvertiert. |

Nach dem Speichern hat das Event eine eigene Seite unter `/event/<slug>` und du bist der **Eigentümer**.

---

Jetzt das Event vervollständigen!

---

## 1.3 Rollen & Berechtigungen für das Event

Um ein Event zu verwalten, kann der Organisator andere Abonnenten als Co-Organisatoren einbinden. Als Team können sie Roadbooks teilen und die Teilnehmer-Anmeldungen verwalten, um ihnen die digitale Nutzung der Roadbooks über die RDBK.app-Plattform zu ermöglichen.

Dies ist natürlich optional — du kannst Roadbooks jederzeit als PDF exportieren und gedruckte Kopien verteilen.

| Rolle | Wie du sie bekommst | Was du tun kannst |
|-------|--------------------|-------------------|
| **Eigentümer** | Hast das Event erstellt | Alles — bearbeiten, löschen, Co-Organisatoren verwalten, Sichtbarkeit ändern |
| **Co-Organisator** | Vom Eigentümer eingeladen | Parameter bearbeiten, Roadbooks hinzufügen, Teilnehmer verwalten. Kann nicht löschen oder Sichtbarkeit ändern |
| **Teilnehmer (aktiv)** | Mit Code beigetreten + aktiviert | Bereitstehende/öffentliche Roadbooks lesen, Rangliste ansehen |
| **Teilnehmer (ausstehend)** | Code eingegeben, noch nicht aktiviert | Eingeschränkte Ansicht bis zur Aktivierung |

### 1.3.1 Co-Organisatoren hinzufügen

Im Event-Editor → Abschnitt **Organisatoren** → suche nach Benutzername, Name, E-Mail oder Organisation → hinzufügen.
Nur der **Eigentümer** kann Co-Organisatoren hinzufügen oder entfernen.

---

## 1.4 Roadbooks hinzufügen

Im Event-Editor → Abschnitt **Roadbooks** → *Roadbook hinzufügen* → die Auswahl zeigt nur **deine** Roadbooks.

Jedes Roadbook hat einen **Wertungsmodus**:

| Modus | Verwendung |
|-------|-----------|
| **Frei** (Standard) | Keine Wertung — Teilnehmer folgen der Route. |
| **Roadbook-Suite-Regeln** | Rangliste / Wettbewerb — der Reader wertet die Fahrt. |
| **FIA-Regeln** | Angezeigt aber noch nicht implementiert. |

Roadbooks können neu angeordnet (Ziehgriffe) und entfernt werden. Es können nur Roadbooks hinzugefügt werden, die dir gehören.

---

## 1.5 Teilnehmer-Anmeldungen verwalten

### 1.5.1 Beitrittscode generieren

Im Event-Editor → **Teilnehmer** → *Code generieren*.
Es wird ein 4–16-stelliger Code erstellt. Du kannst ihn anpassen. Ein Kurzlink `/go/<code>` und ein QR-Code sind automatisch verfügbar.

### 1.5.2 Code zum Beitritt zum Event teilen

Sende den Code (oder den Link / QR) an deine Teilnehmer. Der Teilnehmer benötigt diesen Code, um seine Registrierung für das Event durchzuführen (siehe Punkt **2.1.1**).

Personen, die diesen Code erhalten, können sich für das Event vorregistrieren, müssen aber aktiviert werden, um die Roadbooks sehen und nutzen zu können (siehe **2.1.1**).

## 2 Event-Durchführung

---

## 2.1 Beitreten + aktivieren

Jeder Teilnehmer muss dem Event zunächst beitreten und dann vom Organisator **aktiviert** werden. Die Aktivierung stellt sicher, dass der Organisator jede Person persönlich bestätigt — keine automatische Selbsteinschreibung.

---

### 2.1.1 Wie ein Teilnehmer beitritt

Es gibt zwei Wege:

| Methode | Wie es funktioniert |
|---------|---------------------|
| **Über die Event-Seite** | Der Teilnehmer besucht `/event/<slug>`, gibt den Beitrittscode im Formular ein und klickt auf *Beitreten*. |
| **Über den Kurzlink** `/go/<code>` | Der Organisator druckt den Event-Link und seinen QR-Code aus und platziert ihn am Eingang des Event-Anmeldeschalters. Teilnehmer scannen den QR, greifen auf die Website zu und führen ihre eigene Anmeldung auf der Plattform durch. So sind sie bereit für den Aktivierungsschritt, der nach Abschluss der Anmeldeformalitäten (z. B. Anforderungsprüfungen und Zahlungen) durchgeführt wird. |

In beiden Fällen generiert der Server einen **eindeutigen 6-stelligen Aktivierungscode** (z. B. `X3K9M2`) und zeichnet den Teilnehmer mit Status `pending` auf.

> Der `/go/`-Link aktiviert auch den **Teilnehmer-Modus**: Die Navigation ist auf eventbezogene Werkzeuge beschränkt (Rekorder, Editor usw. sind ausgeblendet) und die Startseite leitet zum Event weiter. Dies hält die Erfahrung fokussiert für Rallye-Teilnehmer.

---

### 2.1.2 Was der Teilnehmer nach dem Beitritt sieht

Sobald der Status pending ist, sieht der Teilnehmer einen Aktivierungsbildschirm mit:

- Einem **QR-Code** mit dem 6-stelligen Aktivierungscode
- Dem Code selbst als Text (z. B. `X3K9M2`)
- Einem *Kopieren*-Button
- Der Anweisung: *"Zeige diesen QR dem Event-Organisator, um deine Teilnahme zu aktivieren."*

Der Teilnehmer zeigt diesen QR (oder liest den Code vor) dem Organisator **persönlich** beim Check-in.

---

### 2.1.3 Wie der Organisator jeden Teilnehmer aktiviert

Auf der **Teilnehmer**-Seite (`/admin/events/participants/?id=<id>`) sieht der Organisator eine Liste der ausstehenden Teilnehmer. Die Liste **aktualisiert sich automatisch alle 10 Sekunden**, sodass neue Beitrittsanfragen live erscheinen.

Es gibt drei Aktivierungsmöglichkeiten:

| Methode | Wie es geht |
|---------|------------|
| **1. *Aktivieren* klicken** | Neben dem Namen jedes ausstehenden Teilnehmers auf den *Aktivieren*-Button klicken. Sofortig — kein Code erforderlich. |
| **2. Aktivierungscode eingeben** | Oben auf der Seite den 6-stelligen Code (z. B. `X3K9M2`) in das Eingabefeld eingeben und Enter drücken. |
| **3. QR-Code scannen** | Auf *QR scannen* klicken, um die Gerätekamera zu öffnen. Die Rückkamera scannt den QR des Teilnehmers und der Code wird automatisch ausgefüllt und gesendet. Erfordert Chromium-basierten Browser. |

Der Organisator kann auch **Teilnehmer direkt hinzufügen** — nach Benutzername oder E-Mail suchen und mit Status `active` in einem Schritt hinzufügen, wodurch der Pending/Aktivierungs-Ablauf vollständig übersprungen wird.

---

### 2.1.4 Nach der Aktivierung

Sobald sich der Status von `pending` auf **`active`** ändert, kann der Teilnehmer:

- Sieht *"Du nimmst an diesem Event teil"* auf der Event-Seite
- Kann alle Roadbooks im Status **bereit** oder **öffentlich** lesen
- Kann den Roadbook Reader im Modus **Fahrt** oder **Wettbewerb** nutzen

Wenn der Teilnehmer über `/go/<code>` beigetreten ist, bleibt seine Navigation im **Teilnehmer-Modus**, bis er über *"Zum vollständigen Modus wechseln"* im Kontomenü zurückwechselt.

---

## 2.2 Das Event durchführen

Teilnehmer öffnen Roadbooks im **Reader** (`/reader/<slug>`):

| Modus | Verhalten |
|-------|-----------|
| **Fahrt** | Der Route folgen — keine Wertung, kein Ergebnis. |
| **Wettbewerb** | Folgen und bewertet werden. Am Ziel wird ein signierter **Ergebnis-QR** erzeugt. Der Ergebnis-QR enthält die Fahrtdaten, signiert mit dem Account-Token des Teilnehmers. Der Organisator sammelt diese QR-Codes (Screenshot / Foto) für die Rangliste. |

---

## 2.3 Rangliste

1. Öffne das **Ranglisten**-Werkzeug (`/ranking/`) für ein bestimmtes Wettbewerbs-Roadbook.
2. Lade die von den Teilnehmern gesammelten Ergebnis-QRs.
3. Die endgültige Rangliste wird automatisch erstellt.

Ranglisten-Links erscheinen auf der Event-Seite für aktive Teilnehmer und Organisatoren.

---

## 2.4 Teilnehmer verwalten

Von **Event-Verwaltung** → *Teilnehmer* für dein Event:

| Aktion | Wie es geht |
|--------|------------|
| **Auflisten / suchen** | Paginierte Tabelle mit Suche. Ausstehende Teilnehmer werden hervorgehoben. Automatische Aktualisierung alle 10 s. |
| **Aktivieren** | Scanne den QR des Teilnehmers, gib seinen Aktivierungscode ein, oder klicke auf *Aktivieren*. |
| **Deaktivieren** | Klicke auf *Entfernen* — der Teilnehmer verliert den Zugriff. |
| **Direkt hinzufügen** | Suche Benutzer und füge sie ohne Beitrittscode hinzu. |
| **Exportieren** | CSV-Download der Teilnehmerliste. |

---

## 2.5 Event-Seite (`/event/<slug>`)

Die öffentliche Event-Seite zeigt:

- Logo, Titel und Beschreibung
- Zeitraum
- Link zur Organisator-Website
- Event-Zentrale auf einer Karte
- Galerie der angehängten Roadbooks (mit Status-Badges)
- Beitrittsformular (für Teilnehmer)
- Ranglisten-Links (sobald Ergebnisse verfügbar)

---

## 2.6 Grenzen & Hinweise

- Nur Roadbooks **in deinem Besitz** können zu deinem Event hinzugefügt werden (Admins können beliebige hinzufügen).
- Das Löschen eines Events ist endgültig — alle Teilnehmerzuordnungen werden entfernt.
- Der FIA-Wertungsmodus ist ein Platzhalter; verwende *Roadbook-Suite-Regeln* für Wettbewerbe.
- Beitrittscodes unterscheiden zwischen Groß- und Kleinschreibung.

---

## 2.7 Nächster Schritt

Möchtest du sehen, wie ein Event aus Teilnehmersicht aussieht? → [Mit dem Reader navigieren →](04-reader.md)
Bereit für die Wertung? → [Tripmaster verwenden →](05-tripmaster.md)
