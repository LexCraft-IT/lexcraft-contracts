# lexcraft-contracts

The convention for legal sources, and the contract the LexCraft repositories share: who a norm or a
decision is and how LexCraft writes it (`sources/`), and the values, texts and paths the core, the
web app and the MCP server each check with their own code instead of reading one another's
(`contract/`).

It is mounted as a git submodule at `conventions/` in LexCraft-IT/lexcraft-core, lexcraft-web and
lexcraft-mcp. Its history comes from the monorepo's `conventions/` folder.

- `sources/README.md`: the golden file and the shared case files.
- `contract/README.md`: the generated pins, the rule-23 anchors, the Python paths.

Licence: MPL-2.0 (`LICENSE`).
