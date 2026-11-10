import { currentCertificate, DAYS_EXPIRING, certificateStatus, daysUntil, validateCertificateDates } from './certificate.rules';

const TODAY = '2026-11-06';

describe('daysUntil', () => {
  it('counts calendar days, negative once past, across months and years', () => {
    expect(daysUntil('2026-11-06', TODAY)).toBe(0);
    expect(daysUntil('2026-11-16', TODAY)).toBe(10);
    expect(daysUntil('2026-11-05', TODAY)).toBe(-1);
    expect(daysUntil('2027-01-05', '2026-12-06')).toBe(30);
  });
});

describe('certificateStatus', () => {
  it('missing without an expiry', () => {
    expect(certificateStatus(null, TODAY)).toBe('missing');
  });
  it('expired from the day after expiry, valid on the day itself', () => {
    expect(certificateStatus('2026-11-05', TODAY)).toBe('expired');
    expect(certificateStatus('2026-11-06', TODAY)).toBe('expiring');
  });
  it('expiring within 30 days inclusive, valid beyond', () => {
    expect(DAYS_EXPIRING).toBe(30);
    expect(certificateStatus('2026-12-06', TODAY)).toBe('expiring');
    expect(certificateStatus('2026-12-07', TODAY)).toBe('valid');
  });
  it('crosses the year boundary and short months', () => {
    expect(certificateStatus('2027-01-05', '2026-12-06')).toBe('expiring');
    expect(certificateStatus('2027-01-06', '2026-12-06')).toBe('valid');
    expect(certificateStatus('2027-03-01', '2027-01-30')).toBe('expiring');
  });
});

describe('currentCertificate', () => {
  it('the one with the furthest expiry counts', () => {
    expect(currentCertificate([{ expiryDate: '2026-12-01' }, { expiryDate: '2027-06-30' }, { expiryDate: '2026-01-01' }])).toEqual({ expiryDate: '2027-06-30' });
  });
  it('null if there are none', () => {
    expect(currentCertificate([])).toBeNull();
  });
});

describe('validateCertificateDates', () => {
  it('valid: issue date not in the future, expiry equal or later', () => {
    expect(validateCertificateDates('2026-09-01', '2027-09-01', TODAY)).toBeNull();
    expect(validateCertificateDates('2026-11-06', '2026-11-06', TODAY)).toBeNull();
  });
  it('expiry before the issue date', () => {
    expect(validateCertificateDates('2026-09-02', '2026-09-01', TODAY)).toBe('INVALID_DATE_CERTIFICATE');
  });
  it('issue date in the future', () => {
    expect(validateCertificateDates('2026-11-07', '2027-11-07', TODAY)).toBe('INVALID_DATE_CERTIFICATE');
  });
  it('non-ISO or nonexistent dates', () => {
    expect(validateCertificateDates('01/09/2026', '2027-09-01', TODAY)).toBe('INVALID_DATE_CERTIFICATE');
    expect(validateCertificateDates('2026-02-30', '2027-09-01', TODAY)).toBe('INVALID_DATE_CERTIFICATE');
  });
});
