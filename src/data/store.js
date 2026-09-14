const fs = require('fs');
const { DATA_DIR, DATA_FILE } = require('../config/constants');
const { hashPin } = require('../utils/validation');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], entries: [] }, null, 2));
}

function readData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{"users":[],"entries":[]}');

  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
  };
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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

module.exports = {
  readData,
  writeData,
  getUser,
  ensureUser,
};
