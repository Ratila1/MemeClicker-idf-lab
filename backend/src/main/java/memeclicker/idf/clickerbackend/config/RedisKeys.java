package memeclicker.idf.clickerbackend.config;

/** Все ключи Redis в одном месте. */
public final class RedisKeys {

    public static final String PLAYERS = "lobby:global:players";
    public static final String READY = "lobby:global:ready";
    public static final String PHASE = "lobby:global:phase";
    public static final String ROUND = "lobby:global:round";
    public static final String TOKENS = "lobby:global:tokens";
    public static final String HISTORY = "matches:history";
    public static final String CHAT_HISTORY = "chat:global:history";

    private RedisKeys() {
    }

    public static String dedup(String roundId, String clickUuid) {
        return "dedup:" + roundId + ":" + clickUuid;
    }

    public static String leaderboard(String roundId) {
        return "leaderboard:" + roundId;
    }

    public static String match(String roundId) {
        return "match:" + roundId;
    }

    public static String chatWindow(String token) {
        return "chat:rate:window:" + token;
    }

    public static String chatLastSent(String token) {
        return "chat:rate:last:" + token;
    }

    public static String chatLastText(String token) {
        return "chat:last-text:" + token;
    }
}
