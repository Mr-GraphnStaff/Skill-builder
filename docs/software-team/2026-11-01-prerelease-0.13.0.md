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
actual installed state remains unknown until observed. Verification is in progress.
