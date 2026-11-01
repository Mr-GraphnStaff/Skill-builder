# Pre-release 0.13.1: native settings and compact workbench

David explicitly requested finishing the wiki first, then implementing and
publishing all configuration through the gear as a pre-release on November 1.
This is a bounded exception to the feature freeze; production stays unchanged.
Avery coordinates on Codex Windows. Ishan owns core settings/destination binding;
Mara the read-only display; Lena independent QA/accessibility; Morgan security.

## Wiki completed before app changes

The expanded guide was published at wiki commit `a29d1855159b4622140af3a944df235c8a172afc`.
GitHub's Mermaid renderer left blank frames during verification, so six static
PNG diagrams were added with editable Mermaid and text alternatives. Lena viewed
all six, found one label overlap, and rechecked its correction. Final wiki commit
`7648b87be58cefbb35d545307f8af3c6da31d781` was published and all six image loads
verified in GitHub. The guide defines terms, contrasts work folder/local Git repo/
remote, explains all four existing gear-settings fields, shows exact folder trees
and optional Ctrl+Shift+P steps. No app source changed until that completion.

## Authorized implementation

Native settings own setup; the workbench shows actual work folder, desired local
repository and remote, verification and a fixed gear to open Settings. Repository
operations remain explicit commands, not automatic effects of saving settings.
New repository keys are preview-specific, preserving channel separation. Existing
preview associations can be prefilled into unset Workspace keys before an operation;
explicit choices and User/Global settings are never overwritten. Existing records
remain recoverable. Empty repository address disconnects new sharing; empty local
path disables reuse while preserving remote-only upload.

Invalid explicit choices cannot fall back to uploading to an older saved remote.
Configuration generations invalidate operations synchronously; final Git/GitHub
mutation boundaries check the captured destination. Work-folder changes preserve
the active draft until reopen. Palette operations capture current in-panel edits;
opening the fixed Settings target bypasses busy queues without editing the draft.

The prior AI category source preparation is included in this candidate. Source
version is 0.13.1, greater than stable 0.12.1 and preview 0.13.0. Build, independent
final reviews, native installed-artifact checks, public readback and final wiki
updates are still in progress; no completed new publication is claimed here.
