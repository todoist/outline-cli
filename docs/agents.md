# Working with coding agents

This repository is set up so coding agents prove their work before they call it done. This page explains the parts, what each one guarantees, and where it stops. It grows as each part lands.

## Layers

1. **Git hooks** run for everyone, people and agents alike, on every commit and push.

## Rules and what holds them

| Rule                                         | Held by                                                                          | Certainty                                |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| No commits on `main`                         | `pre-commit` and `commit-msg` → `.agents/scripts/branch-guard.sh`                | Enforced locally; `--no-verify` skips it |
| No pushes to `main`                          | `pre-push` → `branch-guard.sh`; the "Protect default branch" and "main" rulesets | Enforced on GitHub                       |
| Committed files are linted and formatted     | `pre-commit` (lefthook, staged files only); CI                                   | Checked in CI                            |
| Type check passes before a commit            | `pre-commit`; CI                                                                 | Checked in CI                            |
| Tests pass before a push                     | `pre-push`; CI                                                                   | Checked in CI                            |
| Agent tooling never ships in the npm package | `.agents/scripts/package-contents.test.ts`                                       | Checked in CI                            |

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

## Where the tooling lives

- `.agents/scripts/` holds scripts and their tests. It is not under `scripts/` because `scripts/` ships in the npm package.
- The tooling runs straight from TypeScript with Node's type stripping, so it only uses erasable syntax (`.agents/scripts/tsconfig.json` enforces this). `npm run type-check` covers it with that config, since the root `tsconfig.json` covers only `src/`, and `npm run lint:check` lints it.
- Tests run in `npm test` and CI. They copy the tools into throwaway git repositories and never touch your checkout. A test helper clears the variables git exports to hooks, since `npm test` itself runs inside `pre-push`.

## Releases

semantic-release publishes from `main` on every merge, and a pre-release from `next`. The squash-merged PR title decides whether anything ships: `feat:`, `fix:`, `perf:` and any breaking change (`!`) release; `chore:`, `ci:`, `docs:`, `test:` and `refactor:` do not. Changes to the agent tooling use `chore:` or `ci:`, so they never publish a new version. No path filter is needed.

## What fails open

- No node on `PATH` in a GUI client: the hooks skip lint, the type check and the tests, with a message. The branch rule still applies.
- `git commit --no-verify`: every local hook is skipped. CI and the rulesets still apply.
- Worktrees share the hooks in `.git/hooks`, so the branch rule works in a new worktree at once. Lint, format, types and tests need `npm ci` in that worktree first. Without the lefthook binary anywhere the hooks look, they print "Can't find lefthook in PATH" and let the commit through.
