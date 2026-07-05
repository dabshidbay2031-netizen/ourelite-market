'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';

const NOTIF_TYPES = [
  { value: 'stock',    label: '📦 Stock',    icon: '📦' },
  { value: 'order',    label: '🛍️ Order',    icon: '🛍️' },
  { value: 'supplier', label: '🚚 Supplier', icon: '🚚' },
  { value: 'payment',  label: '✅ Payment',  icon: '✅' },
  { value: 'info',     label: '🔔 Info',     icon: '🔔' },
];

export default function NotificationsPage() {
  const { state, markAllRead, clearNotifications, toast } = useApp();
  const { notifications } = state;
  const unread = notifications.filter(n => !n.read).length;

  const [showForm, setShowForm]   = useState(false);
  const [nTitle, setNTitle]       = useState('');
  const [nMessage, setNMessage]   = useState('');
  const [nType, setNType]         = useState('info');
  const [saving, setSaving]       = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Local state for immediate delete feedback (actual persistence via API)
  const [localNotifs, setLocalNotifs] = useState(notifications);

  // Sync if context changes
  if (localNotifs !== notifications && !deletingId) {
    setLocalNotifs(notifications);
  }

  const handleCreate = async () => {
    if (!nTitle.trim() || !nMessage.trim()) { toast('Title and message required', 'error'); return; }
    const typeObj = NOTIF_TYPES.find(t => t.value === nType);
    setSaving(true);
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: nType, title: nTitle.trim(), message: nMessage.trim(), icon: typeObj?.icon ?? '🔔' }),
    });
    setSaving(false);
    if (res.ok) {
      const newNotif = await res.json();
      setLocalNotifs(prev => [newNotif, ...prev]);
      toast('Notification created ✓', 'success');
      setShowForm(false); setNTitle(''); setNMessage(''); setNType('info');
    } else {
      toast('Failed to create notification', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    if (res.ok) {
      setLocalNotifs(prev => prev.filter(n => n.id !== id));
      toast('Notification deleted', 'default');
    } else {
      toast('Delete failed', 'error');
    }
  };

  const displayed = localNotifs.length > 0 ? localNotifs : notifications;

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">🔔 Notifications</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>+ New Alert</button>
          {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>}
          {displayed.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { clearNotifications(); setLocalNotifs([]); }}>Clear all</button>}
        </div>
      </div>
      <p className="page-subtitle">{unread} unread</p>

      {/* Create form */}
      {showForm && (
        <div className="notif-create-form">
          <div className="form-group">
            <label className="form-label">Type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {NOTIF_TYPES.map(t => (
                <button key={t.value} className={`chip ${nType === t.value ? 'active' : ''}`} onClick={() => setNType(t.value)}>{t.label}</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" placeholder="e.g. Low Stock Alert" value={nTitle} onChange={e => setNTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea className="form-input" rows={2} style={{ resize:'vertical', fontFamily:'inherit' }} placeholder="Notification details…" value={nMessage} onChange={e => setNMessage(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Alert'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="notif-list">
        {displayed.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <div className="empty-title">No notifications</div>
            <div className="empty-sub">You&apos;re all caught up!</div>
          </div>
        ) : (
          displayed.map(n => (
            <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
              <div className="notif-icon">{n.icon}</div>
              <div className="notif-content">
                <div className="notif-title">{n.title}</div>
                <div className="notif-msg">{n.message}</div>
                <div className="notif-time">{n.time}</div>
              </div>
              {!n.read && <div className="unread-dot" />}
              <button
                className="notif-delete-btn"
                onClick={() => handleDelete(n.id)}
                disabled={deletingId === n.id}
                title="Delete"
              >
                {deletingId === n.id ? '…' : '✕'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
