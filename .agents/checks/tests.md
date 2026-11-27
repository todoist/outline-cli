# Check: tests

Apply to every change that touches code or tests. The quality bar is `.agents/skills/write-tests/references/test-rules.md`.

## Report

- A test deleted, skipped (`.skip`, `.todo`, `xit`), or with an assertion loosened (`toEqual` → `toMatchObject`, exact arguments → `toHaveBeenCalled()`, an exact string → a shorter `toContain`), without a behaviour change that explains it.
- A new snapshot test. The repository has none: tests assert parsed JSON and the lines a command prints.
- New behaviour with no test, or a test that would still pass with the change undone.
- A command, flag or `--json` change with no test that runs the command through `program.parseAsync`.
- A new `vi.mock` of an internal module that holds logic, or a mock of the function under test.
- An expected value computed by the code under test.
- Config that runs fewer tests: `vitest.config.ts` `include`, the scripts in `package.json`, the steps in `.github/workflows/test.yml`.

## Fine

- `.not.toHaveBeenCalled()`, guards like `toBeDefined()` before reading a value, `toContain` on the line a command prints, `toMatchObject` on an error's code, and the `apiRequest` mock every command test uses, as the test rules describe.
- A test changing its assertions because the behaviour changed on purpose, when the description says so.
- A refactor changing import paths, names or call sites in tests.
