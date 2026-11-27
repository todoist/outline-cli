---
name: build-feature
description: Builds a new command, flag or behaviour in thin test-first slices, after settling the open decisions with the owner. Use when asked to "add", "build", "implement", "support" or "create" something, such as a new command, subcommand or flag.
---

# Build a feature

## 1. Read the closest existing feature

Find the command most like the one you are building and read it with its test: `src/commands/collection.ts` for list, get, create, update and delete on one kind of thing, `src/commands/attachment.ts` (with `src/commands/attachment.test.ts`) for a newer command that reads files and throws `CliError`, `src/commands/search.ts` for a paged list. For a new command or subcommand, `add-command` is the checklist of every file to touch. Read the rules in `AGENTS.md`. Done when you can name the file you will copy patterns from.

## 2. Settle decisions in one round

List what the request leaves open: command, alias and flag names (the verbs `list`, `get`, `create`, `update` and `delete`, and the flags other commands use), positional argument or named flag, the human and `--json` output and its essential keys, error codes, whether it needs `--confirm`, which Outline API endpoints it calls. Ask the owner all of them at once, each with your recommendation. Don't ask what the code can answer. Done when every decision has an answer.

## 3. Write "done" as checkable behaviours

Write each behaviour as a command and the expected result, for example: "`ol collection create --name Docs --json` calls `apiRequest('collections.create', { name: 'Docs' })` and prints the collection's essential fields as JSON". Each becomes a test. Done when a test could pass or fail on every one.

## 4. Build in thin slices, test first

For each behaviour: write its test at the public interface (`program.parseAsync(['node', 'ol', ...])`), see it fail, make it pass, run its test file. Follow `write-tests`. Done when every behaviour from step 3 has a passing test you saw fail.

## 5. Update everything the change touches

| You changed                            | Also update                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A command, subcommand or flag          | `SKILL_CONTENT` in `src/lib/skills/content.ts`, then `npm run sync:skill`; the `## Commands` list in `README.md`   |
| Called a new Outline API endpoint      | Its spinner text in `API_SPINNER_CONFIG` (`src/lib/api.ts`): blue reads, green creates, yellow updates and deletes |
| A create or update                     | `--json` through `outputItem(result, formatter, essentialKeys, { json: true })`                                    |
| A list                                 | `outputList` with essential keys, `--json`, `--ndjson` and `--full`, and `--limit` and `--offset` when it pages    |
| Output that uses colour or symbols     | An `--accessible` alternative (`isAccessible()` from `src/lib/global-args.ts`); the name first and the id after    |
| A new error code                       | The `ErrorCode` type in `src/lib/errors.ts`                                                                        |
| Structure (new command file or helper) | `CODEBASE.md`, by the "Keeping CODEBASE.md accurate" rules in `AGENTS.md`                                          |

Done when each row that applies is handled.

## 6. Verify and report

Follow `verify`. If the feature needs restructuring first, do that as a separate change with `refactor`.
