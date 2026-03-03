chrome.runtime.onInstalled.addListener(async () => {
    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins || plugins.length === 0) {
        await restoreDefaultPlugins();
    }
});

// --- Helpers for separated code storage ---
function codeKeyCS(pluginId, index) {
    return `plugin_code_${pluginId.replace(/-/g, '_')}_cs_${index}`;
}
function codeKeyCMD(pluginId, cmdName) {
    return `plugin_code_${pluginId.replace(/-/g, '_')}_cmd_${cmdName}`;
}
function settingsKey(pluginId) {
    return `plugin_settings_${pluginId.replace(/-/g, '_')}`;
}

// Resolve a plugin setting value: stored value > schema default > undefined
function resolveSettings(pluginId, configSchema, allData) {
    const sk = settingsKey(pluginId);
    const stored = allData[sk] || {};
    const resolved = {};
    if (configSchema) {
        configSchema.forEach(field => {
            resolved[field.id] = stored[field.id] !== undefined ? stored[field.id] : field.default;
        });
    }
    return resolved;
}

// Store code blobs separately and strip code from plugin JSON
async function savePluginCode(plugin) {
    const toStore = {};
    if (plugin.contentScripts) {
        for (let i = 0; i < plugin.contentScripts.length; i++) {
            const cs = plugin.contentScripts[i];
            if (cs.code !== undefined) {
                toStore[codeKeyCS(plugin.id, i)] = cs.code;
            }
        }
    }
    if (plugin.commands) {
        for (const [cmdName, code] of Object.entries(plugin.commands)) {
            if (code !== undefined) {
                toStore[codeKeyCMD(plugin.id, cmdName)] = code;
            }
        }
    }
    if (Object.keys(toStore).length > 0) {
        await chrome.storage.local.set(toStore);
    }
}

// Get code for a content script
async function getCSCode(pluginId, index) {
    const key = codeKeyCS(pluginId, index);
    const result = await chrome.storage.local.get(key);
    return result[key] || '';
}

// Get code for a command
async function getCMDCode(pluginId, cmdName) {
    const key = codeKeyCMD(pluginId, cmdName);
    const result = await chrome.storage.local.get(key);
    return result[key] || '';
}

// Remove all code keys for a plugin
async function removePluginCode(plugin) {
    const keysToRemove = [];
    if (plugin.contentScripts) {
        for (let i = 0; i < plugin.contentScripts.length; i++) {
            keysToRemove.push(codeKeyCS(plugin.id, i));
        }
    }
    const cmdNames = plugin.commandNames || [];
    for (const cmdName of cmdNames) {
        keysToRemove.push(codeKeyCMD(plugin.id, cmdName));
    }
    if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
    }
}

// Strip code from plugin metadata (for storing in plugins array)
function stripCodeFromPlugin(plugin) {
    const clean = { ...plugin };
    // Remove legacy config object — only configSchema matters
    delete clean.config;
    if (clean.contentScripts) {
        clean.contentScripts = clean.contentScripts.map(cs => {
            const { code, ...rest } = cs;
            return rest;
        });
    }
    if (clean.commands) {
        // Store command names only (as array of keys), code lives in storage
        clean.commandNames = Object.keys(clean.commands);
        delete clean.commands;
    }
    return clean;
}

// Save plugin with separated code storage — call this for new/imported plugins
async function savePluginFull(plugin) {
    await savePluginCode(plugin);
    // Set initial settings from schema defaults if not already stored
    if (plugin.configSchema) {
        const sk = settingsKey(plugin.id);
        const existing = await chrome.storage.local.get(sk);
        if (!existing[sk]) {
            const defaults = {};
            plugin.configSchema.forEach(f => {
                if (f.default !== undefined) defaults[f.id] = f.default;
            });
            await chrome.storage.local.set({ [sk]: defaults });
        }
    }
}

async function restoreDefaultPlugins() {
    const defaultFiles = [
        'hide_external_feedback.json',
        'lookup_task.json'
    ];

    const plugins = [];
    for (const file of defaultFiles) {
        try {
            const response = await fetch(chrome.runtime.getURL(`default_plugins/${file}`));
            const data = await response.json();
            // Save code blobs separately and initial settings
            await savePluginFull(data);
            // Store stripped metadata
            plugins.push(stripCodeFromPlugin(data));
        } catch (e) {
            console.error(`Failed to load default plugin: ${file}`, e);
        }
    }

    // Set default shortcut for lookup_task
    const { shortcutMappings = {} } = await chrome.storage.local.get('shortcutMappings');
    shortcutMappings['kb_command_1'] = 'lookup-task-default:lookup_task';

    await chrome.storage.local.set({ plugins, shortcutMappings });
}


// Execute plugin code by injecting the pre-built .js file from plugin_scripts/.
// Files are written by the manager page using File System Access API.
// This bypasses all CSP/Trusted Types since file-based injection is treated as static content.
async function executePluginCode(tabId, scriptFile, pluginId, allData) {
    const sk = settingsKey(pluginId);
    // First inject the storage shim with current data, then inject the plugin script
    // Pre-resolve this plugin's settings from allData
    const pluginConfig = allData[sk] || {};

    try {
        // Inject storage shim + bridge helper + resolved settings into MAIN world
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (storageKey, allData, pluginSettings) => {
                window.__pluginStorageKey = storageKey;
                window.__pluginAllData = allData;
                // Pre-resolved settings for the current plugin — plugin code uses this directly
                window.__pluginSettings = pluginSettings;
                if (!window.chrome) window.chrome = {};
                if (!window.chrome.storage) window.chrome.storage = {};
                if (!window.chrome.storage.local) window.chrome.storage.local = {
                    get: (key) => {
                        const d = window.__pluginAllData;
                        if (!key) return Promise.resolve(d);
                        if (typeof key === 'string') return Promise.resolve({ [key]: d[key] });
                        if (Array.isArray(key)) {
                            const res = {};
                            key.forEach(k => res[k] = d[k]);
                            return Promise.resolve(res);
                        }
                        return Promise.resolve(d);
                    },
                    set: (data) => {
                        // Write-back via bridge
                        return window.__pluginBridge('storage.set', { data });
                    }
                };

                // Generic bridge function: sends request to background via ISOLATED world relay
                // Usage: await __pluginBridge('fetch', { url: '...', options: { method: 'POST', body: '...' } })
                //        await __pluginBridge('cookies.get', { url: '...', name: '...' })
                //        await __pluginBridge('notifications.create', { options: { type: 'basic', title: '...', message: '...' } })
                //        await __pluginBridge('tabs.create', { url: '...' })
                //        await __pluginBridge('offscreen.create', { url: '...', reasons: ['AUDIO_PLAYBACK'] })
                window.__pluginBridge = (method, args) => {
                    return new Promise((resolve, reject) => {
                        const id = 'pb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                        function handler(evt) {
                            if (evt.data?.type === 'plugin-bridge-response' && evt.data.id === id) {
                                window.removeEventListener('message', handler);
                                const r = evt.data.response;
                                if (r?.error) reject(new Error(r.error));
                                else resolve(r);
                            }
                        }
                        window.addEventListener('message', handler);
                        window.postMessage({
                            type: 'plugin-bridge-request',
                            method: method,
                            args: args || {},
                            id: id
                        }, '*');
                        // Timeout after 30s
                        setTimeout(() => {
                            window.removeEventListener('message', handler);
                            reject(new Error('Bridge timeout: ' + method));
                        }, 30000);
                    });
                };
            },
            args: [sk, allData, pluginConfig]
        });
        // Inject the plugin script file
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: [scriptFile]
        });
    } catch (e) {
        console.error(`Plugin execution error (${scriptFile}):`, e);
    }
}

// Get the script file path for a content script
function csScriptPath(pluginId, index) {
    return `plugin_scripts/${pluginId.replace(/-/g, '_')}_cs_${index}.js`;
}

// Get the script file path for a command
function cmdScriptPath(pluginId, cmdName) {
    return `plugin_scripts/${pluginId.replace(/-/g, '_')}_cmd_${cmdName}.js`;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Inject generic ISOLATED world bridge on all http(s) pages.
        // This relays postMessage from MAIN world plugin code to chrome.runtime,
        // giving plugins access to privileged APIs (fetch, cookies, notifications, etc.)
        if (/^https?:\/\//.test(tab.url)) {
            chrome.scripting.executeScript({
                target: { tabId },
                world: 'ISOLATED',
                func: () => {
                    if (window.__pluginBridgeInstalled) return;
                    window.__pluginBridgeInstalled = true;
                    window.addEventListener('message', (evt) => {
                        if (evt.source !== window) return;
                        if (evt.data?.type === 'plugin-bridge-request') {
                            chrome.runtime.sendMessage({
                                action: 'plugin-bridge',
                                method: evt.data.method,
                                args: evt.data.args,
                                id: evt.data.id
                            }, (response) => {
                                window.postMessage({
                                    type: 'plugin-bridge-response',
                                    id: evt.data.id,
                                    response: response
                                }, '*');
                            });
                        }
                    });
                }
            });
        }

        const { plugins } = await chrome.storage.local.get('plugins');
        if (!plugins) return;
        const allStored = await chrome.storage.local.get(null);
        for (const plugin of plugins) {
            if (plugin.enabled && plugin.contentScripts) {
                for (let i = 0; i < plugin.contentScripts.length; i++) {
                    const cs = plugin.contentScripts[i];
                    const isMatch = cs.matches.some(m => new RegExp('^' + m.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$').test(tab.url));
                    if (isMatch) {
                        const scriptFile = csScriptPath(plugin.id, i);
                        executePluginCode(tabId, scriptFile, plugin.id, allStored);
                    }
                }
            }
        }
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command.startsWith('kb_command_')) {
        const { shortcutMappings = {}, plugins = [] } = await chrome.storage.local.get(['shortcutMappings', 'plugins']);
        const mapping = shortcutMappings[command];
        if (!mapping) return;

        const [pluginId, cmdKey] = mapping.split(':');
        const plugin = plugins.find(p => p.id === pluginId);

        if (plugin && plugin.enabled) {
            const scriptFile = cmdScriptPath(pluginId, cmdKey);
            const allStored = await chrome.storage.local.get(null);
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                executePluginCode(tab.id, scriptFile, plugin.id, allStored);
            }
        }
        return;
    }

    // ─── Command Palette ───
    if (command === 'open_command_palette') {
        const { plugins } = await chrome.storage.local.get('plugins');
        const allStored = await chrome.storage.local.get(null);
        const chromeCommands = await chrome.commands.getAll();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        const availableCommands = [];
        for (const plugin of (plugins || [])) {
            if (!plugin.enabled) continue;
            const cmdNames = plugin.commandNames || [];
            for (const cmdName of cmdNames) {
                availableCommands.push({
                    pluginId: plugin.id,
                    pluginName: plugin.name,
                    command: cmdName,
                    scriptFile: cmdScriptPath(plugin.id, cmdName)
                });
            }
        }

        // Command palette runs in ISOLATED world to avoid Trusted Types restrictions.
        // All DOM is built programmatically (no innerHTML) for maximum compatibility.
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'ISOLATED',
            func: (commands, allData, shortcuts) => {
                // Toggle off if already open
                const existing = document.getElementById('fje-cmd-palette-overlay');
                if (existing) {
                    existing.remove();
                    document.getElementById('fje-cmd-palette-styles')?.remove();
                    return;
                }

                // --- Styles ---
                document.getElementById('fje-cmd-palette-styles')?.remove();
                const style = document.createElement('style');
                style.id = 'fje-cmd-palette-styles';
                style.textContent = [
                    '#fje-cmd-palette-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;justify-content:center;padding-top:18vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,monospace}',
                    '#fje-cmd-palette-modal{background:#252526;border:1px solid #454545;border-radius:8px;width:520px;max-height:420px;box-shadow:0 8px 40px rgba(0,0,0,0.6);overflow:hidden;display:flex;flex-direction:column;align-self:flex-start}',
                    '#fje-cmd-palette-input{background:#3c3c3c;border:none;border-bottom:1px solid #454545;color:#e0e0e0;padding:14px 18px;font-size:15px;font-family:inherit;outline:none;width:100%;box-sizing:border-box}',
                    '#fje-cmd-palette-input::placeholder{color:#777}',
                    '#fje-cmd-palette-list{overflow-y:auto;flex:1;margin:0;padding:4px 0;list-style:none}',
                    '.fje-cmd-item{padding:10px 18px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-left:3px solid transparent;transition:background .05s}',
                    '.fje-cmd-item:hover,.fje-cmd-item.fje-active{background:#04395e;border-left-color:#4a9eff}',
                    '.fje-cmd-name{color:#e0e0e0;font-size:14px}',
                    '.fje-cmd-plugin{color:#888;font-size:12px;margin-left:12px;white-space:nowrap}',
                    '.fje-cmd-empty{color:#666;font-style:italic;padding:20px;text-align:center}',
                    '.fje-cmd-shortcut{color:#aaa;font-size:10px;margin-right:10px;border:1px solid #454545;padding:2px 4px;border-radius:3px}'
                ].join('\n');
                document.head.appendChild(style);

                // --- Build DOM ---
                const overlay = document.createElement('div');
                overlay.id = 'fje-cmd-palette-overlay';

                const modal = document.createElement('div');
                modal.id = 'fje-cmd-palette-modal';

                const input = document.createElement('input');
                input.id = 'fje-cmd-palette-input';
                input.type = 'text';
                input.placeholder = 'Type a command\u2026';
                input.autocomplete = 'off';
                input.spellcheck = false;

                const list = document.createElement('ul');
                list.id = 'fje-cmd-palette-list';

                modal.appendChild(input);
                modal.appendChild(list);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                // --- State ---
                let activeIndex = 0;
                let filtered = [...commands];

                function fmt(s) {
                    return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                }

                // Build a list item entirely with DOM APIs (no innerHTML)
                function buildItem(cmd, i) {
                    const li = document.createElement('li');
                    li.className = 'fje-cmd-item' + (i === activeIndex ? ' fje-active' : '');

                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'fje-cmd-name';
                    nameSpan.textContent = fmt(cmd.command);
                    li.appendChild(nameSpan);

                    const rightDiv = document.createElement('div');
                    rightDiv.style.cssText = 'display:flex;align-items:center;';

                    const mappingEntries = Object.entries(allData.shortcutMappings || {});
                    const slotName = mappingEntries.find(([k, v]) => v === `${cmd.pluginId}:${cmd.command}`)?.[0];
                    const actualKey = shortcuts.find(s => s.name === slotName)?.shortcut || '';

                    if (actualKey) {
                        const keySpan = document.createElement('span');
                        keySpan.className = 'fje-cmd-shortcut';
                        keySpan.textContent = actualKey;
                        rightDiv.appendChild(keySpan);
                    }

                    const pluginSpan = document.createElement('span');
                    pluginSpan.className = 'fje-cmd-plugin';
                    pluginSpan.textContent = cmd.pluginName;
                    rightDiv.appendChild(pluginSpan);

                    li.appendChild(rightDiv);

                    li.addEventListener('click', () => run(cmd));
                    li.addEventListener('mouseenter', () => {
                        activeIndex = i;
                        render();
                    });
                    return li;
                }

                function render() {
                    while (list.firstChild) list.removeChild(list.firstChild);
                    if (filtered.length === 0) {
                        const empty = document.createElement('li');
                        empty.className = 'fje-cmd-empty';
                        empty.textContent = 'No matching commands';
                        list.appendChild(empty);
                        return;
                    }
                    filtered.forEach((cmd, i) => {
                        list.appendChild(buildItem(cmd, i));
                    });
                    const active = list.querySelector('.fje-active');
                    if (active) active.scrollIntoView({ block: 'nearest' });
                }

                function cleanup() {
                    overlay.remove();
                    style.remove();
                }

                function run(cmd) {
                    cleanup();
                    // Send message back to background to execute via executePluginCode
                    chrome.runtime.sendMessage({
                        action: 'execute-palette-command',
                        pluginId: cmd.pluginId,
                        command: cmd.command,
                        scriptFile: cmd.scriptFile
                    });
                }

                // --- Events ---
                input.addEventListener('input', () => {
                    const q = input.value.toLowerCase().trim();
                    filtered = q
                        ? commands.filter(c =>
                            c.command.toLowerCase().includes(q) ||
                            c.pluginName.toLowerCase().includes(q))
                        : [...commands];
                    activeIndex = 0;
                    render();
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
                        render();
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        activeIndex = Math.max(activeIndex - 1, 0);
                        render();
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (filtered[activeIndex]) run(filtered[activeIndex]);
                    } else if (e.key === 'Escape') {
                        cleanup();
                    }
                });

                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) cleanup();
                });

                render();
                input.focus();
            },
            args: [availableCommands, allStored, chromeCommands]
        });
        return;
    }

    // ─── Direct command dispatch (for any manifest-registered plugin commands) ───
    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins) return;
    const allStored = await chrome.storage.local.get(null);
    for (const plugin of plugins) {
        if (!plugin.enabled) continue;
        const hasCommand = plugin.commandNames && plugin.commandNames.includes(command);
        if (hasCommand) {
            const scriptFile = cmdScriptPath(plugin.id, command);
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                executePluginCode(tab.id, scriptFile, plugin.id, allStored);
            }
        }
    }
});

// --- Palette command execution (from ISOLATED world back to background) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'execute-palette-command') {
        (async () => {
            const allStored = await chrome.storage.local.get(null);
            executePluginCode(sender.tab.id, message.scriptFile, message.pluginId, allStored);
        })();
        return false;
    }
});

// --- Non-bridge message handlers ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'restoreDefaults') {
        restoreDefaultPlugins().then(() => sendResponse({ success: true }));
        return true;
    }
    return false;
});

// --- Generic plugin bridge: exposes privileged Chrome APIs to plugin content scripts ---
// Plugin code (MAIN world) sends postMessage -> ISOLATED bridge -> chrome.runtime.sendMessage -> here
// Supported methods:
//   fetch: { url, options } — CORS-free fetch
//   cookies.get: { url, name } — read a cookie
//   cookies.getAll: { url, domain, name } — read multiple cookies
//   cookies.set: { url, name, value, ... } — set a cookie
//   storage.set: { data } — write to chrome.storage.local
//   storage.get: { keys } — read from chrome.storage.local
//   notifications.create: { id, options } — show a notification
//   notifications.clear: { id } — clear a notification
//   tabs.create: { url, active } — open a new tab
//   tabs.query: { queryInfo } — query tabs
//   tabs.sendMessage: { tabId, message } — send message to another tab
//   offscreen.create: { url, reasons, justification } — create offscreen document
//   offscreen.close: {} — close offscreen document
//   action.setBadgeText: { text, tabId } — set badge text
//   action.setBadgeBackgroundColor: { color, tabId } — set badge color
//   action.setIcon: { path, tabId } — set extension icon
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'plugin-bridge') return false;

    const { method, args } = message;

    (async () => {
        try {
            switch (method) {
                // --- Fetch (CORS-free) ---
                case 'fetch': {
                    const resp = await fetch(args.url, {
                        method: args.options?.method || 'GET',
                        headers: args.options?.headers || {},
                        body: args.options?.body || null
                    });
                    const text = await resp.text();
                    sendResponse({ ok: resp.ok, status: resp.status, body: text });
                    break;
                }

                // --- Cookies ---
                case 'cookies.get': {
                    const cookie = await chrome.cookies.get({ url: args.url, name: args.name });
                    sendResponse({ cookie: cookie ? { name: cookie.name, value: cookie.value, domain: cookie.domain } : null });
                    break;
                }
                case 'cookies.getAll': {
                    const cookies = await chrome.cookies.getAll(args);
                    sendResponse({ cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain })) });
                    break;
                }
                case 'cookies.set': {
                    const cookie = await chrome.cookies.set(args);
                    sendResponse({ cookie });
                    break;
                }

                // --- Storage (write-back) ---
                case 'storage.set': {
                    await chrome.storage.local.set(args.data);
                    sendResponse({ ok: true });
                    break;
                }
                case 'storage.get': {
                    const result = await chrome.storage.local.get(args.keys || null);
                    
                    break;
                }

                // --- Notifications ---
                case 'notifications.create': {
                    chrome.notifications.create(args.id || '', args.options, (id) => {
                        sendResponse({ id });
                    });
                    return; // Don't sendResponse twice — callback handles it
                }
                case 'notifications.clear': {
                    chrome.notifications.clear(args.id, (cleared) => {
                        sendResponse({ cleared });
                    });
                    return;
                }

                // --- Tabs ---
                case 'tabs.create': {
                    const tab = await chrome.tabs.create({ url: args.url, active: args.active !== false });
                    sendResponse({ tab: { id: tab.id, url: tab.url } });
                    break;
                }
                case 'tabs.query': {
                    const tabs = await chrome.tabs.query(args.queryInfo || {});
                    sendResponse({ tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active })) });
                    break;
                }
                case 'tabs.sendMessage': {
                    const resp = await chrome.tabs.sendMessage(args.tabId, args.message);
                    sendResponse({ response: resp });
                    break;
                }

                // --- Offscreen ---
                case 'offscreen.create': {
                    await chrome.offscreen.createDocument({
                        url: args.url,
                        reasons: args.reasons || ['AUDIO_PLAYBACK'],
                        justification: args.justification || 'Plugin requested offscreen document'
                    });
                    sendResponse({ ok: true });
                    break;
                }
                case 'offscreen.close': {
                    await chrome.offscreen.closeDocument();
                    sendResponse({ ok: true });
                    break;
                }

                // --- Action (badge/icon) ---
                case 'action.setBadgeText': {
                    await chrome.action.setBadgeText({ text: args.text || '', tabId: args.tabId });
                    sendResponse({ ok: true });
                    break;
                }
                case 'action.setBadgeBackgroundColor': {
                    await chrome.action.setBadgeBackgroundColor({ color: args.color, tabId: args.tabId });
                    sendResponse({ ok: true });
                    break;
                }
                case 'action.setIcon': {
                    await chrome.action.setIcon({ path: args.path, tabId: args.tabId });
                    sendResponse({ ok: true });
                    break;
                }

                default:
                    sendResponse({ error: `Unknown bridge method: ${method}` });
            }
        } catch (e) {
            sendResponse({ error: e.message });
        }
    })();

    return true; // Keep channel open for async response
});

// --- Built-in CSRF token sync (used by many plugins) ---
async function updateCsrfToken() {
    chrome.cookies.get({ url: 'https://app.outlier.ai', name: '_csrf' }, (cookie) => {
        if (cookie) chrome.storage.local.set({ csrfToken: decodeURIComponent(cookie.value) });
    });
}
chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.cookie.name === '_csrf' && changeInfo.cookie.domain.includes('outlier.ai')) updateCsrfToken();
});
updateCsrfToken();

