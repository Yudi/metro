import { BusNoticeHttpClient, BUS_NOTICE_USER_AGENT } from './bus-notice.http';

describe('notice HTTP limits', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  afterEach(() => fetchMock.mockReset());
  afterAll(() => fetchMock.mockRestore());
  const get = () => new BusNoticeHttpClient().get('/informativos/regiao/1', new AbortController().signal);
  it('uses the project user agent and refuses redirects', async () => {
    fetchMock.mockResolvedValue(new Response('<h1>Informativos</h1>', { headers: { 'content-type': 'text/html' } }));
    await get();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      redirect: 'error', headers: expect.objectContaining({ 'User-Agent': BUS_NOTICE_USER_AGENT }),
    }));
  });
  it.each([403, 429, 500])('does not retry HTTP %s', async (status) => {
    fetchMock.mockResolvedValue(new Response('blocked', { status, headers: { 'content-type': 'text/html' } }));
    await expect(get()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized streaming bodies without relying on content-length', async () => {
    fetchMock.mockResolvedValue(new Response('x'.repeat(2_000_001), { headers: { 'content-type': 'text/html' } }));
    await expect(get()).rejects.toThrow('size limit');
  });
  it('rejects HTML challenges even when HTTP status is 200', async () => {
    fetchMock.mockResolvedValue(new Response('<div id="px-captcha"></div>', { headers: { 'content-type': 'text/html' } }));
    await expect(get()).rejects.toThrow('challenge');
  });
});
