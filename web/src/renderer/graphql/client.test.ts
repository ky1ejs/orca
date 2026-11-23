// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readToken = vi.fn();

vi.mock('../platform/usePlatform.js', () => ({
  getPlatform: () => ({ kind: 'electron', orca: { auth: { readToken } } }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  readToken.mockResolvedValue('session-token');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  fetchMock.mockReset();
  readToken.mockReset();
});

async function loadClient() {
  return import('./client.js');
}

describe('fetchAttachment', () => {
  it('sends the session token and encodes the id', async () => {
    fetchMock.mockResolvedValue(new Response('png', { status: 200 }));
    const { fetchAttachment, BACKEND_URL } = await loadClient();

    const blob = await fetchAttachment('a/b');

    expect(await blob.text()).toBe('png');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND_URL}/attachments/a%2Fb`);
    expect(init.headers).toEqual({ Authorization: 'Bearer session-token' });
  });

  it('on 401, drops the cached token and reports the auth error', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 401 }));
    const { fetchAttachment, setOnAuthError } = await loadClient();
    const onAuthError = vi.fn();
    setOnAuthError(onAuthError);

    await expect(fetchAttachment('a1')).rejects.toThrow('401');
    await expect(fetchAttachment('a1')).rejects.toThrow('401');

    expect(onAuthError).toHaveBeenCalledTimes(2);
    // The token is read again instead of reusing the rejected one.
    expect(readToken).toHaveBeenCalledTimes(2);
  });

  it('throws on other failures without signing out', async () => {
    fetchMock.mockResolvedValue(new Response('missing', { status: 404 }));
    const { fetchAttachment, setOnAuthError } = await loadClient();
    const onAuthError = vi.fn();
    setOnAuthError(onAuthError);

    await expect(fetchAttachment('a1')).rejects.toThrow('404');
    expect(onAuthError).not.toHaveBeenCalled();
  });
});
