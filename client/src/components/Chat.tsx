import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_MESSAGE_LENGTH, type Ack, type ChatMessage } from '../../../shared/protocol';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<Ack>;
  placeholder: string;
  title?: string;
}

export function Chat({ messages, onSend, placeholder, title = 'Chat e palpites' }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) {
      setError('Digite uma mensagem antes de enviar.');
      return;
    }
    setSending(true);
    const res = await onSend(value);
    setSending(false);
    if (res.ok) {
      setText('');
      setError(null);
    } else {
      setError(res.error);
    }
  }

  return (
    <section className="card chat" aria-label={title}>
      <h2 className="card-title">{title}</h2>
      <div className="chat-list" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && <p className="empty">Nenhuma mensagem ainda. Seja o primeiro a falar!</p>}
        {messages.map((m) => (
          <p key={m.id} className={`msg msg-${m.kind}${m.private ? ' msg-private' : ''}`}>
            {m.kind === 'chat' ? (
              <>
                <b>{m.nickname}</b>
                {m.private && <small> (só quem acertou)</small>}: {m.text}
              </>
            ) : (
              m.text
            )}
          </p>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          aria-label="Mensagem"
          autoComplete="off"
        />
        <button className="btn btn-sky" type="submit" disabled={sending}>
          Enviar
        </button>
      </form>
      <div className="chat-meta">
        <span className="field-error" role="alert">{error}</span>
        <span className="counter">{text.length}/{MAX_MESSAGE_LENGTH}</span>
      </div>
    </section>
  );
}
