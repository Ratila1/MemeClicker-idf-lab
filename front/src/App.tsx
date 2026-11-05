import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LobbyScreen } from "./components/LobbyScreen";
import { GameScreen } from "./components/GameScreen";
import { FinalScreen } from "./components/FinalScreen";
import { loadSession, clearSession } from "./state/session";
import { leaveLobby } from "./api/lobby";
import type { RoundInfo, Session } from "./types";
import pepeImage from "./images/pepe.png";
import dogeImage from "./images/doge.png";

const MOCK_SESSION: Session = { nickname: "demo-player", playerToken: "demo-token" };
const MOCK_ROUND: RoundInfo = {
  roundId: "demo-round",
  startAt: Date.now() + 5000,
  roundEndTime: Date.now() + 65000,
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

  const handleRoundEnd = () => setScreen("final");

  const handleLeave = async () => {
    if (session?.playerToken) {
      try {
        await leaveLobby(session.playerToken);
      } catch {
        // Clear local state even if the request fails.
      }
    }
    clearSession();
    setSession(null);
    setRound(null);
    setScreen("lobby");
  };

  const useMock = (nextScreen: Screen) => {
    setSession(MOCK_SESSION);
    setRound(nextScreen === "lobby" ? null : MOCK_ROUND);
    setScreen(nextScreen);
  };

  return (
    <div className="relative min-h-[100dvh] bg-bg">
      <div className="site-mascots" aria-hidden="true">
        <img className="site-mascot site-mascot-left" src={pepeImage} alt="" />
        <img className="site-mascot site-mascot-right" src={dogeImage} alt="" />
      </div>
      {import.meta.env.DEV && (
        <div className="fixed right-2 top-2 z-50 flex gap-2 rounded-xl border border-border bg-surface/80 px-3 py-2 backdrop-blur">
          {(["lobby", "game", "final"] as Screen[]).map((next) => (
            <button key={next} onClick={() => useMock(next)} className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600">
              {next === "lobby" ? "Лобби" : next === "game" ? "Игра" : "Финал"}
            </button>
          ))}
        </div>
      )}
      <div className="relative z-10">
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
    </div>
  );
}
