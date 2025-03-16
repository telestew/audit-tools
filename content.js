chrome.storage.sync.get(["taskShortcut", "projectShortcut", "projectEnabled"], (data) => {
    const taskShortcut = data.taskShortcut || "Alt+L";
    const projectShortcut = data.projectShortcut || "Alt+K";
    const projectEnabled = data.projectEnabled !== false;
  
    document.addEventListener("keydown", (event) => {
      const pressedKey = getKeyCombination(event);
      console.log(pressedKey)
      if (pressedKey === taskShortcut) {
        console.log("HAZZA! LOOKUP TASK")
        //executeScript("lookup_task")
        chrome.runtime.sendMessage({ action: "lookup_task" });
      } else if (pressedKey === projectShortcut && projectEnabled) {
        chrome.runtime.sendMessage({ action: "lookup_project" });
       // executeScript("lookup_project")
    }
    });
  });
  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "lookup_task") {
        console.log("hello test lookup task")
        executeScript("lookup_task.js");
    } else if (message.action === "lookup_project") {
      executeScript("lookup_project.js");
    }
  });
  
  function getKeyCombination(event) {
    let keys = [];
    if (event.altKey) keys.push("Alt");
    if (event.ctrlKey) keys.push("Ctrl");
    if (event.shiftKey) keys.push("Shift");
    if (event.metaKey) keys.push("Command"); // For Mac users
    if (event.key.length === 1) keys.push(event.key.toUpperCase());
    return keys.join("+");
  }
  
  //function executeScript(scriptFile) {
  //  chrome.runtime.sendMessage({ script: scriptFile });
  //}

  function executeScript(scriptFile) {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
	  if (tabs.length === 0) return;
	  chrome.scripting.executeScript({
		target: { tabId: tabs[0].id },
		files: [scriptFile]
	  });
	});
  }
  