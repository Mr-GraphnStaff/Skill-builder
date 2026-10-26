# Create, edit and publish a skill

Open **SkillJetty** using its left sidebar icon or the single **SkillJetty: Open Workbench** command. Stay in the workbench and follow the highlighted Next step button.

## Start

Open a local folder for your drafts and version history. You can create, open, edit and check skills locally before connecting a repository. Connect the publication destination when you are ready to publish: use **Find my repositories**, enter a repository URL, or create a new repository using the inline form. Creation requires an explicit name and visibility choice; private is the default. No skill is uploaded during connection.

The workbench detects the repository's existing default branch automatically. You do not enter a branch name. A single unambiguous repository from old local records can be migrated; conflicting old destinations require choosing one connection.

Choose **Create a new skill**, **Open a .skill file**, **Open a skill folder**, or a saved draft's **Resume** button. A `.skill` file is a packaged skill; a skill folder must contain SKILL.md. A library version can be restored for next-version editing without changing the released snapshot.

## Edit

A new skill needs a lowercase hyphenated name, a description of what it does and when to use it, and useful instructions. Generated YAML wraps your instructions; there is no automatic AI authoring or model run.

The file list shows every supported nested file. Select text files to edit them in the workbench. Binary assets remain intact. Add or copy a supporting file using the labeled path field; existing files are not silently replaced. Reference supporting material from the instructions where appropriate.

Edits save locally after a short pause and before moving to the next step. The save indicator reports success or an error. If a file changed in another editor, the newer disk copy is retained and your conflicting buffer is saved under `.skill-workbench/recovery/`. Use **Reload saved file** after preserving/reviewing that recovery copy. No conflicting edit is silently substituted for another skill's file.

Select a compatibility target if helpful. Portable is the default. This changes guidance, not the skill's contents, and does not install or run the skill.

Choose **Check and continue**.

## Check

Review structural errors and warnings. Errors link back to the relevant file where possible. Choose the highlighted fix action, edit, and check again. When the check passes, continue to Publish.

Checking is local and does not upload your skill. A static check does not establish tool availability, script safety, skill triggering, model behavior or successful installation in a particular application. Run realistic prompts in the intended application before deciding the skill is ready for others.

## Publish

Connect a repository if needed, then review the destination, suggested version and contents. Enter change notes, including for `1.0.0`. If an identical unpublished release was already prepared, its version and immutable notes can be reused; changed source or notes require a new version.

**Publish version** is the explicit upload action. The workbench checks the repository's current default branch, validates the source, packages and reopens the archive, verifies its bytes, and prepares an isolated destination checkout. It uploads only the version folder and verifies the remote commit.

The repository receives `<skill>/<version>/source/<skill>/**`, the versioned `.skill`, `CHANGELOG.md` and `release.json`. An originally imported package is retained as `original.skill`. Scratch-created skills do not invent an original archive. Empty directories survive in the archive and manifest, although Git cannot represent them in the exploded tree.

## Done

The completion screen links to source, package and changelog on the recorded review branch. Follow the review link to finish your repository's normal merge process. Uploaded means available on that branch; it does not establish that the default branch has been updated.

After a verified upload and persisted receipt, an unchanged draft leaves active work and is archived recoverably. Later local changes remain active and the completion screen explains that outcome. Start another skill without deleting your history.

## Recovery

| What happened | Next action |
|---|---|
| File picker canceled | Continue editing; no upload happened. |
| Structural check failed | Use the indicated file/fix action, then check again. |
| Repository could not be accessed | Reconnect from the workbench after checking your normal Git access. |
| Old saved branch is invalid | Reconnect; the workbench detects the default branch automatically. |
| Git timed out | Draft and prepared release remain safe. Check connectivity and retry. |
| Version is already prepared with different contents or notes | Choose a new version. Old release bytes remain unchanged. |
| Upload succeeded but local completion failed | Use the receipt. Retrying the same recorded version rechecks the remote commit before attempting only local completion. |
| Another editor changed the file | Both versions are preserved; inspect the recovery record, then reload the saved file. |
| Historical version is corrupt | Drafts remain available. Recover that version from a known good copy before restoring it. |

Keep `skills/`, `releases/`, `workbench/` and `.skill-workbench/` with the local workspace. The shared repository contains published version bundles; each teammate uses their own workspace and Git identity. The workbench is not a remote task board, automatic merge tracker or universal model-runtime tester.
