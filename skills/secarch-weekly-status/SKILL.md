---
name: secarch-weekly-status
description: Manage HUB Security Architecture weekly status reports in Confluence and Word. Use for `WSR-now`, `WSR-now-config`, `WSR-export`, or requests to create, update, or export the weekly report.
compatibility: Requires tool access for Atlassian/Confluence, Jira, Outlook or M365 calendar, SharePoint or OneDrive file search, file download/upload handling, and Anthropic's public docx skill for Word export work. Do not bundle custom Python in this skill package.
---

# SecArch Weekly Status

Use this skill for the HUB International Security Architecture weekly status workflow.
It covers three entry points:

- `WSR-now`: create or update the current week's Confluence report for the caller
- `WSR-now-config`: set or refresh the caller's local configuration
- `WSR-export`: export a completed Confluence weekly report to the bundled Word template

This skill is deliberately split across shallow reference files. Read only the files needed for the active workflow.

## Read This First

Always load [references/environment.md](references/environment.md) before doing any write or export work. It contains:

- production space and page IDs
- roster account IDs
- authorized editors
- hard safety rules for page location and ownership

Then load the workflow reference that matches the request:

- [references/wsr-now.md](references/wsr-now.md) for `WSR-now`
- [references/wsr-now-config.md](references/wsr-now-config.md) for `WSR-now-config`
- [references/wsr-export.md](references/wsr-export.md) for `WSR-export`

Load these supporting references only when needed:

- [references/sprint-schedule-2026.md](references/sprint-schedule-2026.md) when you need sprint context
- [references/template-and-adf-rules.md](references/template-and-adf-rules.md) when you are creating or patching the Confluence page structure or exporting the Word file

## Triggering Guidance

Trigger when the user:

- explicitly says `WSR-now`, `WSR-now-config`, or `WSR-export`
- asks to create or update the SecArch weekly status report
- asks to re-run their WSR setup/configuration
- asks to export the Confluence weekly report to the Jeff Jaynes Word format

Do not trigger for unrelated generic status reports, unrelated Confluence pages, or arbitrary Word export tasks.

## Operating Rules

- Treat `WSR-now`, `WSR-now-config`, and `WSR-export` as the default commands. Natural-language equivalents also count.
- Weekly pages must live only in the SA production space. Never write WSR pages to the personal space.
- Only generate or modify the caller's own rows. Preserve all non-caller rows exactly.
- Always confirm the target week before continuing.
- Match ownership using Confluence/Jira account IDs and mention nodes, not display-name string matching.
- Use the bundled Word template in `assets/WSR_Template_Blank.docx` for every export run.
- Do not ship or invoke bundled Python from this custom skill package.
- For `WSR-export`, rely on Anthropic's public `docx` skill/runtime for `.docx` editing and validation behavior.

## Output Expectations

For `WSR-now`:

- either create the weekly page or patch only the caller's sections
- show the caller a draft before publishing
- confirm the final page link

For `WSR-now-config`:

- show current values if known
- collect and persist `display_name`, `input_directory`, and `oneplan_url`
- derive and persist employment type if possible

For `WSR-export`:

- pull the confirmed week from Confluence
- populate the bundled Word template through Anthropic's public `docx` capability
- verify the resulting `.docx` opens cleanly and preserves the expected structure
- deliver the file as a download

## Examples

- `WSR-now`
- `WSR-now-config`
- `WSR-export`
- `Create my SecArch weekly status report for this week`
- `Export Week 15 to the Jeff Jaynes Word template`
