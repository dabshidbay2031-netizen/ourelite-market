'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from '@/lib/hashRouter';

interface Msg { role: 'user' | 'assistant'; content: string }

const GREETING: Msg = {
  role: 'assistant',
  content: 'Salaan! 👋 Waxaan ahay Mogarenta Assistant. Weydii wax kasta oo ku saabsan sida loo isticmaalo suuqa — iibsi, iib, lacag-bixin (Sifalo Pay), dalabyo, iwm.\n\nHi! I\'m the Mogarenta Assistant — ask me anything about using the marketplace.',
};

/**
 * Floating public help assistant (Gemini-powered). Available app-wide; answers
 * how-to questions about using Mogarenta. Mounted once in the root layout.
 */
export default function AiAssistant() {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<Msg[]>([GREETING]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname  = usePathname();

  // Inside a chat room the floating button sits on top of the message send
  // button (both bottom-right), so hide the assistant there. Chat has its own
  // in-thread help; the assistant stays available on every other screen.
  const inChatRoom = pathname.startsWith('/chat/');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, open, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...msgs, { role: 'user' as const, content: text }];
    setMsgs(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ai/assistant', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: next.filter(m => m !== GREETING) }),
      });
      const data = await res.json();
      const reply = data.noKey
        ? 'AI assistant-ka weli lama dejin. (Add a free OPENROUTER_API_KEY to enable me.)'
        : data.reply || data.error || 'Waan ka xumahay, wax baa qaldamay. Fadlan mar kale isku day.';
      setMsgs(m => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Network error — fadlan mar kale isku day.' }]);
    }
    setLoading(false);
  };

  if (inChatRoom) return null;

  return (
    <>
      <button
        className="ai-fab"
        aria-label={open ? 'Close assistant' : 'Open Mogarenta assistant'}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <div className="ai-panel" role="dialog" aria-label="Mogarenta Assistant">
          <div className="ai-panel-head">
            <span className="ai-panel-title">🤖 Mogarenta Assistant</span>
            <button className="ai-panel-close" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="ai-panel-body" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}`}>{m.content}</div>
            ))}
            {loading && <div className="ai-msg assistant ai-typing"><span></span><span></span><span></span></div>}
          </div>

          <div className="ai-panel-input">
            <textarea
              rows={1}
              placeholder="Qor su'aashaada…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="ai-send" onClick={send} disabled={loading || !input.trim()} aria-label="Send">➤</button>
          </div>
        </div>
      )}
    </>
  );
}
