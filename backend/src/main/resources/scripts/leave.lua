-- Remove the departing player atomically; reset a finished lobby when its last player leaves.
-- KEYS: players, ready, tokens, phase, round
-- ARGV: nickname, playerToken
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[2], ARGV[1])
redis.call('HDEL', KEYS[3], ARGV[2])

if redis.call('GET', KEYS[4]) == 'finished' and redis.call('HLEN', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[2], KEYS[3], KEYS[5])
  redis.call('SET', KEYS[4], 'waiting')
  return 1
end
return 0
