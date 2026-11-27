# Check: privacy and secrets

This repository is public, and the npm package ships `dist/`, `scripts/` and `CHANGELOG.md`.

## Report

- A secret, API key, token or password, even an expired one.
- Real user data in fixtures, tests or docs: real names, emails, document text, Outline IDs or URLs copied from a real instance.
- Personal identifiers in docs and examples: real emails, usernames, home-directory paths, local repository names. Use placeholders (`alice@example.com`, `~/code`).
- Internal details: private hostnames, a company's Outline address, staging servers, internal tools or documents.
- A new file under `scripts/` or in package.json `files` that should not be published.
- Untracked files the change doesn't need (`.env`, logs, `.tmp/`).

## Fine

- Made-up fixtures (Ada and Bob in `src/_fixtures/auth.ts`, `example.com`, `wiki.example.com`) and cli-core's fictional test accounts.
- Public URLs: getoutline.com, Outline's public API documentation, GitHub.
