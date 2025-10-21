import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Settings {
  appsDirectory?: string; // Custom apps directory path
  defaultPythonVersion?: string; // Default Python version (e.g., "3.12")
}

// Path to settings file
function getSettingsFilePath(): string {
  const homeDir = os.homedir();
  const uvdashDir = path.join(homeDir, '.uvdash');

  // Create directory if it doesn't exist
  if (!fs.existsSync(uvdashDir)) {
    fs.mkdirSync(uvdashDir, { recursive: true });
  }

  return path.join(uvdashDir, 'settings.json');
}

// Load settings
export function loadSettings(): Settings {
  try {
    const filePath = getSettingsFilePath();

    if (!fs.existsSync(filePath)) {
      return {}; // Return empty settings if file doesn't exist
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[settings] Failed to load settings:', error);
    return {};
  }
}

// Save settings
export function saveSettings(settings: Settings): void {
  try {
    const filePath = getSettingsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('[settings] Failed to save settings:', error);
  }
}
