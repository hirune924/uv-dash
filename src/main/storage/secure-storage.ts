import { safeStorage } from 'electron';

/**
 * Secure storage module using Electron's safeStorage API
 * This leverages OS-native encryption:
 * - macOS: Keychain
 * - Windows: Credential Manager (DPAPI)
 * - Linux: libsecret (Secret Service API)
 */

/**
 * Encrypts a secret value
 * @param plainText - The plain text secret to encrypt
 * @returns Base64-encoded encrypted string
 */
export function encryptSecret(plainText: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Encryption is not available on this system. Secrets will be stored in plain text.');
    // Fallback: return with a prefix to indicate it's not encrypted
    return `plain:${plainText}`;
  }

  const buffer = safeStorage.encryptString(plainText);
  return buffer.toString('base64');
}

/**
 * Decrypts a secret value
 * @param encrypted - The Base64-encoded encrypted string
 * @returns Decrypted plain text
 */
export function decryptSecret(encrypted: string): string {
  // Handle fallback case where encryption wasn't available
  if (encrypted.startsWith('plain:')) {
    console.warn('Decrypting a plain text secret (encryption was not available when stored).');
    return encrypted.substring(6); // Remove 'plain:' prefix
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.error('Encryption is not available on this system. Cannot decrypt secret.');
    return '';
  }

  try {
    const buffer = Buffer.from(encrypted, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (error) {
    console.error('Failed to decrypt secret:', error);
    return '';
  }
}

/**
 * Encrypts all secrets in a record
 * @param secrets - Record of secret key-value pairs
 * @returns Record of encrypted secrets
 */
export function encryptSecrets(secrets: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(secrets)) {
    encrypted[key] = encryptSecret(value);
  }

  return encrypted;
}

/**
 * Decrypts all secrets in a record
 * @param encryptedSecrets - Record of encrypted secret key-value pairs
 * @returns Record of decrypted secrets
 */
export function decryptSecrets(encryptedSecrets: Record<string, string>): Record<string, string> {
  const decrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(encryptedSecrets)) {
    decrypted[key] = decryptSecret(value);
  }

  return decrypted;
}

/**
 * Checks if encryption is available on the current system
 * @returns true if encryption is available
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
