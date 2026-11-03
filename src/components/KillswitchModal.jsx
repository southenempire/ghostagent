import React, { useState } from 'react';
import { MascotGhost } from './Mascot';

/**
 * Owner killswitch. Freeze calls emergency_revoke_and_freeze on the vault; from then on the contract
 * rejects every agent call until the owner re-arms it.
 */
export function KillswitchModal({ isOpen, onClose, isFrozen, balance, owner, explorerUrl, onFreeze, onRearm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastTx, setLastTx] = useState(null);

  if (!isOpen) return null;

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (!res.ok) throw new Error(res.error);
      setLastTx(res.hash);
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setError('');
    setLastTx(null);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
      <div style={{ maxWidth: '560px', width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', border: '1px solid var(--rule)' }}>
        {!isFrozen ? (
          <div style={{ background: '#FF4B1F', color: '#111110', padding: '44px 40px' }}>
            <div className="font-mono" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px', fontWeight: 700 }}>
              CONFIRM EMERGENCY FREEZE · SIGNED BY {owner?.toUpperCase()}
            </div>
            <h2 className="font-serif" style={{ fontSize: '56px', lineHeight: 1, marginBottom: '20px' }}>Stop the agent?</h2>
            <p style={{ fontSize: '16px', lineHeight: 1.5, marginBottom: '36px', maxWidth: '440px' }}>
              This sends <span className="font-mono">emergency_revoke_and_freeze</span> to the vault. Every agent call is
              rejected on-chain until you re-arm it, even with a valid TEE decision. Funds stay in the vault.
            </p>
            {error && <p className="font-mono" style={{ fontSize: '12px', marginBottom: '16px' }}>✕ {error}</p>}
            <div style={{ display: 'flex', gap: '14px' }}>
              <button
                onClick={() => act(onFreeze)}
                disabled={busy}
                className="ghost-btn"
                style={{ flex: 1, background: '#111110', color: '#ECE9E1', borderColor: '#111110', minHeight: '48px', fontWeight: 600, fontSize: '15px', opacity: busy ? 0.7 : 1 }}
              >
                <span>{busy ? 'Freezing on-chain…' : 'Freeze vault now'}</span>
                <span>→</span>
              </button>
              <button onClick={close} className="ghost-btn" style={{ padding: '0 24px', borderColor: '#111110', color: '#111110', minHeight: '48px', fontSize: '15px' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--bg)', color: 'var(--ink)', padding: '44px 40px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '24px', right: '32px' }}>
              <MascotGhost size={110} sleeping={true} />
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
              AGENT PAUSED & VAULT FROZEN
            </div>
            <h2 className="font-serif" style={{ fontSize: '56px', lineHeight: 1, marginBottom: '28px' }}>Agent stopped.</h2>

            <div style={{ fontSize: '14px', maxWidth: '380px', marginBottom: '28px' }}>
              <div className="bd-t" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                <span>Agent calls</span>
                <span className="font-mono" style={{ color: '#FF4B1F' }}>REJECTED ON-CHAIN ✓</span>
              </div>
              <div className="bd-t" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                <span>Vault status</span>
                <span className="font-mono" style={{ color: '#FF4B1F' }}>FROZEN ✓</span>
              </div>
              <div className="bd-t bd-b" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                <span>Funds held in vault</span>
                <span className="font-mono">{balance.toFixed(2)} NEAR</span>
              </div>
            </div>

            {lastTx && (
              <p className="font-mono" style={{ fontSize: '12px', marginBottom: '20px' }}>
                Tx <a href={explorerUrl(lastTx)} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{lastTx.slice(0, 16)}… ↗</a>
              </p>
            )}
            {error && <p className="font-mono" style={{ fontSize: '12px', marginBottom: '16px', color: '#FF4B1F' }}>✕ {error}</p>}

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <button onClick={close} className="ghost-btn ghost-btn-primary" style={{ flex: 1, minHeight: '48px', fontSize: '14px' }}>
                <span>Keep frozen</span>
                <span>→</span>
              </button>
              <button
                onClick={async () => { if (await act(onRearm)) close(); }}
                disabled={busy}
                className="ghost-btn"
                style={{ flex: 1, minHeight: '48px', fontSize: '14px', opacity: busy ? 0.7 : 1 }}
              >
                <span>{busy ? 'Re-arming…' : 'Re-arm agent'}</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
