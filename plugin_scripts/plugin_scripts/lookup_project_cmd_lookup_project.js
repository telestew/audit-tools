// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    
    const days = parseInt(config?.projectDays, 10) || 2;
    const mode = config?.lookupMode || 'highlighted';
    let text = mode === 'clipboard'
      ? await navigator.clipboard.readText()
      : window.getSelection().toString().trim();
    
    if (text.match(/[A-Za-z0-9]/g) && text.length === 24) {
      const today = new Date();
      const formatDate = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const todayStr = formatDate(today);
      today.setDate(today.getDate() - (days - 1));
      const pastStr = formatDate(today);
      window.open(
        `https://app.outlier.ai/en/expert/outlieradmin/tools/qc_audit_disputes/${text}?dateRange=${pastStr},${todayStr}`,
        '_blank',
      );
    } else {
      alert('Not a valid ID: ' + text);
    }
    } catch (e) { console.error('Plugin error:', e); }
})();