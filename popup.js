let themeEditors = {}; // Store CodeMirror instances

document.addEventListener("DOMContentLoaded", async () => {
    // Apply theme on popup load
    const { theme = 'auto' } = await chrome.storage.local.get('theme');
    applyTheme(theme);

    const { plugins, pluginEnabledStates = {} } = await chrome.storage.local.get(['plugins', 'pluginEnabledStates']);
    if (!plugins) return;
    const isPluginEnabled = (item) => {
        return pluginEnabledStates[item.id] !== false;
    };

    const settingsContainer = document.querySelector('.settings');
    settingsContainer.innerHTML = '';

    let currentGroupElement = null;

    for (const item of plugins) {
        if (item.type === 'group') {
            currentGroupElement = document.createElement('div');
            currentGroupElement.className = 'plugin-group';
            const groupHeader = document.createElement('h4');
            groupHeader.textContent = item.name;
            currentGroupElement.appendChild(groupHeader);
            settingsContainer.appendChild(currentGroupElement);
        } else if (item.type === 'plugin' && isPluginEnabled(item) && item.configSchema) {
            const targetContainer = currentGroupElement || settingsContainer;

            const storageKey = `plugin_settings_${item.id.replace(/-/g, '_')}`;
            const stored = await chrome.storage.local.get(storageKey);
            const pluginSettings = stored[storageKey] || {};

            item.configSchema.forEach(field => {
                const container = document.createElement('label');
                container.className = field.type === 'toggle' ? 'toggle-container' : '';
                if (field.type !== 'toggle') {
                    container.setAttribute('for', `${item.id}_${field.id}`);
                    container.textContent = field.label;
                    container.style.marginLeft = '25px';
                    container.style.marginTop = '10px';
                    container.style.display = 'block';
                }

                let input;
                if (field.type === 'toggle') {
                    container.innerHTML = `&emsp;&emsp;<input type="checkbox" id="${item.id}_${field.id}"><span class="toggle-slider"></span><span class="toggle-label">${field.label}</span>`;
                    input = container.querySelector('input');
                    input.checked = pluginSettings[field.id] !== undefined ? pluginSettings[field.id] : !!field.default;
                } else if (field.type === 'select') {
                    input = document.createElement('select');
                    input.id = `${item.id}_${field.id}`;
                    field.options.forEach(opt => {
                        const o = document.createElement('option');
                        o.value = opt.value;
                        o.textContent = opt.label;
                        input.appendChild(o);
                    });
                    input.value = pluginSettings[field.id] !== undefined ? pluginSettings[field.id] : (field.default || '');
                    input.style.marginLeft = '55px';
                } else if (field.type === 'text') {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.id = `${item.id}_${field.id}`;
                    input.value = pluginSettings[field.id] !== undefined ? pluginSettings[field.id] : (field.default || '');
                    input.style.marginLeft = '25px';
                    input.style.width = 'calc(100% - 60px)';
                } else if (field.type === 'number') {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.id = `${item.id}_${field.id}`;
                    if (field.min !== undefined) input.min = field.min;
                    if (field.max !== undefined) input.max = field.max;
                    if (field.step !== undefined) input.step = field.step; // Support floats like 0.1
                    input.value = pluginSettings[field.id] !== undefined ? pluginSettings[field.id] : (field.default !== undefined ? field.default : '');
                    input.style.marginLeft = '60px';
                    input.style.width = '50px';
                }

                targetContainer.appendChild(container);
                if (field.type !== 'toggle') targetContainer.appendChild(input);
            });
        }
    }

    document.getElementById("save").addEventListener("click", async () => {
        const { plugins, pluginEnabledStates = {} } = await chrome.storage.local.get(['plugins', 'pluginEnabledStates']);
        for (const item of plugins) {
            const enabled = pluginEnabledStates[item.id] !== false;
            if (item.type === 'plugin' && enabled && item.configSchema) {
                const newSettings = {};
                item.configSchema.forEach(field => {
                    const el = document.getElementById(`${item.id}_${field.id}`);
                    if (el) { // Ensure element exists before trying to read its value
                        if (field.type === 'toggle') newSettings[field.id] = el.checked;
                        else if (field.type === 'number') newSettings[field.id] = parseFloat(el.value);
                        else newSettings[field.id] = el.value;
                    }
                });
                const storageKey = `plugin_settings_${item.id.replace(/-/g, '_')}`;
                await chrome.storage.local.set({ [storageKey]: newSettings });
            }
        }
        alert("Settings saved!");
    });

    chrome.storage.onChanged.addListener((changes) => {
        // If settings changed in background (via command), refresh UI
        for (let key in changes) {
            if (key.startsWith('plugin_settings_')) {
                const pluginId = key.replace('plugin_settings_', '').replace(/_/g, '-');
                const newVals = changes[key].newValue;
                for (let fieldId in newVals) {
                    const el = document.getElementById(`${pluginId}_${fieldId}`);
                    if (el) {
                        if (el.type === 'checkbox') el.checked = newVals[fieldId];
                        else el.value = newVals[fieldId];
                    }
                }
            }
        }
    });
});

async function applyTheme(theme) {
    let finalTheme = theme;
    if (theme === 'auto') {
        finalTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.className = finalTheme;
}
