document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get(["projectEnabled", "taskShortcut", "projectShortcut"], (data) => {
      document.getElementById("taskShortcut").value = data.taskShortcut || "Alt+L";
      document.getElementById("projectShortcut").value = data.projectShortcut || "Alt+K";
      document.getElementById("projectEnabled").checked = data.projectEnabled !== false;
    });
  
    document.getElementById("save").addEventListener("click", () => {
      const taskShortcut = document.getElementById("taskShortcut").value.trim();
      const projectShortcut = document.getElementById("projectShortcut").value.trim();
      const projectEnabled = document.getElementById("projectEnabled").checked;
  
      chrome.storage.sync.set({ taskShortcut, projectShortcut, projectEnabled }, () => {
        alert("Settings saved!");
      });
    });
  });
  