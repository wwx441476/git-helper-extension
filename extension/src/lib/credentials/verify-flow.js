import { getCredentialById, saveCredential, updateVerifyResult } from './store.js';
import { createCredential, isMaskedToken } from './types.js';
import { verifyCredential } from '../verify/verifier.js';

/**
 * 在当前扩展页面上下文中验证凭证（避免 Service Worker fetch 偶发失败）。
 */
export async function runCredentialVerify(credentialInput) {
  const saved = await saveCredential(createCredential(credentialInput));
  const full = await getCredentialById(saved.id, true);
  if (!full?.token?.trim()) {
    throw new Error('请填写 Token');
  }

  await updateVerifyResult(full.id, { status: 'verifying', message: '' });
  const verify = await verifyCredential(full);
  const updated = await updateVerifyResult(full.id, verify);

  if (verify.status === 'verified' && verify.username) {
    await saveCredential({
      ...full,
      username: verify.username,
      verify,
    });
  }

  const latest = await getCredentialById(full.id, false);
  return { verify, credential: latest || updated };
}

export async function resolveFormToken(formData) {
  const trimmed = (formData.token || '').trim();
  if (trimmed && !isMaskedToken(trimmed)) return trimmed;
  if (!formData.id) return '';
  const existing = await getCredentialById(formData.id, true);
  return existing?.token || '';
}
