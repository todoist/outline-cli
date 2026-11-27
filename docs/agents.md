# Working with coding agents

This repository is set up so coding agents prove their work before they call it done. This page explains the parts, what each one guarantees, and where it stops. It grows as each part lands.

## Layers

1. **Git hooks** run for everyone, people and agents alike, on every commit and push.
2. **`npm run verify`** runs every CI check locally and records a pass.
3. **`AGENTS.md`** tells agents what done means. Claude Code reads it through `CLAUDE.md`; Codex and other agents read it directly.
4. **Skills** in `.agents/skills/` give step-by-step procedures for recurring work. They load only when a task needs them.
5. **Review**: fresh reviewers and Doistbot check a finished change against the checks in `.agents/checks/`.
6. **The push check** stops an agent's `git push` or `gh pr create` until `npm run verify` has passed on exactly what it pushes.

## Rules and what holds them

| Rule                                                                                                    | Held by                                                                          | Certainty                                |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| No commits on `main`                                                                                    | `pre-commit` and `commit-msg` → `.agents/scripts/branch-guard.sh`                | Enforced locally; `--no-verify` skips it |
| No pushes to `main`                                                                                     | `pre-push` → `branch-guard.sh`; the "Protect default branch" and "main" rulesets | Enforced on GitHub                       |
| Committed files are linted and formatted                                                                | `pre-commit` (lefthook, staged files only); CI                                   | Checked in CI                            |
| Type check passes before a commit                                                                       | `pre-commit`; CI                                                                 | Checked in CI                            |
| Tests pass before a push                                                                                | `pre-push`; CI                                                                   | Checked in CI                            |
| Agent tooling never ships in the npm package                                                            | `.agents/scripts/package-contents.test.ts`                                       | Checked in CI                            |
| `npm run verify` runs what CI runs                                                                      | `.agents/scripts/lib/steps.test.ts` compares it with the pull-request workflows  | Checked in CI                            |
| Verify skips only files no local check reads                                                            | `.agents/scripts/lib/tree.test.ts` runs oxfmt on each one                        | Checked in CI                            |
| Run `npm run verify` before calling work done                                                           | `AGENTS.md`                                                                      | Asked                                    |
| An agent pushes only code `npm run verify` passed                                                       | The push check, `.agents/scripts/guard.ts`                                       | Enforced on an agent's push              |
| Never weaken a check to pass it                                                                         | `AGENTS.md`                                                                      | Asked                                    |
| Instructions name only files, links and scripts that exist                                              | `.agents/scripts/instructions.test.ts`                                           | Checked in CI                            |
| Every skill says when to use it and is linked for Claude Code                                           | `.agents/scripts/instructions.test.ts`                                           | Checked in CI                            |
| Use the matching skill for each task                                                                    | `AGENTS.md`                                                                      | Asked                                    |
| Tests meet the quality bar                                                                              | `.agents/skills/write-tests/references/test-rules.md`                            | Asked                                    |
| Review checks say what to report and what is fine, and AGENTS.md links them                             | `.agents/scripts/instructions.test.ts`                                           | Checked in CI                            |
| A finished change gets a task review, a blast-radius review when shared code changed, and a code review | `review-changes` skill                                                           | Asked                                    |
| Reviewers never edit the shared checkout                                                                | the reviewer brief; `npm run review:worktree` gives them their own               | Asked                                    |

"Checked in CI" means every pull request runs it and shows the result. A local hook alone is a speed bump: `git commit --no-verify` skips it.

**Gap:** the rulesets on `main` require a pull request but no passing status checks, so today a red check doesn't block a merge by itself and whoever merges has to look. Making the `Lint` and `Test` jobs required status checks on the `main` ruleset would turn "checked in CI" into "enforced in CI".

## Git hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs the hooks, configured in `lefthook.yml`. `npm install` installs them into `.git/hooks` through the `prepare` script (`lefthook install --reset-hooks-path`) on every install, so a hook added to `lefthook.yml` reaches existing clones. Lefthook's own `postinstall` runs only when lefthook itself is installed, npm warns it will soon need approval, and lefthook refuses to install or sync hooks while `core.hooksPath` is set locally; the reset removes that setting.

- **`pre-commit`** refuses a commit on `main`, then lints and formats the staged files (re-staging what the tools fix) and runs the type check. Unstaged changes in a partly staged file are left alone.
- **`commit-msg`** refuses a commit on `main` again. Lefthook runs no pre-commit job when nothing is staged, so without it an empty commit would get past.
- **`pre-push`** refuses a push to `main`, then runs the tests. It checks `git push --dry-run` too.
- If node is not on `PATH` (some GUI git clients), both hooks still apply the branch rule, skip the checks, and say so. CI runs the same checks.
- The default branch is read from `origin/HEAD`, falling back to `main`. Pushes to `next`, the pre-release branch, are allowed: syncing it with `main` is a direct push (see `CONTRIBUTING.md`).

The release workflow commits and pushes to `main` from GitHub Actions, and `npm ci` runs `prepare` there, which installs the hooks. The release step sets `LEFTHOOK=0`, so semantic-release's commit and push run no hooks, as before: every check already ran on the pull request. The guard also skips itself when `GITHUB_ACTIONS=true`, in case another workflow commits with the hooks on. That is the one exemption. The rulesets on GitHub are the real enforcement; the hooks only catch mistakes early.

## `npm run verify`

One command, every check the pull-request workflows run (`lint.yml`, `test.yml`, `check-skill-sync.yml`): lint, format, both type checks, the build, all tests and the skill sync check. It takes a few seconds, so it always checks the whole tree.

- **Before the checks** it stops if Node is older than `package.json` requires, or if `node_modules` does not match the lockfile, transitive dependencies included (npm's own record of what it installed, `node_modules/.package-lock.json`, against `package-lock.json`). Both make checks fail, or pass, for reasons unrelated to your change.
- **What counts as a change:** `npm run format:check` reads Markdown, JSON and YAML as well as code, so almost every file is something a local check reads. Only two files aren't: `CHANGELOG.md` (docs, which `.oxfmtrc.json` leaves out and the release writes) and `.nvmrc` (which only CI's Node setup reads). When nothing else changed since the branch left `main`, verify says there is nothing to check, or that CI is the only check for `.nvmrc`. Deleting or renaming `CHANGELOG.md` counts as code, since the agent docs name it and a test checks every file they name. `.agents/scripts/lib/tree.test.ts` runs oxfmt over a badly formatted copy of each of these and fails if oxfmt would read it.
- **Order:** lint, format and both type checks start together with the build. The tests wait for the build, as in `test.yml`, since `.agents/scripts/package-contents.test.ts` packs `dist/`; the skill sync check imports from `dist/`, so it runs once the build has passed.
- **`CI=true`** is set for the build, the tests and the skill sync check, as GitHub Actions sets it. Variables that change what the CLI does (`OL_ACCESSIBLE`, `OL_SPINNER`, `OUTLINE_API_TOKEN`, `OUTLINE_URL`, `OUTLINE_OAUTH_CLIENT_ID`, `OUTLINE_OAUTH_CALLBACK_PORT`, `FORCE_COLOR`) are removed, with a note, since CI never sets them. A real token never reaches the tests.
- **Output:** one line per step. A failing step prints the last 30 lines of its log and the log's path under `.tmp/agents/logs/`.
- **The record:** after a full pass it writes a content hash of every file local checks read (not `CHANGELOG.md`, not `.nvmrc`) to `.tmp/agents/verified.json`. A run that fails, or sees files change while it runs, deletes it. The push check reads it.
- **Platforms:** macOS, Linux and WSL. Like the git hooks, it assumes a POSIX shell and runs npm's POSIX launchers in `node_modules/.bin`; on native Windows, run it in WSL.
- **What it cannot see:** a real Outline instance, output in a real terminal, CI's Node version from `.nvmrc` when yours differs, and the pull request title check. It prints these after every pass.

If a pull-request workflow gains a step, `.agents/scripts/lib/steps.test.ts` fails until verify gains it too, or says why it can't.

## The push check

Every agent's hooks call one script, `.agents/scripts/guard.ts`, so the agents can't drift apart. Before each shell command an agent runs, it stops one that pushes code `npm run verify` hasn't passed, or opens a pull request for it. That's where a person starts reviewing, so that's where the proof has to exist. It costs nothing until a command pushes: the hook command only starts Node when the shell command itself mentions a push or a new pull request, and the guard only runs git when it reads one.

- **What it checks:** what's pushed has to be exactly a tree verify passed, `CHANGELOG.md` and `.nvmrc` aside. A push sends commits, not the working tree, so verifying with uncommitted changes and then pushing only some of them doesn't get through. When the working tree holds more than the last commit, it says to commit or stash the rest before verifying.
- **A commit and a push in one command:** for `git add -A && git commit -m "…" && git push`, it checks the working tree that's about to be committed.
- **What needs no verify:** a branch whose changes since `main` are all ones verify records nothing for (edits to `CHANGELOG.md`, `.nvmrc`), or whose code is back to what `main` has; a dry run; a push that only deletes; and `git push --tags`, which pushes tags alone. A README or other Markdown change does need verify, since the format check reads it. A tag named in the command, such as `git push origin v1.0`, is checked like a branch. A branch with no history in common with `main` always needs verify, since verify checks the whole tree there and records a pass.
- **What it reads:** `git push`, with `-C` or after a `cd` or `pushd`, and `gh pr create` (or `gh pr new`, with `-R` and `--head`), anywhere in a command, after `env`, `command`, `builtin`, `exec`, `nohup`, `time`, `timeout` or `sudo`, and inside `eval`, `sh -c` (or another shell's `-c`) and `env -S`, but not inside quotes or a here-document, such as a commit message. It stops a push it can't tell the contents of: every branch at once (`--all`, `--mirror`, `:` or a wildcard), one with no refspec when git's settings for the remote it goes to pick what it sends (`remote.<name>.push` or `.mirror`, or `push.default=matching`, set in the config or with `git -c`), one run through `xargs`, a branch named by a shell variable or one that doesn't exist, and a push after a command in the same line that changes what's checked out (`git switch`, `git checkout`, `git reset <commit>`, `git rebase`, `git pull`, `git merge`, `gh pr checkout` and the like). A branch the same line makes from what's checked out (`git switch -c`, `git checkout -b`, `git branch <name>`) counts as what's checked out.
- **Which pushes:** pushes from the checkout `guard.ts` lives in, and from any other worktree of this repository that has the guard, however the command gets there (the agent works in it, `cd`, or `git -C`), each checked against that worktree's own verify record. A worktree on a branch without the guard is left alone, as is a push from another repository, and a push you run in your own terminal never passes through it.

When it stops a command, the reason tells the agent to run verify and try again. When you want something pushed that can't pass yet, push it yourself.

| Agent       | Wiring                                                                                                                | Known limits                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `.claude/settings.json`: `PreToolUse` on `Bash`                                                                       | `hook-wiring.test.ts` runs the exact command. Accept the workspace trust prompt.                                                                                                                                                                                                                                                                                           |
| Codex       | `.codex/hooks.json`: `PreToolUse` on `Bash`                                                                           | Runs only in a trusted project (`codex --trust`), after each person reviews the hook in `/hooks`; a change to `hooks.json` needs a new review. In a linked worktree, Codex (0.171) trusts and runs the hooks of the main checkout, not the worktree's. The hook command finds the worktree from its folder, so a worktree is guarded once the main checkout has this hook. |
| Cursor      | Runs the Claude Code hooks itself; the command falls back to the git root if Cursor does not set `CLAUDE_PROJECT_DIR` | No Cursor hooks file: a second one would run every hook twice. A test keeps it out. Not yet tried here.                                                                                                                                                                                                                                                                    |

**Limits.** The push check catches an agent's honest mistakes. It isn't a security boundary, and CI is still what checks a pull request (which here doesn't block a merge on its own; see the rules table).

- **Pushes it can't see:** a push from a script, a git alias, a `gh` extension such as `gh stack`, GitHub's API or a GitHub MCP tool goes through unchecked, as does a command `eval` or a shell builds from variables. CI still checks them.
- **One record per checkout:** verify records the last tree it passed. To push a stack, verify and push each branch in turn; a push of several branches at once, or of a branch that isn't checked out, is stopped unless its changes need no verify.
- **A commit and a push in one command:** the check sees the working tree as it is before the command runs. A step before the commit that changes the tree, such as `git stash pop`, or a commit that takes only part of it, can let code through that verify didn't see.
- **Two sessions in one checkout** share its record. Use a worktree per session.

**Fails open, visibly:** a broken guard, bad input, or a push from a folder it can't name lets the command run and says why in a message. A checkout without the script, such as an older branch, is skipped without a word, since the hook runs before every shell command. If node isn't on `PATH`, the hook command fails and the agent carries on. `DISABLE_AGENT_GUARD=1` in the agent's environment turns the check off; in Claude Code, a gitignored settings.local.json in `.claude/` can set it for one checkout with `{ "env": { "DISABLE_AGENT_GUARD": "1" } }`.

## Skills

Each skill is a short procedure with a check at the end of every step. Agents load one when the task matches its description.

| Skill            | For                                    | Ends with                                                                                     |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `verify`         | Any change about to be called done     | `npm run verify`, proof matched to the change, an evidence report                             |
| `fix-bug`        | Something broken                       | A test that failed on the symptom, the root cause, undo/restore                               |
| `build-feature`  | A new command, flag or behaviour       | Decisions settled up front, test-first slices, a "touches X" map                              |
| `add-command`    | A new command or subcommand            | Every file a command touches: registration, spinner text, output, errors, tests, skill text   |
| `refactor`       | Structure changes, behaviour unchanged | Pinned tests, no changed test inputs or assertions                                            |
| `write-tests`    | Writing or changing tests              | Tests that failed once, meeting the test rules                                                |
| `learn`          | A correction from you                  | A type, lint rule, test or script check that catches the mistake                              |
| `review-changes` | A change you say is ready              | Task, blast-radius and code reviews; each finding fixed, dismissed with evidence or left open |

The evidence report rates each claim: **said**, **cited** (a line), **traced** (followed the code), **ran** (a test or command executed it), **seen** (in the running CLI). "Fixed" or "safe" needs **ran**. Anything less is listed under "Not verified".

The test rules were measured against this repository's tests first, so they accept the patterns that are fine here: `.not.toHaveBeenCalled()` for confirmation gates, `toBeDefined()` as a guard, `toContain` on the line a command prints, `toMatchObject` on an error's code, and the `apiRequest` mock every command test uses. There are no snapshot tests, and the rules keep it that way.

## Review

When you say a change is ready, the agent runs `review-changes`:

- **Task review:** a fresh subagent gets your request in your words, what done means and the decisions made, never the author's reasoning. It looks for what is missing or unrequested. Doistbot can't do this, since it never sees the task.
- **Blast-radius review:** only when shared code changed (`src/lib/`, `src/transport/`, registration and the `--user` selector in `src/index.ts`, the cli-core version, dependencies, build config). It names the one fact that makes the change safe and proves it by running code.
- **Code review:** Doistbot locally (`doistbot review --json`, or `--base <branch below>` in a stack) when version 1.0.12+ is installed and `doistbot doctor` passes. Otherwise one subagent per check in `.agents/checks/`. Doistbot reads `AGENTS.md` and its links, so the checks apply to its pull request reviews too.

Findings are fixed, dismissed with evidence (a line or a test run, never an argument), or left open for you. Reviewers that need to run code get their own worktree from `npm run review:worktree -- <dir>`; the shared one stays read-only.

The checks cover tests, architecture, security, privacy, the command surface and evidence. The command surface check holds what people and agents rely on: command, alias, flag and `--json` names, `SKILL_CONTENT`, and human output with the name before the id that reads in `--accessible` mode. The security check follows the token: where it is stored, and that it only ever goes to the account's Outline instance.

A review costs several agent runs, so it runs when you ask, not on every change. A Doistbot run with a failed provider (`providerFailures`) is partial; the agent should say so.

## How to ask an agent

Give it:

- **the goal**, in a sentence;
- **a done check** that can pass or fail ("`ol doc list --collection Docs --json` returns only that collection's documents");
- **the proof you want** (a failing test first, a real `node dist/index.js` run signed in to a test account);
- **facts you know** and **real constraints** (a deadline, a flag that must not change).

Leave out the method and your theory of the cause. For a vague report, ask the agent to restate it first. Start a new session for unrelated work.

| To start…  | Say                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| a bug fix  | "Fix: <symptom>. Command: <ol …>. Expected: <x>." (`fix-bug`)                                                      |
| a feature  | "Add <behaviour>. Done when <check>." (`build-feature`)                                                            |
| a refactor | "Refactor <area> so <what gets easier>." (`refactor`)                                                              |
| a review   | "Ready for a PR." (`review-changes`)                                                                               |
| a release  | "Ready to release." Check the PR title type: `feat:`, `fix:`, `perf:` and breaking changes publish; others do not. |

Your part: answer the decision questions, and read the evidence report, especially "Not verified".

## Where the tooling lives

- `.agents/scripts/` holds scripts and their tests, next to the skills and review checks. It is not under `scripts/` because `scripts/` ships in the npm package.
- Skills live in `.agents/skills/`, where Codex reads them. Claude Code reads them through the symlinks in `.claude/skills/`; a test keeps the two in step.
- The tooling runs straight from TypeScript with Node's type stripping, so it only uses erasable syntax (`.agents/scripts/tsconfig.json` enforces this). `npm run type-check` covers it with that config, since the root `tsconfig.json` covers only `src/`, and `npm run lint:check` lints it.
- Tests run in `npm test` and CI. They copy the tools into throwaway git repositories and never touch your checkout. A test helper clears the variables git exports to hooks, since `npm test` itself runs inside `pre-push`.

## Releases

semantic-release publishes from `main` on every merge, and a pre-release from `next`. The squash-merged PR title decides whether anything ships: `feat:`, `fix:`, `perf:` and any breaking change (`!`) release; `chore:`, `ci:`, `docs:`, `test:` and `refactor:` do not. Changes to the agent tooling use `chore:` or `ci:`, so they never publish a new version. No path filter is needed.

## What fails open

- No node on `PATH` in a GUI client: the hooks skip lint, the type check and the tests, with a message. The branch rule still applies.
- `git commit --no-verify`: every local hook is skipped. CI and the rulesets still apply.
- The push check: any error lets the command run, with a message saying why. `DISABLE_AGENT_GUARD=1` turns it off.
- Worktrees share the hooks in `.git/hooks`, so the branch rule works in a new worktree at once. Lint, format, types and tests need `npm ci` in that worktree first. Without the lefthook binary anywhere the hooks look, they print "Can't find lefthook in PATH" and let the commit through.
