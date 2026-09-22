const { requireAuth } = require('./_lib');
module.exports = (req, res) => {
  if (!requireAuth(req, res)) return;
  res.status(200).json({ authenticated: true });
};
