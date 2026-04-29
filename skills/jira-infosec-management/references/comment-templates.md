# INFOSEC Comment Templates

Use these templates exactly. Do not freestyle audit comments. Every comment must include effort context. If no work is being logged, state `Hours This Update: 0h` or `No work logged`.

## Effort Initialization

Use on ticket creation.

```markdown
## Effort Initialization - [DATE] (Sprint [N]: Day [X] of 21)
Estimated Hours: [X]
Completed: 0
Remaining: [X]
Sprint: [Sprint Name] ([start] -> [end])
Days Remaining in Sprint: [Y]
```

## Effort Update

Use on every work-bearing update.

```markdown
## Effort Update - [DATE] (Sprint [N]: Day [X] of 21)
Hours Worked: [X]
Completed Total: [Y]
Remaining Hours: [Z]
Burn: [Y]/[estimated]h ([burn_pct]% effort / [sprint_pct]% sprint elapsed)
```

## Daily Progress Update

```markdown
## Progress Update - [DATE] (Sprint [N]: Day [X] of 21)
**Work Performed:** [Specific activities - what you actually did]
**Hours:** [X]h
**Burn:** [completed]/[estimated]h ([burn_pct]% effort / [sprint_pct]% sprint elapsed)
**Status:** [On track | Behind pace | Blocked | Ahead]
**Next:** [What happens tomorrow]
```

## Status Update

```markdown
## Status Update - [DATE] (Sprint [N]: Day [X] of 21)
**Current Status:** [Description]
**Work Completed:** [Specific items]
**Hours This Update:** [X]h or No work logged
**Total Hours:** [Y]
**Remaining:** [Z]
**Burn:** [Y]/[estimated]h ([burn_pct]% effort / [sprint_pct]% sprint elapsed)
**Next Steps:** [Actions required]
**Blockers:** [Issues] or "None"
```

## Compliance Remediation

```markdown
## Compliance Remediation - [DATE]
**Hours This Update:** [X]h or No work logged
**Missing Elements Fixed:**
- Added effort estimate: [X hours]
- Set remaining hours: [Y hours]
- Added quarter label: [YYYYQN]
- Populated required fields: [What, Why, How, Done, Impact]
- Set assignee: David Farris
**Status:** Ticket now meets INFOSEC audit standards
```

## Review Request

```markdown
## [Document Name] - Ready for Review
**Hours This Update:** [X]h or No work logged
**Confluence:** [link]
**Scope:** [Brief scope description]
**Policy Controls:** [Relevant SC controls]
**Companion Documents:** [Related ticket/doc references]
**Requesting Review From:** [ADF @mentions]
**Review Feedback By:** [DATE]
```

## Blocker Report

```markdown
## Blocker Report - [DATE]
**Hours This Update:** [X]h or No work logged
**Blocked By:** [Description of what's blocking]
**Owner:** [Who owns the blocker]
**Impact:** [What cannot proceed until resolved]
**Escalation:** [Path if not resolved by DATE]
```

## Ticket Description Template

Use as source content for ADF fields. Do not pass this markdown directly to create/edit calls.

```markdown
## What
[Specific description of what needs to be done or what is broken]
## Why
[Business justification - why this matters to HUB]
## How
[Step-by-step approach to resolution]
## Impact
[What happens if this is not done]
## Considerations
[Dependencies, blockers, constraints]
## Done
[Specific completion criteria]
## Effort Justification
[Basis for the hour estimate]
```

## Rules

- Every comment must include effort context.
- If work was performed, use the effort update sequence and create the matching worklog.
- If no work was performed, explicitly state `No work logged` or `Hours This Update: 0h`.
- Comments must be substantive; never write only "still working on it".
- If no meaningful progress occurred, document why: blocked, pulled to another priority, or waiting on dependency.
- Use the Effort Update template for the effort block, then add a Progress Update below it when substantive work was done.
- Sprint context is required when a sprint is assigned.
