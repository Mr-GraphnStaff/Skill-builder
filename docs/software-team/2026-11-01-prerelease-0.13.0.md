# Pre-release 0.13.0 channel-switch repair

David explicitly authorized fixing and publishing the missing pre-release channel
switch on November 1. Avery owns release sequencing and the earlier inaccurate
completion claims. Lena independently reviews channel behavior and QA; Morgan
reviews source and exact-artifact integrity. Freeze: bug fixes only.

Stable 0.12.1 exceeded preview 0.11.13. VS Code's gallery derives
hasPreReleaseVersion from the latest raw version's pre-release flag, and its switch
action hides when that availability is false. An older preview's presence in
history did not prove discoverable switching. Neither previous release acceptance
nor the completion reports covered that requirement.

Publish preview 0.13.0 from codex/public-prerelease via pipeline 12, preserving
stable main and production 0.12.1. Carry exactly the already-reviewed publisher
path-comparison fix and its three regression cases from stable, leaving preview
isolation and UI intact. Update current README/banner references. No migration,
user profile mutation or new feature is authorized by this repair.

Acceptance requires final CI, independent exact artifact review, preview flag,
public installed-payload readback and latest-preview/stable channel eligibility.
Do not claim either home or work PC refreshed from catalog evidence alone. Their
actual installed state remains unknown until observed. Final verification is
recorded below.

## Verified build and artifact

Pipeline 12/build 976 used source
`c750ff6e63ba4e5a38ae2c713c4906454b0051e3` on the dedicated preview branch.
CI passed **328/328 tests, zero failures/skips**, audits and packaging. The exact
733133-byte artifact has SHA-256
`033d20ad4be552c270d289b8b71e67fb6165f83bef1f6658966fcaad736453d5`.
Morgan independently verified public identity, true preview flag, source/build
binding, payload parity, preview isolation and all integrity guards. Lena verified
CI/artifact and exact-installed-payload native receipts. All 174 installed files
match the artifact. Native VS Code Extension Host passed create/import/check/
package, diagnostics/Activity behavior, unchanged nine protected sentinels and
inventories, moved-file publication to a disposable Git remote, and blocked
modified files/unreviewed index changes. The native host exited zero. No human
GUI, screen-reader, live SSO or exact home/work PC observation is claimed.

The existing preview approval was approved under David's explicit November 1
instruction; no approval configuration or approver changed. The package uploaded
once at 19:40:54 UTC. The original Publish task failed its bounded catalog wait
at 19:46:05 UTC; that result remains recorded and is not called an all-green run.
Independent combined public readback passed at 19:48:49 UTC: latest preview
0.13.0 validated with true preview flag, stable 0.12.1 retained and unflagged,
exact ZIP SHA-256 and installed payload matching the reviewed build. Receipt:
`dist/azure-prerelease-976/final-public-verification.json`.

Lena's independent bidirectional channel acceptance passed at 19:49:03 UTC using
the actual pinned VS Code gallery helpers and toggle-action update method against
fresh catalog data. Stable fixture enabled "Switch to Pre-Release Version";
preview fixture enabled "Switch to Release Version". The same method reproduced
the missing stable-to-preview action before publication. Receipts/source hashes
are in `dist/channel-switch-qa/before.json` and `after.json`. This establishes
catalog/action eligibility; neither home nor work GUI was observed. No repeat
upload was performed. The channel repair is delivered within those stated limits.

## User documentation

David separately required a real maintained GitHub wiki. Ishan enabled only the
repository's wiki setting, initialized its separate wiki history, and published
Home, Getting Started, Release Channels, Troubleshooting, Release Notes and the
Maintainer Update Procedure with sidebar/footer. The initial content was verified
at wiki commit `ace8716a197725c5f1af51741889d48bcfd80d84`; source-attribution
correction `fb780bf882918f793c4bb41db082205bd0e63078` distinguishes published
stable source `8c7682dd` from its documentation receipt `95c7c81`. Preview is
explicitly pending until verified. Delivered status was then published at wiki
commit `c0330dfcc0ff5021dff12cdd3106e2d468071b44`, including verified public
versions and scoped bidirectional VS Code action evidence. Both source channels and the workspace root
now require current wiki pages before delivery is declared complete. Stable
documentation-only commit `13b9550` corrects its README version and adds wiki links
and maintenance rules; production runtime/package remain 0.12.1 unchanged.

Wiki: https://github.com/Mr-GraphnStaff/Skill-builder/wiki

## Category follow-up

David reported misleading Other/Machine Learning/Education categories. Current
official VS Code `EXTENSION_CATEGORIES` includes AI (the prose manifest reference
still omits it). Both source manifests now specify only AI for future packaging.
This source-only metadata correction is subsequent to the reviewed 0.13.0 build;
it does not alter the published artifact or claim the live category changed.
Ishan reached authenticated publisher owner controls and verified that Update
opens a VSIX-upload form without a category-only editor. No upload or category
mutation was performed. Proof: ignored
`dist/wiki-delivery-0130/marketplace-update-requires-vsix.png`. Live category
correction therefore awaits a separately authorized package update; the wiki
records the source-only preparation. No further package upload was performed.
