# Roadbook Challenge Platform

## 🛣️ Project Description

This is a robust web application designed for managing, sharing, and viewing rally roadbooks. It serves as a comprehensive platform for motorsport enthusiasts, organizers, and participants to digitally capture detailed race course notes (roadbooks) and challenge themselves using the recorded data.

The platform emphasizes offline capability by implementing Progressive Web App (PWA) features, making it reliable for use in remote areas with poor connectivity.

### ✨ Features

*   **Roadbook Creation & Editing:** Users can create detailed roadbooks, adding sequential notes that include various terrain and obstacle types (managed via specialized icons).
*   **Challenge System:** Allows users to participate in virtual challenges based on existing roadbooks, fostering community engagement.
*   **Ranking/Leaderboard:** Tracks user performance against published challenges.
*   **Photo Management:** Integrates photo capture linked to specific geographic points on the course, with geolocation capabilities.
*   **Privacy Control:** Supports both public and private roadbooks.

### 🛠️ Technical Stack

*   **Backend:** PHP (Server-side logic, API endpoints).
*   **Frontend:** Vanilla JavaScript / HTML5 (SPA structure for optimal user experience).
*   **Database:** MySQL/MariaDB (Managed through SQL migrations).
*   **Dependencies:** Composer (PHP package manager).
*   **Deployment:** Designed with CI/CD best practices (`.github/workflows`).

### 🚀 Getting Started

Follow these steps to get the application running locally:

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