# RDBK.app

## 🛣️ Project Description

This is a  web application designed for managing, sharing, and viewing rally roadbooks. It serves as a comprehensive platform for motorsport enthusiasts, organizers, and participants to digitally capture detailed race course notes (roadbooks) and challenge themselves using the recorded data.

The platform emphasizes offline capability by implementing Progressive Web App (PWA) features, making it reliable for use in remote areas with poor connectivity.

**Every feature of the project is also available as a free, installable cross-platform web app (PWA)** — on Windows and Mac computers, Android and iOS. No app store is needed: add it to your home screen / desktop and use it like a native app, even offline.

### ✨ Features

*   **Roadbook Creation & Editing:** Users can create detailed roadbooks, adding sequential notes that include various terrain and obstacle types (managed via specialized icons).
*   **Challenge System:** Allows users to participate in virtual challenges based on existing roadbooks, fostering community engagement.
*   **Ranking/Leaderboard:** Tracks user performance against published challenges.
*   **Photo Management:** Integrates photo capture linked to specific geographic points on the course, with geolocation capabilities.
*   **Privacy Control:** Supports both public and private roadbooks.
*   **Cross-platform & installable:** every feature runs as an installable PWA on Windows, Mac, Android and iOS — no app store, offline-capable.

### 🛠️ Technical Stack

*   **Backend:** PHP (Server-side logic, API endpoints).
*   **Frontend:** Vanilla JavaScript / HTML5 (SPA structure for optimal user experience).
*   **Database:** MySQL/MariaDB (Managed through SQL migrations).
*   **Dependencies:** Composer (PHP package manager).
*   **Deployment:** Designed with CI/CD best practices (`.github/workflows`).

### 🚀 Getting Started

The front-end is a plain static PWA (web root `public/`, no build step): any static web
server pointed at `public/` runs every tool without the back-end (accounts/sharing are
simply disabled). Copy `public/assets/js/config.js.example` to `config.js`; the base map
uses free, no-key MapLibre tiles — for satellite imagery add a MapTiler `styleSatellite`
URL there.

#### Full stack (accounts, sharing, public roadbooks)

1.  **Prerequisites:** PHP 8.1, Composer, a web server serving `public/` as the document
    root (Apache config ships in `public/.htaccess`), MariaDB/MySQL.
2.  **Install dependencies:**
    ```bash
    composer install
    ```
3.  **Configure environment:**
    ```bash
    cp .env.example .env
    # edit .env with your database credentials
    ```
4.  **Database setup:** create the database named in `.env`, then apply every
    `migrations/*.sql` in numeric order.

#### Unit tests

Node ≥ 22, then `npm install` and `npm test` (Vitest). CI runs the suite on every pull
request and before every deploy.

## 🗺️ Directory Structure Overview

*   `public/`: The web client — all HTML, JavaScript and CSS assets (also wrapped by Capacitor into the iOS/Android apps, see `NATIVE.md`).
*   `app/`: The core business logic (PHP functions) handling data fetching, saving, and validation.
*   `migrations/`: SQL files used to version control the database schema.
*   `cron/`: Scheduled tasks executed by a cron job for background maintenance (e.g., cleaning up drafts).
*   `native/`, `android/`, `ios/`: The Capacitor bridge source and native app projects.
*   `tests/`: The Vitest unit-test suite.

---
**Project Maintainer:** Alvaro, Maurizio, inspired by works from Massimo Sabattini of [RoadBook System](https://www.roadbook-system.com/)

**License:** See `LICENSE` file for details.
