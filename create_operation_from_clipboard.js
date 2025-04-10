(async () => {
    try {
        sendPostRequest();
    } catch (error) {
        alert("Error: " + error);
    }
})();

async function sendPostRequest() {
    try {
        // Read from clipboard
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText.match(/^[A-Za-z0-9]{24}(\n[A-Za-z0-9]{24})*$/g)) {
            throw new Error("Clipboard is not a clean list of IDs.\nClipboard content:\n"
                           +clipboardText);
        }
        const relatedIds = clipboardText.split('\n').filter(id => id.trim() !== '');
        
        // Calculate maxTimeRequired and dueDate
        const MINUTES_PER_TASK = 20;
        const maxTimeRequired = relatedIds.length * MINUTES_PER_TASK * 60;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
        const dueDateString = dueDate.toISOString();
        
        // Get CSRF token from cookies
        const csrfToken = await getCsrfToken();

        // Get user ID
        const userID = localStorage.getItem("ajs_user_id").slice(1,25);
        
        // Get activeWorkerTeam ID
        const activeWorkerTeam = JSON.parse(localStorage.getItem("ajs_user_traits"))["activeWorkerTeam"];
        
        // Get workerName for default task name
        const workerName = JSON.parse(localStorage.getItem("ajs_user_traits"))["firstName"];
        
        // Prompt for the name
        const name = prompt("Enter the name for the operation:",workerName);
        if (name === null) {
            alert("Cancelled creation of operation.")
            return;
        }
        
        // Prepare the request body
        const requestBody = {
            operation: {
                type: "speed_audit",
                name: name,
                priority: 3,
                maxTimeRequired: maxTimeRequired,
                project: "",
                dueDate: dueDateString,
                params: {
                    auditBatchView: "chat_bulk_audit",
                    instructions: ""
                },
                context: {
                    assignmentParams: {
                        userIds: [],
                        workerTeamIds: [activeWorkerTeam]
                    },
                    reviewAssignmentParams: {
                        userIds: [userID],
                        workerTeamIds: []
                    }
                }
            },
            relatedIds: relatedIds
        };
        
        // Send the POST request
        let response = await fetch('https://app.outlier.ai/corp-api/qm/operations/batch', {
            method: 'POST',
            headers: {
                "X-CSRF-Token": csrfToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        if (response.ok) {            
            const responseBody = await response.json();

            console.log(responseBody);
            console.log(responseBody.operationIds);
            console.log(responseBody.operationIds[0]);
            const operationID = responseBody.operationIds[0];
            
            confirm("Created operation successfully!\n\nClaim operation now?");
            
            const claimRequestBody = {
                "event": {
                    "type": "claimAttempt",
                    "userId": userID
                }
            };
            console.log(JSON.stringify(claimRequestBody));
            console.log(userID);
            const claimURL = "https://app.outlier.ai/corp-api/qm/operations/"+operationID+"/transition";
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
                if (claimResponseBody.operation.stateMachine.currentState == "attempt_claimed") {
                    const operationId = claimResponseBody.operation._id;
                    const relatedObjectId = claimResponseBody.nodes[0].qaOperation.relatedObjectId;
                    open("https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/"+relatedObjectId+"?closeOnComplete=1&qaOperationId="+operationId,"_blank","toolbar=0, location=0, menubar=0, addressbar=0");
                } else {
                    throw new Error('Failed to claim operation.');
                }    
            } else {
                throw new Error('Claim operation failed:\n'+response.status+'\n'+response.statusText);
            }
        } else {
            throw new Error('Create operation failed:\n'+response.status+'\n'+response.statusText);
        }
    } catch (error) {
        console.error(error);
        alert(error);
    }
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