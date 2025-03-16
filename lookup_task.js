(async () => {
    try {
        const data = await chrome.storage.sync.get("lookupMode");
        const lookupMode = data.lookupMode || "clipboard";
        let text = "";

        if (lookupMode === "clipboard") {
            text = await navigator.clipboard.readText();
        } else {
            text = getSelectedText();
        }

        if (text.match(/[A-Za-z0-9]/g) && text.length === 20) {
            window.open(`https://youtube.com/watch?v=${text}`, "_blank");
        } else {
            alert(`Not a valid ID: ${text}`);
        }

    } catch (err) {
        console.error("Failed to read clipboard:", err);
        alert("Error fetching text. Make sure you have something copied or highlighted.");
    }
})();

function getSelectedText() {
    return window.getSelection().toString().trim();
}
