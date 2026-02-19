# Plugin JSON Format

This document describes the structure of a plugin's JSON configuration, as used by the Audit Tools extension. Each plugin is a JSON object with the following top-level properties:

---

### `id` (string, required)
A unique identifier for the plugin. This should be a URL-friendly string (e.g., `my-new-feature`, `hide-external-feedback`). It is used for internal storage keys and referencing.

### `name` (string, required)
A human-readable name for the plugin, displayed in the Plugin Manager and Popup settings.

### `type` (string, optional)
Specifies the type of item in the plugin list.
- If omitted or `plugin`, it represents a standard feature plugin.
- If `group`, it represents a label for grouping other plugins in the Popup UI.

### `enabled` (boolean, required for type `plugin`)
Indicates whether the plugin is currently active. Only enabled plugins will have their content scripts injected, commands registered, and configuration options shown in the popup.

### `config` (object, optional for type `plugin`)
An object containing default configuration values for the plugin's settings. These values are used if no user-specific settings have been saved yet. The keys in this object should match the `id`s defined in `configSchema`.

### `configSchema` (array of objects, optional for type `plugin`)
An array of objects, each describing a configuration field that the plugin exposes in the extension's popup. Each object in the array should have:
- `id` (string, required): A unique identifier for this specific setting within the plugin's configuration.
- `type` (string, required): The type of input control to render (e.g., `"toggle"`, `"select"`, `"number"`, `"text"`).
- `label` (string, required): The text label displayed next to the input control.
- `options` (array of objects, required for type `"select"`): For `select` types, an array of `{ value: "...", label: "..." }` pairs.
- `min`, `max` (numbers, optional for type `"number"`): Min/max values for number inputs.

### `contentScripts` (array of objects, optional for type `plugin`)
An array of objects, each defining a content script to be injected into matching web pages. Each object should contain:
- `matches` (array of strings, required): An array of URL match patterns (e.g., `["https://app.outlier.ai/*"]`). The script will be injected if the current page URL matches any of these patterns.
- `code` (string, required): The JavaScript code to be injected. This code runs in the page's `MAIN` world, which means it can interact with page-level JavaScript variables and functions but is subject to the page's Content Security Policy.

### `commands` (object, optional for type `plugin`)
An object where keys are command names (matching those defined in `manifest.json`) and values are the JavaScript code to be executed when the command's shortcut is triggered. This code also runs in the page's `MAIN` world.

### `world` (string, optional, deprecated; primarily for internal use)
Previously used to specify the injection world (`"MAIN"` or `"ISOLATED"`). The current implementation universally injects into the `MAIN` world with a robust storage proxy, making this property largely redundant for new plugins. It's kept for backward compatibility if older plugins still rely on it.

---

### Special Considerations:

#### `chrome.storage.local` Access:
Injected `code` (both `contentScripts` and `commands`) is provided with a mock `window.chrome.storage.local.get` implementation. This mock provides access to all currently stored extension data, including global settings (`csrfToken`) and individual plugin configurations (e.g., `plugin_settings_your_plugin_id`).

Example usage within plugin code:
```javascript
const { csrfToken, plugin_settings_my_plugin_id: config } = await chrome.storage.local.get(['csrfToken', 'plugin_settings_my_plugin_id']);
if (config?.mySetting) {
    // ... use config.mySetting
}
```

#### Overwriting Changes in Manager:
When editing a plugin in the Plugin Manager, changes made in the "Content Scripts" and "Commands" tabs will override any corresponding code within the "JSON Config" tab's `contentScripts` or `commands` fields upon saving. The "JSON Config" tab is the primary source of truth, but the dedicated code editors provide a more convenient interface for larger code blocks.
