'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { isPushSupported, subscribeToPush, pushReasonMessage } from '@/lib/push';

export default function NotificationsPage() {
  const { state, markAllRead, clearNotifications, toast } = useApp();
  const { user } = useAuth();
  const { notifications } = state;
  const unread = notifications.filter(n => !n.read).length;

  /* ── Web Push opt-in ──
     Shown to signed-in users on supporting browsers until permission is
     granted. The subscribe MUST happen in a click handler (user gesture). */
  const [pushState, setPushState] = useState<'unavailable'|'prompt'|'granted'|'denied'>('unavailable');
  const [enabling, setEnabling]   = useState(false);
  useEffect(() => {
    if (!isPushSupported()) { setPushState('unavailable'); return; }
    const p = Notification.permission;
    setPushState(p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt');
  }, []);

  const enablePush = async () => {
    setEnabling(true);
    const { ok, reason } = await subscribeToPush();
    setEnabling(false);
    if (ok) { setPushState('granted'); toast('Push notifications enabled ✓', 'success'); }
    else {
      setPushState(Notification.permission === 'denied' ? 'denied' : 'prompt');
      toast(pushReasonMessage(reason), 'error');
    }
  };

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Local state for immediate delete feedback (actual persistence via API)
  const [localNotifs, setLocalNotifs] = useState(notifications);

  // Sync if context changes
  if (localNotifs !== notifications && !deletingId) {
    setLocalNotifs(notifications);
  }

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
          {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>}
          {displayed.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { clearNotifications(); setLocalNotifs([]); }}>Clear all</button>}
        </div>
      </div>
      <p className="page-subtitle">{unread} unread</p>

      {/* Push opt-in banner */}
      {user && pushState === 'prompt' && (
        <div style={{ margin:'0 16px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:26 }}>📲</span>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontWeight:700, fontSize:'.9rem' }}>Get instant notifications</div>
            <div style={{ fontSize:'.78rem', color:'var(--text-muted)' }}>New orders, status updates and chat messages — even when the app is closed.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={enablePush} disabled={enabling}>
            {enabling ? 'Enabling…' : 'Enable'}
          </button>
        </div>
      )}
      {user && pushState === 'denied' && (
        <div style={{ margin:'0 16px 12px', fontSize:'.78rem', color:'var(--text-muted)', padding:'0 2px' }}>
          🔕 Push notifications are blocked — allow notifications for this site in your browser settings to receive order alerts.
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
