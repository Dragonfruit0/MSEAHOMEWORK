import crypto from 'crypto';

// Unambiguous alphabet: no 0/O, 1/I/l — this gets read aloud or copied off a
// printed sheet by a student, so avoid characters that are easy to confuse.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
