/**
 * Shared configuration. Secrets come from .env (see .env.example), never from the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonRpcProvider, Account, KeyPair, KeyPairSigner } from 'near-api-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

export const CONFIG = {
  root: ROOT,
  network: process.env.NEAR_NETWORK || 'testnet',
  rpcUrl: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  ownerAccount: process.env.OWNER_ACCOUNT || 'ghostagent-vault-01.testnet',
  vaultContract: process.env.VAULT_CONTRACT || 'vault.ghostagent-vault-01.testnet',
  payeeAccount: process.env.PAYEE_ACCOUNT || 'data-api.ghostagent-vault-01.testnet',
  mpcSignerContract: process.env.MPC_SIGNER_CONTRACT || 'v1.signer-prod.testnet',
  evmRpcUrl: process.env.EVM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  evmExplorer: process.env.EVM_EXPLORER || 'https://sepolia.etherscan.io',
  evmChainId: Number(process.env.EVM_CHAIN_ID || 11155111),
  nearAiBaseUrl: process.env.NEARAI_BASE_URL || 'https://cloud-api.near.ai/v1',
  nearAiApiKey: process.env.NEARAI_API_KEY || '',
  nearAiModel: process.env.NEARAI_MODEL || '',
};

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env (see .env.example).`);
  return value;
}

export function getProvider() {
  return new JsonRpcProvider({ url: CONFIG.rpcUrl });
}

export function explorerTx(hash) {
  return `https://${CONFIG.network === 'mainnet' ? '' : 'testnet.'}nearblocks.io/txns/${hash}`;
}

/** Account that signs with the given secret key env var (OWNER_SECRET_KEY or AGENT_SECRET_KEY). */
export function accountFromEnv(accountId, secretEnvName) {
  const keyPair = KeyPair.fromString(requireEnv(secretEnvName));
  return {
    account: new Account(accountId, getProvider(), new KeyPairSigner(keyPair)),
    publicKey: keyPair.getPublicKey().toString(),
  };
}
