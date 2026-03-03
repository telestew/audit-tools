// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    
    if (config?.enabled !== false) {
      function makeSelectable() {
        document.querySelectorAll('.select-none').forEach((el) => {
          el.style.userSelect = 'text';
        });
      }
    
      makeSelectable();
      new MutationObserver(makeSelectable).observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
    } catch (e) { console.error('Plugin error:', e); }
})();
