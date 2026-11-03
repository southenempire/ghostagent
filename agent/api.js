/**
 * Local API for the web app. It holds the agent key, the NEAR AI key and (for this demo) the owner
 * key, so none of them reach the browser. Mounted into the Vite dev server (vite.config.js), so
 * `npm run dev` serves both the UI and /api.
 *
 *   GET  /api/config          vault, owner, payee and model ids
 *   POST /api/run             {mode, task?} → newline-delimited JSON events, last one {type:'result'};
 *                             task is the invoice text (kept in the local run log, never sent on-chain)
 *   GET  /api/runs            recent runs, including rejected attacks (which leave no vault record)
 *   GET  /api/attestation     NEAR AI attestation summary for the model's TEE signer
 *   GET  /api/evm             the vault's Sepolia address (chain signatures) and balance
 *   POST /api/owner/freeze    killswitch
 *   POST /api/owner/rearm
 *   POST /api/owner/setOwner  {newOwner} hand the vault to a wallet account
 * The owner routes only work while the demo owner key still owns the vault; after a hand-over the
 * user's wallet signs those actions in the browser instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, accountFromEnv } from './config.js';
import { DEFAULT_MODEL, getAttestationReport } from './nearai.js';
import { runScenario, SCENARIOS } from './scenarios.js';
import { call } from './vault.js';
import { evmExplorerAddress, getBalanceWei, vaultEvmAddress } from './evm.js';

const RUNS_FILE = path.join(CONFIG.root, '.data/runs.json');
const MAX_RUNS = 50;
const MAX_TASK_CHARS = 2000;
let busy = false;
let attestationCache;

function loadRuns() {
  try {
    return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveRun(run) {
  const runs = [run, ...loadRuns()].slice(0, MAX_RUNS);
  fs.mkdirSync(path.dirname(RUNS_FILE), { recursive: true });
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2));
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function handleRun(req, res) {
  const { mode = 'run', task } = await readBody(req);
  if (!SCENARIOS.includes(mode)) return json(res, 400, { error: `Unknown scenario '${mode}'` });
  if (task !== undefined && (typeof task !== 'string' || task.length > MAX_TASK_CHARS)) {
    return json(res, 400, { error: `Invoice text must be under ${MAX_TASK_CHARS} characters` });
  }
  if (busy) return json(res, 409, { error: 'Another run is in progress' });

  busy = true;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const logs = [];
  const run = { id: Date.now(), mode, task: task ?? null, startedAt: new Date().toISOString() };
  const emit = (event) => {
    const e = { ...event, at: new Date().toISOString() };
    if (e.type === 'log') logs.push(e);
    if (e.type === 'invoice') run.task = e.text;
    if (e.type === 'decision') Object.assign(run, { decision: e.plan, aiSigner: e.signer, requestHash: e.requestHash });
    res.write(`${JSON.stringify(e)}\n`);
  };

  try {
    const result = await runScenario(mode, { task, emit });
    Object.assign(run, { ok: result.ok, hash: result.hash, url: result.url, error: result.error, evm: result.evm });
  } catch (err) {
    emit({ type: 'log', tag: 'ERROR', level: 'err', msg: err.message });
    Object.assign(run, { ok: false, error: err.message, offChain: true });
  } finally {
    busy = false;
    run.logs = logs;
    saveRun(run);
    res.end(`${JSON.stringify({ type: 'result', ...run })}\n`);
  }
}

async function ownerCall(res, method, args = {}) {
  const { account } = accountFromEnv(CONFIG.ownerAccount, 'OWNER_SECRET_KEY');
  const result = await call(account, method, args, { gas: 30n * 10n ** 12n });
  saveRun({ id: Date.now(), mode: `owner:${method}`, startedAt: new Date().toISOString(), ...result });
  json(res, result.ok ? 200 : 400, result);
}

async function handleAttestation(res) {
  if (!attestationCache || Date.now() - attestationCache.fetchedAt > 10 * 60_000) {
    const model = CONFIG.nearAiModel || DEFAULT_MODEL;
    const { nonce, report } = await getAttestationReport(model);
    const candidates = (report.model_attestations ?? []).map((c) => ({
      signingAddress: c.signing_address,
      signingAlgo: c.signing_algo,
      nonceMatches: c.request_nonce === nonce,
      intelQuoteBytes: c.intel_quote ? c.intel_quote.length / 2 : 0,
      gpuEvidence: Boolean(c.nvidia_payload),
    }));
    attestationCache = { fetchedAt: Date.now(), model, nonce, candidates };
  }
  json(res, 200, attestationCache);
}

/** Connect-style middleware: (req, res, next). */
export function apiMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname.replace(/^\/api/, '')}`;
  const handlers = {
    'GET /config': () => json(res, 200, {
      network: CONFIG.network,
      rpcUrl: CONFIG.rpcUrl,
      vault: CONFIG.vaultContract,
      owner: CONFIG.ownerAccount,
      payee: CONFIG.payeeAccount,
      model: CONFIG.nearAiModel || DEFAULT_MODEL,
      busy,
    }),
    'POST /run': () => handleRun(req, res),
    'GET /runs': () => json(res, 200, loadRuns()),
    'GET /attestation': () => handleAttestation(res),
    'GET /evm': async () => {
      const address = await vaultEvmAddress();
      const balanceWei = (await getBalanceWei(address)).toString();
      json(res, 200, { chainId: CONFIG.evmChainId, chain: 'Ethereum Sepolia', address, balanceWei, explorer: evmExplorerAddress(address), explorerBase: CONFIG.evmExplorer });
    },
    'POST /owner/freeze': () => ownerCall(res, 'emergency_revoke_and_freeze'),
    'POST /owner/rearm': () => ownerCall(res, 'rearm_agent', { new_agent_pk: null }),
    // Hands the vault from the demo owner key to the user's own wallet account
    'POST /owner/setOwner': async () => {
      const { newOwner } = await readBody(req);
      return ownerCall(res, 'set_owner', { new_owner: newOwner });
    },
  };
  const handler = handlers[route];
  if (!handler) return next ? next() : json(res, 404, { error: 'Not found' });
  Promise.resolve(handler()).catch((err) => {
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  });
}
