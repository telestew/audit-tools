function getSelectedText() {
    return window.getSelection().toString().trim();
}

function getCsrfToken() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('csrfToken', (data) => {
            const csrfToken = data.csrfToken;
            if (csrfToken) {
                resolve(csrfToken);
            } else {
                reject('CSRF token not found in local storage');
            }
        });
    });
}

async function lookupAttempt() {
    chrome.storage.sync.get('lookupMode', async (data) => {
        const mode = data.lookupMode || 'clipboard';
        let relatedObjectId;

        if (mode === 'clipboard') {
            relatedObjectId = await navigator.clipboard.readText();
        } else {
            relatedObjectId = getSelectedText();
        }
        relatedObjectId = relatedObjectId.trim();

        if (relatedObjectId) {
            try {
                const csrfToken = await getCsrfToken();
                const url = `https://app.outlier.ai/corp-api/chatBulkAudit/attemptAudit/${relatedObjectId}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': '*/*',
                        'X-CSRF-Token': csrfToken,
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const responseData = await response.json();
                if (responseData && responseData.length > 0 && responseData[0].auditedEntityContext && responseData[0].auditedEntityContext.entityAttemptId) {
                    const attemptId = responseData[0].auditedEntityContext.entityAttemptId;
                    window.open(`https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/${attemptId}#View%20Responses`, '_blank');
                } else {
                    alert('Could not find attempt ID for the given related object ID.');
                }
            } catch (error) {
                console.error('Error looking up attempt:', error);
                alert('Error looking up attempt: ' + error.message);
            }
        }
    });
}

lookupAttempt();
