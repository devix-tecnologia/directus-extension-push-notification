# 🧩 Task 014 — GitHub Actions CI has been disabled since February and the release workflow could not publish

- Status: done
- Type: fix
- Assignee: sidartaveloso

## Description

Both workflows were renamed to .disabled on 2026-02-12. Re-enabled as they were, both would fail: pnpm/action-setup pins version 9 against packageManager pnpm@11.21.0, the release job runs Node 20 while pnpm 11.21 requires >= 22.13, @semantic-release/git pushes the version commit straight to a main that requires a reviewed PR, and the repo has no npm credential. The CI only ran on PRs to main, never on develop, and ran no tests.

## Tasks

- [x] CI: drop the pnpm version pin so `pnpm/action-setup` reads `packageManager`
- [x] CI: run on pushes to every branch and on PRs to `main`, and add the unit tests (`pnpm test:unit`)
- [x] Release: Node 24 (pnpm 11.21 requires >= 22.13) and no pnpm version pin
- [x] Release: stop `@semantic-release/git` from pushing the version commit to the protected `main`
- [x] Release: npm credential — trusted publisher (GitHub Actions, `package_deploy.yml`) configured on 2026-10-02 with `npm trust github`; no `NPM_TOKEN` needed
- [x] Prove the CI green on GitHub on a branch before it reaches `develop`

- [x] `pnpm/action-setup` v6: runs on Node 24 and declares pnpm 11 support (v4 ran on the deprecated Node 20)

## Notes

- Disabled in `e0af1ac` ("chore: temporarily disable CI workflows"). The 0.4.x
  releases of 2026-02-27 were published by hand afterwards; the only
  `chore(release)` commit in history is 0.1.3.
- `main` requires a PR with one approving review (`enforce_admins` off). The
  `GITHUB_TOKEN` of a workflow cannot push straight to it, so the
  `@semantic-release/git` step would fail after npm had already published.
- Dependabot's `github-actions` update has failed every week since the
  workflows were disabled (last seen 2026-05-25): there is no workflow file for
  it to read.
- The release workflow only runs on `main`. Re-enabling it on `develop` arms the
  `1.0.0` release (task 010's breaking change) for the day `develop` is merged
  into `main`; it does not publish anything by itself.
- CI proven green on GitHub on `feat/task-014` (lint, typecheck, test, build).
  The first run failed on `format:check` over this very file, as it should.
- `@semantic-release/git` left `.releaserc.json` and the devDependencies. The
  lock lost only the importer entry and the plugin's exclusive closure (13
  packages); a full pnpm re-resolution would have rewritten ~10k lines.
- `semantic-release --dry-run` on the branch (npm plugin left out, no
  credential): config loads, push to the repo is allowed, next version 1.0.0.
  Locally it needs Node >= 24.10; `.tool-versions` pins 24.9.0, CI uses the
  latest 24.x.
- Dependabot reads workflows from `main`, which still holds the `.disabled`
  files: its `github-actions` update keeps failing until `develop` reaches
  `main`.
- npm credential: trusted publisher created on 2026-10-02 by the account owner
  (`npm trust github`, id `c34698e9-ebf3-4a16-ba43-d9a90b8e5268`, permissions
  publish and stage publish). The release job publishes through OIDC with the
  `id-token: write` it already has, and gets provenance attestations.
