chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(["hideEnabled",
                             "selectabilityEnabled",
                             "createOperationsEnabled",
                             "lookupMode",
                             "projectEnabled",
                             "delimiterTooltipsEnabled",
                             "taskNotifierEnabled",
                             "taskNotifierPeriod"], (data) => {
        if (data.hideEnabled === undefined) chrome.storage.sync.set({ hideEnabled: true });
        if (data.selectabilityEnabled === undefined) chrome.storage.sync.set({ selectabilityEnabled: true });
        if (data.createOperationsEnabled === undefined) chrome.storage.sync.set({ createOperationsEnabled: false });
        if (!data.lookupMode) chrome.storage.sync.set({ lookupMode: "highlighted" });
        if (data.projectEnabled === undefined) chrome.storage.sync.set({ projectEnabled: true });
        if (data.delimiterTooltipsEnabled === undefined) chrome.storage.sync.set({ delimiterTooltipsEnabled: true });
        if (data.taskNotifierEnabled === undefined) chrome.storage.sync.set({ taskNotifierEnabled: false });
        if (data.taskNotifierPeriod === undefined) chrome.storage.sync.set({ taskNotifierPeriod: 10 });
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

const TASK_NOTIFIER_ALARM = 'taskNotifierAlarm';

// Create alarm on startup if enabled
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.sync.get(['taskNotifierEnabled', 'taskNotifierPeriod'], (data) => {
        if (data.taskNotifierEnabled) {
            chrome.alarms.create(TASK_NOTIFIER_ALARM, { periodInMinutes: data.taskNotifierPeriod || 10 });
        }
    });
});

// Also create alarm on install if enabled
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(['taskNotifierEnabled', 'taskNotifierPeriod'], (data) => {
        if (data.taskNotifierEnabled) {
            chrome.alarms.create(TASK_NOTIFIER_ALARM, { periodInMinutes: data.taskNotifierPeriod || 10 });
        }
    });
});

// Create or clear alarm when the setting is changed
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && (changes.taskNotifierEnabled || changes.taskNotifierPeriod)) {
        chrome.storage.sync.get(['taskNotifierEnabled', 'taskNotifierPeriod'], (data) => {
            if (data.taskNotifierEnabled) {
                chrome.alarms.create(TASK_NOTIFIER_ALARM, { periodInMinutes: data.taskNotifierPeriod || 10 });
            } else {
                chrome.alarms.clear(TASK_NOTIFIER_ALARM);
            }
        });
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TASK_NOTIFIER_ALARM) {
        checkForTasks();
    }
});

async function checkForTasks() {
    await updateCsrfToken(); // Make sure token is fresh
    chrome.storage.local.get('csrfToken', (data) => {
        const csrfToken = data.csrfToken;
        if (!csrfToken) {
            console.error('Task Notifier: CSRF token not found.');
            return;
        }

        const url = 'https://app.outlier.ai/corp-api/qm/assigned-operation-nodes?fetchMetadata=true&onlyPending=true&page=1&project=&sortOrder=1';
        
        fetch(url, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'X-CSRF-Token': csrfToken,
            },
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    console.log('Task Notifier: Unauthorized. The session might have expired.');
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return null;
            }
            return response.json();
        })
        .then(data => {
	    if (data && data.nodes && data.nodes.length > 0) {
                playSound();
            }
        })
        .catch(error => {
            console.error('Task Notifier fetch error:', error);
        });
    });
}

// --- Offscreen Audio Playback ---

let creating; // A global promise to avoid concurrency issues
async function setupOffscreenDocument(path) {
    // Check if we have an existing document.
    if (await chrome.offscreen.hasDocument()) {
        return;
    }

    // create offscreen document
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'To play a notification sound for new tasks.',
        });
        await creating;
        creating = null;
    }
}

async function playSound() {
    await setupOffscreenDocument('offscreen.html');
    await chrome.runtime.sendMessage({ type: 'play-sound', target: 'offscreen' });
}
