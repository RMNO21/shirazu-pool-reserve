// background.js - Service Worker for Shiraz University Pool Auto-Reserve

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    autoReserveSettings: {
      intervalSeconds: 1,
      friendCount: 0,
      mode: 'monitor', // 'monitor' or 'sniper'
      soundEnabled: true
    }
  });
  console.log('Shiraz University Auto-Reserve extension installed.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'notify') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: message.title || 'رزرو استخر دانشگاه شیراز',
      message: message.body || 'عملیات با موفقیت انجام شد.',
      priority: 2
    });
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'getSettings') {
    (async () => {
      const data = await chrome.storage.local.get('autoReserveSettings');
      sendResponse(data.autoReserveSettings || {});
    })();
    return true; // Keep message channel open for async response
  }

  if (message.action === 'saveSettings') {
    (async () => {
      await chrome.storage.local.set({ autoReserveSettings: message.settings });
      sendResponse({ success: true });
    })();
    return true;
  }
});
