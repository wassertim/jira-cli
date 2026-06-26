import { defineCommand } from "citty";
import view from "./issue-view.js";
import list from "./issue-list.js";

export default defineCommand({
  meta: {
    name: "issue",
    description: "View and list issues",
  },
  subCommands: {
    view,
    list,
  },
});
