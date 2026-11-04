#!/usr/bin/env bash
# FYNX Wallet monitoring setup: log-based metrics, an email notification channel and alert
# policies in the Firebase/GCP project. Creates FYNX-scoped resources only; it does not
# change shared rules, IAM, functions or other applications' alerts.
#
# Usage (owner, with gcloud signed in as a project Owner/Monitoring Admin):
#   ALERT_EMAIL=you@example.com scripts/setup-monitoring.sh            # dry run: prints commands
#   ALERT_EMAIL=you@example.com APPLY=1 scripts/setup-monitoring.sh    # creates resources
#   APPLY=1 scripts/setup-monitoring.sh --test                         # writes test log entries
# Optional: BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX BUDGET_USD=25 adds a billing budget alert.
#
# After --test, an email for "FYNX Wallet backend failures" and "FYNX Wallet waitlist failures"
# should arrive within ~10 minutes. Record the time received in docs/OPERATIONS.md; an
# alert is not considered working until delivery has been observed.
set -euo pipefail

PROJECT="${PROJECT:-fynx-c7a28}"
APPLY="${APPLY:-0}"
PREFIX="fynx_wallet"

run() {
  if [[ "$APPLY" == "1" ]]; then "$@"; else printf 'DRY RUN:'; printf ' %q' "$@"; printf '\n'; fi
}

if [[ "${1:-}" == "--test" ]]; then
  # Matches the metric filters below (any resource), tagged so it is identifiable.
  run gcloud logging write fynx-monitoring-test \
    '{"message":"Wallet workspace operation failed","code":"monitoring-test"}' \
    --payload-type=json --severity=ERROR --project="$PROJECT"
  run gcloud logging write fynx-monitoring-test \
    '{"message":"Waitlist persistence failed","code":"monitoring-test"}' \
    --payload-type=json --severity=ERROR --project="$PROJECT"
  echo "Test entries written. Confirm both alert emails arrive, then record the result."
  exit 0
fi

: "${ALERT_EMAIL:?Set ALERT_EMAIL to a monitored inbox (it receives security alerts).}"
[[ "$ALERT_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "ALERT_EMAIL is not a valid address." >&2; exit 1; }

# name | filter | description
METRICS=(
  "${PREFIX}_backend_failures|jsonPayload.message=\"Wallet workspace operation failed\" severity>=ERROR|Unexpected owner workspace backend failures"
  "${PREFIX}_waitlist_failures|jsonPayload.message=\"Waitlist persistence failed\" severity>=ERROR|Public waitlist could not store a registration"
  "${PREFIX}_access_denied|jsonPayload.message=\"Wallet workspace access denied\"|App Check, origin, token, owner or wallet-signature denials"
  "${PREFIX}_non_owner_signin|jsonPayload.message=\"Wallet workspace access denied\" jsonPayload.reason=\"not-owner\"|Signed-in accounts that are not the verified owner"
  "${PREFIX}_iam_changes|protoPayload.methodName=\"SetIamPolicy\" OR protoPayload.methodName:\"CreateServiceAccountKey\"|Project IAM policy or service-account key changes"
)

for entry in "${METRICS[@]}"; do
  IFS='|' read -r name filter description <<<"$entry"
  if [[ "$APPLY" == "1" ]] && gcloud logging metrics describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    run gcloud logging metrics update "$name" --log-filter="$filter" --description="$description" --project="$PROJECT"
  else
    run gcloud logging metrics create "$name" --log-filter="$filter" --description="$description" --project="$PROJECT"
  fi
done

CHANNEL=""
if [[ "$APPLY" == "1" ]]; then
  CHANNEL="$(gcloud beta monitoring channels list --project="$PROJECT" \
    --filter="type=\"email\" AND labels.email_address=\"$ALERT_EMAIL\"" --format='value(name)' | head -n1)"
  if [[ -z "$CHANNEL" ]]; then
    CHANNEL="$(gcloud beta monitoring channels create --project="$PROJECT" --type=email \
      --display-name="FYNX Wallet alerts" --channel-labels="email_address=$ALERT_EMAIL" --format='value(name)')"
  fi
else
  run gcloud beta monitoring channels create --project="$PROJECT" --type=email \
    --display-name="FYNX Wallet alerts" --channel-labels="email_address=$ALERT_EMAIL"
  CHANNEL="projects/$PROJECT/notificationChannels/CHANNEL_ID"
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# name | display name | threshold (count in 5 minutes must exceed) | documentation
POLICIES=(
  "${PREFIX}_backend_failures|FYNX Wallet backend failures|0|Owner workspace returned unexpected errors. Follow docs/OPERATIONS.md → Incident response."
  "${PREFIX}_waitlist_failures|FYNX Wallet waitlist failures|0|Public waitlist registrations are failing. Check the joinFynxWalletWaitlist function and Firestore."
  "${PREFIX}_access_denied|FYNX Wallet access-denial spike|20|Many denied requests in 5 minutes: possible probing or a broken App Check/auth configuration."
  "${PREFIX}_non_owner_signin|FYNX Wallet non-owner sign-ins|3|Accounts other than the verified owner tried the owner workspace. Review Firebase Authentication."
  "${PREFIX}_iam_changes|FYNX project IAM change|0|IAM policy or a service-account key changed in the shared project. Confirm it was intended."
)
for entry in "${POLICIES[@]}"; do
  IFS='|' read -r metric display threshold doc <<<"$entry"
  file="$TMP/$metric.json"
  cat >"$file" <<JSON
{
  "displayName": "$display",
  "documentation": { "content": "$doc", "mimeType": "text/markdown" },
  "combiner": "OR",
  "conditions": [{
    "displayName": "$display",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/$metric\"",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": $threshold,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "86400s" },
  "notificationChannels": ["$CHANNEL"],
  "enabled": true
}
JSON
  if [[ "$APPLY" == "1" ]]; then
    existing="$(gcloud alpha monitoring policies list --project="$PROJECT" --filter="displayName=\"$display\"" --format='value(name)' | head -n1)"
    if [[ -n "$existing" ]]; then
      gcloud alpha monitoring policies update "$existing" --policy-from-file="$file" --project="$PROJECT"
    else
      gcloud alpha monitoring policies create --policy-from-file="$file" --project="$PROJECT"
    fi
  else
    echo "DRY RUN: create alert policy \"$display\" from:"; cat "$file"
  fi
done

if [[ -n "${BILLING_ACCOUNT:-}" ]]; then
  run gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" \
    --display-name="FYNX project budget" --budget-amount="${BUDGET_USD:-25}USD" \
    --filter-projects="projects/$PROJECT" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
else
  echo "Skipped billing budget (set BILLING_ACCOUNT to add one)."
fi

echo "Done. Next: APPLY=1 scripts/setup-monitoring.sh --test and confirm alert delivery."
