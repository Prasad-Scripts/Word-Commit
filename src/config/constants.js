const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  DATA_FILE,
  PORT: process.env.PORT || 3000,
  SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  HISTORY_PAGE_SIZE: 10,
};
