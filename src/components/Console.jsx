import React, { useEffect, useRef } from 'react';
import { explorerTx } from '../lib/useGhostVault';

const LOG_COLORS = { ok: 'var(--ok)', err: 'var(--accent)', attack: 'var(--warn)', dim: '#A9A59B', head: '#ECE9E1' };
const NEAR_HASH = /^(.*· )([1-9A-HJ-NP-Za-km-z]{43,44})$/;
const EVM_HASH = /^(.*· )(0x[0-9a-f]{64})$/;

/** Live agent log on a dark panel. Trailing tx hashes become explorer links. */
export function Console({ logs, network, running, emptyText, maxHeight = 360 }) {
  const boxRef = useRef(null);

  // Scroll the console itself, not the page, so new lines never yank the viewport around
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [logs.length, running]);

  return (
    <div
      className="font-mono on-dark"
      ref={boxRef}
      role="log"
      aria-live="polite"
      style={{ background: 'var(--pbg)', fontSize: '12px', lineHeight: 1.7, padding: '16px var(--gutter)', maxHeight, overflowY: 'auto' }}
    >
      {logs.length === 0 && <div style={{ color: '#A9A59B' }}>{emptyText}</div>}
      {logs.map((log, i) => (
        <div key={i} style={{ display: 'flex', gap: '12px', padding: '1px 0' }}>
          <span style={{ color: '#A9A59B', minWidth: '58px', flexShrink: 0 }}>{log.tag}</span>
          <span style={{ color: LOG_COLORS[log.level] || 'inherit', wordBreak: 'break-word', minWidth: 0 }}>
            <LogText text={log.msg} network={network} />
          </span>
        </div>
      ))}
      {running && (
        <div style={{ color: 'var(--accent)' }}>
          working <span className="blink">▍</span>
        </div>
      )}
    </div>
  );
}

function LogText({ text, network }) {
  const near = text.match(NEAR_HASH);
  const evm = text.match(EVM_HASH);
  const m = near ?? evm;
  if (!m) return text;
  const href = near ? explorerTx(network, m[2]) : `https://sepolia.etherscan.io/tx/${m[2]}`;
  return (
    <>
      {m[1]}
      <a href={href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
        {m[2].slice(0, 10)}… ↗
      </a>
    </>
  );
}
