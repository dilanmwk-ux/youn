const BRAND_ALIAS = {
  'facebookmail.com': 'facebook.com',
  'fb.com': 'facebook.com',
  'googlemail.com': 'google.com',
  'discordapp.com': 'discord.com',
  'microsoftonline.com': 'microsoft.com',
  'amazonses.com': '',
};
const SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'or', 'go', 'web', 'my', 'sch']);

export function brandDomain(from) {
  const m = String(from || '').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  if (!m) return '';
  const h = m[1].split('.');
  let n = 2;
  if (h.length >= 3 && h[h.length - 1].length === 2 && SLD.has(h[h.length - 2])) n = 3;
  const d = h.slice(-n).join('.');
  return Object.prototype.hasOwnProperty.call(BRAND_ALIAS, d) ? BRAND_ALIAS[d] : d;
}

