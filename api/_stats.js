// Statistik ringan di memori (reset saat instance serverless dingin)
const kv = require('./_kv');
const s = global.__tm || (global.__tm = { since: Date.now(), c: {}, ev: [] });
module.exports = {
  add(k, m) {
    s.c[k] = (s.c[k] || 0) + 1;
    kv.incr(k);
    s.ev.unshift({ t: Date.now(), k, m: m || '' });
    if (s.ev.length > 40) s.ev.length = 40;
  },
  get: () => s,
};
