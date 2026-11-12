const { shield } = require('./_shield');
const { LIST } = require('./_providers');

// Daftar penyedia untuk frontend (tanpa data sensitif).
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await shield(req, res, { name: 'prov', limit: 120 }))) return;
  return res.status(200).json({
    count: LIST.length,
    providers: LIST.map((p) => ({ id: p.id, name: p.name, site: p.site, custom: p.custom, live: p.live })),
  });
};
