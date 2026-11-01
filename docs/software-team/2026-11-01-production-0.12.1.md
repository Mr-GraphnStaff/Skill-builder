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
publication/reuse/execution-guard suite passed 11/11 tests; Lena's independent
focused suites passed 22/22. Final production pipeline 11/build 975 passed
**335/335 tests, zero failures/skips**, audits and packaging from main source
`8c7682ddbeeab7a23d16f03c9c21f745e6ab3ecc`. A local full run started before the
version-expectation correction passed 332, failed that one stale expectation and
skipped two unsupported local cases; final CI used the corrected expectation and
executed every test. No all-green local full-run claim is made.

Exact CI artifact `skill-builder-0.12.1.vsix` is 735201 bytes, SHA-256
`0d689e85083aa0f0be5d8d94058395d9f904b50392b2af1c08d3c167f2a119a2`.
Morgan independently verified stable identity, source/build binding, exclusions,
icon and compiled payload. The only runtime change from reviewed build 974 is
`repository-publisher.js`, with the four canonical-path options. Diagnostics and
all remaining runtime files retain the reviewed behavior.

The exact artifact was normally installed into isolated
`dist/native-smoke-ci-0121`, with all 176 installed extension files verified.
Native VS Code Extension Host smoke passed create/import/check/package, per-skill
Activity, diagnostics visibility, and unchanged nine protected sentinel files and
inventories. The installed publisher successfully committed and pushed the
unchanged-file move to a disposable local bare Git remote, rejected edited files
and unexpected staged paths, and preserved that remote's main branch. The native
host exited zero. Lena independently reviewed these receipts and found no
unresolved publication blocker. Human GUI, screen-reader and live GitHub/SSO
acceptance and the user's exact live repository retry remain unverified.

The existing build 975 protected approval was approved under David's explicit
publication instruction without changing its gate or approvers. The task confirmed
one successful upload at 2026-11-01 17:56:11 UTC, then failed its bounded catalog
wait at 17:58:07 UTC. That original pipeline result remains failed; it is not
represented as an all-green publish run. Independent public download readback
matches the reviewed artifact's exact ZIP hash and installed payload. Independent
catalog verification passed at 18:03:28 UTC, and final combined public package and
catalog verification passed at 18:03:38 UTC: stable 0.12.1 is latest, validation
flag 1, no rejection message and no true pre-release property. The receipt is
`dist/azure-prod-975/final-public-verification.json`; publication logs are in
`dist/azure-975-publication.json`. No repeated upload was performed. Production
delivery is complete; the user's actual repository retry remains acceptance to
perform after updating/reloading. Listing:
https://marketplace.visualstudio.com/items?itemName=DavidFarris.skill-builder

Source changes stay on release `main`; pre-release remains at
`f293bf712e50f5d262a92fc5aabcf4f2d2bf0c0e`. Existing 0.12.0 recovery material and
stash remain preserved. The user's draft/repository/profile have not been edited
by this fix. The subsequent documentation-only main receipt does not change the
artifact's source binding to `8c7682dd`. The freeze remains bug fixes only.
