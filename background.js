chrome.runtime.onInstalled.addListener(async () => {
    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins || plugins.length === 0) {
        await restoreDefaultPlugins();
    }
});

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
            plugins.push(data);
            
            // Set initial settings for the plugin if config exists
            if (data.id && data.config) {
                const storageKey = `plugin_settings_${data.id.replace(/-/g, '_')}`;
                await chrome.storage.local.set({ [storageKey]: data.config });
            }
        } catch (e) {
            console.error(`Failed to load default plugin: ${file}`, e);
        }
    }

    // Set default shortcut for lookup_task
    const { shortcutMappings = {} } = await chrome.storage.local.get('shortcutMappings');
    shortcutMappings['kb_command_1'] = 'lookup-task-default:lookup_task';

    await chrome.storage.local.set({ plugins, shortcutMappings });
}

// Add message listener for the Manager page to trigger restoration
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'restoreDefaults') {
        restoreDefaultPlugins().then(() => sendResponse({ success: true }));
        return true; 
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
    if (command.startsWith('kb_command_')) {
        const { shortcutMappings = {}, plugins = [] } = await chrome.storage.local.get(['shortcutMappings', 'plugins']);
        const mapping = shortcutMappings[command];
        if (!mapping) return;

        const [pluginId, cmdKey] = mapping.split(':');
        const plugin = plugins.find(p => p.id === pluginId);

        if (plugin && plugin.enabled && plugin.commands && plugin.commands[cmdKey]) {
            const allStored = await chrome.storage.local.get(null);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return;
                const storageKey = `plugin_settings_${plugin.id.replace(/-/g, '_')}`;
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
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
                            try { ${code} } catch (e) { console.error('Command error:', e); }
                        })();`;
                        (document.head || document.documentElement).appendChild(script);
                        script.remove();
                    },
                    args: [plugin.commands[cmdKey], storageKey, allStored]
                });
            });
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
            if (plugin.enabled && plugin.commands) {
                for (const [cmdName, cmdCode] of Object.entries(plugin.commands)) {
                    availableCommands.push({
                        pluginId: plugin.id,
                        pluginName: plugin.name,
                        command: cmdName,
                        code: cmdCode
                    });
                }
            }
        }

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
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
                    '.fje-cmd-empty{color:#666;font-style:italic;padding:20px;text-align:center}'
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

                function render() {
                    list.innerHTML = '';
                    if (filtered.length === 0) {
                        list.innerHTML = '<li class="fje-cmd-empty">No matching commands</li>';
                        return;
                    }
                    filtered.forEach((cmd, i) => {
                        const li = document.createElement('li');
                        li.className = 'fje-cmd-item' + (i === activeIndex ? ' fje-active' : '');
                        
                        const mappingEntries = Object.entries(allData.shortcutMappings || {});
                        const slotName = mappingEntries.find(([k, v]) => v === `${cmd.pluginId}:${cmd.command}`)?.[0];
                        const actualKey = shortcuts.find(s => s.name === slotName)?.shortcut || '';

                        li.innerHTML = `
                            <span class="fje-cmd-name">${fmt(cmd.command)}</span>
                            <div style="display:flex; align-items:center;">
                                ${actualKey ? `<span style="color:#aaa; font-size:10px; margin-right:10px; border:1px solid #454545; padding:2px 4px; border-radius:3px;">${actualKey}</span>` : ''}
                                <span class="fje-cmd-plugin">${cmd.pluginName}</span>
                            </div>
                        `;

                        li.addEventListener('click', () => run(cmd));
                        li.addEventListener('mouseenter', () => {
                            activeIndex = i;
                            render();
                        });
                        list.appendChild(li);
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
                    const sk = 'plugin_settings_' + cmd.pluginId.replace(/-/g, '_');
                    const script = document.createElement('script');
                    const nonce = document.querySelector('script[nonce]')?.nonce || document.querySelector('script[nonce]')?.getAttribute('nonce');
                    if (nonce) script.setAttribute('nonce', nonce);
                    script.textContent = '(async()=>{'
                        + 'const storageKey="' + sk + '";'
                        + 'const allData=' + JSON.stringify(allData) + ';'
                        + 'if(!window.chrome)window.chrome={};'
                        + 'if(!window.chrome.storage)window.chrome.storage={};'
                        + 'if(!window.chrome.storage.local)window.chrome.storage.local={'
                        + 'get:(key)=>{'
                        + 'if(!key)return Promise.resolve(allData);'
                        + 'if(typeof key==="string")return Promise.resolve({[key]:allData[key]});'
                        + 'if(Array.isArray(key)){const r={};key.forEach(k=>r[k]=allData[k]);return Promise.resolve(r);}'
                        + 'return Promise.resolve(allData);'
                        + '}'
                        + '};'
                        + 'try{' + cmd.code + '}catch(e){console.error("Palette command error:",e);}'
                        + '})();';
                    (document.head || document.documentElement).appendChild(script);
                    script.remove();
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

