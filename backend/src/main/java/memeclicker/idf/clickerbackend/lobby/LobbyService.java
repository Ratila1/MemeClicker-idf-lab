package memeclicker.idf.clickerbackend.lobby;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import memeclicker.idf.clickerbackend.config.ClickerProperties;
import memeclicker.idf.clickerbackend.config.RedisKeys;
import memeclicker.idf.clickerbackend.round.RoundScheduler;
import memeclicker.idf.clickerbackend.round.RoundState;
import memeclicker.idf.clickerbackend.round.RoundStateHolder;
import memeclicker.idf.clickerbackend.web.ApiException;

@Service
public class LobbyService {

    private static final Logger log = LoggerFactory.getLogger(LobbyService.class);
    private static final Pattern NICKNAME = Pattern.compile("[\\p{L}\\p{N}_\\-]{1,20}");

    private final StringRedisTemplate redis;
    private final RedisScript<String> joinScript;
    private final RedisScript<String> readyScript;
    private final RedisScript<Long> leaveScript;
    private final PlayerTokens tokens;
    private final RoundStateHolder rounds;
    private final RoundScheduler scheduler;
    private final ApplicationEventPublisher events;
    private final ClickerProperties props;

    public LobbyService(StringRedisTemplate redis, RedisScript<String> joinScript, RedisScript<String> readyScript,
                        RedisScript<Long> leaveScript, PlayerTokens tokens, RoundStateHolder rounds,
                        RoundScheduler scheduler, ApplicationEventPublisher events, ClickerProperties props) {
        this.redis = redis;
        this.joinScript = joinScript;
        this.readyScript = readyScript;
        this.leaveScript = leaveScript;
        this.tokens = tokens;
        this.rounds = rounds;
        this.scheduler = scheduler;
        this.events = events;
        this.props = props;
    }

    public String join(String rawNickname) {
        var nickname = rawNickname == null ? "" : rawNickname.trim();
        if (!NICKNAME.matcher(nickname).matches()) throw ApiException.badRequest("Никнейм: 1-20 символов, буквы, цифры, _ или -");
        var token = UUID.randomUUID().toString();
        var result = redis.execute(joinScript,
                List.of(RedisKeys.PLAYERS, RedisKeys.READY, RedisKeys.PHASE, RedisKeys.TOKENS, RedisKeys.ROUND),
                nickname, Long.toString(System.currentTimeMillis()), token);
        switch (result) {
            case "LOCKED" -> throw ApiException.locked("Раунд уже идёт, дождитесь окончания");
            case "TAKEN" -> throw ApiException.conflict("nickname_taken", "Никнейм уже занят");
            case "OK_RESET" -> tokens.clear();
            case "OK" -> { }
            default -> throw new IllegalStateException("join.lua: " + result);
        }
        tokens.remember(token, nickname);
        events.publishEvent(new LobbyChangedEvent());
        return token;
    }

    public void leave(String token) {
        var nickname = tokens.resolve(token).orElseThrow(ApiException::unauthorized);
        Long reset = redis.execute(leaveScript,
                List.of(RedisKeys.PLAYERS, RedisKeys.READY, RedisKeys.TOKENS, RedisKeys.PHASE, RedisKeys.ROUND),
                nickname, token);
        tokens.forget(token);
        if (reset != null && reset == 1L) tokens.clear();
        events.publishEvent(new LobbyChangedEvent());
    }

    /** Resolve chat identity from the server-issued token; never trust a client-supplied nickname. */
    public Optional<String> nicknameForToken(String token) {
        return tokens.resolve(token);
    }

    public void ready(String token) {
        var nickname = tokens.resolve(token).orElseThrow(ApiException::unauthorized);
        var roundId = UUID.randomUUID().toString();
        long startAt = System.currentTimeMillis() + props.startDelay().toMillis();
        long endAt = startAt + props.roundDuration().toMillis();
        var result = redis.execute(readyScript,
                List.of(RedisKeys.PLAYERS, RedisKeys.READY, RedisKeys.PHASE, RedisKeys.ROUND),
                nickname, Integer.toString(props.minPlayers()), roundId, Long.toString(startAt), Long.toString(endAt));
        switch (result) {
            case "LOCKED" -> throw ApiException.locked("Раунд уже стартует или идёт");
            case "NOT_IN_LOBBY" -> throw ApiException.unauthorized();
            case "NOT_ENOUGH" -> throw ApiException.conflict("not_enough_players", "Нужно минимум " + props.minPlayers() + " игроков");
            case "OK" -> events.publishEvent(new LobbyChangedEvent());
            case "STARTED" -> {
                log.info("round {} starts at {}, ends at {}", roundId, startAt, endAt);
                scheduler.roundCreated(new RoundState(roundId, startAt, endAt));
            }
            default -> throw new IllegalStateException("ready.lua: " + result);
        }
    }

    public LobbySnapshot snapshot() {
        var phase = Optional.ofNullable(redis.opsForValue().get(RedisKeys.PHASE)).orElse("waiting");
        Map<Object, Object> players = redis.opsForHash().entries(RedisKeys.PLAYERS);
        Map<Object, Object> ready = redis.opsForHash().entries(RedisKeys.READY);
        var list = new ArrayList<PlayerInfo>(players.size());
        players.forEach((nick, joinedAt) -> list.add(new PlayerInfo(nick.toString(),
                "true".equals(String.valueOf(ready.get(nick))), Long.parseLong(joinedAt.toString()))));
        list.sort(Comparator.comparingLong(PlayerInfo::joinedAt).thenComparing(PlayerInfo::nickname));
        return new LobbySnapshot(phase, list, props.minPlayers());
    }

    public Optional<GameStart> activeRoundStart() {
        return rounds.current().filter(round -> System.currentTimeMillis() < round.endAt())
                .map(round -> new GameStart(round.roundId(), round.startAt(), round.endAt(), System.currentTimeMillis()));
    }
}
