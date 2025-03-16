chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.sync.get(["taskShortcut", "projectShortcut", "projectEnabled"], (data) => {
	  if (!data.taskShortcut) chrome.storage.sync.set({ taskShortcut: "Alt+L" });
	  if (!data.projectShortcut) chrome.storage.sync.set({ projectShortcut: "Alt+K" });
	  if (data.projectEnabled === undefined) chrome.storage.sync.set({ projectEnabled: true });
	});
  });
  
  chrome.commands.onCommand.addListener((command) => {
	chrome.storage.sync.get("projectEnabled", (data) => {
	  if (command === "lookup_task") {
		executeScript("lookup_task.js");
	  } else if (command === "lookup_project" && data.projectEnabled) {
		executeScript("lookup_project.js");
	  }
	});
  });
  
  chrome.runtime.onMessage.addListener((message) => {
	if (message.script) {
	  executeScript(message.script);
	}
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
  