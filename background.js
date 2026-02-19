chrome.runtime.onInstalled.addListener(async () => {
    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins) {
        // Initialize with an empty array of plugins.
        // Users will add plugins manually via the manager.
        await chrome.storage.local.set({ plugins: [] });
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
