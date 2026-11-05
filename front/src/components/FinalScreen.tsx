import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowCounterClockwise, Sparkle, Trophy } from "@phosphor-icons/react";
import { getRoundResults } from "../api/round";
import type { RoundInfo, RoundResults } from "../types";

interface Props {
  round: RoundInfo;
  onLeave: () => void;
}

const confetti = Array.from({ length: 44 }, (_, index) => {
  const angle = (index / 44) * Math.PI * 2 + (index % 3) * 0.11;
  const distance = 115 + ((index * 47) % 230);
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance + 70,
    rotate: 240 + ((index * 73) % 600),
    delay: 0.18 + (index % 11) * 0.025,
    color: ["#fbbf24", "#fb923c", "#f97316", "#f8fafc", "#a78bfa"][index % 5],
    size: 6 + (index % 4) * 2,
  };
});

export function FinalScreen({ round, onLeave }: Props) {
  const [results, setResults] = useState<RoundResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retry: number | undefined;

    const poll = async () => {
      try {
        const value = await getRoundResults(round.roundId);
        if (!cancelled) {
          setResults(value);
          setLoading(false);
          setFailed(false);
        }
      } catch (error: any) {
        if (cancelled) return;
        if (error?.status === 404 && import.meta.env.DEV) {
          setResults({
            roundId: round.roundId,
            winner: "demo-player",
            entries: [
              { nickname: "demo-player", score: 42, winner: true },
              { nickname: "alice", score: 31, winner: false },
              { nickname: "bob", score: 18, winner: false },
            ],
            finishedAt: Date.now(),
          });
          setLoading(false);
        } else if (error?.status === 404) {
          retry = window.setTimeout(poll, 800);
        } else {
          setFailed(true);
          setLoading(false);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [round.roundId]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 text-slate-400">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full"
        />
        <p>Подводим итоги раунда…</p>
      </div>
    );
  }

  const winner = results?.winner;
  const winnerEntry = results?.entries.find((entry) => entry.winner);

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden px-4 py-12 md:py-16">
      <div aria-hidden className="celebration-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="fixed inset-0 z-20 overflow-hidden pointer-events-none">
        <div className="absolute left-1/2 top-[36%]">
          {confetti.map((particle, index) => (
            <motion.span
              key={index}
              className="absolute block rounded-sm shadow-lg"
              style={{
                width: particle.size,
                height: particle.size * (index % 3 === 0 ? 1.8 : 1),
                backgroundColor: particle.color,
                boxShadow: `0 0 12px ${particle.color}70`,
              }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.2, rotate: 0 }}
              animate={{
                x: particle.x,
                y: particle.y,
                opacity: [0, 1, 1, 0],
                scale: [0.2, 1.2, 0.9],
                rotate: particle.rotate,
              }}
              transition={{ duration: 2.2 + (index % 5) * 0.18, delay: particle.delay, ease: "easeOut" }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <motion.header
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 16 }}
          className="mb-9 text-center"
        >
          <motion.div
            initial={{ scale: 0.35, rotate: -25 }}
            animate={{ scale: [0.35, 1.18, 1], rotate: [-25, 8, 0] }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full border border-amber-300/30 bg-amber-300/10 text-amber-300 shadow-[0_0_70px_rgba(251,191,36,0.22)]"
          >
            <Trophy size={54} weight="fill" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-xs font-bold uppercase tracking-[0.42em] text-amber-300"
          >
            Раунд завершён
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34 }}
            className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl"
          >
            {winner ? "Победа!" : "Отличная игра!"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.48 }}
            className="mt-3 text-lg text-slate-400"
          >
            {winner ? <>Лучший игрок — <span className="font-bold text-orange-400">{winner}</span></> : "В этом раунде нет п��бедителя"}
          </motion.p>
        </motion.header>

        {winner && (
          <motion.section
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.55, type: "spring", stiffness: 110, damping: 16 }}
            className="winner-card relative mb-7 overflow-hidden rounded-3xl border border-amber-300/25 p-6 text-center sm:p-8"
          >
            <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-amber-400/10 via-transparent to-orange-500/10" />
            <div className="relative">
              <div className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-amber-300">
                <Sparkle size={16} weight="fill" /> Чемпион раунда <Sparkle size={16} weight="fill" />
              </div>
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="text-3xl font-black text-white sm:text-5xl"
              >
                {winner}
              </motion.div>
              {winnerEntry && <p className="mt-2 text-slate-300">{winnerEntry.score.toLocaleString()} кликов</p>}
            </div>
          </motion.section>
        )}

        <motion.section
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.68 }}
          className="glass rounded-3xl p-4 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between px-1">
            <div>
              <h2 className="text-lg font-bold text-white">Таблица результатов</h2>
              <p className="mt-1 text-xs text-slate-500">Все участники этого раунда</p>
            </div>
            <Trophy size={22} className="text-amber-400" weight="fill" />
          </div>
          <ol className="space-y-2">
            {results?.entries.map((entry, index) => (
              <motion.li
                key={entry.nickname}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.78 + index * 0.07 }}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 sm:px-5 ${entry.winner
                  ? "border-amber-400/40 bg-amber-300/[0.09] shadow-[inset_0_0_24px_rgba(251,191,36,0.05)]"
                  : "border-white/[0.06] bg-slate-800/45"}`}
              >
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <span className={`w-6 text-center font-mono text-sm ${index === 0 ? "text-amber-300" : "text-slate-500"}`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate font-semibold text-slate-100">{entry.nickname}</span>
                  {entry.winner && <Trophy size={18} className="shrink-0 text-amber-300" weight="fill" />}
                </div>
                <span className="ml-4 tabular-nums font-bold text-white">{entry.score.toLocaleString()}</span>
              </motion.li>
            ))}
          </ol>
          {failed && <p role="status" className="mt-4 text-center text-sm text-rose-300">Не удалось загрузить результаты. Попробуйте вернуться в меню.</p>}
        </motion.section>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          whileHover={{ scale: 1.015, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onLeave}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 font-bold text-white shadow-lg shadow-orange-500/20 transition hover:brightness-110"
        >
          <ArrowCounterClockwise size={20} /> В главное меню
        </motion.button>
      </div>
    </main>
  );
}
