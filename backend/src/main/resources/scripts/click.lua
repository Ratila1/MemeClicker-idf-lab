-- Идемпотентный учёт клика: dedup и инкремент в одном атомарном скрипте.
-- KEYS: 1 dedup:{roundId}:{clickUUID}, 2 leaderboard:{roundId}
-- ARGV: 1 nickname, 2 ttlSeconds
-- Ответ: 1 клик учтён, 0 дубликат
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[2]) then
  redis.call('ZINCRBY', KEYS[2], 1, ARGV[1])
  return 1
end
return 0
