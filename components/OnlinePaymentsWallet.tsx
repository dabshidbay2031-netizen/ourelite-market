'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';

interface Payout { id: number; amount: number; phone: string; createdAt: string; }
interface Wallet {
  onlineTotal: number; paidOut: number; balance: number;
  payoutNumber: string | null; payouts: Payout[]; needsMigration: boolean;
}

/**
 * "Online Payments" wallet — top of the business dashboard.
 *
 * Shows the store's confirmed online-payment total, how much has been paid out,
 * and the remaining balance. The owner saves ONE company phone number (always
 * the payout destination) and can pay out any amount up to the balance; the
 * exact amount is deducted (recorded in the payouts ledger, server-side).
 */
export default function OnlinePaymentsWallet({ supplierId }: { supplierId: number }) {
  const { toast } = useApp();
  const [wallet,  setWallet]  = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone,   setPhone]   = useState('');
  const [savingNum, setSavingNum] = useState(false);
  const [amount,  setAmount]  = useState('');
  const [paying,  setPaying]  = useState(false);

  const applyWallet = useCallback((w: Wallet) => {
    setWallet(w);
    setPhone(w.payoutNumber ?? '');
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/payouts?supplierId=${supplierId}`, { cache: 'no-store' });
      if (res.ok) applyWallet(await res.json());
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, [supplierId, applyWallet]);

  useEffect(() => { load(); }, [load]);

  const saveNumber = async () => {
    const p = phone.trim();
    if (!p) { toast('Enter your payout phone number', 'error'); return; }
    setSavingNum(true);
    try {
      const res = await fetch('/api/payouts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, phone: p }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) { toast('Payout number saved ✓', 'success'); await load(); }
      else toast(data?.needsMigration ? 'Run migration_payouts.sql to enable payouts' : (data?.error ?? 'Could not save'), 'error');
    } catch { toast('Network error', 'error'); }
    finally { setSavingNum(false); }
  };

  const payOut = async () => {
    if (!wallet) return;
    const amt = amount.trim() === '' ? wallet.balance : Number(amount);
    if (!(amt > 0)) { toast('Enter an amount greater than 0', 'error'); return; }
    if (amt > wallet.balance + 0.001) { toast(`Amount exceeds your balance ($${wallet.balance.toFixed(2)})`, 'error'); return; }
    setPaying(true);
    try {
      const res = await fetch('/api/payouts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, amount: amt }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        toast(`Paid out $${amt.toFixed(2)} to ${wallet.payoutNumber} ✓`, 'success');
        setAmount('');
        if (data && typeof data.balance === 'number') applyWallet(data as Wallet);
        else await load();
      } else {
        toast(data?.needsMigration ? 'Run migration_payouts.sql to enable payouts' : (data?.error ?? 'Payout failed'), 'error');
      }
    } catch { toast('Network error', 'error'); }
    finally { setPaying(false); }
  };

  if (loading || !wallet) {
    return (
      <div className="dash-card wallet-card">
        <div className="dash-card-title">💳 Online Payments</div>
        <div className="skeleton" style={{ height: 60, borderRadius: 10, marginTop: 10 }} />
      </div>
    );
  }

  const savedNum   = wallet.payoutNumber ?? '';
  const numChanged = phone.trim() !== savedNum;

  return (
    <div className="dash-card wallet-card">
      <div className="dash-card-header">
        <div className="dash-card-title">💳 Online Payments</div>
        <span className="dash-card-sub">Sifalo Pay balance</span>
      </div>

      {/* Balance + received/paid-out */}
      <div className="wallet-balance-row">
        <div className="wallet-balance">
          <div className="wallet-balance-label">Available balance</div>
          <div className="wallet-balance-value">${wallet.balance.toFixed(2)}</div>
        </div>
        <div className="wallet-stats">
          <div className="wallet-stat">
            <span className="wallet-stat-label">Received</span>
            <span className="wallet-stat-value">${wallet.onlineTotal.toFixed(2)}</span>
          </div>
          <div className="wallet-stat">
            <span className="wallet-stat-label">Paid out</span>
            <span className="wallet-stat-value">${wallet.paidOut.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payout number — always the number a payout goes to */}
      <div className="wallet-field">
        <label className="form-label">Payout phone number</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            placeholder="+252 61 XXX XXXX"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary" onClick={saveNumber} disabled={savingNum || !numChanged}>
            {savingNum ? '…' : savedNum ? 'Update' : 'Save'}
          </button>
        </div>
        {savedNum && !numChanged && (
          <div className="wallet-saved-note">✓ Payouts go to {savedNum}</div>
        )}
      </div>

      {/* Pay out */}
      <div className="wallet-field">
        <label className="form-label">Withdraw</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            type="number" min="0" step="0.01" inputMode="decimal"
            placeholder={`Amount (max $${wallet.balance.toFixed(2)})`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={payOut}
            disabled={paying || wallet.balance <= 0 || !savedNum}
          >
            {paying ? '…' : 'Pay out'}
          </button>
        </div>
        {!savedNum && <div className="wallet-hint">Save a payout number first.</div>}
        {savedNum && wallet.balance <= 0 && <div className="wallet-hint">No balance to withdraw yet.</div>}
      </div>

      {/* Recent payouts */}
      {wallet.payouts.length > 0 && (
        <div className="wallet-history">
          <div className="wallet-history-title">Recent payouts</div>
          {wallet.payouts.slice(0, 4).map(p => (
            <div key={p.id} className="wallet-history-row">
              <span>{new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span className="wallet-history-phone">{p.phone}</span>
              <span className="wallet-history-amt">−${p.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
