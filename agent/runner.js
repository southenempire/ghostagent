/**
 * GhostAgent CLI. Same runs as the web app's buttons (see agent/scenarios.js).
 *
 *   npm run agent                      pay a vendor invoice in NEAR
 *   npm run agent -- "your task"       any task
 *   npm run agent:inject               poisoned invoice asks to pay an attacker's "new account"
 *   npm run agent:jailbreak            model is told to ignore all rules and pay an attacker
 *   npm run agent:tamper               stolen agent key edits a real TEE decision (bigger amount)
 *   npm run agent:evm                  pay a vendor invoice in ETH on Sepolia via NEAR chain signatures
 *   npm run agent:forge                stolen agent key signs its own decision without the TEE (no NEAR AI key needed)
 */
import { formatNearAmount } from 'near-api-js';
import { CONFIG } from './config.js';
import { runScenario } from './scenarios.js';
import { view } from './vault.js';

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', orange: '\x1b[38;2;255;75;31m' };
const COLORS = { ok: C.green, err: C.red, attack: C.orange, dim: C.dim };

function print(event) {
  if (event.type !== 'log') return;
  const color = COLORS[event.level] ?? C.cyan;
  console.log(`${C.dim}${new Date().toISOString().slice(11, 19)}${C.reset} ${color}${C.bold}[${event.tag}]${C.reset} ${event.msg}`);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find((a) => a.startsWith('--'))?.slice(2) ?? 'run';
  const task = args.filter((a) => !a.startsWith('--')).join(' ') || undefined;
  console.log(`\n${C.orange}${C.bold}GhostAgent · ${mode} · vault ${CONFIG.vaultContract}${C.reset}\n`);
  const res = await runScenario(mode, { task, emit: print });
  console.log(`${res.ok ? C.green : C.red}${res.url}${C.reset}`);
  if (res.evm?.url) console.log(`${C.green}${res.evm.url}${C.reset}`);
  const s = await view('get_vault_state');
  console.log(`\n${C.bold}Vault${C.reset} spent today ${formatNearAmount(s.daily_spent_today)} / ${formatNearAmount(s.daily_budget_cap)} NEAR · executions ${s.execution_count} · frozen ${s.is_frozen}\n`);
}

main().catch((err) => {
  console.error(`\n${C.red}✗ ${err.message}${C.reset}\n`);
  process.exit(1);
});
