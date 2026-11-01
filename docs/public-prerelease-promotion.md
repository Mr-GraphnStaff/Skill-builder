# Public preview identity and data boundaries

This branch prepares version 0.11.4 as a public pre-release of the existing
`DavidFarris.skill-builder` extension. It retains the stable listing name,
description, icon, and `skillBuilder` command, view and configuration namespace.
The workbench descriptor identifies the preview and version. The local UAT
extension `DavidFarris.skill-builder-beta` is preserved as a separate artifact.

Public preview and stable versions share a Marketplace identity and alternate
within a VS Code profile. The preview deliberately stores its drafts, recovery,
packages and repository connection beneath `.skilljetty-prerelease`; no stable or
local-beta work is automatically imported. A selected existing control directory
or its descendant routes to a sibling preview root. Relative skills/export directory settings may
select descendants of that root. Absolute, empty, root-equal or escaping inherited
overrides use `skills` or `dist` inside it. Existing symbolic links and junctions
in the selected root or data-directory path are rejected, including a linked
default directory; they are not followed into stable data. Repository memory uses
`skillBuilder.prerelease.defaultRepository`, rather than the stable preference.
Explicit skill imports copy work through existing guards. Explicit repository
upload and Claude Code sync retain their existing user-directed external effects;
this separation is not a claim that all actions are confined to the preview tree.

Review the package JSON and VSIX XML together: public identity, version, one true
pre-release property, production entry point and absence of private work state.
Keep the exact source/build receipt and package digest. Do not repack a reviewed
artifact immediately before publication. See the separate delivery runbook for
the publisher and channel controls.

Automated checks cover contribution identity, actual activation root hooks,
directory confinement, repository-memory separation and controller writes with
stable/local-beta sentinels. Native smoke must use disposable user data and
extension directories, verify the public command/banner, and exercise create,
save and check. Neither automated checks nor smoke substitute for human UAT or
native assistive-technology acceptance. Preserve the original installations.

Microsoft documents numeric distinct channel versions and the pre-release flag:
[Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions).
A higher stable version can supersede a preview, so inspect live versions before
selecting numbers. Publication authorization is separate from measured outcomes.
