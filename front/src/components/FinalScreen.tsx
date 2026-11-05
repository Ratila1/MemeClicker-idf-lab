import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, ArrowCounterClockwise, Sparkle } from "@phosphor-icons/react";
import { getRoundResults } from "../api/round";
import type { RoundInfo, RoundResults } from "../types";

interface Props { round: RoundInfo; onLeave: () => void }

export function FinalScreen({ round, onLeave }: Props) {
    const [results, setResults] = useState<RoundResults | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        let retry: number | undefined;
        const poll = async () => {
            try {
                const value = await getRoundResults(round.roundId);
                if (!cancelled) { setResults(value); setLoading(false); }
            } catch (error: any) {
                if (cancelled) return;
                if (error?.status === 404 && import.meta.env.DEV) {
                    setResults({ roundId: round.roundId, winner: "demo-player", entries: [
                            { nickname: "demo-player", score: 42, winner: true },
                            { nickname: "alice", score: 31, winner: false },
                            { nickname: "bob", score: 18, winner: false },
                        ], finishedAt: Date.now() });
                    setLoading(false);
                } else if (error?.status === 404) retry = window.setTimeout(poll, 800);
                else setLoading(false);
            }
        };
        void poll();
        return () => { cancelled = true; if (retry) clearTimeout(retry); };
    }, [round.roundId]);

    if (loading) return <div className="min-h-[100dvh] flex items-center justify-center"><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full" /></div>;

    const winner = results?.winner ?? "—";
    return (
        <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative min-h-[100dvh] flex items-center justify-center px-4 py-10 overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                {Array.from({ length: 18 }, (_, i) => <motion.div key={i} className="absolute text-amber-300"
                                                                  initial={{ opacity: 0, x: `${(i * 37) % 100}%`, y: "-10%", rotate: 0 }} animate={{ opacity: [0, 1, 0], y: "110vh", rotate: 360 }}
                                                                  transition={{ duration: 2.5 + (i % 5) * 0.4, delay: (i % 9) * 0.12, repeat: Infinity, repeatDelay: 1.2 }}>
                    <Sparkle size={12 + (i % 3) * 7} weight="fill" />
                </motion.div>)}
            </div>
            <div className="relative w-full max-w-2xl">
                <motion.header initial={{ y: 30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 130, damping: 14 }} className="text-center mb-8">
                    <motion.div animate={{ y: [0, -8, 0], rotate: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 2.4 }}>
                        <Trophy size={82} className="mx-auto text-amber-400 mb-4 drop-shadow-[0_0_28px_rgba(251,191,36,0.55)]" weight="fill" />
                    </motion.div>
                    <p className="uppercase tracking-[0.3em] text-amber-300 text-sm font-bold">Победа!</p>
                    <h1 className="text-4xl md:text-6xl tracking-tighter font-black mt-2">Раунд завершён</h1>
                    <p className="text-slate-400 mt-3 text-lg">Лучший игрок — <span className="text-accent font-bold">{winner}</span></p>
                </motion.header>

                <motion.section initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="glass rounded-3xl p-6 mb-6">
                    <ul className="space-y-2">
                        {results?.entries.map((entry, index) => <motion.li key={entry.nickname} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                                                           transition={{ delay: 0.3 + index * 0.08 }} className={`flex items-center justify-between rounded-xl px-4 py-3 border ${entry.winner ? "bg-amber-400/10 border-amber-400/40" : "bg-surface/60 border-border/60"}`}>
                            <div className="flex items-center gap-3"><span className="text-slate-500 tabular-nums w-6">{index + 1}</span><span className="font-medium">{entry.nickname}</span>
                                {entry.winner && <Trophy size={18} className="text-amber-400" weight="fill" />}</div>
                            <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ delay: 0.35 + index * 0.08, type: "spring" }} className="tabular-nums font-bold text-lg">{entry.score}</motion.span>
                        </motion.li>)}
                    </ul>
                </motion.section>
                <motion.button whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }} onClick={onLeave}
                               className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white flex items-center justify-center gap-2 hover:brightness-110 transition">
                    <ArrowCounterClockwise size={20} /> В главное меню
                </motion.button>
            </div>
        </motion.main>
    );
}
