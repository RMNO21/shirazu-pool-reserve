// popup.js - Extension popup logic for sups shirazu

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const openFoodBtn = document.getElementById('openFoodBtn');
  const openPoolBtn = document.getElementById('openPoolBtn');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url && tab.url.includes('sups.shirazu.ac.ir')) {
      statusDot.className = 'status-indicator active';
      if (tab.url.includes('SfeReserve')) {
        statusText.textContent = 'فعال در صفحه رزرو استخر';
      } else if (tab.url.includes('SfxChipWeek')) {
        statusText.textContent = 'فعال در صفحه رزرو تغذیه';
      } else {
        statusText.textContent = 'متصل به سامانه SUPS';
      }
    } else {
      statusDot.className = 'status-indicator inactive';
      statusText.textContent = 'سامانه SUPS باز نیست';
    }
  } catch (err) {
    statusText.textContent = 'خطا در بررسی تب';
  }

  if (openFoodBtn) {
    openFoodBtn.addEventListener('click', async () => {
      await chrome.tabs.create({ url: 'https://sups.shirazu.ac.ir/SfxWeb/SFX/SfxChipWeek.aspx' });
    });
  }

  if (openPoolBtn) {
    openPoolBtn.addEventListener('click', async () => {
      await chrome.tabs.create({ url: 'https://sups.shirazu.ac.ir/SfxWeb/Emp/SfeReserve.aspx' });
    });
  }
});
