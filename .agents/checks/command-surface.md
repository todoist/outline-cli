# Check: command surface

What people and agents see: command names and aliases, flag names, help text, human output, `--json` and `--ndjson` shapes, error codes, and `SKILL_CONTENT`. Scripts and installed agent skills depend on every one.

## Report

- A renamed or removed command, alias, flag or `--json` field, or a changed error code, without a breaking-change PR title (`feat!:`, `fix!:`).
- A command or flag change not reflected in `SKILL_CONTENT` (`src/lib/skills/content.ts`), `skills/outline-cli/SKILL.md` and the `## Commands` list in `README.md`, or an example there that no longer runs.
- Human output that puts the id before the name, or carries meaning only by colour or symbols, with no `--accessible` alternative.
- Results printed to stderr or diagnostics to stdout; a spinner, prompt or hint on stdout in `--json` or `--ndjson` mode.
- A flag named differently from the same flag elsewhere (`--json`, `--ndjson`, `--full`, `--limit`, `--offset`, `--collection`, `--doc`, `--confirm`, `--force`), or a new verb where `list`, `get`, `create`, `update` or `delete` fits.
- An error message that does not name the problem, or hints without a working command.

## Fine

- New optional flags and new `--json` fields (additive) in a `feat:` PR.
- Help text wording fixes.
