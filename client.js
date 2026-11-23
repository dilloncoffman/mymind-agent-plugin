'use strict';

const { authError, credentialsAreSet, getCredentials, signRequest } = require('./auth');
const { exhaustedRetrySeconds, parseRateLimitHeader } = require('./transforms');

const BASE = 'https://api.mymind.com';

let requestLog = [];
let fetchImpl = globalThis.fetch;

function resetClient() {
  requestLog = [];
  fetchImpl = globalThis.fetch;
}

function getRequestLog() {
  return requestLog.slice();
}

function setFetchForTests(fn) {
  fetchImpl = fn;
}

function currentFetch() {
  if (process.env.MYMIND_MOCK_FETCH === '1') {
    return require('./fixtures/mock-fetch').fetch;
  }
  return fetchImpl;
}

function queryString(params) {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === '') continue;
        usp.append(key, String(item));
      }
    } else if (typeof value === 'boolean') {
      usp.set(key, value ? 'true' : 'false');
    } else {
      usp.set(key, String(value));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function problemDetail(payload, fallback) {
  if (payload && typeof payload === 'object') {
    return payload.detail || payload.type || fallback;
  }
  return fallback;
}

async function mymind(method, path, { query, body, headers, rawBody, rawResponse } = {}) {
  if (!credentialsAreSet()) throw authError();
  if (!path || !String(path).startsWith('/')) {
    const err = new Error('path must start with /');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  if (String(path).includes('?')) {
    const err = new Error('pass query parameters via the query option, not in path');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const { kid, secret, userAgent } = getCredentials();
  const qs = queryString(query);
  const { token } = signRequest({ kid, secret, method, path });
  const url = BASE + path + qs;

  requestLog.push({ method: method.toUpperCase(), path, query: query || null, url });

  const reqHeaders = {
    Authorization: `Bearer ${token}`,
    'User-Agent': userAgent,
    Accept: 'application/json',
    ...headers,
  };

  const init = { method: method.toUpperCase(), headers: reqHeaders, redirect: 'follow' };
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  let res;
  try {
    res = await currentFetch()(url, init);
  } catch (cause) {
    const err = new Error(`mymind request failed: ${cause.message}`);
    err.code = 'NETWORK';
    throw err;
  }

  const text = rawResponse ? null : await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const detail = problemDetail(payload, res.statusText || 'request failed');
    const policies = parseRateLimitHeader(res.headers.get('RateLimit'));
    let message;
    if (res.status === 401) {
      message = `mymind rejected the access key (HTTP 401). Check MYMIND_KEY_ID and MYMIND_KEY_SECRET. ${detail}`;
    } else if (res.status === 403) {
      message = `mymind forbidden (HTTP 403). The key may be read-only or lack permission for this action. ${detail}`;
    } else if (res.status === 429) {
      const wait = exhaustedRetrySeconds(policies);
      message = wait != null
        ? `mymind rate limit exceeded (HTTP 429). Wait ${wait} seconds before retrying. ${detail}`
        : `mymind rate limit exceeded (HTTP 429). ${detail}`;
    } else {
      message = `mymind API error HTTP ${res.status}: ${detail}`;
    }
    const err = new Error(message);
    err.code = res.status === 401 || res.status === 403 ? 'AUTH' : 'MYMIND';
    err.status = res.status;
    err.payload = payload;
    err.rateLimit = policies;
    throw err;
  }

  return { status: res.status, payload, headers: res.headers };
}

module.exports = {
  BASE,
  resetClient,
  getRequestLog,
  setFetchForTests,
  queryString,
  mymind,
};
