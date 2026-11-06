# Alert setup guide (Google Cloud)

For the launch step **Monitoring, backups and incident recovery → Set up those alerts in Google Cloud and send a test alert**.
Project: `fynx-c7a28`. Functions: `fynxWalletWorkspace` (owner workspace) and `joinFynxWalletWaitlist` (public waitlist), both 2nd gen in `us-central1`.

Status: **not set up yet**. This page is a procedure, not evidence. The step is done only when the test alerts in step 5 actually arrive and the result is recorded.

Before you start, decide in the workspace (**Launch readiness → Decisions only you can make → Where alerts go**) which email address or phone receives alerts. Use an inbox someone reads every day.

## 1. Add where alerts go (notification channel)

1. Open the Google Cloud console for project `fynx-c7a28`.
2. Go to **Monitoring → Alerting → Edit notification channels**.
3. Under **Email**, choose **Add new**, enter the alert address, and name it `FYNX alerts`. Optionally add the **Google Cloud mobile app** or **SMS** channel for the backup person.
4. Save. Every alert below uses this channel.

## 2. Failure alerts from the two functions

Both functions write one error line when an operation fails unexpectedly. They never log emails, tokens, signatures or keys.

| Alert name | Logs Explorer query |
| --- | --- |
| FYNX workspace failures | `severity>=ERROR AND "Wallet workspace operation failed"` |
| FYNX waitlist failures | `severity>=ERROR AND "Waitlist persistence failed"` |

For each one:

1. Go to **Logging → Logs Explorer**, paste the query and press **Run query** (it may show no results; that is normal).
2. Choose **Actions → Create log alert**.
3. Name it as in the table. Severity: **Error**.
4. **Time between notifications**: 5 minutes. **Incident autoclose duration**: 1 day.
5. Select the `FYNX alerts` channel and save.

## 3. Unexpected access changes (IAM)

Alert when anyone changes who can access the project.

1. In **Logs Explorer**, run:
   `logName:"cloudaudit.googleapis.com%2Factivity" AND protoPayload.methodName:"SetIamPolicy"`
2. **Actions → Create log alert**, name it `FYNX access changed`, severity **Warning**, channel `FYNX alerts`, save.

Expected: one alert each time access is changed on purpose. An alert nobody expected is an incident (see the incident procedure in [OPERATIONS.md](OPERATIONS.md)).

## 4. Billing and quota

1. Go to **Billing → Budgets & alerts → Create budget**.
2. Scope: project `fynx-c7a28`. Amount: a monthly figure you would notice (for example twice the normal monthly bill).
3. Thresholds: 50%, 90% and 100% of actual spend. Under **Manage notifications**, email billing admins and, if offered, link the `FYNX alerts` Monitoring channel.
4. Save. A budget alert notifies; it does not stop spending.

## 5. Send a test alert and record it

Write one test line for each failure alert from **Cloud Shell** (the terminal icon at the top of the console):

```
gcloud logging write fynx-alert-test "Wallet workspace operation failed (alert test, ignore)" --severity=ERROR --project=fynx-c7a28
gcloud logging write fynx-alert-test "Waitlist persistence failed (alert test, ignore)" --severity=ERROR --project=fynx-c7a28
```

Within about five minutes an email titled with each alert name should arrive at the alert address. Then:

1. Open **Monitoring → Alerting**, find the two incidents and close them.
2. In the owner workspace, **Launch readiness → Monitoring, backups and incident recovery**, add a note to "Choose where alerts go" with the date the test emails arrived.
3. Share the copied test report so this repository can record the evidence and mark the engineering step done.

If no email arrives: check the channel address, the spam folder, and that the query in step 2 shows the test line in Logs Explorer.

## What this does not cover

- Backups and a restore drill (separate steps in the same gate).
- Uptime checks of the public website (GitHub Pages) — optional; add a Monitoring **Uptime check** for `https://ea-la.github.io/FYNX-Wallet/` if wanted.
- Any change to function code, IAM or Firebase configuration. This guide only adds alerting.
