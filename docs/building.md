# Building and Packaging

This guide covers how to build and package UV Dash for different platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Building for Specific Platforms](#building-for-specific-platforms)
- [Cross-Platform Building](#cross-platform-building)
- [CI/CD with GitHub Actions](#cicd-with-github-actions)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### All Platforms

- **Node.js**: v20 or later
- **Yarn**: Latest version

### Additional Requirements by Platform

**macOS:**
- Xcode Command Line Tools
- For code signing: Apple Developer account

**Windows:**
- Windows 10 or later
- For code signing: Code signing certificate

**Linux:**
- Standard build tools (`build-essential` on Ubuntu/Debian)

---

## Quick Start

### 1. Install Dependencies

```bash
yarn install
```

### 2. Generate Icons

```bash
yarn build:icons
```

This generates platform-specific icons from `logo/logo.png`:
- `build/icons/icon.icns` (macOS)
- `build/icons/icon.ico` (Windows)
- `build/icons/*.png` (Linux)

### 3. Build for Current Platform

```bash
# Build source code
yarn build

# Package for current platform
yarn package
```

Output will be in the `release/` directory.

---

## Building for Specific Platforms

### macOS

```bash
yarn package:mac
```

**Outputs:**
- `release/UV Dash-{version}-arm64.dmg` (Apple Silicon)
- `release/UV Dash-{version}-arm64-mac.zip`
- `release/UV Dash-{version}-x64.dmg` (Intel, if configured)
- `release/UV Dash-{version}-x64-mac.zip`

**Current default:** arm64 only (Apple Silicon)

To build for both architectures, update `package.json`:
```json
"mac": {
  "target": [
    {
      "target": "dmg",
      "arch": ["x64", "arm64"]
    },
    {
      "target": "zip",
      "arch": ["x64", "arm64"]
    }
  ]
}
```

### Windows

```bash
yarn package:win
```

**Outputs:**
- `release/UV Dash Setup {version}.exe` (NSIS installer)
- `release/UV Dash-{version}-win.zip`

**Architectures:**
- Default: x64
- Can also target ia32 or arm64

To specify architecture:
```bash
electron-builder --win --x64
electron-builder --win --ia32
electron-builder --win --arm64
```

### Linux

```bash
yarn package:linux
```

**Outputs:**
- `release/UV Dash-{version}.AppImage` (Universal)
- `release/uv-dash_{version}_amd64.deb` (Debian/Ubuntu)

**Additional targets:**
You can add more targets in `package.json`:
```json
"linux": {
  "target": [
    "AppImage",
    "deb",
    "rpm",
    "snap",
    "tar.gz"
  ]
}
```

---

## Cross-Platform Building

electron-builder supports cross-platform building with limitations.

### From macOS

**Build Windows (unsigned):**
```bash
yarn package:win
```

**Build Linux:**
```bash
yarn package:linux
```

**Build all platforms:**
```bash
yarn package:all
```

### Limitations

❌ **Cannot do from macOS:**
- Sign Windows executables (requires Windows machine)
- Sign Linux packages with specific keys

⚠️ **Potential issues:**
- Native modules (`pidusage`, etc.) may fail to compile for other platforms
- Some platform-specific features may not work correctly

### Solution: Use CI/CD

For production releases, use GitHub Actions to build on native platforms (see below).

---

## CI/CD with GitHub Actions

### Setup

Create `.github/workflows/build.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: yarn install

      - name: Build icons
        run: yarn build:icons

      - name: Build application
        run: yarn build

      - name: Package for macOS
        run: yarn package:mac

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-build
          path: |
            release/*.dmg
            release/*.zip

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: yarn install

      - name: Build icons
        run: yarn build:icons

      - name: Build application
        run: yarn build

      - name: Package for Windows
        run: yarn package:win

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-build
          path: |
            release/*.exe
            release/*.zip

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: yarn install

      - name: Build icons
        run: yarn build:icons

      - name: Build application
        run: yarn build

      - name: Package for Linux
        run: yarn package:linux

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: |
            release/*.AppImage
            release/*.deb

  create-release:
    needs: [build-macos, build-windows, build-linux]
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/')
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            macos-build/*
            windows-build/*
            linux-build/*
          draft: true
          generate_release_notes: true
```

### Triggering a Build

**Method 1: Git Tag (Recommended)**
```bash
git tag v0.1.0
git push origin v0.1.0
```

**Method 2: Manual Trigger**
- Go to GitHub Actions tab
- Select "Build and Release" workflow
- Click "Run workflow"

### Release Process

1. Create and push a tag: `git tag v0.1.0 && git push origin v0.1.0`
2. GitHub Actions automatically builds for all platforms
3. Draft release is created with all artifacts
4. Review and publish the release

---

## Code Signing

### macOS Code Signing

**Requirements:**
- Apple Developer account ($99/year)
- Developer ID Application certificate

**Setup:**
```bash
# Import certificate to Keychain
# Then specify in package.json or environment variables
```

**In package.json:**
```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist"
}
```

**In GitHub Actions:**
```yaml
- name: Import Code-Signing Certificates
  uses: apple-actions/import-codesign-certs@v2
  with:
    p12-file-base64: ${{ secrets.MAC_CERTS }}
    p12-password: ${{ secrets.MAC_CERTS_PASSWORD }}
```

### Windows Code Signing

**Requirements:**
- Code signing certificate (from trusted CA)

**In package.json:**
```json
"win": {
  "certificateFile": "path/to/cert.pfx",
  "certificatePassword": "password"
}
```

**In GitHub Actions:**
```yaml
- name: Decode certificate
  run: |
    echo "${{ secrets.WINDOWS_CERTIFICATE }}" | base64 --decode > cert.pfx

- name: Package with signing
  env:
    CSC_LINK: cert.pfx
    CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
  run: yarn package:win
```

---

## Build Configuration

### electron-builder Configuration

All configuration is in `package.json` under the `"build"` key:

```json
{
  "build": {
    "appId": "com.uvdash.app",
    "productName": "UV Dash",
    "files": [
      "dist/**/*",
      "package.json"
    ],
    "directories": {
      "output": "release"
    },
    "mac": {
      "icon": "build/icons/icon.icns",
      "target": ["dmg", "zip"],
      "category": "public.app-category.developer-tools"
    },
    "win": {
      "icon": "build/icons/icon.ico",
      "target": ["nsis", "zip"]
    },
    "linux": {
      "icon": "build/icons/512x512.png",
      "target": ["AppImage", "deb"],
      "category": "Development"
    }
  }
}
```

### Customizing Installer

**Windows NSIS:**
```json
"win": {
  "target": {
    "target": "nsis",
    "arch": ["x64"]
  }
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true
}
```

**macOS DMG:**
```json
"dmg": {
  "contents": [
    {
      "x": 130,
      "y": 220
    },
    {
      "x": 410,
      "y": 220,
      "type": "link",
      "path": "/Applications"
    }
  ],
  "window": {
    "width": 540,
    "height": 380
  }
}
```

---

## Troubleshooting

### Issue: Native modules fail to build

**Error:**
```
Error: Module did not self-register
```

**Solution:**
Rebuild native modules for the target platform:
```bash
yarn add electron-rebuild -D
npx electron-rebuild
```

Or in GitHub Actions:
```yaml
- name: Rebuild native modules
  run: npx electron-rebuild
```

### Issue: Icon not showing

**Solution:**
1. Ensure icons are generated: `yarn build:icons`
2. Check icon paths in `package.json`
3. Verify icon files exist in `build/icons/`

### Issue: App not signed (macOS)

**Symptom:**
"App is damaged and can't be opened" on macOS

**Solution:**
Either sign the app or have users run:
```bash
xattr -cr "/Applications/UV Dash.app"
```

### Issue: Windows Defender blocks app

**Symptom:**
Windows SmartScreen warning

**Solution:**
- Sign the app with a valid certificate
- Submit app to Microsoft for reputation building
- Users can click "More info" → "Run anyway"

### Issue: File size too large

**Solution:**
1. Check what's being included:
```bash
npx electron-builder --dir
cd dist/mac-arm64/UV\ Dash.app/Contents/Resources/app.asar
npx asar extract app.asar extracted
```

2. Add exclusions in `package.json`:
```json
"files": [
  "dist/**/*",
  "package.json",
  "!**/*.map",
  "!node_modules/**/*",
  "!src/**/*"
]
```

---

## Development vs Production Builds

### Development (Unsigned)

```bash
yarn package
```

- Faster build
- No code signing
- For local testing only

### Production (Signed)

```bash
# With environment variables for signing
CSC_LINK=cert.p12 CSC_KEY_PASSWORD=pass yarn package
```

- Code signed
- Notarized (macOS)
- Ready for distribution

---

## Build Scripts Reference

```bash
# Build source code only
yarn build

# Generate icons from logo
yarn build:icons

# Package for current platform
yarn package

# Package for specific platforms
yarn package:mac
yarn package:win
yarn package:linux

# Package for all platforms (cross-build)
yarn package:all

# Clean build artifacts
yarn clean
```

---

## File Structure After Build

```
uv-dash/
├── dist/              # Compiled source code
│   ├── main/
│   ├── renderer/
│   └── locales/
├── release/           # Packaged applications
│   ├── UV Dash-0.1.0-arm64.dmg
│   ├── UV Dash-0.1.0-arm64-mac.zip
│   ├── UV Dash Setup 0.1.0.exe
│   ├── UV Dash-0.1.0-win.zip
│   ├── UV Dash-0.1.0.AppImage
│   └── uv-dash_0.1.0_amd64.deb
└── build/             # Build assets
    └── icons/
```

---

## Next Steps

- Set up code signing for your platform
- Configure CI/CD for automated releases
- Test on all target platforms
- Submit to app stores (optional)

---

## Additional Resources

- [electron-builder Documentation](https://www.electron.build/)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [GitHub Actions for Electron](https://www.electron.build/configuration/publish#githubpublish)
