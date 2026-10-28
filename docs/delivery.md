# Azure build and Marketplace publication

`azure-pipelines.yml` builds production `main` and pull requests. Node 22 and the
locked npm dependencies compile/test/audit the extension, package the VSIX, and
retain `skilljetty-vsix` with a SHA-256/source/build receipt. The packaging tool is
pinned to `@vscode/vsce` 3.9.2 (npm registry metadata checked October 28, 2026).
The current 4.1.0 release's dependency tree produced a high MSAL authorization-flow
advisory. The audit recommended 3.9.2; a narrow override pins its compatible Azure
Identity dependency to 4.13.0 to avoid resolving the affected MSAL major version.
See [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5).
Builds audit both production dependencies and the build/publisher dependency tree;
high or critical tool findings block packaging.
At setup validation, production audit reported zero findings and the full audit
reported four moderate transitive findings from
[uuid buffer bounds checking](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
with zero high/critical findings. The high-severity gate does not claim that the
entire development dependency tree is finding-free; review these before release.

Publishing defaults off. To release a new reviewed production version, manually
run the pipeline on `main` with `publishMarketplace=true`. The deployment uses
environment `skilljetty-marketplace-production`, which must have an enabled
Approval check with one required maintainer approver. Azure enforces approval
before the deployment; the publisher also checks that the approval configuration
still exists and fails closed if Azure API access or configuration is missing.
Give the pipeline build identity permission to read this environment/check.
Every manual build runs `check-gate` with only its Azure system token, so a
build-only setup run can verify that permission and gate without publish secrets.

Configure secret pipeline variable `VSCE_PAT` with the maintainer's Marketplace
publish credential. Never commit it or put it in build scripts. Only the final
publish command step maps that secret. Missing credentials stop publication.

The publisher verifies the exact current build's package digest, revision, branch,
build ID, production identity `DavidFarris.skill-builder`, and unused Marketplace
version. It publishes that VSIX without rebuilding it, then confirms the version
appears publicly. Existing 0.9.0 is not a new releasable version.

This pipeline does not consume the separate dirty local beta/UAT checkout, publish
`DavidFarris.skill-builder-beta`, approve UAT, install over production, or promote
beta automatically. Promotion and native critical-action acceptance remain
explicit reviewed steps. A configured pipeline or successful build does not mean
a Marketplace publication or native acceptance occurred.
