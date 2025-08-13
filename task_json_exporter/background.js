// --- CSRF Token Management ---

// Function to update the CSRF token in local storage.
async function updateCsrfToken() {
  chrome.cookies.get({ url: 'https://app.outlier.ai', name: '_csrf' }, (cookie) => {
    if (cookie) {
      chrome.storage.local.set({ csrfToken: decodeURIComponent(cookie.value) });
    } else {
      console.error('CSRF token not found. Please log in to app.outlier.ai.');
    }
  });
}

// Listen for changes to the CSRF cookie to keep it fresh.
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.name === '_csrf' && changeInfo.cookie.domain.includes('outlier.ai')) {
    updateCsrfToken();
  }
});

// Get the token when the extension is installed or the browser starts.
chrome.runtime.onInstalled.addListener(updateCsrfToken);
chrome.runtime.onStartup.addListener(updateCsrfToken);


// --- Command Listener ---

const VALID_PAGE_URL = "https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/*";

chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "copy-task-json") {
        // Check if the current tab is the correct page
        if (tab.url.match(VALID_PAGE_URL)) {
            // If it is, inject and execute the content script.
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content_script.js"]
            });
        } else {
            // If not, show an alert to the user.
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    alert('This shortcut only works on a "chat_bulk_audit" task page.');
                }
            });
        }
    }
});
