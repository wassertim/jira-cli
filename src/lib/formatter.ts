import TurndownService from "turndown";
import type { RawJiraIssue, JiraTicket, JiraAttachment, JiraComment, JiraListItem } from "../types.js";

export function formatListItem(raw: RawJiraIssue): JiraListItem {
  return {
    key: raw.key,
    type: raw.fields.issuetype.name,
    priority: raw.fields.priority?.name ?? "None",
    status: raw.fields.status.name,
    assignee: raw.fields.assignee?.displayName ?? null,
    summary: raw.fields.summary,
  };
}

export function formatIssue(raw: RawJiraIssue): JiraTicket {
  const attachments: JiraAttachment[] = (raw.fields.attachment || []).map(
    (att) => ({
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      url: att.content,
    })
  );

  // Build a filename lookup from attachment URLs for image rewriting
  const attachmentsByUrl = new Map<string, string>();
  for (const att of raw.fields.attachment || []) {
    attachmentsByUrl.set(att.content, att.filename);
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  turndown.addRule("jiraImages", {
    filter: "img",
    replacement(_content: string, node: TurndownService.Node) {
      const el = node as unknown as HTMLElement;
      const src = el.getAttribute("src") || "";
      const alt = el.getAttribute("alt") || "";
      for (const [url, filename] of attachmentsByUrl) {
        if (src.includes(filename) || src === url) {
          return `![${alt || filename}](${filename})`;
        }
      }
      return `![${alt}](${src})`;
    },
  });

  const descriptionHtml = raw.renderedFields?.description || "";
  const description = descriptionHtml
    ? turndown.turndown(descriptionHtml)
    : "(no description)";

  const rawComments = raw.fields.comment?.comments || [];
  const renderedComments = raw.renderedFields?.comment?.comments || [];
  const comments: JiraComment[] = rawComments.map((c, i) => {
    const bodyHtml = renderedComments[i]?.renderedBody || c.renderedBody || c.body || "";
    const body = bodyHtml.startsWith("<") ? turndown.turndown(bodyHtml) : bodyHtml;
    return {
      author: c.author.displayName,
      created: c.created,
      body,
    };
  });

  return {
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status.name,
    assignee: raw.fields.assignee?.displayName ?? null,
    description,
    attachments,
    comments,
  };
}
