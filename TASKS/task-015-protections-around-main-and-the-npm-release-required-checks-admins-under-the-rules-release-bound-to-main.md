# 🧩 Task 015 — Protections around main and the npm release: required checks, admins under the rules, release bound to main

- Status: pending
- Type: chore
- Assignee: sidartaveloso

## Description

main required a reviewed PR but no status check, admins bypassed everything, the Actions token defaulted to write and could approve PRs, and the npm trusted publisher trusted package_deploy.yml from any ref. Tags v\* and develop had no protection, and secret scanning was off on a public repo.

## Tasks

- [ ] `main`: require the `lint`, `typecheck`, `test` and `build` checks, from GitHub Actions only
- [ ] `main`: `enforce_admins` on — admins go through the PR and the checks too
- [ ] Actions: default `GITHUB_TOKEN` read-only, and workflows cannot approve PRs
- [ ] Release: environment `npm` restricted to `main`, used by the release job
- [ ] npm: trusted publisher recreated requiring the `npm` environment, old one revoked
- [ ] Tags `v*`: ruleset blocking deletion and update
- [ ] `develop`: protected against force-push and deletion, without requiring PRs
- [ ] Secret scanning, push protection and Dependabot security updates on

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
