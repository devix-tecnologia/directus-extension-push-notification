# 🧩 Task 017 — the extension adds about 14 s to every Directus start

- Status: pending
- Type: fix
- Assignee: sidartaveloso

## Description
Measured on 2026-10-05 with the geohub Directus image (11.17.3, 16 cores, throwaway SQLite), time until 'Server started' after bootstrap: all extensions 44 s, without directus-extension-push-notification 30 s, no extensions at all 29 s. So this extension accounts for almost all the extension cost of every start, even when db-configuration has nothing to create (no [DB Configuration] lines in those boots). On a production server with the Directus container limited to 2 CPUs the whole start takes about 3 min, and the image loads extensions twice per boot (bootstrap and pm2 start). Find what the extension does at load time that costs this, make the start path cheap, and add a measurement that guards against regression.

## Tasks
<!-- [x] feito · [ ] em aberto · [ ] ... — adiado: <razão> para o que se decidiu não fazer -->
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Notes
Add any relevant notes or links here.
