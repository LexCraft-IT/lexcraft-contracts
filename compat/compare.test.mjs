// compat/compare.mjs: the class of each kind of change (README, «Versions»), on throwaway trees, and
// the rules held to this repository's own files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTrees, format, loadRules } from './compare.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = loadRules();
const made = [];
test.after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'compat-'));
  made.push(root);
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
  return root;
}
const classOf = (older, newer, r = rules) => compareTrees(tree(older), tree(newer), r).cls;

const paths = (list) => ({ 'contract/legal-paths.json': { version: 1, note: 'n', paths: list } });
const norm = (citation, status, extra = {}) => ({
  'sources/golden.json': {
    version: 1,
    norms: [{ id: 'cc-2043', note: 'n', labels: { citation: { value: citation, status } }, ...extra }],
  },
});

test('the same files: none', () => {
  assert.equal(classOf(paths(['/a', '/b']), paths(['/a', '/b'])), 'none');
});

test('a note, an about or a set reordered: patch', () => {
  assert.equal(classOf(paths(['/a']), { 'contract/legal-paths.json': { version: 1, note: 'other', paths: ['/a'] } }), 'patch');
  assert.equal(classOf({ 'sources/golden.json': { about: 'x', norms: [] } }, { 'sources/golden.json': { about: 'y', norms: [] } }), 'patch');
  assert.equal(classOf(paths(['/a', '/b']), paths(['/b', '/a'])), 'patch');
});

test('a path added is a minor, a path taken away a major', () => {
  assert.equal(classOf(paths(['/a']), paths(['/a', '/search_corte_cost_massime'])), 'minor');
  assert.equal(classOf(paths(['/a', '/b']), paths(['/a'])), 'major');
  assert.equal(classOf(paths(['/a']), paths(['/b'])), 'major', 'a rename is a removal and an addition');
});

test('a case, a key or a file added is a minor; a file removed is a major', () => {
  const one = norm('art. 2043 c.c.', 'decided');
  const two = { 'sources/golden.json': { version: 1, norms: [...one['sources/golden.json'].norms, { id: 'cc-2044', labels: {} }] } };
  assert.equal(classOf(one, two), 'minor');
  assert.equal(classOf({ 'contract/pins.json': { a: 1 } }, { 'contract/pins.json': { a: 1, b: 2 } }), 'minor');
  assert.equal(classOf(paths(['/a']), { ...paths(['/a']), 'sources/tar-seats.json': { seats: [] } }), 'minor');
  assert.equal(classOf({ ...paths(['/a']), 'sources/tar-seats.json': { seats: [] } }, paths(['/a'])), 'major');
});

test('a settled value changed is a major: decided, current, or a value with no status', () => {
  assert.equal(classOf(norm('d.lgs. 104/2010 all. 1', 'decided'), norm('c.p.a.', 'decided')), 'major');
  assert.equal(classOf(norm('art. 2043 c.c.', 'current'), norm('art. 2043 cod. civ.', 'current')), 'major');
  assert.equal(classOf({ 'contract/pins.json': { max_articles_per_request: 50 } }, { 'contract/pins.json': { max_articles_per_request: 60 } }), 'major');
  assert.equal(classOf({ 'contract/pins.json': { version: 1 } }, { 'contract/pins.json': { version: 2 } }), 'major');
});

test('G-610: a value still proposed, or open on a question, may be corrected in a minor', () => {
  assert.equal(classOf(norm('art. 2043 c.c.', 'proposed'), norm('art. 2043 cod. civ.', 'proposed')), 'minor');
  assert.equal(classOf(norm('art. 2043 c.c.', 'open:Q3'), norm('art. 2043 cod. civ.', 'open:Q3')), 'minor');
  assert.equal(classOf(norm('art. 2043 c.c.', 'proposed'), norm('art. 2043 cod. civ.', 'decided')), 'minor', 'corrected and decided at once');
});

test('statuses: current to decided unchanged is a promotion; anything else settled moving is a major', () => {
  assert.equal(classOf(norm('art. 2043 c.c.', 'current'), norm('art. 2043 c.c.', 'decided')), 'minor');
  assert.equal(classOf(norm('art. 2043 c.c.', 'current'), norm('art. 2043 cod. civ.', 'decided')), 'major');
  assert.equal(classOf(norm('art. 2043 c.c.', 'decided'), norm('art. 2043 c.c.', 'proposed')), 'major');
  assert.equal(classOf(norm('art. 2043 c.c.', 'decided'), norm('art. 2043 c.c.', 'current')), 'major');
});

test('a statement is compared whole: a label added to a case is a minor, a field added to a settled value a major', () => {
  const withShort = norm('art. 2043 c.c.', 'decided');
  withShort['sources/golden.json'].norms[0].labels.short = { value: 'art. 2043', status: 'decided' };
  assert.equal(classOf(norm('art. 2043 c.c.', 'decided'), withShort), 'minor');
  const decision = (value) => ({ 'sources/golden.json': { decisions: [{ id: 'd', labels: { citation: { value, status: 'decided' } } }] } });
  assert.equal(classOf(decision({ corte: 'cassazione' }), decision({ corte: 'cassazione', sezione: 'U' })), 'major');
  const scan = (spans, within) => ({ 'sources/golden.json': { decision_citations_in_text: { cases: [{ text: 't', ...within, spans, status: 'decided' }] } } });
  assert.equal(classOf(scan([], {}), scan([{ start: 0 }], {})), 'major', 'a span added to a decided case changes it');
});

test('an input is one value: a field added to it changes the case', () => {
  const input = (extra) => ({ 'sources/golden.json': { norms: [{ id: 'l-296-2006-1', input: { tipo_atto: 'legge', ...extra }, labels: {} }] } });
  assert.equal(classOf(input({}), input({ parte: '701-800' })), 'major');
});

test('a case removed is a minor only when every status in it was unsettled', () => {
  const none = { 'sources/golden.json': { version: 1, norms: [] } };
  assert.equal(classOf(norm('art. 2043 c.c.', 'proposed'), none), 'minor');
  assert.equal(classOf(norm('art. 2043 c.c.', 'decided'), none), 'major');
  assert.equal(classOf({ 'contract/pins.json': { a: 1 } }, { 'contract/pins.json': {} }), 'major', 'no status at all is settled');
});

test('a list with keys in rules.json is matched by them, so a case changes instead of vanishing', () => {
  const cites = (value, status) => ({
    'sources/golden.json': { decision_citations: { note: 'n', today: '2026-10-05', cases: [
      { input: 'Cass. n. 1/2020', reference: { value, status } },
      { input: 'Cass. n. 2/2020', reference: { value: null, status: 'decided' } },
    ] } },
  });
  const { cls, findings } = compareTrees(tree(cites({ numero: 1 }, 'proposed')), tree(cites({ numero: 1, anno: 2020 }, 'proposed')), rules);
  assert.equal(cls, 'minor');
  assert.match(findings[0].path, /cases\["Cass\. n\. 1\/2020"\]\/reference$/);
  assert.equal(classOf(cites({ numero: 1 }, 'decided'), cites({ numero: 1, anno: 2020 }, 'decided')), 'major');
});

test('rule 23: a frozen file may only grow; a thawed one changes as a major', () => {
  const frozen = (sha) => ({ 'contract/frozen_projections.json': { a: { length: 1, sha256: sha } } });
  assert.equal(classOf(frozen('x'), { 'contract/frozen_projections.json': { a: { length: 1, sha256: 'x' }, b: { length: 2, sha256: 'y' } } }), 'minor');
  assert.equal(classOf(frozen('x'), frozen('z')), 'blocked');
  assert.equal(classOf(frozen('x'), {}), 'blocked');
  assert.equal(classOf(frozen('x'), frozen('z'), { ...rules, thawed: ['contract/frozen_projections.json'] }), 'major');
  const anchors = (start) => ({ 'contract/anchors.json': { version: 1, articles: [{ id: 'cc-1453', raw: 't', passages: [{ quote: 'q', start, text: 'q' }] }] } });
  assert.equal(classOf(anchors(10), anchors(11)), 'blocked');
});

test('the output names the class first, then the findings, the most serious first', () => {
  const out = format(compareTrees(tree(paths(['/a', '/b'])), tree(paths(['/a', '/c'])), rules));
  const lines = out.split('\n');
  assert.equal(lines[0], 'class: major');
  assert.match(lines[1], /^major\tcontract\/legal-paths\.json#\/paths\["\/b"\]\tremoved "\/b"$/);
  assert.match(lines[2], /^minor\t/);
});

test('a file that does not read as JSON stops the comparison', () => {
  assert.throws(() => compareTrees(tree({ 'contract/pins.json': '{' }), tree({ 'contract/pins.json': '{}' }), rules), /does not read as JSON/);
});

// The rules against this repository's own files: each keyed list exists, and its keys are unique.
test('every key rules.json names is a list of this repository whose keys are unique', () => {
  for (const [where, fields] of Object.entries(rules.keys)) {
    const [file, pointer] = where.split('#');
    const data = JSON.parse(readFileSync(join(repo, file), 'utf8'));
    let lists = [data];
    for (const part of pointer.split('/').slice(1)) {
      lists = lists.flatMap((x) => (part === '*' ? x : [x[part]]));
    }
    for (const list of lists) {
      assert.ok(Array.isArray(list), `${where} is not a list`);
      const keys = list.map((e) => JSON.stringify(fields.map((f) => e[f] ?? null)));
      assert.equal(new Set(keys).size, keys.length, `${where}: a key repeats`);
    }
  }
  for (const file of [...rules.frozen, ...rules.thawed]) assert.ok(readFileSync(join(repo, file)), `${file} is not a file`);
});

test('this repository against itself is none; with one more path it is a minor', () => {
  assert.equal(compareTrees(repo, repo, rules).cls, 'none');
  const copy = mkdtempSync(join(tmpdir(), 'compat-'));
  made.push(copy);
  for (const dir of rules.compared) cpSync(join(repo, dir), join(copy, dir), { recursive: true });
  const file = join(copy, 'contract', 'legal-paths.json');
  const list = JSON.parse(readFileSync(file, 'utf8'));
  list.paths.push('/a_path_no_one_routes_yet');
  writeFileSync(file, JSON.stringify(list, null, 2));
  assert.equal(compareTrees(repo, copy, rules).cls, 'minor');
  assert.equal(compareTrees(copy, repo, rules).cls, 'major', 'the other way round, it is a removal');
});
