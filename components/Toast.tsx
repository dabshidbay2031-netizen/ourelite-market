'use client';

import { useApp } from '@/context/AppContext';

export default function ToastContainer() {
  const { state } = useApp();

  return (
    <div className="toast-container">
      {state.toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
