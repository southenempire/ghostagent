/**
 * Owner step: fetch the NEAR AI attestation report for the agent's model and approve its TEE
 * signing address on the vault. Only decisions signed by an approved address can spend.
 *
 * This checks that the report answers our fresh nonce and names the signing address. Full TDX/GPU
 * quote verification is done with NEAR AI's verifier (https://github.com/nearai/nearai-cloud-verifier);
 * pass --address 0x... to approve an address you verified that way.
 */
import { CONFIG, accountFromEnv } from '../agent/config.js';
import { DEFAULT_MODEL, getAttestationReport } from '../agent/nearai.js';
import { call, view } from '../agent/vault.js';

async function main() {
  const model = CONFIG.nearAiModel || DEFAULT_MODEL;
  const argIdx = process.argv.indexOf('--address');
  let addresses = argIdx > 0 ? [process.argv[argIdx + 1]] : [];

  if (!addresses.length) {
    console.log(`Fetching attestation report for ${model}...`);
    const { nonce, report } = await getAttestationReport(model);
    const candidates = report.model_attestations ?? [];
    if (!candidates.length) throw new Error('Report has no model_attestations: model is not TEE-attested');
    for (const c of candidates) {
      if (c.request_nonce && c.request_nonce !== nonce) throw new Error('Report does not answer our nonce');
      if (c.signing_algo && c.signing_algo !== 'ecdsa') continue;
      console.log(`  TEE signer ${c.signing_address} (quote ${c.intel_quote ? `${c.intel_quote.length / 2} bytes` : 'missing'}${c.nvidia_payload ? ', GPU evidence present' : ''})`);
      addresses.push(c.signing_address);
    }
  }

  const { account: owner } = accountFromEnv(CONFIG.ownerAccount, 'OWNER_SECRET_KEY');
  const approved = new Set((await view('get_vault_state')).attested_signers);
  for (const address of new Set(addresses.map((a) => a.toLowerCase()))) {
    if (approved.has(address)) {
      console.log(`✓ ${address} already approved`);
      continue;
    }
    const res = await call(owner, 'add_attested_signer', { address });
    console.log(res.ok ? `✓ approved ${address}  ${res.url}` : `✗ ${res.error}`);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
