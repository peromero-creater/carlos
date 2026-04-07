document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('apiKey');
  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load existing key
  chrome.storage.sync.get(['claudeApiKey'], (data) => {
    if (data.claudeApiKey) {
      status.textContent = '✓ Key saved';
      status.className = 'status saved';
    } else {
      status.textContent = 'No key saved yet';
      status.className = 'status empty';
    }
  });

  btn.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) {
      status.textContent = 'Enter a key first';
      status.className = 'status empty';
      return;
    }
    chrome.storage.sync.set({ claudeApiKey: key }, () => {
      input.value = '';
      status.textContent = '✓ Key saved';
      status.className = 'status saved';
    });
  });
});
