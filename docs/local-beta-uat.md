# Local beta and production

Production and beta are independent local Git checkouts and co-installable VS Code extensions. Keep production source clean and do all development and UAT in beta. Both appear in the same normal VS Code installation; a separate test profile is not the user's UAT handoff.

| Purpose | Local checkout | Extension identity | Command | Default data |
|---|---|---|---|---|
| Production baseline | `P:\codefolder\SkillJetty-production` | `DavidFarris.skill-builder` 0.9.0 | `SkillJetty: Open Workbench` | Existing production location |
| Local beta / UAT | `P:\codefolder\SkillJetty-beta` | `DavidFarris.skill-builder-beta` 0.11.0 | `SkillJetty Beta: Open Workbench` | `.skilljetty-beta` beneath the selected workspace |

The production checkout is commit 38b20a9ebdbe801306482f016fe50a2cbbfb5c1a; its local push URL is disabled. It was not used as a development tree. Restoring the prior production installation was built from a Git archive in a separate temporary build directory. Original incomplete workspace and recovery checkout remain preserved.

Beta commands, view IDs and settings use the separate skillJettyBeta namespace. Explicit workspace selection is also routed into beta storage. Existing production drafts, original packages, repository connections and releases must not be automatically read, migrated or saved by beta. A user-selected skill import is copied into beta storage; it does not authorize modifying the original.

## What to test

Reload VS Code after installation, choose **SkillJetty Beta: Open Workbench**, and confirm the Beta / UAT banner. Use beta for all UAT:

1. Import the supplied skill and confirm its declared identity and version.
2. Make and save an edit; check the skill and review automatically detected file changes.
3. Save a local package without entering a release number, writing mandatory notes or connecting GitHub.
4. Continue improving; refresh Earlier edits and restore previous text. Replaced content must remain recoverable.
5. Re-save identical work and then changed work. Identical work should reuse its preserved release; changed work should receive a managed new number.
6. Confirm the production extension still exists and its original working data is unchanged.

This UAT does not authorize repository uploads, reviewer notifications or Marketplace publication. Record failures and usability friction before promotion.

## After UAT

When the lead accepts UAT, prepare the approved changes for Marketplace pre-release publication. The local side-by-side beta identity is a UAT adapter; it does not silently decide to create a second public listing. Public prerelease packaging must use the deliberately selected Marketplace identity, be independently verified, and receive publication authorization. Do not install a same-identity public prerelease over the protected local production installation as a testing shortcut.
