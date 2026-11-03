/**
 * One-time testnet setup, run by the owner:
 *   1. create the vault sub-account and an approved payee account (a demo "data API" the agent may pay)
 *   2. deploy GhostVault and initialize it with the owner's policy
 *   3. give the agent a function-call key that can only call execute_attested
 *
 * Usage: npm run contract:build && npm run setup
 * Skips steps that are already done, so it is safe to re-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { KeyPair, parseNearAmount } from 'near-api-js';
import { CONFIG, accountFromEnv, explorerTx, getProvider } from '../agent/config.js';
import { call, tryView } from '../agent/vault.js';

const WASM = path.join(CONFIG.root, 'contracts/ghostvault/target/ghostvault.opt.wasm');
const DAILY_CAP_NEAR = process.env.DAILY_CAP_NEAR || '1';
const VAULT_FUNDING_NEAR = '4'; // ~2.5 NEAR covers contract storage, the rest is spendable budget

async function exists(accountId) {
  try {
    await getProvider().query({ request_type: 'view_account', finality: 'final', account_id: accountId });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { account: owner, publicKey: ownerPk } = accountFromEnv(CONFIG.ownerAccount, 'OWNER_SECRET_KEY');
  const agentPk = KeyPair.fromString(process.env.AGENT_SECRET_KEY).getPublicKey().toString();
  const vaultId = CONFIG.vaultContract;
  const payeeId = CONFIG.payeeAccount;

  if (!vaultId.endsWith(`.${CONFIG.ownerAccount}`) || !payeeId.endsWith(`.${CONFIG.ownerAccount}`)) {
    throw new Error('VAULT_CONTRACT and PAYEE_ACCOUNT must be sub-accounts of OWNER_ACCOUNT');
  }
  if (!fs.existsSync(WASM)) throw new Error(`Missing ${WASM}. Run: npm run contract:build`);

  console.log(`Owner ${CONFIG.ownerAccount}\nVault ${vaultId}\nPayee ${payeeId}\nAgent ${agentPk}\n`);

  for (const [id, near] of [[vaultId, VAULT_FUNDING_NEAR], [payeeId, '0.1']]) {
    if (await exists(id)) {
      console.log(`✓ ${id} exists`);
      continue;
    }
    const tx = await owner.createSubAccount({
      accountOrPrefix: id.split('.')[0],
      publicKey: ownerPk,
      nearToTransfer: BigInt(parseNearAmount(near)),
    });
    console.log(`✓ created ${id} with ${near} NEAR  ${explorerTx(tx.transaction.hash)}`);
  }

  // The owner key is also a full-access key on the vault sub-account, used only to deploy code
  const { account: vault } = accountFromEnv(vaultId, 'OWNER_SECRET_KEY');

  const deployed = await tryView('get_vault_state');
  if (deployed.ok) {
    console.log('✓ vault already initialized');
  } else {
    const deploy = await vault.deployContract(fs.readFileSync(WASM));
    console.log(`✓ deployed contract  ${explorerTx(deploy.transaction.hash)}`);
    const init = await call(vault, 'new', {
      owner_id: CONFIG.ownerAccount,
      agent_pk: agentPk,
      daily_budget_cap: parseNearAmount(DAILY_CAP_NEAR),
      attested_signers: [],
      approved_payees: [payeeId],
      mpc_signer_contract: CONFIG.mpcSignerContract,
    });
    if (!init.ok) throw new Error(`init failed: ${init.error}`);
    console.log(`✓ initialized: cap ${DAILY_CAP_NEAR} NEAR/day, payee ${payeeId}  ${init.url}`);
  }

  const keys = await getProvider().query({ request_type: 'view_access_key_list', finality: 'final', account_id: vaultId });
  if (keys.keys.some((k) => k.public_key === agentPk)) {
    console.log('✓ agent key already on vault');
  } else {
    const tx = await vault.addFunctionCallAccessKey({
      publicKey: agentPk,
      contractId: vaultId,
      methodNames: ['execute_attested'],
      allowance: BigInt(parseNearAmount('1')), // gas only; the key cannot move vault funds itself
    });
    console.log(`✓ agent key limited to execute_attested  ${explorerTx(tx.transaction.hash)}`);
  }

  console.log('\nNext: npm run approve-signer   (approves the NEAR AI TEE signing address)');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
