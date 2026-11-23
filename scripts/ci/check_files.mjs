// Every file of the convention and the contract reads as JSON, and golden.json's case ids are unique
// across the file (sources/README.md). The suites of the core, the web and the MCP server check the
// values; this checks that they can be read at all.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.json')) files.push(path);
  }
};
walk(join(root, 'sources'));
walk(join(root, 'contract'));

let bad = 0;
const parsed = new Map();
for (const file of files) {
  try {
    parsed.set(file, JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    console.error(`${relative(root, file)}: ${error.message}`);
    bad += 1;
  }
}
const golden = parsed.get(join(root, 'sources', 'golden.json'));
if (!golden) {
  console.error('sources/golden.json is missing or unreadable');
  bad += 1;
} else {
  const seen = new Set();
  for (const [section, cases] of Object.entries(golden)) {
    if (!Array.isArray(cases)) continue;
    for (const entry of cases) {
      if (!entry || typeof entry !== 'object' || !('id' in entry)) continue;
      if (seen.has(entry.id)) {
        console.error(`sources/golden.json: the id ${entry.id} appears twice (${section})`);
        bad += 1;
      }
      seen.add(entry.id);
    }
  }
}
if (bad) process.exit(1);
console.log(`${files.length} files read; golden.json's ids are unique`);
