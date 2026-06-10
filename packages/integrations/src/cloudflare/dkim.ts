import { generateKeyPairSync } from 'node:crypto';

export interface DkimKeyPair {
  privateKeyPem: string; // store encrypted at rest
  publicKeyPem: string;
  publicKeyDns: string; // base64 SPKI body, used in the DKIM TXT record
}

// Generate a 2048-bit RSA DKIM key pair. publicKeyDns is the base64 body
// (single line, no PEM headers) that goes into the DKIM TXT record's p= tag.
export function generateDkimKeyPair(): DkimKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const publicKeyDns = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');

  return { privateKeyPem: privateKey, publicKeyPem: publicKey, publicKeyDns };
}
