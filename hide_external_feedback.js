// Use XPath to find the grandparent <div> of the <p> element with the exact text
const xpath = "//p[text()='Task Feedback for Contributor (External)']/parent::*/parent::div";
const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);

// If a matching <div> is found, remove it
const grandparentDiv = result.singleNodeValue;
if (grandparentDiv) {
    // Remove the grandparent <div>
    grandparentDiv.style.display = chrome.storage.sync.get("hideEnabled") ? 'none' : ''; 
}

