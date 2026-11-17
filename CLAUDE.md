# CLAUDE.md

## Project Overview

jira-cli is a read-only CLI for a self-hosted Jira Server / Data Center instance.
The base URL comes from the `JIRA_URL` env var. Auth uses a Personal Access Token
(PAT) via Bearer (works with 2FA; basic/session auth doesn't).

## Configuration & Authentication

- **`JIRA_URL`** — Jira base URL, e.g. `https://jira.example.com`
- **`JIRA_TOKEN`** — Personal Access Token (Bearer)
- **Token storage:** a secret manager (e.g. 1Password) — `op://<vault>/<item>/credential`
- **Recommended — export once per shell session** (kept in memory, never plaintext
  on disk). In `~/.zshrc`:
  ```bash
  export JIRA_URL=https://jira.example.com
  export JIRA_TOKEN=$(op read "op://<vault>/<item>/credential")
  ```
  Then just run `jira issue view PROJ-123`. Requires `op` signed in (Touch ID).
- **Fallback — inline per call** (CI, foreign shell, or when the PAT must not
  persist in the env):
  `JIRA_TOKEN=$(op read "op://<vault>/<item>/credential") jira issue view PROJ-123`
- **Avoid** hardcoding the PAT as a plaintext constant in a dotfile — it's a
  long-lived secret. Use `op read` so it stays in the secret manager.
- **API:** Jira REST API v2 (`/rest/api/2/`) + Agile API (`/rest/agile/1.0/`) for boards/sprints

## Stack

- **Runtime:** Bun
- **Language:** TypeScript (strict, noEmit — Bun runs TS directly)
- **CLI framework:** citty (arg parsing, subcommands)
- **Colors:** ansis
- **Spinner:** yocto-spinner (writes to stderr)
- **HTML→MD:** turndown

## Project Structure

```
src/
  cli.ts                  # entry point — wires subcommands + back-compat aliases
  commands/
    issue.ts              # `jira issue` parent (view, list)
    issue-view.ts         # `jira issue view <KEY...>`
    issue-list.ts         # `jira issue list` (JQL builder from flags)
    sprint.ts             # `jira sprint list [ID]`
    board.ts              # `jira board list`
    project.ts            # `jira project list`
    me.ts                 # `jira me`
    open.ts               # `jira open [KEY]`
  lib/
    jira-client.ts        # API client: fetch issue/search/boards/sprints/myself/projects, download
    formatter.ts          # HTML→MD conversion (turndown + image rewriting)
    ui.ts                 # semantic colors + spinner (stderr only)
    output.ts             # pretty/plain/json dispatch + table renderers
  types.ts                # shared types
```

## Command API

Modeled on the most popular Jira CLI (`ankitpokhrel/jira-cli`): nested
subcommands, short flags, `--plain`/`--raw` output modes. Read-only.

```bash
jira issue view <KEY...>   # --comments <n> --plain --raw --save --dir <p>
jira issue list            # -p -a -s -t -y -l -r -q --created --updated
                           # --order-by --reverse --mine --plain --raw --max <n>
jira sprint list [ID]      # -p --board-id --current --board --backlog --column
                           # --state --plain --raw --max
jira board list            # -p --plain --raw
jira project list          # --plain --raw
jira me                    # --raw
jira open [KEY]            # open project/issue in browser
jira show / jira list      # deprecated aliases for `issue view` / `issue list`
```

Examples:

```bash
jira issue view PROJ-123                 # pretty
jira issue view PROJ-123 --raw           # JSON (AI-agent friendly)
jira issue view PROJ-123 --save          # download attachments + description.md
jira issue view PROJ-123 PROJ-124        # multiple keys
jira issue list -p PROJ --mine
jira issue list -p PROJ -s '~Done' -t Bug # negate status with ~ (quote it for the shell!)
jira sprint list -p PROJ --current
jira sprint list --board-id 42 --current --column 'To Do'  # one board column of the active sprint
jira project list
```

Output modes: default pretty (colors), `--plain` (ANSI stripped), `--raw` /
`--json` (JSON; `--json` is an alias for `--raw`).

### Development

```bash
bun install                  # install dependencies
bun link                     # make `jira` available globally
bun run build                # compile standalone binary → ./jira
```

- **Always use `jira` command** (via `bun link`), never `bun run src/cli.ts`

## Git Conventions

- **Commit messages:** one-liner only, no body, no Co-Authored-By attribution

## Design Decisions

- **API modeled on `ankitpokhrel/jira-cli`** — nested subcommands + short flags.
  Goal is familiarity, not feature-parity: extras (`--save`, `--mine`, `--backlog`,
  multi-key view) are kept as extensions; `epic`/`release` are intentionally omitted.
- **Read-only.** No create/edit/move/assign/comment commands.
- **Output modes:** pretty (default) / `--plain` (ANSI stripped) / `--raw` (JSON).
  `--json` stays as an alias for `--raw`.
- **stderr for all progress** (spinners, status messages) — stdout is always clean data
- **`--save` is opt-in** — by default nothing is written to disk, just stdout
- **Multiple ticket keys in one call** — returns JSON array when multiple
- **Board selection** — `--board-id` wins over `--project`; `--project` alone means the
  project's first board (a project can have several).
- **`--column`** — a board column is a set of statuses (board configuration). The name is
  matched case-insensitively (exact, else unique substring) and turned into a
  `status in (<ids>)` JQL clause on the agile issue endpoints. Needs a board, so with a
  numeric sprint id it requires `--board-id` or `--project`.
- **`issue view` exit code** — 1 if any key failed (fetched issues are still printed).
  Set via `process.exitCode`, not `process.exit()`, so piped stdout is flushed.
- **List JSON is an envelope** — `{ total, count, issues }` for `issue list` and the
  issue views of `sprint list`; `count < total` means the result was cut off by `--max`.
- **`issue view` fields** — besides summary/status/description/attachments/comments it
  returns type, priority, resolution, reporter, dates, labels, components, versions,
  `epic` (key), `parent`, `subtasks`, `links` and `sprints`. Sprint and Epic Link are
  custom fields whose ids differ per instance; they are located via `expand=schema`
  (custom type `gh-sprint` / `gh-epic-link`), never by hardcoded id.
- **Back-compat:** `jira show` / `jira list` remain as deprecated aliases
