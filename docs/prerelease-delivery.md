# Public Marketplace pre-release delivery

The dedicated `codex/public-prerelease` branch builds the established public
identity `DavidFarris.skill-builder` with the Marketplace pre-release flag. It is
different from the co-installable local UAT identity `DavidFarris.skill-builder-beta`.
The local-beta branch keeps its build-only pipeline and never publishes its identity.

Pipeline 12 reads `azure-pipelines-beta.yml` on this public promotion branch. Its
`skilljetty-prerelease-vsix` artifact contains the reviewed VSIX and
`prerelease-release.json` with exact package SHA-256, source commit, branch, build
ID, identity, version and channel. Tests, production audit and the high-severity
tool audit precede packaging. Manual build-only runs verify access to the configured
approval gate without a publisher credential being mapped into that build step.

Publishing defaults off. A manual run with `publishMarketplace=true` uses the
protected `skilljetty-marketplace-prerelease` environment and its configured
maintainer approval. Only the final publish step maps secret `VSCE_PAT`. Current
setup reused a verified existing publisher credential; longer-term Entra identity
is a separate follow-up, not a prerequisite invented for this release.

The publisher checks the exact current build's source/branch/build receipt,
artifact digest, public identity and true pre-release XML metadata, then uploads
that VSIX once with `--packagePath --pre-release`. It does not rebuild it or create
a second public listing. Existing version numbers cannot be replaced: if the
version already exists, the helper only accepts it after verifying the public
channel and identical extension payload. An uncertain upload is reconciled with
bounded reads; the helper never automatically repeats the upload.

After upload, unauthenticated Marketplace metadata must identify the exact version
as pre-release. The public VSIX download is inspected and every installed
`extension/` file must match the reviewed artifact. Only optional Marketplace-added
`package.json.__metadata` is ignored when comparing manifest data. Other files use
exact byte hashes. The output records the public SHA-256 and whether complete ZIP
bytes match; service signing metadata outside the installed payload may differ.
Index/validation/asset propagation receives eleven bounded reads, thirty seconds
apart (up to five minutes of waiting). Pending visibility is logged separately
from integrity, channel or reported validation failures; the latter stop at once.
If still pending, reconcile the original build instead of uploading again.

## Read-only reconciliation

Run pipeline 12 manually on `codex/public-prerelease` with
`reconcilePublishedBuildId` set to the original publication build ID (for example
`905`) and leave `publishMarketplace=false`. Reconciliation skips both Build and
Publish. It tests the current verification helper, downloads the original
`skilljetty-prerelease-vsix` artifact from this same pipeline, and checks its
receipt against the original Azure build's project, repository, source branch,
commit and successful Build stage. A failed original publication-verification
result remains recorded as failed; it is not rewritten or treated as successful
validation. The original package is never rebuilt or uploaded during this run.

The read-only job maps only its Azure system token for build provenance reads;
it maps no publisher credential and uses no publication approval/environment.
It then verifies the public catalog/channel and original public package payload.
An available exact package download alone is not proof that Marketplace
validation has completed or consumers can discover the pre-release in VS Code.
The initial 905 upload demonstrated this distinction: its upload completed and
public package bytes matched while the catalog still excluded the unvalidated
version; the former 35-second verification window expired before validation.

This pipeline does not install over the protected local production instance.
Marketplace visibility, package verification, native operation and human UAT are
distinct acceptance states. The team lead explicitly authorized public publication;
that does not turn prior synthetic or package checks into native UAT evidence.
