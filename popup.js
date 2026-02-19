let themeEditors = {}; // Store CodeMirror instances

document.addEventListener("DOMContentLoaded", async () => {
    // Apply theme on popup load
    const { theme = 'auto' } = await chrome.storage.local.get('theme');
    applyTheme(theme);

    const { plugins } = await chrome.storage.local.get('plugins');
    if (!plugins) return;

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
        } else if (item.type === 'plugin' && item.enabled && item.configSchema) {
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
                    input.checked = pluginSettings[field.id] !== undefined ? pluginSettings[field.id] : (item.config[field.id]);
                } else if (field.type === 'select') {
                    input = document.createElement('select');
                    input.id = `${item.id}_${field.id}`;
                    field.options.forEach(opt => {
                        const o = document.createElement('option');
                        o.value = opt.value;
                        o.textContent = opt.label;
                        input.appendChild(o);
                    });
                    input.value = pluginSettings[field.id] || item.config[field.id];
                    input.style.marginLeft = '55px';
                } else if (field.type === 'number') {
                    input = document.createElement('input');
                    input.type = 'number';
                    input.id = `${item.id}_${field.id}`;
                    input.min = field.min;
                    input.max = field.max;
                    input.value = pluginSettings[field.id] || item.config[field.id];
                    input.style.marginLeft = '60px';
                    input.style.width = '40px';
                }

                targetContainer.appendChild(container);
                if (field.type !== 'toggle') targetContainer.appendChild(input);
            });
        }
    }

    document.getElementById("save").addEventListener("click", async () => {
        const { plugins } = await chrome.storage.local.get('plugins');
        for (const item of plugins) {
            if (item.type === 'plugin' && item.enabled && item.configSchema) {
                const newSettings = {};
                item.configSchema.forEach(field => {
                    const el = document.getElementById(`${item.id}_${field.id}`);
                    if (el) { // Ensure element exists before trying to read its value
                        if (field.type === 'toggle') newSettings[field.id] = el.checked;
                        else if (field.type === 'number') newSettings[field.id] = parseInt(el.value);
                        else newSettings[field.id] = el.value;
                    }
                });
                const storageKey = `plugin_settings_${item.id.replace(/-/g, '_')}`;
                await chrome.storage.local.set({ [storageKey]: newSettings });
            }
        }
        alert("Settings saved!");
    });
});

async function applyTheme(theme) {
    let finalTheme = theme;
    if (theme === 'auto') {
        finalTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.className = finalTheme;
}
