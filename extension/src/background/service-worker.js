import {
  deleteCredential,
  getCredentialById,
  getCredentials,
  saveCredential,
  setDefaultCredential,
  updateVerifyResult,
} from '../lib/credentials/store.js';
import { createCredential } from '../lib/credentials/types.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import { verifyCredential } from '../lib/verify/verifier.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'GET_CREDENTIALS':
          sendResponse({
            ok: true,
            credentials: await getCredentials(false),
          });
          break;

        case 'GET_CREDENTIAL': {
          const credential = await getCredentialById(msg.id, Boolean(msg.includeToken));
          if (!credential) throw new Error('凭证不存在');
          sendResponse({ ok: true, credential });
          break;
        }

        case 'SAVE_CREDENTIAL': {
          const saved = await saveCredential(createCredential(msg.credential || {}));
          sendResponse({ ok: true, credential: saved });
          break;
        }

        case 'DELETE_CREDENTIAL':
          await deleteCredential(msg.id);
          sendResponse({ ok: true });
          break;

        case 'SET_DEFAULT_CREDENTIAL': {
          const credential = await setDefaultCredential(msg.id);
          sendResponse({ ok: true, credential });
          break;
        }

        case 'VERIFY_CREDENTIAL': {
          const credential = await getCredentialById(msg.id, true);
          if (!credential) throw new Error('凭证不存在');

          await updateVerifyResult(msg.id, { status: 'verifying', message: '' });

          const verify = await verifyCredential(credential);
          const updated = await updateVerifyResult(msg.id, verify);
          sendResponse({ ok: true, credential: updated, verify });
          break;
        }

        case 'GET_SETTINGS':
          sendResponse({ ok: true, settings: await getSettings() });
          break;

        case 'SAVE_SETTINGS':
          sendResponse({ ok: true, settings: await saveSettings(msg.settings || {}) });
          break;

        default:
          sendResponse({ ok: false, error: '未知消息' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();

  return true;
});
