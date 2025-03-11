const modificationCommands = {
    "number_change": numberChange
}

chrome.commands.onCommand.addListener((command) => {
    if (command === "number_change") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0 || tabs[0].url.startsWith("chrome://")) {
                console.warn("Cannot modify clipboard on this page.");
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: modificationCommands[command]
            });
        });
    }
});

function numberChange() {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    textarea.focus();
    document.execCommand("paste");

    setTimeout(() => {
        
        const text = textarea.value.replace(/\d+/g, "NUMBER");
        
        textarea.value = text;
        textarea.select();
        document.execCommand("copy");

        document.body.removeChild(textarea);
        console.log("Clipboard modified to uppercase:", text);
    }, 50);
}
