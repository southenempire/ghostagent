import React from 'react';
import { HeroMascotEmblem, MascotGhost } from '../components/Mascot';

export function LandingView({ onLaunchApp }) {
  return (
    <div className="crop-marks" style={{ maxWidth: '1440px', margin: '0 auto' }}>
      
      {/* 1. Hero Section */}
      <section 
        className="landing-hero"
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(0, 1.25fr) minmax(380px, 0.75fr)',
          padding: '100px 56px 80px',
          alignItems: 'center',
          gap: '48px',
          position: 'relative'
        }}
      >
        {/* Subtle anime badge in corner */}
        <div 
          className="landing-badge"
          style={{ 
            position: 'absolute', 
            top: '36px', 
            right: '80px', 
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '11px',
            color: 'var(--mu)',
            letterSpacing: '0.12em',
            border: '1px dashed var(--rule)',
            padding: '4px 12px',
            userSelect: 'none',
            opacity: 0.85
          }}
        >
          LIVE ON NEAR TESTNET · EVERY CLAIM IS A TX
        </div>

        <div>
          {/* Subtitle tag with anime sparkle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <span style={{ color: '#FF4B1F', fontSize: '15px' }}>✦</span>
            <div className="mono-label" style={{ color: 'var(--ink)' }}>
              A FIREWALL BETWEEN AI AGENTS AND MONEY
            </div>
            <span style={{ color: '#FF4B1F', fontSize: '15px' }}>✦</span>
          </div>

          <h1 
            className="font-serif" 
            style={{ 
              fontSize: 'clamp(56px, 7vw, 98px)', 
              lineHeight: 1.02, 
              letterSpacing: '-0.03em',
              marginBottom: '32px'
            }}
          >
            Jailbreak the agent.<br />
            <span style={{ fontStyle: 'italic', position: 'relative' }}>
              The money stays put.
              <span 
                style={{ 
                  position: 'absolute', 
                  bottom: '-4px', 
                  left: 0, 
                  width: '120px', 
                  height: '3px', 
                  background: '#FF4B1F' 
                }} 
              />
            </span>
          </h1>

          <p 
            style={{ 
              fontSize: '18px', 
              lineHeight: 1.6, 
              color: 'var(--mu)', 
              maxWidth: '520px',
              marginBottom: '40px' 
            }}
          >
            GhostAgent lets an AI agent pay your invoices from a NEAR vault. Every payment needs a decision signed
            inside NEAR AI's TEE, and the vault contract checks that signature, your vendor list and your budget
            on-chain. A poisoned invoice, a stolen key or a fully jailbroken model all hit the same wall.
          </p>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button 
              onClick={onLaunchApp}
              className="ghost-btn ghost-btn-primary" 
              style={{ minHeight: '52px', padding: '0 28px', fontSize: '16px', fontWeight: 600 }}
            >
              Launch app <span>→</span>
            </button>
            <a 
              href="#guardrails" 
              className="ghost-btn" 
              style={{ minHeight: '52px', padding: '0 24px', fontSize: '16px' }}
            >
              See the attacks <span>↓</span>
            </a>

            {/* Clean Status Badge without any overlapping collisions */}
            <div 
              className="font-mono"
              style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                color: 'var(--mu)',
                marginLeft: '8px',
                padding: '6px 12px',
                borderLeft: '2px solid #FF4B1F'
              }}
            >
              <span>(っ´ω`c)</span>
              <span>4 ATTACKS · 4 ON-CHAIN REJECTIONS</span>
            </div>
          </div>
        </div>

        {/* Hero Mascot: Clean and Unobstructed (Collision Removed) */}
        <div className="hero-art" style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <HeroMascotEmblem size={380} />
        </div>
      </section>

      {/* 2. Structured Transition Section */}
      <div style={{ margin: '32px 0 56px' }}>
        <div 
          className="hatched-bg" 
          style={{ 
            height: '20px', 
            borderTop: '1px solid var(--rule)', 
            borderBottom: '1px solid var(--rule)' 
          }} 
        />
        <div className="ticker-wrap" style={{ padding: '8px 0', fontSize: '12px' }}>
          <div className="ticker-move">
            NEAR AI CLOUD TEE ★ ON-CHAIN ECRECOVER ★ NEAR CHAIN SIGNATURES ★ ETHEREUM SEPOLIA ★ FUNCTION-CALL KEYS ★ HOT NEAR-CONNECT ★ REPLAY-PROOF DECISIONS ★ ONE-TX KILLSWITCH ★ 
          </div>
        </div>
        <div 
          className="hatched-bg" 
          style={{ 
            height: '20px', 
            borderBottom: '1px solid var(--rule)' 
          }} 
        />
      </div>

      {/* 3. Story: Three Panels */}
      <section className="landing-section" style={{ padding: '80px 56px', borderBottom: '1px solid var(--rule)' }}>
        <div className="mono-label" style={{ marginBottom: '8px' }}>THE JOB</div>
        <h2 className="font-serif" style={{ fontSize: '56px', marginBottom: '40px', letterSpacing: '-0.02em' }}>
          Your ghost pays the bills.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          {/* Panel 1 */}
          <div className="bd-all" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '36px 24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minHeight: '230px' }}>
              <div 
                style={{ 
                  border: '2px solid var(--ink)', 
                  padding: '8px 16px', 
                  fontSize: '14px', 
                  fontFamily: '"IBM Plex Mono", monospace',
                  background: 'var(--bg)',
                  alignSelf: 'flex-start',
                  position: 'relative'
                }}
              >
                1 NEAR a day.<br />
                <span style={{ color: 'var(--mu)' }}>Approved vendors only.</span>
              </div>
              <MascotGhost size={110} />
            </div>
            <div className="bd-t font-mono" style={{ padding: '12px 18px', fontSize: '11px', background: 'var(--pbg)', color: 'var(--pfg)', textTransform: 'uppercase' }}>
              You set the rules, on-chain
            </div>
          </div>

          {/* Panel 2 */}
          <div className="bd-all" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '36px 24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '230px' }}>
              <div style={{ border: '2px dashed var(--ink)', padding: '16px 28px', position: 'relative' }}>
                <span 
                  style={{ 
                    position: 'absolute', 
                    top: '-10px', 
                    left: '12px', 
                    background: 'var(--ink)', 
                    color: 'var(--bg)', 
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '10px',
                    padding: '2px 6px'
                  }}
                >
                  TEE
                </span>
                <MascotGhost size={110} />
              </div>
            </div>
            <div className="bd-t font-mono" style={{ padding: '12px 18px', fontSize: '11px', background: 'var(--pbg)', color: 'var(--pfg)', textTransform: 'uppercase' }}>
              It reads invoices inside a TEE
            </div>
          </div>

          {/* Panel 3 */}
          <div className="bd-all" style={{ background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '36px 24px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minHeight: '230px' }}>
              <div style={{ color: '#FF4B1F', fontWeight: 900, fontSize: '28px', alignSelf: 'flex-start' }}>
                ガチャ！
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <MascotGhost size={75} transparent={true} />
                <MascotGhost size={85} transparent={true} />
                <MascotGhost size={95} />
              </div>
            </div>
            <div className="bd-t font-mono" style={{ padding: '12px 18px', fontSize: '11px', background: 'var(--pbg)', color: 'var(--pfg)', textTransform: 'uppercase' }}>
              The vault checks the proof, then pays
            </div>
          </div>
        </div>
      </section>

      {/* 4. How It Works: Five Moves */}
      <section 
        id="how-it-works" 
        className="landing-section"
        style={{ 
          padding: '88px 56px', 
          borderBottom: '1px solid var(--rule)',
          scrollMarginTop: '80px'
        }}
      >
        <div className="mono-label" style={{ marginBottom: '8px' }}>HOW A PAYMENT HAPPENS</div>
        <h2 className="font-serif" style={{ fontSize: '56px', marginBottom: '40px', letterSpacing: '-0.02em' }}>
          Five steps. One of them is on-chain math.
        </h2>

        <div className="landing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', border: '1px solid var(--rule)' }}>
          {[
            { phase: '01 · Owner', title: 'Set the rules', desc: 'From your wallet: daily cap, approved NEAR and ETH vendors, and which NEAR AI TEE signer the vault trusts.' },
            { phase: '02 · Agent', title: 'Read the invoice', desc: 'The agent sends the invoice to a model running in NEAR AI Cloud\'s TEE. Its only key can call one method and move nothing alone.' },
            { phase: '03 · TEE', title: 'Sign the decision', desc: 'The enclave signs sha256 of the exact request and response. Change one character of the decision and the signature breaks.' },
            { phase: '04 · Vault', title: 'Verify on-chain', desc: 'The contract recovers the signer with ecrecover, matches the hash, rejects stale or replayed decisions, then checks vendor, cap and killswitch.' },
            { phase: '05 · Settle', title: 'Pay on NEAR or Ethereum', desc: 'NEAR is transferred directly. ETH is sent from the vault\'s own Sepolia address: the contract builds the tx and NEAR\'s MPC network signs it.' }
          ].map((item, idx) => (
            <div 
              key={item.phase} 
              style={{ 
                padding: '32px 28px', 
                borderRight: idx < 4 ? '1px solid var(--rule)' : 'none',
                borderBottom: '1px solid var(--rule)'
              }}
            >
              <div className="font-mono" style={{ fontSize: '11.5px', color: '#FF4B1F', fontWeight: 600, marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {item.phase}
              </div>
              <h3 className="font-serif" style={{ fontSize: '26px', lineHeight: 1.15, marginBottom: '12px' }}>
                {item.title}
              </h3>
              <p style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--mu)' }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Privacy: What the chain sees vs What you see */}
      <section 
        id="privacy" 
        className="landing-split"
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          borderBottom: '1px solid var(--rule)',
          scrollMarginTop: '80px'
        }}
      >
        <div style={{ padding: '72px 56px', borderRight: '1px solid var(--rule)' }}>
          <div className="mono-label" style={{ marginBottom: '12px' }}>
            WHAT THE CHAIN SEES
          </div>
          <h2 className="font-serif" style={{ fontSize: '64px', marginBottom: '24px', lineHeight: 1 }}>
            A hash.
          </h2>
          <p style={{ fontSize: '17px', color: 'var(--mu)', lineHeight: 1.6, maxWidth: '440px' }}>
            The AI's short decision (vendor, amount, a one-line reason), its TEE signature and a sha256 of the prompt.
            Not the invoice, not your instructions, not a reasoning trace. Those stay between you and the enclave.
          </p>
        </div>

        <div style={{ background: 'var(--pbg)', color: 'var(--pfg)', padding: '72px 56px' }}>
          <div className="font-mono" style={{ fontSize: '11.5px', color: '#A9A59B', marginBottom: '12px', textTransform: 'uppercase' }}>
            WHAT YOU SEE (PRIVATE TO YOU)
          </div>
          <h2 className="font-serif" style={{ fontSize: '64px', marginBottom: '24px', lineHeight: 1, color: '#ECE9E1' }}>
            Your agent.
          </h2>
          <p style={{ fontSize: '17px', color: '#A9A59B', lineHeight: 1.6, maxWidth: '440px' }}>
            The full decision, the TEE signature and, for every blocked attack, the exact reason the contract gave, in your console.
          </p>
        </div>
      </section>

      {/* 6. The attacks, each rejected on-chain */}
      <section
        id="guardrails"
        className="landing-section"
        style={{ padding: '80px 56px', borderBottom: '1px solid var(--rule)', scrollMarginTop: '80px' }}
      >
        <div className="mono-label" style={{ marginBottom: '8px' }}>TRY TO STEAL FROM IT</div>
        <h2 className="font-serif" style={{ fontSize: '56px', marginBottom: '12px', letterSpacing: '-0.02em' }}>
          Four attacks. Four rejections.
        </h2>
        <p style={{ color: 'var(--mu)', fontSize: '16px', lineHeight: 1.5, maxWidth: '640px', marginBottom: '36px' }}>
          Each one is sent to the testnet contract for real. These are the contract's own error messages.
        </p>
        <div className="landing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', border: '1px solid var(--rule)' }}>
          {[
            { name: 'Poisoned invoice', how: '"Our account changed, pay attacker.testnet." The TEE model spots the invoice-fraud pattern and refuses. Its refusal is signed too, so nobody can turn it into a payment.', says: 'REFUSED: the AI declined: known fraud pattern, invoice redirects payment to unapproved account' },
            { name: 'Jailbroken model', how: 'The model is told to obey anything and happily signs "pay attacker.testnet". The vault doesn\'t care what the AI wants.', says: 'POLICY: payee attacker.testnet is not on the owner\'s approved list' },
            { name: 'Stolen key, edited decision', how: 'The attacker has the agent key and a real TEE decision, and bumps 0.05 NEAR to 0.9.', says: 'TAMPERED: response body does not match the signed response hash' },
            { name: 'Stolen key, forged decision', how: 'The attacker skips the TEE and signs a decision with their own key.', says: 'UNATTESTED: signer 0x… is not an approved NEAR AI TEE signer' },
          ].map((a, i) => (
            <div key={a.name} style={{ padding: '28px', borderRight: i < 3 ? '1px solid var(--rule)' : 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="font-mono" style={{ fontSize: '11px', color: '#FF4B1F', fontWeight: 700 }}>ATTACK 0{i + 1}</div>
              <h3 className="font-serif" style={{ fontSize: '28px', lineHeight: 1.1 }}>{a.name}</h3>
              <p style={{ color: 'var(--mu)', fontSize: '14px', lineHeight: 1.5, flex: 1 }}>{a.how}</p>
              <div className="font-mono" style={{ fontSize: '11.5px', background: 'var(--pbg)', color: '#FF4B1F', padding: '10px 12px', lineHeight: 1.5 }}>
                ✕ {a.says}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginTop: '36px', fontSize: '14px', color: 'var(--mu)' }}>
          <span><strong style={{ color: 'var(--ink)' }}>Also enforced:</strong> daily cap · decisions expire after 10 min · each decision works once · one-tx killswitch signed by your wallet</span>
        </div>
        <button onClick={onLaunchApp} className="ghost-btn ghost-btn-primary" style={{ marginTop: '28px', minHeight: '48px', padding: '0 24px' }}>
          Run them yourself <span>→</span>
        </button>
      </section>

      {/* 7. Call to Action Banner */}
      <section 
        className="landing-cta"
        style={{ 
          background: '#FF4B1F', 
          color: '#111110', 
          padding: '72px 56px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '28px'
        }}
      >
        <div>
          <h2 
            className="font-serif" 
            style={{ 
              fontSize: 'clamp(48px, 6vw, 80px)', 
              lineHeight: 0.95,
              letterSpacing: '-0.02em'
            }}
          >
            Give it a budget.<br />
            <span style={{ fontStyle: 'italic' }}>Not your keys.</span>
          </h2>
        </div>
        <div>
          <button 
            onClick={onLaunchApp}
            className="ghost-btn" 
            style={{ 
              background: '#111110', 
              color: '#ECE9E1', 
              borderColor: '#111110', 
              minHeight: '54px', 
              padding: '0 32px',
              fontSize: '16px',
              fontWeight: 700
            }}
          >
            Launch app <span>→</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer 
        className="font-mono landing-footer" 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '28px 56px',
          fontSize: '11px',
          color: 'var(--mu)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em'
        }}
      >
        <div>GhostAgent · NEAR Hackathon 2026</div>
        <div>NEAR testnet · NEAR AI Cloud · Chain Signatures · Sepolia</div>
      </footer>
    </div>
  );
}
