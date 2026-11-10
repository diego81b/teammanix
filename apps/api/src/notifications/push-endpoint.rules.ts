import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Hosts of the push services of the browsers. The server POSTs to the endpoint a client registers, so an open URL would
 * let any account make the server call internal addresses (SSRF). Only these services are accepted; a new browser
 * vendor is one line here.
 */
const PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
];

/** `https` on the default port, no credentials, and a host of a known push service. IP literals never match. */
export function isPushEndpoint(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return PUSH_HOSTS.some((re) => re.test(host));
}

/** Validator for DTOs: the value must be an `isPushEndpoint`. */
export function IsPushEndpoint(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isPushEndpoint',
      target: object.constructor,
      propertyName,
      options,
      validator: { validate: isPushEndpoint },
    });
}
