import { utils, getPublicKey } from '@noble/secp256k1';
import bs58check from 'bs58check';

/**
 * Generate a Noise authority keypair for the Rust JDC binary.
 *
 * Public key: [0x01, 0x00] (u16 LE version = 1) + 32-byte x-only pubkey → Base58Check
 * Secret key: raw 32 bytes → Base58Check
 */
export function generateKeypair(): { publicKey: string; secretKey: string } {
  const secretKeyBytes = utils.randomPrivateKey();
  const compressedPub = getPublicKey(secretKeyBytes, true); // 33 bytes

  // x-only: drop the 1-byte parity prefix
  const xOnly = compressedPub.slice(1); // 32 bytes

  // Prepend 2-byte version header [0x01, 0x00] (u16 LE = 1)
  const pubPayload = Buffer.alloc(34);
  pubPayload[0] = 0x01;
  pubPayload[1] = 0x00;
  pubPayload.set(xOnly, 2);

  return {
    publicKey: bs58check.encode(pubPayload),
    secretKey: bs58check.encode(Buffer.from(secretKeyBytes)),
  };
}
