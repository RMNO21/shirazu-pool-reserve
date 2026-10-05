// popup.js - Extension popup logic

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const openPortalBtn = document.getElementById('openPortalBtn');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url && tab.url.includes('sups.shirazu.ac.ir')) {
      statusDot.className = 'status-indicator active';
      statusText.textContent = 'Active on portal';
    } else {
      statusDot.className = 'status-indicator inactive';
      statusText.textContent = 'Portal tab not active';
    }
  } catch (err) {
    statusText.textContent = 'Error checking tab';
  }

  openPortalBtn.addEventListener('click', async () => {
    await chrome.tabs.create({ url: 'https://sups.shirazu.ac.ir/SfxWeb/Emp/SfeReserve.aspx' });
  });
});
