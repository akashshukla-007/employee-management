const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables.');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function sign(value) {
  const secret = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function makeSession() {
  const value = crypto.randomBytes(32).toString('hex');
  return `${value}.${sign(value)}`;
}

function validSession(req) {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith('ems_session='));
  if (!cookie) return false;
  const token = decodeURIComponent(cookie.slice('ems_session='.length));
  const [value, mac] = token.split('.');
  if (!value || !mac || mac.length !== 64) return false;
  const expected = sign(value);
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

function requireAuth(req, res) {
  if (!validSession(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function setSession(res) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `ems_session=${encodeURIComponent(makeSession())}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=28800`);
}

function clearSession(res) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `ems_session=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`);
}

function age(dob) {
  if (!dob) return '';
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? a : '';
}

function safeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function json(res, status, body) {
  res.status(status).json(body);
}

module.exports = { supabase, requireAuth, setSession, clearSession, age, safeName, json };
