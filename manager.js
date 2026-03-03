// --- File System Access API for writing plugin script files ---
let extDirHandle = null;
let scriptsDirHandle = null;

async function getExtensionDir() {
    if (extDirHandle) {
        // Verify we still have permission
        const perm = await extDirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') return extDirHandle;
    }
    // Try to restore from IndexedDB
    const restored = await restoreDirHandle();
    if (restored) {
        const perm = await restored.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
            extDirHandle = restored;
            return extDirHandle;
        }
        // Try to re-request permission
        const req = await restored.requestPermission({ mode: 'readwrite' });
        if (req === 'granted') {
            extDirHandle = restored;
            return extDirHandle;
        }
    }
    return null;
}

async function pickExtensionDir() {
    try {
        extDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveDirHandle(extDirHandle);
        scriptsDirHandle = null; // Reset so it's re-fetched
        return extDirHandle;
    } catch (e) {
        console.error('Directory picker cancelled or failed:', e);
        return null;
    }
}

async function getScriptsDir() {
    if (scriptsDirHandle) return scriptsDirHandle;
    const dir = await getExtensionDir();
    if (!dir) return null;
    scriptsDirHandle = await dir.getDirectoryHandle('plugin_scripts', { create: true });
    return scriptsDirHandle;
}

// Persist directory handle in IndexedDB
function saveDirHandle(handle) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('AuditToolsFS', 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('handles');
        };
        req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'extDir');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
    });
}

function restoreDirHandle() {
    return new Promise((resolve) => {
        const req = indexedDB.open('AuditToolsFS', 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('handles');
        };
        req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('handles', 'readonly');
            const getReq = tx.objectStore('handles').get('extDir');
            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
    });
}

// Write a plugin script file to plugin_scripts/
async function writePluginScript(filename, code) {
    const dir = await getScriptsDir();
    if (!dir) throw new Error('Extension directory not set. Please select it in the manager.');
    const wrapper = `// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
${code}
    } catch (e) { console.error('Plugin error:', e); }
})();`;
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(wrapper);
    await writable.close();
}

// Write all script files for a plugin
async function syncPluginScripts(plugin) {
    const pluginIdSafe = plugin.id.replace(/-/g, '_');
    // Content scripts
    if (plugin.contentScripts) {
        for (let i = 0; i < plugin.contentScripts.length; i++) {
            const codeKey = `plugin_code_${pluginIdSafe}_cs_${i}`;
            const result = await chrome.storage.local.get(codeKey);
            const code = result[codeKey] || '';
            if (code) {
                await writePluginScript(`${pluginIdSafe}_cs_${i}.js`, code);
            }
        }
    }
    // Commands
    const cmdNames = plugin.commandNames || [];
    for (const cmd of cmdNames) {
        const codeKey = `plugin_code_${pluginIdSafe}_cmd_${cmd}`;
        const result = await chrome.storage.local.get(codeKey);
        const code = result[codeKey] || '';
        if (code) {
            await writePluginScript(`${pluginIdSafe}_cmd_${cmd}.js`, code);
        }
    }
}

// Sync all plugins' script files
async function syncAllPluginScripts() {
    const { plugins = [] } = await chrome.storage.local.get('plugins');
    for (const p of plugins) {
        if (p.type === 'plugin') {
            await syncPluginScripts(p);
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const list = document.getElementById('plugin-list');

    let draggedItem = null;

    async function applyTheme(theme) {
        let finalTheme = theme;
        if (theme === 'auto') {
            finalTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.className = finalTheme;
        
        // Update all existing CodeMirror instances to match the new theme
        const cmTheme = finalTheme === 'dark' ? 'monokai' : 'juejin';
        document.querySelectorAll('.CodeMirror').forEach(cmDiv => {
            const cmInstance = cmDiv.CodeMirror;
            if (cmInstance) {
                cmInstance.setOption('theme', cmTheme);
                // Force a full refresh to fix layout/highlighting issues
                cmInstance.refresh();
            }
        });
    }

    async function render() {
        const { plugins = [], theme = 'auto', shortcutMappings = {} } = await chrome.storage.local.get(['plugins', 'theme', 'shortcutMappings']);

        const chromeCommands = await new Promise(resolve => chrome.commands.getAll(resolve));
        const getShortcut = (name) => chromeCommands.find(c => c.name === name)?.shortcut || 'Not set';
        
        applyTheme(theme);
        const themeRadio = document.querySelector(`input[name="theme"][value="${theme}"]`);
        if (themeRadio) themeRadio.checked = true;

        const availableCommands = [];
        plugins.forEach(p => {
            if (p.enabled) {
                const cmdNames = p.commandNames || [];
                cmdNames.forEach(cmd => {
                    availableCommands.push({ id: `${p.id}:${cmd}`, label: `${p.name}: ${cmd}` });
                });
            }
        });

        ['kb_command_1', 'kb_command_2', 'kb_command_3'].forEach(slotId => {
            const select = document.getElementById(`slot-${slotId}`);
            if (!select) return;

            const slotKey = getShortcut(slotId);
            let labelSpan = document.getElementById(`label-${slotId}`);
            if (!labelSpan) {
                labelSpan = document.createElement('span');
                labelSpan.id = `label-${slotId}`;
                labelSpan.style.fontSize = '0.8em';
                labelSpan.style.color = 'var(--secondary-text-color)';
                select.after(labelSpan);
            }
            labelSpan.textContent = ` (${slotKey})`;

            select.innerHTML = `<option value="">Unassigned</option>`;
            availableCommands.forEach(cmd => {
                const opt = document.createElement('option');
                opt.value = cmd.id;
                opt.textContent = cmd.label;
                if (shortcutMappings[slotId] === cmd.id) opt.selected = true;
                select.appendChild(opt);
            });
            select.onchange = async () => {
                const current = await chrome.storage.local.get('shortcutMappings');
                const updated = { ...current.shortcutMappings, [slotId]: select.value };
                await chrome.storage.local.set({ shortcutMappings: updated });
            };
        });

        list.innerHTML = '';
        plugins.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = item.type === 'group' ? 'plugin-card group-card' : 'plugin-card';
            if (item.type === 'plugin' && !item.enabled) card.classList.add('disabled');
            card.draggable = true;
            card.dataset.index = index;

            if (item.type === 'group') {
                card.innerHTML = `
                    <div class="plugin-header">
                        <span class="drag-handle">☰</span>
                        <div class="plugin-info">
                            <input type="text" class="group-name-input" value="${item.name}" data-id="${item.id}" placeholder="Group Name">
                        </div>
                        <div class="actions">
                            <button class="delete-btn danger">Delete</button>
                        </div>
                    </div>
                `;
                card.querySelector('.group-name-input').onchange = async (e) => {
                    item.name = e.target.value;
                    await savePlugins(plugins);
                };
            } else { // type: 'plugin'
                card.innerHTML = `
                    <div class="plugin-header">
                        <span class="drag-handle">☰</span>
                        <div class="plugin-info">
                            <span class="plugin-name">${item.name}</span>
                            <span class="plugin-id">ID: ${item.id}</span>
                        </div>
                        <div class="actions">
                            <label class="switch-container" style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size: 12px; font-weight: bold;">Plugin Active</span>
                                <label class="switch">
                                    <input type="checkbox" class="toggle-plugin" ${item.enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </label>
                            <button class="edit-btn secondary">Edit</button>
                            <button class="delete-btn danger">Delete</button>
                        </div>
                    </div>
                    <div class="editor-container hidden">
                        <div class="editor-tabs">
                            <div class="tab-btn active" data-tab="json">JSON Config</div>
                            <div class="tab-btn" data-tab="scripts">Content Scripts</div>
                            <div class="tab-btn" data-tab="commands">Commands</div>
                        </div>
                        <div class="tab-content json-tab">
                            <textarea class="editor" spellcheck="false">${JSON.stringify(item, null, 2)}</textarea>
                        </div>
                        <div class="tab-content scripts-tab hidden">
                            <div class="scripts-editors"></div>
                        </div>
                        <div class="tab-content commands-tab hidden">
                            <div class="command-editors"></div>
                        </div>
                        <div class="actions">
                            <button class="save-plugin">Save Changes</button>
                            <button class="close-editor secondary">Close</button>
                        </div>
                    </div>
                `;

                card.querySelector('.toggle-plugin').onchange = async (e) => {
                    item.enabled = e.target.checked;
                    await savePlugins(plugins);
                };
                
                const editorContainer = card.querySelector('.editor-container');
                const scriptsEditorsList = card.querySelector('.scripts-editors');
                const commandEditorsList = card.querySelector('.command-editors');

                const pluginActions = card.querySelector('.actions');

                card.querySelector('.edit-btn').onclick = async () => {
                    if (!editorContainer.classList.contains('hidden')) return;
                    editorContainer.classList.remove('hidden');
                    pluginActions.classList.add('hidden');
                    
                    const currentTheme = document.documentElement.className;
                    const jsonTab = card.querySelector('.json-tab');
                    const jsonTextArea = jsonTab.querySelector('.editor');
                    jsonTab.querySelectorAll('.CodeMirror').forEach(el => el.remove());
                    const cmOptions = {
                        lineNumbers: true,
                        lineWrapping: true,
                        theme: currentTheme.includes('dark') ? 'monokai' : 'juejin'
                    };

                    const cmJson = CodeMirror.fromTextArea(jsonTextArea, {
                        ...cmOptions,
                        mode: "application/json"
                    });

                    // Content Scripts Tab — load code from separated storage
                    scriptsEditorsList.innerHTML = '';
                    if (item.contentScripts && item.contentScripts.length > 0) {
                        for (let i = 0; i < item.contentScripts.length; i++) {
                            const cs = item.contentScripts[i];
                            const codeKey = `plugin_code_${item.id.replace(/-/g, '_')}_cs_${i}`;
                            const codeResult = await chrome.storage.local.get(codeKey);
                            const code = codeResult[codeKey] || '';
                            const div = document.createElement('div');
                            div.style.marginBottom = '15px';
                            div.innerHTML = `
                                <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">Script #${i+1} (${cs.matches.join(', ')})</div>
                                <textarea class="cs-editor" data-index="${i}" spellcheck="false">${code}</textarea>
                            `;
                            scriptsEditorsList.appendChild(div);
                            CodeMirror.fromTextArea(div.querySelector('textarea'), {
                                ...cmOptions,
                                mode: "javascript"
                            });
                        }
                    } else {
                        scriptsEditorsList.innerHTML = '<div style="font-size: 12px; color: #666;">No content scripts defined.</div>';
                    }

                    // Commands Tab — load code from separated storage
                    commandEditorsList.innerHTML = '';
                    const cmdNames = item.commandNames || [];
                    if (cmdNames.length > 0) {
                        for (const cmd of cmdNames) {
                            const codeKey = `plugin_code_${item.id.replace(/-/g, '_')}_cmd_${cmd}`;
                            const codeResult = await chrome.storage.local.get(codeKey);
                            const code = codeResult[codeKey] || '';
                            const div = document.createElement('div');
                            div.style.marginBottom = '15px';
                            div.innerHTML = `
                                <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">${cmd}</div>
                                <textarea class="cmd-editor" data-cmd="${cmd}" spellcheck="false">${code}</textarea>
                            `;
                            commandEditorsList.appendChild(div);
                            CodeMirror.fromTextArea(div.querySelector('textarea'), {
                                ...cmOptions,
                                mode: "javascript"
                            });
                        }
                    } else {
                        commandEditorsList.innerHTML = '<div style="font-size: 12px; color: #666;">No commands defined for this plugin.</div>';
                    }
                };

                card.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.onclick = () => {
                        card.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const tab = btn.dataset.tab;
                        card.querySelector('.json-tab').classList.toggle('hidden', tab !== 'json');
                        card.querySelector('.scripts-tab').classList.toggle('hidden', tab !== 'scripts');
                        card.querySelector('.commands-tab').classList.toggle('hidden', tab !== 'commands');

                        // Refresh CodeMirror instances in the newly visible tab
                        card.querySelectorAll(`.tab-content:not(.hidden) .CodeMirror`).forEach(cmDiv => {
                            cmDiv.CodeMirror.refresh();
                        });
                    };
                });

                card.querySelector('.close-editor').onclick = () => {
                    editorContainer.classList.add('hidden');
                    pluginActions.classList.remove('hidden');
                };
                
                card.querySelector('.save-plugin').onclick = async () => {
                    try {
                        // Sync CodeMirror instances back to textareas before reading
                        card.querySelectorAll('.CodeMirror').forEach(cmDiv => {
                            cmDiv.CodeMirror.save();
                        });

                        const updated = JSON.parse(card.querySelector('.json-tab .editor').value);
                        
                        // Save content script code to separated storage
                        const codeToStore = {};
                        card.querySelectorAll('.cs-editor').forEach(textarea => {
                            const i = textarea.dataset.index;
                            const codeKey = `plugin_code_${updated.id.replace(/-/g, '_')}_cs_${i}`;
                            codeToStore[codeKey] = textarea.value;
                            // Remove inline code from metadata if present
                            if (updated.contentScripts && updated.contentScripts[i]) {
                                delete updated.contentScripts[i].code;
                            }
                        });

                        // Save command code to separated storage
                        card.querySelectorAll('.cmd-editor').forEach(textarea => {
                            const cmd = textarea.dataset.cmd;
                            const codeKey = `plugin_code_${updated.id.replace(/-/g, '_')}_cmd_${cmd}`;
                            codeToStore[codeKey] = textarea.value;
                        });
                        
                        // Store code blobs
                        if (Object.keys(codeToStore).length > 0) {
                            await chrome.storage.local.set(codeToStore);
                        }

                        // Normalize: strip inline code/commands, use commandNames
                        if (updated.commands) {
                            updated.commandNames = Object.keys(updated.commands);
                            delete updated.commands;
                        }
                        // Remove legacy config object
                        delete updated.config;

                        plugins[index] = updated;
                        await savePlugins(plugins);
                        // Sync script files to disk
                        try {
                            await syncPluginScripts(updated);
                        } catch (e) {
                            console.warn('Script file sync failed (select extension directory in manager):', e);
                        }
                        alert('Plugin updated!');
                    } catch (e) { alert('Invalid JSON: ' + e.message); }
                };
            }
            
            card.querySelector('.delete-btn').onclick = async () => {
                if (confirm(`Delete "${item.name}"?`)) {
                    // Clean up separated code storage and settings
                    if (item.type === 'plugin') {
                        const keysToRemove = [];
                        keysToRemove.push(`plugin_settings_${item.id.replace(/-/g, '_')}`);
                        if (item.contentScripts) {
                            for (let i = 0; i < item.contentScripts.length; i++) {
                                keysToRemove.push(`plugin_code_${item.id.replace(/-/g, '_')}_cs_${i}`);
                            }
                        }
                        const cmdNames = item.commandNames || [];
                        for (const cmd of cmdNames) {
                            keysToRemove.push(`plugin_code_${item.id.replace(/-/g, '_')}_cmd_${cmd}`);
                        }
                        await chrome.storage.local.remove(keysToRemove);
                    }
                    plugins.splice(index, 1);
                    await savePlugins(plugins);
                }
            };

            card.addEventListener('dragstart', (e) => {
                draggedItem = card;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', card.innerHTML);
                card.classList.add('dragging');
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const bounding = card.getBoundingClientRect();
                const offset = bounding.y + (bounding.height / 2);
                if (e.clientY - offset > 0) {
                    card.style.borderBottom = '2px solid blue';
                    card.style.borderTop = '';
                } else {
                    card.style.borderTop = '2px solid blue';
                    card.style.borderBottom = '';
                }
            });

            card.addEventListener('dragleave', () => {
                card.style.borderBottom = '';
                card.style.borderTop = '';
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.style.borderBottom = '';
                card.style.borderTop = '';
                if (draggedItem === card) return;

                const draggedIndex = parseInt(draggedItem.dataset.index);
                const targetIndex = parseInt(card.dataset.index);

                const [removed] = plugins.splice(draggedIndex, 1);
                plugins.splice(targetIndex, 0, removed);
                
                savePlugins(plugins);
            });

            card.addEventListener('dragend', () => {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
                list.querySelectorAll('.plugin-card').forEach(c => {
                    c.style.borderBottom = '';
                    c.style.borderTop = '';
                });
            });
            
            list.appendChild(card);
        });
    }

    async function savePlugins(plugins) {
        await chrome.storage.local.set({ plugins });
        render(); // Re-render to update order and indices
    }

    document.getElementById('add-plugin').onclick = async () => {
        const name = prompt('Plugin Name:');
        if (!name) return;
        const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { plugins = [] } = await chrome.storage.local.get('plugins');
        plugins.push({ 
            id, name, enabled: false, type: 'plugin',
            configSchema: [], 
            contentScripts: [], commandNames: [] 
        });
        await savePlugins(plugins);
    };

    document.getElementById('add-group').onclick = async () => {
        const name = prompt('Group Name:');
        if (!name) return;
        const id = `group-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;
        const { plugins = [] } = await chrome.storage.local.get('plugins');
        plugins.push({ 
            id, name, type: 'group'
        });
        await savePlugins(plugins);
    };

    document.getElementById('export-all').onclick = async () => {
        const { plugins } = await chrome.storage.local.get('plugins');
        // Reassemble code into plugin objects for portable export
        const assembled = [];
        for (const p of (plugins || [])) {
            const out = { ...p };
            if (out.type === 'plugin') {
                // Reassemble content script code
                if (out.contentScripts) {
                    out.contentScripts = [];
                    for (let i = 0; i < p.contentScripts.length; i++) {
                        const codeKey = `plugin_code_${p.id.replace(/-/g, '_')}_cs_${i}`;
                        const result = await chrome.storage.local.get(codeKey);
                        out.contentScripts.push({ ...p.contentScripts[i], code: result[codeKey] || '' });
                    }
                }
                // Reassemble command code
                const cmdNames = out.commandNames || [];
                if (cmdNames.length > 0) {
                    out.commands = {};
                    for (const cmd of cmdNames) {
                        const codeKey = `plugin_code_${p.id.replace(/-/g, '_')}_cmd_${cmd}`;
                        const result = await chrome.storage.local.get(codeKey);
                        out.commands[cmd] = result[codeKey] || '';
                    }
                    delete out.commandNames;
                }
            }
            assembled.push(out);
        }
        const blob = new Blob([JSON.stringify(assembled, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audit_tools_plugins.json';
        a.click();
    };

    document.getElementById('import-file').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                let imported = JSON.parse(ev.target.result);
                if (!Array.isArray(imported)) imported = [imported];
                
                const { plugins = [] } = await chrome.storage.local.get('plugins');
                const action = confirm('Merge with existing items? (OK to Merge, Cancel to Replace)');
                
                // Save code blobs separately for each imported plugin
                const strippedImported = [];
                for (const p of imported) {
                    if (p.type === 'plugin') {
                        // Save code to separated storage
                        const codeToStore = {};
                        if (p.contentScripts) {
                            for (let i = 0; i < p.contentScripts.length; i++) {
                                if (p.contentScripts[i].code) {
                                    codeToStore[`plugin_code_${p.id.replace(/-/g, '_')}_cs_${i}`] = p.contentScripts[i].code;
                                }
                            }
                        }
                        if (p.commands) {
                            for (const [cmd, code] of Object.entries(p.commands)) {
                                codeToStore[`plugin_code_${p.id.replace(/-/g, '_')}_cmd_${cmd}`] = code;
                            }
                        }
                        if (Object.keys(codeToStore).length > 0) {
                            await chrome.storage.local.set(codeToStore);
                        }
                        // Save initial settings from config/configSchema defaults
                        if (p.configSchema) {
                            const sk = `plugin_settings_${p.id.replace(/-/g, '_')}`;
                            const defaults = {};
                            p.configSchema.forEach(f => {
                                // Use config value if present (legacy), else schema default
                                defaults[f.id] = (p.config && p.config[f.id] !== undefined) ? p.config[f.id] : f.default;
                            });
                            await chrome.storage.local.set({ [sk]: defaults });
                        }
                        // Strip code and config from metadata
                        const stripped = { ...p };
                        delete stripped.config;
                        if (stripped.contentScripts) {
                            stripped.contentScripts = stripped.contentScripts.map(cs => {
                                const { code, ...rest } = cs;
                                return rest;
                            });
                        }
                        if (stripped.commands) {
                            stripped.commandNames = Object.keys(stripped.commands);
                            delete stripped.commands;
                        }
                        strippedImported.push(stripped);
                    } else {
                        strippedImported.push(p);
                    }
                }

                let newPlugins;
                if (action) {
                    newPlugins = [...plugins];
                    strippedImported.forEach(p => {
                        const idx = newPlugins.findIndex(existing => existing.id === p.id);
                        if (idx > -1) newPlugins[idx] = p;
                        else newPlugins.push(p);
                    });
                } else {
                    newPlugins = strippedImported;
                }
                await savePlugins(newPlugins);
                // Sync all scripts to disk after import
                try {
                    await syncAllPluginScripts();
                } catch (e) {
                    console.warn('Script file sync failed after import:', e);
                }
                alert('Import successful!');
            } catch (e) { alert('Import failed: ' + e.message); }
        };
        reader.readAsText(file);
    };

    document.getElementById('clear-all-data').onclick = async () => {
        if (confirm('Are you sure you want to clear all extension data? This will remove all plugins and settings.')) {
            await chrome.storage.local.clear();
            alert('All data cleared. Please reload the extension for changes to take full effect.');
            render();
        }
    };

    document.getElementById('restore-defaults').onclick = async () => {
        if (confirm('Are you sure you want to restore default plugins? This will overwrite your current plugin list.')) {
            chrome.runtime.sendMessage({ action: 'restoreDefaults' }, async (response) => {
                if (response?.success) {
                    try {
                        await syncAllPluginScripts();
                    } catch (e) {
                        console.warn('Script file sync failed after restore:', e);
                    }
                    alert('Default plugins restored!');
                    render();
                }
            });
        }
    };

    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.onchange = async (e) => {
            const theme = e.target.value;
            await chrome.storage.local.set({ theme });
            applyTheme(theme);
        };
    });

    // --- Extension directory setup (one-time) ---
    const setupBanner = document.getElementById('setup-banner');
    const dirBtn = document.getElementById('select-ext-dir');

    async function checkDirSetup() {
        const dir = await getExtensionDir();
        if (dir) {
            if (setupBanner) setupBanner.classList.add('hidden');
            return true;
        } else {
            if (setupBanner) setupBanner.classList.remove('hidden');
            return false;
        }
    }

    if (dirBtn) {
        dirBtn.onclick = async () => {
            const dir = await pickExtensionDir();
            if (dir) {
                if (setupBanner) setupBanner.classList.add('hidden');
                try {
                    await syncAllPluginScripts();
                } catch (e) {
                    console.warn('Initial sync failed:', e);
                }
            }
        };
    }

    await checkDirSetup();
    render();
});
