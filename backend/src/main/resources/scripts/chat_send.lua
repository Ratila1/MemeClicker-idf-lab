-- KEYS: history, per-token 10s window, per-token send cooldown, per-token last text
-- ARGV: serialized message, maximum history size, window seconds, window limit,
--       cooldown milliseconds, last-text TTL seconds
if redis.call('GET', KEYS[4]) == ARGV[1] then
    return -1
end

local count = redis.call('INCR', KEYS[2])
if count == 1 then
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
end
if count > tonumber(ARGV[4]) then
    return 0
end

if not redis.call('SET', KEYS[3], '1', 'PX', tonumber(ARGV[5]), 'NX') then
    return 0
end

redis.call('SET', KEYS[4], ARGV[1], 'EX', tonumber(ARGV[6]))
redis.call('LPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
return 1
