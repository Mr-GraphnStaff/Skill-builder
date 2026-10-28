# SkillJetty testing and stable releases

Local UAT uses a separate repository and co-installable identity: **DavidFarris.skill-builder-beta**, displayed as **SkillJetty Beta — UAT**. Its commands, settings and .skilljetty-beta work tree are separate from production. The production repository and installed extension remain on the approved baseline. The local beta package must not overwrite that installation.

After local UAT approval, prepare a separately reviewed Marketplace pre-release artifact under the existing **DavidFarris.skill-builder** public identity and production command namespace. That promotion must explicitly reconcile the local UAT adapter with the public identity and verify the resulting artifact. Do not publish this local beta identity as a second public listing by assumption. Marketplace pre-release publication is not yet authorized or performed.

Prepare this human-workbench change as the 0.11.0 pre-release candidate. This document does not authorize publication. Future stable releases can use the even minor series (for example 0.12.x), with the following odd series for testing. Check existing published versions before assigning a release number; versions cannot be reused across channels. Existing 0.9.x releases predate this convention.

`npm run package:pre-release` builds the **local beta** VSIX with its pre-release flag at dist/skill-builder-beta-0.11.0.vsix. Numeric major.minor.patch is required; do not put a -beta suffix into package.json. Keep the reviewed VSIX, its digest, tests and installation verification together. This is local UAT preparation, not the public promotion artifact or permission to publish it.

Pre-release subscribers can receive a higher-numbered stable version and remain eligible for future higher-numbered pre-releases. Coordinate numbering instead of assuming channel isolation overrides version ordering.

See [Microsoft's pre-release extension documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions). Run local and installed-artifact checks before publication, then verify the listing and channel afterward. A pre-release label does not substitute for integrity checks or usable behavior.
