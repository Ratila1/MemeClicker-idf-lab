import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LobbyScreen } from "./components/LobbyScreen";
import { GameScreen } from "./components/GameScreen";
import { FinalScreen } from "./components/FinalScreen";
import { loadSession, clearSession } from "./state/session";
import { leaveLobby } from "./api/lobby";
import type { RoundInfo, Session } from "./types";

const MOCK_SESSION: Session = { nickname: "demo-player", playerToken: "demo-token" };
const MOCK_ROUND: RoundInfo = {
  roundId: "demo-round",
  startAt: Date.now() + 3000,
  roundEndTime: Date.now() + 63000,
};

type Screen = "lobby" | "game" | "final";

export default function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [session, setSession] = useState(loadSession());

  const handleRoundStart = (info: RoundInfo) => {
    setRound(info);
    setScreen("game");
  };

  const handleRoundEnd = () => {
    setScreen("final");
  };

  const handleLeave = async () => {
    if (session?.playerToken) {
      try {
        await leaveLobby(session.playerToken);
      } catch {
        // Игнорируем: локальную сессию всё равно очищаем.
      }
    }
    clearSession();
    setSession(null);
    setRound(null);
    setScreen("lobby");
  };

  const isDev = import.meta.env.DEV;

  const useMock = (s: Screen) => {
    if (s === "lobby") {
      setSession(MOCK_SESSION);
      setRound(null);
    } else {
      setSession(MOCK_SESSION);
      setRound(MOCK_ROUND);
    }
    setScreen(s);
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
      {isDev && (
        <div className="fixed top-2 right-2 z-50 flex gap-2 bg-surface/80 backdrop-blur px-3 py-2 rounded-xl border border-border">
          <button onClick={() => useMock("lobby")} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">
            Лобби
          </button>
          <button onClick={() => useMock("game")} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">
            Игра
          </button>
          <button onClick={() => useMock("final")} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">
            Финал
          </button>
        </div>
      )}
      <AnimatePresence mode="wait">
        {screen === "lobby" && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LobbyScreen session={session} onSession={setSession} onRoundStart={handleRoundStart} />
          </motion.div>
        )}
        {screen === "game" && round && session && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GameScreen round={round} session={session} onRoundEnd={handleRoundEnd} />
          </motion.div>
        )}
        {screen === "final" && round && (
          <motion.div key="final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FinalScreen round={round} onLeave={handleLeave} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
