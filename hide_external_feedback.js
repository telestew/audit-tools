(function() {
    // Function to hide target div 
    function hideTargetDiv() {
        // Use XPath to find the grandparent <div> of the <p> element with the exact text
        const xpath = "//p[text()='Task Feedback for Contributor (External)']/parent::*/parent::div";
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        
        // If a matching <div> is found, hide it
        const grandparentDiv = result.singleNodeValue;
        if (grandparentDiv) {
            // Remove the grandparent <div>
            grandparentDiv.style.display = 'none'; 
        }
    }

    function makeAllSelectable() {
        let elements = document.querySelectorAll('.select-none');
    
        for (element of elements) {
            element.style.userSelect = 'text'; 
        }
    }

    // Run hide function once at load
    hideTargetDiv();
    makeAllSelectable();

    // Set up a MutationObserver to watch for changes in the DOM.
    const observer = new MutationObserver((mutations) => {
        // For every mutation, attempt to hide the target div
        mutations.forEach(() => {
            if (chrome.storage.sync.get("hideEnabled")) hideTargetDiv();
            if (chrome.storage.sync.get("selectabilityEnabled")) makeAllSelectable();
        });
    });

    // Start observing the document body for added nodes or changes.
    observer.observe(document.body, { childList: true, subtree: true });
})();

