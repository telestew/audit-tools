function getCsrfToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('csrfToken', (data) => {
      const csrfToken = data.csrfToken;
      if (csrfToken) {
        resolve(csrfToken);
      } else {
        reject('CSRF token not found in local storage. It may not have been updated by the background script yet.');
      }
    });
  });
}

async function getTaskBody() {
    try {
        // Extract the operation ID from the URL path.
        const pathParts = window.location.pathname.split('/');
        const operationId = pathParts.pop() || pathParts.pop(); // Handles optional trailing slash

        if (!operationId) {
            throw new Error('Could not extract operation ID from URL.');
        }

        const csrfToken = await getCsrfToken();
        const headers = {
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken
        };

        // First, get the audit information to find the specific audit ID.
        const auditInfoUrl = `https://app.outlier.ai/corp-api/chatBulkAudit/attemptAudit/${operationId}`;
        const auditInfoResponse = await fetch(auditInfoUrl, { method: 'GET', headers });

        if (!auditInfoResponse.ok) {
            throw new Error(`Failed to fetch audit info: ${auditInfoResponse.status} ${auditInfoResponse.statusText}`);
        }

        const auditInfoData = await auditInfoResponse.json();
        if (!Array.isArray(auditInfoData) || auditInfoData.length === 0 || !auditInfoData[0]._id) {
            throw new Error('Audit info response is malformed or empty.');
        }
        const auditId = auditInfoData[0]._id;

        // Second, use the audit ID to get the full response body.
        const taskBodyUrl = `https://app.outlier.ai/corp-api/chatBulkAudit/attemptAudit/${auditId}/response`;
        const taskBodyResponse = await fetch(taskBodyUrl, { method: 'GET', headers });

        if (!taskBodyResponse.ok) {
            throw new Error(`Failed to fetch task body: ${taskBodyResponse.status} ${taskBodyResponse.statusText}`);
        }
        
        const taskBodyData = await taskBodyResponse.json();
        if (!taskBodyData?.auditLookup?.id || !taskBodyData?.responses) {
            throw new Error('Task body response is malformed.');
        }

        // Find the specific response within the "responses" array that matches the auditLookup ID.
        const targetId = taskBodyData.auditLookup.id;
        const targetResponse = taskBodyData.responses.find(r => r.id === targetId);

        if (!targetResponse) {
            throw new Error('Could not find matching response in task body.');
        }

        return targetResponse;

    } catch (error) {
        console.error('Error in getTaskBody:', error);
        throw error; // Re-throw to allow the caller to handle it.
    }
}
