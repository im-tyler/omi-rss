# omi-rss — Plan

## What this is

A cross-platform RSS reader built as three pieces that work together: a Flutter client app, a browser extension for one-tap subscribe from any site, and a self-hostable Node + TypeScript backend that fetches, stores, and serves subscriptions and articles.

Website: <https://omirss.com>

## Current state

**Alpha.** All three components exist; integration between them is the active work. Per the README, the pieces are:

- **Client** — Flutter app (project `rss_glassmorphism_reader`)
- **Browser extension** — subscribe to feeds from the web
- **Backend** — Node + TypeScript, Dockerized, fetches/stores/serves

Repository layout in README: `app/` (client), `extension/`, `server/`. Actual on-disk top level has `omi-rss/` (client) and `Webroll/` subfolders — **layout needs reconciling with README before broader publication**.

## Architecture (per README)

```
omi-rss/
├── app/         Flutter reader client
├── extension/   browser extension
└── server/      backend (Node + TypeScript, docker-compose)
```

- **Client** is Flutter (cross-platform: iOS, Android, desktop)
- **Extension** is MV3 (presumably; verify)
- **Backend** is Node + TypeScript, deployed via docker-compose

## Roadmap

### Shipped
- Flutter client with glassmorphism reader UI
- Backend with feed fetch/store/serve
- Browser extension for one-tap subscribe

### Next (v0.2)
- **Reconcile repo layout** with README (folder rename or README update)
- End-to-end subscribe flow: click extension on a site → backend stores → client sees the new feed
- OPML import/export (table stakes for any RSS reader)
- Background fetch scheduling on the backend (cron or queue)

### Later (v0.3+)
- Mobile app store publication (iOS App Store, Google Play)
- Chrome Web Store / Firefox Add-ons publication for the extension
- Read-later / bookmark sync across devices
- Full-text search across cached articles
- Self-hosted deployment guide + Docker image publication

## Out of scope (deliberate)

- **AI summarization / ranking** — readers vary on whether they want this; defer to user feedback
- **Social features** (sharing, following other readers) — out of scope; this is a personal reader
- **Podcast support** — separate format, separate pipeline; could be a v1.x addition if demand exists
- **Read-it-later integration** (Pocket, Instapaper) — defer; users can use the bookmark sync

## Design decisions to defend

1. **Three pieces, one repo.** The pieces are tightly coupled (client talks to backend, extension talks to backend); splitting creates integration overhead.
2. **Flutter for the client.** Single codebase for iOS, Android, desktop. Cost: Dart fluency; benefit: maximum coverage per line.
3. **Self-hostable backend, not SaaS-only.** Matches Tyler's portfolio pattern (Teploy, Tebian, maccel) — own your data.
4. **Backend in Node + TypeScript, not Go.** Existing implementation; rewriting for purity isn't justified yet.

## Open questions

- **Repo layout vs README mismatch** — `omi-rss/` vs `app/`, `Webroll/` vs `extension/`; needs reconciling
- Whether the browser extension is MV3 (required for Chrome Web Store going forward)
- Mobile-first vs desktop-first priority for the client
- Whether to publish backend as a Docker image on Docker Hub / ghcr for easy self-host

## License

MIT — see [LICENSE](LICENSE).
