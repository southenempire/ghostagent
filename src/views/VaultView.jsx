import React, { useEffect, useState } from 'react';
import { toNear, explorerAccount } from '../lib/useGhostVault';

const CHECKS = [
  { title: 'Agent key', desc: 'Only the agent\'s function-call key (or the owner) may call execute_attested. The key cannot call anything else.' },
  { title: 'TEE signature', desc: 'The decision\'s ECDSA signature must recover to a NEAR AI TEE signer the owner approved. Checked with ecrecover on-chain.' },
  { title: 'Exact response', desc: 'sha256 of the response body must equal the hash inside the signed text, so the plan cannot be edited. Each hash executes once.' },
  { title: 'Owner policy', desc: 'Fresh (<10 min), for this vault, approved payee, under the daily cap, vault not frozen. Then the NEAR moves.' },
];

async function accessKey(rpcUrl, accountId, publicKey) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'ak', method: 'query', params: { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey } }),
  });
  return (await res.json()).result;
}

export function VaultView({ vault, wallet, onOpenKillswitch }) {
  const { config, state, ownerAction } = vault;
  const [agentKey, setAgentKey] = useState(null);
  const [evm, setEvm] = useState(null);
  const [handover, setHandover] = useState({ busy: false, msg: '' });
  const network = config?.network ?? 'testnet';

  useEffect(() => {
    fetch('/api/evm').then((r) => r.json()).then(setEvm).catch(() => {});
  }, [state?.execution_count]);

  const owner = state?.owner_id;
  const walletIsOwner = Boolean(wallet.accountId) && wallet.accountId === owner;
  const demoKeyIsOwner = Boolean(owner) && owner === config?.owner;

  const changeOwner = async (newOwner) => {
    setHandover({ busy: true, msg: '' });
    const res = await ownerAction('setOwner', { newOwner });
    setHandover({ busy: false, msg: res.ok ? `Owner is now ${newOwner}` : `✕ ${res.error}` });
  };

  useEffect(() => {
    if (config && state?.agent_pk) accessKey(config.rpcUrl, config.vault, state.agent_pk).then(setAgentKey).catch(() => {});
  }, [config, state?.agent_pk]);

  const perm = agentKey?.permission?.FunctionCall;

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)' }}>
      <div className="three-col">
        <Panel label="VAULT CONTRACT" title="The vault.">
          <Field label="Contract">
            {config ? <a href={explorerAccount(network, config.vault)} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{config.vault} ↗</a> : '…'}
          </Field>
          <Field label="Owner">{state?.owner_id ?? '…'}</Field>
          <Field label="Balance">{toNear(state?.vault_balance).toFixed(3)} NEAR</Field>
          <Field label="Daily cap">{toNear(state?.daily_budget_cap).toFixed(2)} NEAR</Field>
          <Field label="Spent today">{toNear(state?.daily_spent_today).toFixed(2)} NEAR</Field>
          <Field label="Status" last>
            <span style={{ color: state?.is_frozen ? '#FF4B1F' : '#10B981' }}>{state ? (state.is_frozen ? 'FROZEN' : 'ACTIVE') : '…'}</span>
          </Field>

          <div className="mono-label" style={{ margin: '24px 0 8px' }}>OWNERSHIP · WHO SIGNS THE KILLSWITCH</div>
          <p style={{ fontSize: '13px', color: 'var(--mu)', lineHeight: 1.5, margin: '0 0 12px' }}>
            {walletIsOwner
              ? `Your wallet (${wallet.walletName || 'NEAR wallet'}) owns this vault and signs every owner action.`
              : demoKeyIsOwner
                ? 'Owned by the demo owner key on the local agent API. Hand it to your own wallet so you sign the killswitch yourself.'
                : `Owned by ${owner}. Connect that wallet to freeze or re-arm.`}
          </p>
          {!wallet.accountId && (
            <button onClick={wallet.connect} className="ghost-btn ghost-btn-primary" style={{ width: '100%', minHeight: '40px' }}>
              <span>Connect NEAR wallet</span><span>→</span>
            </button>
          )}
          {wallet.accountId && demoKeyIsOwner && (
            <button onClick={() => changeOwner(wallet.accountId)} disabled={handover.busy} className="ghost-btn ghost-btn-primary" style={{ width: '100%', minHeight: '40px' }}>
              <span>{handover.busy ? 'Handing over…' : `Make ${wallet.accountId} the owner`}</span><span>→</span>
            </button>
          )}
          {walletIsOwner && config && (
            <button onClick={() => changeOwner(config.owner)} disabled={handover.busy} className="ghost-btn" style={{ width: '100%', minHeight: '40px' }}>
              <span>{handover.busy ? 'Signing in wallet…' : 'Give back to demo owner'}</span><span>→</span>
            </button>
          )}
          {wallet.accountId && (
            <button onClick={wallet.disconnect} className="font-mono" style={{ marginTop: '10px', background: 'none', border: 'none', color: 'var(--mu)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>
              disconnect {wallet.accountId}
            </button>
          )}
          {handover.msg && <p className="font-mono" style={{ fontSize: '12px', marginTop: '10px' }}>{handover.msg}</p>}
        </Panel>

        <Panel label="AGENT KEY · ON THE VAULT ACCOUNT" title="The agent." dark>
          <Field label="Public key" dark>{state?.agent_pk ?? '…'}</Field>
          <Field label="Type" dark>{agentKey ? (perm ? 'Function-call' : 'Full access') : '…'}</Field>
          <Field label="Callable methods" dark><span style={{ color: '#10B981' }}>{perm?.method_names?.join(', ') ?? '…'}</span></Field>
          <Field label="Gas allowance left" dark>{perm ? `${toNear(perm.allowance).toFixed(3)} NEAR` : '…'}</Field>
          <Field label="Can move funds alone" dark last><span style={{ color: '#FF4B1F' }}>No: needs a TEE decision</span></Field>
          <button onClick={onOpenKillswitch} className="ghost-btn" style={{ width: '100%', marginTop: '20px', background: '#FF4B1F', color: '#111110', borderColor: '#FF4B1F', minHeight: '44px' }}>
            <span>{state?.is_frozen ? 'Re-arm agent' : 'Freeze the vault'}</span><span>→</span>
          </button>
        </Panel>

        <Panel label="OWNER POLICY · ON-CHAIN" title="The rules.">
          <div className="mono-label" style={{ margin: '4px 0 8px' }}>APPROVED NEAR AI TEE SIGNERS</div>
          {(state?.attested_signers ?? []).map((s) => <div key={s} className="font-mono" style={{ fontSize: '12px', wordBreak: 'break-all', padding: '4px 0' }}>{s}</div>)}
          <div className="mono-label" style={{ margin: '18px 0 8px' }}>APPROVED PAYEES</div>
          {(state?.approved_payees ?? []).map((p) => (
            <div key={p} className="font-mono" style={{ fontSize: '12px', padding: '4px 0' }}>
              <a href={explorerAccount(network, p)} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{p} ↗</a>
            </div>
          ))}

          <div className="mono-label" style={{ margin: '24px 0 8px' }}>ETHEREUM SEPOLIA · NEAR CHAIN SIGNATURES</div>
          <Field label="Vault's ETH address">
            {evm ? <a href={evm.explorer} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{evm.address} ↗</a> : '…'}
          </Field>
          <Field label="ETH balance">{evm ? `${(Number(evm.balanceWei) / 1e18).toFixed(5)} ETH` : '…'}</Field>
          <Field label="Signed by">{state ? `${state.mpc_signer_contract}, path ${state.evm_path}` : '…'}</Field>
          <Field label="ETH daily cap">{state ? `${Number(state.evm_spent_today_wei) / 1e18} / ${Number(state.evm_daily_cap_wei) / 1e18} ETH` : '…'}</Field>
          <Field label="Approved recipients" last>{(state?.evm_payees ?? []).join(', ') || 'none'}</Field>
        </Panel>
      </div>

      <div className="bd-t" style={{ padding: '28px var(--gutter)' }}>
        <div className="mono-label" style={{ marginBottom: '16px' }}>HOW EVERY SPEND IS CHECKED · IN execute_attested</div>
        <div className="four-col">
          {CHECKS.map((c, i) => (
            <div key={c.title} className="bd-t" style={{ paddingTop: '14px' }}>
              <div className="font-mono" style={{ fontSize: '11px', color: 'var(--mu)' }}>0{i + 1}</div>
              <div style={{ fontWeight: 700, margin: '6px 0' }}>{c.title}</div>
              <div style={{ fontSize: '13px', color: 'var(--mu)', lineHeight: 1.5 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ label, title, dark, children }) {
  return (
    <section className={dark ? 'on-dark' : undefined} style={{ padding: '28px var(--gutter)', background: dark ? 'var(--pbg)' : 'transparent', color: dark ? 'var(--pfg)' : 'inherit' }}>
      <div className="font-mono" style={{ fontSize: '11px', color: dark ? '#A9A59B' : 'var(--mu)', textTransform: 'uppercase', marginBottom: '8px' }}>{label}</div>
      <h2 className="font-serif" style={{ fontSize: '48px', lineHeight: 1, marginBottom: '20px', color: dark ? '#ECE9E1' : 'inherit' }}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, last, dark }) {
  return (
    <div className={`bd-t${last ? ' bd-b' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '10px 0', fontSize: '14px' }}>
      <span style={{ color: dark ? '#A9A59B' : 'var(--mu)', flexShrink: 0 }}>{label}</span>
      <span className="font-mono" style={{ fontSize: '12px', textAlign: 'right', wordBreak: 'break-all' }}>{children}</span>
    </div>
  );
}
