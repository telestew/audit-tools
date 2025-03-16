document.addEventListener("DOMContentLoaded", () => {
	chrome.storage.sync.get(["projectEnabled", "lookupMode"], (data) => {
		document.getElementById("projectEnabled").checked = data.projectEnabled !== false;
		document.getElementById("lookupMode").value = data.lookupMode || "clipboard";
	});

	document.getElementById("save").addEventListener("click", () => {
		const projectEnabled = document.getElementById("projectEnabled").checked;
		const lookupMode = document.getElementById("lookupMode").value;

		chrome.storage.sync.set({ projectEnabled, lookupMode }, () => {
			alert("Settings saved!");
		});
	});
});
