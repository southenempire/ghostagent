import { useCallback, useEffect, useRef, useState } from 'react';
import { NearConnector } from '@hot-labs/near-connect';

/**
 * NEAR wallet sign-in through HOT's near-connect (HOT, Meteor, MyNearWallet, Intear, …).
 * The connected wallet signs owner actions on the vault itself; the agent API never sees its keys.
 */
export function useWallet(network = 'testnet') {
  const connectorRef = useRef(null);
  const [accountId, setAccountId] = useState('');
  const [walletName, setWalletName] = useState('');

  useEffect(() => {
    const connector = new NearConnector({ network, autoConnect: true });
    connectorRef.current = connector;

    const onSignIn = async (t) => {
      setAccountId(t.accounts?.[0]?.accountId ?? '');
      const wallet = await connector.wallet().catch(() => null);
      setWalletName(wallet?.manifest?.name ?? '');
    };
    const onSignOut = () => {
      setAccountId('');
      setWalletName('');
    };
    connector.on('wallet:signIn', onSignIn);
    connector.on('wallet:signOut', onSignOut);

    connector.getConnectedWallet()
      .then(({ wallet, accounts }) => {
        setAccountId(accounts?.[0]?.accountId ?? '');
        setWalletName(wallet?.manifest?.name ?? '');
      })
      .catch(() => {});

    return () => {
      connector.off('wallet:signIn', onSignIn);
      connector.off('wallet:signOut', onSignOut);
    };
  }, [network]);

  const connect = useCallback(() => connectorRef.current?.connect(), []);
  const disconnect = useCallback(() => connectorRef.current?.disconnect(), []);

  /** Signs and sends one function call with the connected wallet. Resolves like the agent API: {ok, hash, error}. */
  const callContract = useCallback(async (contractId, methodName, args = {}) => {
    const wallet = await connectorRef.current.wallet();
    const outcome = await wallet.signAndSendTransaction({
      receiverId: contractId,
      actions: [{ type: 'FunctionCall', params: { methodName, args, gas: '30000000000000', deposit: '0' } }],
    });
    const failure = outcome?.status?.Failure ?? outcome?.receipts_outcome?.map((r) => r.outcome.status?.Failure).find(Boolean);
    const panic = failure && JSON.stringify(failure).match(/Smart contract panicked:\s*([^"\\]+)/);
    return {
      ok: !failure,
      hash: outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id,
      error: failure ? (panic ? panic[1] : JSON.stringify(failure)) : undefined,
    };
  }, []);

  return { accountId, walletName, connect, disconnect, callContract };
}
