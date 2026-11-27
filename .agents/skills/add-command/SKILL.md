---
name: add-command
description: Checklist of every file to touch when adding a command or subcommand to outline-cli. Use when wrapping a new Outline API endpoint, adding a subcommand to an existing command group, or adding a new top-level command.
---

# Add a command or subcommand

Follow this checklist when adding commands. Each step names the file to change. `build-feature` covers settling the design and building it test-first; this is the list of places a command touches.

## 1. The command (`src/commands/<group>.ts`)

Each command group is one file exporting `registerXxxCommand(program: Command)`, which creates the parent command and chains its subcommands with Commander's API and async action handlers (`src/commands/collection.ts` is the plainest example).

- A subcommand of an existing group: add a `.command('<verb> <arg>')` chain to that group's file.
- A new group: a new file, with a short alias where it reads naturally (`document` has `doc`, `collection` has `col`, `attachment` has `attach`).
- Use the verbs other groups use: `list`, `get`, `create`, `update`, `delete`, and `open`, `move`, `archive` where they fit.
- Every `.description()` is a one-line purpose: agents read it to pick a subcommand. A group with several subcommands gets `.addHelpText('after', ...)` with two or three example invocations, as `src/commands/account.ts` does.

## 2. Registration (`src/index.ts`)

A new group needs its `registerXxxCommand(program)` call in `src/index.ts`, next to the others. The root `--user` selector reads the registered command names, so nothing else is needed there.

## 3. API calls (`src/lib/api.ts`)

Call Outline through `apiRequest<T>(path, body)`; never `fetch` directly. It adds the token, refreshes it when needed and shows a spinner. Add each new endpoint to `API_SPINNER_CONFIG` with its text and colour:

- `blue`: reads (`*.list`, `*.info`, `*.search`)
- `green`: creates
- `yellow`: updates, moves, archives and deletes

## 4. References (`src/lib/refs.ts`)

Take documents and collections by ID, URL, slug or name, and resolve them with `resolveDocumentRef` / `resolveDocumentId` or `resolveCollectionRef` / `resolveCollectionId`. A new kind of thing people name by title gets its own resolver there, built on the shared `resolveRef`.

## 5. Output (`src/lib/output.ts`)

- An `essentialKeys` list and a human formatter for each kind of record: name first, then the id dimmed (`chalk.dim`), then details.
- Lists: `outputList(items, formatter, essentialKeys, getOutputOptions(opts), pagination, emptyMessage)`, with `--json`, `--ndjson` and `--full`. A paged endpoint takes `--limit <n>` and `--offset <n>`; `outputList` prints the "more results" hint.
- Single records: `outputItem(item, formatter, essentialKeys, getOutputOptions(opts))`, with `--json` and `--full`.
- Creates and updates print a short confirmation (`Created: <name>` with the id), or the record under `--json`.
- Results go to stdout and diagnostics to stderr. Colour or symbols that carry meaning need an `--accessible` alternative (`isAccessible()` from `src/lib/global-args.ts`).

## 6. Errors (`src/lib/errors.ts`)

Throw `CliError(code, message, hints)` for anything the user can fix, and add a new code to the `ErrorCode` type. The message names the exact problem; the hints give a working command or the valid values. Check flags and input before any API call.

- A delete takes `--confirm`, and without it throws `CONFIRMATION_REQUIRED` before calling the API (see the `delete` subcommand in `src/commands/attachment.ts`).
- Flags that can't be used together throw `CONFLICTING_OPTIONS`.
- Never prompt or wait for input: take everything from arguments, flags or `--stdin` (read with `readStdin()` from `@todoist/cli-core`).

## 7. Tests (next to the command)

A new group gets `src/commands/<group>.test.ts`; a subcommand goes in its group's test file, or in `src/commands/commands.test.ts` where the group's tests live. Mock `apiRequest` and the signed-in account, build the program with `createTestProgram`, and run `program.parseAsync(['node', 'ol', ...])`. The `write-tests` skill has the helpers and the quality bar.

Always test:

- the API call, with its exact path and body (`toHaveBeenCalledWith`);
- the human output, and the `--json` output parsed and compared with `toEqual`;
- that a delete without `--confirm`, or a bad flag, fails with its error code and never calls the API.

## 8. Skill content (`src/lib/skills/content.ts`)

Add the command to `SKILL_CONTENT`: its section under `## Commands`, the Quick Reference for a new top-level command, and an example if it adds a workflow. Add it to the `## Commands` list in `README.md` too.

## 9. Sync the skill file

```bash
npm run sync:skill
```

It builds the project and regenerates `skills/outline-cli/SKILL.md`. Commit the result; CI (`npm run check:skill-sync`) fails if it is out of sync.

## 10. Verify

```bash
npm run verify
```

Then follow the `verify` skill to prove the command does what was asked.
