import { useState } from 'react';

export default function MessageInput({ onSend, disabled }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Please wait...' : 'Type your message...'}
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1.5px solid #e5e7eb',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: 14,
          outline: 'none',
          fontFamily: 'inherit',
          lineHeight: 1.4,
          transition: 'border-color 0.15s',
          background: disabled ? '#f9fafb' : '#fff',
          color: '#1f2937',
        }}
        onFocus={e => e.target.style.borderColor = '#6c63ff'}
        onBlur={e => e.target.style.borderColor = '#e5e7eb'}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        style={{
          background: disabled || !text.trim() ? '#e5e7eb' : '#6c63ff',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          width: 42,
          height: 42,
          cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}>
        ↑
      </button>
    </form>
  );
}
