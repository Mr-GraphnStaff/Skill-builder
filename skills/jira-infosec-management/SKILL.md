---
name: jira-infosec-management
description: Manage authorized HUB INFOSEC Jira work items through the Jira MCP integration. Use when the user asks to create, inspect, update, comment on, log work for, transition, estimate, remediate, or report on INFOSEC Jira tickets, including ISAR, SAR, security architecture, threat modeling, or INFOSEC-1234 references. Requires access to the HUB Jira instance and Jira MCP tools; if tools are unavailable, prepare a reviewable plan or payload instead of claiming live changes.
---

# Jira INFOSEC Management

Use this skill for INFOSEC Jira work item operations that must preserve audit quality, effort accounting, sprint context, and field correctness.

## Operating Contract

- Perform live Jira changes only when the required Jira MCP tools are available and the user has authorized the action.
- If live tools are unavailable, produce a reviewable plan, JQL, field payload, comment body, or transition checklist. Do not claim Jira was changed.
- Treat every Jira work item as an audit record: comments, worklogs, field updates, and transitions must tell a consistent story.
- Govern the `INFOSEC` project only. Treat SAP issue keys as legacy references; active ISAR, SAR, and threat-modeling work belongs in INFOSEC tickets.
- Never hardcode or request secrets. Use configured MCP/auth context only.

## Environment

- Instance: `https://hubjira.atlassian.net`
- Cloud ID: `015bce03-3867-49e4-a819-c1b2e3ceb4f5`
- Primary project: `INFOSEC`
- Default assignee: David Farris (`6398a3df3c9bcd36397725a4`)

## Reference Library

Load the relevant reference before acting. Do not guess field IDs, names, allowed values, templates, or account IDs.

| File | Load when |
| --- | --- |
| `references/field-map.md` | Creating or editing ticket fields, checking writable/read-only status, building ADF |
| `references/comment-templates.md` | Posting any comment or drafting a comment payload |
| `references/estimation.md` | Creating, estimating, or re-estimating work |
| `references/workflow.md` | Transitioning status, checking stale work, writing JQL |
| `references/people.md` | Assigning work or building ADF mentions |
| `references/sprint-schedule-2026.md` | Sprint context when live sprint data is absent |
| `references/mcp-operations.md` | Retrying Jira MCP calls, handling partial failures, confirming tool availability |

## Supported Issue Types

| Type | Use | Parent required |
| --- | --- | --- |
| Story | Main work item | No |
| Task | Standalone work item | No |
| Sub-task | Breakdown of a Story or Task | Yes |

Other INFOSEC types can exist, but do not create or mutate them with this skill unless the user explicitly asks and the field metadata confirms support.

## Session Setup

Before any live operation:

1. Identify the exact ticket key or creation target. If the user says "this ticket" or "the issue", resolve it from the active context; ask if ambiguous.
2. Confirm whether the action is read-only, a draft/payload request, or a live Jira mutation.
3. Load the reference files required for the operation.
4. For creates and field edits, check `references/field-map.md` staleness and writable-field rules.
5. For updates, comments, worklogs, or transitions, ask for hours worked unless the user already supplied them. Use `0h` only when the comment is informational and no work is being logged.

## ADF Rules For Field Writes

For `createJiraIssue` and `editJiraIssue`:

- Set `contentFormat: adf`.
- Pass `description` and all textarea business-context fields as ADF JSON objects.
- Never use `contentFormat: markdown`.
- Never pass `description`, Problem Statement, Business Context, Solution, Expected Outcome, Problem Impact, or Technical Constraints as plain strings.

Read `references/field-map.md` before building any create/edit payload.

## Create Ticket

1. Load `references/field-map.md`, `references/estimation.md`, and `references/comment-templates.md`.
2. Determine issue type, summary, assignee, priority, labels, sprint/due-date context, and business-context fields.
3. For a Story, inspect related INFOSEC tickets in the same work context. If sibling tickets share an Epic, reuse that parent Epic; ask if ambiguous.
4. For a Sub-task, require a parent Story or Task.
5. Estimate effort using `references/estimation.md`.
6. Set all required fields and classification defaults from `references/field-map.md`.
7. Initialize effort fields:
   - `customfield_12307` = estimated hours
   - `customfield_12506` = `0`
   - `customfield_12505` = estimated hours
8. If a sprint is assigned, set Expected Due Date to sprint end date when the field is writable.
9. Create the ticket with ADF content.
10. Post the Effort Initialization comment.

## Update Ticket

Use this sequence for field updates, substantive comments, and any worklog-producing change.

1. Ask "How much time on this?" if hours were not provided.
2. Fetch the current ticket, including effort fields and sprint data.
3. Calculate:
   - `completed_new = completed_old + hours_worked`
   - `remaining_new = max(estimated - completed_new, 0)`
   - `burn_pct = completed_new / estimated * 100`
   - `sprint_pct = sprint_day / 21 * 100` when sprint context exists
4. Run screen validation for the project and issue type. Cache the writable-field result for the session.
5. Write only fields confirmed writable. If effort fields are not writable, continue with comment and worklog, and state that manual effort sync is required.
6. Post the templated effort/progress comment.
7. Add the worklog for `hours_worked`.
8. Report exactly what succeeded and what, if anything, requires manual follow-up.

Steps 5-7 are one logical operation. If one step fails after another succeeds, do not hide the partial state; follow `references/mcp-operations.md`.

## Comment Without Field Changes

1. Load `references/comment-templates.md`.
2. If the comment represents work performed, use the Update Ticket sequence so effort fields, comment, and worklog stay synchronized.
3. If the comment is informational only, include `Hours This Update: 0h` or an explicit "No work logged" line, and do not create a duplicate worklog.
4. Include sprint context when the ticket has sprint data.

## Log Work Only

Use the Update Ticket sequence with a brief effort comment and worklog. Do not create duplicate worklogs for the same time period or same work.

## Transition Status

1. Load `references/workflow.md` and `references/comment-templates.md`.
2. If the transition reflects work performed, run the Update Ticket sequence first.
3. Verify gate requirements for the target status.
4. Execute the transition with `transitionJiraIssue`.
5. Post a transition comment explaining who decided, when, and why.
6. For Done, ensure remaining effort is `0`; prompt for final hours if needed so completed equals estimated.

## Remediate Non-Compliant Ticket

When a ticket is missing required audit fields:

1. Load `references/field-map.md`, `references/estimation.md`, and `references/comment-templates.md`.
2. Populate missing required fields that are writable.
3. Add or correct effort estimate, completed effort, and remaining effort.
4. Add the current quarter label.
5. Post the Compliance Remediation comment.
6. Report any fields that could not be updated due to screen or permission constraints.

## Sprint And Burn Rate

Prefer live sprint data from `customfield_10006`. Use `references/sprint-schedule-2026.md` only as fallback.

When sprint data exists:

- Sprint day = `today - sprint_start + 1`
- Days remaining = `sprint_end - today`
- Sprint context format = `(Sprint [N]: Day [X] of 21)`
- Flag over-commitment when estimated remaining work exceeds remaining workdays times 8 hours.

In effort comments, flag:

| Condition | Meaning |
| --- | --- |
| `burn_pct > sprint_pct + 20` | Burning too fast |
| `burn_pct < sprint_pct - 20` | Behind pace |

## Quality Gates

Always:

- Load the relevant reference before live action.
- Use Jira MCP tools only through authorized context.
- Run screen validation before field writes.
- Keep estimated, completed, and remaining effort synchronized when writable.
- Use comment templates.
- Include sprint context when sprint data exists.
- Surface partial failures clearly.

Never:

- Claim a live Jira change without tool confirmation.
- Use markdown/plain strings for ADF-required fields.
- Update effort-bearing work without asking for or receiving hours.
- Freestyle audit comments.
- Transition without a comment.
- Close a ticket while remaining effort is greater than `0`.
- Mix non-Jira work into Jira ticket updates.
- Expose account IDs or internal field maps outside the authorized HUB context.
