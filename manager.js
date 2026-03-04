// Script files always resolve from the bundled extension directory: plugin_scripts/

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function unwrapGeneratedPluginScript(code) {
    const prefix = `// Auto-generated plugin script`;
    if (!code.startsWith(prefix)) return code;
    const startMarker = '\n    try {\n';
    const endMarker = "\n    } catch (e) { console.error('Plugin error:', e); }\n})();";
    const start = code.indexOf(startMarker);
    const end = code.lastIndexOf(endMarker);
    if (start === -1 || end === -1 || end < start) return code;
    return code.slice(start + startMarker.length, end).replace(/\s+$/, '');
}

async function loadPackagedScript(path) {
    try {
        const response = await fetch(chrome.runtime.getURL(path));
        if (!response.ok) return null;
        const text = await response.text();
        return unwrapGeneratedPluginScript(text);
    } catch (_) {
        return null;
    }
}

function utf8Encode(text) {
    return new TextEncoder().encode(text);
}

function utf8Decode(bytes) {
    return new TextDecoder().decode(bytes);
}

const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function crc32(data) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        c = CRC32_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function concatUint8(chunks, totalLength) {
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

function createZip(entries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    let localSize = 0;
    let centralSize = 0;

    entries.forEach((entry) => {
        const nameBytes = utf8Encode(entry.name);
        const dataBytes = entry.data;
        const crc = crc32(dataBytes);

        const localHeader = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true); // STORE
        localView.setUint16(10, 0, true);
        localView.setUint16(12, 0, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, dataBytes.length, true);
        localView.setUint32(22, dataBytes.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);

        localParts.push(localHeader, dataBytes);
        localSize += localHeader.length + dataBytes.length;

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, 0, true);
        centralView.setUint16(14, 0, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, dataBytes.length, true);
        centralView.setUint32(24, dataBytes.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, localOffset, true);
        centralHeader.set(nameBytes, 46);

        centralParts.push(centralHeader);
        centralSize += centralHeader.length;
        localOffset += localHeader.length + dataBytes.length;
    });

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, centralSize, true);
    eocdView.setUint32(16, localSize, true);
    eocdView.setUint16(20, 0, true);

    return concatUint8([...localParts, ...centralParts, eocd], localSize + centralSize + eocd.length);
}

async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser does not support ZIP deflate decompression');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
}

async function parseZip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const minEocd = 22;
    const maxComment = 65535;
    const start = Math.max(0, bytes.length - minEocd - maxComment);
    let eocdOffset = -1;
    for (let i = bytes.length - minEocd; i >= start; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) throw new Error('Invalid ZIP: EOCD not found');

    const centralDirSize = view.getUint32(eocdOffset + 12, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);
    const centralEnd = centralDirOffset + centralDirSize;
    const out = new Map();
    let ptr = centralDirOffset;

    while (ptr < centralEnd) {
        if (view.getUint32(ptr, true) !== 0x02014b50) {
            throw new Error('Invalid ZIP: bad central directory record');
        }
        const compression = view.getUint16(ptr + 10, true);
        const compressedSize = view.getUint32(ptr + 20, true);
        const fileNameLength = view.getUint16(ptr + 28, true);
        const extraLength = view.getUint16(ptr + 30, true);
        const commentLength = view.getUint16(ptr + 32, true);
        const localHeaderOffset = view.getUint32(ptr + 42, true);
        const nameBytes = bytes.slice(ptr + 46, ptr + 46 + fileNameLength);
        const name = utf8Decode(nameBytes);

        if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
            throw new Error(`Invalid ZIP local header: ${name}`);
        }
        const localNameLen = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const compressed = bytes.slice(dataStart, dataStart + compressedSize);

        let data;
        if (compression === 0) {
            data = compressed;
        } else if (compression === 8) {
            data = await inflateRaw(compressed);
        } else {
            throw new Error(`Unsupported ZIP compression method ${compression} for ${name}`);
        }
        out.set(name, data);

        ptr += 46 + fileNameLength + extraLength + commentLength;
    }
    return out;
}

document.addEventListener("DOMContentLoaded", async () => {
    const list = document.getElementById('plugin-list');

    let draggedItem = null;
    let enabledStates = {};

    const isPluginEnabled = (item) => {
        return enabledStates[item.id] !== false;
    };

    const sanitizePluginsForStorage = (plugins) => {
        return plugins.map((item) => {
            if (item.type !== 'plugin') return item;
            return { ...item };
        });
    };

    async function setPluginEnabled(pluginId, value) {
        enabledStates = { ...enabledStates, [pluginId]: !!value };
        await chrome.storage.local.set({ pluginEnabledStates: enabledStates });
    }

    async function selectPluginsForExport(allPlugins) {
        const exportableItems = allPlugins.filter(p => p.type === 'plugin' || p.type === 'group');
        if (exportableItems.length === 0) return [];

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
            const panel = document.createElement('div');
            const isDark = document.documentElement.classList.contains('dark');
            const panelBg = isDark ? '#232326' : '#ffffff';
            const panelText = isDark ? '#f1f1f1' : '#1a1a1a';
            const panelBorder = isDark ? '#47474c' : '#d8d8de';
            panel.style.cssText = `width:min(560px,95vw);max-height:80vh;overflow:auto;background:${panelBg};color:${panelText};border:1px solid ${panelBorder};border-radius:8px;padding:16px;box-shadow:0 18px 50px rgba(0,0,0,.4);`;
            panel.innerHTML = '<h3 style=\"margin:0 0 10px 0;\">Select Plugins to Export</h3><div id=\"export-checklist\" style=\"display:flex;flex-direction:column;gap:8px;margin-bottom:12px;\"></div><div style=\"display:flex;gap:8px;justify-content:flex-end;\"><button id=\"exp-cancel\" class=\"secondary\">Cancel</button><button id=\"exp-all\" class=\"secondary\">Select All</button><button id=\"exp-none\" class=\"secondary\">Select None</button><button id=\"exp-ok\">Export</button></div>';
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            const listEl = panel.querySelector('#export-checklist');
            exportableItems.forEach((p) => {
                const row = document.createElement('label');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                const typeLabel = p.type === 'group' ? 'group' : 'plugin';
                row.innerHTML = `<input type=\"checkbox\" data-id=\"${escapeHtml(p.id)}\" checked><span>${escapeHtml(p.name)} <span style=\"opacity:.7;font-size:12px;\">(${typeLabel}: ${escapeHtml(p.id)})</span></span>`;
                listEl.appendChild(row);
            });

            const done = (result) => {
                overlay.remove();
                resolve(result);
            };

            panel.querySelector('#exp-cancel').onclick = () => done(null);
            panel.querySelector('#exp-all').onclick = () => listEl.querySelectorAll('input[type=\"checkbox\"]').forEach(cb => cb.checked = true);
            panel.querySelector('#exp-none').onclick = () => listEl.querySelectorAll('input[type=\"checkbox\"]').forEach(cb => cb.checked = false);
            panel.querySelector('#exp-ok').onclick = () => {
                const selected = Array.from(listEl.querySelectorAll('input[type=\"checkbox\"]'))
                    .filter(cb => cb.checked)
                    .map(cb => cb.dataset.id);
                done(selected);
            };
        });
    }

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
        const data = await chrome.storage.local.get(['plugins', 'theme', 'shortcutMappings', 'pluginEnabledStates']);
        const plugins = data.plugins || [];
        const theme = data.theme || 'auto';
        const shortcutMappings = data.shortcutMappings || {};
        enabledStates = data.pluginEnabledStates || {};

        const chromeCommands = await new Promise(resolve => chrome.commands.getAll(resolve));
        const getShortcut = (name) => chromeCommands.find(c => c.name === name)?.shortcut || 'Not set';
        
        applyTheme(theme);
        const themeRadio = document.querySelector(`input[name="theme"][value="${theme}"]`);
        if (themeRadio) themeRadio.checked = true;

        const availableCommands = [];
        plugins.forEach(p => {
            if (isPluginEnabled(p)) {
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
            card.draggable = true;
            card.dataset.index = index;

            if (item.type === 'group') {
                card.innerHTML = `
                    <div class="plugin-header">
                        <span class="drag-handle">☰</span>
                        <div class="plugin-info">
                            <input type="text" class="group-name-input" value="${escapeHtml(item.name)}" data-id="${escapeHtml(item.id)}" placeholder="Group Name">
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
                            <span class="plugin-name">${escapeHtml(item.name)}</span>
                            <span class="plugin-id">ID: ${escapeHtml(item.id)}</span>
                        </div>
                        <div class="actions">
                            <label class="switch-container" style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size: 12px; font-weight: bold;">Plugin Active</span>
                                <label class="switch">
                                    <input type="checkbox" class="toggle-plugin" ${isPluginEnabled(item) ? 'checked' : ''}>
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
                            <textarea class="editor" spellcheck="false">${escapeHtml(JSON.stringify(item, null, 2))}</textarea>
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
                    await setPluginEnabled(item.id, e.target.checked);
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
                                <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">Script #${i+1} (${escapeHtml(cs.matches.join(', '))})</div>
                                <textarea class="cs-editor" data-index="${i}" spellcheck="false">${escapeHtml(code)}</textarea>
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
                                <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">${escapeHtml(cmd)}</div>
                                <textarea class="cmd-editor" data-cmd="${escapeHtml(cmd)}" spellcheck="false">${escapeHtml(code)}</textarea>
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
                        // Remove config object; configSchema drives settings
                        delete updated.config;

                        plugins[index] = updated;
                        await savePlugins(plugins);
                        alert('Plugin updated!');
                    } catch (e) { alert('Invalid JSON: ' + e.message); }
                };
            }
            
            card.querySelector('.delete-btn').onclick = async () => {
                if (confirm(`Delete "${item.name}"?`)) {
                    // Clean up separated code storage and settings
                    if (item.type === 'plugin') {
                        const keysToRemove = [];
                        delete enabledStates[item.id];
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
        await chrome.storage.local.set({ plugins: sanitizePluginsForStorage(plugins), pluginEnabledStates: enabledStates });
        render(); // Re-render to update order and indices
    }

    document.getElementById('add-plugin').onclick = async () => {
        const name = prompt('Plugin Name:');
        if (!name) return;
        const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { plugins = [] } = await chrome.storage.local.get('plugins');
        plugins.push({ 
            id, name, type: 'plugin',
            configSchema: [], 
            contentScripts: [], commandNames: [] 
        });
        await setPluginEnabled(id, false);
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

    document.getElementById('export-zip').onclick = async () => {
        const { plugins = [], pluginEnabledStates = {} } = await chrome.storage.local.get(['plugins', 'pluginEnabledStates']);
        const selectedItemIds = await selectPluginsForExport(plugins);
        if (selectedItemIds === null) return;
        const entries = [];
        const bundle = {
            format: 'audit-tools-plugin-bundle',
            version: 1,
            exportedAt: new Date().toISOString(),
            pluginEnabledStates: Object.fromEntries(
                Object.entries(pluginEnabledStates).filter(([id]) => selectedItemIds.includes(id))
            ),
            plugins: plugins.filter(p => selectedItemIds.includes(p.id))
        };
        entries.push({ name: 'bundle.json', data: utf8Encode(JSON.stringify(bundle, null, 2)) });

        for (const p of plugins) {
            if (p.type !== 'plugin') continue;
            if (!selectedItemIds.includes(p.id)) continue;
            const idSafe = p.id.replace(/-/g, '_');
            if (p.contentScripts) {
                for (let i = 0; i < p.contentScripts.length; i++) {
                    const key = `plugin_code_${idSafe}_cs_${i}`;
                    const result = await chrome.storage.local.get(key);
                    const filename = `${idSafe}_cs_${i}.js`;
                    let code = result[key];
                    if (code === undefined) {
                        code = await loadPackagedScript(`plugin_scripts/${filename}`);
                    }
                    if (code === undefined || code === null) code = '';
                    entries.push({
                        name: `plugin_scripts/${filename}`,
                        data: utf8Encode(code)
                    });
                }
            }
            for (const cmd of (p.commandNames || [])) {
                const key = `plugin_code_${idSafe}_cmd_${cmd}`;
                const result = await chrome.storage.local.get(key);
                const filename = `${idSafe}_cmd_${cmd}.js`;
                let code = result[key];
                if (code === undefined) {
                    code = await loadPackagedScript(`plugin_scripts/${filename}`);
                }
                if (code === undefined || code === null) code = '';
                entries.push({
                    name: `plugin_scripts/${filename}`,
                    data: utf8Encode(code)
                });
            }
        }

        const zip = createZip(entries);
        const blob = new Blob([zip], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audit_tools_plugins.zip';
        a.click();
        URL.revokeObjectURL(url);
    };

    document.getElementById('import-zip-file').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const zipEntries = await parseZip(await file.arrayBuffer());
            const bundleData = zipEntries.get('bundle.json');
            if (!bundleData) throw new Error('bundle.json missing in ZIP');
            const bundle = JSON.parse(utf8Decode(bundleData));
            const imported = Array.isArray(bundle?.plugins) ? bundle.plugins : [];
            if (typeof bundle?.pluginEnabledStates !== 'object' || bundle.pluginEnabledStates === null) {
                throw new Error('Invalid ZIP bundle: pluginEnabledStates missing');
            }
            const importedEnabledStates = bundle.pluginEnabledStates;

            const { plugins = [] } = await chrome.storage.local.get('plugins');
            const merge = confirm('Merge with existing items? (OK to Merge, Cancel to Replace)');

            const strippedImported = [];
            for (const p of imported) {
                if (p.type !== 'plugin') {
                    strippedImported.push(p);
                    continue;
                }

                const idSafe = p.id.replace(/-/g, '_');
                const codeToStore = {};

                if (p.contentScripts) {
                    for (let i = 0; i < p.contentScripts.length; i++) {
                        const filename = `${idSafe}_cs_${i}.js`;
                        const zipName = `plugin_scripts/${filename}`;
                        const scriptData = zipEntries.get(zipName);
                        if (!scriptData) {
                            throw new Error(`ZIP is missing required script: ${zipName}`);
                        }
                        const code = utf8Decode(scriptData);
                        codeToStore[`plugin_code_${idSafe}_cs_${i}`] = code;
                    }
                }

                for (const cmd of (p.commandNames || [])) {
                    const filename = `${idSafe}_cmd_${cmd}.js`;
                    const zipName = `plugin_scripts/${filename}`;
                    const scriptData = zipEntries.get(zipName);
                    if (!scriptData) {
                        throw new Error(`ZIP is missing required script: ${zipName}`);
                    }
                    const code = utf8Decode(scriptData);
                    codeToStore[`plugin_code_${idSafe}_cmd_${cmd}`] = code;
                }

                if (Object.keys(codeToStore).length > 0) {
                    await chrome.storage.local.set(codeToStore);
                }

                if (p.configSchema) {
                    const sk = `plugin_settings_${idSafe}`;
                    const defaults = {};
                    p.configSchema.forEach(f => {
                        defaults[f.id] = f.default;
                    });
                    const existing = await chrome.storage.local.get(sk);
                    if (!existing[sk]) {
                        await chrome.storage.local.set({ [sk]: defaults });
                    }
                }

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
            }

            let newPlugins;
            let newEnabledStates;
            if (merge) {
                newPlugins = [...plugins];
                strippedImported.forEach(p => {
                    const idx = newPlugins.findIndex(existing => existing.id === p.id);
                    if (idx > -1) newPlugins[idx] = p;
                    else newPlugins.push(p);
                });
                newEnabledStates = { ...enabledStates };
                strippedImported.forEach((p) => {
                    if (p.type !== 'plugin') return;
                    if (importedEnabledStates[p.id] !== undefined) newEnabledStates[p.id] = !!importedEnabledStates[p.id];
                    else if (newEnabledStates[p.id] === undefined) newEnabledStates[p.id] = true;
                });
            } else {
                newPlugins = strippedImported;
                newEnabledStates = {};
                strippedImported.forEach((p) => {
                    if (p.type !== 'plugin') return;
                    newEnabledStates[p.id] = importedEnabledStates[p.id] !== undefined ? !!importedEnabledStates[p.id] : true;
                });
            }

            enabledStates = newEnabledStates;
            await savePlugins(newPlugins);
            alert('ZIP import successful!');
        } catch (err) {
            alert('ZIP import failed: ' + err.message);
        } finally {
            e.target.value = '';
        }
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

    document.getElementById('inspect-scripts').onclick = async () => {
        const { plugins = [] } = await chrome.storage.local.get('plugins');
        const paths = new Set();
        for (const p of plugins) {
            if (p.type !== 'plugin') continue;
            const idSafe = p.id.replace(/-/g, '_');
            for (let i = 0; i < (p.contentScripts || []).length; i++) {
                paths.add(`plugin_scripts/${idSafe}_cs_${i}.js`);
            }
            for (const cmd of (p.commandNames || [])) {
                paths.add(`plugin_scripts/${idSafe}_cmd_${cmd}.js`);
            }
        }
        const lines = Array.from(paths).sort();
        if (lines.length === 0) {
            alert('No plugin scripts declared for the current plugin list.');
            return;
        }
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bundled Scripts</title></head><body style="font-family:monospace;padding:16px;"><h2>Bundled plugin_scripts/ files</h2><p>These are extension-internal URLs (Chrome does not expose the absolute filesystem path).</p><ul>${lines.map(p => `<li><a href="${chrome.runtime.getURL(p)}" target="_blank" rel="noopener noreferrer">${p}</a></li>`).join('')}</ul></body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
    };
    render();
});
