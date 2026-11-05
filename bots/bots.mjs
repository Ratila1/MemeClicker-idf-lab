#!/usr/bin/env node
// Боты для проверки игры против запущенного сервиса. Нужен Node 22+ (глобальные fetch и WebSocket).
// Запуск: node bots.mjs https://memeclicker.onrender.com [игроков=5] [кликов/с=10]
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
const PLAYERS = Number(process.argv[3] ?? 5);
const CPS = Number(process.argv[4] ?? 10);
const DUP_EVERY = 4; // каждый 4-й клик отправляется дважды с тем же UUID
const WS_BASE = BASE.replace(/^http/, 'ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeJson = (t) => { try { return JSON.parse(t); } catch { return null; } };
const pct = (arr, p) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? safeJson(text) : null };
}

function openWs(path, onMessage) {
  const ws = new WebSocket(WS_BASE + path);
  ws.addEventListener('message', (ev) => {
    const m = safeJson(String(ev.data));
    if (m) onMessage(m, Date.now());
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('ws error ' + path)));
  });
}

async function warmUp() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(BASE + '/api/lobby')).ok) return; } catch { /* сервис просыпается */ }
    await sleep(3000);
  }
  throw new Error('Сервис не отвечает за 2 минуты');
}

async function join(i) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const nickname = `b${i}${Math.random().toString(36).slice(2, 7)}`;
    const r = await api('POST', '/api/lobby/join', { body: { nickname } });
    if (r.status === 200) return { nickname, token: r.json.playerToken };
    if (r.status !== 423 && r.status !== 409) throw new Error(`join: HTTP ${r.status}`);
    await sleep(2000); // идёт чужой раунд или ник занят
  }
  throw new Error('лобби занято слишком долго');
}

async function play(bot, start) {
  const offset = start.serverTime - start.receivedAt; // server = local + offset
  const startLocal = start.startAt - offset;
  const endLocal = start.roundEndTime - offset;
  await sleep(Math.max(0, startLocal - Date.now()));

  const stat = { accepted: new Set(), codes: {}, latencies: [], sent: 0, startLocal, endLocal };
  const inflight = [];
  const fire = async (uuid) => {
    const t0 = performance.now();
    let code;
    try {
      code = (await api('POST', '/api/click', { token: bot.token, body: { roundId: start.roundId, clickUUID: uuid } })).status;
    } catch { code = 'net'; }
    stat.latencies.push(performance.now() - t0);
    stat.codes[code] = (stat.codes[code] ?? 0) + 1;
    if (code === 202) stat.accepted.add(uuid);
  };

  const interval = 1000 / CPS;
  let next = startLocal;
  let n = 0;
  while (Date.now() < endLocal + 500) { // ещё 0.5 с после конца: сервер должен отвечать 423
    const uuid = randomUUID();
    inflight.push(fire(uuid));
    stat.sent++;
    if (++n % DUP_EVERY === 0) inflight.push(fire(uuid));
    next += interval;
    await sleep(Math.max(0, next - Date.now()));
  }
  await Promise.all(inflight);
  return stat;
}

async function main() {
  console.log(`Цель: ${BASE}, игроков: ${PLAYERS}, кликов/с на игрока: ${CPS}`);
  await warmUp();

  const bots = await Promise.all(Array.from({ length: PLAYERS }, (_, i) => join(i + 1)));
  for (const bot of bots) {
    let resolveStart;
    bot.started = new Promise((r) => { resolveStart = r; });
    bot.wsReady = openWs('/ws/lobby', (m, t) => {
      if (m.type === 'game-start') resolveStart({ ...m.data, receivedAt: t });
    });
  }
  await Promise.all(bots.map((b) => b.wsReady));

  const lb = { times: [], roundEnd: null };
  await openWs('/ws/leaderboard', (m, t) => {
    if (m.type === 'leaderboard') lb.times.push(t);
    if (m.type === 'round-end') lb.roundEnd = t;
  });

  const ready = await Promise.all(bots.map((b) => api('POST', '/api/lobby/ready', { token: b.token })));
  ready.forEach((r) => { if (r.status !== 204) throw new Error(`ready: HTTP ${r.status}`); });

  const starts = await Promise.all(bots.map((b) => b.started));
  const spread = Math.max(...starts.map((s) => s.receivedAt)) - Math.min(...starts.map((s) => s.receivedAt));
  const roundId = starts[0].roundId;
  console.log(`Раунд ${roundId} стартовал, расхождение game-start между ботами: ${spread} мс`);

  const stats = await Promise.all(bots.map((b, i) => play(b, starts[i])));

  const t0 = Date.now();
  let results = null;
  while (Date.now() - t0 < 40_000) {
    const r = await api('GET', `/api/round/${roundId}/results`);
    if (r.status === 200) { results = r.json; break; }
    await sleep(250);
  }
  const resultsDelay = Date.now() - Math.max(...stats.map((s) => s.endLocal));

  // инвариант: счёт игрока = число уникальных UUID с ответом 202
  const scores = new Map((results?.entries ?? []).map((e) => [e.nickname, e.score]));
  let ok = results != null;
  const rows = bots.map((b, i) => {
    const expected = stats[i].accepted.size;
    const actual = scores.get(b.nickname) ?? 0;
    if (expected !== actual) ok = false;
    return { player: b.nickname, sent: stats[i].sent, accepted202: expected, score: actual, match: expected === actual ? 'OK' : 'FAIL', codes: JSON.stringify(stats[i].codes) };
  });

  const lat = stats.flatMap((s) => s.latencies);
  const during = lb.times.filter((t) => t >= Math.min(...stats.map((s) => s.startLocal)) && t <= Math.max(...stats.map((s) => s.endLocal)));
  const gaps = during.slice(1).map((t, i) => t - during[i]);
  const metrics = {
    clickLatencyMs: { p50: r1(pct(lat, 0.5)), p95: r1(pct(lat, 0.95)), p99: r1(pct(lat, 0.99)), max: r1(Math.max(...lat)) },
    leaderboardGapMs: { updates: during.length, p95: pct(gaps, 0.95), max: gaps.length ? Math.max(...gaps) : null },
    startSpreadMs: spread,
    resultsAfterRoundEndMs: results ? resultsDelay : null,
    roundEndEventReceived: lb.roundEnd != null,
  };

  console.table(rows);
  console.log(JSON.stringify(metrics, null, 2));
  console.log(ok ? 'РЕЗУЛЬТАТ: PASS, потерь и двойных засчётов нет' : 'РЕЗУЛЬТАТ: FAIL, счёт не сходится или итогов нет');

  writeFileSync(`report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    JSON.stringify({ target: BASE, roundId, ok, rows, metrics }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('Ошибка:', e.message); process.exit(2); });
