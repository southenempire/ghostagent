/**
 * Thin wrappers around the GhostVault contract: views over RPC, and calls that report failures
 * instead of throwing, so a rejected agent action still shows its on-chain tx hash.
 */
import { actions } from 'near-api-js';
import { CONFIG, getProvider, explorerTx } from './config.js';

export async function view(method, args = {}, contractId = CONFIG.vaultContract) {
  const res = await getProvider().query({
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(res.result).toString('utf8'));
}

/** Like view, but returns the contract's panic message instead of throwing. */
export async function tryView(method, args = {}, contractId = CONFIG.vaultContract) {
  try {
    return { ok: true, value: await view(method, args, contractId) };
  } catch (err) {
    return { ok: false, error: panicMessage(err.message) };
  }
}

export function panicMessage(text = '') {
  const s = String(text);
  const m = s.match(/Smart contract panicked:\s*([^"\n}]+)/)
    ?? s.match(/panic_msg:\s*\\?"([^"\\]+)/)
    ?? s.match(/ExecutionError[:\s"]*([^"\n}]+)/);
  return (m ? m[1] : s).trim();
}

/** Sends one function call and summarizes the outcome, including failures. */
export async function call(account, methodName, args, { contractId = CONFIG.vaultContract, gas = 150n * 10n ** 12n, deposit = 0n } = {}) {
  const outcome = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall(methodName, args, gas, deposit)],
    waitUntil: 'FINAL',
    throwOnFailure: false,
  });
  const hash = outcome.transaction.hash;
  const logs = [outcome.transaction_outcome, ...outcome.receipts_outcome].flatMap((o) => o.outcome.logs);
  const failure = [outcome.transaction_outcome, ...outcome.receipts_outcome]
    .map((o) => o.outcome.status?.Failure)
    .find(Boolean) ?? outcome.status?.Failure;
  let value;
  if (outcome.status?.SuccessValue) {
    const raw = Buffer.from(outcome.status.SuccessValue, 'base64').toString('utf8');
    try { value = JSON.parse(raw); } catch { value = raw; }
  }
  return {
    ok: !failure,
    hash,
    url: explorerTx(hash),
    logs,
    value,
    error: failure ? panicMessage(JSON.stringify(failure)) : undefined,
  };
}
