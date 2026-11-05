import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Users, SignIn } from "@phosphor-icons/react";
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
import type { Session, LobbySnapshot, RoundInfo } from "../types";

interface Props {
  session: Session | null;
  onSession: (s: Session | null) => void;
  onRoundStart: (r: RoundInfo) => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

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

  const url = wsUrl("/ws/lobby");
  const { status: wsStatus } = useWebSocket({
    url,
    onMessage: (msg: any) => {
      if (msg?.type === "lobby") setLobby(msg.data as LobbySnapshot);
      if (msg?.type === "game-start") {
        const d = msg.data;
        setOffset(d.serverTime ?? d.startAt - 3000);
        onRoundStart({
          roundId: d.roundId,
          startAt: d.startAt,
          roundEndTime: d.roundEndTime,
          serverTime: d.serverTime,
        });
      }
    },
  });

  useEffect(() => {
    getLobbySnapshot().then(setLobby).catch(() => {});
  }, []);

  const handleJoin = async (nick?: string) => {
    const value = (nick ?? nickname).trim();
    if (!value) return;
    autoJoinAttempted.current = true;
    setJoining(true);
    setError(null);
    try {
      const s = await joinLobby(value);
      if (rememberNickname) saveNickname(s.nickname);
      else clearSavedNickname();
      saveSession(s);
      onSession(s);
      setNickname(s.nickname);
    } catch (e: any) {
      if (e?.status === 401) clearSession();
      setError(e?.message ?? "Не удалось войти");
    } finally {
      setJoining(false);
    }
  };

  // Автовход по сохранённому нику (один раз за монтирование).
  useEffect(() => {
    if (session) return;
    if (autoJoinAttempted.current) return;
    const saved = loadSavedNickname();
    if (!saved) return;
    autoJoinAttempted.current = true;
    setNickname(saved);
    void handleJoin(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleReady = async () => {
    if (!session) return;
    try {
      await setReady(session.playerToken);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка");
    }
  };

  const me = lobby?.players.find((p) => p.nickname === session?.nickname);
  const minPlayers = lobby?.minPlayers ?? 5;
  const canReady = (lobby?.players.length ?? 0) >= minPlayers && !me?.ready;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[100dvh] flex items-center justify-center px-4"
    >
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8 text-center"
        >
          <h1 className="text-4xl md:text-6xl tracking-tighter font-bold">
            MemeClicker
          </h1>
          <p className="text-slate-400 mt-2">Соревновательный кликинг в реальном времени</p>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {!session && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-3xl p-6 mb-6"
          >
            <div className="flex gap-3">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                placeholder="Ваш никнейм"
                className="flex-1 rounded-xl bg-surface border border-border px-4 py-3 outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => handleJoin()}
                disabled={joining}
                className="rounded-xl bg-accent px-5 py-3 font-semibold text-white flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50"
              >
                <SignIn size={20} />
                {joining ? "Вход..." : "Войти"}
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberNickname}
                  onChange={(e) => setRememberNickname(e.target.checked)}
                  className="accent-accent"
                />
                Запомнить никнейм
              </label>
              {loadSavedNickname() && (
                <button
                  type="button"
                  onClick={() => {
                    clearSavedNickname();
                    setNickname("");
                  }}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Забыть
                </button>
              )}
            </div>
          </motion.div>
        )}

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="glass rounded-3xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-slate-300">
              <Users size={20} />
              <span className="font-medium">
                Игроки ({lobby?.players.length ?? 0})
              </span>
            </div>
            <span className="text-xs uppercase tracking-widest text-slate-500">
              {lobby?.phase ?? "—"}
            </span>
          </div>

          <motion.ul variants={container} className="space-y-2 mb-6">
            <AnimatePresence>
              {lobby?.players.map((p) => (
                <motion.li
                  key={p.nickname}
                  variants={item}
                  layout
                  className="flex items-center justify-between rounded-xl bg-surface/60 px-4 py-3 border border-border/60"
                >
                  <span>{p.nickname}</span>
                  {p.ready && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-emerald-400 flex items-center gap-1 text-sm"
                    >
                      <CheckCircle size={18} weight="fill" />
                      Готов
                    </motion.span>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
            {(!lobby || lobby.players.length === 0) && (
              <motion.li variants={item} className="text-slate-500 text-sm py-4 text-center">
                Пока никого нет. Пригласи друзей!
              </motion.li>
            )}
          </motion.ul>

          {session && (
            <div className="flex gap-3">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleReady}
                disabled={!canReady}
                className="flex-1 rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
              >
                {me?.ready ? "Ожидание других игроков..." : "ГОТОВ"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={joining}
                onClick={async () => {
                  if (session?.playerToken) {
                    try {
                      await leaveLobby(session.playerToken);
                    } catch {
                      // Даже при ошибке сети очищаем локальную сессию.
                    }
                  }
                  clearSession();
                  onSession(null);
                  setNickname(loadSavedNickname() ?? "");
                }}
                className="rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white hover:bg-slate-600 transition disabled:opacity-50"
              >
                Выйти
              </motion.button>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-4 text-center">
            Нужно минимум {minPlayers} игроков для старта
          </p>
          <p className="text-xs text-slate-600 mt-1 text-center">
            Соединение: {wsStatus}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
