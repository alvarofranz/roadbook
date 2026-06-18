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

Follow these steps to get the application running locally:

#### Local development with DDEV (recommended)

[DDEV](https://ddev.com/) spins up the full stack (PHP 8.1 + MariaDB + web server) in Docker with one command — no local PHP or database setup.

1. Install [Docker](https://docs.docker.com/get-docker/) and [DDEV](https://ddev.com/get-started/).
2. From the repo root, run **`ddev start`**. On the first start it automatically installs the Composer deps, creates `public/assets/js/config.js` from the example, and applies every `migrations/*.sql` to a fresh database.
3. Open it with **`ddev launch`** → `https://rdbk.ddev.site`

Handy: `ddev mysql` (DB shell), `ddev ssh` (web container), `ddev composer install`, `ddev stop`. Re-apply the migrations on a wiped DB with `for f in migrations/*.sql; do ddev mysql < "$f"; done`. The base map uses free, no-key MapLibre tiles; for satellite imagery add a MapTiler `styleSatellite` URL to `public/assets/js/config.js`.

The rest of this section covers the **manual** setup, if you prefer not to use DDEV.

#### Prerequisites
1.  PHP (Version compatible with project requirements)
2.  Composer (PHP Dependency Manager)
3.  Web Server (e.g., Apache via WAMP/XAMPP)
4.  Database System (MySQL/MariaDB)

#### Installation Steps

1.  **Install Dependencies:** Open your terminal in the root directory of the project and run:
    ```bash
    composer install
    ```
2.  **Configure Environment:** Copy the example environment file and update credentials:
    ```bash
    cp .env.example .env
    # Edit the contents of the new .env file with your database credentials
    ```
3.  **Database Setup:**
    *   Create an empty database in your local MySQL instance matching the name defined in `.env`.
    *   Run all migration files sequentially via a dedicated SQL client (e.g., phpMyAdmin):
        1. `migrations/001_init.sql`
        2. `migrations/002_community.sql`
        3. `migrations/003_photos.sql`
        4. ... and so on, until all files are run.

#### Running the Application
Place this project directory within your web server's root folder (e.g., `/var/www/html/`). You can then access the application via your local host URL (e.g., `http://localhost/`).

##### Windows 11
from console
   > python3 -m http.server 8000

## 🗺️ Directory Structure Overview

*   `public/`: The main entry point for the web client, containing all HTML, JavaScript, and CSS assets.
*   `app/`: Contains the core business logic (PHP functions) that handle data fetching, saving, and validation.
*   `migrations/`: SQL files used to version control the database schema.
*   `cron/`: Scheduled tasks executed by a cron job for background maintenance (e.g., cleaning up drafts).
*   `tools/`: Utility scripts and helpers.

---
**Project Maintainer:** Alvaro, Maurizio, inspired by works from Massimiliano of [RoadBook System](https://www.roadbook-system.com/)

**License:** See `LICENSE` file for details.
