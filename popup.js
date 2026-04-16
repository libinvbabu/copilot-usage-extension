(() => {
  'use strict';

  // Default working days: Mon(1)–Fri(5)
  const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

  const checkboxes = Array.from(document.querySelectorAll('input[name="day"]'));
  const saveBtn    = document.getElementById('save-btn');
  const statusEl   = document.getElementById('status');

  let statusTimer = null;

  // ── Load saved settings ──────────────────────────────────────────────────
  chrome.storage.sync.get({ workingDays: DEFAULT_WORKING_DAYS }, ({ workingDays }) => {
    checkboxes.forEach((cb) => {
      cb.checked = workingDays.includes(Number(cb.value));
    });
  });

  // ── Save settings ────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    const workingDays = checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => Number(cb.value));

    chrome.storage.sync.set({ workingDays }, () => {
      showStatus('Saved ✓');
    });
  });

  function showStatus(text) {
    statusEl.textContent = text;
    statusEl.classList.add('visible');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl.classList.remove('visible'), 2000);
  }
})();
