import { motion, AnimatePresence } from "framer-motion";
import { Trophy } from "@phosphor-icons/react";
import type { LeaderboardEntry } from "../types";

interface Props {
  entries: LeaderboardEntry[];
}

export function Leaderboard({ entries }: Props) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  return (
    <ol className="space-y-2">
      <AnimatePresence>
        {sorted.map((e, i) => (
          <motion.li
            key={e.nickname}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center justify-between rounded-xl bg-surface/60 px-4 py-3 border border-border/60"
          >
            <div className="flex items-center gap-3">
              <span className="text-slate-500 tabular-nums w-6">{i + 1}</span>
              <span className="font-medium">{e.nickname}</span>
            </div>
            <div className="flex items-center gap-2">
              {i === 0 && <Trophy size={18} className="text-amber-400" />}
              <span className="tabular-nums font-semibold">{e.score}</span>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
      {sorted.length === 0 && (
        <motion.li
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-slate-500 text-sm py-4 text-center"
        >
          Ожидание кликов...
        </motion.li>
      )}
    </ol>
  );
}
