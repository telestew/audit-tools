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
    const maxEntries = 100000;
    const maxRenderDepth = 20;
    const maxArrayRender = 200;
    const maxObjKeys = 200;
    const maxStringIndex = 1000;
    const debounceMs = 180;

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

    if (!taskId || !/^[A-Za-z0-9]{24}$/.test(taskId)) {
      alert('Invalid or missing Task ID: "' + taskId + '"\nExpected 24 alphanumeric characters.');
      throw new Error('Bad task ID');
    }

    let csrfToken = storedCsrf || '';
    if (!csrfToken) {
      try {
        const row = document.cookie.split('; ').find((r) => r.startsWith('_csrf='));
        if (row) csrfToken = decodeURIComponent(row.split('=')[1]);
      } catch (_) {}
    }
    if (!csrfToken) {
      alert('No CSRF token available. Make sure you are logged in to app.outlier.ai.');
      throw new Error('No CSRF token');
    }

    const lookupUrl = 'https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/' + taskId;
    let pageProps = null;
    try {
      const res = await fetch(lookupUrl, {
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextDataScript = doc.querySelector('script#__NEXT_DATA__');
      if (!nextDataScript) throw new Error('__NEXT_DATA__ not found in response');
      const data = JSON.parse(nextDataScript.textContent);
      pageProps = data?.props?.pageProps;
    } catch (err) {
      alert('Failed to fetch task data:\n' + err.message);
      throw err;
    }

    if (!pageProps || typeof pageProps !== 'object') {
      alert('No pageProps found in response.');
      throw new Error('Empty pageProps');
    }

    const popup = window.open('', 'FJE_' + taskId, 'width=900,height=750,scrollbars=yes,resizable=yes');
    if (!popup) {
      alert('Popup blocked! Please allow popups for this site.');
      throw new Error('Popup blocked');
    }

    const popDoc = popup.document;
    popDoc.open();
    popDoc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>JSON Search: ' + taskId + '</title></head><body><div id="fuzzy-json-explorer"><input type="text" id="fje-search" placeholder="Search keys and values..." autocomplete="off" spellcheck="false" /><div id="fje-status"></div><div id="fje-results"></div></div></body></html>');
    popDoc.close();

    const styleEl = popDoc.createElement('style');
    styleEl.textContent = [
      'html,body{margin:0;padding:0;background:#1a1a1a;color:#d4d4d4}',
      '*{box-sizing:border-box}',
      '#fuzzy-json-explorer{font-family:"Cascadia Code","Fira Code",Consolas,monospace;max-width:100%;padding:16px}',
      '#fje-search{width:100%;padding:12px 16px;font-size:16px;border:2px solid #444;border-radius:8px;box-sizing:border-box;font-family:inherit;outline:none;transition:border-color .2s;background:#2d2d2d;color:#e0e0e0}',
      '#fje-search:focus{border-color:#4a9eff}',
      '#fje-search::placeholder{color:#777}',
      '#fje-status{margin-top:8px;font-size:13px;color:#888}',
      '#fje-results{margin-top:12px}',
      '.fje-hint{color:#666;font-style:italic;padding:20px;text-align:center}',
      '.fje-result-card{border:1px solid #333;border-radius:8px;margin-bottom:10px;overflow:hidden;background:#252525}',
      '.fje-path{padding:8px 12px;background:#2d2d2d;color:#e0e0e0;font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;border-bottom:1px solid #333}',
      '.fje-score{color:#666;font-weight:400;font-size:11px}',
      '.fje-tree{padding:10px 14px;overflow-x:auto;background:#1e1e1e;color:#d4d4d4;font-size:13px;line-height:1.5;max-height:600px;overflow-y:auto}',
      '.fje-tree pre{margin:0;white-space:pre-wrap;word-break:break-word}',
      '.fje-key{color:#9cdcfe}',
      '.fje-string{color:#ce9178}',
      '.fje-number{color:#b5cea8}',
      '.fje-boolean{color:#569cd6}',
      '.fje-null{color:#808080;font-style:italic}',
      '.fje-bracket{color:#d4d4d4}',
      '.fje-ellipsis{color:#808080;font-style:italic}'
    ].join('\n');
    popDoc.head.appendChild(styleEl);

    await new Promise((resolve, reject) => {
      const s = popDoc.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Fuse.js'));
      popDoc.head.appendChild(s);
    });

    const Fuse = popup.Fuse;
    if (!Fuse) {
      popDoc.body.innerHTML = '<h2 style="color:red;padding:20px">Failed to load Fuse.js</h2>';
      throw new Error('Fuse not available');
    }

    function esc(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function flattenJSON(root) {
      const entries = [];
      function walk(val, path, key) {
        if (entries.length >= maxEntries) return;
        let value = '';
        if (typeof val === 'string') value = val.substring(0, maxStringIndex);
        else if (val === null) value = 'null';
        else if (typeof val !== 'object') value = String(val);
        entries.push({ path, key, value, subtree: val });

        if (val && typeof val === 'object') {
          const keys = Object.keys(val);
          const isArr = Array.isArray(val);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const nextPath = isArr ? path + '[' + k + ']' : (path ? path + '.' + k : k);
            walk(val[k], nextPath, k);
          }
        }
      }

      if (root && typeof root === 'object') {
        const keys = Object.keys(root);
        const isArr = Array.isArray(root);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const path = isArr ? '[' + k + ']' : k;
          walk(root[k], path, k);
        }
      }
      return entries;
    }

    function rpt(s, n) {
      let out = '';
      for (let i = 0; i < n; i++) out += s;
      return out;
    }

    function renderTree(val, depth) {
      if (depth > maxRenderDepth) return '<span class="fje-ellipsis">... (max depth)</span>';
      const pad = rpt('  ', depth);
      const pad1 = rpt('  ', depth + 1);

      if (val === null) return '<span class="fje-null">null</span>';
      if (val === undefined) return '<span class="fje-null">undefined</span>';

      const type = typeof val;
      if (type === 'string') return '<span class="fje-string">"' + esc(val) + '"</span>';
      if (type === 'number') return '<span class="fje-number">' + val + '</span>';
      if (type === 'boolean') return '<span class="fje-boolean">' + val + '</span>';

      if (Array.isArray(val)) {
        if (val.length === 0) return '<span class="fje-bracket">[]</span>';
        const lim = Math.min(val.length, maxArrayRender);
        let html = '<span class="fje-bracket">[</span>\n';
        for (let i = 0; i < lim; i++) {
          html += pad1 + renderTree(val[i], depth + 1);
          if (i < val.length - 1) html += ',';
          html += '\n';
        }
        if (val.length > maxArrayRender) {
          html += pad1 + '<span class="fje-ellipsis">... ' + (val.length - maxArrayRender) + ' more items</span>\n';
        }
        html += pad + '<span class="fje-bracket">]</span>';
        return html;
      }

      if (type === 'object') {
        const keys = Object.keys(val);
        if (keys.length === 0) return '<span class="fje-bracket">{}</span>';
        const lim = Math.min(keys.length, maxObjKeys);
        let html = '<span class="fje-bracket">{</span>\n';
        for (let i = 0; i < lim; i++) {
          const k = keys[i];
          html += pad1 + '<span class="fje-key">"' + esc(k) + '"</span>: ' + renderTree(val[k], depth + 1);
          if (i < keys.length - 1) html += ',';
          html += '\n';
        }
        if (keys.length > maxObjKeys) {
          html += pad1 + '<span class="fje-ellipsis">... ' + (keys.length - maxObjKeys) + ' more keys</span>\n';
        }
        html += pad + '<span class="fje-bracket">}</span>';
        return html;
      }

      return esc(String(val));
    }

    const statusEl = popDoc.getElementById('fje-status');
    const resultsDiv = popDoc.getElementById('fje-results');
    const searchInput = popDoc.getElementById('fje-search');

    statusEl.textContent = 'Indexing ' + taskId + '...';
    await new Promise((r) => setTimeout(r, 50));

    const entries = flattenJSON(pageProps);
    const fuse = new Fuse(entries, {
      keys: [
        { name: 'key', weight: 2 },
        { name: 'value', weight: 1 },
        { name: 'path', weight: 0.5 },
      ],
      threshold: fuseThreshold,
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });

    statusEl.textContent = 'Indexed ' + entries.length + ' entries from task ' + taskId + '. Ready.';
    resultsDiv.innerHTML = '<div class="fje-hint">Type to search keys and values...</div>';

    function doSearch(query) {
      if (!query || query.trim().length < 1) {
        resultsDiv.innerHTML = '<div class="fje-hint">Type to search keys and values...</div>';
        statusEl.textContent = 'Indexed ' + entries.length + ' entries. Ready.';
        return;
      }

      const t0 = performance.now();
      const results = fuse.search(query.trim(), { limit: resultsLimit });
      const ms = (performance.now() - t0).toFixed(1);
      statusEl.textContent =
        results.length + ' result' + (results.length !== 1 ? 's' : '') + ' in ' + ms + ' ms (from ' + entries.length + ' entries)';

      if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="fje-hint">No matches found.</div>';
        return;
      }

      const frag = popDoc.createDocumentFragment();
      for (let i = 0; i < results.length; i++) {
        const r = results[i];

        const card = popDoc.createElement('div');
        card.className = 'fje-result-card';

        const pathEl = popDoc.createElement('div');
        pathEl.className = 'fje-path';
        pathEl.innerHTML =
          '<span>' + esc(r.item.path) + '</span>' +
          '<span class="fje-score">score: ' + (r.score || 0).toFixed(4) + '</span>';

        const treeEl = popDoc.createElement('div');
        treeEl.className = 'fje-tree';
        const pre = popDoc.createElement('pre');
        pre.innerHTML = renderTree(r.item.subtree, 0);
        treeEl.appendChild(pre);

        card.appendChild(pathEl);
        card.appendChild(treeEl);
        frag.appendChild(card);
      }

      resultsDiv.innerHTML = '';
      resultsDiv.appendChild(frag);
    }

    let timer;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => doSearch(searchInput.value), debounceMs);
    });

    searchInput.focus();
    } catch (e) { console.error('Plugin error:', e); }
})();
