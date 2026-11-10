import { readFile, writeFile, access } from 'node:fs/promises';
import { statusLabels } from '../wallet-src/launch-status.js';
import { byLabels, tabLabels, checkDependencies, stepIndex, shortStep } from '../wallet-src/launch-tracker.js';
import { checkSessionFields, needShort } from '../wallet-src/test-session.js';
const plan = JSON.parse(await readFile('wallet-src/launch-checklist.json', 'utf8'));
const ids = new Set();
for (const item of plan.items) {
  if (!item.id || ids.has(item.id) || !statusLabels[item.status] || !/^[\w./-]+$/.test(item.evidence)) throw new Error('Invalid launch checklist item.');
  ids.add(item.id); await access(item.evidence);
  const stepIds = new Set();
  if (!Array.isArray(item.steps) || !item.steps.length) throw new Error(`Launch checklist item ${item.id} needs steps.`);
  for (const step of item.steps) {
    if (!/^[a-z0-9-]+$/.test(step.id || '') || stepIds.has(step.id) || !byLabels[step.by] || typeof step.text !== 'string' || !step.text.trim() || typeof step.done !== 'boolean' || (step.tab !== undefined && !tabLabels[step.tab])) throw new Error(`Invalid step in launch checklist item ${item.id}.`);
    stepIds.add(step.id);
  }
}
const depErrors = checkDependencies(plan);
if (depErrors.length) throw new Error(`Launch checklist order problems:\n${depErrors.join('\n')}`);
const sessionErrors = checkSessionFields(plan);
if (sessionErrors.length) throw new Error(`Launch checklist time estimates:\n${sessionErrors.join('\n')}`);
const index = stepIndex(plan);
const timeText = s => s.minutes && !s.done ? ` _(about ${s.minutes} min${s.needs ? `; needs: ${s.needs.map(n => needShort[n]).join(', ')}` : ''})_` : '';
const afterText = (item, s) => s.after && !s.done ? ` _(after: ${s.after.map(ref => { const { gate, step } = index.get(ref); return `${gate.id === item.id ? '' : `${gate.title} → `}${shortStep(step)}`; }).join('; ')})_` : '';
let text = `# FYNX Wallet launch checklist\n\nUpdated ${plan.updated}. Operator name supplied: **${plan.operator}**; registration and permissions remain unverified.\n\n${plan.scope}\n\n**Market plan:** ${plan.marketPlan}\n\nThis is an evidence-based work list, not a certification or legal opinion. “Implemented” applies only to the described owner/testnet scope.\n\n| Item | Status | Responsible |\n| --- | --- | --- |\n`;
for (const item of plan.items) text += `| ${item.title} | ${statusLabels[item.status]} | ${item.responsibility} |\n`;
for (const item of plan.items) text += `\n## ${item.title}\n\n**Current:** ${item.current}\n\n**To finish:** ${item.next}\n\n**Responsible:** ${item.responsibility}. [Evidence and context](../${item.evidence}).\n\n**Steps (${item.steps.filter(s => s.done).length} of ${item.steps.length} recorded as done):**\n\n${item.steps.map(s => `- [${s.done ? 'x' : ' '}] ${byLabels[s.by]}: ${s.text}${timeText(s)}${afterText(item, s)}`).join('\n')}\n`;
text += '\nThis file is generated from `wallet-src/launch-checklist.json`; update that source and run `npm run build`. The owner dashboard uses the same checklist.\n';
await writeFile('docs/LAUNCH-CHECKLIST.md', text);
