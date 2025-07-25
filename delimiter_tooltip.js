(function() {
    if (!chrome.storage.sync.get("delimiterTooltipsEnabled")) return;
    const cssText = `
        math-inline.math-node {
            position: relative;
            display: inline-block;
        }

        math-inline.math-node::before {
            content: attr(open) ' ' attr(close);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background-color: #333;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 14px;
            font-family: monospace;
            white-space: nowrap;
            margin-bottom: 5px;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease-in-out;
            z-index: 10000;
        }

        math-inline.math-node:hover::before {
            opacity: 1;
        }
    `;
    
    // Inject into main document
    const mainStyle = document.createElement('style');
    mainStyle.textContent = cssText;
    document.head.appendChild(mainStyle);
    
    // Function to inject styles into shadow roots
    function injectIntoShadowRoots() {
        // Find all elements that might have shadow roots
        document.querySelectorAll('*').forEach(element => {
	    if (element.shadowRoot) {
                // Check if we already injected styles
                if (!element.shadowRoot.querySelector('.math-inline-tooltip-styles')) {
		    const shadowStyle = document.createElement('style');
		    shadowStyle.className = 'math-inline-tooltip-styles';
		    shadowStyle.textContent = cssText;
		    element.shadowRoot.appendChild(shadowStyle);
                }
	    }
        });
    }
    
    // Initial injection
    injectIntoShadowRoots();
    
    // Watch for new shadow roots
    const observer = new MutationObserver((mutations) => {
        injectIntoShadowRoots();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Also catch shadow roots that might be created after our observer starts
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(...args) {
        const shadowRoot = originalAttachShadow.apply(this, args);
        
        // Inject our styles into the new shadow root
        setTimeout(() => {
	    const shadowStyle = document.createElement('style');
	    shadowStyle.className = 'math-inline-tooltip-styles';
	    shadowStyle.textContent = cssText;
	    shadowRoot.appendChild(shadowStyle);
        }, 0);
        
        return shadowRoot;
    };
})();
