# SkillJetty contributor instructions

SkillJetty by DAF-TECH is an Agent Skills Studio. This is the separate local Beta/UAT repository, established at the team lead's explicit direction on October 26, 2026. Its local co-installable identity is DavidFarris.skill-builder-beta, display name SkillJetty Beta — UAT, with skillJettyBeta command/view/settings names and isolated .skilljetty-beta work data. Do not replace the production DavidFarris.skill-builder installation with this package. The production checkout is a protected baseline and receives no beta changes.

After local UAT passes, Marketplace pre-release preparation is a separate reviewed packaging/promotion step against the existing public identity. This local beta identity is not authorization to publish a second Marketplace listing. Preserve both original source and approved production artifacts; no automatic publication.

Keep the workbench local-first: Create/Open -> Edit -> Check -> Publish -> Done. Repository setup is needed for publication, not for local creation or editing. Show clear clickable actions and accessible feedback. Keep the existing DAF-TECH brand asset unchanged.

Preserve nested text and binary files, application-specific metadata, original imported archive bytes, immutable version packages, and per-version changelogs. Treat imports and webview messages as untrusted data; never execute imported scripts automatically. Retain path, link, identity, file-size, decompression, and credential-URL guards. Keep secrets and user/workbench state out of source and VSIX packages.

Run npm test for behavior changes and npm audit --omit=dev for release dependency review. Package into dist/ and verify the installed artifact matches the reviewed VSIX. Distinguish automated tests, native UI checks, skill repository upload, merge, and Marketplace publication. Do not claim checks that were not executed.

Keep contributor changes scoped and preserve unrelated work. Publication requires maintainer authorization, exact artifact verification, and post-publication checks of name, description, version, icon, and critical user actions.
