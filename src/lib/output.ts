import ansis from "ansis";
import type { JiraTicket, JiraListItem, JiraIssueRef } from "../types.js";
import { JIRA_URL } from "./jira-client.js";
import { bold, dim, highlight, info, link, success } from "./ui.js";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-CH");
}

function issueUrl(key: string): string {
  return `${JIRA_URL}/browse/${key}`;
}

function prettyRef(ref: JiraIssueRef): string {
  return `${link(highlight(ref.key), issueUrl(ref.key))}  ${ref.summary}  ${dim(`${ref.type}, ${ref.status}`)}`;
}

function prettyTicket(ticket: JiraTicket): string {
  const lines: string[] = [];

  lines.push(
    `  ${bold(link(highlight(ticket.key), ticket.url))}  ${bold(ticket.summary)}  ${dim(ticket.status)}`
  );

  // Metadata: label/value pairs, several per line; empty values are skipped
  const row = (...pairs: [string, string | null | undefined][]) => {
    const shown = pairs.filter(([, v]) => v);
    if (shown.length > 0) {
      lines.push("  " + shown.map(([k, v]) => `${dim(`${k}:`)} ${v}`).join("   "));
    }
  };
  row(["Type", ticket.type], ["Priority", ticket.priority], ["Resolution", ticket.resolution]);
  row(["Assignee", ticket.assignee], ["Reporter", ticket.reporter]);
  row(
    ["Created", ticket.created && formatDate(ticket.created)],
    ["Updated", ticket.updated && formatDate(ticket.updated)],
    ["Resolved", ticket.resolved && formatDate(ticket.resolved)],
    ["Due", ticket.due]
  );
  row(["Labels", ticket.labels.join(", ")], ["Components", ticket.components.join(", ")]);
  row(
    ["Fix versions", ticket.fixVersions.join(", ")],
    ["Affects versions", ticket.affectsVersions.join(", ")]
  );
  row(["Sprint", ticket.sprints.map((s) => `${s.name} (${s.state})`).join(", ")]);
  row(["Epic", ticket.epic && link(highlight(ticket.epic), issueUrl(ticket.epic))]);
  row(["Parent", ticket.parent && prettyRef(ticket.parent)]);

  lines.push("");
  lines.push(ticket.description);

  if (ticket.subtasks.length > 0) {
    lines.push("");
    lines.push(`  ${bold("Subtasks")}`);
    for (const sub of ticket.subtasks) lines.push(`  ${prettyRef(sub)}`);
  }

  if (ticket.links.length > 0) {
    lines.push("");
    lines.push(`  ${bold("Links")}`);
    for (const l of ticket.links) lines.push(`  ${dim(l.relation)}  ${prettyRef(l)}`);
  }

  if (ticket.attachments.length > 0) {
    lines.push("");
    lines.push(`  ${bold("Attachments")}`);
    for (const att of ticket.attachments) {
      const path = att.path ? dim(` -> ${att.path}`) : "";
      lines.push(
        `  ${info(att.filename)}  ${dim(att.mimeType)}  ${dim(formatSize(att.size))}${path}`
      );
    }
  }

  if (ticket.comments.length > 0) {
    lines.push("");
    lines.push(`  ${bold("Comments")}`);
    for (const comment of ticket.comments) {
      lines.push(`  ${dim(`${formatDate(comment.created)} — ${comment.author}`)}`);
      lines.push(`  ${comment.body.replace(/\n/g, "\n  ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "done" || s === "closed" || s === "resolved") return success(status);
  if (s.includes("progress")) return info(status);
  return status;
}

/** Strip OSC 8 hyperlink escapes that ansis.strip() doesn't handle */
const OSC8_RE = /\x1b\]8;;[^\x07]*\x07/g;

/** Visible length ignoring ANSI escape codes and OSC 8 hyperlinks */
function visLen(str: string): number {
  return ansis.strip(str.replace(OSC8_RE, "")).length;
}

/** Pad string to visible width, ANSI-aware */
function pad(str: string, len: number): string {
  const diff = len - visLen(str);
  return diff > 0 ? str + " ".repeat(diff) : str;
}

function prettyList(items: JiraListItem[], total: number): string {
  const termWidth = process.stdout.columns || 120;
  const gap = "  ";

  // Build styled cell values per row
  const headers = ["KEY", "TYPE", "PRIORITY", "STATUS", "ASSIGNEE", "SUMMARY"];
  const rows = items.map((item) => [
    link(highlight(item.key), `${JIRA_URL}/browse/${item.key}`),
    item.type,
    item.priority,
    statusColor(item.status),
    item.assignee ?? dim("\u2014"),
    item.summary,
  ]);

  // Compute column widths from data (all columns except summary)
  const colCount = headers.length;
  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < colCount - 1; i++) {
      widths[i] = Math.max(widths[i], visLen(row[i]));
    }
  }

  // Summary gets whatever space remains
  const fixedWidth = widths.slice(0, -1).reduce((a, b) => a + b, 0) + gap.length * (colCount - 1);
  const summaryWidth = Math.max(20, termWidth - fixedWidth);
  widths[colCount - 1] = summaryWidth;

  const headerLine = headers
    .map((h, i) => pad(bold(h), widths[i]))
    .join(gap);

  const dataLines = rows.map((row) =>
    row
      .map((cell, i) => {
        if (i === colCount - 1) {
          // Truncate summary if needed
          return visLen(cell) > widths[i]
            ? cell.slice(0, widths[i] - 1) + "\u2026"
            : cell;
        }
        return pad(cell, widths[i]);
      })
      .join(gap)
  );

  const footer = dim(`\nShowing ${items.length} of ${total} issues`);

  return [headerLine, ...dataLines, footer].join("\n");
}

export type OutputMode = "pretty" | "plain" | "json";

/** Resolve output mode from common CLI flags (--raw/--json → json, --plain → plain). */
export function modeFrom(args: {
  raw?: boolean;
  json?: boolean;
  plain?: boolean;
}): OutputMode {
  if (args.raw || args.json) return "json";
  if (args.plain) return "plain";
  return "pretty";
}

function stripAnsi(str: string): string {
  return ansis.strip(str.replace(OSC8_RE, ""));
}

/** Emit pretty/plain/json depending on mode. */
function emit(pretty: string, data: unknown, mode: OutputMode): void {
  if (mode === "json") {
    console.log(JSON.stringify(data, null, 2));
  } else if (mode === "plain") {
    console.log(stripAnsi(pretty));
  } else {
    console.log(pretty);
  }
}

/** Simple aligned table (last column flexes), ANSI-aware. */
function simpleTable(headers: string[], rows: string[][]): string {
  const colCount = headers.length;
  const gap = "  ";
  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < colCount - 1; i++) {
      widths[i] = Math.max(widths[i], visLen(row[i]));
    }
  }
  const headerLine = headers.map((h, i) => pad(bold(h), widths[i])).join(gap);
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (i < colCount - 1 ? pad(cell, widths[i]) : cell)).join(gap)
  );
  return [headerLine, ...dataLines].join("\n");
}

export function outputList(
  items: JiraListItem[],
  total: number,
  mode: OutputMode
): void {
  // `total` is the server-side match count; `count` < `total` means the list was cut off by --max
  emit(prettyList(items, total), { total, count: items.length, issues: items }, mode);
}

export function outputTickets(tickets: JiraTicket[], mode: OutputMode): void {
  const data = tickets.length === 1 ? tickets[0] : tickets;
  const pretty = tickets.map(prettyTicket).join("\n\n");
  emit(pretty, data, mode);
}

export function outputSprints(
  sprints: { id: number; name: string; state: string }[],
  mode: OutputMode
): void {
  const rows = sprints.map((s) => [
    highlight(String(s.id)),
    statusColor(s.state),
    s.name,
  ]);
  emit(simpleTable(["ID", "STATE", "NAME"], rows), sprints, mode);
}

export function outputBoards(
  boards: { id: number; name: string; type: string }[],
  mode: OutputMode
): void {
  const rows = boards.map((b) => [highlight(String(b.id)), b.type, b.name]);
  emit(simpleTable(["ID", "TYPE", "NAME"], rows), boards, mode);
}

export function outputProjects(
  projects: { key: string; name: string }[],
  mode: OutputMode
): void {
  const rows = projects.map((p) => [highlight(p.key), p.name]);
  emit(simpleTable(["KEY", "NAME"], rows), projects, mode);
}

export function outputMyself(
  me: { name: string; displayName: string; emailAddress: string },
  mode: OutputMode
): void {
  const pretty = [
    `  ${bold(highlight(me.displayName))}`,
    `  ${dim("Username:")} ${me.name}`,
    `  ${dim("Email:")}    ${me.emailAddress}`,
  ].join("\n");
  emit(pretty, me, mode);
}
