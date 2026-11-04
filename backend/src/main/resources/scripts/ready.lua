-- «ГОТОВ» + атомарная проверка «все готовы». Два одновременных вызова
-- не могут запустить два раунда: скрипт выполняется в Redis целиком.
-- KEYS: 1 players, 2 ready, 3 phase, 4 round
-- ARGV: 1 nickname, 2 minPlayers, 3 roundId, 4 startAt, 5 endAt
-- Ответ: LOCKED | NOT_IN_LOBBY | NOT_ENOUGH | OK | STARTED
local phase = redis.call('GET', KEYS[3])
if phase and phase ~= 'waiting' then
  return 'LOCKED'
end
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then
  return 'NOT_IN_LOBBY'
end
local players = redis.call('HLEN', KEYS[1])
if players < tonumber(ARGV[2]) then
  return 'NOT_ENOUGH'
end
redis.call('HSET', KEYS[2], ARGV[1], 'true')
local ready = 0
local flags = redis.call('HVALS', KEYS[2])
for i = 1, #flags do
  if flags[i] == 'true' then
    ready = ready + 1
  end
end
if ready < players then
  return 'OK'
end
redis.call('SET', KEYS[3], 'starting')
redis.call('DEL', KEYS[4])
redis.call('HSET', KEYS[4], 'roundId', ARGV[3], 'startAt', ARGV[4], 'endAt', ARGV[5])
return 'STARTED'
