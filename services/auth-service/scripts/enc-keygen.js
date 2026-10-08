#!/usr/bin/env node
// Prints a new RSA 3072 key for payload encryption (documentation/todo/02-payload-encryption.md) as two environment lines.
// The private key goes in the environment or a secret store, never in git. Usage: npm run enc:keygen [-- <kid>]
const { generateKeyPairSync } = require('crypto');

const kid = process.argv[2] || `auth-${new Date().toISOString().slice(0, 7)}`;
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();

console.log(`ENC_KID=${kid}`);
console.log(`ENC_PRIVATE_KEY_PEM="${pem.replace(/\n/g, '\\n')}"`);
console.error('\nSet ENC_MODE=optional (then required) once the frontend is deployed. Keep the private key out of git.');
