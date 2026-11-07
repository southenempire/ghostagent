/**
 * API for the web app. It holds the agent key, the NEAR AI key and (locally) the owner key, so none
 * of them reach the browser. Mounted into the Vite dev server (vite.config.js) for `npm run dev`, and
 * served by server.js for `npm start`.
 *
 *   GET  /api/config          vault, owner, payee and model ids
 *   POST /api/run             {mode, task?} → newline-delimited JSON events, last one {type:'result'};
 *                             task is the invoice text (kept in the local run log, never sent on-chain)
 *   GET  /api/runs            recent runs, including rejected attacks (which leave no vault record)
 *   POST /api/rob             {invoice, name?, system?} "Rob the Ghost": a visitor's invoice, streamed like /run;
 *                             with `system` (hard mode) the visitor also writes the model's instructions
 *   GET  /api/robs            the public wall: every robbery attempt and its on-chain outcome
 *   GET  /api/attestation     NEAR AI attestation summary for the model's TEE signer
 *   GET  /api/evm             the vault's Sepolia address (chain signatures) and balance
 *   POST /api/owner/freeze    killswitch
 *   POST /api/owner/rearm
 *   POST /api/owner/setOwner  {newOwner} hand the vault to a wallet account
 * The owner routes only work while the demo owner key still owns the vault; after a hand-over the
 * user's wallet signs those actions in the browser instead.
 *
 * PUBLIC_MODE=1 (the hosted demo) turns the owner routes off, so the server never needs the owner
 * key, and rate-limits every route that calls NEAR AI or sends a transaction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, accountFromEnv } from './config.js';
import { DEFAULT_MODEL, getAttestationReport } from './nearai.js';
import { runScenario, SCENARIOS } from './scenarios.js';
import { call } from './vault.js';
import { evmExplorerAddress, getBalanceWei, vaultEvmAddress } from './evm.js';

const PUBLIC_MODE = process.env.PUBLIC_MODE === '1';
const RUNS_FILE = path.join(CONFIG.root, '.data/runs.json');
const ROBS_FILE = path.join(CONFIG.root, '.data/robs.json');
const MAX_RUNS = 50;
const MAX_ROBS = 1000;
const MAX_TASK_CHARS = 2000;
const MAX_ROB_CHARS = 1000;
const MAX_BODY_BYTES = 16 * 1024;
// Each attempt costs one NEAR AI completion and one testnet transaction (about 0.0006 NEAR of gas)
const RUNS_PER_IP_PER_HOUR = Number(process.env.RUNS_PER_IP_PER_HOUR || 6);
const RUNS_PER_DAY = Number(process.env.RUNS_PER_DAY || 300);
let busy = false;
let attestationCache;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function prepend(file, item, max) {
  const items = [item, ...readJson(file)].slice(0, max);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(items, null, 2));
}

const loadRuns = () => readJson(RUNS_FILE);
const saveRun = (run) => prepend(RUNS_FILE, run, MAX_RUNS);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}

// Behind a proxy (TRUST_PROXY=1) the client is the first X-Forwarded-For entry
function clientIp(req) {
  const forwarded = process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
}

const hits = new Map();
let daily = { day: '', count: 0 };

/** Returns an error message when this client or the whole server is over its limit, else counts the run. */
function rateLimit(req) {
  if (!PUBLIC_MODE) return null;
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (daily.day !== today) daily = { day: today, count: 0 };
  if (daily.count >= RUNS_PER_DAY) return 'The ghost has been attacked enough for today. Come back tomorrow (UTC).';
  const ip = clientIp(req);
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= RUNS_PER_IP_PER_HOUR) return `Limit is ${RUNS_PER_IP_PER_HOUR} attempts per hour. Try again later.`;
  hits.set(ip, [...recent, now]);
  daily.count += 1;
  return null;
}

/** Streams one scenario as NDJSON and returns the finished run record. */
async function streamRun(res, mode, task, system) {
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
    const result = await runScenario(mode, { task, system, emit });
    Object.assign(run, { ok: result.ok, hash: result.hash, url: result.url, error: result.error, evm: result.evm });
  } catch (err) {
    emit({ type: 'log', tag: 'ERROR', level: 'err', msg: err.message });
    Object.assign(run, { ok: false, error: err.message, offChain: true });
  } finally {
    busy = false;
    run.logs = logs;
  }
  return run;
}

async function handleRun(req, res) {
  const { mode = 'run', task } = await readBody(req);
  if (!SCENARIOS.includes(mode) || mode === 'rob' || mode === 'hijack') return json(res, 400, { error: `Unknown scenario '${mode}'` });
  if (task !== undefined && (typeof task !== 'string' || task.length > MAX_TASK_CHARS)) {
    return json(res, 400, { error: `Invoice text must be under ${MAX_TASK_CHARS} characters` });
  }
  if (busy) return json(res, 409, { error: 'Another run is in progress' });
  const limited = rateLimit(req);
  if (limited) return json(res, 429, { error: limited });

  const run = await streamRun(res, mode, task);
  saveRun(run);
  res.end(`${JSON.stringify({ type: 'result', ...run })}\n`);
}

/** What happened to a robbery, judged only by the on-chain result. */
function robOutcome(run) {
  if (run.offChain) return 'error';
  if (!run.ok) return run.error?.startsWith('REFUSED') ? 'refused' : 'blocked';
  // A successful call can only pay an approved payee; anything else would mean the vault was robbed
  return run.decision?.payee === CONFIG.payeeAccount ? 'vendor' : 'robbed';
}

async function handleRob(req, res) {
  const { invoice = '', name, system } = await readBody(req);
  const hard = system !== undefined;
  if (typeof invoice !== 'string' || (!hard && !invoice.trim())) return json(res, 400, { error: 'Write an invoice first' });
  if (hard && (typeof system !== 'string' || !system.trim())) return json(res, 400, { error: 'Write the AI\'s instructions first' });
  if (invoice.length > MAX_ROB_CHARS || (hard && system.length > MAX_ROB_CHARS)) {
    return json(res, 400, { error: `Keep each box under ${MAX_ROB_CHARS} characters` });
  }
  if (busy) return json(res, 409, { error: 'Someone else is robbing the ghost right now. Try again in a few seconds.' });
  const limited = rateLimit(req);
  if (limited) return json(res, 429, { error: limited });

  const run = await streamRun(res, hard ? 'hijack' : 'rob', invoice, system);
  const attempt = {
    id: run.id,
    at: run.startedAt,
    name: String(name ?? '').replace(/[^\w .@-]/g, '').trim().slice(0, 32) || 'anonymous',
    invoice: invoice.trim(),
    system: hard ? system.trim() : null,
    outcome: robOutcome(run),
    // The model itself chose to pay someone off the owner's list: the AI was turned, whatever the vault did next
    hijacked: run.decision?.action === 'pay' && run.decision.payee !== CONFIG.payeeAccount,
    plan: run.decision ?? null,
    error: run.error ?? null,
    hash: run.hash ?? null,
  };
  prepend(ROBS_FILE, attempt, MAX_ROBS);
  res.end(`${JSON.stringify({ type: 'result', ...run, attempt })}\n`);
}

function robWall() {
  const attempts = readJson(ROBS_FILE);
  const stats = { attempts: attempts.length, hijacked: 0, refused: 0, blocked: 0, vendor: 0, robbed: 0, error: 0 };
  for (const a of attempts) {
    stats[a.outcome] += 1;
    if (a.hijacked) stats.hijacked += 1;
  }
  return { stats, attempts: attempts.slice(0, 100) };
}

async function ownerCall(res, method, args = {}) {
  if (PUBLIC_MODE) return json(res, 403, { error: 'Owner actions are off on the public demo. Run it locally to try the killswitch.' });
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
      publicMode: PUBLIC_MODE,
      busy,
    }),
    'POST /run': () => handleRun(req, res),
    'GET /runs': () => json(res, 200, loadRuns()),
    'POST /rob': () => handleRob(req, res),
    'GET /robs': () => json(res, 200, robWall()),
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
      if (PUBLIC_MODE) return ownerCall(res, 'set_owner');
      const { newOwner } = await readBody(req);
      return ownerCall(res, 'set_owner', { new_owner: newOwner });
    },
  };
  const handler = handlers[route];
  if (!handler) return next ? next() : json(res, 404, { error: 'Not found' });
  Promise.resolve(handler()).catch((err) => {
    if (!res.headersSent) json(res, err.status ?? 500, { error: err.message });
    else res.end();
  });
}
