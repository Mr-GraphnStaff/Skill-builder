# INFOSEC Field Registry

> **Source:** Jira REST API `/rest/api/3/issue/{key}?expand=names,schema`
> **Verified:** 2026-04-08 against INFOSEC-2749
> **Rule:** This file is the single source of truth. If SKILL.md or any other file contradicts this, this file wins.
> **Staleness Gate:** If today's date is more than 14 days after the Verified date above, flag this file as potentially stale before any create or field-edit operation. Say: "field-map.md is over 2 weeks old; field IDs or screen configs may have changed. Re-verify against Jira API before proceeding, or acknowledge and continue." Do not block read-only work, but do not silently make field changes with stale assumptions.

---

## Writable Fields

These fields can be set on create or update via the Atlassian MCP tool.

### Required for Create

| Field ID | Name | Type | Input | Notes |
|----------|------|------|-------|-------|
| `summary` | Summary | string | string | Max 100 chars, clear and specific |
| `issuetype` | Issue Type | issuetype | issuetype | Story, Task, or Sub-task (see SKILL.md) |
| `project` | Project | project | project | Always `INFOSEC` |
| `parent` | Parent | issuelink | issuelink | Required for Sub-task only |

### Required for Every Ticket (set on create, maintain on update)

| Field ID | Name | Type | Input | Notes |
|----------|------|------|-------|-------|
| `assignee` | Assignee | user | accountId string | Default: `6398a3df3c9bcd36397725a4` |
| `description` | Description | string | ADF JSON | What/Why/How/Impact/Considerations/Done |
| `priority` | Priority | priority | `{"name": "..."}` | See priority table below |
| `labels` | Labels | array | array of strings | Minimum: `INFOSEC`, current quarter label |
| `customfield_12307` | Effort Hours | number | float | Estimated total hours. Never 0. |
| `customfield_12506` | Completed Effort Hours | number | float | Hours worked to date |
| `customfield_12505` | Remaining Effort Hours | number | float | `= estimated - completed` (min 0) |

### Required Business Context Fields

| Field ID | Name | Type | Input | Notes |
|----------|------|------|-------|-------|
| `customfield_11375` | Problem Statement | string | ADF textarea | What's broken/missing |
| `customfield_12275` | Business Context | string | ADF textarea | Why this matters |
| `customfield_12274` | Solution | string | ADF textarea | Implementation plan |
| `customfield_11642` | Expected Outcome | string | ADF textarea | Success criteria |
| `customfield_12340` | Problem Impact | string | ADF textarea | Consequences of inaction |
| `customfield_12276` | Technical Constraints | string | ADF textarea | Dependencies/blockers |

### Recommended (not required - do not block operations over these)

| Field ID | Name | Type | Input | Notes |
|----------|------|------|-------|-------|
| `customfield_11635` | Expected Start Date | date | `YYYY-MM-DD` | Default: today |
| `customfield_11636` | Expected Due Date | date | `YYYY-MM-DD` | Default: sprint end date if sprint assigned |
| `customfield_10007` | Epic Link | any | gh-epic-link | Story type, if applicable |
| `customfield_10006` | Sprint | array | gh-sprint | Array of sprint objects |

### Classification Fields (set defaults if not specified)

| Field ID | Name | Type | Input | Default |
|----------|------|------|-------|---------|
| `customfield_12208` | Security Domain | array/multiselect | `[{"value": "Security Architecture"}]` | Security Architecture |
| `customfield_12373` | OnePlan Category | option/select | `{"value": "KTLO"}` | KTLO |
| `customfield_12406` | Business Type | array/multiselect | `[{"value": "Enterprise"}]` | null |
| `customfield_11388` | Product Access | array/multiselect | `[{"value": "Jira"}]` | Jira |

### Other Writable Fields

| Field ID | Name | Type | Notes |
|----------|------|------|-------|
| `customfield_11201` | Start date | date | Datepicker. NOT ServiceNow Change Request ID. |
| `customfield_11239` | End Date | datetime | ISO datetime |
| `customfield_11376` | Due Date | date | Datepicker |
| `customfield_11380` | Stakeholders | string/textarea | RACI format |
| `customfield_10800` | Team | team | Atlassian team object |
| `components` | Components | array | Dropdown |
| `fixVersions` | Fix versions | array | Array of objects |
| `issuelinks` | Linked Issues | array | Array of link objects |
| `versions` | Affects versions | array | Array of objects |
| `environment` | Environment | string | Free text |
| `attachment` | Attachment | array | Array of objects |

---

## Read-Only Fields (DO NOT attempt to write)

### Effort Rollup (computed by Jira)

| Field ID | Name | Notes |
|----------|------|-------|
| `customfield_12937` | Estimated Effort Hours | Computed - read only |
| `customfield_12936` | Story Completed Effort Hours | Computed - read only |
| `customfield_12935` | Completed Same Hours | Computed - read only |
| `customfield_12870` | SameHours | Computed - read only |
| `customfield_12868` | Total Hours | Computed - read only |
| `customfield_12934` | Completed Total Hours | Computed - read only |
| `timespent` | Time Spent | Jira native worklog total (seconds) |
| `timeestimate` | Remaining Estimate | Jira native (seconds) |
| `timeoriginalestimate` | Original Estimate | Jira native (seconds) |
| `aggregatetimespent` | Sum Time Spent | Rollup across subtasks |
| `aggregatetimeestimate` | Sum Remaining Estimate | Rollup |
| `aggregatetimeoriginalestimate` | Sum Original Estimate | Rollup |

### Status & Lifecycle (use transitions API to change status)

| Field ID | Name | Notes |
|----------|------|-------|
| `status` | Status | Use `transitionJiraIssue` |
| `resolution` | Resolution | Set on transition to Done |
| `resolutiondate` | Resolved | Auto-set |
| `statuscategorychangedate` | Status Category Changed | Auto-set |
| `created` | Created | Auto-set |
| `updated` | Updated | Auto-set |

### Activity & Audit

| Field ID | Name | Notes |
|----------|------|-------|
| `worklog` | Log Work | Use `addWorklogToJiraIssue` |
| `comment` | Comment | Use `addCommentToJiraIssue` |
| `customfield_13730` | Last Updater | Auto-set (user) |
| `customfield_13731` | Days since last comment | Auto-set (number) |
| `customfield_11302` | Checklist Progress | Read-only string |
| `customfield_11303` | Checklist Progress % | Read-only number |
| `customfield_10002` | Flagged | Multi-checkbox |
| `workratio` | Work Ratio | Computed |

---

## Allowed Values

### Priority

| ID | Name | Usage |
|----|------|-------|
| 1 | Highest | |
| 2 | High | Standard high priority |
| 3 | Medium | Default |
| 4 | Low | |
| 5 | Lowest | |
| 10000 | Blocker | |
| 10001 | Critical | |

### Security Domain (`customfield_12208`)

| Option ID | Value |
|-----------|-------|
| 11591 | Security Operations & Engineering |
| 11592 | Security Support & IAM |
| 11593 | Security Architecture |
| 11595 | Vulnerability Management |
| 11594 | GRC-Controls & Risk |
| 11657 | GRC-Compliance |
| 11658 | GRC-TPRM & Info Requests |
| 11690 | Security Business Ops & Analytics |

### OnePlan Category (`customfield_12373`)

| Option ID | Value |
|-----------|-------|
| 11723 | ATP |
| 11724 | KTLO |
| 11725 | Continuous Improvement |
| 11789 | Project |
| 11790 | Small Enhancement |

### Business Type (`customfield_12406`)

| Option ID | Value |
|-----------|-------|
| 11756 | Enterprise |
| 11757 | Regional |
| 11758 | Legal |
| 11759 | Regulatory |
| 11760 | Compliance |
| 11761 | Non-Sec Sponsor Team |

---

## ADF Format

**Hard rule: never violate this for create or edit calls.**

Every create and edit call must set `contentFormat` to `adf` (not markdown, not omitted).

Passing `contentFormat: markdown` on any create or edit call causes textarea fields to render as raw literal text in Jira, including `##` headings and newline characters.

The ONLY correct pattern:
- createJiraIssue: set contentFormat: adf AND pass all textarea fields as ADF JSON objects
- editJiraIssue: set contentFormat: adf AND pass all textarea fields as ADF JSON objects
- NEVER pass description or any custom textarea as a plain string or markdown string
- NEVER use contentFormat: markdown on create or edit operations

Textarea fields that MUST be ADF JSON objects (never strings):
- description
- customfield_11375 (Problem Statement)
- customfield_12275 (Business Context)
- customfield_12274 (Solution)
- customfield_11642 (Expected Outcome)
- customfield_12340 (Problem Impact)
- customfield_12276 (Technical Constraints)

All textarea custom fields accept Atlassian Document Format JSON.

**Paragraph:**
```json
{"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"Your content here"}]}]}
```

**Bullet List:**
```json
{"type":"doc","version":1,"content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Item text"}]}]}]}]}
```

**@mention (inline in paragraph):**
```json
{"type":"mention","attrs":{"id":"<accountId>","text":"@Display Name","accessLevel":""}}
```

**Bold text:**
```json
{"type":"text","text":"Bold text","marks":[{"type":"strong"}]}
```
