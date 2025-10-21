import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class TestEnvironment {
  private uvdashDir: string;
  private appsJsonPath: string;
  private backupPath: string;
  private secretsJsonPath: string;
  private secretsBackupPath: string;
  private settingsJsonPath: string;
  private settingsBackupPath: string;

  constructor() {
    this.uvdashDir = path.join(os.homedir(), '.uvdash');
    this.appsJsonPath = path.join(this.uvdashDir, 'apps.json');
    this.backupPath = path.join(this.uvdashDir, 'apps.json.test-backup');
    this.secretsJsonPath = path.join(this.uvdashDir, 'secrets.json');
    this.secretsBackupPath = path.join(this.uvdashDir, 'secrets.json.test-backup');
    this.settingsJsonPath = path.join(this.uvdashDir, 'settings.json');
    this.settingsBackupPath = path.join(this.uvdashDir, 'settings.json.test-backup');
  }

  /**
   * Backup existing apps.json and secrets.json
   */
  setup(): void {
    // Ensure directory exists
    if (!fs.existsSync(this.uvdashDir)) {
      fs.mkdirSync(this.uvdashDir, { recursive: true });
    }

    // Set UV_PYTHON environment variable to 3.12 to avoid using unstable versions like 3.13/3.14
    // This only affects tests and won't impact production usage
    process.env.UV_PYTHON = '3.12';
    console.log('[TEST ENV] Set UV_PYTHON=3.12 to prevent unstable Python versions in tests');

    // Backup existing apps.json if it exists
    if (fs.existsSync(this.appsJsonPath)) {
      fs.copyFileSync(this.appsJsonPath, this.backupPath);
      console.log('[TEST ENV] Backed up existing apps.json');
      // Clear it for clean test start
      fs.writeFileSync(this.appsJsonPath, '[]');
      console.log('[TEST ENV] Reset apps.json to empty array');
    } else {
      // Create empty apps.json for test
      fs.writeFileSync(this.appsJsonPath, '[]');
      console.log('[TEST ENV] Created new empty apps.json');
    }

    // Backup existing secrets.json if it exists
    if (fs.existsSync(this.secretsJsonPath)) {
      fs.copyFileSync(this.secretsJsonPath, this.secretsBackupPath);
      console.log('[TEST ENV] Backed up existing secrets.json');
      // Clear it for clean test start
      fs.writeFileSync(this.secretsJsonPath, '{}');
      console.log('[TEST ENV] Reset secrets.json to empty object');
    } else {
      // Create empty secrets.json for test
      fs.writeFileSync(this.secretsJsonPath, '{}');
      console.log('[TEST ENV] Created new empty secrets.json');
    }

    // Backup existing settings.json if it exists
    if (fs.existsSync(this.settingsJsonPath)) {
      fs.copyFileSync(this.settingsJsonPath, this.settingsBackupPath);
      console.log('[TEST ENV] Backed up existing settings.json');
      // Clear it for clean test start
      fs.writeFileSync(this.settingsJsonPath, '{}');
      console.log('[TEST ENV] Reset settings.json to empty object');
    } else {
      // Create empty settings.json for test
      fs.writeFileSync(this.settingsJsonPath, '{}');
      console.log('[TEST ENV] Created new empty settings.json');
    }
  }

  /**
   * Restore backed up apps.json and secrets.json
   */
  teardown(): void {
    // Restore apps.json backup if it exists
    if (fs.existsSync(this.backupPath)) {
      fs.copyFileSync(this.backupPath, this.appsJsonPath);
      fs.unlinkSync(this.backupPath);
      console.log('[TEST ENV] Restored original apps.json from backup');
    } else {
      // No backup means we created the file for tests, so remove it
      if (fs.existsSync(this.appsJsonPath)) {
        fs.unlinkSync(this.appsJsonPath);
        console.log('[TEST ENV] Removed test apps.json (no backup existed)');
      }
    }

    // Restore secrets.json backup if it exists
    if (fs.existsSync(this.secretsBackupPath)) {
      fs.copyFileSync(this.secretsBackupPath, this.secretsJsonPath);
      fs.unlinkSync(this.secretsBackupPath);
      console.log('[TEST ENV] Restored original secrets.json from backup');
    } else {
      // No backup means we created the file for tests, so remove it
      if (fs.existsSync(this.secretsJsonPath)) {
        fs.unlinkSync(this.secretsJsonPath);
        console.log('[TEST ENV] Removed test secrets.json (no backup existed)');
      }
    }

    // Restore settings.json backup if it exists
    if (fs.existsSync(this.settingsBackupPath)) {
      fs.copyFileSync(this.settingsBackupPath, this.settingsJsonPath);
      fs.unlinkSync(this.settingsBackupPath);
      console.log('[TEST ENV] Restored original settings.json from backup');
    } else {
      // No backup means we created the file for tests, so remove it
      if (fs.existsSync(this.settingsJsonPath)) {
        fs.unlinkSync(this.settingsJsonPath);
        console.log('[TEST ENV] Removed test settings.json (no backup existed)');
      }
    }
  }

  /**
   * Kill any running test processes
   */
  killTestProcesses(): void {
    try {
      const { execSync } = require('child_process');
      // Kill any python processes running from .uvdash/apps directories
      try {
        execSync('pkill -9 -f ".uvdash/apps.*python"', { stdio: 'ignore' });
        console.log('[TEST ENV] Killed remaining Python test processes');
      } catch (e) {
        // No processes found or already killed - this is fine
      }

      // Also kill any streamlit processes
      try {
        execSync('pkill -9 -f "streamlit.*app.py"', { stdio: 'ignore' });
        console.log('[TEST ENV] Killed remaining Streamlit processes');
      } catch (e) {
        // No processes found or already killed - this is fine
      }
    } catch (error) {
      console.log('[TEST ENV] Error killing processes:', error);
    }
  }

  /**
   * Clean up test app installations
   */
  cleanupInstallations(): void {
    // First kill any running processes
    this.killTestProcesses();

    // Then remove test app installation directories from ~/.uvdash/apps
    const appsDir = path.join(this.uvdashDir, 'apps');
    if (!fs.existsSync(appsDir)) {
      return;
    }

    // Read all subdirectories in apps/
    const appDirs = fs.readdirSync(appsDir);

    for (const dirName of appDirs) {
      const dirPath = path.join(appsDir, dirName);
      if (!fs.statSync(dirPath).isDirectory()) {
        continue;
      }

      // Check if this is a test app by reading pyproject.toml
      const pyprojectPath = path.join(dirPath, 'pyproject.toml');
      if (fs.existsSync(pyprojectPath)) {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        // Remove if it's a known test app
        if (content.includes('name = "flask-test-app"') ||
            content.includes('name = "streamlit-test-app"')) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`[TEST ENV] Removed test installation: ${dirPath}`);
        }
      }
    }
  }
}
