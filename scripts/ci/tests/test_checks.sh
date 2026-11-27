#!/bin/sh
# Tests for the two repository checks, on a throwaway git repository.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
expect() {  # expect <0|1> <description> <command...>
  want="$1"; desc="$2"; shift 2
  if "$@" >/dev/null 2>&1; then got=0; else got=1; fi
  if [ "$got" = "$want" ]; then echo "ok   $desc"; else echo "FAIL $desc (exit $got, wanted $want)"; fail=1; fi
}

expect 0 "develop may open a pull request into main" sh "$here/check_release_source.sh" develop
expect 0 "a hotfix branch may open one" sh "$here/check_release_source.sh" hotfix/login
expect 1 "a feature branch may not" sh "$here/check_release_source.sh" feat/x

repo="$(mktemp -d)"
ver="$(mktemp -d)"
trap 'rm -rf "$repo" "$ver"' EXIT
g() { git -C "$repo" -c user.name=t -c user.email=t@example.invalid "$@"; }
g init -q -b main
g commit -q --allow-empty -m base
g switch -q -c develop
g commit -q --allow-empty -m feature
g switch -q main
g merge -q --no-ff develop -m "merge: develop — release"
check() { (cd "$repo" && sh "$here/check_main_in_develop.sh" main develop); }
expect 0 "a release merge on main does not count" check
g switch -q -c hotfix/x main
g commit -q --allow-empty -m hotfix
g switch -q main
g merge -q --no-ff hotfix/x -m "merge: hotfix/x — fix"
expect 1 "a hotfix missing from develop fails" check
g switch -q develop
g merge -q --no-ff main -m "merge: main — the hotfix back"
expect 0 "after main is merged back, it passes" check

# version.txt against the last tag (check_version.sh), on a throwaway copy of this repository's
# compat/ and the script itself: the class of the files' change sets the least version.
mkdir -p "$ver/scripts/ci" "$ver/contract"
cp -R "$here/../../compat" "$ver/compat"
cp "$here/check_version.sh" "$ver/scripts/ci/"
v() { git -C "$ver" -c user.name=t -c user.email=t@example.invalid "$@"; }
paths() { printf '{ "version": 1, "paths": [%s] }\n' "$1" >"$ver/contract/legal-paths.json"; }
at() { echo "$1" >"$ver/version.txt"; }
version() { sh "$ver/scripts/ci/check_version.sh"; }
v init -q -b develop
paths '"/a", "/b"'; at 1.70.0
v add -A; v commit -q -m base
expect 0 "with no tag yet, any version passes" version
v tag v1.70.0
expect 0 "nothing changed since the tag: the tag's own number passes" version
at 1.71.0
expect 0 "nothing changed: a higher number, raised by hand, passes" version
paths '"/a", "/b", "/c"'; at 1.70.0
expect 1 "a path added needs a minor: the tag's number fails" version
at 1.70.1
expect 1 "a path added needs a minor: a patch fails" version
at 1.71.0
expect 0 "a path added: the next minor passes" version
at 1.72.0
expect 1 "a minor skipped is not a number the change allows" version
at 2.0.0
expect 0 "a path added, marked a major by hand, passes" version
paths '"/a"'; at 1.71.0
expect 1 "a path taken away needs a major: a minor fails" version
at 2.0.0
expect 0 "a path taken away: the next major passes" version
paths '"/a", "/b"'; at 1.70.0
printf '{ "x": { "length": 1, "sha256": "a" } }\n' >"$ver/contract/frozen_projections.json"
v add -A; v commit -q -m "a frozen file"; v tag v1.71.0; at 1.71.0
printf '{ "x": { "length": 1, "sha256": "b" } }\n' >"$ver/contract/frozen_projections.json"
at 2.0.0
expect 1 "a frozen file changed fails, whatever the number" version
exit $fail
