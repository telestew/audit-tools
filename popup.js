document.addEventListener("DOMContentLoaded", async () => {
    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins) return;

    const settingsContainer = document.querySelector('.settings');
    settingsContainer.innerHTML = '';

    for (const plugin of plugins) {
        if (!plugin.enabled || !plugin.configSchema) continue;

        const pluginHeader = document.createElement('h4');
        pluginHeader.textContent = plugin.name;
        settingsContainer.appendChild(pluginHeader);

        const storageKey = `plugin_settings_${plugin.id.replace(/-/g, '_')}`;
        const stored = await chrome.storage.local.get(storageKey);
        const pluginSettings = stored[storageKey] || {};

        plugin.configSchema.forEach(field => {
            const container = document.createElement('label');
            container.className = field.type === 'toggle' ? 'toggle-container' : '';
            if (field.type !== 'toggle') {
                container.setAttribute('for', `${plugin.id}_${field.id}`);
                container.textContent = field.label;
                container.style.marginLeft = '25px';
                container.style.marginTop = '10px';
                container.style.display = 'block';
            }

            let input;
            if (field.type === 'toggle') {
                container.innerHTML = `&emsp;&emsp;<input type="checkbox" id="${plugin.id}_${field.id}"><span class="toggle-slider"></span><span class="toggle-label">${field.label}</span>`;
                input = container.querySelector('input');
                input.checked = pluginSettings[field.id] !== undefined ? pluginSettings[field.id] : (plugin.config[field.id]);
            } else if (field.type === 'select') {
                input = document.createElement('select');
                input.id = `${plugin.id}_${field.id}`;
                field.options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.textContent = opt.label;
                    input.appendChild(o);
                });
                input.value = pluginSettings[field.id] || plugin.config[field.id];
                input.style.marginLeft = '55px';
            } else if (field.type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.id = `${plugin.id}_${field.id}`;
                input.min = field.min;
                input.max = field.max;
                input.value = pluginSettings[field.id] || plugin.config[field.id];
                input.style.marginLeft = '60px';
                input.style.width = '40px';
            }

            settingsContainer.appendChild(container);
            if (field.type !== 'toggle') settingsContainer.appendChild(input);
        });
    }

    document.getElementById("save").addEventListener("click", async () => {
        for (const plugin of plugins) {
            if (!plugin.enabled || !plugin.configSchema) continue;
            const newSettings = {};
            plugin.configSchema.forEach(field => {
                const el = document.getElementById(`${plugin.id}_${field.id}`);
                if (field.type === 'toggle') newSettings[field.id] = el.checked;
                else if (field.type === 'number') newSettings[field.id] = parseInt(el.value);
                else newSettings[field.id] = el.value;
            });
            const storageKey = `plugin_settings_${plugin.id.replace(/-/g, '_')}`;
            await chrome.storage.local.set({ [storageKey]: newSettings });
        }
        alert("Settings saved!");
    });
});
