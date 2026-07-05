'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Link } from '@/lib/hashRouter';
import { useI18n }   from '@/context/I18nContext';
import { toLangCode } from '@/lib/i18n';

const STORAGE_KEY = 'mogarenta_settings';

const DEFAULTS = {
  storeName:           'Mogarenta Store',
  currency:            'USD',
  language:            'English',
  theme:               'light' as 'light' | 'dark',
  // Appearance
  compactView:         false,
  showPrices:          true,
  productsPerPage:     '20',
  // Notifications
  stockAlerts:         true,
  orderAlerts:         true,
  paymentAlerts:       true,
  supplierAlerts:      false,
  // POS
  defaultPayment:      'waafi',
  requireCustomerName: true,
  autoPrint:           false,
};

type Settings = typeof DEFAULTS;
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="sett-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="sett-track">
        <span className="sett-thumb" />
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const { setLang } = useI18n();
  const [s, setS]       = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  /* Load from localStorage */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  /* Apply theme to <html> */
  useEffect(() => {
    if (s.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [s.theme]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS(prev => ({ ...prev, [k]: v }));

  const setB = (k: BoolKey, v: boolean) =>
    setS(prev => ({ ...prev, [k]: v }));

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // Apply language change immediately
    setLang(toLangCode(s.language));
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const handleReset = () => {
    if (!confirm('Reset all settings to defaults?')) return;
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    setS(DEFAULTS);
  };

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">⚙️ Settings</span>
        <button
          className={`btn btn-sm ${saved ? 'btn-secondary' : 'btn-primary'}`}
          onClick={handleSave}
        >
          {saved ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>
      <p className="page-subtitle">Customize your store experience</p>

      {/* ── Store ─────────────────────────────────────── */}
      <div className="sett-section">
        <div className="sett-section-title">🏪 Store</div>
        <div className="sett-card">
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Store Name</div>
              <div className="sett-row-sub">Shown in receipts and headers</div>
            </div>
            <input
              className="sett-input"
              value={s.storeName}
              onChange={e => set('storeName', e.target.value)}
              placeholder="My Store"
            />
          </div>
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Currency</div>
              <div className="sett-row-sub">Used across the app</div>
            </div>
            <select className="sett-input" value={s.currency} onChange={e => set('currency', e.target.value)}>
              <option value="USD">$ USD — Dollar</option>
              <option value="EUR">€ EUR — Euro</option>
              <option value="GBP">£ GBP — Pound</option>
              <option value="SOS">SOS — Somali Shilling</option>
              <option value="AED">AED — UAE Dirham</option>
              <option value="SAR">SAR — Saudi Riyal</option>
            </select>
          </div>
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Language</div>
              <div className="sett-row-sub">Interface language</div>
            </div>
            <select className="sett-input" value={s.language} onChange={e => set('language', e.target.value)}>
              <option>English</option>
              <option>Somali</option>
              <option>Arabic</option>
              <option>French</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Appearance ────────────────────────────────── */}
      <div className="sett-section">
        <div className="sett-section-title">🎨 Appearance</div>
        <div className="sett-card">
          {/* Theme toggle */}
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Theme</div>
              <div className="sett-row-sub">Light or dark mode</div>
            </div>
            <div className="sett-theme-toggle">
              <button
                className={`sett-theme-btn${s.theme === 'light' ? ' active' : ''}`}
                onClick={() => set('theme', 'light')}
              >☀️ Light</button>
              <button
                className={`sett-theme-btn${s.theme === 'dark' ? ' active' : ''}`}
                onClick={() => set('theme', 'dark')}
              >🌙 Dark</button>
            </div>
          </div>

          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Compact View</div>
              <div className="sett-row-sub">More products, less spacing</div>
            </div>
            <Toggle checked={s.compactView} onChange={v => setB('compactView', v)} />
          </div>

          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Show Prices</div>
              <div className="sett-row-sub">Display price tags on cards</div>
            </div>
            <Toggle checked={s.showPrices} onChange={v => setB('showPrices', v)} />
          </div>

          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Products Per Page</div>
              <div className="sett-row-sub">Items loaded at once</div>
            </div>
            <select className="sett-input" value={s.productsPerPage} onChange={e => set('productsPerPage', e.target.value)}>
              {['10','20','30','50'].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Notifications ─────────────────────────────── */}
      <div className="sett-section">
        <div className="sett-section-title">🔔 Notifications</div>
        <div className="sett-card">
          {([
            { key: 'stockAlerts'   as BoolKey, label: 'Stock Alerts',    sub: 'Notify when stock runs low' },
            { key: 'orderAlerts'   as BoolKey, label: 'Order Alerts',    sub: 'New order notifications' },
            { key: 'paymentAlerts' as BoolKey, label: 'Payment Alerts',  sub: 'Payment confirmations' },
            { key: 'supplierAlerts'as BoolKey, label: 'Supplier Alerts', sub: 'Deals and supplier updates' },
          ] as { key: BoolKey; label: string; sub: string }[]).map(({ key, label, sub }) => (
            <div key={key} className="sett-row">
              <div className="sett-row-info">
                <div className="sett-row-label">{label}</div>
                <div className="sett-row-sub">{sub}</div>
              </div>
              <Toggle checked={s[key] as boolean} onChange={v => setB(key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Point of Sale ─────────────────────────────── */}
      <div className="sett-section">
        <div className="sett-section-title">🖥️ Point of Sale</div>
        <div className="sett-card">
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Default Payment</div>
              <div className="sett-row-sub">Pre-selected at checkout</div>
            </div>
            <select className="sett-input" value={s.defaultPayment} onChange={e => set('defaultPayment', e.target.value)}>
              <option value="waafi">📱 Waafi</option>
              <option value="cash">💵 Cash</option>
              <option value="card">💳 Card</option>
            </select>
          </div>
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Require Customer Name</div>
              <div className="sett-row-sub">Mandatory at checkout</div>
            </div>
            <Toggle checked={s.requireCustomerName} onChange={v => setB('requireCustomerName', v)} />
          </div>
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Auto-Print Receipt</div>
              <div className="sett-row-sub">Print after every order</div>
            </div>
            <Toggle checked={s.autoPrint} onChange={v => setB('autoPrint', v)} />
          </div>
        </div>
      </div>

      {/* ── About ─────────────────────────────────────── */}
      <div className="sett-section">
        <div className="sett-section-title">ℹ️ About</div>
        <div className="sett-card">
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Version</div>
              <div className="sett-row-sub">Current app version</div>
            </div>
            <span className="sett-info-val">1.0.0</span>
          </div>
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Built with</div>
              <div className="sett-row-sub">Tech stack</div>
            </div>
            <span className="sett-info-val">Next.js 14</span>
          </div>
        </div>
      </div>

      {/* ── Danger Zone ───────────────────────────────── */}
      <div className="sett-section" style={{ marginBottom: 80 }}>
        <div className="sett-section-title" style={{ color: 'var(--danger)' }}>⚠️ Reset</div>
        <div className="sett-card">
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-label">Reset to Defaults</div>
              <div className="sett-row-sub">Clear all saved preferences</div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger)', border: '1.5px solid var(--danger)' }}
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Legal ───────────────────────────────────────── */}
      <div className="legal-footer">
        <Link href="/privacy">Privacy Policy</Link>
        <span>·</span>
        <Link href="/terms">Terms of Service</Link>
      </div>
    </div>
  );
}
