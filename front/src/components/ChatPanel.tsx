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

  const { status, send } = useWebSocket({
    url,
    onMessage: (raw: any) => {
      if (raw?.type === "chat-history" && Array.isArray(raw.data)) {
        setMessages(raw.data.slice(-MAX_VISIBLE_MESSAGES));
      } else if (raw?.type === "chat-message" && raw.data?.id) {
        setMessages((current) => [...current, raw.data as ChatMessage].slice(-MAX_VISIBLE_MESSAGES));
      } else if (raw?.type === "chat-cleared") {
        setMessages([]);
      } else if (raw?.type === "chat-error") {
        setError(raw.data?.message ?? "Не удалось отправить сообщение");
      }
    },
  });

  useEffect(() => {
    const node = listRef.current;
    if (node && wasAtBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const submit = () => {
    const value = text.trim();
    if (!session || !value || cooldown || status !== "open") return;
    setError(null);
    setCooldown(true);
    send({ text: value });
    setText("");
    timer.current = window.setTimeout(() => setCooldown(false), 1200);
  };

  return (
    <section className="glass flex min-h-[440px] flex-col overflow-hidden rounded-3xl" aria-label="Общий чат">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-5 sm:px-6">
        <div><h2 className="text-xl font-bold text-white">Чат игроков</h2><p className="mt-1 text-xs text-slate-500">Договоритесь, кто заберёт кубок</p></div>
        <div className="flex items-center gap-2 rounded-full bg-slate-950/40 px-3 py-1.5 text-xs text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`} />
          {status === "open" ? "в эфире" : "соединяемся"}
        </div>
      </header>
      <div ref={listRef} onScroll={(event) => {
        const node = event.currentTarget;
        wasAtBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
      }} className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 && <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-orange-400/10 text-orange-300"><span className="text-2xl">💬</span></div>
          <p className="font-medium text-slate-300">Чат пока тихий</p><p className="mt-1 text-sm text-slate-500">Напиши команде первое сообщение 👋</p>
        </div>}
        {messages.map((message) => <article key={message.id} className={`max-w-[92%] rounded-2xl border p-3 ${message.nickname === session?.nickname ? "ml-auto border-orange-400/15 bg-orange-400/[0.07]" : "border-white/[0.06] bg-slate-950/30"}`}>
          <div className="mb-1 flex items-center justify-between gap-4"><span className="truncate text-xs font-bold text-slate-300">{message.nickname}</span>
            <time className="shrink-0 text-[10px] text-slate-600">{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
          <p className="break-words text-sm leading-relaxed text-slate-200">{message.text}</p>
        </article>)}
      </div>
      {error && <p role="status" className="px-5 text-xs text-amber-300">{error}</p>}
      {session ? <form className="border-t border-white/[0.06] p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="flex gap-2">
          <input value={text} onChange={(event) => setText(event.target.value.slice(0, 240))}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
            maxLength={240} placeholder="Написать сообщение…" aria-label="Сообщение"
            className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-orange-400/50" />
          <button type="submit" disabled={!text.trim() || cooldown || status !== "open"} aria-label="Отправить сообщение"
            className="grid w-12 shrink-0 place-items-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40">➤</button>
        </div>
        <p className="mt-2 text-[10px] text-slate-600">До 240 символов · не чаще одного сообщения в 1,2 секунды</p>
      </form> : <p className="border-t border-white/[0.06] p-5 text-sm text-slate-500">Войдите, чтобы отправлять сообщения. История доступна всем.</p>}
    </section>
  );
}
