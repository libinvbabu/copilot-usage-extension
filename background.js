chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openOptions') {
    chrome.windows.create({
      url:    chrome.runtime.getURL('popup.html'),
      type:   'popup',
      width:  320,
      height: 420
    });
  }
});
