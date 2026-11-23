'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { decodeSecret, signRequest, isBlankOrPlaceholder } = require('./auth');

// Public signing example from https://access.mymind.com/api/authentication
// (kid + the docs example secret, which is base64("this is a secret")).
// Not a real access key.
const KID = 'r4s5t6u7v8w9x0y1z2a3b4';
const SECRET = 'dGhpcyBpcyBhIHNlY3JldA=='; // docs example secret
const GOLDEN =
  'eyJhbGciOiJIUzI1NiIsImtpZCI6InI0czV0NnU3djh3OXgweTF6MmEzYjQifQ.eyJtZXRob2QiOiJHRVQiLCJwYXRoIjoiL29iamVjdHMiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDMwMH0.G0a_kIBlOVu-p3cmz3q9EQr5Kbj1zjE0hjzx3He4drw';

describe('signRequest', () => {
  it('matches the official HS256 example vector', () => {
    const { token, iat, exp } = signRequest({
      kid: KID,
      secret: SECRET,
      method: 'GET',
      path: '/objects',
      now: 1700000000,
    });
    assert.equal(token, GOLDEN);
    assert.equal(iat, 1700000000);
    assert.equal(exp, 1700000300);
  });

  it('uppercases the method and binds the path', () => {
    const { token } = signRequest({
      kid: KID,
      secret: SECRET,
      method: 'post',
      path: '/objects',
      now: 1700000000,
    });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    assert.equal(payload.method, 'POST');
    assert.equal(payload.path, '/objects');
  });

  it('decodes the base64 secret to raw key bytes', () => {
    assert.equal(decodeSecret(SECRET).toString(), 'this is a secret');
    assert.equal(decodeSecret(SECRET).length, 16);
  });

  it('rejects a path that includes a query string', () => {
    assert.throws(
      () => signRequest({ kid: KID, secret: SECRET, method: 'GET', path: '/objects?q=x' }),
      /query string/,
    );
  });

  it('treats unexpanded plugin placeholders as blank', () => {
    assert.equal(isBlankOrPlaceholder('${MYMIND_KEY_SECRET}'), true);
    assert.equal(isBlankOrPlaceholder('  '), true);
    assert.equal(isBlankOrPlaceholder(SECRET), false);
  });
});
