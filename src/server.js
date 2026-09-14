const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { PORT, SESSION_TTL_MS } = require('./config/constants');
const { readData, writeData, getUser, ensureUser } = require('./data/store');
const { buildHeatmapData, getHistory } = require('./services/heatmap');
const {
  normalizeName,
  normalizeWord,
  normalizePin,
  isValidPin,
  dateKey,
  hashPin,
  verifyPin,
} = require('./utils/validation');

const app = express();
const sessions = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  req.cookies = parseCookies(req);
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';

  header.split(';').forEach((pair) => {
    const [key, ...rest] = pair.split('=');
    if (!key) return;
    const value = rest.join('=');
    cookies[key.trim()] = decodeURIComponent((value || '').trim());
  });

  return cookies;
}

function createSession(res, userName) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    user_name: userName,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  res.cookie('wordcommit_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
  });

  return token;
}

function getSession(req) {
  const token = req.cookies.wordcommit_session;
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Session expired. Please unlock again.' });
  }

  req.sessionUser = session.user_name;
  return next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'word-commit is running' });
});

app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.json({ user: null });
  }

  return res.json({ user: session.user_name });
});

app.post('/api/unlock', (req, res) => {
  const name = normalizeName(req.body.name);
  const pin = normalizePin(req.body.pin);

  if (!name) {
    return res.status(400).json({ error: 'Please enter your full name.' });
  }

  if (!isValidPin(pin)) {
    return res.status(400).json({ error: 'Please enter a valid 4-digit PIN.' });
  }

  let user = getUser(name);
  if (!user) {
    const data = readData();
    const hasLegacyEntries = data.entries.some((entry) => entry.user_name === name);
    user = ensureUser(name, pin);
    if (!hasLegacyEntries) {
      user = ensureUser(name, pin);
    }
  }

  if (!verifyPin(pin, user.pin_hash)) {
    return res.status(401).json({ error: 'Incorrect PIN.' });
  }

  createSession(res, name);
  return res.json({ ok: true, user: name, summary: buildHeatmapData(name) });
});

app.get('/api/heatmap', requireSession, (req, res) => {
  return res.json(buildHeatmapData(req.sessionUser));
});

app.get('/api/history', requireSession, (req, res) => {
  const offset = Math.max(0, Number.parseInt(req.query.offset || '0', 10) || 0);
  const limit = Math.max(1, Number.parseInt(req.query.limit || '10', 10) || 10);
  return res.json(getHistory(req.sessionUser, offset, limit));
});

app.post('/api/commit', requireSession, (req, res) => {
  const name = req.sessionUser;
  const word = normalizeWord(req.body.word);

  if (!word) {
    return res.status(400).json({ error: 'Please enter a valid English word.' });
  }

  const data = readData();
  const today = dateKey();
  const existing = data.entries.find(
    (entry) => entry.user_name === name && entry.word === word && entry.entry_date === today,
  );

  if (existing) {
    const summary = buildHeatmapData(name);
    return res.status(409).json({
      error: 'That word is already logged for today.',
      summary,
    });
  }

  data.entries.push({
    user_name: name,
    word,
    entry_date: today,
    created_at: new Date().toISOString(),
  });

  writeData(data);

  const summary = buildHeatmapData(name);
  return res.status(201).json({
    message: `Saved “${word}” for ${name}.`,
    summary,
  });
});

app.post('/api/reset', requireSession, (req, res) => {
  const name = req.sessionUser;
  const pin = normalizePin(req.body.pin);

  if (!isValidPin(pin)) {
    return res.status(400).json({ error: 'Please enter a valid 4-digit PIN.' });
  }

  const data = readData();
  const user = data.users.find((entry) => entry.name === name);
  if (!user || !verifyPin(pin, user.pin_hash)) {
    return res.status(401).json({ error: 'Incorrect PIN. Your data was not reset.' });
  }

  data.entries = data.entries.filter((entry) => entry.user_name !== name);
  writeData(data);

  return res.json({
    ok: true,
    message: 'Your vocabulary data has been reset successfully.',
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Word-Commit is running on http://localhost:${PORT}`);
});
