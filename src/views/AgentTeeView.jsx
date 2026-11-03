import React, { useEffect, useState } from 'react';
import { MascotGhost } from '../components/Mascot';

/** The agent's brain: which TEE model it uses, its live attestation, and whether the vault trusts it. */
export function AgentTeeView({ vault }) {
  const { config, state } = vault;
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/attestation')
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setReport)
      .catch((err) => setError(err.message));
  }, []);

  const approved = new Set(state?.attested_signers ?? []);

  return (
    <div className="two-col" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <section className="bd-r" style={{ padding: '28px var(--gutter)', position: 'relative' }}>
        <div className="mono-label" style={{ marginBottom: '8px' }}>PRIVATE BRAIN · NEAR AI CLOUD</div>
        <h1 className="font-serif" style={{ fontSize: 'clamp(40px, 6vw, 56px)', lineHeight: 1, marginBottom: '20px' }}>Decides in a TEE.</h1>
        <p style={{ fontSize: '15px', lineHeight: 1.6, maxWidth: '520px', marginBottom: '24px' }}>
          The agent sends its prompt to <span className="font-mono">{config?.model ?? '…'}</span>, which runs inside an Intel TDX
          + NVIDIA confidential-computing enclave on NEAR AI Cloud. The enclave signs sha256 of the exact request and
          response. The vault only spends when that signature recovers to a signer the owner approved, and the prompt
          itself never goes on-chain.
        </p>
        <Field label="Model">{config?.model ?? '…'}</Field>
        <Field label="Signed text">model : sha256(request) : sha256(response)</Field>
        <Field label="Signature">ECDSA secp256k1, EIP-191</Field>
        <Field label="Verified by" last>GhostVault.execute_attested (ecrecover on-chain)</Field>
        <div style={{ position: 'absolute', right: '28px', bottom: '20px', opacity: 0.12 }}>
          <MascotGhost size={160} />
        </div>
      </section>

      <section className="on-dark" style={{ padding: '28px var(--gutter)', background: 'var(--pbg)', color: 'var(--pfg)' }}>
        <div className="font-mono" style={{ fontSize: '11px', color: '#A9A59B', marginBottom: '8px', textTransform: 'uppercase' }}>
          LIVE ATTESTATION REPORT · FRESH NONCE
        </div>
        <h2 className="font-serif" style={{ fontSize: '48px', lineHeight: 1, marginBottom: '20px', color: '#ECE9E1' }}>TEE evidence.</h2>
        {error && <p className="font-mono" style={{ color: '#FF4B1F', fontSize: '12px' }}>{error}</p>}
        {!report && !error && <p className="font-mono" style={{ fontSize: '12px', color: '#A9A59B' }}>Fetching /v1/attestation/report…</p>}
        {report && (
          <>
            <Field label="Nonce" dark>{report.nonce.slice(0, 24)}…</Field>
            <Field label="Fetched" dark>{new Date(report.fetchedAt).toLocaleTimeString()}</Field>
            {report.candidates.map((c) => (
              <div key={c.signingAddress} className="bd-all" style={{ padding: '16px', marginTop: '16px', borderColor: '#4A4843' }}>
                <Field label="Signing address" dark>{c.signingAddress}</Field>
                <Field label="Answers our nonce" dark><Ok v={c.nonceMatches} /></Field>
                <Field label="Intel TDX quote" dark>{c.intelQuoteBytes ? `${c.intelQuoteBytes} bytes` : 'missing'}</Field>
                <Field label="NVIDIA GPU evidence" dark><Ok v={c.gpuEvidence} /></Field>
                <Field label="Approved on vault" dark last><Ok v={approved.has(c.signingAddress?.toLowerCase())} /></Field>
              </div>
            ))}
            <p style={{ fontSize: '12.5px', color: '#A9A59B', lineHeight: 1.5, marginTop: '16px' }}>
              This page checks the nonce and shows the evidence. Full quote verification (TDX measurements, GPU
              attestation) is done with NEAR AI's verifier before the owner approves a signer:
              {' '}<a href="https://github.com/nearai/nearai-cloud-verifier" target="_blank" rel="noreferrer" style={{ color: '#ECE9E1' }}>nearai-cloud-verifier ↗</a>
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Ok({ v }) {
  return <span style={{ color: v ? '#10B981' : '#FF4B1F' }}>{v ? 'YES ✓' : 'NO ✕'}</span>;
}

function Field({ label, children, last, dark }) {
  return (
    <div className={`bd-t${last ? ' bd-b' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '10px 0', fontSize: '14px', borderColor: dark ? '#4A4843' : undefined }}>
      <span style={{ color: dark ? '#A9A59B' : 'var(--mu)', flexShrink: 0 }}>{label}</span>
      <span className="font-mono" style={{ fontSize: '12px', textAlign: 'right', wordBreak: 'break-all' }}>{children}</span>
    </div>
  );
}
