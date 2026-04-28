# WSR-now-config

Use this workflow to initialize or refresh per-caller settings.

## Config Fields

| Field | Purpose | Default |
|---|---|---|
| `display_name` | Caller's roster/display name | none |
| `input_directory` | Folder used for transcript and supporting file search | none |
| `oneplan_url` | End-of-workflow reminder destination | `https://my.oneplan.ai` |
| `wsr_employment_type` | FT or CTR | derive if possible, then persist |

Config is considered complete when `display_name`, `input_directory`, and `oneplan_url` are all populated.

## Workflow

1. Show any currently stored values.
2. Ask whether the caller wants to keep or change each value.
3. Collect missing values one at a time:
   - `display_name`
   - `input_directory`
   - `oneplan_url`
4. If employment type is not stored:
   - derive from roster if possible
   - otherwise derive from UPN pattern if available
   - otherwise leave unresolved and note it
5. Persist the values to memory.
6. Confirm the final stored config back to the caller.

## Input Directory Rules

- Most callers will use a OneDrive or SharePoint-backed folder.
- Accept a local path if that is what the caller uses.
- If the caller explicitly wants manual uploads only, allow an `upload` sentinel value.
- `upload` means skip automated directory search during `WSR-now` and fall back to manual prompt collection.
