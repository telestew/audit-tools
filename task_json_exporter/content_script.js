function getCsrfToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('csrfToken', (data) => {
      const csrfToken = data.csrfToken;
      if (csrfToken) {
        resolve(csrfToken);
      } else {
        reject('CSRF token not found. The background script may not have updated it yet. Ensure you are logged in to Outlier.');
      }
    });
  });
}

async function getTaskBody() {
    // This function is identical to the one developed previously.
    // It is included here to make the demo self-contained.
    try {
        const pathParts = window.location.pathname.split('/');
        const operationId = pathParts.pop() || pathParts.pop(); 

        if (!operationId) {
            throw new Error('Could not extract operation ID from URL.');
        }

        const csrfToken = await getCsrfToken();
        const headers = {
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken
        };

        const auditInfoUrl = `https://app.outlier.ai/corp-api/chatBulkAudit/attemptAudit/${operationId}`;
        const auditInfoResponse = await fetch(auditInfoUrl, { method: 'GET', headers });

        if (!auditInfoResponse.ok) {
            throw new Error(`Failed to fetch audit info: ${auditInfoResponse.status}`);
        }

        const auditInfoData = await auditInfoResponse.json();
        if (!Array.isArray(auditInfoData) || auditInfoData.length === 0 || !auditInfoData[0]._id) {
            throw new Error('Audit info response is malformed or empty.');
        }
        const auditId = auditInfoData[0]._id;

        const taskBodyUrl = `https://app.outlier.ai/corp-api/chatBulkAudit/attemptAudit/${auditId}/response`;
        const taskBodyResponse = await fetch(taskBodyUrl, { method: 'GET', headers });

        if (!taskBodyResponse.ok) {
            throw new Error(`Failed to fetch task body: ${taskBodyResponse.status}`);
        }
        
        const taskBodyData = await taskBodyResponse.json();
        if (!taskBodyData?.auditLookup?.id || !taskBodyData?.responses) {
            throw new Error('Task body response is malformed.');
        }

        const targetId = taskBodyData.auditLookup.id;
        const targetResponse = taskBodyData.responses.find(r => r.id === targetId);

        if (!targetResponse) {
            throw new Error('Could not find matching response in task body.');
        }

        return targetResponse;

    } catch (error) {
        console.error('Error in getTaskBody:', error);
        throw error;
    }
}

// --- Main execution ---
// This self-executing function runs when the script is injected.

(async () => {
    try {
        const taskJson = await getTaskBody();
        await navigator.clipboard.writeText(JSON.stringify(taskJson, null, 2));
        alert('Task JSON copied to clipboard!');
    } catch (error) {
        alert(`Failed to copy task JSON:\n${error.message}`);
    }
})();
