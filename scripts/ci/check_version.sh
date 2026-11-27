#!/bin/sh
# version.txt against the last release tag (README, «Versions»; G-608, G-609, G-610). The files'
# change since that tag has a class (compat/compare.mjs): version.txt must be at least the tag raised
# by that class, and may be raised further by hand (an author who knows an addition breaks marks a
# major), never less. A blocked change fails until the owners thaw the file in compat/rules.json.
#
#   check_version.sh      # in a checkout with its tags (CI: fetch-depth 0)
set -eu
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

version="$(tr -d ' \r\n' < version.txt)"
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "version.txt must read X.Y.Z, not '$version'" >&2; exit 1; }

last="$(git tag --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true)"
if [ -z "$last" ]; then
  echo "no release tag yet: version.txt $version will be the first"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
paths="$(git ls-tree --name-only "$last" | grep -E '^(sources|contract)$' || true)"
# The paths are the two fixed folder names, one per line: word splitting is what we want.
# shellcheck disable=SC2086
[ -z "$paths" ] || git archive "$last" -- $paths | tar -x -C "$tmp"

out="$(node compat/compare.mjs "$tmp" "$root")"
class="$(printf '%s\n' "$out" | sed -n 's/^class: //p')"
[ -n "$class" ] || { printf '%s\n' "$out" >&2; echo "compat/compare.mjs gave no class" >&2; exit 1; }

# shellcheck disable=SC2046
set -- $(echo "${last#v}" | tr '.' ' ')
x="$1"; y="$2"; z="$3"
bump() {
  case "$1" in
    none) echo "$x.$y.$z" ;;
    patch) echo "$x.$y.$((z + 1))" ;;
    minor) echo "$x.$((y + 1)).0" ;;
    major) echo "$((x + 1)).0.0" ;;
  esac
}

if [ "$class" = blocked ]; then
  printf '%s\n' "$out" | grep -E '^blocked' >&2
  echo "a frozen file changed since $last (rule 23 of the core): only the owners thaw it, in compat/rules.json" >&2
  exit 1
fi

allowed=""
seen=0
for c in none patch minor major; do
  [ "$c" = "$class" ] && seen=1
  [ "$seen" = 1 ] && allowed="$allowed $(bump "$c")"
done
for v in $allowed; do
  if [ "$v" = "$version" ]; then
    if [ "$v" = "$(bump "$class")" ]; then
      echo "since $last the files are a $class change; version.txt $version"
    else
      echo "since $last the files are a $class change; version.txt $version raises it by hand, which is allowed"
    fi
    exit 0
  fi
done
printf '%s\n' "$out" | sed -n '2,11p' >&2
echo "since $last the files are a $class change: version.txt says $version, and it must be one of:$allowed" >&2
exit 1
