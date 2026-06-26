#!/usr/bin/env bun

import { defineCommand, runMain } from "citty";
import issue from "./commands/issue.js";
import issueView from "./commands/issue-view.js";
import issueList from "./commands/issue-list.js";
import sprint from "./commands/sprint.js";
import board from "./commands/board.js";
import project from "./commands/project.js";
import me from "./commands/me.js";
import open from "./commands/open.js";

const main = defineCommand({
  meta: {
    name: "jira",
    version: "1.0.0",
    description: "CLI for interacting with Jira Server",
  },
  subCommands: {
    issue,
    sprint,
    board,
    project,
    me,
    open,
    // Back-compat aliases (deprecated): prefer `issue view` / `issue list`
    show: issueView,
    list: issueList,
  },
});

runMain(main);
