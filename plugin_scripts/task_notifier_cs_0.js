// Auto-generated plugin script — do not edit directly
(async () => {
    const storageKey = window.__pluginStorageKey;
    const allData = window.__pluginAllData;
    const pluginSettings = window.__pluginSettings || {};
    const bridge = window.__pluginBridge;
    try {
    const STATE_KEY = '__auditToolsTaskNotifierState';
    const ENDPOINT = 'https://app.outlier.ai/corp-api/qm/assigned-operation-nodes?fetchMetadata=true&onlyPending=true&page=1&project=&sortOrder=1';
    const MIN_REQUEST_INTERVAL_MS = 10000; // hard cap: never more than one request per 10s
    const NOTIFY_COOLDOWN_MS = 30000;

    const state = window[STATE_KEY] || {
      running: false,
      timer: null,
      inFlight: false,
      lastRequestAt: 0,
      lastAlertAt: 0,
      lastPendingCount: 0,
      config: {},
    };
    window[STATE_KEY] = state;

    const config = {
      enabled: !!pluginSettings?.enabled,
      period: Number(pluginSettings?.period) || 10,
      audioUrl: pluginSettings?.audioUrl || 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
    };
    state.config = config;

    const stop = () => {
      state.running = false;
      state.inFlight = false;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    };

    const schedule = (delayMs) => {
      if (!state.running) return;
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(tick, Math.max(delayMs, MIN_REQUEST_INTERVAL_MS));
    };

    const notify = async (pendingCount) => {
      const message = `${pendingCount} pending task${pendingCount === 1 ? '' : 's'} available`;
      try {
        await new Audio(state.config.audioUrl).play();
      } catch (_) {}

      try {
        if (bridge) {
          await bridge('notifications.create', {
            options: {
              type: 'basic',
              iconUrl: 'icon.png',
              title: 'Audit Tools',
              message,
            }
          });
          return;
        }
      } catch (_) {}

      try {
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Audit Tools', { body: message });
        }
      } catch (_) {}
    };

    const tick = async () => {
      if (!state.running) return;

      const now = Date.now();
      const sinceLast = now - state.lastRequestAt;
      if (sinceLast < MIN_REQUEST_INTERVAL_MS) {
        schedule(MIN_REQUEST_INTERVAL_MS - sinceLast);
        return;
      }
      if (state.inFlight) {
        schedule(MIN_REQUEST_INTERVAL_MS);
        return;
      }

      state.inFlight = true;
      state.lastRequestAt = Date.now();

      try {
        const { csrfToken } = await chrome.storage.local.get('csrfToken');
        const headers = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
        const res = await fetch(ENDPOINT, { headers });
        if (!res.ok) return;
        const data = await res.json();
        const pendingCount = Array.isArray(data?.nodes) ? data.nodes.length : 0;

        const transitionedToPending = state.lastPendingCount === 0 && pendingCount > 0;
        const cooledDown = (Date.now() - state.lastAlertAt) >= NOTIFY_COOLDOWN_MS;
        if (transitionedToPending && cooledDown) {
          await notify(pendingCount);
          state.lastAlertAt = Date.now();
        }
        state.lastPendingCount = pendingCount;
      } catch (_) {
        // no-op: this plugin should fail quietly
      } finally {
        state.inFlight = false;
      }

      const configuredMs = Math.max(MIN_REQUEST_INTERVAL_MS, (Number(state.config.period) || 10) * 60000);
      const elapsed = Date.now() - state.lastRequestAt;
      schedule(Math.max(MIN_REQUEST_INTERVAL_MS, configuredMs - elapsed));
    };

    if (!config.enabled) {
      stop();
      return;
    }

    // Restart controller with latest config, preserving timing state.
    stop();
    state.running = true;
    schedule(0);
    } catch (e) { console.error('Plugin error:', e); }
})();
