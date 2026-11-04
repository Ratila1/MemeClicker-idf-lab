import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LobbyScreen } from "./components/LobbyScreen";
import { GameScreen } from "./components/GameScreen";
import { FinalScreen } from "./components/FinalScreen";
import { loadSession, clearSession } from "./state/session";
import type { RoundInfo } from "./types";

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

  const handleLeave = () => {
    clearSession();
    setSession(null);
    setRound(null);
    setScreen("lobby");
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
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
