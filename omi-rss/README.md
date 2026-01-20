# Omi RSS Ecosystem

This repository contains the complete ecosystem for the Omi RSS project, including the marketing website, mobile/desktop application, browser extension, and backend server.

## Project Structure

### 🌐 [Marketing Website](/) (Root)
The main marketing website and landing page.
- **Tech Stack**: React, Vite, Tailwind CSS.
- **Location**: Root directory files (`src/`, `public/`, `package.json`, etc.).
- **Run**: `npm install` then `npm run dev`.

### 📱 [Application](/app) (`/app`)
The core RSS Reader application featuring a Glassmorphism UI and AI capabilities.
- **path**: `app/` (formerly `rss_glassmorphism_reader`)
- **Tech Stack**: Flutter.
- **Features**: Cross-platform (iOS, Android, Desktop, Web), Offline support, AI summarization.

### 🧩 [Browser Extension](/extension) (`/extension`)
Companion browser extension to save articles and manage feeds.
- **path**: `extension/` (formerly `browser_extension`)
- **Support**: Chrome, Firefox, Brave.

### 🖥️ [Backend Server](/server) (`/server`)
API and backend services.
- **path**: `server/` (formerly `omi_rss_server`)
- **Tech Stack**: Node.js (TypeScript/Drizzle) & Dart (Serverpod).

## Cleanup Notes

The project structure has been reorganized.
- **_cleanup_backup/**: Contains files from the previous root structure (legacy scripts, documentation). You may delete this folder once you have verified everything is working correctly.
