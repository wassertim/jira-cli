import { defineCommand } from "citty";
import {
  fetchBoardId,
  fetchSprints,
  fetchSprintByName,
  fetchSprintIssues,
  fetchBoardIssues,
  fetchBacklogIssues,
} from "../lib/jira-client.js";
import { formatListItem } from "../lib/formatter.js";
import { spin, succeed, fail } from "../lib/ui.js";
import { outputList, outputSprints, modeFrom } from "../lib/output.js";

const list = defineCommand({
  meta: {
    name: "list",
    description: "List sprints, or issues of a sprint",
  },
  args: {
    id: {
      type: "positional",
      description: "Sprint id (or name with --project); omit to list sprints",
      required: false,
    },
    project: { type: "string", alias: "p", description: "Project key (required for --current/--board/--backlog and listing)" },
    current: { type: "boolean", description: "Issues of the active sprint", default: false },
    board: { type: "boolean", description: "All issues on the board", default: false },
    backlog: { type: "boolean", description: "Backlog issues", default: false },
    state: { type: "string", description: "Filter sprint list by state (active,future,closed)" },
    plain: { type: "boolean", description: "Plain text output (no colors)", default: false },
    raw: { type: "boolean", description: "JSON output", default: false },
    json: { type: "boolean", description: "Alias for --raw", default: false },
    max: { type: "string", description: "Maximum number of results (default: 50)" },
  },
  async run({ args }) {
    const mode = modeFrom(args);
    const max = args.max ? parseInt(args.max, 10) : 50;

    if ([args.current, args.board, args.backlog].filter(Boolean).length > 1) {
      fail("--current, --board, and --backlog are mutually exclusive");
      process.exit(1);
    }

    try {
      // Issue views that require a board → need --project
      if (args.current || args.board || args.backlog) {
        if (!args.project) {
          fail("--project is required for --current, --board, or --backlog");
          process.exit(1);
        }
        spin(`Fetching board for ${args.project}...`);
        const boardId = await fetchBoardId(args.project);
        succeed(`Found board #${boardId}`);

        let result;
        if (args.backlog) {
          spin("Fetching backlog issues...");
          result = await fetchBacklogIssues(boardId, max);
        } else if (args.board) {
          spin("Fetching board issues...");
          result = await fetchBoardIssues(boardId, max);
        } else {
          spin("Resolving active sprint...");
          const active = await fetchSprints(boardId, "active");
          if (active.length === 0) throw new Error("No active sprint on this board");
          succeed(`Active sprint #${active[0].id} (${active[0].name})`);
          spin("Fetching sprint issues...");
          result = await fetchSprintIssues(active[0].id, max);
        }
        succeed(`Found ${result.total} issues`);
        outputList(result.issues.map(formatListItem), result.total, mode);
        return;
      }

      // Sprint id/name positional → issues of that sprint
      if (args.id) {
        let sprintId: number;
        if (/^\d+$/.test(String(args.id))) {
          sprintId = parseInt(String(args.id), 10);
        } else {
          if (!args.project) {
            fail("--project is required to resolve a sprint by name");
            process.exit(1);
          }
          spin(`Fetching board for ${args.project}...`);
          const boardId = await fetchBoardId(args.project);
          spin(`Resolving sprint "${args.id}"...`);
          sprintId = await fetchSprintByName(boardId, String(args.id));
        }
        succeed(`Sprint #${sprintId}`);
        spin("Fetching sprint issues...");
        const result = await fetchSprintIssues(sprintId, max);
        succeed(`Found ${result.total} issues`);
        outputList(result.issues.map(formatListItem), result.total, mode);
        return;
      }

      // No id, no issue flag → list sprints (needs --project)
      if (!args.project) {
        fail("--project is required to list sprints");
        process.exit(1);
      }
      spin(`Fetching board for ${args.project}...`);
      const boardId = await fetchBoardId(args.project);
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
