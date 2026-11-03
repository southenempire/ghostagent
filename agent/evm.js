/**
 * The vault's EVM wallet on Ethereum Sepolia, controlled by NEAR Chain Signatures.
 * The address is derived from the MPC root key, the vault account and the path `ghost/evm`; nobody
 * holds its private key. The vault contract builds and requests signatures for transfers itself,
 * this module only reads chain state, reassembles the signed transaction and broadcasts it.
 */
import { baseDecode } from 'near-api-js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { CONFIG } from './config.js';
import { view } from './vault.js';

export const EVM_PATH = 'ghost/evm';
const TRANSFER_GAS_LIMIT = 21000n;

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const toBig = (v) => BigInt(v);

export function evmExplorerTx(hash) {
  return `${CONFIG.evmExplorer}/tx/${hash}`;
}
export function evmExplorerAddress(address) {
  return `${CONFIG.evmExplorer}/address/${address}`;
}

async function rpc(method, params = []) {
  const res = await fetch(CONFIG.evmRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`EVM RPC ${method}: ${body.error.message}`);
  return body.result;
}

/** 64-byte uncompressed (x||y) public key the MPC network derives for this vault and path. */
export async function derivedPublicKey() {
  const key = await view('derived_public_key', { path: EVM_PATH, predecessor: CONFIG.vaultContract, domain_id: 0 }, CONFIG.mpcSignerContract);
  return Buffer.from(baseDecode(key.replace(/^secp256k1:/, '')));
}

export async function vaultEvmAddress() {
  return `0x${hex(keccak_256(await derivedPublicKey()).slice(12))}`;
}

export async function getBalanceWei(address) {
  return toBig(await rpc('eth_getBalance', [address, 'latest']));
}

/** Nonce and EIP-1559 fees for the next transfer, in the shape execute_attested expects. */
export async function nextTxParams(address) {
  const [nonce, block, tip] = await Promise.all([
    rpc('eth_getTransactionCount', [address, 'pending']),
    rpc('eth_getBlockByNumber', ['latest', false]),
    rpc('eth_maxPriorityFeePerGas').catch(() => '0x3b9aca00'), // 1 gwei
  ]);
  // Floor of 0.1 gwei so the transfer gets picked up even when the suggested tip is a few wei
  const priority = toBig(tip) > 100_000_000n ? toBig(tip) : 100_000_000n;
  const maxFee = toBig(block.baseFeePerGas) * 2n + priority;
  return {
    nonce: Number(toBig(nonce)),
    max_fee_per_gas: maxFee.toString(),
    max_priority_fee_per_gas: priority.toString(),
  };
}

/* ---------------------------------- RLP ----------------------------------- */

function lengthPrefix(len, short, long) {
  if (len <= 55) return Buffer.from([short + len]);
  const be = Buffer.from(len.toString(16).padStart(len.toString(16).length + (len.toString(16).length % 2), '0'), 'hex');
  return Buffer.concat([Buffer.from([long + be.length]), be]);
}
function rlpBytes(b) {
  b = Buffer.from(b);
  if (b.length === 1 && b[0] < 0x80) return b;
  return Buffer.concat([lengthPrefix(b.length, 0x80, 0xb7), b]);
}
function rlpUint(v) {
  v = BigInt(v);
  if (v === 0n) return rlpBytes(Buffer.alloc(0));
  let h = v.toString(16);
  if (h.length % 2) h = `0${h}`;
  return rlpBytes(Buffer.from(h, 'hex'));
}
function rlpList(items) {
  const body = Buffer.concat(items);
  return Buffer.concat([lengthPrefix(body.length, 0xc0, 0xf7), body]);
}

function txFields({ chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, to, value }) {
  return [
    rlpUint(chainId),
    rlpUint(nonce),
    rlpUint(maxPriorityFeePerGas),
    rlpUint(maxFeePerGas),
    rlpUint(TRANSFER_GAS_LIMIT),
    rlpBytes(Buffer.from(to.replace(/^0x/, ''), 'hex')),
    rlpUint(value),
    rlpBytes(Buffer.alloc(0)),
    rlpList([]),
  ];
}

/** Same hash the contract computes (contracts/ghostvault/src/evm.rs). */
export function signingHash(tx) {
  return Buffer.from(keccak_256(Buffer.concat([Buffer.from([0x02]), rlpList(txFields(tx))])));
}

/**
 * Turns the MPC signer's response ({big_r:{affine_point}, s:{scalar}, recovery_id}) into a raw
 * signed transaction, after checking it recovers to the vault's EVM address.
 */
export function assembleSignedTx(tx, mpcSignature, expectedAddress) {
  const r = Buffer.from(mpcSignature.big_r.affine_point, 'hex').subarray(1, 33);
  const s = Buffer.from(mpcSignature.s.scalar, 'hex');
  const yParity = mpcSignature.recovery_id;

  const hash = signingHash(tx);
  const recovered = secp256k1.recoverPublicKey(Buffer.concat([Buffer.from([yParity]), r, s]), hash, { prehash: false });
  const uncompressed = secp256k1.Point.fromBytes(recovered).toBytes(false);
  const signer = `0x${hex(keccak_256(uncompressed.slice(1)).slice(12))}`;
  if (signer !== expectedAddress.toLowerCase()) throw new Error(`MPC signature recovers to ${signer}, expected ${expectedAddress}`);

  const signed = rlpList([...txFields(tx), rlpUint(yParity), rlpUint(`0x${hex(r)}`), rlpUint(`0x${hex(s)}`)]);
  return `0x02${hex(signed)}`;
}

export async function broadcast(rawTx) {
  return rpc('eth_sendRawTransaction', [rawTx]);
}

export async function waitForReceipt(hash, { timeoutMs = 90_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await rpc('eth_getTransactionReceipt', [hash]);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}
