document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get(["hideEnabled",
                             "selectabilityEnabled",
                             "createOperationsEnabled",
                             "lookupMode",
                             "projectEnabled"], (data) => {
        document.getElementById("hideEnabled").checked = data.hideEnabled;
        document.getElementById("selectabilityEnabled").checked = data.selectabilityEnabled;
        document.getElementById("createOperationsEnabled").checked = data.createOperationsEnabled;
        document.getElementById("lookupMode").value = data.lookupMode || "clipboard";
        document.getElementById("projectEnabled").checked = data.projectEnabled;
    });

    document.getElementById("save").addEventListener("click", () => {
        const hideEnabled = document.getElementById("hideEnabled").checked;
        const selectabilityEnabled = document.getElementById("selectabilityEnabled").checked;
        const createOperationsEnabled = document.getElementById("createOperationsEnabled").checked;
        const lookupMode = document.getElementById("lookupMode").value;
        const projectEnabled = document.getElementById("projectEnabled").checked;

        chrome.storage.sync.set({hideEnabled,
                                 selectabilityEnabled,
                                 createOperationsEnabled,
                                 lookupMode,
                                 projectEnabled}, () => {
            alert("Settings saved!");
        });
    });
});
