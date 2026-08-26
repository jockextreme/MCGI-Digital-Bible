const crypto = require('crypto');

const tokens = new Map(); // token -> { operatorId, expires }
const TTL_MS = 30000;

function issueWsToken(operatorId) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { operatorId, expires: Date.now() + TTL_MS });
  return token;
}

function consumeWsToken(token) {
  const entry = tokens.get(token);
  if (!entry) return null;
  tokens.delete(token); // single-use
  if (Date.now() > entry.expires) return null;
  return entry.operatorId;
}

// Periodic cleanup of anything that expired without being used.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tokens.entries()) {
    if (now > entry.expires) tokens.delete(token);
  }
}, 60000);
sweeper.unref();

module.exports = { issueWsToken, consumeWsToken };
