import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 10000;

/** yoctoNEAR string → number of NEAR (fine for display) */
export function toNear(yocto) {
  if (yocto === undefined || yocto === null) return 0;
  // 6 decimals is plenty for display and avoids float noise like 0.04999999
  return Number(BigInt(yocto) / 10n ** 18n) / 1e6;
}

export function explorerTx(network, hash) {
  return `https://${network === 'mainnet' ? '' : 'testnet.'}nearblocks.io/txns/${hash}`;
}

export function explorerAccount(network, account) {
  return `https://${network === 'mainnet' ? '' : 'testnet.'}nearblocks.io/address/${account}`;
}

async function rpcView(rpcUrl, accountId, method, args = {}) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: method,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'optimistic',
        account_id: accountId,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const data = await res.json();
  if (data.error || data.result?.error) throw new Error(data.error?.cause?.name || data.result?.error || 'RPC error');
  return JSON.parse(new TextDecoder().decode(new Uint8Array(data.result.result)));
}

async function api(path, options) {
  const res = await fetch(`/api${path}`, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/**
 * Live view of the GhostVault contract (read straight from NEAR RPC) plus the local agent API
 * that runs scenarios and owner actions.
 */
export function useGhostVault(wallet) {
  const [config, setConfig] = useState(null);
  const [state, setState] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [step, setStep] = useState(null);
  const [running, setRunning] = useState(null);
  const [error, setError] = useState('');
  const configRef = useRef(null);

  const refresh = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    try {
      const [s, e, r] = await Promise.all([
        rpcView(cfg.rpcUrl, cfg.vault, 'get_vault_state'),
        rpcView(cfg.rpcUrl, cfg.vault, 'get_executions', { limit: 50 }),
        api('/runs'),
      ]);
      setState(s);
      setExecutions(e);
      setRuns(r);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    // Load once even in a background tab; only the polling pauses while hidden
    const poll = () => document.visibilityState === 'visible' && refresh();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    api('/config')
      .then((cfg) => {
        configRef.current = cfg;
        setConfig(cfg);
        refresh();
      })
      .catch((err) => setError(`Agent API unreachable: ${err.message}`));
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refresh]);

  /** Streams a run's events into `logs`; resolves with the final result event. */
  const stream = useCallback(async (label, path, body) => {
    if (running) return null;
    setRunning(label);
    setStep('plan');
    setLogs((prev) => [...prev, { tag: 'RUN', level: 'head', msg: `── ${label} ──`, at: new Date().toISOString() }]);
    let result = null;
    try {
      const res = await fetch(`/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === 'log') setLogs((prev) => [...prev, event]);
          if (event.type === 'step') setStep(event.step);
          if (event.type === 'result') result = event;
        }
      }
    } catch (err) {
      setLogs((prev) => [...prev, { tag: 'ERROR', level: 'err', msg: err.message, at: new Date().toISOString() }]);
      setStep('rejected');
    } finally {
      setRunning(null);
      refresh();
    }
    return result;
  }, [running, refresh]);

  const runScenario = useCallback((mode, task) => stream(mode, '/run', { mode, task }), [stream]);
  /** "Rob the Ghost": a visitor's own invoice, recorded on the public wall */
  const rob = useCallback((invoice, name, system) => stream('rob', '/rob', { invoice, name, system }), [stream]);

  /**
   * Owner actions are signed by whoever owns the vault on-chain: the connected wallet when it is the
   * owner, otherwise the demo owner key held by the local agent API.
   */
  const ownerAction = useCallback(async (action, args = {}) => {
    const methods = {
      freeze: ['emergency_revoke_and_freeze', {}],
      rearm: ['rearm_agent', { new_agent_pk: null }],
      setOwner: ['set_owner', { new_owner: args.newOwner }],
    };
    const [method, callArgs] = methods[action];
    const owner = state?.owner_id;
    let result;
    let signer;
    if (wallet?.accountId && wallet.accountId === owner) {
      signer = `wallet ${wallet.accountId}`;
      result = await wallet.callContract(configRef.current.vault, method, callArgs);
    } else if (owner && owner === configRef.current?.owner) {
      signer = 'demo owner key';
      const res = await fetch(`/api/owner/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      result = await res.json();
    } else {
      result = { ok: false, error: `Only ${owner} can do this. Connect that wallet.` };
    }
    setLogs((prev) => [...prev, {
      tag: 'OWNER', level: result.ok ? 'ok' : 'err', at: new Date().toISOString(),
      msg: `${method}${signer ? ` signed by ${signer}` : ''} ${result.ok ? 'confirmed' : `failed: ${result.error}`}${result.hash ? ` · ${result.hash}` : ''}`,
    }]);
    await refresh();
    return result;
  }, [refresh, state?.owner_id, wallet]);

  return { config, state, executions, runs, logs, step, running, error, refresh, runScenario, rob, ownerAction };
}
