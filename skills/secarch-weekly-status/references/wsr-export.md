# WSR-export Workflow

Use this file to export a completed Confluence WSR page to the Word format expected by Jeff Jaynes.

## Purpose

- Export only from an existing Confluence WSR page.
- Never modify the Confluence page during export.
- Always use the bundled template asset: `assets/WSR_Template_Blank.docx`.
- Do not bundle or rely on custom Python scripts inside this skill package.
- Use Anthropic's public `docx` skill/runtime for document editing operations.

## Week Selection

Use the same Monday-before-17:00 rule as `WSR-now`:

- Monday before 17:00 local time -> prior week
- otherwise -> current week

Always confirm the target week with the caller before proceeding.

## Workflow

1. Confirm the week.
2. Search for the weekly Confluence page.
3. If the page does not exist, stop.
4. Read [template-and-adf-rules.md](template-and-adf-rules.md).
5. Parse the page in ADF and extract the six canonical sections.
6. Resolve Resource Review values from the roster and page content.
7. Use Anthropic's public `docx` skill/runtime to populate the bundled Word template.
8. Save the output file with the canonical filename.
9. Verify the output opens cleanly and retains the expected tables, headers, merged cells, and branding.
10. Deliver the file only if validation passes.

## Section Extraction

Extract these sections in order:

- `👥 RESOURCE REVIEW`
- `🧑‍💼 HIRING REVIEW`
- `📌 SIDEBAR`
- `🚀 MAJOR EFFORTS`
- `🔧 MAJOR EFFORTS - IMPROVEMENTS`
- `⚙️ MAJOR EFFORTS - OPS/MISC`

For each row extract:

- row label
- resources display text from mention nodes
- plain-text description

Treat a description cell containing only the red italic placeholder as empty.

## Template Handling Rules

- Do not rebuild the document from scratch.
- Start from `assets/WSR_Template_Blank.docx`.
- Prefer the public `docx` skill's document-editing path rather than shipping custom XML surgery code in this skill.
- Preserve the original namespace declarations and document root behavior.
- Do not touch merged section-label cells in column 0.
- Preserve existing run formatting where practical when replacing text.

## Canonical Filename

Use:

`InfoSec Status Report - Week [N] - [MM.DD.YYYY] - SecArch.docx`

The date is the Monday of the confirmed target week.

## Validation Requirement

Do not deliver a file until validation passes.

Validation here is behavioral rather than packaged-code-based:

- the output file opens without a repair prompt
- the expected seven tables are present
- branding and footer remain intact
- merged section-label cells remain intact
- placeholder-only descriptions are blank, not literal placeholder text
