document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get("projectEnabled", (data) => {
    document.getElementById("projectEnabled").checked = data.projectEnabled !== false;
  });

  document.getElementById("save").addEventListener("click", () => {
    const projectEnabled = document.getElementById("projectEnabled").checked;

    chrome.storage.sync.set({ projectEnabled }, () => {
      alert("Settings saved!");
    });
  });
});
