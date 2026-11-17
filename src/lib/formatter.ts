import TurndownService from "turndown";
import type {
  RawJiraIssue,
  RawIssueRef,
  JiraTicket,
  JiraAttachment,
  JiraComment,
  JiraListItem,
  JiraIssueRef,
  JiraIssueLink,
  JiraSprint,
} from "../types.js";
import { JIRA_URL } from "./jira-client.js";

const SPRINT_FIELD = "com.pyxis.greenhopper.jira:gh-sprint";
const EPIC_LINK_FIELD = "com.pyxis.greenhopper.jira:gh-epic-link";

/** Value of the custom field with the given type key (field ids differ per instance). */
function customField(raw: RawJiraIssue, customType: string): unknown {
  for (const [id, schema] of Object.entries(raw.schema ?? {})) {
    if (schema.custom === customType) return raw.fields[id];
  }
  return undefined;
}

/**
 * Jira Server returns sprints as serialized strings
 * ("…Sprint@1a2b[id=12,name=Sprint 5,state=ACTIVE,…]"), newer versions as objects.
 */
function parseSprint(value: unknown): JiraSprint | null {
  if (value && typeof value === "object") {
    const o = value as { id?: unknown; name?: unknown; state?: unknown };
    if (o.id === undefined) return null;
    return {
      id: Number(o.id),
      name: String(o.name ?? ""),
      state: String(o.state ?? "").toLowerCase(),
    };
  }
  if (typeof value !== "string") return null;
  const body = value.slice(value.indexOf("[") + 1, value.lastIndexOf("]"));
  const id = body.match(/(?:^|,)id=(\d+)/)?.[1];
  if (!id) return null;
  // The name may itself contain commas — read up to the next ",key=" pair
  const name = body.match(/(?:^|,)name=(.*?)(?=,[A-Za-z]+=|$)/)?.[1] ?? "";
  const state = body.match(/(?:^|,)state=([^,]*)/)?.[1] ?? "";
  return { id: Number(id), name, state: state.toLowerCase() };
}

function issueRef(ref: RawIssueRef): JiraIssueRef {
  return {
    key: ref.key,
    summary: ref.fields.summary,
    status: ref.fields.status.name,
    type: ref.fields.issuetype.name,
  };
}

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

  const f = raw.fields;

  const links: JiraIssueLink[] = (f.issuelinks ?? []).flatMap((l) => {
    if (l.outwardIssue) return [{ relation: l.type.outward, ...issueRef(l.outwardIssue) }];
    if (l.inwardIssue) return [{ relation: l.type.inward, ...issueRef(l.inwardIssue) }];
    return [];
  });

  const rawSprints = customField(raw, SPRINT_FIELD);
  const sprints = (Array.isArray(rawSprints) ? rawSprints : rawSprints ? [rawSprints] : [])
    .map(parseSprint)
    .filter((s): s is JiraSprint => s !== null);

  const epic = customField(raw, EPIC_LINK_FIELD);

  return {
    key: raw.key,
    url: `${JIRA_URL}/browse/${raw.key}`,
    summary: f.summary,
    type: f.issuetype.name,
    status: f.status.name,
    resolution: f.resolution?.name ?? null,
    priority: f.priority?.name ?? null,
    assignee: f.assignee?.displayName ?? null,
    reporter: f.reporter?.displayName ?? null,
    created: f.created ?? "",
    updated: f.updated ?? "",
    resolved: f.resolutiondate ?? null,
    due: f.duedate ?? null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name),
    fixVersions: (f.fixVersions ?? []).map((v) => v.name),
    affectsVersions: (f.versions ?? []).map((v) => v.name),
    epic: typeof epic === "string" && epic ? epic : null,
    parent: f.parent ? issueRef(f.parent) : null,
    subtasks: (f.subtasks ?? []).map(issueRef),
    links,
    sprints,
    description,
    attachments,
    comments,
  };
}
