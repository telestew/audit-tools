// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    
    const mode = config?.lookupMode || 'highlighted';
    let text = mode === 'clipboard'
      ? await navigator.clipboard.readText()
      : window.getSelection().toString().trim();
    
    if (text.match(/[A-Za-z0-9]/g) && text.length === 24) {
      window.open(`https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/${text}#View%20Responses`, '_blank');
    } else {
      alert('Not a valid ID: ' + text);
    }
    } catch (e) { console.error('Plugin error:', e); }
})();
