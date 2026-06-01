'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getSupabase } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/data';
import type { ChatUser, Message } from '@/lib/types';

interface Props { params: { id: string } }

/* ─── Profile modal ──────────────────────────────── */
function ProfileModal({ user: cu, onClose }: { user: ChatUser; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>👤 Profile</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="chat-profile-card">
            <div className="chat-profile-avatar">{cu.avatar}</div>
            <div>
              <div className="chat-profile-name">
                {cu.name}
                {cu.verified && (
                  <span className="verified-badge-inline">✓ Verified</span>
                )}
              </div>
              <div className="chat-profile-type">
                {cu.type === 'business' ? '🏪 Business' : '👤 Customer'}
              </div>
            </div>
          </div>

          {cu.bio && (
            <div className="chat-profile-section">
              <div className="chat-profile-section-title">About</div>
              <p style={{ fontSize:'.87rem', color:'var(--text-muted)', lineHeight:1.6 }}>{cu.bio}</p>
            </div>
          )}

          {cu.location && (
            <div className="chat-profile-row">
              <span>📍</span>
              <span>{cu.location}</span>
            </div>
          )}

          {cu.categories && cu.categories.length > 0 && (
            <div className="chat-profile-section">
              <div className="chat-profile-section-title">Categories</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {cu.categories.map(c => {
                  const cat = CATEGORIES.find(x => x.id === c);
                  return (
                    <span key={c} className="claim-tag">
                      {cat?.icon} {cat?.name ?? c}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {cu.contactNumbers && cu.contactNumbers.length > 0 && (
            <div className="chat-profile-section">
              <div className="chat-profile-section-title">Contact</div>
              {cu.contactNumbers.map((n, i) => (
                <a key={i} href={`tel:${n}`} className="chat-profile-row" style={{ color:'var(--primary)' }}>
                  <span>📞</span><span>{n}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main chat room ─────────────────────────────── */
export default function ChatRoomPage({ params }: Props) {
  const router     = useRouter();
  const { user }   = useAuth();
  const convId     = params.id;

  /* state */
  const [otherUser,   setOtherUser]   = useState<ChatUser | null>(null);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [msgLoading,  setMsgLoading]  = useState(true);
  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [imgError,    setImgError]    = useState('');

  const bottomRef  = useRef<HTMLDivElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  /* ── Load conversation details ─── */
  useEffect(() => {
    if (!user) return;
    fetch(`/api/conversations/${convId}?viewerId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.otherUser) setOtherUser(d.otherUser); })
      .catch(() => {});
  }, [convId, user]);

  /* ── Load messages ─── */
  const loadMessages = useCallback(async () => {
    setMsgLoading(true);
    try {
      const res  = await fetch(`/api/conversations/${convId}/messages?limit=50`);
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch { /* ignore */ }
    setMsgLoading(false);
  }, [convId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  /* ── Scroll to bottom when messages load/arrive ─── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Mark messages as read ─── */
  useEffect(() => {
    if (!user || messages.length === 0) return;
    fetch(`/api/conversations/${convId}/messages`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ readerId: user.id }),
    }).catch(() => {});
  }, [convId, user, messages]);

  /* ── Supabase Realtime subscription ─── */
  useEffect(() => {
    const sb = getSupabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (sb.channel(`conv:${convId}`) as any)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: `conversation_id=eq.${convId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const m = payload.new as Record<string, unknown>;
          const newMsg: Message = {
            id:             String(m.id),
            conversationId: String(m.conversation_id),
            senderId:       String(m.sender_id),
            content:        m.content    ? String(m.content)    : null,
            imageUrl:       m.image_url  ? String(m.image_url)  : null,
            messageType:    (m.message_type as 'text' | 'image') ?? 'text',
            readAt:         m.read_at    ? String(m.read_at)    : null,
            createdAt:      String(m.created_at),
          };
          setMessages(prev => {
            if (prev.some(x => x.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { sb.removeChannel(channel); };
  }, [convId]);

  /* ── Send text message ─── */
  async function sendText() {
    if (!text.trim() || !user || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, conversationId: convId,
      senderId: user.id, content, imageUrl: null,
      messageType: 'text', readAt: null,
      createdAt: new Date().toISOString(),
    }]);

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ senderId: user.id, content, messageType: 'text' }),
      });
      if (res.ok) {
        const saved = await res.json() as Message;
        // Replace temp with real message
        setMessages(prev => prev.map(m => m.id === tempId ? saved : m));
      }
    } catch { /* keep optimistic */ }
    setSending(false);
  }

  /* ── Upload & send image ─── */
  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate
    if (!file.type.startsWith('image/')) { setImgError('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { setImgError('Image must be under 10MB'); return; }
    setImgError('');
    setUploading(true);

    try {
      const sb   = getSupabase();
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: upErr } = await sb.storage
        .from('chat-images')
        .upload(path, file, { upsert: true });

      if (upErr) {
        setImgError(`Upload failed: ${upErr.message}`);
        setUploading(false);
        return;
      }

      const { data: urlData } = sb.storage.from('chat-images').getPublicUrl(path);
      const imageUrl = urlData.publicUrl;

      // Send as image message
      const tempId = `temp-img-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId, conversationId: convId,
        senderId: user.id, content: null, imageUrl,
        messageType: 'image', readAt: null,
        createdAt: new Date().toISOString(),
      }]);

      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ senderId: user.id, imageUrl, messageType: 'image' }),
      });
      if (res.ok) {
        const saved = await res.json() as Message;
        setMessages(prev => prev.map(m => m.id === tempId ? saved : m));
      }
    } catch (err) {
      setImgError('Failed to send image. Make sure "chat-images" bucket exists in Supabase Storage.');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  /* ── Format time ─── */
  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }

  /* ── Not logged in ─── */
  if (!user) {
    return (
      <div className="page-anim" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'80vh', gap:12 }}>
        <div style={{ fontSize:'2rem' }}>🔐</div>
        <div style={{ fontWeight:700 }}>Sign in to chat</div>
        <button className="btn btn-primary" onClick={() => router.push('/auth/login')}>Sign In</button>
      </div>
    );
  }

  return (
    <div className="chat-room-wrap">
      {/* ── Header ─── */}
      <div className="chat-room-header">
        <button className="chat-back-btn" onClick={() => router.push('/chat')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>

        <button className="chat-header-user" onClick={() => setShowProfile(true)}>
          <div className="chat-room-avatar">
            <span>{otherUser?.avatar ?? '👤'}</span>
            {otherUser?.verified && <span className="chat-verified-dot">✓</span>}
          </div>
          <div className="chat-header-info">
            <div className="chat-header-name">
              {otherUser?.name ?? '…'}
              {otherUser?.verified && (
                <span className="verified-badge-inline">✓</span>
              )}
            </div>
            <div className="chat-header-sub">
              {otherUser?.type === 'business' ? '🏪 Business' : '👤 Customer'}
              {' · Tap for profile'}
            </div>
          </div>
        </button>
      </div>

      {/* ── Messages ─── */}
      <div className="chat-messages-area">
        {msgLoading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
            <div className="spinner" style={{ margin:'0 auto 12px' }} />
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty-state">
            <div style={{ fontSize:'3rem', marginBottom:12 }}>{otherUser?.avatar ?? '💬'}</div>
            <div style={{ fontWeight:700, marginBottom:6 }}>
              Start a conversation with {otherUser?.name ?? 'this person'}
            </div>
            <div style={{ fontSize:'.83rem', color:'var(--text-muted)' }}>
              Say hello! You can also send photos.
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe    = msg.senderId === user.id;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showTime = !prevMsg || (
              new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 5 * 60 * 1000
            );

            return (
              <div key={msg.id}>
                {showTime && (
                  <div className="chat-time-divider">{fmtTime(msg.createdAt)}</div>
                )}
                <div className={`chat-msg-row${isMe ? ' me' : ' them'}`}>
                  {/* Avatar (other user only) */}
                  {!isMe && (
                    <button className="chat-msg-avatar" onClick={() => setShowProfile(true)}>
                      {otherUser?.avatar ?? '👤'}
                    </button>
                  )}

                  <div className={`chat-bubble${isMe ? ' me' : ' them'}`}>
                    {msg.messageType === 'image' && msg.imageUrl ? (
                      <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.imageUrl}
                          alt="Sent image"
                          className="chat-bubble-img"
                          onError={e => { (e.target as HTMLImageElement).style.display='none'; }}
                        />
                      </a>
                    ) : (
                      <span className="chat-bubble-text">{msg.content}</span>
                    )}
                    <span className="chat-bubble-time">
                      {fmtTime(msg.createdAt)}
                      {isMe && msg.readAt && ' ✓✓'}
                      {isMe && !msg.readAt && msg.id.startsWith('temp') && ' ○'}
                      {isMe && !msg.readAt && !msg.id.startsWith('temp') && ' ✓'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ─── */}
      <div className="chat-input-bar">
        {imgError && (
          <div style={{ padding:'4px 12px', fontSize:'.78rem', color:'var(--danger)', background:'rgba(239,68,68,.08)', borderRadius:6, margin:'0 0 6px' }}>
            {imgError}
          </div>
        )}
        <div className="chat-input-row">
          {/* Image upload button */}
          <button
            className="chat-img-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Send image"
          >
            {uploading ? (
              <span className="btn-spinner" style={{ width:18, height:18, borderWidth:2 }} />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display:'none' }}
            onChange={handleImageSelect}
          />

          {/* Text input */}
          <input
            className="chat-text-input"
            placeholder="Type a message…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            disabled={sending}
          />

          {/* Send button */}
          <button
            className="chat-send-btn"
            onClick={sendText}
            disabled={!text.trim() || sending}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Profile Modal ─── */}
      {showProfile && otherUser && (
        <ProfileModal user={otherUser} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
}
