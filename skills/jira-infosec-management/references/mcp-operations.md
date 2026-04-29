# Jira MCP Operations

Use this reference for tool availability, retries, and partial-failure handling.

## Required Tools

Live Jira changes require an authorized Jira MCP integration with the relevant tools available:

- `getJiraIssue`
- `createJiraIssue`
- `editJiraIssue`
- `addCommentToJiraIssue`
- `addWorklogToJiraIssue`
- `transitionJiraIssue`
- `getJiraIssueTypeMetaWithFields`

If a required tool is unavailable, stop before live mutation and provide a reviewable fallback such as JQL, an ADF payload, a comment draft, or a transition checklist.

## Retry Policy

Apply retry logic to Jira MCP calls that fail with:

- `429` rate limit responses
- `500` or `503` transient server errors
- network/transient transport errors

Do not retry deterministic failures such as `400` bad request, `401` unauthenticated, `403` unauthorized, or field validation errors. Fix the payload or surface the permission issue.

## Exponential Backoff With Jitter

Use up to four attempts total:

| Attempt | Delay before retry |
| --- | --- |
| 1 | none |
| 2 | 1.0-1.5 seconds |
| 3 | 2.0-2.5 seconds |
| 4 | 4.0-4.5 seconds |

If the final attempt fails, report the failed call, the error, the completed steps, the incomplete steps, and the manual recovery action.

## Partial Failure Reporting

For multi-step operations such as field sync + comment + worklog:

1. Execute calls sequentially.
2. Retry each eligible transient failure independently.
3. Do not roll back a successful comment or worklog unless Jira provides an explicit safe delete/update path and the user asks for it.
4. Report partial completion clearly.

Example:

```text
Updated effort fields and posted the progress comment. Worklog creation failed with 429 after retries. Manual fallback: log 2h 15m on INFOSEC-4090 with the same work description.
```
