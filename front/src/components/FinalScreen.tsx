import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, ArrowCounterClockwise } from "@phosphor-icons/react";
import { getRoundResults } from "../api/round";
import type { RoundInfo } from "../types";

interface Props {
  round: RoundInfo;
  onLeave: () => void;
}

export function FinalScreen({ round, onLeave }: Props) {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRoundResults(round.roundId)
      .then(setResults)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [round.roundId]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const winner = results?.winner ?? "—";

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
          className="text-center mb-8"
        >
          <Trophy size={64} className="mx-auto text-amber-400 mb-4" weight="fill" />
          <h1 className="text-4xl md:text-6xl tracking-tighter font-bold">Раунд завершён</h1>
          <p className="text-slate-400 mt-2">
            Победитель: <span className="text-accent font-semibold">{winner}</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-3xl p-6 mb-6"
        >
          <ul className="space-y-2">
            {results?.entries?.map((e: any, i: number) => (
              <motion.li
                key={e.nickname}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between rounded-xl bg-surface/60 px-4 py-3 border border-border/60"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 tabular-nums w-6">{i + 1}</span>
                  <span className="font-medium">{e.nickname}</span>
                </div>
                <div className="flex items-center gap-2">
                  {e.winner && <Trophy size={18} className="text-amber-400" weight="fill" />}
                  <span className="tabular-nums font-semibold">{e.score}</span>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onLeave}
          className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white flex items-center justify-center gap-2 hover:brightness-110 transition"
        >
          <ArrowCounterClockwise size={20} />
          В лобби
        </motion.button>
      </div>
    </motion.div>
  );
}
