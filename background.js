chrome.storage.sync.get(["projectEnabled", "taskShortcut", "projectShortcut"], (data) => {
	if (data.projectEnabled === undefined) {
	  chrome.storage.sync.set({ projectEnabled: true });
	}
	if (!data.taskShortcut) {
	  chrome.storage.sync.set({ taskShortcut: "Alt+L" });
	}
	if (!data.projectShortcut) {
	  chrome.storage.sync.set({ projectShortcut: "Alt+K" });
	}
  });
  
  chrome.commands.onCommand.addListener(async (command) => {
	chrome.storage.sync.get("projectEnabled", (data) => {
	  if (command === "lookup_task") {
		executeScript("lookup_task.js");
	  } else if (command === "lookup_project" && data.projectEnabled) {
		executeScript("lookup_project.js");
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
  