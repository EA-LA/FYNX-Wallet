# Legal and operating review brief

Prepared for **FYNX finance world inc.**, the name supplied by the project owner. This is a factual implementation brief and review checklist for qualified counsel, not legal clearance or a claim of registration/licensing. Country/state of registration, company number/address, intended countries and customer eligibility remain unknown.

## Model implemented today

The public product is a free availability waitlist. It collects email and consent metadata, uses Firebase/reCAPTCHA for storage and abuse protection, and expires registrations after 365 days. The owner-only workspace authenticates its configured owner and connects an external user-controlled Ethereum wallet on Sepolia. FYNX does not receive recovery phrases, hold wallet signing keys, execute a server-side transfer, process fiat, or offer swaps through this implementation. The wallet approves signatures and sends directly through its own provider. No claim about any other FYNX product is made here.

## Decisions counsel and the operator must resolve

| Area | Required input / review | Status |
| --- | --- | --- |
| Entity | Exact registered name, incorporation jurisdiction, registration number, registered/service address, beneficial owners and authorized signatory | Owner supplied name only |
| Markets and eligibility | Launch countries/states, user age, excluded locations, access/marketing rules and geo restrictions | Not supplied |
| Product classification | Review actual control of keys, routing, fee model, transfer initiation, any hosted recovery, swaps, fiat partners and future smart contracts | Testnet architecture documented; legal conclusion pending |
| Licensing / AML / sanctions | Determine duties for each market and actual activity; provider reliance and contractual allocation; required registrations and screening | Counsel determination pending |
| Privacy | Controller details, applicable laws, lawful basis, provider agreements, cross-border transfers, access/deletion process, retention/backups, cookies and abuse telemetry | Current notices and data map implemented; applicability review pending |
| Consumer terms | Product availability, fees, risks, irreversible transfers, failed transactions, complaints, liability limits, dispute process and required disclosures | Public prelaunch notice only; production terms pending |
| Providers | Agreements, KYB, permitted countries/assets, test/production keys, incident and refund responsibilities | No payment/swap provider approved in this work |
| Marketing | No guaranteed returns, insurance, audit, licensing, launch date or recovery claims without evidence; consent and unsubscribe procedures before email campaigns | Waitlist consent and removal workflow available; campaign provider absent |
| Operations | Support coverage, security owner, incident escalation, records, reporting and continuity/restore objectives | Procedure prepared; staffing and drill pending |

## Review packet

Provide counsel with this brief, `LAUNCH-READINESS.md`, `OPERATIONS.md`, `FYNX-Wallet-threat-model.md`, the privacy notices, a precise funds/data flow diagram, provider contracts and the proposed launch-country list. Obtain written conclusions tied to that exact scope before expanding beyond the owner test environment. Have counsel re-review changes in custody, recovery, fees, geography or transaction routing.

For US analysis, FinCEN’s [2019 convertible virtual currency guidance](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models) discusses different business models. It is a starting reference for counsel; an “external wallet” label alone does not decide every regulatory obligation. The FTC’s [Start with Security guide](https://www.ftc.gov/business-guidance/resources/start-security-guide-business) supports minimizing collection, controlling access and managing retention. These references are not a determination that US law is the only relevant law.

## Launch decision record

Keep this table unapproved until actual review occurs. Do not turn planning checkboxes into certifications.

| Gate | Reviewer / evidence | Decision |
| --- | --- | --- |
| Entity and jurisdictions confirmed | Pending | Not approved |
| Legal classification and permissions | Qualified counsel required | Not approved |
| Provider permissions | Provider confirmation required if activated | Not approved |
| Production terms and privacy | Counsel and operator approval required | Not approved |
| Independent security review | Independent reviewer required | Not approved |
| Hardware, public-testnet, recovery, restore and alert acceptance | Recorded test evidence required | Not approved |
| Controlled launch with limits and support coverage | Owner sign-off after all applicable gates | Not approved |
