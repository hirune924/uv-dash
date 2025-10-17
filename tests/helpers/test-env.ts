import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class TestEnvironment {
  private uvdashDir: string;
  private appsJsonPath: string;
  private backupPath: string;
  private secretsJsonPath: string;
  private secretsBackupPath: string;

  constructor() {
    this.uvdashDir = path.join(os.homedir(), '.uvdash');
    this.appsJsonPath = path.join(this.uvdashDir, 'apps.json');
    this.backupPath = path.join(this.uvdashDir, 'apps.json.test-backup');
    this.secretsJsonPath = path.join(this.uvdashDir, 'secrets.json');
    this.secretsBackupPath = path.join(this.uvdashDir, 'secrets.json.test-backup');
  }

  /**
   * Backup existing apps.json and secrets.json
   */
  setup(): void {
    // Ensure directory exists
    if (!fs.existsSync(this.uvdashDir)) {
      fs.mkdirSync(this.uvdashDir, { recursive: true });
    }

    // Set default Python version to 3.12 for UV to avoid using unstable versions like 3.14
    try {
      const { execSync } = require('child_process');
      execSync('uv python pin 3.12', { stdio: 'inherit' });
      console.log('[TEST ENV] Set default Python version to 3.12 via uv python pin');
    } catch (error) {
      console.log('[TEST ENV] Warning: Failed to set Python version:', error);
    }

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

    // Then remove test app installation directories from ~/.uvdash
    const testAppDirs = [
      path.join(this.uvdashDir, 'flask-test-app'),
      path.join(this.uvdashDir, 'streamlit-test-app'),
    ];

    for (const dir of testAppDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[TEST ENV] Removed test installation: ${dir}`);
      }
    }
  }
}
