# Test rules

Calibrated on this repository's tests (about 300 in `src/`, November 2026). Each rule says what to flag and what is fine, because a rule that flags good tests teaches agents to damage them.

## 1. It can fail

You saw the test fail once: before the fix, or with the feature undone. A test that has never failed may be testing nothing.

## 2. It asserts outcomes

Assert what the user sees or what reaches the API: `toHaveBeenCalledWith(<exact path and body>)` on `apiRequest`, the output line, the parsed `--json` output. Flag an assertion that cannot tell right from wrong.

| Flag                                                                                                     | Fine                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toHaveBeenCalled()` as the only evidence the behaviour happened: nothing checks the arguments or output | `toHaveBeenCalled()` next to the assertion that carries the test's point (`src/commands/auth-token.test.ts:186`, where the point is that nothing was printed)                                       |
|                                                                                                          | `.not.toHaveBeenCalled()`: proves a call did **not** happen (about 30 in this repo, e.g. `attachment delete` without `--confirm` never reaches `apiRequest`, `src/commands/attachment.test.ts:178`) |
| `toBeDefined()` / `toBeTruthy()` as the last word on a value                                             | The same as a guard right before reading the value's fields (`src/commands/update/update-surface.test.ts:22`)                                                                                       |
| `toContain` with a fragment so short that wrong output would match it too                                | `toContain` with the specific text the behaviour prints, the usual way human output is checked here (`src/commands/attachment.test.ts:89`)                                                          |
| `toMatchObject` on a result whose other fields are the behaviour                                         | `toMatchObject({ code: '…' })` on a rejected error (`src/lib/auth.test.ts:169`), where the code is the point                                                                                        |

Judge a test by its point, the behaviour its name describes. A weak assertion beside the ones that carry that point is fine.

## 3. Expected values come from outside the code under test

Write the expected value out as literals (a lookup table or `it.each` rows are fine), or build it from the fixtures in `src/_fixtures/`. Flag an expectation that calls the code under test, or recomputes the answer the way the code does (the same formatter, string building or mapping function).

## 4. Mock only real boundaries

The real boundary here is the Outline API. Command tests mock `apiRequest` (`vi.mock('../lib/api.js', ...)`) and the signed-in account (`mockOutlineAuthModule()` for `src/lib/auth.ts`); `src/lib/api.test.ts` mocks `fetchWithRetry`; the tests in `src/transport/` stub the global `fetch` or `undici`. Also boundaries: the config file (`src/lib/config.ts`), cli-core's keyring store (`@todoist/cli-core/auth`), prompts (`node:readline/promises`), `process.stdin` through `mockStdin()`, the spinner (`src/lib/spinner.ts`), the file and network work of `uploadAttachment` and `downloadAttachment` in `src/lib/attachments.ts`, and the clock (`vi.useFakeTimers`, `src/transport/fetch-with-retry.test.ts:122`).

| Flag                                                                                                      | Fine                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A **new** `vi.mock` of an internal module that holds logic (refs, output, markdown), to make setup easier | The boundaries above. Existing one-offs (`src/commands/attachment.test.ts:11` mocks `resolveDocumentRef` from `src/lib/refs.ts`): tolerated, not a pattern to copy |
| Mocking the function the test is about, or one that computes its expected value                           |                                                                                                                                                                    |

New tests should prefer answering through the `apiRequest` mock over mocking an internal module.

## 5. No skipped or focused tests

None exist today. `.only` fails in CI (`CI=true`, which `npm run verify` sets too). Don't add `.skip`, `.todo` or `xit` to get green. Fine: `it.skipIf` for a platform or permission the test cannot run under, with a comment saying so.

## 6. No fixed sleeps

None exist today. Use fake timers (`vi.useFakeTimers`, `src/transport/fetch-with-retry.test.ts:122`) or wait on the event, as the transport tests do for their local server. Fine: a short real wait that proves something did **not** happen.

## 7. No snapshots

None exist: tests compare parsed JSON output with `toEqual` (`src/commands/attachment.test.ts:114`) and check human output for the lines it should hold. Keep it that way. A new snapshot records whatever the output is the first time it runs, so it proves nothing about what the output should be.

## 8. Reading source files is for contracts

Fine: a test that reads source or config to enforce a rule across the codebase (`.agents/scripts/lib/steps.test.ts` reads the workflows), or inspects the command tree (`src/commands/update/update-surface.test.ts`). Flag a test that reads a source file to check one function's behaviour; call the function instead.

## 9. No real user data

Fixtures use made-up names, emails, URLs and IDs (Ada and Bob in `src/_fixtures/auth.ts`, `example.com`, `user-uuid`). This repository is public.
