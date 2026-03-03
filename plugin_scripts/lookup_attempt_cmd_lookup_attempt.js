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
      alert('Invalid or missing Task ID: ' + taskId);
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
    
    const response = await fetch(
      `https://app.outlier.ai/corp-api/chatBulkAudit/attemptAudit/${taskId}`,
      { headers: { Accept: '*/*', 'X-CSRF-Token': csrfToken } },
    );
    const data = await response.json();
    if (data?.[0]?.auditedEntityContext?.entityAttemptId) {
      window.open(
        `https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/${data[0].auditedEntityContext.entityAttemptId}#View%20Responses`,
        '_blank',
      );
    } else {
      alert('Could not find attempt ID.');
    }
    } catch (e) { console.error('Plugin error:', e); }
})();
