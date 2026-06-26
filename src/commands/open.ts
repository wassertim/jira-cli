import { defineCommand } from "citty";
import { spawn } from "node:child_process";
import { JIRA_URL } from "../lib/jira-client.js";
import { succeed, fail } from "../lib/ui.js";

export default defineCommand({
  meta: {
    name: "open",
    description: "Open the project or an issue in the browser",
  },
  args: {
    key: {
      type: "positional",
      description: "Issue key to open, e.g. PROJ-123 (omit to open Jira)",
      required: false,
    },
  },
  async run({ args }) {
    if (!JIRA_URL) {
      fail("JIRA_URL env var not set (e.g. export JIRA_URL=https://jira.example.com)");
      process.exit(1);
    }
    const url = args.key ? `${JIRA_URL}/browse/${args.key}` : JIRA_URL;
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    try {
      spawn(opener, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
      succeed(`Opening ${url}`);
    } catch (e) {
      fail(`${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  },
});
