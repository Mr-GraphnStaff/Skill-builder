# A workbench that handles the bookkeeping

SkillJetty's default workflow is to open or create a skill, improve its instructions, check the files, and review what will be shared. People should not need to choose a version number or invent a changelog to complete that journey.

The editor identifies the working skill and shows a declared source version when available. The sharing screen shows the release number separately, explains where it came from, and summarizes added, changed and removed files. File comparisons describe bytes; they do not claim a behavioral improvement or an AI test.

Release numbering is automatic by default. The Advanced disclosure retains an optional override for people who need a particular number. An empty override leaves numbering to the workbench. Personal context and testing notes are optional; automatic notes cover the file changes.

Earlier saved edits can be restored from the editor. The current saved content is retained before restoring older content. Imported packages and completed releases remain preserved independently of the editable draft.

Repository uploads remain explicit. Uploading to GitHub can create a pull request; choosing a reviewer requests review and notifies that person. These actions do not imply approval or merge. Local editing does not require a repository connection or an AI service.

Getting an installable package also does not require a repository. Save package on this computer prepares a checked local release with its source and notes, then offers a Show package in folder action. The editable draft stays available. A connected workspace offers the same local option alongside its explicit upload action; choosing it sends no review request.

This design removes bookkeeping decisions, provides understandable change information, and makes mistakes recoverable. It does not establish that the skill itself works better: that still requires trying it in its intended environment and examining the actual result.
