import { defineCommand } from "citty";
import { fetchBoards } from "../lib/jira-client.js";
import { spin, succeed, fail } from "../lib/ui.js";
import { outputBoards, modeFrom } from "../lib/output.js";

const list = defineCommand({
  meta: {
    name: "list",
    description: "List boards",
  },
  args: {
    project: { type: "string", alias: "p", description: "Filter boards by project" },
    plain: { type: "boolean", description: "Plain text output (no colors)", default: false },
    raw: { type: "boolean", description: "JSON output", default: false },
    json: { type: "boolean", description: "Alias for --raw", default: false },
  },
  async run({ args }) {
    try {
      spin("Fetching boards...");
      const boards = await fetchBoards(args.project);
      succeed(`Found ${boards.length} boards`);
      outputBoards(boards, modeFrom(args));
    } catch (e) {
      fail(`${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});

export default defineCommand({
  meta: {
    name: "board",
    description: "List boards",
  },
  subCommands: { list },
});
