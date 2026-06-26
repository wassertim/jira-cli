import { defineCommand } from "citty";
import { fetchProjects } from "../lib/jira-client.js";
import { spin, succeed, fail } from "../lib/ui.js";
import { outputProjects, modeFrom } from "../lib/output.js";

const list = defineCommand({
  meta: {
    name: "list",
    description: "List accessible projects",
  },
  args: {
    plain: { type: "boolean", description: "Plain text output (no colors)", default: false },
    raw: { type: "boolean", description: "JSON output", default: false },
    json: { type: "boolean", description: "Alias for --raw", default: false },
  },
  async run({ args }) {
    try {
      spin("Fetching projects...");
      const projects = await fetchProjects();
      succeed(`Found ${projects.length} projects`);
      outputProjects(projects, modeFrom(args));
    } catch (e) {
      fail(`${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});

export default defineCommand({
  meta: {
    name: "project",
    description: "List projects",
  },
  subCommands: { list },
});
