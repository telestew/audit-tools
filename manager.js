document.addEventListener("DOMContentLoaded", async () => {
    const list = document.getElementById('plugin-list');

    // Default Plugins
    const DEFAULT_PLUGINS_DATA = [
        {
            "id": "hide-external-feedback",
            "name": "Hide External Feedback",
            "enabled": true,
            "type": "plugin",
            "config": { "enabled": true },
            "configSchema": [ { "id": "enabled", "type": "toggle", "label": "Hide 'External Feedback'" } ],
            "contentScripts": [ { "matches": ["https://app.outlier.ai/en/expert/outlieradmin/tools/chat_bulk_audit/*"], "code": "const { plugin_settings_hide_external_feedback: config } = await chrome.storage.local.get('plugin_settings_hide_external_feedback'); if (config?.enabled !== false) { function hide() { const xpath = \"//p[text()='Task Feedback for Contributor (External)']/parent::*/parent::div\"; const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); const div = result.singleNodeValue; if (div) div.style.display = 'none'; } hide(); new MutationObserver(hide).observe(document.body, { childList: true, subtree: true }); }" } ]
        },
        {
            "id": "lookup-task",
            "name": "Lookup Task",
            "enabled": true,
            "type": "plugin",
            "config": { "lookupMode": "highlighted" },
            "configSchema": [ { "id": "lookupMode", "type": "select", "label": "Lookup with", "options": [ { "value": "clipboard", "label": "from clipboard" }, { "value": "highlighted", "label": "from highlighted text" } ] } ],
            "commands": { "lookup_task": "const { plugin_settings_lookup_task: config } = await chrome.storage.local.get('plugin_settings_lookup_task'); const mode = config?.lookupMode || 'highlighted'; let text = (mode === 'clipboard') ? await navigator.clipboard.readText() : window.getSelection().toString().trim(); if (text.match(/[A-Za-z0-9]/g) && text.length === 24) { window.open(`https://app.outlier.ai/en/expert/outlieradmin/tools/lookup/${text}#View%20Responses`, '_blank'); } else { alert('Not a valid ID: ' + text); }" }
        }
    ];

    let draggedItem = null;

    async function render() {
        const { plugins = [] } = await chrome.storage.local.get('plugins');
        
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
                            <button class="toggle-btn">${item.enabled ? 'Disable' : 'Enable'}</button>
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

                card.querySelector('.toggle-btn').onclick = async () => {
                    item.enabled = !item.enabled;
                    await savePlugins(plugins);
                };
                
                const editorContainer = card.querySelector('.editor-container');
                const scriptsEditorsList = card.querySelector('.scripts-editors');
                const commandEditorsList = card.querySelector('.command-editors');

                card.querySelector('.edit-btn').onclick = () => {
                    editorContainer.classList.remove('hidden');
                    
                    // Content Scripts Tab
                    scriptsEditorsList.innerHTML = '';
                    if (item.contentScripts && item.contentScripts.length > 0) {
                        item.contentScripts.forEach((cs, i) => {
                            const div = document.createElement('div');
                            div.style.marginBottom = '15px';
                            div.innerHTML = `
                                <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">Script #${i+1} (${cs.matches.join(', ')})</div>
                                <textarea class="cs-editor" data-index="${i}" spellcheck="false">${cs.code}</textarea>
                            `;
                            scriptsEditorsList.appendChild(div);
                        });
                    } else {
                        scriptsEditorsList.innerHTML = '<div style="font-size: 12px; color: #666;">No content scripts defined.</div>';
                    }

                    // Commands Tab
                    commandEditorsList.innerHTML = '';
                    if (item.commands && Object.keys(item.commands).length > 0) {
                        Object.entries(item.commands).forEach(([cmd, code]) => {
                            const div = document.createElement('div');
                            div.style.marginBottom = '15px';
                            div.innerHTML = `
                                <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">${cmd}</div>
                                <textarea class="cmd-editor" data-cmd="${cmd}" spellcheck="false">${code}</textarea>
                            `;
                            commandEditorsList.appendChild(div);
                        });
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
                    };
                });

                card.querySelector('.close-editor').onclick = () => {
                    editorContainer.classList.add('hidden');
                };
                
                card.querySelector('.save-plugin').onclick = async () => {
                    try {
                        const updated = JSON.parse(card.querySelector('.editor').value);
                        
                        // Update content scripts from scripts tab
                        card.querySelectorAll('.cs-editor').forEach(textarea => {
                            if (updated.contentScripts && updated.contentScripts[textarea.dataset.index]) {
                                updated.contentScripts[textarea.dataset.index].code = textarea.value;
                            }
                        });

                        // Update commands from command tab if they were edited there
                        card.querySelectorAll('.cmd-editor').forEach(textarea => {
                            if (updated.commands) {
                                updated.commands[textarea.dataset.cmd] = textarea.value;
                            }
                        });

                        plugins[index] = updated;
                        await savePlugins(plugins);
                        alert('Plugin updated!');
                    } catch (e) { alert('Invalid JSON: ' + e.message); }
                };
            }
            
            card.querySelector('.delete-btn').onclick = async () => {
                if (confirm(`Delete "${item.name}"?`)) {
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
            config: {}, configSchema: [], 
            contentScripts: [], commands: {} 
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
        const blob = new Blob([JSON.stringify(plugins, null, 2)], { type: 'application/json' });
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
                
                let newPlugins;
                if (action) {
                    newPlugins = [...plugins];
                    imported.forEach(p => {
                        const idx = newPlugins.findIndex(existing => existing.id === p.id);
                        if (idx > -1) newPlugins[idx] = p; // Overwrite existing
                        else newPlugins.push(p); // Add new
                    });
                } else {
                    newPlugins = imported; // Replace all
                }
                await savePlugins(newPlugins);
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
            await chrome.storage.local.set({ plugins: DEFAULT_PLUGINS_DATA });
            // Also reset their individual settings to default
            for (const p of DEFAULT_PLUGINS_DATA) {
                if (p.type === 'plugin' && p.config) {
                     await chrome.storage.local.set({ [`plugin_settings_${p.id.replace(/-/g,'_')}`]: p.config });
                }
            }
            alert('Default plugins restored!');
            render();
        }
    };

    render();
});
