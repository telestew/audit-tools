chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target === 'offscreen' && msg.type === 'play-sound') {
    const audio = document.querySelector('#notification-sound');
    audio.src = 'notification.mp3';
    audio.play();
  }
});
