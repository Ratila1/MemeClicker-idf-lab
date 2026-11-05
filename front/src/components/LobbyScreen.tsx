import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Lightning, SignIn, Trophy, Users } from "@phosphor-icons/react";
import { joinLobby, setReady, leaveLobby, getLobbySnapshot } from "../api/lobby";
import { saveSession, clearSession, loadSavedNickname, saveNickname, clearSavedNickname } from "../state/session";
import { useWebSocket } from "../ws/useWebSocket";
import { setOffset } from "../utils/clock";
import { wsUrl } from "../utils/ws";
import type { LobbySnapshot, RoundInfo, Session } from "../types";
import { ChatPanel } from "./ChatPanel";

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
  const autoJoinAttempted = useRef(false);

  const { status: wsStatus } = useWebSocket({
    url: wsUrl("/ws/lobby"),
    onMessage: (msg: any) => {
      if (msg?.type === "lobby") setLobby(msg.data as LobbySnapshot);
      if (msg?.type === "game-start") {
        const data = msg.data;
        setOffset(data.serverTime ?? data.startAt - 5000);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleLeave = async () => {
    if (!session) return;
    try {
      await leaveLobby(session.playerToken);
    } catch {
      // Clear the local session while retaining the saved nickname.
    }
    clearSession();
    onSession(null);
    setNickname(loadSavedNickname() ?? "");
  };

  const me = lobby?.players.find((player) => player.nickname === session?.nickname);
  const minPlayers = lobby?.minPlayers ?? 5;
  const playerCount = lobby?.players.length ?? 0;
  const canReady = playerCount >= minPlayers && !me?.ready;
  const waitingForPlayers = Math.max(0, minPlayers - playerCount);
  const isConnected = wsStatus === "open";

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden px-4 py-8 md:px-6 md:py-12">
      <div aria-hidden className="lobby-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto w-full max-w-6xl">
        <motion.header initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.07] px-3 py-1.5 text-xs font-semibold tracking-wide text-orange-200">
              <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`} />
              {isConnected ? "СЕРВЕР НА СВЯЗИ" : "ПОДКЛЮЧАЕМСЯ"}
            </div>
            <h1 className="text-5xl font-black tracking-[-0.06em] text-white sm:text-7xl">Meme<span className="text-orange-400">Clicker</span></h1>
            <p className="mt-3 max-w-xl text-base text-slate-400 sm:text-lg">Собери команду, нажми «Готов» и докажи, что твой палец быстрее всех.</p>
          </div>
          <div className="flex gap-3 md:pb-1">
            <div className="glass min-w-28 rounded-2xl px-4 py-3 text-center">
              <div className="text-2xl font-black tabular-nums text-white">{playerCount}<span className="text-slate-500">/{minPlayers}</span></div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">игроков</div>
            </div>
            <div className="glass min-w-28 rounded-2xl px-4 py-3 text-center">
              <div className="text-2xl font-black text-orange-300">60<span className="text-sm">с</span></div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">раунд</div>
            </div>
          </div>
        </motion.header>

        <AnimatePresence>
          {error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            role="alert" className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</motion.div>}
        </AnimatePresence>

        <div className="grid items-stretch gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="glass flex flex-col rounded-3xl p-5 sm:p-7">
            {!session ? (
              <div className="mb-7 rounded-2xl border border-white/[0.06] bg-slate-950/35 p-4 sm:p-5">
                <p className="mb-3 text-sm font-semibold text-slate-200">Войди в игру</p>
                <form onSubmit={(event) => { event.preventDefault(); void handleJoin(); }} className="flex flex-col gap-3 sm:flex-row">
                  <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Придумай никнейм" maxLength={20}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-orange-400/60" />
                  <button type="submit" disabled={joining || !nickname.trim()}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 font-bold text-white shadow-lg shadow-orange-500/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                    <SignIn size={19} />{joining ? "Входим…" : "Войти в лобби"}
                  </button>
                </form>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={rememberNickname} onChange={(event) => setRememberNickname(event.target.checked)} /> Запомнить ник</label>
                  {loadSavedNickname() && <button type="button" onClick={() => { clearSavedNickname(); setNickname(""); }} className="hover:text-slate-300">Забыть ник</button>}
                </div>
              </div>
            ) : (
              <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
                <div><p className="text-xs uppercase tracking-widest text-slate-500">Вы в игре как</p><p className="mt-1 text-lg font-bold text-white">{session.nickname}</p></div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Игрок</span>
              </div>
            )}

            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="text-xl font-bold text-white">Комната ожидания</h2><p className="mt-1 text-sm text-slate-500">{lobby?.phase === "starting" ? "Все готовы — готовимся к старту" : "Игроки, которые сыграют в следующем раунде"}</p></div>
              <span className="rounded-full border border-white/[0.08] bg-slate-950/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{lobby?.phase ?? "подключение"}</span>
            </div>

            <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <motion.div initial={false} animate={{ width: `${Math.min(100, (playerCount / Math.max(1, minPlayers)) * 100)}%` }} className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300" />
            </div>

            <motion.ul initial="hidden" animate="show" className="mb-6 flex-1 space-y-2">
              <AnimatePresence initial={false}>
                {lobby?.players.map((player, index) => (
                  <motion.li key={player.nickname} variants={item} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12 }}
                    className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-slate-950/30 px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-xs font-bold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                      <span className="truncate font-semibold text-slate-200">{player.nickname}{player.nickname === session?.nickname && <span className="ml-2 text-xs font-normal text-orange-300">это вы</span>}</span>
                    </div>
                    {player.ready ? <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300"><CheckCircle size={16} weight="fill" /> Готов</span>
                      : <span className="text-xs text-slate-500">Ожидает</span>}
                  </motion.li>
                ))}
              </AnimatePresence>
              {playerCount === 0 && <li className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">Пока пусто — заходи первым!</li>}
            </motion.ul>

            {session && <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={() => void setReady(session.playerToken).catch((e: any) => setError(e?.message ?? "Не удалось отметить готовность"))}
                disabled={!canReady || lobby?.phase !== "waiting"}
                className="flex-1 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3.5 font-bold text-white shadow-lg shadow-orange-500/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                {me?.ready ? "Ждём остальных игроков…" : "Я ГОТОВ — ПОЕХАЛИ!"}
              </button>
              <button onClick={() => void handleLeave()} disabled={joining} className="rounded-2xl border border-white/10 bg-slate-800/70 px-5 py-3.5 font-semibold text-slate-300 transition hover:bg-slate-700 disabled:opacity-50">Выйти</button>
            </div>}
            <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
              <Users size={15} />{waitingForPlayers > 0 ? `Ещё ${waitingForPlayers} ${waitingForPlayers === 1 ? "игрок" : "игрока"} до старта` : "Команда собрана — можно начинать"}
            </p>
          </section>

          <ChatPanel session={session} />
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><Lightning size={14} className="text-orange-400" />60 секунд на раунд</span>
          <span className="inline-flex items-center gap-1.5"><Trophy size={14} className="text-amber-400" />Побеждает самый быстрый</span>
        </footer>
      </div>
    </main>
  );
}
