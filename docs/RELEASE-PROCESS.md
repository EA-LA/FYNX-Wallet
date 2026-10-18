# Verified website releases

GitHub Pages uses the **Verify and publish FYNX Wallet** Actions workflow. A main-branch push must finish the verification job before its deployment job can run. Pull requests run checks without publishing.

## What blocks publication

- Rebuild or automated tests fail.
- Committed generated assets or the generated launch checklist differ from their rebuilt versions.
- A production dependency audit reports a high or critical advisory.
- Public artifact validation fails: missing local HTML dependencies, symlinked assets, known private-credential patterns or acceptance-test hooks.

`scripts/build-pages.mjs` copies an explicit list of public files into `_site`. Source files, backend files, private local acceptance helpers, `.git`, dependencies and operational documents are not copied. Repository source remains visible on GitHub because this is a public repository. The scanner is a narrow additional check, not a guarantee that every possible secret can be detected.

`release-manifest.json` identifies the repository revision and SHA-256 of every copied asset. Compare it with the successful Actions run and published bytes when verifying a deployment. No private value belongs in the manifest. `_site` is ignored by Git.

## Release steps

1. Run `npm run check`, the production dependency audits for all three packages, and `npm run pages:build`.
2. Inspect the diff, including generated files. Commit source and generated changes together, then push to `main`.
3. Verify both jobs in the same Actions run succeed. Confirm the published manifest revision matches that commit and the changed assets match their manifest hashes.
4. Check the public waitlist and the authenticated owner flow. Automated browser fixtures do not prove human Google sign-in, device passkeys, hardware signing, normal-browser App Check, public-network transfers or recovery.

Do not switch Pages back to branch/legacy publication: that would bypass this verification gate. Third-party Actions are pinned to reviewed commit IDs. Repository administrators remain able to change workflows and settings; these controls are not independent review or administrator-proof branch protection.

## Backend changes and rollback

This workflow deploys static assets only. Firebase deployments remain separately scoped to the intended FYNX function; never deploy shared rules or unrelated functions. Dashboard document changes require deploying the matching owner function and publishing its matching parent CSP hash. See [backend setup](../firebase-wallet/SETUP.md).

For a frontend regression, revert the faulty commit through Git, rebuild any affected generated assets, run checks and publish the corrected commit through the same gate. Verify the new manifest. For a backend regression, review and deploy the last compatible function source with its matching frontend if necessary. Do not automatically roll back database data or erase customer records. Keep public accounts and real funds disabled throughout an unresolved release incident.

Artifact tests exercise exclusion of sensitive paths, rejection of sample private keys/test hooks/debug activation, broken dependencies and symlink escape prevention. A passing release does not establish legal approval or production-wallet readiness.
