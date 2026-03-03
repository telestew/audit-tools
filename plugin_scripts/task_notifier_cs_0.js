// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    const { csrfToken } = await chrome.storage.local.get('csrfToken');
    
    if (config?.enabled) {
      const periodMs = Math.max(10000, (Number(config.period) || 10) * 60000);
      const audioUrl = config.audioUrl || 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';
    
      setInterval(async () => {
        try {
          const res = await fetch(
            'https://app.outlier.ai/corp-api/qm/assigned-operation-nodes?fetchMetadata=true&onlyPending=true&page=1&project=&sortOrder=1',
            { headers: { 'X-CSRF-Token': csrfToken || '' } },
          );
          if (!res.ok) return;
          const data = await res.json();
          if (data?.nodes?.length > 0) {
            new Audio(audioUrl).play().catch(() => {
              if (window.Notification && Notification.permission === 'granted') {
                new Notification('New Tasks Available!');
              }
            });
          }
        } catch (_) {}
      }, periodMs);
    }
    } catch (e) { console.error('Plugin error:', e); }
})();
