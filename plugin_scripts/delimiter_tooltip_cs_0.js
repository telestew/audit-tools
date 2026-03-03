// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    
    if (config?.enabled !== false) {
      const css =
        ".math-node { position: relative; display: inline-block; } .math-node::before { content: attr(open) ' ' attr(close); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background-color: #333; color: white; padding: 5px 10px; border-radius: 4px; font-size: 14px; font-family: monospace; white-space: nowrap; margin-bottom: 5px; opacity: 0; pointer-events: none; transition: opacity 0.2s ease-in-out; z-index: 10000; } .math-node:hover::before { opacity: 1; }";
    
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    
      function inject() {
        document.querySelectorAll('*').forEach((el) => {
          if (el.shadowRoot && !el.shadowRoot.querySelector('.math-tooltip-styles')) {
            const s = document.createElement('style');
            s.className = 'math-tooltip-styles';
            s.textContent = css;
            el.shadowRoot.appendChild(s);
          }
        });
      }
    
      inject();
      new MutationObserver(inject).observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
    } catch (e) { console.error('Plugin error:', e); }
})();
