# WSR-now Workflow

Use this file for the create-or-update weekly report workflow.

## Default Sequence

Run the workflow in this order:

1. prerequisite check
2. week confirmation
3. page existence check
4. route A or route B
5. caller-scoped data gathering
6. caller draft review
7. publish
8. confirmation and follow-up

## 1. Prerequisite Check

Run both checks before doing anything else.

### 1a. Caller config

Check whether `display_name`, `input_directory`, and `oneplan_url` are already set.

- If any are missing, run [wsr-now-config.md](wsr-now-config.md) first.
- Resume `WSR-now` after config is complete.

### 1b. Atlassian connectivity

Verify read access by fetching the template page `21712240641`.

- If the fetch succeeds, continue.
- If the fetch fails, stop and tell the caller the Atlassian connection is not usable enough for this workflow.
- Do not collect a full interview if the page cannot eventually be written.

## 2. Week Confirmation

Use this rule:

- If today is Monday and the caller's local time is before 17:00, target the prior Monday-Sunday week.
- Otherwise target the current Monday-Sunday week.

Always show the computed week and ask the caller to confirm it.
If the caller chooses a different week, recalculate and confirm again before moving on.

Use the confirmed week everywhere downstream:

- page title
- calendar range
- Jira comment window
- transcript scan range

## 3. Page Existence Check

Search for:

`SecArch Status Report Week [N] [YEAR]`

Then follow one of two routes.

## 4. Route A: Page Does Not Exist

This is the first contributor for the week.

### Route A actions

1. Read [template-and-adf-rules.md](template-and-adf-rules.md).
2. Create the page in SA space `19169738778` under parent `21710110734`.
3. Use the canonical section order and fixed rows from the template rules.
4. Populate only the caller's rows.
5. Leave all non-caller rows as placeholders or template skeleton.
6. Add sprint context if available from [sprint-schedule-2026.md](sprint-schedule-2026.md).
7. Show the caller a draft of only their sections before publishing.
8. Publish only after explicit confirmation.
9. Update the index page after successful publish.
10. Remind the caller to apply page restrictions manually.

## 5. Route B: Page Already Exists

Do not recreate the page.

### Route B actions

1. Fetch the existing week page in ADF and record its version number.
2. Identify the caller's current rows by matching mention-node account IDs in the resources column.
3. Fetch the prior week's page.
4. Identify the caller's prior-week rows.
5. Build carry-forward candidates from prior-week items not already represented this week.
6. Ask the caller which items continue and what needs updating.
7. Show a draft containing only the caller's sections.
8. Re-fetch the current page before publish to reduce the version-conflict window.
9. Patch only the caller's rows and preserve all non-caller rows exactly.
10. Retry version conflicts up to three times by re-fetching and re-applying the caller patch set.

## 6. Caller-Scoped Data Gathering

Collect only caller-relevant data.

### 6a. Calendar

Pull meetings for the confirmed Monday-Sunday range.

Filter out:

- training reminders
- declined events
- personal appointments

Keep work-relevant meetings only.

### 6b. Jira

Use the caller account ID. Separate the work into tiers.

Step 1:

- query INFOSEC issues assigned to the caller that are not done/closed/resolved

Step 2:

- fetch comments for each issue
- keep only comments authored by the caller during the confirmed week

Step 3:

- Tier 1 active: at least one caller-authored comment this week
- Tier 2 stale: still open, but no caller-authored comments this week
- Tier 3 done/no activity: skip

Do not use broad issue-update timestamps as the primary signal for activity.

### 6c. Transcript and input-directory scan

Use the caller's configured `input_directory`.

- If the value is `upload`, skip the automated scan and later ask for manual uploads or pasted notes.
- Otherwise search for transcript files matching the caller's meeting names and target week.
- Accept `.txt`, `.md`, and `.html`.
- Extract completed work, blockers, decisions, and actions for later section placement.

## 7. Drafting and Publishing

Before any write:

1. build a draft for the caller's rows only
2. show the draft
3. loop on corrections until the caller explicitly approves publish

When writing:

- patch only caller-owned rows
- preserve row labels and resource mentions unless the workflow explicitly requires otherwise
- preserve all non-caller rows exactly

## 8. Follow-up

After publish:

- confirm the page link
- remind about manual restrictions if it was a new page
- give the caller the OnePlan reminder using their configured `oneplan_url`
