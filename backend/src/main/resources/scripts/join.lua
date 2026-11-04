-- Вход в лобби, атомарно.
-- KEYS: 1 players, 2 ready, 3 phase, 4 tokens, 5 round
-- ARGV: 1 nickname, 2 joinedAt, 3 playerToken
-- Ответ: LOCKED | TAKEN | OK | OK_RESET (лобби очищено после прошлого раунда)
local phase = redis.call('GET', KEYS[3])
if phase == 'starting' or phase == 'running' then
  return 'LOCKED'
end
local result = 'OK'
if phase == 'finished' then
  -- Первый вход после завершённого раунда открывает новое лобби.
  redis.call('DEL', KEYS[1], KEYS[2], KEYS[4], KEYS[5])
  result = 'OK_RESET'
end
if phase ~= 'waiting' then
  redis.call('SET', KEYS[3], 'waiting')
end
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then
  return 'TAKEN'
end
redis.call('HSET', KEYS[2], ARGV[1], 'false')
redis.call('HSET', KEYS[4], ARGV[3], ARGV[1])
return result
