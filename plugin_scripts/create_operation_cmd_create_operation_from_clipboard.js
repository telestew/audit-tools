// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const config = pluginSettings;
    if (config?.enabled === false) return;
    
    const { csrfToken } = await chrome.storage.local.get('csrfToken');
    const clipboardText = await navigator.clipboard.readText();
    const relatedIds = clipboardText.split('\n').filter((id) => id.trim() !== '');
    
    if (!relatedIds.every((id) => id.match(/^[A-Za-z0-9]{24}$/))) {
      alert('Clipboard is not a clean list of IDs.');
      return;
    }
    
    const userID = localStorage.getItem('ajs_user_id').slice(1, 25);
    const traits = JSON.parse(localStorage.getItem('ajs_user_traits'));
    const activeWorkerTeam = traits.activeWorkerTeam;
    const name = prompt('Enter operation name:', traits.firstName);
    if (!name) return;
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    
    const body = {
      operation: {
        type: 'speed_audit',
        name,
        priority: 3,
        maxTimeRequired: relatedIds.length * 1200,
        dueDate: dueDate.toISOString(),
        project: '',
        params: { auditBatchView: 'chat_bulk_audit', instructions: '' },
        context: {
          assignmentParams: { userIds: [], workerTeamIds: [activeWorkerTeam] },
          reviewAssignmentParams: { userIds: [userID], workerTeamIds: [] },
        },
      },
      relatedIds,
    };
    
    const resp = await fetch('https://app.outlier.ai/corp-api/qm/operations/batch', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (resp.ok) {
      const { operationIds } = await resp.json();
      if (confirm('Success! Claim now?')) {
        const claimResp = await fetch(
          `https://app.outlier.ai/corp-api/qm/operations/${operationIds[0]}/transition`,
          {
            method: 'POST',
            headers: {
              'X-CSRF-Token': csrfToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ event: { type: 'claimAttempt', userId: userID } }),
          },
        );
        const claimData = await claimResp.json();
        window.open(
          `https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/${claimData.nodes[0].qaOperation.relatedObjectId}?closeOnComplete=1&qaOperationId=${claimData.operation._id}`,
          '_blank',
        );
      }
    }
    } catch (e) { console.error('Plugin error:', e); }
})();
