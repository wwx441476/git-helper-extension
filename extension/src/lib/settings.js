const SETTINGS_KEY = 'appSettings';

/** @typedef {{ useMockVerify: boolean }} AppSettings */

const DEFAULTS = {
  useMockVerify: false,
  useMockSandboxPull: false,
};

export async function getSettings() {
  const data = await chrome.storage.local.get({ [SETTINGS_KEY]: DEFAULTS });
  return {
    ...DEFAULTS,
    ...(data[SETTINGS_KEY] || {}),
  };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
