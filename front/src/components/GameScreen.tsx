import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Lightning } from "@phosphor-icons/react";
import { useWebSocket } from "../ws/useWebSocket";
import { useClickQueue } from "../hooks/useClickQueue";
import { serverNow } from "../utils/clock";
import { wsUrl } from "../utils/ws";
import type { Session, RoundInfo, LeaderboardEntry } from "../types";
import { Leaderboard } from "./Leaderboard";
import { ChatPanel } from "./ChatPanel";

interface Props {
  round: RoundInfo;
  session: Session;
  onRoundEnd: () => void;
}

export function GameScreen({ round, session, onRoundEnd }: Props) {
  const { click, start, stop } = useClickQueue(session, round.roundId);
  const [timeLeft, setTimeLeft] = useState(60);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [clicks, setClicks] = useState(0);
  const [pulse, setPulse] = useState(0);
  const endedRef = useRef(false);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  useEffect(() => {
    const update = () => {
      const now = serverNow();
      const untilStart = round.startAt - now;
      const untilEnd = round.roundEndTime - now;
      setCountdown(untilStart > 0 ? Math.ceil(untilStart / 1000) : null);
      setTimeLeft(Math.max(0, Math.ceil(untilEnd / 1000)));
      if (untilEnd <= 0) endedRef.current = true;
    };
    update();
    const timerId = window.setInterval(update, 50);
    return () => window.clearInterval(timerId);
  }, [round]);

  const { status: wsStatus } = useWebSocket({
    url: wsUrl("/ws/leaderboard"),
    onMessage: (msg: any) => {
      if (msg?.type === "leaderboard") setLeaderboard(msg.data as LeaderboardEntry[]);
      if (msg?.type === "round-end") onRoundEnd();
    },
  });

  const canClick = countdown === null && timeLeft > 0;
  const handleClick = async () => {
    if (!canClick) return;
    setPulse((value) => value + 1);
    if ((await click()) === 202) setClicks((value) => value + 1);
  };

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-[100dvh] px-4 py-8 md:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-7">
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3 text-slate-300">
          <Lightning size={24} className="text-accent" />
          <span className="text-lg font-medium">{countdown !== null ? "Приготовься!" : canClick ? "Раунд идёт" : "Раунд завершён"}</span>
        </motion.div>

        <AnimatePresence mode="wait">
          {countdown !== null ? (
            <motion.div key={`count-${countdown}`} initial={{ scale: 0.35, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.6, opacity: 0, rotate: 12 }} transition={{ type: "spring", stiffness: 280, damping: 17 }}
              className="text-8xl font-black tabular-nums text-accent drop-shadow-[0_0_30px_rgba(249,115,22,0.65)] md:text-9xl">{countdown}</motion.div>
          ) : (
            <motion.div key="timer" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-6xl font-bold tracking-tighter tabular-nums md:text-8xl">
              {timeLeft}<span className="ml-2 text-2xl text-slate-500">с</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          <AnimatePresence>{pulse > 0 && <motion.span key={pulse} initial={{ scale: 0.8, opacity: 0.6 }} animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }} className="pointer-events-none absolute inset-0 rounded-full bg-accent/30" />}</AnimatePresence>
          <motion.button whileTap={canClick ? { scale: 0.92 } : undefined} onClick={handleClick} disabled={!canClick}
            className="relative flex h-48 w-48 flex-col items-center justify-center rounded-full bg-gradient-to-br from-accent to-orange-600 text-2xl font-bold text-white shadow-2xl shadow-accent/30 disabled:cursor-not-allowed disabled:opacity-40 md:h-64 md:w-64">
            <Lightning size={40} weight="fill" /><span>КЛИК!</span><span className="text-sm opacity-80">{clicks}</span>
          </motion.button>
        </div>

        <div className="grid w-full items-start gap-5 lg:grid-cols-2">
          <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass rounded-3xl p-5 sm:p-6">
            <p className="mb-2 text-center text-xs text-slate-500">Соединение: {wsStatus}</p>
            <div className="mb-4 flex items-center gap-2 text-slate-300"><Trophy size={20} className="text-amber-400" /><span className="font-medium">Лидерборд</span></div>
            <Leaderboard entries={leaderboard} />
          </motion.section>
          <ChatPanel session={session} />
        </div>
      </div>
    </motion.main>
  );
}
