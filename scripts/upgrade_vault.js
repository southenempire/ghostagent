/**
 * Upgrades the deployed vault to the current contract and configures the EVM (Sepolia) policy.
 *   1. deploy contracts/ghostvault/target/ghostvault.opt.wasm to the vault account
 *   2. call migrate() if the stored state is still the v0.2 layout
 *   3. owner sets the ETH daily cap and approves the EVM supplier address
 *
 * Usage: npm run contract:build && npm run upgrade
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, accountFromEnv, explorerTx } from '../agent/config.js';
import { call, view } from '../agent/vault.js';
import { vaultEvmAddress } from '../agent/evm.js';

const WASM = path.join(CONFIG.root, 'contracts/ghostvault/target/ghostvault.opt.wasm');
const EVM_DAILY_CAP_WEI = process.env.EVM_DAILY_CAP_WEI || '1000000000000000'; // 0.001 ETH

/** Demo supplier on Sepolia. Kept in .env so it stays the same across runs. */
function evmPayee() {
  if (process.env.EVM_PAYEE) return process.env.EVM_PAYEE.toLowerCase();
  const address = `0x${crypto.randomBytes(20).toString('hex')}`;
  fs.appendFileSync(path.join(CONFIG.root, '.env'), `\n# Demo supplier the agent may pay on Sepolia\nEVM_PAYEE=${address}\n`);
  return address;
}

async function main() {
  const { account: vaultAccount } = accountFromEnv(CONFIG.vaultContract, 'OWNER_SECRET_KEY');
  const deploy = await vaultAccount.deployContract(fs.readFileSync(WASM));
  console.log(`✓ deployed new code  ${explorerTx(deploy.transaction.hash)}`);

  const state = await view('get_vault_state').catch(() => null);
  if (!state || state.evm_chain_id === undefined) {
    const res = await call(vaultAccount, 'migrate', {});
    if (!res.ok) throw new Error(`migrate failed: ${res.error}`);
    console.log(`✓ migrated state to v0.3  ${res.url}`);
  } else {
    console.log('✓ state already on v0.3');
  }

  const after = await view('get_vault_state');
  const { account: owner } = accountFromEnv(after.owner_id, 'OWNER_SECRET_KEY');
  if (after.owner_id !== CONFIG.ownerAccount) {
    console.log(`! vault is owned by ${after.owner_id}; set the EVM policy from that wallet`);
    return;
  }

  if (after.evm_daily_cap_wei !== EVM_DAILY_CAP_WEI) {
    const res = await call(owner, 'set_evm_policy', { daily_cap_wei: EVM_DAILY_CAP_WEI, max_fee_per_gas: null });
    console.log(res.ok ? `✓ EVM daily cap ${Number(EVM_DAILY_CAP_WEI) / 1e18} ETH  ${res.url}` : `✗ ${res.error}`);
  }
  const payee = evmPayee();
  if (!after.evm_payees.includes(payee)) {
    const res = await call(owner, 'add_evm_payee', { address: payee });
    console.log(res.ok ? `✓ approved EVM supplier ${payee}  ${res.url}` : `✗ ${res.error}`);
  }

  const evmAddress = await vaultEvmAddress();
  console.log(`\nVault's Sepolia address (NEAR chain signatures, path ghost/evm): ${evmAddress}`);
  console.log(`Fund it with a little Sepolia ETH, then run: npm run agent:evm`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
