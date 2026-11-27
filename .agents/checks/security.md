# Check: security

The CLI holds the user's Outline token (OAuth or an API token) and runs on their machine. Apply to changes in `src/` and `scripts/`.

## Report

- A token, `Authorization` header or `OUTLINE_API_TOKEN` value written to output, logs, errors or `--json`, other than by `ol auth token view`, whose job is to print it.
- A secret fetched that the command does not display. An opt-in reveal flag must gate the API call, not just the printing.
- Token storage that bypasses the keyring-backed store in `src/lib/auth-provider.ts`, or a token written to the config file other than as the plaintext fallback for when the keyring is unavailable.
- A token sent anywhere but the account's Outline instance. Requests to other hosts (attachment storage, redirects) go out without the `Authorization` header, as `src/lib/api.ts` does for anything not on the instance.
- A shell command built from user or API input as a string, instead of `spawn`/`execFile` with an argument list; a URL opened in the browser that isn't on the account's Outline instance.
- A download written outside the path the user chose, or over an existing file without `--force`.
- Login changes (`src/lib/auth-provider.ts`, `src/commands/auth.ts`) that step outside cli-core's OAuth flow, or store a token before it has been checked against the instance.
- `src/postinstall.ts` doing more than refreshing installed skills and removing old skill folders: it runs on every install.

## Fine

- Logging command names, durations, counts and error codes.
- Test fixtures with fake tokens.
