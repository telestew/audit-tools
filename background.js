chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(["hideEnabled",
                             "selectabilityEnabled",
                             "createOperationsEnabled",
                             "lookupMode",
                             "projectEnabled"], (data) => {
        if (data.hideEnabled === undefined) chrome.storage.sync.set({ hideEnabled: true });
        if (data.selectabilityEnabled === undefined) chrome.storage.sync.set({ selectabilityEnabled: true });
        if (data.createOperationsEnabled === undefined) chrome.storage.sync.set({ createOperationsEnabled: false });
        if (!data.lookupMode) chrome.storage.sync.set({ lookupMode: "highlighted" });
        if (data.projectEnabled === undefined) chrome.storage.sync.set({ projectEnabled: true });
    });
});

chrome.commands.onCommand.addListener((command) => {
    chrome.storage.sync.get(["hideEnabled",
                             "selectabilityEnabled",
                             "createOperationsEnabled",
                             "lookupMode",
                             "projectEnabled"], (data) => {
        switch (command) {
            case "lookup_task": 
                executeScript("lookup_task.js");
                break;
            case "lookup_project":
                if (data.projectEnabled) executeScript("lookup_project.js");
                break;
            case "create_operation_from_clipboard":
                if (data.createOperationsEnabled) executeScript("create_operation_from_clipboard.js");
                break;
            case "lookup_attempt":
                executeScript("lookup_attempt.js");
                break;
        }
    });
});

function executeScript(scriptFile) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: [scriptFile]
        });
    });
}

// Function to update the CSRF token in local storage
async function updateCsrfToken() {
  chrome.cookies.get({ url: 'https://app.outlier.ai', name: '_csrf' }, (cookie) => {
    if (cookie) {
      chrome.storage.local.set({ csrfToken: decodeURIComponent(cookie.value) }, () => {
        console.log('CSRF token updated in local storage:', cookie.value);
      });
    } else {
      console.error('CSRF token not found in cookies');
    }
  });
}

// Listen for changes to the CSRF cookie
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.name === '_csrf' && changeInfo.cookie.domain.includes('outlier.ai')) {
    updateCsrfToken();
  }
});

// Initial update of the CSRF token
updateCsrfToken();