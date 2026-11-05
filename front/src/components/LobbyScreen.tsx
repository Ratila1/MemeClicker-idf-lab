import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, PaperPlaneTilt, SignIn, Users } from "@phosphor-icons/react";
import { joinLobby, setReady, leaveLobby, getLobbySnapshot } from "../api/lobby";
import {
  saveSession,
  clearSession,
  loadSavedNickname,
  saveNickname,
  clearSavedNickname,
} from "../state/session";
import { useWebSocket } from "../ws/useWebSocket";
import { setOffset } from "../utils/clock";
import { wsUrl } from "../utils/ws";
import type { LobbyChatMessage, LobbySnapshot, RoundInfo, Session } from "../types";

interface Props {
  session: Session | null;
  onSession: (session: Session | null) => void;
  onRoundStart: (round: RoundInfo) => void;
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function LobbyScreen({ session, onSession, onRoundStart }: Props) {
  const [nickname, setNickname] = useState(() => loadSavedNickname() ?? "");
  const [rememberNickname, setRememberNickname] = useState(true);
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [chatText, setChatText] = useState("");
  const [messages, setMessages] = useState<LobbyChatMessage[]>([]);
  const autoJoinAttempted = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { status: wsStatus, send } = useWebSocket({
    url: wsUrl("/ws/lobby"),
    onMessage: (msg: any) => {
      if (msg?.type === "lobby") setLobby(msg.data as LobbySnapshot);
      if (msg?.type === "chat" && msg.data?.text) {
        setMessages((current) => [...current.slice(-99), msg.data as LobbyChatMessage]);
      }
      if (msg?.type === "game-start") {
        const data = msg.data;
        setOffset(data.serverTime ?? data.startAt - 3000);
        onRoundStart({
          roundId: data.roundId,
          startAt: data.startAt,
          roundEndTime: data.roundEndTime,
          serverTime: data.serverTime,
        });
      }
    },
  });

  useEffect(() => {
    getLobbySnapshot().then(setLobby).catch(() => undefined);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = async (value = nickname) => {
    const clean = value.trim();
    if (!clean) return;
    autoJoinAttempted.current = true;
    setJoining(true);
    setError(null);
    try {
      const joined = await joinLobby(clean);
      if (rememberNickname) saveNickname(joined.nickname);
      else clearSavedNickname();
      saveSession(joined);
      onSession(joined);
      setNickname(joined.nickname);
    } catch (e: any) {
      if (e?.status === 401) clearSession();
      setError(e?.message ?? "Не удалось войти");
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (session || autoJoinAttempted.current) return;
    const saved = loadSavedNickname();
    if (!saved) return;
    autoJoinAttempted.current = true;
    setNickname(saved);
    void handleJoin(saved);
    // handleJoin intentionally uses the initial saved nickname.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSendChat = () => {
    const text = chatText.trim();
    if (!session || !text || text.length > 300) return;
    send({ type: "chat", data: { token: session.playerToken, text } });
    setChatText("");
  };

  const handleLeave = async () => {
    if (!session) return;
    try {
      await leaveLobby(session.playerToken);
    } catch {
      // Локальную сессию всё равно очищаем; серверная очистка безопасна при повторе.
    }
    clearSession();
    onSession(null);
    setNickname(loadSavedNickname() ?? "");
  };

  const me = lobby?.players.find((player) => player.nickname === session?.nickname);
  const minPlayers = lobby?.minPlayers ?? 5;
  const canReady = (lobby?.players.length ?? 0) >= minPlayers && !me?.ready;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[100dvh] flex items-center justify-center px-4 py-8"
    >
      <div className="w-full max-w-5xl">
        <motion.header initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-8 text-center">
          <h1 className="text-4xl md:text-6xl tracking-tighter font-bold">MemeClicker</h1>
          <p className="text-slate-400 mt-2">Собирай команду. Готовься. Кликни быстрее всех.</p>
        </motion.header>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="glass rounded-3xl p-6">
            {!session && (
              <div className="mb-6">
                <div className="flex gap-3">
                  <input value={nickname} onChange={(event) => setNickname(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void handleJoin()}
                    placeholder="Ваш никнейм" maxLength={20}
                    className="min-w-0 flex-1 rounded-xl bg-surface border border-border px-4 py-3 outline-none focus:border-accent" />
                  <button onClick={() => void handleJoin()} disabled={joining}
                    className="rounded-xl bg-accent px-5 py-3 font-semibold text-white flex items-center gap-2 hover:brightness-110 disabled:opacity-50">
                    <SignIn size={20} />{joining ? "Вход..." : "Войти"}
                  </button>
                </div>
                <div className="mt-3 flex justify-between text-xs text-slate-400">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={rememberNickname}
                    onChange={(event) => setRememberNickname(event.target.checked)} /> Запомнить никнейм</label>
                  {loadSavedNickname() && <button onClick={() => { clearSavedNickname(); setNickname(""); }}>Забыть</button>}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-300"><Users size={20} /><span>Игроки ({lobby?.players.length ?? 0})</span></div>
              <span className="text-xs uppercase tracking-widest text-slate-500">{lobby?.phase ?? "—"}</span>
            </div>

            <motion.ul initial="hidden" animate="show" className="space-y-2 mb-6">
              <AnimatePresence>
                {lobby?.players.map((player) => (
                  <motion.li key={player.nickname} variants={item} layout initial="hidden" animate="show" exit={{ opacity: 0, x: -12 }}
                    className="flex items-center justify-between rounded-xl bg-surface/60 px-4 py-3 border border-border/60">
                    <span>{player.nickname}</span>
                    {player.ready && <span className="text-emerald-400 flex items-center gap-1 text-sm"><CheckCircle size={18} weight="fill" />Готов</span>}
                  </motion.li>
                ))}
              </AnimatePresence>
              {(!lobby || lobby.players.length === 0) && <li className="text-slate-500 text-sm py-4 text-center">Пока никого нет. Пригласи друзей!</li>}
            </motion.ul>

            {session && <div className="flex gap-3">
              <button onClick={() => void setReady(session.playerToken).catch((e: any) => setError(e?.message ?? "Ошибка"))}
                disabled={!canReady} className="flex-1 rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-40">
                {me?.ready ? "Ожидание других игроков..." : "ГОТОВ"}
              </button>
              <button onClick={() => void handleLeave()} disabled={joining} className="rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white hover:bg-slate-600">Выйти</button>
            </div>}
            <p className="text-xs text-slate-500 mt-4 text-center">Нужно минимум {minPlayers} игроков для старта</p>
            <p className="text-xs text-slate-600 mt-1 text-center">Лобби: {wsStatus === "open" ? "подключено" : "переподключение…"}</p>
          </section>

          <section className="glass rounded-3xl p-5 flex flex-col min-h-[360px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Чат лобби</h2><span className="text-xs text-slate-500">{messages.length} сообщений</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {messages.length === 0 && <p className="text-sm text-slate-500 text-center mt-10">Поздоровайся с игроками 👋</p>}
              {messages.map((message) => <article key={message.id} className="rounded-xl bg-surface/60 p-3 border border-border/60">
                <div className="flex justify-between gap-3 text-xs mb-1"><span className="font-semibold text-slate-200">{message.nickname}</span>
                  <time className="text-slate-500">{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
                <p className="text-sm text-slate-300 break-words">{message.text}</p>
              </article>)}
              <div ref={chatEndRef} />
            </div>
            <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); handleSendChat(); }}>
              <input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={300} disabled={!session}
                placeholder={session ? "Написать сообщение…" : "Войдите, чтобы писать в чат"}
                className="min-w-0 flex-1 rounded-xl bg-surface border border-border px-3 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-50" />
              <button type="submit" disabled={!session || !chatText.trim()} aria-label="Отправить сообщение"
                className="rounded-xl bg-accent px-3 text-white hover:brightness-110 disabled:opacity-40"><PaperPlaneTilt size={19} /></button>
            </form>
          </section>
        </div>
      </div>
    </motion.main>
  );
}
