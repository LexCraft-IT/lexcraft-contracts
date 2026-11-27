# CLAUDE.md — lexcraft-contracts

Mounted as the submodule `conventions/` in lexcraft-core, lexcraft-web and lexcraft-mcp: every suite
of those repositories reads these files. A change here is a change of the convention or of the
contract, decided by the owners.

## How a change travels

Every change has a class, patch, minor, major or blocked, which `compat/compare.mjs` computes from
the files (README, «Versions»; G-607…G-611).

1. A pull request here: the convention's change (a new case, a changed value). `sources/README.md`
   says what each status means; an owner's decision is quoted in the case's `note`. The CI refuses a
   `version.txt` lower than the change's class; a major raises the major and says what breaks.
2. In lexcraft-core: the submodule moved to that commit, with the code that makes the server, the
   Python API and MERL-T green again, in one pull request. For a patch or a minor that is all: the
   core's pin check accepts a web and an MCP server whose contract is contained in the core's.
3. In lexcraft-web and lexcraft-mcp: the same, each in its own pull request, when it needs the
   change; for a major, before the core's release, which refuses different majors.

`compat/rules.json` is how every version is judged: changing it is the owners' decision, like a
change of the convention.

## Never by hand

- `contract/pins.json` and `contract/frozen_projections.json` are written by the core's
  `scripts/contract/build.mjs` from its sources; `frozen_projections.json` is the copy of a golden
  that is never re-recorded (root rule 23 of the core).
- `contract/anchors.json`: its texts are frozen inputs; its projections and passages are what the
  core's server computes (`contract/README.md` says how to rewrite them).

## Git flow (as in lexcraft-core, `docs/git-workflow.md` there)

- `develop` is where work lands and the default branch; `main` is the released version.
- Branch from `develop` (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`), open a pull request into
  `develop`, merge it with a merge commit titled `merge: <branch> — <what changes>` once CI is green.
- Review is requested, never awaited (`.github/CODEOWNERS`).
- The ruleset refuses pushes to `main` and `develop` and any merge whose CI is not green; the shared
  hook (`.claude/settings.json`) refuses commits on them.
- A release is a pull request `develop → main`, then a tag `vX.Y.Z` on `main` with the number of
  `version.txt`. This repository has its own version (G-597, README «Versions»): the product's
  version is the core's, which pins this repository at one of its tags. The tags up to `v1.70.0`
  are the monorepo's product releases, not versions of the contract (G-608).

## Rules

- **Public repository.** Nothing private enters it: no notes from the owners' workspaces, no
  infrastructure addresses, no personal paths or names, no secrets. `.env` files are never committed
  and Claude does not read them.
- English for code, comments, commits and documentation; the people who develop here are lawyers
  first: say plainly when a change carries an architectural or security risk.
