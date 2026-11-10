import { isPushEndpoint } from './push-endpoint.rules';

describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://eu.push.services.mozilla.com/wpush/v2/abc',
    'https://db5p.notify.windows.com/?token=abc',
    'https://web.push.apple.com/abc',
  ])('accepts the endpoint of a browser push service: %s', (url) => {
    expect(isPushEndpoint(url)).toBe(true);
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['localhost', 'https://localhost/x'],
    ['an IPv4 literal', 'https://169.254.169.254/latest/meta-data'],
    ['an IPv6 literal', 'https://[::1]/x'],
    ['an internal host', 'https://db/x'],
    ['an unknown host', 'https://push.test/x'],
    ['a look-alike suffix', 'https://fcm.googleapis.com.evil.test/x'],
    ['a look-alike prefix', 'https://evilfcm.googleapis.com/x'],
    ['credentials in the URL', 'https://user:pass@fcm.googleapis.com/x'],
    ['another port', 'https://fcm.googleapis.com:8443/x'],
    ['not a URL', 'not a url'],
    ['an empty string', ''],
  ])('rejects %s', (_name, url) => {
    expect(isPushEndpoint(url)).toBe(false);
  });

  it('ignores case and a trailing dot in the host', () => {
    expect(isPushEndpoint('https://FCM.GoogleAPIs.com./fcm/send/abc')).toBe(true);
  });
});
