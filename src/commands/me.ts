import { defineCommand } from "citty";
import { fetchMyself } from "../lib/jira-client.js";
import { spin, succeed, fail } from "../lib/ui.js";
import { outputMyself, modeFrom } from "../lib/output.js";

export default defineCommand({
  meta: {
    name: "me",
    description: "Show the current user",
  },
  args: {
    raw: { type: "boolean", description: "JSON output", default: false },
    json: { type: "boolean", description: "Alias for --raw", default: false },
  },
  async run({ args }) {
    try {
      spin("Fetching current user...");
      const me = await fetchMyself();
      succeed("Done");
      outputMyself(me, modeFrom(args));
    } catch (e) {
      fail(`${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});
