/**
 * NEAR AI Cloud client: private inference in a TEE, plus the per-response signature that lets the
 * GhostVault contract check on-chain that a decision really came from that TEE.
 * Docs: https://docs.near.ai/cloud/verification/cloud-api/response-signatures
 */
import crypto from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { CONFIG, requireEnv } from './config.js';

// Runs on NEAR AI's own TEE GPU fleet, so signatures are provider_tee (model-level), not just gateway
export const DEFAULT_MODEL = 'Qwen/Qwen3.6-35B-A3B-FP8';

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

function headers() {
  return {
    Authorization: `Bearer ${requireEnv('NEARAI_API_KEY')}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // Fail instead of silently routing to another model: the model id is part of the signed text
    'x-no-aliasing': 'true',
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: headers() });
  const text = await res.text();
  if (!res.ok) throw new Error(`NEAR AI ${res.status} on ${url}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/**
 * Runs one chat completion and returns the exact request/response bytes, because the TEE signs
 * sha256 of those bytes. Re-serializing the JSON would break the signature.
 */
export async function chat(messages, { model = CONFIG.nearAiModel || DEFAULT_MODEL, temperature = 0 } = {}) {
  // Thinking off: the signed response body goes on-chain in full, and a reasoning trace would quote the
  // private prompt (the invoice). With it off, the response carries only the short JSON decision.
  const requestBody = JSON.stringify({ model, messages, temperature, stream: false, chat_template_kwargs: { enable_thinking: false } });
  const res = await fetch(`${CONFIG.nearAiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: requestBody,
  });
  const responseBody = await res.text();
  if (!res.ok) throw new Error(`NEAR AI ${res.status}: ${responseBody.slice(0, 300)}`);
  const json = JSON.parse(responseBody);
  return {
    id: json.id,
    model,
    content: json.choices?.[0]?.message?.content ?? '',
    requestBody,
    responseBody,
    requestHash: sha256Hex(requestBody),
    responseHash: sha256Hex(responseBody),
  };
}

/** Signature over "<model>:<request_sha256>:<response_sha256>". It can lag the completion slightly. */
export async function getSignature(chatId, { model, attempts = 8 } = {}) {
  const url = new URL(`${CONFIG.nearAiBaseUrl}/signature/${encodeURIComponent(chatId)}`);
  url.searchParams.set('signing_algo', 'ecdsa');
  if (model) url.searchParams.set('model', model);
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const sig = await getJson(url);
      if (sig.signature && sig.text) return sig;
      lastError = new Error(sig.message || 'signature not ready');
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 750 * (i + 1)));
  }
  throw new Error(`No TEE signature for ${chatId}: ${lastError?.message}`);
}

/** Attestation report for the model. The owner checks it before approving its signing_address on-chain. */
export async function getAttestationReport(model = CONFIG.nearAiModel || DEFAULT_MODEL) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const url = new URL(`${CONFIG.nearAiBaseUrl}/attestation/report`);
  url.searchParams.set('model', model);
  url.searchParams.set('provider', 'near');
  url.searchParams.set('signing_algo', 'ecdsa');
  url.searchParams.set('include_tls_fingerprint', 'false');
  url.searchParams.set('nonce', nonce);
  return { nonce, report: await getJson(url) };
}

/** Same EIP-191 recovery the contract does, so the agent can check before spending gas. */
export function recoverSigner(text, signatureHex) {
  const sig = Buffer.from(signatureHex.replace(/^0x/, ''), 'hex');
  if (sig.length !== 65) throw new Error('signature must be 65 bytes');
  const v = sig[64] >= 27 ? sig[64] - 27 : sig[64];
  const msg = Buffer.from(`\x19Ethereum Signed Message:\n${Buffer.byteLength(text)}${text}`, 'utf8');
  const hash = keccak_256(msg);
  const recovered = Buffer.concat([Buffer.from([v]), sig.subarray(0, 64)]);
  const pub = secp256k1.recoverPublicKey(recovered, hash, { prehash: false });
  const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
  return `0x${Buffer.from(keccak_256(uncompressed.slice(1)).slice(12)).toString('hex')}`;
}

/** Completion + signature, checked locally, in the shape GhostVault.execute_attested expects. */
export async function attestedDecision(messages, opts = {}) {
  const completion = await chat(messages, opts);
  const message = JSON.parse(completion.responseBody).choices?.[0]?.message ?? {};
  if (message.reasoning_content || message.reasoning) {
    // This body would be published on-chain verbatim; never leak the model's private reasoning
    throw new Error('Model returned a reasoning trace; refusing to put it on-chain');
  }
  const sig = await getSignature(completion.id, { model: completion.model });
  const signer = recoverSigner(sig.text, sig.signature);
  if (sig.signing_address && signer !== sig.signing_address.toLowerCase()) {
    throw new Error(`Signature recovers to ${signer}, NEAR AI reported ${sig.signing_address}`);
  }
  if (!sig.text.endsWith(`:${completion.requestHash}:${completion.responseHash}`)) {
    throw new Error('Signed text does not match the exact request/response bytes we sent and received');
  }
  return {
    completion,
    signer,
    signatureKind: sig.signature_kind,
    attestation: { response_body: completion.responseBody, signed_text: sig.text, signature: sig.signature },
  };
}
