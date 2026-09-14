const crypto = require('crypto');

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function normalizeWord(word) {
  return String(word || '').trim().toLowerCase().replace(/[^a-z]/gi, '');
}

function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '');
}

function isValidPin(pin) {
  return /^\d{4}$/.test(normalizePin(pin));
}

function dateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, storedHash) {
  if (!storedHash || !isValidPin(pin)) {
    return false;
  }

  const [salt, hash] = String(storedHash).split(':');
  if (!salt || !hash) {
    return false;
  }

  const candidate = crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex');
  if (candidate.length !== hash.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  } catch (error) {
    return false;
  }
}

module.exports = {
  normalizeName,
  normalizeWord,
  normalizePin,
  isValidPin,
  dateKey,
  addDays,
  hashPin,
  verifyPin,
};
