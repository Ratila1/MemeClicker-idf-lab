-- Фиксация итогов по маркеру ROUND_END, атомарно и идемпотентно.
-- KEYS: 1 leaderboard:{roundId}, 2 match:{roundId}, 3 matches:history, 4 phase, 5 round
-- ARGV: 1 roundId, 2 finishedAt (epoch ms)
-- Ответ: 1 итоги записаны сейчас, 0 уже были записаны (повторный маркер)
local written = 0
if redis.call('EXISTS', KEYS[2]) == 0 then
  local rows = redis.call('ZREVRANGE', KEYS[1], 0, -1, 'WITHSCORES')
  local total = 0
  local winner = ''
  local best = -1
  for i = 1, #rows, 2 do
    local score = tonumber(rows[i + 1])
    total = total + score
    -- Победитель: максимальный счёт; при равенстве лексикографически меньший ник.
    if score > best or (score == best and rows[i] < winner) then
      best = score
      winner = rows[i]
    end
  end
  redis.call('HSET', KEYS[2], 'roundId', ARGV[1], 'finishedAt', ARGV[2], 'winner', winner, 'total', total)
  redis.call('ZADD', KEYS[3], ARGV[2], ARGV[1])
  written = 1
end
-- Фазу трогаем, только если маркер относится к текущему раунду.
if redis.call('HGET', KEYS[5], 'roundId') == ARGV[1] then
  redis.call('SET', KEYS[4], 'finished')
end
return written
