-- starting -> running, только если речь о текущем раунде.
-- KEYS: 1 phase, 2 round
-- ARGV: 1 roundId
if redis.call('GET', KEYS[1]) == 'starting' and redis.call('HGET', KEYS[2], 'roundId') == ARGV[1] then
  redis.call('SET', KEYS[1], 'running')
  return 1
end
return 0
