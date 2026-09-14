const authCard = document.getElementById('auth-card');
const dashboard = document.getElementById('dashboard');
const unlockForm = document.getElementById('unlock-form');
const unlockNameInput = document.getElementById('unlock-name');
const unlockPinInput = document.getElementById('unlock-pin');
const authStatus = document.getElementById('auth-status');
const commitForm = document.getElementById('commit-form');
const nameInput = document.getElementById('name-input');
const wordInput = document.getElementById('word-input');
const statusMessage = document.getElementById('status-message');
const totalWordsEl = document.getElementById('total-words');
const streakCountEl = document.getElementById('streak-count');
const activeDaysEl = document.getElementById('active-days');
const heatmapEl = document.getElementById('heatmap');
const contributionCountEl = document.getElementById('contribution-count');
const yearButton = document.getElementById('year-button');
const monthLabelsEl = document.getElementById('month-labels');
const currentTimeEl = document.getElementById('current-time');
const historyListEl = document.getElementById('history-list');
const loadMoreBtn = document.getElementById('load-more-btn');
const resetButton = document.getElementById('reset-button');
const resetModal = document.getElementById('reset-modal');
const resetModalTitle = document.getElementById('reset-modal-title');
const resetModalText = document.getElementById('reset-modal-text');
const resetPinPanel = document.getElementById('reset-pin-panel');
const resetPinInput = document.getElementById('reset-pin-input');
const resetCancelBtn = document.getElementById('reset-cancel');
const resetContinueBtn = document.getElementById('reset-continue');
const resetConfirmBtn = document.getElementById('reset-confirm');
const resetModalStatus = document.getElementById('reset-modal-status');

let currentUser = null;
let historyOffset = 0;
let historyHasMore = false;

function setStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
}

function setAuthStatus(message, type = '') {
  authStatus.textContent = message;
  authStatus.className = `status-message ${type}`.trim();
}

function setDashboardVisible(isVisible) {
  dashboard.hidden = !isVisible;
  authCard.hidden = isVisible;
  if (isVisible) {
    loadClock();
  }
}

function getLevel(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

function renderSummary(data) {
  totalWordsEl.textContent = String(data.totalWords ?? 0);
  streakCountEl.textContent = `${data.streak ?? 0} day${(data.streak ?? 0) === 1 ? '' : 's'}`;
  activeDaysEl.textContent = String(data.activeDays ?? 0);
  contributionCountEl.textContent = `${data.totalWords ?? 0} contributions in the last year`;
}

function renderMonthLabels(history) {
  monthLabelsEl.innerHTML = '';
  if (!history.length) {
    return;
  }

  const monthNameFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });
  const first = new Date(`${history[0].date}T00:00:00`);
  const last = new Date(`${history[history.length - 1].date}T00:00:00`);

  const monthStarts = [];
  let cursor = new Date(first);
  cursor.setDate(1);

  while (cursor <= last) {
    monthStarts.push({
      month: monthNameFormatter.format(cursor),
      column: Math.floor((new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime() - first.getTime()) / 86400000 / 7),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  monthStarts.forEach((item, index) => {
    const label = document.createElement('span');
    label.className = 'month-label';
    label.textContent = item.month;
    label.style.gridColumn = `${Math.max(1, item.column + 1)} / span 1`;
    monthLabelsEl.appendChild(label);
  });
}

function buildEmptyYearHistory() {
  const history = [];
  const today = new Date();

  for (let i = 364; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const date = new Date(day.getTime() - day.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    history.push({ date, count: 0 });
  }

  return history;
}

function renderHeatmap(data) {
  heatmapEl.innerHTML = '';

  const history = data.history && data.history.length ? data.history : buildEmptyYearHistory();
  renderMonthLabels(history);

  const cells = [];
  history.forEach((entry, index) => {
    const cell = document.createElement('div');
    const level = getLevel(entry.count);
    const date = new Date(`${entry.date}T00:00:00`);
    const column = Math.floor(index / 7);
    const row = date.getDay();

    cell.className = `heatmap-day level-${level}`;
    cell.title = entry.date ? `${entry.date}: ${entry.count} word${entry.count === 1 ? '' : 's'}` : 'No contribution';
    cell.setAttribute('aria-label', entry.date ? `${entry.date}: ${entry.count} word${entry.count === 1 ? '' : 's'}` : 'No contribution');
    cell.style.gridColumn = `${column + 1}`;
    cell.style.gridRow = `${row + 1}`;
    cells.push(cell);
  });

  cells.forEach((cell) => heatmapEl.appendChild(cell));
}

function updateLiveYear() {
  const currentYear = new Date().getFullYear();
  if (yearButton) {
    yearButton.textContent = String(currentYear);
  }
}

function loadClock() {
  const now = new Date();
  const datePart = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timePart = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  currentTimeEl.textContent = `${datePart}\n${timePart}`;
  updateLiveYear();
}

function refreshDashboardIfNeeded() {
  if (!currentUser) {
    return;
  }

  loadDashboardData();
}

function renderHistory(items) {
  historyListEl.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'history-row history-header-row';
  header.innerHTML = '<span>Word</span><span>Date committed</span><span>Time committed</span>';
  historyListEl.appendChild(header);

  if (!items.length) {
    historyListEl.innerHTML += '<p class="empty-state">No words committed yet.</p>';
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <span class="history-item-word">${item.word}</span>
      <span>${item.date}</span>
      <span>${item.time}</span>
    `;
    historyListEl.appendChild(row);
  });
}

async function loadHistory(reset = true) {
  if (!currentUser) return;

  if (reset) {
    historyOffset = 0;
  }

  try {
    const response = await fetch(`/api/history?offset=${historyOffset}&limit=10`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load word history.');
    }

    if (reset) {
      renderHistory(data.items);
    } else {
      const currentItems = Array.from(historyListEl.querySelectorAll('.history-row:not(.history-header-row)'));
      const existingWords = new Set(currentItems.map((row) => row.querySelector('.history-item-word')?.textContent || ''));
      data.items.forEach((item) => {
        if (!existingWords.has(item.word)) {
          const row = document.createElement('div');
          row.className = 'history-row';
          row.innerHTML = `
            <span class="history-item-word">${item.word}</span>
            <span>${item.date}</span>
            <span>${item.time}</span>
          `;
          historyListEl.appendChild(row);
        }
      });
    }

    historyOffset += data.items.length;
    historyHasMore = Boolean(data.hasMore);
    loadMoreBtn.textContent = historyHasMore ? 'Load More' : 'No More Words';
    loadMoreBtn.disabled = !historyHasMore;
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadDashboardData() {
  if (!currentUser) return;

  try {
    const response = await fetch('/api/heatmap');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load your progress.');
    }

    renderSummary(data);
    renderHeatmap(data);
    await loadHistory(true);
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function initializeSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();

    if (!response.ok || !data.user) {
      setDashboardVisible(false);
      return;
    }

    currentUser = data.user;
    const storedName = localStorage.getItem('word-commit-name') || currentUser;
    localStorage.setItem('word-commit-name', storedName);
    nameInput.value = currentUser;
    nameInput.readOnly = true;
    setDashboardVisible(true);
    await loadDashboardData();
  } catch (error) {
    setDashboardVisible(false);
  }
}

unlockForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = unlockNameInput.value.trim();
  const pin = unlockPinInput.value.trim();

  if (!name || !pin) {
    setAuthStatus('Please enter both your name and 4-digit PIN.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to unlock.');
    }

    currentUser = data.user;
    localStorage.setItem('word-commit-name', currentUser);
    nameInput.value = currentUser;
    nameInput.readOnly = true;
    unlockNameInput.value = '';
    unlockPinInput.value = '';
    setAuthStatus('', '');
    setDashboardVisible(true);
    renderSummary(data.summary);
    renderHeatmap(data.summary);
    await loadHistory(true);
  } catch (error) {
    setAuthStatus(error.message, 'error');
  }
});

commitForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const word = wordInput.value.trim();
  if (!word) {
    setStatus('Please enter a valid word.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to save your word.');
    }

    wordInput.value = '';
    setStatus(data.message, 'success');
    renderSummary(data.summary);
    renderHeatmap(data.summary);
    await loadHistory(true);
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

function closeResetModal() {
  resetModal.classList.add('hidden');
  resetModal.setAttribute('aria-hidden', 'true');
  resetPinPanel.classList.add('hidden');
  resetContinueBtn.classList.remove('hidden');
  resetConfirmBtn.classList.add('hidden');
  resetModalStatus.textContent = '';
  resetModalStatus.className = 'status-message';
  resetPinInput.value = '';
}

function openResetModal() {
  resetModal.classList.remove('hidden');
  resetModal.setAttribute('aria-hidden', 'false');
  resetModalTitle.textContent = 'Reset all vocabulary data?';
  resetModalText.textContent = 'All committed words, streak information, activity data, and heatmap data will be permanently deleted.';
  resetContinueBtn.classList.remove('hidden');
  resetConfirmBtn.classList.add('hidden');
  resetPinPanel.classList.add('hidden');
  resetPinInput.value = '';
  resetModalStatus.textContent = '';
  resetModalStatus.className = 'status-message';
}

resetButton.addEventListener('click', () => {
  openResetModal();
});

resetCancelBtn.addEventListener('click', () => {
  closeResetModal();
});

resetContinueBtn.addEventListener('click', () => {
  resetModalTitle.textContent = 'Enter your 4-digit PIN to confirm reset';
  resetModalText.textContent = 'Only your current data will be deleted. Your profile and PIN will remain saved.';
  resetPinPanel.classList.remove('hidden');
  resetContinueBtn.classList.add('hidden');
  resetConfirmBtn.classList.remove('hidden');
  resetPinInput.focus();
});

resetConfirmBtn.addEventListener('click', async () => {
  const pin = resetPinInput.value.trim();

  if (!/^\d{4}$/.test(pin)) {
    resetModalStatus.textContent = 'Please enter a valid 4-digit PIN.';
    resetModalStatus.className = 'status-message error';
    return;
  }

  try {
    const response = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to reset your data.');
    }

    resetModalStatus.textContent = data.message;
    resetModalStatus.className = 'status-message success';
    closeResetModal();
    setStatus(data.message, 'success');
    renderSummary({ totalWords: 0, streak: 0, activeDays: 0, name: currentUser || 'Your' });
    renderHeatmap({ history: Array(365).fill({ date: '', count: 0 }) });
    await loadDashboardData();
    setTimeout(() => {
      resetModalStatus.textContent = '';
      resetModalStatus.className = 'status-message';
    }, 2000);
  } catch (error) {
    resetModalStatus.textContent = error.message;
    resetModalStatus.className = 'status-message error';
  }
});

loadMoreBtn.addEventListener('click', async () => {
  if (!historyHasMore) return;
  await loadHistory(false);
});

setDashboardVisible(false);
renderSummary({ totalWords: 0, streak: 0, activeDays: 0, name: 'Your' });
renderHeatmap({ history: [] });
renderHistory([]);
updateLiveYear();
setInterval(loadClock, 1000);
setInterval(refreshDashboardIfNeeded, 60000);
initializeSession();
