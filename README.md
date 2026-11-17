# jira-cli

Read-only CLI for a self-hosted Jira Server / Data Center. The command structure
follows [`ankitpokhrel/jira-cli`](https://github.com/ankitpokhrel/jira-cli):
nested subcommands, short flags, and `--plain`/`--raw` output.

## Why

It's read-only, so there are no create, edit or delete commands and it's safe to
give to an agent. Every command can print JSON with `--raw`. That makes it useful
for agentic workflows: a coding agent runs `jira issue view PROJ-123 --raw` and
reads the ticket itself instead of you pasting the description into the prompt. It
can also pull comments and attachments with `--save`.

## Configuration

Set two environment variables:

- `JIRA_URL`: your Jira base URL, for example `https://jira.example.com`
- `JIRA_TOKEN`: a Personal Access Token (Bearer auth; works with 2FA, basic auth
  does not)

Keep the token in a secret manager such as 1Password and export both once per
shell session. Add this to `~/.zshrc`:

```bash
export JIRA_URL=https://jira.example.com
export JIRA_TOKEN=$(op read "op://<vault>/<item>/credential")
```

Then run `jira issue view PROJ-123`. For one-off use in CI or another shell, set
the token inline:
`JIRA_TOKEN=$(op read "op://<vault>/<item>/credential") jira issue view PROJ-123`.
Don't hardcode the token as plaintext in a dotfile; keep it in the secret manager.

## Commands

```bash
jira issue view <KEY...>   # --comments <n> --plain --raw --save --dir <p>
jira issue list            # -p -a -s -t -y -l -r -q --created --updated --order-by --reverse --mine --max
jira sprint list [ID]      # -p --board-id --current --board --backlog --column --state --max
jira board list            # -p
jira project list
jira me
jira open [KEY]
jira show / jira list      # deprecated aliases for issue view / issue list
```

`sprint list` uses the first board of `--project` unless you pass `--board-id`
(the `rapidView=<id>` in the board URL). `--column <name>` keeps only the issues
in that board column, for example the to-do column of the active sprint:

```bash
jira sprint list --board-id 42 --current --column 'To Do'
```

Output is pretty by default. `--plain` drops the colors, `--raw` (or `--json`)
prints JSON.

JSON shapes:

- `issue view` prints one issue object (an array for several keys) with `key`,
  `url`, `summary`, `type`, `status`, `resolution`, `priority`, `assignee`,
  `reporter`, `created`, `updated`, `resolved`, `due`, `labels`, `components`,
  `fixVersions`, `affectsVersions`, `epic`, `parent`, `subtasks`, `links`,
  `sprints`, `description`, `attachments` and `comments`.
- `issue list` and the issue views of `sprint list` print
  `{ "total": <matches on the server>, "count": <returned>, "issues": [...] }`.
  If `count` is smaller than `total`, the list was cut off by `--max`.

`issue view` exits with status 1 if any of the keys could not be fetched; the
issues that were fetched are still printed.

## Development

```bash
bun install        # dependencies
bun link           # make jira available globally (runs src/cli.ts directly)
bun run build      # compile a standalone binary to ./jira
```
