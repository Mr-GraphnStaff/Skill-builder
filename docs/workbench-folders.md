# Your SkillJetty workbench

A workbench is one dedicated folder for SkillJetty by DAF-TECH to keep its local work. It gives you a place to inspect, back up and recover your skills without using an unrelated project repository.

This guide describes the next pre-release candidate. Local candidate testing and owner approval are required before Marketplace publication.

## Choose its home

1. Open SkillJetty and choose **Create workbench**.
2. Choose a parent folder dedicated to your skill work. Review the exact `.skilljetty-prerelease` child folder before creation.
3. Confirm creation. SkillJetty creates its folders and a `README.md` explaining them. It does not move existing files, clone a repository or upload anything.
4. Create a skill or import a copy of an existing skill/package. Repository setup can wait until you want to share.

Use **Open existing workbench** to select a workbench SkillJetty already created. An ordinary project folder or old work folder is not silently adopted. Existing work stays where it is; import individual skills or packages deliberately.

## Understand the folders

The folder shown as **Workbench folder — local write boundary** is the root for the following paths:

| Folder | What belongs here | What you do with it |
|---|---|---|
| `skills/` | Editable skill drafts, including instructions and supporting files | Create and edit skills in the workbench. Imports become copies here. |
| `repositories/` | Local Git copies of explicitly connected sharing repositories | Keep the connected local repository here. Review its exact folder and remote address before Pull or upload. |
| `releases/` | Saved version packages, source snapshots and release notes | Use these packages for manual sharing or continue from a saved version. Preparing one does not upload it. |
| `scratch/` | Temporary import and isolated Git preparation files | Leave this for SkillJetty; do not put your only copy of a file here. |
| `recovery/` | Earlier edits, completed draft archives and recovery copies | Keep it with your workbench. Inspect recovery evidence before deleting files. |
| `logs/` | Local performance diagnostics | Use these when investigating a problem. These records are separate from skill packages. |
| `.skill-workbench/` | Internal catalog, saved connection and operation receipts | Keep it with the workbench; do not edit it to change destinations. |

The root also contains `README.md` and the `.skilljetty-workbench.json` setup marker. Preserve both. The marker identifies a deliberately initialized workbench; a folder name alone is insufficient.

## Connect local and remote work

**Workbench → local repository → remote repository** is an explicit connection. It is independent of whichever project happens to be open in VS Code.

Use the Configuration gear to review the pre-release repository URL and local repository path. This preview supports GitHub HTTPS URLs such as `https://github.com/your-org/skills.git` with VS Code GitHub sign-in. SSH addresses, local paths and file URLs are unavailable as remote destinations. The local repository’s default location is `repositories/skills/` inside the workbench. A local repository elsewhere must not be used as a write destination. Keep your original repository intact and make a deliberate clone inside the workbench using the configured remote and the Pull action.

Configuration shows four distinct things:

- **Workbench folder:** where SkillJetty keeps local work.
- **Local repository:** the Git copy inside `repositories/`.
- **Remote repository:** the explicit server address used for sharing.
- **Target branch:** the remote’s default branch, detected when the connection is verified. A version upload uses its own submission branch before review and merge.

Saving Settings changes a choice; it does not clone, pull or upload. Use **SkillJetty: Verify Skills Repository** to check the connection. Use **SkillJetty: Pull Skills Repository** when you deliberately want to populate or update the local Git copy. Before uploading, review the submission summary’s destination and changes.

## Work elsewhere without redirecting writes

You can choose a skill folder or package elsewhere to import it. SkillJetty reads that source and creates a local draft copy; subsequent editing uses the workbench copy. Opening another VS Code project does not authorize SkillJetty to modify its repository.

SkillJetty rejects write destinations outside the selected workbench, including AI-tool install folders outside it and paths redirected by links or junctions. A configured remote is a separate, explicit sharing destination. This boundary governs SkillJetty’s own work; other editors and tools retain their own permissions.

To switch workbenches, save your current draft and close its workbench panel. Reopen SkillJetty, then use **Open existing workbench** in the folder guide. Existing workbenches stay in place. Back up the whole workbench to preserve drafts, saved versions, receipts and recovery records together.
