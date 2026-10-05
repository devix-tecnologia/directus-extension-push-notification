# 🧩 Task 016 — client script writes to the user's browser console on every page load

- Status: in-progress
- Type: fix
- Assignee: sidartaveloso

## Description
The script injected into the Directus app (src/push-client-script/client-script.ts) hardcodes DEBUG = true and its log/warn/error helpers call console.* unconditionally — 68 calls. Every page load prints the public URL, the host and the first 20 characters of the VAPID public key to the end user's console. Requirement (Sidarta, 2026-10-05): no console output in the user's browser. Remove the console output from the client script and the service worker; keep diagnostics available only through an explicit opt-in that is off by default, and add a test that fails if console.* reaches the generated script.

## Tasks
<!-- [x] feito · [ ] em aberto · [ ] ... — adiado: <razão> para o que se decidiu não fazer -->
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Notes
Add any relevant notes or links here.
