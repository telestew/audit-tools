(async () => {
    try {
        await claimOperationFromClipboard();
    } catch (error) {
        alert("Error: " + error.message);
    }
})();

async function claimOperationFromClipboard() {
    const operationID = (await navigator.clipboard.readText()).trim();
    if (!operationID.match(/^[a-zA-Z0-9]{24}$/)) {
        throw new Error("Clipboard does not contain a valid Operation ID.\nClipboard content:\n" + operationID);
    }

    const csrfToken = await getCsrfToken();
    const userID = localStorage.getItem("ajs_user_id")?.slice(1, 25);
    if (!userID) {
        throw new Error("Could not find user ID in local storage.");
    }

    const claimRequestBody = {
        "event": {
            "type": "claimAttempt",
            "userId": userID
        }
    };

    const claimURL = `https://app.outlier.ai/corp-api/qm/operations/${operationID}/transition`;
    const claimResponse = await fetch(claimURL, {
        method: 'POST',
        headers: {
            "X-CSRF-Token": csrfToken,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(claimRequestBody)
    });

    if (claimResponse.ok) {
        const claimResponseBody = await claimResponse.json();
        if (claimResponseBody.operation.stateMachine.currentState === "attempt_claimed") {
            const operationId = claimResponseBody.operation._id;
            const relatedObjectId = claimResponseBody.nodes[0].qaOperation.relatedObjectId;
            const tool = claimResponseBody.operation.params.auditBatchView;

            if (!tool) {
                 throw new Error("Could not determine tool for this operation from operation params.");
            }

            const url = `https://app.outlier.ai/en/expert/outlieradmin/tools/${tool}/${relatedObjectId}?closeOnComplete=1&qaOperationId=${operationId}`;
            open(url, "_blank", "toolbar=0, location=0, menubar=0, addressbar=0");
        } else {
            throw new Error('Failed to claim operation. Final state: ' + claimResponseBody.operation.stateMachine.currentState);
        }
    } else {
        const errorText = await claimResponse.text();
        throw new Error(`Claim operation failed: ${claimResponse.status} ${claimResponse.statusText}\n${errorText}`);
    }
}

function getCsrfToken() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('csrfToken', (data) => {
            const csrfToken = data.csrfToken;
            if (csrfToken) {
                resolve(csrfToken);
            } else {
                reject(new Error('CSRF token not found in local storage. Please visit app.outlier.ai to refresh it.'));
            }
        });
    });
}
