# INFOSEC Workflow And Status Management

## Status Workflow

```text
Created -> To Do -> In Progress -> In Review -> Testing -> Done
           |           |            |          |
        Blocked <------------------------------
           |
      Cancelled
```

## Transition Requirements

| Target status | Requirements |
| --- | --- |
| To Do | Assignee set, all required fields populated |
| In Progress | Work plan documented, effort initialized |
| In Review | PR/change link or document reference included |
| Testing | Review approval documented |
| Done | Remaining effort = 0, completed effort = estimated effort, final comment posted |
| Blocked | Blocker, owner, impact, and escalation path documented |
| Cancelled | Reason documented in a comment |

Every transition requires a comment with effort context. After any transition resulting from a meeting or decision, post who decided, when, and why. If work was performed, also post the worklog and effort sync.

## Stale Ticket Rules

Use `customfield_13731` / "Days since last comment" to check staleness.

| Condition | Classification | Action |
| --- | --- | --- |
| In Progress, no comment in 24h on a work day | STALE | Flag before proceeding |
| In Progress, no comment in 48h on work days | CRITICAL STALE | Address immediately or move to Blocked |

## Daily Activity Standard

Leadership expects daily comment activity on active In Progress tickets.

- Add at least one substantive comment per work day on each active ticket.
- Acceptable types: status update, blocker report, design decision, discovery note, completion milestone.
- If no progress occurred, document why.
- Never write only "still working on it".

## Common JQL Queries

### My Active Items

```sql
project = INFOSEC AND assignee = currentUser()
AND status not in (Done, Cancelled)
ORDER BY priority DESC, due ASC
```

### Current Sprint

```sql
project = INFOSEC AND sprint in openSprints()
AND assignee = currentUser()
ORDER BY priority DESC
```

### Missing Effort

```sql
project = INFOSEC AND "Effort Hours (Estimated)" is EMPTY
AND status != Cancelled
```

### Stale Tickets

```sql
project = INFOSEC AND status = "In Progress"
AND "Days since last comment" >= 1
```

### Critical Stale Tickets

```sql
project = INFOSEC AND status = "In Progress"
AND "Days since last comment" >= 2
```

### Weekly Effort Report

```sql
project = INFOSEC AND worklogAuthor = currentUser()
AND worklogDate >= startOfWeek()
```

### Sprint Burndown - Missing Effort

```sql
project = INFOSEC AND sprint in openSprints()
AND "Effort Hours (Estimated)" is EMPTY
AND status not in (Done, Cancelled)
```

### Overdue High Priority

```sql
project = INFOSEC AND priority in (Highest, High)
AND duedate < now() AND status != Done
```
