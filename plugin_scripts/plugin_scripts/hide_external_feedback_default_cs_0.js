// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    
    if (config?.enabled !== false) {
      function hide() {
        const xpath =
          "//p[text()='Task Feedback for Contributor (External)']/parent::*/parent::div";
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        const div = result.singleNodeValue;
        if (div) div.style.display = 'none';
      }
    
      hide();
      new MutationObserver(hide).observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
    } catch (e) { console.error('Plugin error:', e); }
})();