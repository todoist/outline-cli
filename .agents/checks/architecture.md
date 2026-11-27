# Check: architecture

Rules lint and types can't express. Most are written in `AGENTS.md` and `CODEBASE.md`; report where a change works around one.

## Report

- A user-facing error thrown as a bare `Error`, or printed with `formatError(...)` and `process.exit(1)` (which ignores `--json`), instead of throwing `CliError(code, message, hints?)` from `src/lib/errors.ts`; or a new code missing from the `ErrorCode` type.
- An Outline API call made with `fetch` instead of `apiRequest` from `src/lib/api.ts`, or a new endpoint missing from `API_SPINNER_CONFIG` there.
- A document or collection reference parsed by hand instead of resolved through `src/lib/refs.ts`, or output printed by hand instead of through `outputItem` / `outputList` in `src/lib/output.ts`.
- A command that prompts or waits for terminal input instead of taking arguments, flags or `--stdin`.
- A delete without `--confirm`, or one that calls the API before checking it.
- A new command group whose `registerXxxCommand` isn't called in `src/index.ts`.
- A helper that duplicates one in `src/lib/`, `src/transport/` or `@todoist/cli-core`. Where cli-core has a convention, the CLI follows it.

## Fine

- An exception documented next to the code, with the reason.
- A new broadly reusable helper in `src/lib/`, added to the `CODEBASE.md` catalogue.
- The interactive prompts `ol auth login` and `ol auth token` already have when no token or URL is given.
- Older commands that print `formatError(...)` and exit, in a change that doesn't touch them.
