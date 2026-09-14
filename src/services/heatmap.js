const { readData } = require('../data/store');
const { dateKey, addDays } = require('../utils/validation');
const { HISTORY_PAGE_SIZE } = require('../config/constants');

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

module.exports = {
  buildHeatmapData,
  getHistory,
};
