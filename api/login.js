const { setSession } = require('./_lib');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD is not configured.' });
  if (!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid admin password.' });
  setSession(res);
  return res.status(200).json({ ok: true });
};
