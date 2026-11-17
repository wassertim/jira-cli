import { defineCommand } from "citty";
import {
  fetchBoardId,
  fetchBoardColumns,
  fetchSprints,
  fetchSprintByName,
  fetchSprintIssues,
  fetchBoardIssues,
  fetchBacklogIssues,
} from "../lib/jira-client.js";
import { formatListItem } from "../lib/formatter.js";
import { spin, succeed, fail } from "../lib/ui.js";
import { outputList, outputSprints, modeFrom } from "../lib/output.js";

/** JQL clause restricting issues to the statuses of one board column (matched by name). */
async function columnJql(boardId: number, column: string): Promise<string> {
  spin(`Resolving column "${column}"...`);
  const columns = await fetchBoardColumns(boardId);
  const wanted = column.toLowerCase();
  const exact = columns.filter((c) => c.name.toLowerCase() === wanted);
  const matches = exact.length > 0 ? exact : columns.filter((c) => c.name.toLowerCase().includes(wanted));
  const available = columns.map((c) => `"${c.name}"`).join(", ");

  if (matches.length === 0) {
    throw new Error(`No column matching "${column}" on board #${boardId}. Columns: ${available}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Column "${column}" is ambiguous on board #${boardId}: ${matches.map((c) => `"${c.name}"`).join(", ")}`
    );
  }
  const [match] = matches;
  if (match.statusIds.length === 0) {
    throw new Error(`Column "${match.name}" on board #${boardId} has no statuses mapped`);
  }
  succeed(`Column "${match.name}"`);
  return `status in (${match.statusIds.join(", ")})`;
}

const list = defineCommand({
  meta: {
    name: "list",
    description: "List sprints, or issues of a sprint",
  },
  args: {
    id: {
      type: "positional",
      description: "Sprint id (or name, with --project/--board-id); omit to list sprints",
      required: false,
    },
    project: { type: "string", alias: "p", description: "Project key — uses the project's first board" },
    "board-id": { type: "string", description: "Board id (rapidView=<id> in the board URL); overrides --project" },
    current: { type: "boolean", description: "Issues of the active sprint", default: false },
    board: { type: "boolean", description: "All issues on the board", default: false },
    backlog: { type: "boolean", description: "Backlog issues", default: false },
    column: { type: "string", description: "Only issues in this board column (name, case-insensitive)" },
    state: { type: "string", description: "Filter sprint list by state (active,future,closed)" },
    plain: { type: "boolean", description: "Plain text output (no colors)", default: false },
    raw: { type: "boolean", description: "JSON output", default: false },
    json: { type: "boolean", description: "Alias for --raw", default: false },
    max: { type: "string", description: "Maximum number of results (default: 50)" },
  },
  async run({ args }) {
    const mode = modeFrom(args);
    const max = args.max ? parseInt(args.max, 10) : 50;
    const boardIdArg = args["board-id"];
    const issueView = args.current || args.board || args.backlog || Boolean(args.id);

    if ([args.current, args.board, args.backlog].filter(Boolean).length > 1) {
      fail("--current, --board, and --backlog are mutually exclusive");
      process.exit(1);
    }
    if (boardIdArg !== undefined && !/^\d+$/.test(boardIdArg)) {
      fail(`--board-id must be a number, got "${boardIdArg}"`);
      process.exit(1);
    }
    if (args.column && !issueView) {
      fail("--column needs an issue view: --current, --board, --backlog, or a sprint id/name");
      process.exit(1);
    }

    /** Board from --board-id, else the first board of --project. */
    const resolveBoard = async (purpose: string): Promise<number> => {
      if (boardIdArg !== undefined) return parseInt(boardIdArg, 10);
      if (!args.project) {
        fail(`--board-id or --project is required ${purpose}`);
        process.exit(1);
      }
      spin(`Fetching board for ${args.project}...`);
      const boardId = await fetchBoardId(args.project);
      succeed(`Found board #${boardId}`);
      return boardId;
    };

    try {
      // Issue views of a board: active sprint, whole board, or backlog
      if (args.current || args.board || args.backlog) {
        const boardId = await resolveBoard("for --current, --board, or --backlog");
        const jql = args.column ? await columnJql(boardId, args.column) : undefined;

        let result;
        if (args.backlog) {
          spin("Fetching backlog issues...");
          result = await fetchBacklogIssues(boardId, max, jql);
        } else if (args.board) {
          spin("Fetching board issues...");
          result = await fetchBoardIssues(boardId, max, jql);
        } else {
          spin("Resolving active sprint...");
          const active = await fetchSprints(boardId, "active");
          if (active.length === 0) throw new Error("No active sprint on this board");
          succeed(`Active sprint #${active[0].id} (${active[0].name})`);
          spin("Fetching sprint issues...");
          result = await fetchSprintIssues(active[0].id, max, jql);
        }
        succeed(`Found ${result.total} issues`);
        outputList(result.issues.map(formatListItem), result.total, mode);
        return;
      }

      // Sprint id/name positional → issues of that sprint
      if (args.id) {
        const byName = !/^\d+$/.test(String(args.id));
        // A board is only needed to resolve a sprint name or a column
        const boardId =
          byName || args.column
            ? await resolveBoard(byName ? "to resolve a sprint by name" : "for --column")
            : undefined;

        let sprintId: number;
        if (byName) {
          spin(`Resolving sprint "${args.id}"...`);
          sprintId = await fetchSprintByName(boardId!, String(args.id));
        } else {
          sprintId = parseInt(String(args.id), 10);
        }
        succeed(`Sprint #${sprintId}`);
        const jql = args.column ? await columnJql(boardId!, args.column) : undefined;
        spin("Fetching sprint issues...");
        const result = await fetchSprintIssues(sprintId, max, jql);
        succeed(`Found ${result.total} issues`);
        outputList(result.issues.map(formatListItem), result.total, mode);
        return;
      }

      // No id, no issue flag → list sprints
      const boardId = await resolveBoard("to list sprints");
      spin("Fetching sprints...");
      const sprints = await fetchSprints(boardId, args.state || "active,future,closed");
      succeed(`Found ${sprints.length} sprints`);
      outputSprints(sprints, mode);
    } catch (e) {
      fail(`${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});

export default defineCommand({
  meta: {
    name: "sprint",
    description: "List sprints and sprint issues",
  },
  subCommands: { list },
});
