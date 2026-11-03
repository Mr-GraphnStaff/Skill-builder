# Managed workbench 0.14.0 — local candidate

The owner authorized a scoped feature-freeze exception on November 2: optionally
create a complete, understandable workbench, tie local folders to an explicitly
chosen remote, and confine extension-owned local work writes to its boundary.
They then authorized local pre-release package loading/testing before approval.
No Marketplace publication or production promotion is authorized at this stage.

## Implementation contract

- Setup previews exact paths and creates only a new/empty isolated preview root.
  The generated README and in-product folder guide explain drafts, local repos,
  saved releases, scratch, recovery, logs and internal records. Cancel does not
  create files. Ordinary opened projects are not adopted automatically.
- A valid setup record is required in the actual host and workers. Removing or
  damaging a recognized record fails closed. Existing old work is preserved and
  can be imported as a read-only source; no automatic migration occurs.
- Local repositories live inside `repositories/`; unset local preference uses
  `repositories/skills`. Explicit blank remains distinct from unset. Remote
  address and target branch are separate in Configuration. Saving settings alone
  performs no repository operation.
- Managed remote transport uses GitHub HTTPS and VS Code's session. Local-file
  remotes and SSH are unavailable in this candidate. Credentials stay in memory;
  fixed temporary askpass code contains no token. Commits identify SkillJetty's
  bot explicitly instead of inventing a human identity.
- Guards reject outside paths, junctions/symlinks, hard links, metadata redirects
  and unsafe Git config. Git environment/config cannot select an ambient repo.
  Temporary preparation and diagnostics stay in workbench scratch/logs.
- Only the guided workflow activates; legacy mutation handlers are unavailable.
  No automatic Workspace-settings seeding or OutputChannel work logs remain.
- This is application enforcement, not an OS sandbox. VS Code manages its own
  settings, authentication, extension installation, UI and session data. A hostile
  process with the user's permissions can race filesystem operations; that is
  outside the claimed application destination protection.

## Verification ledger

The exact local candidate is `dist/skill-builder-0.14.0.vsix`, SHA-256
`92d0c895eccbc27b1267fa29db9b85ee9d03ce1e7674448112b99f387258eb36`.
Source base is `3967ab50570c49e0c966f3907d5b27fd185c7ea6` with reviewable local
changes, not a committed or published release. VSCE built the pre-release package;
after final host fixes its 56 compiled payload entries were refreshed, then all
compiled entries were byte-compared and the VSIX manifest/channel inspected.
The final package contains 188 entries (186 installed extension payload files).

Observed checks:

- Final TypeScript compilation passed; production dependency audit reported zero
  vulnerabilities. `git diff --check` passed.
- Independent isolated installation compared all 186 payload files against the
  final VSIX (only installer-added `package.json.__metadata` excluded).
- Real VS Code 1.144.0 Extension Host smoke passed and exited 0. Installed actions
  covered activation, disabled legacy handlers, ambient-folder preservation,
  deliberate setup, confined diagnostics, create/import binary/check/package,
  outside paths/mappings/local-file remote rejection, missing marker and
  unconfigured-write refusal. The actual Electron Git helper also passed.
- Independent read-only live GitHub HTTPS clone, clean verification and repeat
  Pull passed using octocat/Hello-World. No remote push was performed.
- Actual Git credential-fill tests with synthetic tokens passed ordinary spaced
  and shell-special folder names, with no token in helper files and no injected
  side effect. Installed synthetic symlink/hardlink guard checks passed.
- HTML/human fixtures passed 36/36; complete host suite passed 29/29 after the
  final setup/auth/autosave/root-switch race fixes. Focused setup/boundary tests
  passed 12 with 4 capability skips. The broad run completed 376 checks: 350 passed, 19 failed, 7 skipped. Every
  failure was traced to superseded expectations or the unavailable link fixture:
  10 legacy entrypoint expectations replaced by 6 activation-safety cases;
  version/public-command expectations updated; 3 boundary-error message
  expectations updated; publication preservation fixture now pre-creates
  untracked scratch; 3 real-link cases moved behind explicit capability checks.
  Reconciliation passed 11 identity/lifecycle/activation cases, 4 worker/library/
  command/publisher cases, and 2 non-link assertions with 4 real-link skips. The
  raw broad log remains failed and is preserved; it is not described as a green
  full-suite run. After one final missing-marker error-reporting fix, its focused
  host regression passed: zero dispatch/saves, terminal error and retained
  unsaved page. Final revised artifact was independently reinstalled in fresh ignored r2
  profile/extensions directories: all 186 installed files matched and native
  smoke exited 0. The actual registered Verify command terminated safely while
  the setup marker was absent; marker restored by the harness. Receipts are in
  `dist/scratch/workbench-assurance-r2/`. Verdict: complete for local candidate
  review with the stated limitations; Marketplace publication remains on hold.

Evidence is under ignored `dist/scratch/workbench-assurance/`: installed-parity,
native-assurance, live-remote, askpass-assurance and installed-synthetic-links JSON
receipts. `dist/scratch/workbench-candidate-receipt.json` binds the local artifact.
`dist/scratch/workbench-final-tests.log` records the broad run; initial runs during
implementation/encoding repair are retained and are not acceptance evidence.

Limits: P: rejects real junction/symlink and hard-link creation with EISDIR, so
real-link fixtures are unexecuted here; synthetic checks establish guard logic
only. Native checks were scripted Extension Host/API execution, not human GUI,
screen-reader or live private SSO/upload acceptance. VS Code working profiles,
home/work PC installed states, Marketplace and production were not modified.
The public wiki remains on its published-release documentation; candidate source
guides are prepared locally. Update/read back the wiki before a later authorized
publication, never describe this candidate as a validated Marketplace release.

## Recovery and release hold

Old work folders are neither moved nor deleted. New managed work data uses its
own setup record. Back up the entire workbench. Production remains unchanged.
Do not upload 0.14.0 before the owner reviews the locally tested result. Before any
later publication, update/read back the public wiki, verify current stable and
pre-release catalog/channel ordering, and use the exact reviewed artifact.
