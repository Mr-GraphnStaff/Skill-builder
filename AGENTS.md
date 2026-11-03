# SkillJetty contributor instructions

## Public branding

Use **SeñorFarris** (ñ, no space) for the personal brand and **DAF-TECH** for the
business brand. Product copy says **SkillJetty by DAF-TECH**. Do not use
DavidFarris or David Farris as public promotional prose. Preserve technical
publisher IDs, URLs, command/settings names, receipts and compatibility paths;
a branding correction does not authorize renaming them or publishing a package.

## Release freeze — October 31, 2026

November 3 scoped owner exception: implement the complete dual-export proposal,
including Claude multi-skill plugin bundles, GitHub submissions and review,
Gemini App ZIP export with honest compatibility reporting, and the managed
workbench candidate. The owner explicitly directed end-to-end completion and
public pre-release availability as soon as verified. This supersedes the
November 2 candidate publication hold for this scope. Production and publisher
transfer remain unchanged. Preserve all local work and release evidence.

November 2 scoped exception: implement the owner's managed workbench design for
the next pre-release, including optional setup, a complete plain-language folder
guide, explicit local/remote mapping, and a hard boundary on extension-owned work
writes. Preserve old folders and repositories. The owner requested local exact
package installation/testing before approval: Marketplace publication is on hold.
Production and the existing listing/publisher-transfer wait remain unchanged.

The project owner has declared a release freeze: bug fixes only, no new features.
The feature set is frozen after 0.11.12; only bug-fix releases may follow. Preserve this scope in team handoffs;
the lead decides when the freeze ends and when production promotion proceeds.
On November 1 the owner explicitly authorized one scoped exception: consolidate
configuration in VS Code Extension Settings, keep only a read-only workbench
summary plus gear, and publish this as a new pre-release after finishing the wiki.
This does not authorize changing production or unrelated features. Preserve
existing connections, drafts and channel isolation, and verify settings-change
races at the final Git/GitHub write boundaries before publication.
The owner's November 1 decision supersedes the earlier diagnostics restriction:
production retains local recording and its Command Palette command, hides the
Activity log button, and adds no diagnostics opt-in setting. Keep Activity itself.

The owner explicitly authorized publishing pre-release 0.13.0 on November 1 to
restore channel switching after stable 0.12.1 overtook preview 0.11.13. Before
declaring channel delivery complete, verify a validated latest pre-release newer
than stable, both versions' channel flags, and VS Code switch eligibility. Before
future stable publication, ensure its version will not overtake the public preview
and hide channel switching; coordinate the preview release first within the
owner's publication authority. Merely finding an old preview in history is not
channel-switch acceptance.

Keep the public GitHub wiki current for every release and user-visible incident.
The coordinator owns updating Home, Release Channels, Release Notes and affected
troubleshooting pages before delivery is declared complete. Follow
`docs/wiki-maintenance.md`; do not label pending publication as validated.

SkillJetty by DAF-TECH is an Agent Skills Studio. This checkout prepares the authorized public pre-release under the existing DavidFarris.skill-builder identity, with production skillBuilder command/view/settings names and the established Marketplace listing and icon. Public prerelease work data belongs under .skilljetty-prerelease and uses a channel-specific repository preference. Do not automatically migrate stable or local-UAT state, and confine inherited skills/export directory overrides to the preview root. The original local beta and production checkouts remain preserved.

The team lead explicitly authorized public pre-release publication on October 28, 2026. Authorization does not establish completed publication, native smoke or human UAT. Verify the exact reviewed public-identity VSIX, pre-release flag, source/build binding and digest before publishing. Never publish the separate local-UAT identity as a second listing. Do not install over a protected production setup as a testing shortcut; native smoke uses a disposable profile and extension directory.

Keep the workbench local-first: Create/Open -> Edit -> Check -> Publish -> Done. Repository setup is needed for publication, not for local creation or editing. Show clear clickable actions and accessible feedback. Keep the existing DAF-TECH brand asset unchanged.

Preserve nested text and binary files, application-specific metadata, original imported archive bytes, immutable version packages, and per-version changelogs. Treat imports and webview messages as untrusted data; never execute imported scripts automatically. Retain path, link, identity, file-size, decompression, and credential-URL guards. Keep secrets and user/workbench state out of source and VSIX packages.

Run npm test for behavior changes and npm audit --omit=dev for release dependency review. Package into dist/ and verify the installed artifact matches the reviewed VSIX. Distinguish automated tests, native UI checks, skill repository upload, merge, and Marketplace publication. Do not claim checks that were not executed.

Keep contributor changes scoped and preserve unrelated work. Publication requires maintainer authorization, exact artifact verification, and post-publication checks of name, description, version, icon, and critical user actions.

<!-- owner-working-area-policy:start -->
## Owner-required scratch boundary — November 2, 2026

Each work folder maps to its own remote repository. `working/` is the ONLY
permitted location for agent scratch and temporary work in this checkout.
This owner instruction supersedes older tmp/, temp/, dist/scratch/, QA-folder,
OS-temp and peer-clone recommendations. No child instructions or convenience
exception may waive it; stop on a conflict instead of finding a workaround.

- Before ANY temporary write, run:
  `python C:/Users/DavidFarris/.codex/tools/working_area.py check --root <checkout>`.
  A missing marker, linked path, tracked scratch file or failed exclusion stops
  the operation. Never use force-add, remove exclusions, change the boundary,
  reuse a different repository, or fall back to OS temp to get past a failure.
- Run development/test/research commands through the tool's `run --root
  <checkout> -- <command>` mode. It sets per-run temporary/cache paths inside
  working/, suppresses source-tree Python bytecode and checks for new untracked
  files outside working/. Configure any tool-specific logs, downloads, browser
  profiles, screenshots, reports and disposable checkouts inside that run too.
  If a tool cannot comply, stop rather than run it with an outside destination.
- Keep actual source, deliberate deliverables and runtime dependencies in their
  intended project locations. Never relabel user files or uncommitted source as
  scratch. Never stage, commit, push or package working/. Verify each non-Git
  sync/build/package context excludes it as well.
- Run `maintain --root <checkout>` at task start and finish. It purges only
  completed, explicitly disposable managed runs older than seven days, with no
  live owner, retained marker, links or nested repository. Relocated material,
  rollback databases, recovery records, manifests and user files are retained.
- Relocation requires an inventory, zero tracked paths, no active worktrees,
  verified inside-root paths, and before/after hashes. Keep the recovery receipt.

These instructions and the checked launcher are mandatory operating controls,
not an OS sandbox. Never claim they technically prevent every arbitrary process
from writing elsewhere. Changes to this owner policy require the owner's direction.
<!-- owner-working-area-policy:end -->
