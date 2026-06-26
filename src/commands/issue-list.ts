import { defineCommand } from "citty";
import { searchIssues } from "../lib/jira-client.js";
import { formatListItem } from "../lib/formatter.js";
import { spin, succeed, fail } from "../lib/ui.js";
import { outputList, modeFrom } from "../lib/output.js";

/** Map a period keyword to a JQL relative date; pass through anything else. */
function period(v: string): string {
  const map: Record<string, string> = {
    day: "-1d",
    week: "-1w",
    month: "-4w",
    year: "-52w",
  };
  return map[v] ?? v;
}

export default defineCommand({
  meta: {
    name: "list",
    description: "Search and list issues",
  },
  args: {
    project: { type: "string", alias: "p", description: "Filter by project, e.g. PROJ" },
    assignee: { type: "string", alias: "a", description: "Filter by assignee" },
    mine: { type: "boolean", description: "Issues assigned to me", default: false },
    status: { type: "string", alias: "s", description: 'Filter by status (prefix ~ to negate, e.g. ~Done)' },
    type: { type: "string", alias: "t", description: "Filter by issue type" },
    priority: { type: "string", alias: "y", description: "Filter by priority" },
    label: { type: "string", alias: "l", description: "Filter by label (repeatable)" },
    reporter: { type: "string", alias: "r", description: "Filter by reporter" },
    jql: { type: "string", alias: "q", description: "Raw JQL appended as a clause" },
    created: { type: "string", description: "Created within period (day|week|month|year|-Nd)" },
    updated: { type: "string", description: "Updated within period (day|week|month|year|-Nd)" },
    "order-by": { type: "string", description: "Sort field (default: updated)" },
    reverse: { type: "boolean", description: "Reverse sort (ascending)", default: false },
    plain: { type: "boolean", description: "Plain text output (no colors)", default: false },
    raw: { type: "boolean", description: "JSON output", default: false },
    json: { type: "boolean", description: "Alias for --raw", default: false },
    max: { type: "string", description: "Maximum number of results (default: 50)" },
  },
  async run({ args }) {
    const max = args.max ? parseInt(args.max, 10) : 50;
    const labels = args.label
      ? Array.isArray(args.label)
        ? (args.label as string[])
        : [args.label as string]
      : [];

    const clauses: string[] = [];
    if (args.project) clauses.push(`project = ${args.project}`);
    if (args.mine) clauses.push("assignee = currentUser()");
    else if (args.assignee) clauses.push(`assignee = "${args.assignee}"`);
    if (args.status)
      clauses.push(
        args.status.startsWith("~")
          ? `status != "${args.status.slice(1)}"`
          : `status = "${args.status}"`
      );
    if (args.type) clauses.push(`issuetype = "${args.type}"`);
    if (args.priority) clauses.push(`priority = "${args.priority}"`);
    if (labels.length) clauses.push(`labels in (${labels.map((l) => `"${l}"`).join(", ")})`);
    if (args.reporter) clauses.push(`reporter = "${args.reporter}"`);
    if (args.created) clauses.push(`created >= ${period(args.created)}`);
    if (args.updated) clauses.push(`updated >= ${period(args.updated)}`);
    if (args.jql) clauses.push(`(${args.jql})`);

    if (clauses.length === 0) {
      fail("At least one filter is required (e.g. --project, --mine, --assignee, --jql)");
      process.exit(1);
    }

    const orderBy = args["order-by"] || "updated";
    const dir = args.reverse ? "ASC" : "DESC";
    const jql = `${clauses.join(" AND ")} ORDER BY ${orderBy} ${dir}`;

    try {
      spin("Searching issues...");
      const result = await searchIssues(jql, max);
      succeed(`Found ${result.total} issues`);
      const items = result.issues.map(formatListItem);
      outputList(items, result.total, modeFrom(args));
    } catch (e) {
      fail(`${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});
