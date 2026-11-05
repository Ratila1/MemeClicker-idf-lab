import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Lightning } from "@phosphor-icons/react";
import { useWebSocket } from "../ws/useWebSocket";
import { useClickQueue } from "../hooks/useClickQueue";
import { serverNow } from "../utils/clock";
import { wsUrl } from "../utils/ws";
import type { Session, RoundInfo, LeaderboardEntry } from "../types";
import { Leaderboard } from "./Leaderboard";

interface Props {
  round: RoundInfo;
  session: Session;
  onRoundEnd: () => void;
}

export function GameScreen({ round, session, onRoundEnd }: Props) {
  const { click, start, stop } = useClickQueue(session, round.roundId);
  const [timeLeft, setTimeLeft] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [clicks, setClicks] = useState(0);
  const [pulse, setPulse] = useState(0);
  const endedRef = useRef(false);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = serverNow();
      const left = Math.max(0, round.roundEndTime - now);
      setTimeLeft(Math.ceil(left / 1000));
      if (left <= 0 && !endedRef.current) {
        endedRef.current = true;
      }
    }, 200);
    return () => clearInterval(id);
  }, [round]);

  const url = wsUrl("/ws/leaderboard");
  const { status: wsStatus } = useWebSocket({
    url,
    onMessage: (msg: any) => {
      if (msg?.type === "leaderboard") {
        setLeaderboard(msg.data as LeaderboardEntry[]);
      }
      if (msg?.type === "round-end") {
        onRoundEnd();
      }
    },
  });

  const canClick = timeLeft > 0;

  const handleClick = async () => {
    if (!canClick) return;
    setPulse((p) => p + 1);
    const status = await click();
    if (status === 202) {
      setClicks((c) => c + 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8 gap-8"
    >
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-3 text-slate-300"
      >
        <Lightning size={24} className="text-accent" />
        <span className="text-lg font-medium">Раунд идёт</span>
      </motion.div>

      <motion.div
        key={timeLeft}
        initial={{ scale: 1.1, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-6xl md:text-8xl font-bold tracking-tighter tabular-nums"
      >
        {timeLeft}
        <span className="text-2xl text-slate-500 ml-2">с</span>
      </motion.div>

      <div className="relative">
        <AnimatePresence>
          {pulse > 0 && (
            <motion.span
              key={pulse}
              initial={{ scale: 0.8, opacity: 0.6 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 rounded-full bg-accent/30 pointer-events-none"
            />
          )}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleClick}
          disabled={!canClick}
          className="relative w-48 h-48 md:w-64 md:h-64 rounded-full bg-gradient-to-br from-accent to-orange-600 text-white text-2xl font-bold shadow-2xl shadow-accent/30 disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-2"
        >
          <Lightning size={40} weight="fill" />
          <span>КЛИК!</span>
          <span className="text-sm opacity-80">{clicks}</span>
        </motion.button>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md glass rounded-3xl p-6"
      >
        <p className="text-xs text-slate-500 mb-2 text-center">Соединение: {wsStatus}</p>
        <div className="flex items-center gap-2 mb-4 text-slate-300">
          <Trophy size={20} className="text-amber-400" />
          <span className="font-medium">Лидерборд</span>
        </div>
        <Leaderboard entries={leaderboard} />
      </motion.div>
    </motion.div>
  );
}
