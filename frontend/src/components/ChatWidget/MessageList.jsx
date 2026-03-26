const bubble = (role) => ({
  display: 'flex',
  justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
  marginBottom: 4,
});

const bubbleInner = (role, isError) => ({
  maxWidth: '78%',
  padding: '10px 14px',
  borderRadius: role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
  background: isError ? '#fef2f2' : role === 'user' ? '#6c63ff' : '#f3f4f6',
  color: isError ? '#991b1b' : role === 'user' ? '#fff' : '#1f2937',
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

const kbStyle = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: '1px solid rgba(0,0,0,0.1)',
  fontSize: 12,
};

function TypingIndicator() {
  return (
    <div style={bubble('assistant')}>
      <div style={{ ...bubbleInner('assistant', false), padding: '10px 16px' }}>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {[0, 150, 300].map(delay => (
            <span key={delay} style={{
              width: 7, height: 7, borderRadius: '50%', background: '#9ca3af',
              animation: 'bounce 1.2s infinite',
              animationDelay: `${delay}ms`,
              display: 'inline-block',
            }} />
          ))}
        </span>
        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-6px); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function MessageList({ messages, loading }) {
  return (
    <>
      {messages.map((msg) => (
        <div key={msg.id} style={bubble(msg.role)}>
          <div style={bubbleInner(msg.role, msg.isError)}>
            {msg.content}
            {msg.kbSnippets && msg.kbSnippets.length > 0 && (
              <div style={kbStyle}>
                {msg.kbSnippets.map((s, i) => s.policyUrl && (
                  <a key={i} href={s.policyUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'block', color: '#6c63ff', textDecoration: 'none', fontSize: 12 }}>
                    📄 {s.title} →
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      {loading && <TypingIndicator />}
    </>
  );
}
