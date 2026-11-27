# lexcraft-contracts

The convention for legal sources, and the contract the LexCraft repositories share: who a norm or a
decision is and how LexCraft writes it (`sources/`), and the values, texts and paths the core, the
web app and the MCP server each check with their own code instead of reading one another's
(`contract/`).

It is mounted as a git submodule at `conventions/` in LexCraft-IT/lexcraft-core, lexcraft-web and
lexcraft-mcp. Its history comes from the monorepo's `conventions/` folder.

- `sources/README.md`: the golden file and the shared case files.
- `contract/README.md`: the generated pins, the rule-23 anchors, the Python paths.
- `compat/`: how a change of those files is classified (below).

Licence: MPL-2.0 (`LICENSE`).

## Versions

The number in `version.txt` and in the tags `vX.Y.Z` is this repository's own (G-597). What it
promises: a repository tested against an older version of the same major still agrees with one
tested against a newer version, on everything the older version holds (G-607).

**The tags up to `v1.70.0` are not versions of the contract.** They come from the monorepo and name
the contract as it stood at that release of the product; the extraction moved some of them onto the
nearest commit that touched `conventions/` (`v1.8.0` to `v1.9.2` are one commit). The contract's own
numbering continues from there: the first release is `v1.71.0` if it adds, `v2.0.0` if it breaks
(G-608).

### The classes (G-610)

A change from one version to the next is the most serious of its parts.

| Class | When | Examples |
| --- | --- | --- |
| patch | nothing any suite checks changes: a `note` or an `about`, a list that is a set put in another order, this README, the scripts and the CI | a note quoting the owners' decision |
| minor | the older version is contained in the newer: something is added (a path, a case, a file, a key, an act type, a seat, a code, a text in `anchors.json`); a status goes from `current` to `decided` with its value unchanged; a value whose status is still `proposed` or `open:Qn` is corrected or decided, or a case whose every status is one of those is taken away | `/search_corte_cost_massime` in `contract/legal-paths.json` |
| major | something settled changes or goes away: a value whose status is `decided` or `current`, or any value with no status (a path, a pinned value, an input, a key); a settled status that moves, other than `current` → `decided`; a file removed | a code's sigla in a decided citation; a norm's key; a path taken away; the password rule |
| blocked | a frozen file changes other than by growing: `contract/frozen_projections.json` and `contract/anchors.json`, the core's rule 23, whose every change moves stored highlights and notes | a passage of an article moved |

What that means in practice:

- An object with a `status` is a statement: an expected value (`{ "value": …, "status": … }`) or a
  case of the scanner. Its content is compared whole, so a key added inside a decided value changes
  it. A case's `input`, and the places `compat/rules.json` calls atomic, are compared whole too.
- A list is a set: its items are matched by `id`, or by the keys `compat/rules.json` names for that
  list, or else whole. A renamed path is a path taken away and another added: a major. It can be
  split instead: add the new one in a minor, and take the old one away in a later major.
- A change of an identity that stores carry (a norm's or a decision's key) is a major **and** a data
  migration of the core: decided by the owners, with its plan.
- A blocked change is decided by both owners. Its pull request quotes their decision and lists the
  file under `thawed` in `compat/rules.json`, which counts its change as a major; the release that
  carries it takes the file back out.

### How the class is computed

`compat/compare.mjs` compares two versions file by file, with the rules of `compat/rules.json`:

```sh
node compat/compare.mjs <older> <newer>     # «class: <class>», then one line per finding
```

It runs in two places, so that no number is taken on trust (G-609):

- **here, on every pull request** (`scripts/ci/check_version.sh`, job «Contract files»): the change
  since the last tag has a class, and `version.txt` must be at least that tag raised by it. It may be
  raised further by hand: an author who knows that an addition changes behaviour marks a major,
  with `BREAKING CHANGE` in the pull request. Nobody can make it lower than what the files show;
- **in lexcraft-core, on every pull request** (`scripts/ci/check_pins.sh`): a web or an MCP server
  pinned at an older version of the contract than the core's passes only with the same major in
  `version.txt` and a comparison, from its version to the core's, that comes out none, patch or
  minor. The core's own copy of `compat/` judges.

`compat/rules.json` is the rule every version is judged by: changing it is decided by both owners.

### What each class asks of the repositories

- **patch**: nothing. Whoever moves the submodule next takes it.
- **minor**: the core alone, when it uses the change: it moves `conventions` in the pull request
  that uses it. The web and the MCP server move when they need the change; until then the core's
  pin check accepts them, as their contract is contained in the core's. A repository that is behind
  must tolerate what it does not know yet (an act type, a court, a code from the core): shown as it
  is, or refused with a clear message, never dropped in silence.
- **major**: all together. The pull request here raises the major in `version.txt`, says what breaks
  and what each repository must do, and carries `BREAKING CHANGE`. Then the web and the MCP server
  move to it and release; then the core's release moves its three pins. The core's pin check refuses
  different majors.

### Releasing

`version.txt` on `develop` names the version the next release takes, as the CI accepts it. A
release is a pull request `develop → main`, then the tag `vX.Y.Z` on `main` with the number of
`version.txt`, cut by whoever cuts the core's release, as one of «the components first» of the core's
`docs/git-workflow.md`. No bot moves the submodules in the other repositories (G-611): each moves
its own when it needs to.
