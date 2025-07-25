document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get(["hideEnabled", "lookupMode", "projectEnabled"], (data) => {
        document.getElementById("hideEnabled").checked = data.hideEnabled;
        document.getElementById("lookupMode").value = data.lookupMode || "clipboard";
        document.getElementById("projectEnabled").checked = data.projectEnabled;
    });

    document.getElementById("save").addEventListener("click", () => {
        const hideEnabled = document.getElementById("hideEnabled").checked;
        const lookupMode = document.getElementById("lookupMode").value;
        const projectEnabled = document.getElementById("projectEnabled").checked;

        chrome.storage.sync.set({ hideEnabled, lookupMode, projectEnabled }, () => {
            alert("Settings saved!");
        });
    });
});
