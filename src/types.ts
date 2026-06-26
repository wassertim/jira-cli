export interface JiraComment {
  author: string;
  created: string;
  body: string;
}

export interface JiraTicket {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
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

export interface RawJiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee: { displayName: string } | null;
    issuetype: { name: string };
    priority: { name: string } | null;
    attachment: RawJiraAttachment[];
    comment?: { comments: RawJiraComment[] };
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
