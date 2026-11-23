'use strict';

const crypto = require('node:crypto');

const PLACEHOLDERS = new Set([
  '${MYMIND_KEY_ID}',
  '${MYMIND_KEY_SECRET}',
  '${MYMIND_USER_AGENT}',
]);

function isBlankOrPlaceholder(value) {
  if (value === undefined || value === null) return true;
  const text = String(value).trim();
  return !text || PLACEHOLDERS.has(text);
}

function envValue(name) {
  const raw = process.env[name];
  if (isBlankOrPlaceholder(raw)) return null;
  return String(raw).trim();
}

function getCredentials() {
  return {
    kid: envValue('MYMIND_KEY_ID'),
    secret: envValue('MYMIND_KEY_SECRET'),
    userAgent: envValue('MYMIND_USER_AGENT') || 'mymind-agent-plugin/0.1.0',
  };
}

function credentialsAreSet() {
  const { kid, secret } = getCredentials();
  return Boolean(kid && secret);
}

function decodeSecret(secret) {
  if (isBlankOrPlaceholder(secret)) {
    throw new Error('MYMIND_KEY_SECRET is not set');
  }
  return Buffer.from(String(secret).trim(), 'base64');
}

function signRequest({ kid, secret, method, path, now, ttlSec = 300 }) {
  if (isBlankOrPlaceholder(kid)) {
    throw new Error('MYMIND_KEY_ID is not set');
  }
  if (!method) throw new Error('method is required');
  if (!path || !String(path).startsWith('/')) {
    throw new Error('path must be an absolute API path starting with /');
  }
  if (String(path).includes('?')) {
    throw new Error('JWT path must not include a query string');
  }

  const iat = now === undefined ? Math.floor(Date.now() / 1000) : Number(now);
  const exp = iat + ttlSec;
  const key = Buffer.isBuffer(secret) ? secret : decodeSecret(secret);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: String(kid) })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({
      method: String(method).toUpperCase(),
      path: String(path),
      iat,
      exp,
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', key).update(data).digest('base64url');
  return { token: `${data}.${sig}`, iat, exp };
}

function authError() {
  const err = new Error(
    'MYMIND_KEY_ID and MYMIND_KEY_SECRET are not set. Create an access key at https://access.mymind.com/extensions (the secret is shown only once), then configure MYMIND_KEY_ID and MYMIND_KEY_SECRET as plugin variables. Do not paste the secret into chat.',
  );
  err.code = 'AUTH';
  return err;
}

module.exports = {
  PLACEHOLDERS,
  isBlankOrPlaceholder,
  envValue,
  getCredentials,
  credentialsAreSet,
  decodeSecret,
  signRequest,
  authError,
};
