# Backup and restore test (Operations gate)

This guide covers two launch steps in **Monitoring, backups and incident recovery**:

- **You:** choose how long backups are kept and how quickly the service must be back after an outage (Launch readiness → *Decisions only you can make* → *Backups and recovery time*).
- **Engineering:** restore a backup into a separate test project and record the result.

A written procedure is not a tested restore. The restore step stays open until a restore has actually been carried out and its result is recorded in [VERIFICATION.md](VERIFICATION.md).

> **Shared project.** FYNX Wallet currently shares the Firebase project `fynx-c7a28` with other apps. Turning on backups, point-in-time recovery or a scheduled export changes that shared project and its bill, so it needs the owner’s approval first. Nothing in this repository turns them on.

## What needs protecting

| Collection | What it holds | Can it be recreated? |
| --- | --- | --- |
| `fynxWalletWaitlist` | Waitlist registrations: email, consent, notice version, source, expiry | No: losing it loses sign-ups |
| `fynxWalletProfiles` | Owner workspace profile and linked wallet record | Partly: the owner can link the wallet again |
| `fynxWalletPasskeys` | Registered passkeys (public keys only) | Yes, by adding passkeys again, but the owner may be locked out until then |
| `fynxWalletAudit` | Audit events (hashed actor, 90-day expiry) | No: it is evidence |
| `fynxWalletChallenges`, `fynxWalletRateLimits` | Short-lived challenges and counters | Not needed: they expire within minutes or a day |

Source code, the website and the function source are already kept in GitHub; restoring them is covered in [OPERATIONS.md](OPERATIONS.md#backup-restore-and-release).

## 1. Match the backup method to the owner’s decision

| Owner’s answer | Suggested Google Cloud setting |
| --- | --- |
| Could lose **a few minutes** | Firestore point-in-time recovery (keeps every version for 7 days) plus a daily scheduled backup |
| Could lose **up to one day** | Daily scheduled Firestore backup |
| Could lose **up to one week** | Weekly scheduled Firestore backup |
| Keep backups **7, 30 or 90 days** | Scheduled backup retention set to that period (Firestore allows up to 14 weeks) |
| Keep backups **1 year** | Scheduled backups for recent copies, plus a monthly export to a Cloud Storage bucket with a 1-year lifecycle rule |

Check current limits and prices in Google’s documentation before switching anything on: [Firestore backups](https://cloud.google.com/firestore/docs/backups), [point-in-time recovery](https://cloud.google.com/firestore/docs/pitr), [export and import](https://cloud.google.com/firestore/docs/manage-data/export-import).

Example commands (run only after approval, by someone with owner access to the project):

```sh
# Daily backup kept for 30 days (adjust --recurrence and --retention to the owner's answer)
gcloud firestore backups schedules create --project=fynx-c7a28 --database='(default)' --recurrence=daily --retention=30d

# Point-in-time recovery (only if the owner chose "a few minutes")
gcloud firestore databases update --project=fynx-c7a28 --database='(default)' --enable-pitr
```

A scheduled backup can only be restored into a new database in the **same** project. For a test in a **separate** project, use an export as below.

## 2. Restore test in a separate project

The test project will contain real waitlist email addresses. Treat it like production: only the owner and the engineer get access, and it is deleted at the end.

1. **Create a test project**, for example `fynx-wallet-restore-test`, with billing enabled and a Firestore database in the same location as the original. Do not reuse any other project.
2. **Create a private bucket** in the original project for exports, with public access prevention on:
   ```sh
   gcloud storage buckets create gs://BUCKET_NAME --project=fynx-c7a28 --location=LOCATION --public-access-prevention --uniform-bucket-level-access
   ```
3. **Export only the FYNX Wallet collections** (the other apps in the shared project are not touched):
   ```sh
   gcloud firestore export gs://BUCKET_NAME/restore-test-$(date -u +%Y%m%d) --project=fynx-c7a28 \
     --collection-ids=fynxWalletWaitlist,fynxWalletProfiles,fynxWalletPasskeys,fynxWalletAudit
   ```
   Note the UTC start and finish time of the export.
4. **Let the test project read the export.** Find the test project’s number (`gcloud projects describe fynx-wallet-restore-test --format='value(projectNumber)'`) and grant its Firestore service agent access to this one bucket (Google’s export and import guide uses the Storage Admin role for this; it is removed again in step 7):
   ```sh
   gcloud storage buckets add-iam-policy-binding gs://BUCKET_NAME \
     --member=serviceAccount:service-PROJECT_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com --role=roles/storage.admin
   ```
5. **Import into the test project, never into `fynx-c7a28`** (an import overwrites documents with the same ID):
   ```sh
   gcloud firestore import gs://BUCKET_NAME/restore-test-YYYYMMDD --project=fynx-wallet-restore-test \
     --collection-ids=fynxWalletWaitlist,fynxWalletProfiles,fynxWalletPasskeys,fynxWalletAudit
   ```
6. **Check the result** in the Firebase console of both projects:
   - the number of documents in each collection matches (use the console’s query builder count);
   - one known test registration (an `@example.com` address) has the same consent, notice version and expiry fields;
   - the time from the start of the export to the end of the import is within the owner’s “back online within” answer.
7. **Clean up the same day:** delete the test project (`gcloud projects delete fynx-wallet-restore-test`), delete the export folder from the bucket, and remove the access granted in step 4. Expiry (TTL) policies are not copied by an import, so leaving the test project running would keep data past its expiry date.

## 3. Record the result

Add a dated entry to [VERIFICATION.md](VERIFICATION.md) with:

- date and who ran it;
- export path (bucket and folder name only, no keys or tokens);
- document counts per collection in the original and the restored project;
- total time taken, compared with the owner’s recovery target;
- anything that went wrong and what was changed;
- confirmation that the test project and export were deleted.

Then mark the restore step done in `wallet-src/launch-checklist.json` (with that entry as its evidence) and run `npm run check`.

Never paste service-account keys, access tokens, email addresses from the waitlist or other personal data into GitHub.
