# Template and ADF Rules

Use this file when creating the Confluence page structure or exporting the Word document.

## Canonical Section Order

1. header metadata table
2. `👥 RESOURCE REVIEW`
3. `🧑‍💼 HIRING REVIEW`
4. `📌 SIDEBAR`
5. `🚀 MAJOR EFFORTS`
6. `🔧 MAJOR EFFORTS - IMPROVEMENTS`
7. `⚙️ MAJOR EFFORTS - OPS/MISC`

## ADF Ownership Rules

- Identify caller-owned rows by account ID in mention nodes within the resources column.
- Never rely on display-name string matching alone.
- Non-caller rows must be preserved exactly as fetched.
- Use wide layout for content tables and default layout for the header metadata table.

## Fixed Content Expectations

### Header metadata

Four-column grid:

- `Week`
- week number
- `Date`
- Monday date of the target week

Second row:

- `Report Completed By`
- `Jeff Jaynes, Director - Security Architecture`
- `Report Provided To`
- `Security Dept Directors`

### Major Efforts fixed rows

- Major Security Initiative
- Cloud Security
- AppSec | AI Security | Network refresh/seg | AppSec

### Improvements fixed rows

- Policies/standards/patterns
- Sprint Planning

Ad-hoc improvement rows may be added below Sprint Planning when needed.

### Ops/Misc fixed rows

- ISARs
- M&A Activities
- New Articles
- 2026 Penetration Testing
- AppSec Review
- Vuln Management

## Word Template Table Map

| Table | Section |
|---|---|
| 0 | Metadata |
| 1 | Resource Review |
| 2 | Hiring Review |
| 3 | Sidebar |
| 4 | Major Efforts |
| 5 | Major Efforts - Improvements |
| 6 | Major Efforts - Ops/Misc |

## Resource Review Export Rules

- Fill rows 2-11 with roster data.
- Leave row 0 header and row 1 placeholder untouched.
- Leave spare rows empty.
- Resolve employment from roster first, then fallback heuristics if necessary.

## Placeholder Handling

- In Confluence, placeholder text may remain red italic.
- In exported Word output, placeholder-only descriptions must become blank cells, not literal placeholder text.

## Mention Example

```json
{ "type": "mention", "attrs": { "id": "[accountId]", "text": "@[DisplayName]" } }
```

## Placeholder Example

```json
{ "type": "text", "text": "[Description]", "marks": [{ "type": "em" }, { "type": "textColor", "attrs": { "color": "#bf2600" } }] }
```
