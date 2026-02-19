const DEFAULT_PLUGINS = [
    {
        id: "core-tools",
        name: "Core Audit Tools",
        enabled: true,
        config: { hideEnabled: true, selectabilityEnabled: true, delimiterTooltipsEnabled: true },
        configSchema: [
            { id: "hideEnabled", type: "toggle", label: "Hide 'External Feedback'" },
            { id: "selectabilityEnabled", type: "toggle", label: "Make all prompts selectable" },
            { id: "delimiterTooltipsEnabled", type: "toggle", label: "Show delimiter tooltips" }
        ],
        contentScripts: [
            {
                matches: ["https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/*"],
                code: `(async function() {
    function hideTargetDiv() {
        const xpath = "//p[text()='Task Feedback for Contributor (External)']/parent::*/parent::div";
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const grandparentDiv = result.singleNodeValue;
        if (grandparentDiv) grandparentDiv.style.display = 'none';
    }
    function makeAllSelectable() {
        let elements = document.querySelectorAll('.select-none');
        for (let element of elements) element.style.userSelect = 'text';
    }
    const { plugin_settings_core_tools: config } = await chrome.storage.local.get('plugin_settings_core_tools');
    if (config?.hideEnabled) hideTargetDiv();
    if (config?.selectabilityEnabled) makeAllSelectable();
    new MutationObserver(() => {
        if (config?.hideEnabled) hideTargetDiv();
        if (config?.selectabilityEnabled) makeAllSelectable();
    }).observe(document.body, { childList: true, subtree: true });
})();`
            },
            {
                matches: ["https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/*","https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/*"],
                code: `(async function() {
    const { plugin_settings_core_tools: config } = await chrome.storage.local.get('plugin_settings_core_tools');
    if (!config?.delimiterTooltipsEnabled) return;
    const cssText = \`.math-node { position: relative; display: inline-block; } .math-node::before { content: attr(open) ' ' attr(close); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background-color: #333; color: white; padding: 5px 10px; border-radius: 4px; font-size: 14px; font-family: monospace; white-space: nowrap; margin-bottom: 5px; opacity: 0; pointer-events: none; transition: opacity 0.2s ease-in-out; z-index: 10000; } .math-node:hover::before { opacity: 1; }\`;
    const mainStyle = document.createElement('style');
    mainStyle.textContent = cssText;
    document.head.appendChild(mainStyle);
    function injectIntoShadowRoots() {
        document.querySelectorAll('*').forEach(element => {
            if (element.shadowRoot && !element.shadowRoot.querySelector('.math-tooltip-styles')) {
                const shadowStyle = document.createElement('style');
                shadowStyle.className = 'math-tooltip-styles';
                shadowStyle.textContent = cssText;
                element.shadowRoot.appendChild(shadowStyle);
            }
        });
    }
    injectIntoShadowRoots();
    new MutationObserver(injectIntoShadowRoots).observe(document.body, { childList: true, subtree: true });
})();`
            }
        ]
    },
    {
        id: "lookup-tools",
        name: "Lookup Tools",
        enabled: true,
        config: { lookupMode: "highlighted", projectEnabled: true, projectDays: 2 },
        configSchema: [
            { id: "lookupMode", type: "select", label: "Lookup with", options: [{value:"clipboard", label:"from clipboard"}, {value:"highlighted", label:"from highlighted text"}] },
            { id: "projectEnabled", type: "toggle", label: "Enable project lookup (Alt+K)" },
            { id: "projectDays", type: "number", label: "Project Lookup Days", min: 1, max: 90 }
        ],
        commands: {
            "lookup_task": `(async () => {
    const { plugin_settings_lookup_tools: config } = await chrome.storage.local.get('plugin_settings_lookup_tools');
    const mode = config?.lookupMode || "clipboard";
    let text = (mode === "clipboard") ? await navigator.clipboard.readText() : window.getSelection().toString().trim();
    if (text.match(/[A-Za-z0-9]/g) && text.length === 24) {
        window.open(\`https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/\${text}#View%20Responses\`, "_blank");
    } else { alert(\`Not a valid ID: \${text}\`); }
})();`,
            "lookup_project": `(async () => {
    const { plugin_settings_lookup_tools: config } = await chrome.storage.local.get('plugin_settings_lookup_tools');
    if (!config?.projectEnabled) return;
    const days = parseInt(config.projectDays) || 2;
    const mode = config.lookupMode || "clipboard";
    let text = (mode === "clipboard") ? await navigator.clipboard.readText() : window.getSelection().toString().trim();
    if (text.match(/[A-Za-z0-9]/g) && text.length === 24) {
        const today = new Date();
        const formatDate = (d) => \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`;
        const todayStr = formatDate(today);
        today.setDate(today.getDate() - (days - 1));
        const pastStr = formatDate(today);
        window.open(\`https://app.outlier.ai/en/expert/outlieradmin/tools/qc_audit_disputes/\${text}?dateRange=\${pastStr},\${todayStr}\`, "_blank");
    } else { alert(\`Not a valid ID: \${text}\`); }
})();`,
            "lookup_attempt": `(async () => {
    const { plugin_settings_lookup_tools: config } = await chrome.storage.local.get('plugin_settings_lookup_tools');
    const { csrfToken } = await chrome.storage.local.get('csrfToken');
    const mode = config?.lookupMode || "clipboard";
    let text = (mode === "clipboard") ? (await navigator.clipboard.readText()).trim() : window.getSelection().toString().trim();
    if (text) {
        try {
            const response = await fetch(\`https://app.outlier.ai/corp-api/chatBulkAudit/attemptAudit/\${text}\`, { headers: { 'Accept': '*/*', 'X-CSRF-Token': csrfToken } });
            const data = await response.json();
            if (data?.[0]?.auditedEntityContext?.entityAttemptId) {
                window.open(\`https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/\${data[0].auditedEntityContext.entityAttemptId}#View%20Responses\`, '_blank');
            } else { alert('Could not find attempt ID.'); }
        } catch (e) { alert('Error: ' + e.message); }
    }
})();`
        }
    },
    {
        id: "create-operation",
        name: "Create Operation",
        enabled: true,
        config: { createOperationsEnabled: true },
        configSchema: [
            { id: "createOperationsEnabled", type: "toggle", label: "Create ops with <Alt+O>" }
        ],
        commands: {
            "create_operation_from_clipboard": `(async () => {
    const { plugin_settings_create_operation: config } = await chrome.storage.local.get('plugin_settings_create_operation');
    if (!config?.createOperationsEnabled) return;
    const { csrfToken } = await chrome.storage.local.get('csrfToken');
    const clipboardText = await navigator.clipboard.readText();
    const relatedIds = clipboardText.split('\\n').filter(id => id.trim() !== '');
    if (!relatedIds.every(id => id.match(/^[A-Za-z0-9]{24}$/))) { alert("Clipboard is not a clean list of IDs."); return; }
    const userID = localStorage.getItem("ajs_user_id").slice(1,25);
    const traits = JSON.parse(localStorage.getItem("ajs_user_traits"));
    const activeWorkerTeam = traits["activeWorkerTeam"];
    const name = prompt("Enter operation name:", traits["firstName"]);
    if (!name) return;
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 1);
    const body = {
        operation: {
            type: "speed_audit", name, priority: 3, maxTimeRequired: relatedIds.length * 1200,
            dueDate: dueDate.toISOString(), project: "",
            params: { auditBatchView: "chat_bulk_audit", instructions: "" },
            context: { assignmentParams: { userIds: [], workerTeamIds: [activeWorkerTeam] }, reviewAssignmentParams: { userIds: [userID], workerTeamIds: [] } }
        },
        relatedIds
    };
    const resp = await fetch('https://app.outlier.ai/corp-api/qm/operations/batch', { method: 'POST', headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (resp.ok) {
        const { operationIds } = await resp.json();
        if (confirm("Success! Claim now?")) {
            const claimResp = await fetch(\`https://app.outlier.ai/corp-api/qm/operations/\${operationIds[0]}/transition\`, { method: 'POST', headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ event: { type: "claimAttempt", userId: userID } }) });
            const claimData = await claimResp.json();
            window.open(\`https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/\${claimData.nodes[0].qaOperation.relatedObjectId}?closeOnComplete=1&qaOperationId=\${claimData.operation._id}\`, "_blank");
        }
    }
})();`
        }
    }
];

chrome.runtime.onInstalled.addListener(async () => {
    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins) {
        await chrome.storage.local.set({ plugins: DEFAULT_PLUGINS });
        for (const p of DEFAULT_PLUGINS) {
            await chrome.storage.local.set({ [`plugin_settings_${p.id.replace(/-/g,'_')}`]: p.config });
        }
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const { plugins } = await chrome.storage.local.get('plugins');
        if (!plugins) return;
        const allStored = await chrome.storage.local.get(null);
        for (const plugin of plugins) {
            if (plugin.enabled && plugin.contentScripts) {
                for (const cs of plugin.contentScripts) {
                    const isMatch = cs.matches.some(m => new RegExp('^' + m.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$').test(tab.url));
                    if (isMatch) {
                        const storageKey = `plugin_settings_${plugin.id.replace(/-/g, '_')}`;
                        chrome.scripting.executeScript({
                            target: { tabId },
                            world: 'MAIN',
                            func: (code, storageKey, allData) => {
                                const script = document.createElement('script');
                                const nonce = document.querySelector('script[nonce]')?.nonce || document.querySelector('script[nonce]')?.getAttribute('nonce');
                                if (nonce) script.setAttribute('nonce', nonce);
                                script.textContent = `(async () => {
                                    const storageKey = "${storageKey}";
                                    const allData = ${JSON.stringify(allData)};
                                    if (!window.chrome) window.chrome = {};
                                    if (!window.chrome.storage) window.chrome.storage = {};
                                    if (!window.chrome.storage.local) window.chrome.storage.local = {
                                        get: (key) => {
                                            if (!key) return Promise.resolve(allData);
                                            if (typeof key === 'string') return Promise.resolve({ [key]: allData[key] });
                                            if (Array.isArray(key)) {
                                                const res = {};
                                                key.forEach(k => res[k] = allData[k]);
                                                return Promise.resolve(res);
                                            }
                                            return Promise.resolve(allData);
                                        }
                                    };
                                    try { ${code} } catch (e) { console.error('Plugin internal error:', e); }
                                })();`;
                                (document.head || document.documentElement).appendChild(script);
                                script.remove();
                            },
                            args: [cs.code, storageKey, allStored]
                        });
                    }
                }
            }
        }
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins) return;
    const allStored = await chrome.storage.local.get(null);
    for (const plugin of plugins) {
        if (plugin.enabled && plugin.commands && plugin.commands[command]) {
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                if (!tabs[0]) return;
                const tabId = tabs[0].id;
                const storageKey = `plugin_settings_${plugin.id.replace(/-/g, '_')}`;
                chrome.scripting.executeScript({
                    target: { tabId },
                    world: 'MAIN',
                    func: (code, storageKey, allData) => {
                        const script = document.createElement('script');
                        const nonce = document.querySelector('script[nonce]')?.nonce || document.querySelector('script[nonce]')?.getAttribute('nonce');
                        if (nonce) script.setAttribute('nonce', nonce);
                        script.textContent = `(async () => {
                            const storageKey = "${storageKey}";
                            const allData = ${JSON.stringify(allData)};
                            if (!window.chrome) window.chrome = {};
                            if (!window.chrome.storage) window.chrome.storage = {};
                            if (!window.chrome.storage.local) window.chrome.storage.local = {
                                get: (key) => {
                                    if (!key) return Promise.resolve(allData);
                                    if (typeof key === 'string') return Promise.resolve({ [key]: allData[key] });
                                    if (Array.isArray(key)) {
                                        const res = {};
                                        key.forEach(k => res[k] = allData[k]);
                                        return Promise.resolve(res);
                                    }
                                    return Promise.resolve(allData);
                                }
                            };
                            try { ${code} } catch (e) { console.error('Command internal error:', e); }
                        })();`;
                        (document.head || document.documentElement).appendChild(script);
                        script.remove();
                    },
                    args: [plugin.commands[command], storageKey, allStored]
                });
            });
        }
    }
});

async function updateCsrfToken() {
  chrome.cookies.get({ url: 'https://app.outlier.ai', name: '_csrf' }, (cookie) => {
    if (cookie) chrome.storage.local.set({ csrfToken: decodeURIComponent(cookie.value) });
  });
}
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.name === '_csrf' && changeInfo.cookie.domain.includes('outlier.ai')) updateCsrfToken();
});
updateCsrfToken();
