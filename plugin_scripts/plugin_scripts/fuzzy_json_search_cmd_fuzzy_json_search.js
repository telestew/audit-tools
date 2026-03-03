// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    const { csrfToken: storedCsrf } = await chrome.storage.local.get('csrfToken');
    
    const idSource = config?.idSource || 'clipboard';
    const fuseThreshold = parseFloat(config?.fuseThreshold) || 0.4;
    const resultsLimit = parseInt(config?.resultsLimit || '50', 10);
    
    let taskId = '';
    if (idSource === 'clipboard') {
      try {
        taskId = (await navigator.clipboard.readText()).trim();
      } catch (_) {}
    } else if (idSource === 'highlighted') {
      taskId = window.getSelection().toString().trim();
    } else {
      taskId = (prompt('Enter Task ID (24-char alphanumeric):') || '').trim();
    }
    
    if (!/^[A-Za-z0-9]{24}$/.test(taskId)) {
      alert(`Invalid or missing Task ID: "${taskId}"`);
      throw new Error('Bad task ID');
    }
    
    let csrfToken = storedCsrf || '';
    if (!csrfToken) {
      const row = document.cookie.split('; ').find((r) => r.startsWith('_csrf='));
      if (row) csrfToken = decodeURIComponent(row.split('=')[1]);
    }
    if (!csrfToken) {
      alert('No CSRF token available.');
      throw new Error('No CSRF token');
    }
    
    const lookupUrl = `https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/${taskId}`;
    const res = await fetch(lookupUrl, {
      headers: { 'X-CSRF-Token': csrfToken },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Lookup fetch failed: ${res.status}`);
    
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextData = doc.querySelector('script#__NEXT_DATA__');
    if (!nextData) throw new Error('__NEXT_DATA__ not found');
    
    const pageProps = JSON.parse(nextData.textContent)?.props?.pageProps;
    if (!pageProps || typeof pageProps !== 'object') throw new Error('No pageProps');
    
    const popup = window.open('', `FJE_${taskId}`, 'width=900,height=750,scrollbars=yes,resizable=yes');
    if (!popup) throw new Error('Popup blocked');
    
    popup.document.open();
    popup.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>JSON Search: ${taskId}</title></head><body><input id="q" placeholder="Search..." style="width:100%;padding:10px;font-size:14px;box-sizing:border-box"><div id="meta" style="margin:8px 0;color:#555"></div><pre id="out" style="white-space:pre-wrap;word-break:break-word"></pre></body></html>`);
    popup.document.close();
    
    await new Promise((resolve, reject) => {
      const s = popup.document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Fuse.js'));
      popup.document.head.appendChild(s);
    });
    
    const Fuse = popup.Fuse;
    if (!Fuse) throw new Error('Fuse unavailable');
    
    function flatten(root) {
      const entries = [];
      const walk = (val, path) => {
        if (entries.length >= 100000) return;
        const type = typeof val;
        const value = type === 'string' ? val.slice(0, 1000) : val == null ? String(val) : type === 'object' ? '' : String(val);
        entries.push({ path, value, subtree: val });
        if (val && type === 'object') {
          Object.keys(val).forEach((k) => {
            const childPath = Array.isArray(val) ? `${path}[${k}]` : path ? `${path}.${k}` : k;
            walk(val[k], childPath);
          });
        }
      };
    
      Object.keys(pageProps).forEach((k) => walk(pageProps[k], k));
      return entries;
    }
    
    const entries = flatten(pageProps);
    const fuse = new Fuse(entries, {
      keys: [{ name: 'path', weight: 1.2 }, { name: 'value', weight: 1 }],
      threshold: fuseThreshold,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    
    const q = popup.document.getElementById('q');
    const meta = popup.document.getElementById('meta');
    const out = popup.document.getElementById('out');
    meta.textContent = `Indexed ${entries.length} entries`;
    
    function renderResults(term) {
      if (!term) {
        out.textContent = 'Type to search keys and values...';
        return;
      }
      const results = fuse.search(term, { limit: resultsLimit });
      meta.textContent = `${results.length} result(s) for "${term}"`;
      out.textContent = results
        .map((r) => `${r.item.path}\n${JSON.stringify(r.item.subtree, null, 2)}\n---`)
        .join('\n');
    }
    
    q.addEventListener('input', () => renderResults(q.value.trim()));
    q.focus();
    renderResults('');
    } catch (e) { console.error('Plugin error:', e); }
})();