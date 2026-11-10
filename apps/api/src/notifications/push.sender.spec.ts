import { classifyPushStatus, WebPushSender } from './push.sender';

describe('classifyPushStatus', () => {
  it('404 and 410 mean the subscription is gone for good', () => {
    expect(classifyPushStatus(404)).toBe('gone');
    expect(classifyPushStatus(410)).toBe('gone');
  });

  it('any other failure is transient: the subscription is kept', () => {
    for (const status of [400, 401, 413, 429, 500, 503, undefined]) expect(classifyPushStatus(status)).toBe('error');
  });
});

describe('WebPushSender', () => {
  it('does not call an endpoint that is not a known push service, and reports it gone so the row is deleted', async () => {
    const result = await new WebPushSender().send({ endpoint: 'http://169.254.169.254/latest', p256dh: 'a', auth: 'b' }, '{}');
    expect(result).toBe('gone');
  });
});
