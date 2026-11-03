/**
 * Shows exactly what an execute_attested transaction made public: the decoded arguments as stored
 * on-chain, and whether they contain a reasoning trace or any of the given private strings.
 *
 * Usage: npm run inspect-tx -- <tx_hash> ["private text to look for" ...]
 */
import { JsonRpcProvider } from 'near-api-js';
import { CONFIG } from '../agent/config.js';

// Regular RPC nodes drop transactions after a few epochs; an archival node keeps them all
const ARCHIVAL_RPC = process.env.NEAR_ARCHIVAL_RPC_URL ||
  (CONFIG.network === 'mainnet' ? 'https://archival-rpc.mainnet.fastnear.com' : 'https://archival-rpc.testnet.fastnear.com');

async function main() {
  const [hash, ...secrets] = process.argv.slice(2);
  if (!hash) throw new Error('Usage: npm run inspect-tx -- <tx_hash> ["private text" ...]');

  const tx = await new JsonRpcProvider({ url: ARCHIVAL_RPC }).sendJsonRpc('EXPERIMENTAL_tx_status', {
    tx_hash: hash,
    sender_account_id: CONFIG.vaultContract,
    wait_until: 'NONE',
  });
  const call = tx.transaction.actions.find((a) => a.FunctionCall)?.FunctionCall;
  if (!call) throw new Error('Not a function call');
  const argsText = Buffer.from(call.args, 'base64').toString('utf8');
  const args = JSON.parse(argsText);
  const body = JSON.parse(args.attestation.response_body);
  const message = body.choices?.[0]?.message ?? {};

  console.log(`method        ${call.method_name}`);
  console.log(`public bytes  ${argsText.length}`);
  console.log(`signed text   ${args.attestation.signed_text}`);
  console.log(`message keys  ${Object.keys(message).join(', ')}`);
  console.log(`reasoning     ${message.reasoning_content ? `PRESENT (${message.reasoning_content.length} chars)` : 'none'}`);
  console.log(`content       ${message.content?.trim()}`);
  for (const secret of secrets) {
    console.log(`"${secret}"  ${argsText.includes(secret) ? 'FOUND in public args' : 'not on-chain'}`);
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
