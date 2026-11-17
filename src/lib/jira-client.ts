import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import type { RawJiraIssue, RawJiraAttachment, RawSearchResult } from "../types.js";

export const JIRA_URL = process.env.JIRA_URL ?? "";

function getHeaders(): Record<string, string> {
  if (!JIRA_URL) {
    throw new Error(
      "JIRA_URL env var not set (e.g. export JIRA_URL=https://jira.example.com)"
    );
  }
  const token = process.env.JIRA_TOKEN;
  if (!token) {
    throw new Error(
      'JIRA_TOKEN env var not set. Use a secret manager, e.g. JIRA_TOKEN=$(op read "op://<vault>/<item>/credential") jira issue view ...'
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchIssue(key: string): Promise<RawJiraIssue> {
  const res = await fetch(
    `${JIRA_URL}/rest/api/2/issue/${encodeURIComponent(key)}?expand=renderedFields,schema`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch ${key} (HTTP ${res.status}): ${body}`);
  }

  return res.json() as Promise<RawJiraIssue>;
}

const SEARCH_FIELDS = "summary,status,assignee,issuetype,priority";

export async function searchIssues(
  jql: string,
  maxResults = 50
): Promise<RawSearchResult> {
  const params = new URLSearchParams({
    jql,
    maxResults: String(maxResults),
    fields: SEARCH_FIELDS,
  });
  const res = await fetch(`${JIRA_URL}/rest/api/2/search?${params}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Search failed (HTTP ${res.status}): ${body}`);
  }
  return res.json() as Promise<RawSearchResult>;
}

export async function fetchBoards(
  projectKey?: string
): Promise<{ id: number; name: string; type: string }[]> {
  const params = new URLSearchParams();
  if (projectKey) params.set("projectKeyOrId", projectKey);
  const res = await fetch(
    `${JIRA_URL}/rest/agile/1.0/board?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch boards (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    values: { id: number; name: string; type: string }[];
  };
  return data.values;
}

export async function fetchBoardId(projectKey: string): Promise<number> {
  const boards = await fetchBoards(projectKey);
  if (boards.length === 0) {
    throw new Error(`No board found for project ${projectKey}`);
  }
  return boards[0].id;
}

/** Columns of a board with the status ids mapped to each (board configuration). */
export async function fetchBoardColumns(
  boardId: number
): Promise<{ name: string; statusIds: string[] }[]> {
  const res = await fetch(
    `${JIRA_URL}/rest/agile/1.0/board/${boardId}/configuration`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch board ${boardId} configuration (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    columnConfig?: { columns?: { name: string; statuses?: { id: string }[] }[] };
  };
  return (data.columnConfig?.columns ?? []).map((c) => ({
    name: c.name,
    statusIds: (c.statuses ?? []).map((st) => st.id),
  }));
}

export async function fetchSprints(
  boardId: number,
  state = "active,future,closed"
): Promise<{ id: number; name: string; state: string }[]> {
  const params = new URLSearchParams({ state });
  const res = await fetch(
    `${JIRA_URL}/rest/agile/1.0/board/${boardId}/sprint?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch sprints (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    values: { id: number; name: string; state: string }[];
  };
  return data.values;
}

export async function fetchMyself(): Promise<{
  name: string;
  displayName: string;
  emailAddress: string;
}> {
  const res = await fetch(`${JIRA_URL}/rest/api/2/myself`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch current user (HTTP ${res.status}): ${body}`);
  }
  return res.json() as Promise<{
    name: string;
    displayName: string;
    emailAddress: string;
  }>;
}

export async function fetchProjects(): Promise<
  { key: string; name: string }[]
> {
  const res = await fetch(`${JIRA_URL}/rest/api/2/project`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch projects (HTTP ${res.status}): ${body}`);
  }
  return res.json() as Promise<{ key: string; name: string }[]>;
}

export async function fetchBoardIssues(
  boardId: number,
  maxResults = 50,
  jql?: string
): Promise<RawSearchResult> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    fields: SEARCH_FIELDS,
  });
  if (jql) params.set("jql", jql);
  const res = await fetch(
    `${JIRA_URL}/rest/agile/1.0/board/${boardId}/issue?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch board issues (HTTP ${res.status}): ${body}`);
  }
  return res.json() as Promise<RawSearchResult>;
}

export async function fetchBacklogIssues(
  boardId: number,
  maxResults = 50,
  jql?: string
): Promise<RawSearchResult> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    fields: SEARCH_FIELDS,
  });
  if (jql) params.set("jql", jql);
  const res = await fetch(
    `${JIRA_URL}/rest/agile/1.0/board/${boardId}/backlog?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch backlog issues (HTTP ${res.status}): ${body}`);
  }
  return res.json() as Promise<RawSearchResult>;
}

export async function fetchSprintByName(
  boardId: number,
  name: string
): Promise<number> {
  const params = new URLSearchParams({ state: "active,future,closed" });
  const res = await fetch(
    `${JIRA_URL}/rest/agile/1.0/board/${boardId}/sprint?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch sprints (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as { values: { id: number; name: string }[] };
  const match = data.values.find(
    (s) => s.name.toLowerCase().includes(name.toLowerCase())
  );
  if (!match) {
    throw new Error(`No sprint matching "${name}" found`);
  }
  return match.id;
}

export async function fetchSprintIssues(
  sprintId: number,
  maxResults = 50,
  jql?: string
): Promise<RawSearchResult> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    fields: SEARCH_FIELDS,
  });
  if (jql) params.set("jql", jql);
  const res = await fetch(
    `${JIRA_URL}/rest/agile/1.0/sprint/${sprintId}/issue?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch sprint issues (HTTP ${res.status}): ${body}`);
  }
  return res.json() as Promise<RawSearchResult>;
}

export async function downloadAttachment(
  att: RawJiraAttachment,
  destDir: string
): Promise<string> {
  const filePath = join(destDir, att.filename);

  // Skip download if file already exists and size matches
  try {
    const existing = await stat(filePath);
    if (existing.size === att.size) {
      return filePath;
    }
  } catch {
    // File doesn't exist, proceed with download
  }

  await mkdir(destDir, { recursive: true });

  const res = await fetch(att.content, {
    headers: { Authorization: getHeaders().Authorization },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to download ${att.filename} (HTTP ${res.status})`
    );
  }

  await pipeline(
    res.body as unknown as NodeJS.ReadableStream,
    createWriteStream(filePath)
  );

  return filePath;
}
