const { clearSession } = require('./_lib');
module.exports = (req, res) => {
  clearSession(res);
  return res.status(200).json({ ok: true });
};
