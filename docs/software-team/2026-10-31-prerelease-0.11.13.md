# Per-skill Activity reset — pre-release bug fix 0.11.13

During testing, David supplied a history spanning two skills and growing to the
100-entry cap. He explicitly chose **each new skill, keeping its steps together**,
rather than resetting after every action. This is a bug fix under the existing
release freeze: bug fixes only, no new features. Production promotion remains a
separate lead decision, with no performance-log option in production.

Avery owns the controller/host reset and release; Mara owns UI scroll reset; Lena
independently reviews QA/accessibility; Ishan reviewed lifecycle boundaries.
Successful skill selection retains only that opening operation's real events,
renumbers them, and rebases its completion marker. Start another and changed work
folders reset history. Checks, packaging, submission, autosave, same-active draft
resumption, and canceled/failed openings retain the current workflow's history.
A workflow generation clears inherited reading offsets without disturbing reading
position across updates or rerenders within the same skill.

QA reproduced an initial same-active-resume reset and inherited scroll offset;
both were corrected before release. Targeted/integrated verification, exact
artifact review and publication are in progress. No data files or performance
log history are deleted by this change; only the in-memory Activity list resets.
