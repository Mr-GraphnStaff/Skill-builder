# SkillJetty contributor instructions

## Release freeze — October 31, 2026

David Farris has declared a release freeze: bug fixes only, no new features.
The feature set is frozen after 0.11.12; only bug-fix releases may follow. Preserve this scope in team handoffs;
the lead decides when the freeze ends and when production promotion proceeds.
The owner's November 1 decision supersedes the earlier diagnostics restriction:
keep local recording and Command Palette access in production, hide its Activity
button, and add no diagnostics opt-in setting. Keep the Activity workflow itself.

SkillJetty by DAF-TECH is an Agent Skills Studio. This checkout prepares authorized production 0.12.0 by promoting the tested public pre-release 0.11.13 under the existing DavidFarris.skill-builder identity, skillBuilder command/view/settings names, listing and unchanged icon. Stable uses the explicitly selected stable work folder and its configured directories. Do not automatically migrate preview, stable or local-UAT data between channels; never point stable work data at .skilljetty-prerelease or .skilljetty-beta. Preserve original work and recovery receipts.

The team lead explicitly authorized production Marketplace publication on November 1, 2026. Authorization does not establish completed publication, native smoke or human UAT. Verify the exact reviewed public-identity stable VSIX, absence of a true pre-release flag, source/build binding and digest before publishing. Never publish the separate local-UAT identity as a second listing. Do not install over a protected production setup as a testing shortcut; native smoke uses a disposable profile and extension directory.

Keep the workbench local-first: Create/Open -> Edit -> Check -> Publish -> Done. Repository setup is needed for publication, not for local creation or editing. Show clear clickable actions and accessible feedback. Keep the existing DAF-TECH brand asset unchanged.

Preserve nested text and binary files, application-specific metadata, original imported archive bytes, immutable version packages, and per-version changelogs. Treat imports and webview messages as untrusted data; never execute imported scripts automatically. Retain path, link, identity, file-size, decompression, and credential-URL guards. Keep secrets and user/workbench state out of source and VSIX packages.

Run npm test for behavior changes and npm audit --omit=dev for release dependency review. Package into dist/ and verify the installed artifact matches the reviewed VSIX. Distinguish automated tests, native UI checks, skill repository upload, merge, and Marketplace publication. Do not claim checks that were not executed.

Keep contributor changes scoped and preserve unrelated work. Publication requires maintainer authorization, exact artifact verification, and post-publication checks of name, description, version, icon, and critical user actions.
