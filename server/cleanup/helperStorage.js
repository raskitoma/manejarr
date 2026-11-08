export function createHelperStorage(url, token) {
  async function request(operation, body) {
    if (!url || !token || token.length < 32) throw new Error('Cleanup helper is not configured');
    const endpoint = new URL(url);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error('Invalid cleanup helper URL');
    }
    const response = await fetch(new URL(`/v1/${operation}`, endpoint), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Cleanup helper returned HTTP ${response.status}`);
    return response.json();
  }

  return {
    checkRoots: () => request('status'),
    listOutput: () => request('list'),
    inspectOutput: relative => request('output', { relative }),
    inspectLibrary: (relative, manager) => request('library', { relative, manager }),
    remove: async (relative, identity, destination) =>
      (await request('remove', { relative, identity, destination })).removed,
  };
}
