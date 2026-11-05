import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../ws/useWebSocket";
import { wsUrl } from "../utils/ws";
import type { ChatMessage, Session } from "../types";

const MAX_VISIBLE_MESSAGES = 200;
interface Props { session: Session | null }

export function ChatPanel({ session }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);
  const timer = useRef<number | null>(null);
  const url = wsUrl(`/ws/chat${session ? `?token=${encodeURIComponent(session.playerToken)}` : ""}`);

  const { status, send } = useWebSocket({ url, onMessage: (raw: any) => {
    if (raw?.type === "chat-history" && Array.isArray(raw.data)) setMessages(raw.data.slice(-MAX_VISIBLE_MESSAGES));
    else if (raw?.type === "chat-message" && raw.data?.id) setMessages((current) => [...current, raw.data as ChatMessage].slice(-MAX_VISIBLE_MESSAGES));
    else if (raw?.type === "chat-cleared") setMessages([]);
    else if (raw?.type === "chat-error") setError(raw.data?.message ?? "Не удалось отправить сообщение");
  }});

  useEffect(() => {
    const node = listRef.current;
    if (node && wasAtBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages]);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const submit = () => {
    const value = text.trim();
    if (!session || !value || cooldown || status !== "open") return;
    setError(null); setCooldown(true); send({ text: value }); setText("");
    timer.current = window.setTimeout(() => setCooldown(false), 1200);
  };

  return (
    <section className="glass rounded-3xl p-5" aria-label="Общий чат">
      <div className="flex items-center justify-between mb-3 text-slate-300"><span className="font-medium">Общий чат</span><span className="text-xs text-slate-500">{status === "open" ? "в сети" : "подключение…"}</span></div>
      <div ref={listRef} onScroll={(event) => { const node = event.currentTarget; wasAtBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; }}
        className="h-64 overflow-y-auto overscroll-contain rounded-xl bg-surface/60 border border-border/60 p-3 space-y-2" aria-live="polite">
        {messages.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">История пока пуста</p> : messages.map((message) => <div key={message.id} className="break-words text-sm">
          <span className="text-accent font-medium">{message.nickname}</span><span className="text-slate-500 text-xs ml-2">{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><p className="text-slate-200">{message.text}</p>
        </div>)}
      </div>
      {error && <p role="status" className="text-xs text-amber-300 mt-2">{error}</p>}
      {session ? <form className="flex gap-2 mt-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <input value={text} onChange={(event) => setText(event.target.value.slice(0, 240))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} maxLength={240} placeholder="Написать сообщение…" aria-label="Сообщение" className="min-w-0 flex-1 rounded-xl bg-surface border border-border px-3 py-2 outline-none focus:border-accent" />
        <button type="submit" disabled={!text.trim() || cooldown || status !== "open"} aria-label="Отправить" className="rounded-xl bg-accent px-4 text-white disabled:opacity-40">Отправить</button>
      </form> : <p className="text-xs text-slate-500 mt-3">Войдите, чтобы отправлять сообщения. История доступна всем.</p>}
    </section>
  );
}
