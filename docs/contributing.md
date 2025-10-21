# Contributing Guide

Thank you for your interest in contributing to UV Dash! This guide will help you get started with development.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

## Development Setup

### Prerequisites

- **Node.js**: 20.x or later
- **Yarn**: 1.22.x or later
- **Git**: For version control
- **UV**: For testing Python app installation

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/hirune924/uv-dash.git
cd uv-dash

# Install dependencies
yarn install

# Verify installation
yarn --version
node --version
```

### Development Commands

```bash
# Start development server with hot reload
yarn dev

# Build the application
yarn build

# Package for current platform
yarn package

# Run tests
yarn test

# Run specific test suites
yarn test:e2e          # End-to-end tests
yarn test:workflow     # Workflow tests
yarn test:fixtures     # Fixture tests
```

### Development Mode

When running `yarn dev`:
- Main process auto-reloads on changes to `src/main/**`
- Renderer process has hot module replacement (HMR) for `src/renderer/**`
- Changes to `src/shared/**` require manual restart

## Project Structure

```
uv-dash/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts          # Entry point
│   │   ├── apps/             # App management
│   │   │   ├── installer.ts  # Install from GitHub/ZIP/local
│   │   │   ├── runner.ts     # Run and monitor apps
│   │   │   └── process-monitor.ts  # CPU/memory monitoring
│   │   ├── secrets/          # Secret management
│   │   │   └── manager.ts    # Encrypted storage
│   │   ├── system/           # System utilities
│   │   │   └── git-checker.ts
│   │   └── uv/               # UV package manager integration
│   │       └── manager.ts
│   ├── renderer/             # React frontend
│   │   ├── App.tsx          # Root component
│   │   ├── components/      # React components
│   │   │   ├── AppsView.tsx
│   │   │   ├── InstallModal.tsx
│   │   │   ├── LogsView.tsx
│   │   │   └── SettingsView.tsx
│   │   ├── i18n/            # Internationalization
│   │   │   ├── en.ts        # English translations
│   │   │   └── ja.ts        # Japanese translations
│   │   └── styles/          # CSS/Tailwind
│   ├── shared/              # Shared types and constants
│   │   └── types.ts
│   └── preload.ts           # Preload script (IPC bridge)
├── tests/                   # Playwright E2E tests
│   ├── app.spec.ts
│   ├── fixtures-workflow.spec.ts
│   ├── error-handling.spec.ts
│   └── helpers/
│       └── test-env.ts
├── test-fixtures/           # Test data
│   └── flask-test-app/
├── docs/                    # Documentation
├── assets/                  # Screenshots and media
├── logo/                    # App logo/icon
└── dist/                    # Build output (gitignored)
```

### Key Files

- **`src/main/index.ts`**: Electron main process entry point, IPC handlers
- **`src/main/preload.ts`**: Preload script exposing safe APIs to renderer
- **`src/renderer/App.tsx`**: React app root component
- **`src/shared/types.ts`**: TypeScript types shared between main and renderer
- **`electron-builder.yml`**: Electron Builder configuration for packaging
- **`playwright.config.ts`**: Playwright test configuration
- **`tsconfig.json`**: TypeScript configuration

## Development Workflow

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Follow the existing code style
   - Add tests for new features
   - Update documentation if needed

3. **Test your changes**:
   ```bash
   yarn dev        # Manual testing
   yarn test       # Automated tests
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Add: Brief description of changes"
   ```

### Commit Message Convention

Use conventional commit format:

- **Add**: New feature or functionality
- **Fix**: Bug fix
- **Update**: Improvements to existing features
- **Refactor**: Code restructuring without behavior change
- **Docs**: Documentation changes
- **Test**: Adding or updating tests
- **Chore**: Maintenance tasks

**Examples**:
```
Add: Support for Python 3.13
Fix: Port detection for Django apps
Update: Improve error messages in installer
Docs: Add configuration examples for Gradio
Test: Add E2E tests for ZIP installation
```

## Testing

### Test Structure

UV Dash uses Playwright for end-to-end testing:

```typescript
// tests/app.spec.ts
test.describe.serial('App Lifecycle', () => {
  test.beforeAll(async () => {
    // Setup: Launch Electron app
  });

  test('should start the app', async () => {
    // Test implementation
  });

  test.afterAll(async () => {
    // Cleanup: Close app, delete test data
  });
});
```

### Running Tests

```bash
# Run all tests
yarn test

# Run tests with UI (for debugging)
yarn test --ui

# Run specific test file
NODE_ENV=test yarn playwright test tests/app.spec.ts

# Run in headed mode (see the app)
NODE_ENV=test yarn playwright test --headed
```

### Writing Tests

**Good test characteristics**:
- **Serial execution**: Use `test.describe.serial()` for tests that modify state
- **Proper cleanup**: Always clean up test data in `afterAll`
- **Cross-platform paths**: Use `path.join()` for file paths
- **Timeouts**: Use appropriate waits for async operations
- **Screenshots**: Take screenshots for debugging on failure

**Example**:
```typescript
test('should install app from local folder', async () => {
  // Click New App button
  const newAppButton = page.locator('button').filter({ hasText: /new app/i });
  await newAppButton.click();
  await page.waitForTimeout(1000);

  // Fill in path (cross-platform)
  const pathInput = page.locator('input[placeholder="/path/to/project"]');
  await pathInput.fill(path.join(__dirname, '../test-fixtures/flask-test-app'));

  // Click Install
  const installButton = page.locator('button:has-text("Install")');
  await installButton.click();

  // Wait for Ready status
  await page.locator('text=Ready').first().waitFor({ timeout: 30000 });

  // Verify
  const bodyText = await page.textContent('body');
  expect(bodyText).toContain('flask-test-app');
});
```

### Test Fixtures

Place test apps in `test-fixtures/`:

```
test-fixtures/
└── flask-test-app/
    ├── pyproject.toml
    ├── app.py
    └── requirements.txt
```

### CI/CD Testing

Tests run automatically on GitHub Actions for:
- **macOS** (latest)
- **Windows** (latest)
- **Linux** (Ubuntu latest)

See `.github/workflows/test.yml` for configuration.

## Code Style

### TypeScript

- **Use TypeScript**: All code should be properly typed
- **No `any`**: Avoid using `any` type; use `unknown` or proper types
- **Interfaces over types**: Prefer `interface` for object shapes
- **Async/await**: Use `async/await` instead of `.then()` for promises

**Example**:
```typescript
// Good
interface AppInfo {
  id: string;
  name: string;
  status: AppStatus;
}

async function installApp(request: InstallRequest): Promise<AppInfo> {
  const result = await installer.install(request);
  return result;
}

// Bad
function installApp(request: any) {
  return installer.install(request).then((result: any) => {
    return result;
  });
}
```

### React

- **Functional components**: Use function components with hooks
- **TypeScript types**: Type all props and state
- **Descriptive names**: Use clear, descriptive variable names

**Example**:
```typescript
interface AppCardProps {
  app: AppInfo;
  onRun: (appId: string) => void;
  onStop: (appId: string) => void;
}

const AppCard: React.FC<AppCardProps> = ({ app, onRun, onStop }) => {
  return (
    <div className="app-card">
      <h3>{app.name}</h3>
      <button onClick={() => onRun(app.id)}>Run</button>
    </div>
  );
};
```

### File Organization

- **One component per file**: Each React component in its own file
- **Colocate related code**: Keep related utilities near their usage
- **Shared code in shared/**: Types and constants used by both main and renderer

### Formatting

The project uses standard TypeScript/React formatting:

- **Indentation**: 2 spaces
- **Semicolons**: Yes
- **Quotes**: Single quotes for strings
- **Line length**: 100 characters (soft limit)

## Pull Request Process

### Before Submitting

1. **Test thoroughly**:
   ```bash
   yarn test
   yarn build
   yarn package
   ```

2. **Update documentation**: If you added features, update relevant docs

3. **Check for errors**: Ensure no TypeScript errors:
   ```bash
   yarn build
   ```

### Submitting a PR

1. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request** on GitHub:
   - Use a descriptive title
   - Explain what changes you made and why
   - Reference any related issues

3. **PR Template**:
   ```markdown
   ## Description
   Brief description of changes

   ## Motivation
   Why is this change needed?

   ## Changes Made
   - Added X
   - Fixed Y
   - Updated Z

   ## Testing
   - [ ] Tested on macOS
   - [ ] Tested on Windows
   - [ ] Tested on Linux
   - [ ] Added/updated tests
   - [ ] Updated documentation

   ## Screenshots (if applicable)
   ```

4. **Respond to feedback**: Address reviewer comments

### Review Process

- Maintainers will review your PR within a few days
- You may be asked to make changes
- Once approved, your PR will be merged

## Reporting Issues

### Before Reporting

1. **Search existing issues**: Check if the issue already exists
2. **Try latest version**: Ensure you're using the latest release
3. **Minimal reproduction**: Try to reproduce with minimal steps

### Issue Template

```markdown
## Description
Clear description of the issue

## Steps to Reproduce
1. Go to...
2. Click on...
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- UV Dash Version: x.x.x
- OS: macOS 14.0 / Windows 11 / Ubuntu 22.04
- UV Version: x.x.x
- Node Version: x.x.x

## Logs/Screenshots
Attach relevant logs or screenshots
```

### Issue Types

- **Bug Report**: Something is broken
- **Feature Request**: Suggest a new feature
- **Question**: Need help or clarification
- **Documentation**: Docs are unclear or incorrect

## Additional Resources

- **[User Guide](user-guide.md)**: Learn how to use UV Dash
- **[Configuration Guide](configuration.md)**: App configuration details
- **[Building Guide](building.md)**: Build and packaging instructions
- **[Electron Docs](https://www.electronjs.org/docs)**: Electron documentation
- **[React Docs](https://react.dev/)**: React documentation
- **[Playwright Docs](https://playwright.dev/)**: Testing framework docs

## Getting Help

- **GitHub Discussions**: [Ask questions](https://github.com/hirune924/uv-dash/discussions)
- **GitHub Issues**: [Report bugs](https://github.com/hirune924/uv-dash/issues)

## License

By contributing to UV Dash, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to UV Dash! 🎉

[← Back to README](../README.md)
