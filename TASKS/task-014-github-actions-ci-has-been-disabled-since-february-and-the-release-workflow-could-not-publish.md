# 🧩 Task 014 — GitHub Actions CI has been disabled since February and the release workflow could not publish

- Status: in-progress
- Type: fix
- Assignee: sidartaveloso

## Description
Both workflows were renamed to .disabled on 2026-02-12. Re-enabled as they were, both would fail: pnpm/action-setup pins version 9 against packageManager pnpm@11.21.0, the release job runs Node 20 while pnpm 11.21 requires >= 22.13, @semantic-release/git pushes the version commit straight to a main that requires a reviewed PR, and the repo has no npm credential. The CI only ran on PRs to main, never on develop, and ran no tests.

## Tasks

- [ ] CI: drop the pnpm version pin so `pnpm/action-setup` reads `packageManager`
- [ ] CI: run on pushes to every branch and on PRs to `main`, and add the unit tests (`pnpm test:unit`)
- [ ] Release: Node 24 (pnpm 11.21 requires >= 22.13) and no pnpm version pin
- [ ] Release: stop `@semantic-release/git` from pushing the version commit to the protected `main`
- [ ] Release: npm credential — trusted publishing (OIDC, no secret) or an `NPM_TOKEN` granular token
- [ ] Prove the CI green on GitHub on a branch before it reaches `develop`

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
