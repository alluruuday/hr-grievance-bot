import { useState, useEffect, useRef } from 'react';
import { chat as chatApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

const STYLES = {
  widget: { display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 4px 32px rgba(0,0,0,0.12)', overflow: 'hidden' },
  header: { background: 'linear-gradient(135deg, #6c63ff, #3d8bff)', color: '#fff', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 },
  headerText: { flex: 1 },
  name: { fontWeight: 700, fontSize: 16 },
  status: { fontSize: 12, opacity: 0.85 },
  body: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  footer: { borderTop: '1px solid #f0f0f0', padding: 12 },
  quickReplies: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 16px' },
  chip: { background: '#f0eeff', color: '#6c63ff', border: '1px solid #d4d0ff', borderRadius: 20, padding: '6px 14px', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' },
  resolveBar: { background: '#f8f9ff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e8e8ff' },
  resolveText: { fontSize: 14, color: '#444' },
  resolveButtons: { display: 'flex', gap: 8 },
  btn: (color) => ({ background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  ratingRow: { display: 'flex', gap: 6, justifyContent: 'center', padding: '8px 0' },
  star: (filled) => ({ fontSize: 24, cursor: 'pointer', color: filled ? '#f59e0b' : '#d1d5db' }),
};

export default function ChatWidget() {
  const { user }                        = useAuth();
  const [session, setSession]           = useState(null);
  const [messages, setMessages]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [phase, setPhase]               = useState('chat'); // chat | resolve_prompt | rating | ticket_form | done
  const [categories, setCategories]     = useState([]);
  const [showCategories, setShowCategories] = useState(false);
  const [rating, setRating]             = useState(0);
  const [ticketCreating, setTicketCreating] = useState(false);
  const [createdTicket, setCreatedTicket]   = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    startSession();
    chatApi.categories().then(d => setCategories(d.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function startSession() {
    const data = await chatApi.startSession();
    setSession(data.session);
    setMessages([{ role: 'assistant', content: data.greeting, id: 'init' }]);
    setShowCategories(true);
  }

  async function sendMessage(content) {
    if (!session || loading) return;
    setShowCategories(false);
    setMessages(prev => [...prev, { role: 'user', content, id: Date.now() }]);
    setLoading(true);
    try {
      const data = await chatApi.sendMessage(session.id, content);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message, id: Date.now() + 1, kbSnippets: data.kbSnippets }]);
      // After every assistant reply, offer resolution check
      setPhase('resolve_prompt');
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I ran into an issue. Please try again.', id: Date.now() + 1, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(resolved) {
    setPhase('chat');
    if (resolved) {
      setPhase('rating');
    } else {
      // Create ticket
      setPhase('ticket_form');
      setTicketCreating(true);
      try {
        const data = await chatApi.createTicket(session.id, {});
        setCreatedTicket(data.ticket);
        setMessages(prev => [...prev, { role: 'assistant', content: data.message, id: Date.now() }]);
        setPhase('done');
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to create ticket. Please contact HR directly.', id: Date.now(), isError: true }]);
        setPhase('chat');
      } finally {
        setTicketCreating(false);
      }
    }
  }

  async function handleRatingSubmit() {
    if (session && rating > 0) {
      await chatApi.resolve(session.id, { resolved: true, rating }).catch(() => {});
    }
    setMessages(prev => [...prev, { role: 'assistant', content: `Thank you for the ${rating}⭐ rating! Have a great day. 😊`, id: Date.now() }]);
    setPhase('done');
  }

  function handleCategoryClick(cat) {
    sendMessage(cat.name);
  }

  return (
    <div style={STYLES.widget}>
      {/* Header */}
      <div style={STYLES.header}>
        <div style={STYLES.avatar}>🤖</div>
        <div style={STYLES.headerText}>
          <div style={STYLES.name}>HR Assistant</div>
          <div style={STYLES.status}>● Online — Bhanzu HR Support</div>
        </div>
      </div>

      {/* Messages */}
      <div style={STYLES.body}>
        <MessageList messages={messages} loading={loading} />
        <div ref={bottomRef} />
      </div>

      {/* Category quick replies */}
      {showCategories && categories.length > 0 && (
        <div style={STYLES.quickReplies}>
          {categories.slice(0, 6).map(cat => (
            <button key={cat.id} style={STYLES.chip}
              onClick={() => handleCategoryClick(cat)}
              onMouseEnter={e => Object.assign(e.target.style, { background: '#6c63ff', color: '#fff' })}
              onMouseLeave={e => Object.assign(e.target.style, { background: '#f0eeff', color: '#6c63ff' })}>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* "Did this resolve your query?" prompt */}
      {phase === 'resolve_prompt' && (
        <div style={STYLES.resolveBar}>
          <span style={STYLES.resolveText}>Did this resolve your query?</span>
          <div style={STYLES.resolveButtons}>
            <button style={STYLES.btn('#22c55e')} onClick={() => handleResolve(true)}>Yes ✓</button>
            <button style={STYLES.btn('#ef4444')} onClick={() => handleResolve(false)}>No, raise ticket</button>
          </div>
        </div>
      )}

      {/* Star rating */}
      {phase === 'rating' && (
        <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ marginBottom: 8, fontSize: 14, color: '#555' }}>How would you rate this interaction?</div>
          <div style={STYLES.ratingRow}>
            {[1,2,3,4,5].map(n => (
              <span key={n} style={STYLES.star(n <= rating)} onClick={() => setRating(n)}>★</span>
            ))}
          </div>
          <button style={{ ...STYLES.btn('#6c63ff'), marginTop: 8 }} onClick={handleRatingSubmit} disabled={rating === 0}>
            Submit Feedback
          </button>
        </div>
      )}

      {/* Ticket creating spinner */}
      {ticketCreating && (
        <div style={{ padding: 12, textAlign: 'center', color: '#6c63ff', fontSize: 14 }}>
          Creating your ticket...
        </div>
      )}

      {/* Created ticket summary */}
      {createdTicket && phase === 'done' && (
        <div style={{ background: '#f0fdf4', borderTop: '1px solid #bbf7d0', padding: 12, fontSize: 13, color: '#166534' }}>
          ✅ Ticket <strong>#{createdTicket.ticket_number}</strong> created — Severity: <strong>{createdTicket.severity}</strong>
        </div>
      )}

      {/* Input */}
      {phase !== 'done' && (
        <div style={STYLES.footer}>
          <MessageInput onSend={sendMessage} disabled={loading || phase === 'ticket_form'} />
        </div>
      )}

      {phase === 'done' && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <button style={STYLES.btn('#6c63ff')} onClick={startSession}>Start New Conversation</button>
        </div>
      )}
    </div>
  );
}
