import { readFile, writeFile, access } from 'node:fs/promises';
import { statusLabels } from '../wallet-src/launch-status.js';
const plan = JSON.parse(await readFile('wallet-src/launch-checklist.json', 'utf8'));
const ids = new Set();
for (const item of plan.items) {
  if (!item.id || ids.has(item.id) || !statusLabels[item.status] || !/^[\w./-]+$/.test(item.evidence)) throw new Error('Invalid launch checklist item.');
  ids.add(item.id); await access(item.evidence);
}
let text = `# FYNX Wallet launch checklist\n\nUpdated ${plan.updated}. Operator name supplied: **${plan.operator}**; registration and permissions remain unverified.\n\n${plan.scope}\n\n**Market plan:** ${plan.marketPlan}\n\nThis is an evidence-based work list, not a certification or legal opinion. “Implemented” applies only to the described owner/testnet scope.\n\n| Item | Status | Responsible |\n| --- | --- | --- |\n`;
for (const item of plan.items) text += `| ${item.title} | ${statusLabels[item.status]} | ${item.responsibility} |\n`;
for (const item of plan.items) text += `\n## ${item.title}\n\n**Current:** ${item.current}\n\n**To finish:** ${item.next}\n\n**Responsible:** ${item.responsibility}. [Evidence and context](../${item.evidence}).\n`;
text += '\nThis file is generated from `wallet-src/launch-checklist.json`; update that source and run `npm run build`. The owner dashboard uses the same checklist.\n';
await writeFile('docs/LAUNCH-CHECKLIST.md', text);
