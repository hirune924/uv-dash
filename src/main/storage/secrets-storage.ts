import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { GlobalSecret } from '../../shared/types';
import { encryptSecret, decryptSecret } from './secure-storage';
import { randomUUID } from 'crypto';

const CONFIG_DIR = path.join(os.homedir(), '.uvdash');
const SECRETS_FILE = path.join(CONFIG_DIR, 'secrets.json');

// Global secrets in memory (decrypted)
const globalSecrets = new Map<string, GlobalSecret>();

// Initialize global secrets (call on app startup)
export function initGlobalSecrets(): void {
  if (!fs.existsSync(SECRETS_FILE)) {
    return;
  }

  try {
    const data = fs.readFileSync(SECRETS_FILE, 'utf-8');
    const persistedSecrets: Record<string, any> = JSON.parse(data);

    for (const [id, secret] of Object.entries(persistedSecrets)) {
      // Decrypt value
      const decryptedValue = decryptSecret(secret.value);
      globalSecrets.set(id, {
        ...secret,
        value: decryptedValue,
      });
    }
  } catch (error) {
    console.error('Failed to load global secrets:', error);
  }
}

// Save global secrets
export function saveGlobalSecrets(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const persistedSecrets: Record<string, any> = {};
  for (const [id, secret] of globalSecrets) {
    // Encrypt value
    const encryptedValue = encryptSecret(secret.value);
    persistedSecrets[id] = {
      ...secret,
      value: encryptedValue,
    };
  }

  fs.writeFileSync(SECRETS_FILE, JSON.stringify(persistedSecrets, null, 2), 'utf-8');
}

// Get global secrets list (without values)
export function listGlobalSecrets(): GlobalSecret[] {
  return Array.from(globalSecrets.values()).map((secret) => ({
    ...secret,
    // For security, don't return value in list
    value: '********',
  }));
}

// Create global secret
export function createGlobalSecret(
  secret: Omit<GlobalSecret, 'id' | 'createdAt' | 'updatedAt'>
): { success: boolean; secretId?: string; error?: string } {
  try {
    // Check for duplicate name
    const existingSecret = Array.from(globalSecrets.values()).find(
      (s) => s.name === secret.name
    );
    if (existingSecret) {
      return {
        success: false,
        error: `A secret with the name "${secret.name}" already exists. Please use a different name.`
      };
    }

    const id = randomUUID();
    const now = Date.now();
    const newSecret: GlobalSecret = {
      ...secret,
      id,
      createdAt: now,
      updatedAt: now,
    };

    globalSecrets.set(id, newSecret);
    saveGlobalSecrets();

    return { success: true, secretId: id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Update global secret
export function updateGlobalSecret(
  secretId: string,
  updates: Partial<Pick<GlobalSecret, 'name' | 'value' | 'description'>>
): { success: boolean; error?: string } {
  const secret = globalSecrets.get(secretId);
  if (!secret) {
    return { success: false, error: 'Secret not found' };
  }

  try {
    // If changing name, check for duplicates
    if (updates.name && updates.name !== secret.name) {
      const existingSecret = Array.from(globalSecrets.values()).find(
        (s) => s.id !== secretId && s.name === updates.name
      );
      if (existingSecret) {
        return {
          success: false,
          error: `A secret with the name "${updates.name}" already exists. Please use a different name.`
        };
      }
    }

    // Build updated secret, keeping existing values if updates are undefined
    const updatedSecret: GlobalSecret = {
      ...secret,
      name: updates.name !== undefined ? updates.name : secret.name,
      value: updates.value !== undefined ? updates.value : secret.value,
      description: updates.description !== undefined ? updates.description : secret.description,
      updatedAt: Date.now(),
    };

    // Validate that value is not empty (should never happen, but defensive check)
    if (!updatedSecret.value) {
      return {
        success: false,
        error: 'Secret value cannot be empty'
      };
    }

    globalSecrets.set(secretId, updatedSecret);
    saveGlobalSecrets();

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Delete global secret
export function deleteGlobalSecret(secretId: string): { success: boolean; error?: string } {
  if (!globalSecrets.has(secretId)) {
    return { success: false, error: 'Secret not found' };
  }

  try {
    globalSecrets.delete(secretId);
    saveGlobalSecrets();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Get value from secret ID (for runtime resolution)
export function resolveSecretValue(secretId: string): string | undefined {
  return globalSecrets.get(secretId)?.value;
}

// Get all secrets as Map (for testing)
export function getAllSecretsMap(): Map<string, GlobalSecret> {
  return new Map(globalSecrets);
}
