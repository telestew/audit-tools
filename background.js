chrome.commands.onCommand.addListener((command) => {
    if (command === "lookup_task") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) return;
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ["lookup_task.js"]
            });
        });
    } else if (command === "lookup_project") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) return;
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ["lookup_project.js"]
            });
        });
    }
});
  