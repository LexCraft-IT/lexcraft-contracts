#!/usr/bin/env node
// The class of a change of the contract, between an older and a newer version of this repository:
// none, patch, minor, major or blocked (README, «Versions»; the rules are compat/rules.json).
//
//   node compat/compare.mjs <older> <newer> [--rules <file>]
//
// Each of <older> and <newer> is a directory holding sources/ and contract/, a checkout or an
// extracted tree. It prints «class: <class>», then one line per finding, the most serious first:
// «<class>\t<file>#<path>\t<what>». Exit 0 when it could compare, 2 when it could not (a missing
// directory, a file that does not read as JSON). The older version is contained in the newer when
// the class is none, patch or minor: that is what the core's pin check accepts (G-607, G-609).
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLASSES = ['none', 'patch', 'minor', 'major', 'blocked'];
const rank = (cls) => CLASSES.indexOf(cls);
export const maxClass = (classes) => classes.reduce((a, b) => (rank(b) > rank(a) ? b : a), 'none');

export const defaultRulesFile = join(dirname(fileURLToPath(import.meta.url)), 'rules.json');
export function loadRules(file = defaultRulesFile) {
  const rules = JSON.parse(readFileSync(file, 'utf8'));
  for (const field of ['compared', 'documentation', 'unsettled', 'promotions', 'atomic', 'ordered', 'frozen', 'thawed']) {
    if (!Array.isArray(rules[field])) throw new Error(`${file}: "${field}" must be a list`);
  }
  if (!rules.keys || typeof rules.keys !== 'object') throw new Error(`${file}: "keys" must be an object`);
  return rules;
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
// Equality that ignores the order of an object's keys (a JSON object has none), not of a list's items.
const canon = (x) =>
  Array.isArray(x) ? `[${x.map(canon).join(',')}]`
    : isObj(x) ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`
      : JSON.stringify(x);
const short = (x) => {
  const s = JSON.stringify(x);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

function statusesIn(x, out = []) {
  if (Array.isArray(x)) x.forEach((e) => statusesIn(e, out));
  else if (isObj(x)) {
    if (typeof x.status === 'string') out.push(x.status);
    Object.values(x).forEach((v) => statusesIn(v, out));
  }
  return out;
}

// rules.json names places as «<file>#/<key>/<key>…», where «*» is any item of a list or any key of
// an object.
function matches(place, file, pattern) {
  const [f, pointer] = place.split('#');
  if (f !== file) return false;
  const want = pointer.split('/');
  const got = pattern.split('/');
  return want.length === got.length && want.every((part, i) => part === '*' || part === got[i]);
}

class Comparison {
  constructor(rules, file) {
    this.rules = rules;
    this.file = file;
    this.findings = [];
  }

  rule(list, pattern) {
    return list.find((place) => matches(place, this.file, pattern));
  }

  add(cls, path, what) {
    this.findings.push({ cls, file: this.file, path: path || '/', what });
  }

  // G-610: a value whose status is still proposed (or open:Qn, the recommendation awaiting an
  // answer) is not settled; decided and current are, and so is a value with no status.
  unsettled(status) {
    return this.rules.unsettled.some((u) => status === u || status.startsWith(`${u}:`));
  }

  // Taking a value away is a minor only when everything it holds was still unsettled.
  removed(value, path) {
    const statuses = statusesIn(value);
    if (statuses.length > 0 && statuses.every((s) => this.unsettled(s))) {
      this.add('minor', path, `removed ${short(value)}, whose every status was unsettled`);
    } else {
      this.add('major', path, `removed ${short(value)}`);
    }
  }

  value(o, n, path, pattern) {
    if (canon(o) === canon(n)) return;
    if (isObj(o) && typeof o.status === 'string' && this.unsettled(o.status)) {
      const now = isObj(n) && n.status === o.status ? '' : ` (now ${short(isObj(n) ? n.status ?? null : n)})`;
      this.add('minor', path, `changed a value whose status was "${o.status}"${now}`);
      return;
    }
    // An input, or a value rules.json calls atomic, is one value: a key added to it changes it.
    if (this.rule(this.rules.atomic, pattern)) {
      this.add('major', path, `changed from ${short(o)} to ${short(n)}`);
      return;
    }
    if (isObj(o) && isObj(n)) return this.object(o, n, path, pattern);
    if (Array.isArray(o) && Array.isArray(n)) return this.list(o, n, path, pattern);
    this.add('major', path, `changed from ${short(o)} to ${short(n)}`);
  }

  // Here the older object's status, if it has one, is settled.
  object(o, n, path, pattern) {
    if (typeof o.status !== 'string') return this.fields(o, n, path, pattern);
    // An object with a status is a statement (an expected value, a case of the scanner): what it
    // states is compared whole, so a field added to it changes it.
    if (n.status !== o.status) {
      const promoted = this.rules.promotions.some((p) => p.from === o.status && p.to === n.status);
      if (promoted) this.add('minor', `${path}/status`, `promoted from "${o.status}" to "${n.status}"`);
      else this.add('major', `${path}/status`, `status changed from "${o.status}" to ${short(n.status ?? null)}`);
    }
    const doc = this.rules.documentation;
    for (const key of new Set([...Object.keys(o), ...Object.keys(n)])) {
      if (key === 'status' || canon(o[key]) === canon(n[key])) continue;
      if (doc.includes(key)) this.add('patch', `${path}/${key}`, 'documentation changed');
      else this.add('major', `${path}/${key}`, `changed a settled statement from ${short(o[key] ?? null)} to ${short(n[key] ?? null)}`);
    }
  }

  fields(o, n, path, pattern) {
    const doc = this.rules.documentation;
    for (const key of Object.keys(o)) {
      const at = `${path}/${key}`;
      if (!(key in n)) {
        if (doc.includes(key)) this.add('patch', at, 'documentation removed');
        else this.removed(o[key], at);
      } else if (doc.includes(key)) {
        if (canon(o[key]) !== canon(n[key])) this.add('patch', at, 'documentation changed');
      } else {
        this.value(o[key], n[key], at, `${pattern}/${key}`);
      }
    }
    for (const key of Object.keys(n)) {
      if (key in o) continue;
      this.add(doc.includes(key) ? 'patch' : 'minor', `${path}/${key}`, doc.includes(key) ? 'documentation added' : `added ${short(n[key])}`);
    }
  }

  // A list is a set of items, each matched by its key: "id" where every item has one, the fields
  // compat/rules.json names for that list, or else the whole item. The order counts only for the
  // lists rules.json calls ordered.
  list(o, n, path, pattern) {
    const place = Object.keys(this.rules.keys).find((p) => matches(p, this.file, pattern));
    const declared = place && this.rules.keys[place];
    const all = [...o, ...n];
    let keyOf;
    let label;
    if (declared) {
      keyOf = (e) => (isObj(e) ? canon(declared.map((f) => e[f] ?? null)) : canon(e));
      label = (e) => (isObj(e) ? declared.map((f) => short(e[f] ?? null)).join(' · ') : short(e));
    } else if (all.length > 0 && all.every((e) => isObj(e) && (typeof e.id === 'string' || typeof e.id === 'number'))) {
      keyOf = (e) => canon(e.id);
      label = (e) => String(e.id);
    }
    const index = (items) => {
      const map = new Map();
      for (const e of items) {
        const k = keyOf(e);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(e);
      }
      return map;
    };
    let om;
    let nm;
    if (keyOf) {
      om = index(o);
      nm = index(n);
      // A key that repeats cannot match items one to one: compare the whole items instead.
      if ([...om.values(), ...nm.values()].some((items) => items.length > 1)) keyOf = undefined;
    }
    if (!keyOf) {
      keyOf = canon;
      label = short;
      om = index(o);
      nm = index(n);
    }
    const itemPattern = `${pattern}/*`;
    for (const [k, olds] of om) {
      const news = nm.get(k) ?? [];
      const at = `${path}[${label(olds[0])}]`;
      if (news.length === 0) {
        olds.forEach((e) => this.removed(e, at));
      } else if (keyOf === canon) {
        for (let i = news.length; i < olds.length; i += 1) this.removed(olds[i], at);
        for (let i = olds.length; i < news.length; i += 1) this.add('minor', at, 'added another copy');
      } else {
        this.value(olds[0], news[0], at, itemPattern);
      }
    }
    for (const [k, news] of nm) {
      if (om.has(k)) continue;
      news.forEach((e) => this.add('minor', `${path}[${label(e)}]`, `added ${short(e)}`));
    }
    const common = (items, other) => items.map(keyOf).filter((k) => other.has(k));
    const orderO = [...new Set(common(o, nm))];
    const orderN = [...new Set(common(n, om))];
    if (canon(orderO) !== canon(orderN)) {
      if (this.rule(this.rules.ordered, pattern)) this.add('major', path, 'reordered (the order counts)');
      else this.add('patch', path, 'reordered');
    }
  }
}

function jsonFiles(root, rules) {
  const files = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.json')) files.set(relative(root, path).split(sep).join('/'), path);
    }
  };
  for (const dir of rules.compared) {
    if (existsSync(join(root, dir))) walk(join(root, dir));
  }
  return files;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path} does not read as JSON: ${error.message}`);
  }
}

// The findings and the class of the change from <older> to <newer>.
export function compareTrees(older, newer, rules = loadRules()) {
  for (const root of [older, newer]) {
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
  }
  const before = jsonFiles(older, rules);
  const after = jsonFiles(newer, rules);
  const findings = [];
  for (const [file, path] of before) {
    const c = new Comparison(rules, file);
    if (!after.has(file)) c.add('major', '/', 'file removed');
    else c.value(readJson(path), readJson(after.get(file)), '', '');
    // Rule 23 of the core: a frozen file only grows. Anything else waits for the owners, who thaw
    // the file in rules.json for that one change.
    if (rules.frozen.includes(file) && !rules.thawed.includes(file)) {
      for (const f of c.findings) {
        if (f.cls === 'major') {
          f.cls = 'blocked';
          f.what += ' (frozen: rule 23 of the core)';
        }
      }
    }
    findings.push(...c.findings);
  }
  for (const [file, path] of after) {
    if (!before.has(file)) {
      readJson(path);
      findings.push({ cls: 'minor', file, path: '/', what: 'file added' });
    }
  }
  findings.sort((a, b) => rank(b.cls) - rank(a.cls) || a.file.localeCompare(b.file) || a.path.localeCompare(b.path));
  return { cls: maxClass(findings.map((f) => f.cls)), findings };
}

export const format = ({ cls, findings }) =>
  [`class: ${cls}`, ...findings.map((f) => `${f.cls}\t${f.file}#${f.path}\t${f.what}`)].join('\n');

function main(argv) {
  const args = [...argv];
  let rulesFile = defaultRulesFile;
  const at = args.indexOf('--rules');
  if (at !== -1) {
    rulesFile = args[at + 1];
    args.splice(at, 2);
  }
  if (args.length !== 2 || !rulesFile) {
    console.error('usage: node compat/compare.mjs <older> <newer> [--rules <file>]');
    return 2;
  }
  try {
    console.log(format(compareTrees(args[0], args[1], loadRules(rulesFile))));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 2;
  }
}

// Run as a command, also through a link (on macOS a temporary folder is under /var, a link to
// /private/var): compare real paths, not the spelling node was given.
const invoked = process.argv[1] && existsSync(process.argv[1])
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  process.exitCode = main(process.argv.slice(2));
}
