const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'entries.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_PAGE_SIZE = 10;
const sessions = new Map();

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({ users: [], entries: [] }, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  req.cookies = parseCookies(req);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

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

function readData() {
  const raw = fs.readFileSync(dataFile, 'utf8');
  const parsed = JSON.parse(raw || '{"users":[],"entries":[]}');

  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
  };
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
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

function getUser(name) {
  const data = readData();
  return data.users.find((user) => user.name === name) || null;
}

function ensureUser(name, pin) {
  const data = readData();
  let user = data.users.find((entry) => entry.name === name);

  if (!user) {
    user = {
      name,
      pin_hash: hashPin(pin),
      created_at: new Date().toISOString(),
    };
    data.users.push(user);
  } else if (!user.pin_hash) {
    user.pin_hash = hashPin(pin);
  }

  writeData(data);
  return user;
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

function buildHeatmapData(name) {
  const data = readData();
  const entries = data.entries.filter((entry) => entry.user_name === name);
  const counts = {};
  let totalWords = 0;

  for (const entry of entries) {
    counts[entry.entry_date] = (counts[entry.entry_date] || 0) + 1;
    totalWords += 1;
  }

  const dates = [];
  const end = new Date();
  for (let i = 364; i >= 0; i -= 1) {
    dates.push(dateKey(addDays(end, -i)));
  }

  const history = dates.map((day) => ({
    date: day,
    count: counts[day] || 0,
  }));

  const activeDates = Object.keys(counts).sort();
  let streak = 0;

  if (activeDates.length > 0) {
    let cursor = new Date(activeDates[activeDates.length - 1]);
    while (counts[dateKey(cursor)] > 0) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return {
    name,
    counts,
    history,
    totalWords,
    streak,
    activeDays: activeDates.length,
    maxCount: Math.max(...Object.values(counts), 0),
  };
}

function getHistory(name, offset = 0, limit = HISTORY_PAGE_SIZE) {
  const data = readData();
  const history = data.entries
    .filter((entry) => entry.user_name === name)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const page = history.slice(offset, offset + limit).map((entry) => ({
    word: entry.word,
    date: new Date(entry.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: new Date(entry.created_at).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
    created_at: entry.created_at,
  }));

  return {
    items: page,
    total: history.length,
    hasMore: offset + limit < history.length,
  };
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
  const limit = Math.max(1, Number.parseInt(req.query.limit || String(HISTORY_PAGE_SIZE), 10) || HISTORY_PAGE_SIZE);
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Word-Commit is running on http://localhost:${PORT}`);
});
