// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings || {};
    const updated = { ...(config || {}), enabled: !config?.enabled };
    await chrome.storage.local.set({ pluginSettings: updated });
    const state = window.__auditToolsTaskNotifierState;
    if (state && !updated.enabled) {
      state.running = false;
      state.inFlight = false;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    }
    alert('Notifications ' + (updated.enabled ? 'ON' : 'OFF'));
    } catch (e) { console.error('Plugin error:', e); }
})();
