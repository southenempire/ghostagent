import React from 'react';
import { GhostIcon } from './Mascot';

export const APP_TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'lab', label: 'Attack lab' },
  { id: 'agent', label: 'Agent' },
  { id: 'vault', label: 'Vault' },
];

const LANDING_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#guardrails', label: 'Attacks' },
];

const tabButtonStyle = (active) => ({
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  padding: '6px 0',
  minHeight: '40px',
  color: active ? 'var(--ink)' : 'var(--mu)',
  cursor: 'pointer',
  fontWeight: active ? 600 : 500,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: 'inherit',
});

export function Navbar({ currentTab, onSelectTab, isDark, onToggleTheme, walletConnected, connectedAccount, isOwner, onOpenConnect }) {
  const isLanding = currentTab === 'landing';

  return (
    <>
      <header
        className="bd-b app-header"
        style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '0 28px', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 40 }}
      >
        <button
          onClick={() => onSelectTab('landing')}
          aria-label="GhostAgent home"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', minHeight: '40px', padding: 0 }}
        >
          <GhostIcon size={24} />
          <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>GhostAgent</span>
        </button>

        <nav className="font-mono desktop-only" aria-label="Main" style={{ display: 'flex', gap: '28px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {isLanding
            ? LANDING_LINKS.map((l) => (
                <a key={l.href} href={l.href} style={{ color: 'var(--mu)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: '40px' }}>{l.label}</a>
              ))
            : APP_TABS.map((tab) => (
                <button key={tab.id} onClick={() => onSelectTab(tab.id)} aria-current={currentTab === tab.id ? 'page' : undefined} style={tabButtonStyle(currentTab === tab.id)}>
                  {tab.label}
                </button>
              ))}
        </nav>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
          <button onClick={onToggleTheme} className="mono-tag" style={{ cursor: 'pointer', background: 'transparent', color: 'inherit', minHeight: '40px' }} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 1a5 5 0 0 0 0 10z" fill="currentColor" />
            </svg>
            <span className="desktop-only">{isDark ? 'Light' : 'Dark'}</span>
          </button>

          {isLanding ? (
            <button onClick={() => onSelectTab('inbox')} className="ghost-btn ghost-btn-primary" style={{ minHeight: '40px', padding: '0 14px', fontSize: '13px' }}>
              Launch app <span aria-hidden="true">→</span>
            </button>
          ) : walletConnected ? (
            <button
              onClick={onOpenConnect}
              className="mono-tag truncate"
              title="Connected NEAR wallet"
              style={{ background: 'var(--pbg)', color: 'var(--pfg)', border: '1px solid var(--pbg)', cursor: 'pointer', minHeight: '40px', maxWidth: '220px' }}
            >
              {connectedAccount}{isOwner ? ' · owner' : ''}
            </button>
          ) : (
            <button onClick={onOpenConnect} className="ghost-btn ghost-btn-primary" style={{ minHeight: '40px', padding: '0 12px', fontSize: '12px' }}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {!isLanding && (
        <nav className="mobile-tabs" aria-label="Main">
          {APP_TABS.map((tab) => (
            <button key={tab.id} onClick={() => onSelectTab(tab.id)} aria-current={currentTab === tab.id ? 'page' : undefined}>
              {tab.label}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
