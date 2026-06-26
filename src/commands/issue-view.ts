import { defineCommand } from "citty";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { fetchIssue, downloadAttachment } from "../lib/jira-client.js";
import { formatIssue } from "../lib/formatter.js";
import { spin, succeed, fail } from "../lib/ui.js";
import { outputTickets, modeFrom } from "../lib/output.js";
import type { JiraTicket } from "../types.js";

export default defineCommand({
  meta: {
    name: "view",
    description: "View issue(s) in the terminal",
  },
  args: {
    keys: {
      type: "positional",
      description: "Issue key(s), e.g. PROJ-123",
      required: true,
    },
    comments: {
      type: "string",
      description: "Show only the N most recent comments (default: all)",
    },
    save: {
      type: "boolean",
      description: "Download attachments and save description.md to ./tickets/<KEY>/",
      default: false,
    },
    dir: {
      type: "string",
      description: "Base directory for --save (default: ./tickets). Supports ~, relative, and absolute paths.",
    },
    plain: {
      type: "boolean",
      description: "Plain text output (no colors)",
      default: false,
    },
    raw: {
      type: "boolean",
      description: "JSON output",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Alias for --raw",
      default: false,
    },
  },
  async run({ args }) {
    const positionals = (args._ as string[] | undefined) ?? [];
    const fromNamed = args.keys
      ? Array.isArray(args.keys)
        ? (args.keys as string[])
        : [args.keys as string]
      : [];
    const keys = [...new Set([...fromNamed, ...positionals])];

    const limit = args.comments ? parseInt(args.comments, 10) : undefined;
    const tickets: JiraTicket[] = [];

    for (const key of keys) {
      spin(`Fetching ${key}...`);

      try {
        const raw = await fetchIssue(key);
        const ticket = formatIssue(raw);

        if (limit !== undefined && ticket.comments.length > limit) {
          ticket.comments = ticket.comments.slice(-limit);
        }

        if (args.save) {
          const base = args.dir
            ? resolve(args.dir.replace(/^~(?=$|\/|\\)/, homedir()))
            : "tickets";
          const destDir = join(base, key);
          await mkdir(destDir, { recursive: true });

          let md = `# ${ticket.key}: ${ticket.summary}\n\n${ticket.description}\n`;
          if (ticket.comments.length > 0) {
            md += `\n## Comments\n\n`;
            for (const comment of ticket.comments) {
              const date = new Date(comment.created).toLocaleString("de-CH");
              md += `### ${comment.author} — ${date}\n\n${comment.body}\n\n`;
            }
          }
          await writeFile(join(destDir, "description.md"), md, "utf-8");

          for (const att of ticket.attachments) {
            try {
              const localPath = await downloadAttachment(
                { filename: att.filename, mimeType: att.mimeType, size: att.size, content: att.url },
                destDir
              );
              att.path = localPath;
            } catch (e) {
              fail(`Failed to download ${att.filename}: ${e}`);
            }
          }

          succeed(`Saved ${key} to ${destDir}/`);
        } else {
          succeed(`Fetched ${key}`);
        }

        tickets.push(ticket);
      } catch (e) {
        fail(`${key}: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (tickets.length > 0) {
      outputTickets(tickets, modeFrom(args));
    }
  },
});
