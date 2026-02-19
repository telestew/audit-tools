document.addEventListener("DOMContentLoaded", async () => {
    const list = document.getElementById('plugin-list');

    async function render() {
        const { plugins } = await chrome.storage.local.get('plugins');
        if (!plugins) return;
        
        list.innerHTML = '';
        plugins.forEach((plugin, index) => {
            const card = document.createElement('div');
            card.className = 'plugin-card';
            card.innerHTML = `
                <div class="plugin-header">
                    <div class="plugin-info">
                        <span class="plugin-name">${plugin.name}</span>
                        <span class="plugin-id">ID: ${plugin.id}</span>
                    </div>
                    <div class="actions">
                        <button class="toggle-btn">${plugin.enabled ? 'Disable' : 'Enable'}</button>
                        <button class="edit-btn secondary">Edit</button>
                        <button class="delete-btn danger">Delete</button>
                    </div>
                </div>
                <div class="editor-container hidden">
                    <textarea class="editor">${JSON.stringify(plugin, null, 2)}</textarea>
                    <div class="actions">
                        <button class="save-plugin">Save Changes</button>
                        <button class="close-editor secondary">Close</button>
                    </div>
                </div>
            `;
            
            card.querySelector('.toggle-btn').onclick = async () => {
                plugin.enabled = !plugin.enabled;
                await savePlugins(plugins);
            };
            
            card.querySelector('.edit-btn').onclick = () => {
                card.querySelector('.editor-container').classList.remove('hidden');
            };

            card.querySelector('.close-editor').onclick = () => {
                card.querySelector('.editor-container').classList.add('hidden');
            };
            
            card.querySelector('.delete-btn').onclick = async () => {
                if (confirm(`Delete plugin "${plugin.name}"?`)) {
                    plugins.splice(index, 1);
                    await savePlugins(plugins);
                }
            };
            
            card.querySelector('.save-plugin').onclick = async () => {
                try {
                    const updated = JSON.parse(card.querySelector('.editor').value);
                    plugins[index] = updated;
                    await savePlugins(plugins);
                    alert('Plugin updated!');
                } catch (e) { alert('Invalid JSON: ' + e.message); }
            };
            
            list.appendChild(card);
        });
    }

    async function savePlugins(plugins) {
        await chrome.storage.local.set({ plugins });
        render();
    }

    document.getElementById('add-plugin').onclick = async () => {
        const name = prompt('Plugin Name:');
        if (!name) return;
        const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const { plugins } = await chrome.storage.local.get('plugins');
        plugins.push({ 
            id, name, enabled: false, 
            config: {}, configSchema: [], 
            contentScripts: [], commands: {} 
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
                const action = confirm('Merge with existing plugins? (OK to Merge, Cancel to Replace)');
                
                let newPlugins;
                if (action) {
                    newPlugins = [...plugins];
                    imported.forEach(p => {
                        const idx = newPlugins.findIndex(existing => existing.id === p.id);
                        if (idx > -1) newPlugins[idx] = p;
                        else newPlugins.push(p);
                    });
                } else {
                    newPlugins = imported;
                }
                await savePlugins(newPlugins);
                alert('Import successful!');
            } catch (e) { alert('Import failed: ' + e.message); }
        };
        reader.readAsText(file);
    };

    render();
});
