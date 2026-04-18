document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const dashboardInput = document.getElementById('dashboardUrl');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const scoutBtn = document.getElementById('scoutBtn');
  const scoutStatus = document.getElementById('scoutStatus');
  const lastRun = document.getElementById('lastRun');

  // Load saved settings
  chrome.storage.sync.get(['claudeApiKey', 'dashboardUrl'], (data) => {
    if (data.dashboardUrl) dashboardInput.value = data.dashboardUrl;
    if (data.claudeApiKey) {
      status.textContent = '✓ Settings saved';
      status.className = 'status saved';
    } else {
      status.textContent = 'Save your Claude key + dashboard URL first';
      status.className = 'status empty';
    }
  });

  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const url = dashboardInput.value.trim().replace(/\/$/, '');
    const updates = {};
    if (key) updates.claudeApiKey = key;
    if (url) updates.dashboardUrl = url;
    if (!Object.keys(updates).length) {
      status.textContent = 'Enter a key or URL first';
      status.className = 'status empty';
      return;
    }
    chrome.storage.sync.set(updates, () => {
      apiKeyInput.value = '';
      status.textContent = '✓ Saved';
      status.className = 'status saved';
    });
  });

  scoutBtn.addEventListener('click', async () => {
    scoutBtn.disabled = true;
    scoutBtn.textContent = '⟳ Scouting...';
    scoutStatus.textContent = 'Opening tabs and scraping...';
    scoutStatus.className = 'status running';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'runScout' });
      if (res?.error) {
        scoutStatus.textContent = '✗ ' + res.error;
        scoutStatus.className = 'status error';
      } else {
        scoutStatus.textContent = `✓ Found ${res.count} candidates — dashboard opening`;
        scoutStatus.className = 'status done';
      }
    } catch (err) {
      scoutStatus.textContent = '✗ ' + err.message;
      scoutStatus.className = 'status error';
    }

    scoutBtn.disabled = false;
    scoutBtn.textContent = '🔭 Run Today\'s Scout';
    refreshStatus();
  });

  async function refreshStatus() {
    const data = await chrome.runtime.sendMessage({ type: 'getScoutStatus' });
    if (data?.scoutStatus) {
      const s = data.scoutStatus;
      scoutStatus.textContent = s.message;
      scoutStatus.className = 'status ' + s.state;
    }
    if (data?.lastScoutRunISO) {
      const d = new Date(data.lastScoutRunISO);
      lastRun.textContent = 'Last run: ' + d.toLocaleString();
    } else {
      lastRun.textContent = 'No scout runs yet';
    }
  }

  refreshStatus();
});
