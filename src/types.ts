export interface JiraComment {
  author: string;
  created: string;
  body: string;
}

/** Compact reference to another issue (parent, subtask, link target). */
export interface JiraIssueRef {
  key: string;
  summary: string;
  status: string;
  type: string;
}

export interface JiraIssueLink extends JiraIssueRef {
  /** Relation as seen from this issue, e.g. "blocks" or "is blocked by". */
  relation: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  /** active | future | closed */
  state: string;
}

export interface JiraTicket {
  key: string;
  url: string;
  summary: string;
  type: string;
  status: string;
  resolution: string | null;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  created: string;
  updated: string;
  resolved: string | null;
  due: string | null;
  labels: string[];
  components: string[];
  fixVersions: string[];
  affectsVersions: string[];
  /** Key of the epic this issue belongs to (Epic Link). */
  epic: string | null;
  parent: JiraIssueRef | null;
  subtasks: JiraIssueRef[];
  links: JiraIssueLink[];
  /** All sprints the issue was ever in, oldest first. */
  sprints: JiraSprint[];
  description: string;
  attachments: JiraAttachment[];
  comments: JiraComment[];
}

export interface JiraAttachment {
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  path?: string;
}

export interface RawJiraComment {
  author: { displayName: string };
  created: string;
  body: string;
  renderedBody?: string;
}

/** Issue as embedded in parent / subtasks / issuelinks. */
export interface RawIssueRef {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
  };
}

export interface RawIssueLink {
  type: { name: string; inward: string; outward: string };
  inwardIssue?: RawIssueRef;
  outwardIssue?: RawIssueRef;
}

export interface RawJiraIssue {
  key: string;
  /** Present with expand=schema; maps field id → type info (used to find custom fields). */
  schema?: Record<string, { type?: string; custom?: string }>;
  fields: {
    summary: string;
    status: { name: string };
    assignee: { displayName: string } | null;
    issuetype: { name: string };
    priority: { name: string } | null;
    attachment: RawJiraAttachment[];
    comment?: { comments: RawJiraComment[] };
    // Only present on a full issue fetch (not in search results)
    reporter?: { displayName: string } | null;
    resolution?: { name: string } | null;
    created?: string;
    updated?: string;
    resolutiondate?: string | null;
    duedate?: string | null;
    labels?: string[];
    components?: { name: string }[];
    fixVersions?: { name: string }[];
    versions?: { name: string }[];
    parent?: RawIssueRef | null;
    subtasks?: RawIssueRef[];
    issuelinks?: RawIssueLink[];
    /** Custom fields (sprint, epic link, …) — ids differ per instance. */
    [field: string]: unknown;
  };
  renderedFields?: {
    description: string | null;
    comment?: { comments: Pick<RawJiraComment, "renderedBody">[] };
  };
}

export interface RawSearchResult {
  startAt: number;
  maxResults: number;
  total: number;
  issues: RawJiraIssue[];
}

export interface JiraListItem {
  key: string;
  type: string;
  priority: string;
  status: string;
  assignee: string | null;
  summary: string;
}

export interface RawJiraAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: string;
}
