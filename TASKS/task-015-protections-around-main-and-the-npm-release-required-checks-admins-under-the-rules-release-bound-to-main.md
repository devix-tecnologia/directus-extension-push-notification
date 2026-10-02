# 🧩 Task 015 — Protections around main and the npm release: required checks, admins under the rules, release bound to main

- Status: in-progress
- Type: chore
- Assignee: sidartaveloso

## Description

main required a reviewed PR but no status check, admins bypassed everything, the Actions token defaulted to write and could approve PRs, and the npm trusted publisher trusted package_deploy.yml from any ref. Tags v\* and develop had no protection, and secret scanning was off on a public repo.

## Tasks

- [x] `main`: require the `lint`, `typecheck`, `test` and `build` checks, from GitHub Actions only
- [x] `main`: `enforce_admins` on — admins go through the PR and the checks too
- [x] Actions: default `GITHUB_TOKEN` read-only, and workflows cannot approve PRs
- [x] Release: environment `npm` restricted to `main`, used by the release job
- [x] npm: trusted publisher recreated requiring the `npm` environment, old one revoked
- [x] Tags `v*`: ruleset blocking deletion and update
- [x] `develop`: protected against force-push and deletion, without requiring PRs
- [x] Secret scanning, push protection and Dependabot security updates on

## Notes

- State found on 2026-10-02: `main` required one approving review and blocked
  force-push and deletion, with `strict` on, but the list of required checks
  was empty; `enforce_admins` was off with three admins; the Actions token
  defaulted to `write` and `can_approve_pull_request_reviews` was on.
- The npm trusted publisher (task 014) trusts `package_deploy.yml` from any ref,
  and the workflow accepts `workflow_dispatch`: anyone with write access could
  edit it on a branch, dispatch it and publish. An environment bound to `main`
  closes that, because the OIDC token carries the environment and GitHub only
  deploys to it from `main`.
- The environment uses a custom branch policy (`main`), not "protected
  branches": `develop` becomes protected here and must not qualify.
- Applied on 2026-10-02 and read back from the API: required checks
  `lint`, `typecheck`, `test`, `build` (app 15368, GitHub Actions) with
  `strict`; `enforce_admins` on in `main` and `develop`; Actions token
  `read` with `can_approve_pull_request_reviews` off; environment `npm`
  with the custom branch policy `main`; ruleset "Tags de release" (deletion
  and update on `refs/tags/v*`, admin bypass for recovery); secret scanning,
  push protection, vulnerability alerts and Dependabot security updates on.
- The CI ran green on the branch and on `develop` with the read-only token.
- npm: creating the trusted publisher with `--env npm` failed with 409 while
  the first one (task 014) existed, because one token could match both. The old
  one (`c34698e9-ebf3-4a16-ba43-d9a90b8e5268`) was revoked first, then the new
  one was created: `0cbcc303-0249-41c8-91c1-74d7d5c3e9f2`, environment `npm`,
  publish and stage publish. Each step needs the account owner's 2FA.
