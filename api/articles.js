const kv = require('./_kv');
module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30');
  res.status(200).json({ list: (await kv.get('articles')) || [] });
};
