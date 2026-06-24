const MOCK_SCENARIOS = {
  success: {
    delay: 400,
    result: { username: 'mock-user', avatarUrl: '' },
  },
  '401': {
    delay: 300,
    error: 'HTTP 401: Bad credentials',
  },
  '403': {
    delay: 300,
    error: 'HTTP 403: insufficient_scope',
  },
  timeout: {
    delay: 12000,
    error: '请求超时',
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isMockToken(token) {
  return typeof token === 'string' && token.startsWith('mock:');
}

export function resolveMockScenario(token) {
  const scenario = token.replace(/^mock:/, '').trim() || 'success';
  return MOCK_SCENARIOS[scenario] ? scenario : 'success';
}

/**
 * @param {{ token: string }} credential
 */
export async function verifyMock(credential) {
  const scenarioKey = resolveMockScenario(credential.token);
  const scenario = MOCK_SCENARIOS[scenarioKey];

  if (scenarioKey === 'timeout') {
    await sleep(12000);
    throw new Error(scenario.error);
  }

  await sleep(scenario.delay);

  if (scenario.error) {
    throw new Error(scenario.error);
  }

  return scenario.result;
}

export function getMockScenarios() {
  return Object.keys(MOCK_SCENARIOS);
}
