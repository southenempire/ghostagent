import React, { useState, useEffect } from 'react';
import { Navbar, APP_TABS } from './components/Navbar';
import { LandingView } from './views/LandingView';
import { InboxView } from './views/InboxView';
import { AttackLabView } from './views/AttackLabView';
import { VaultView } from './views/VaultView';
import { AgentTeeView } from './views/AgentTeeView';
import { RobView } from './views/RobView';
import { KillswitchModal } from './components/KillswitchModal';
import { useGhostVault, toNear, explorerTx } from './lib/useGhostVault';
import { useWallet } from './lib/useWallet';

const TABS = ['landing', ...APP_TABS.map((t) => t.id)];
// Old links (#mission, #receipts) still land somewhere sensible
const ALIASES = { mission: 'inbox', receipts: 'inbox' };

function tabFromHash() {
  const h = window.location.hash.slice(1);
  const tab = ALIASES[h] ?? h;
  return TABS.includes(tab) ? tab : 'landing';
}

export default function App() {
  // The tab lives in the URL hash, so reloads and shared links (e.g. /#lab) land on the same screen
  const [currentTab, setTab] = useState(tabFromHash);
  const setCurrentTab = (tab) => {
    window.history.replaceState(null, '', tab === 'landing' ? window.location.pathname : `#${tab}`);
    setTab(tab);
    window.scrollTo({ top: 0 });
  };
  const [isDark, setIsDark] = useState(false);
  const [isKillswitchOpen, setIsKillswitchOpen] = useState(false);
  const wallet = useWallet('testnet');
  const vault = useGhostVault(wallet);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openKillswitch = () => setIsKillswitchOpen(true);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--ink)' }}>
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        walletConnected={Boolean(wallet.accountId)}
        connectedAccount={wallet.accountId}
        isOwner={Boolean(wallet.accountId) && wallet.accountId === vault.state?.owner_id}
        onOpenConnect={() => (wallet.accountId ? setCurrentTab('vault') : wallet.connect())}
      />

      <main style={{ flex: 1 }}>
        {currentTab === 'landing' && <LandingView onLaunchApp={() => setCurrentTab('inbox')} onRob={() => setCurrentTab('rob')} />}
        {currentTab === 'rob' && <RobView vault={vault} />}
        {currentTab === 'inbox' && <InboxView vault={vault} onOpenKillswitch={openKillswitch} onSelectTab={setCurrentTab} />}
        {currentTab === 'lab' && <AttackLabView vault={vault} />}
        {currentTab === 'agent' && <AgentTeeView vault={vault} />}
        {currentTab === 'vault' && <VaultView vault={vault} wallet={wallet} onOpenKillswitch={openKillswitch} />}
      </main>

      <KillswitchModal
        isOpen={isKillswitchOpen}
        onClose={() => setIsKillswitchOpen(false)}
        isFrozen={Boolean(vault.state?.is_frozen)}
        balance={toNear(vault.state?.vault_balance)}
        owner={vault.state?.owner_id}
        explorerUrl={(hash) => explorerTx(vault.config?.network, hash)}
        onFreeze={() => vault.ownerAction('freeze')}
        onRearm={() => vault.ownerAction('rearm')}
      />
    </div>
  );
}
