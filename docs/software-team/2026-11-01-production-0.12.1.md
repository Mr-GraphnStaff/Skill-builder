# Production hotfix 0.12.1

David reported that production 0.12.0 blocks Upload & create PR with "Commit
contents differ from the reviewed release." On November 1 he explicitly directed
fixing the bug and publishing immediately to Marketplace. This is a bug-fix-only
update under the existing release freeze. Avery coordinates on Codex Windows;
Lena independently reviews QA and Morgan reviews integrity/security.

## Cause and bounded correction

A full local publication regression reproduced the exact error before the fix:
replacing a version moves an unchanged skill file, `git diff --cached --name-only`
detects a rename and reports its destination, while `git diff-tree --name-only`
reports the deletion and addition. The lists disagree despite the verified index
tree containing the reviewed bytes. Independent QA reproduced the Git behavior.
The original suite covered replacements and content changes but lacked this
unchanged-file-move case, allowing the mismatch through pre-release testing.
The exact user's repository has not been reproduced; this regression establishes
a concrete product defect matching the error, not complete user-case acceptance.

Use `--no-renames` for all four path-set comparisons, including base changes
pulled into a replacement. Inventory, blob, outside-path, index-tree and committed
tree guards remain. Regression cases cover Git rename settings true, false and
copies, both old/new paths, exact uploaded skill contents, unrelated files and
unchanged destination main. No skill data migration, version policy change or
automatic PR merge is introduced.

## Delivery evidence

The new regression failed before the fix and passed after it. The first focused
publication/reuse/execution-guard suite passed 11/11 tests. Production dependency
audit reported zero vulnerabilities. Full tests, independent final reviews,
exact-artifact qualification and publication verification are in progress.

Source changes stay on release `main`; pre-release remains at
`f293bf712e50f5d262a92fc5aabcf4f2d2bf0c0e`. Existing 0.12.0 recovery material and
stash remain preserved. The user's draft/repository/profile have not been edited
by this fix. Build/publish evidence will be appended after actual verification.
