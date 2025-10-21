# UV Dash

<div align="center">
  <img src="logo/logo.png" alt="UV Dash Logo" width="200"/>
  <p><strong>A desktop application for easily managing and running Python applications</strong></p>

  [![Test](https://github.com/hirune924/uv-dash/actions/workflows/test.yml/badge.svg)](https://github.com/hirune924/uv-dash/actions/workflows/test.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

  <p><a href="README.ja.md">日本語</a> | <a href="#documentation">Documentation</a></p>
</div>

---

## Overview

UV Dash is a desktop application that makes Python development accessible to everyone. Install and run [uv](https://github.com/astral-sh/uv)-managed Python applications with just a few clicks—no terminal or command-line knowledge required.

https://github.com/user-attachments/assets/da3856a4-d110-4fae-81df-f32976570745

### Why UV Dash?

- **Zero Command Line** - Complete Python app management through an intuitive GUI
- **Universal Compatibility** - Works with Streamlit, FastAPI, Flask, Gradio, Django, and more
- **Production Ready** - Built-in monitoring, logging, and secure secret management

## Key Features

- 🚀 **Easy Installation** - Install from GitHub, ZIP files, or local folders with drag & drop
- ⚡ **One-Click Launch** - Start and stop apps instantly with visual status indicators
- 📊 **Real-time Monitoring** - Live CPU and memory usage graphs for each application
- 📝 **Integrated Logs** - View stdout/stderr output with syntax highlighting
- 🔐 **Secure Secrets** - Encrypted storage for API keys and sensitive data
- 🌐 **Web App Support** - Auto-detect ports and open web apps in your browser
- 🌍 **Multi-language** - Full English and Japanese interface support

## Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="assets/screenshot-apps-view.png" alt="Apps View"/>
      <p align="center"><em>Main application view</em></p>
    </td>
    <td width="50%">
      <img src="assets/screenshot-logs-view.png" alt="Logs View"/>
      <p align="center"><em>Real-time log viewer</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="assets/screenshot-install-modal.png" alt="Install Modal"/>
      <p align="center"><em>Install from GitHub/ZIP/Local</em></p>
    </td>
    <td width="50%">
      <img src="assets/screenshot-setting.png" alt="Settings"/>
      <p align="center"><em>Secure secrets management</em></p>
    </td>
  </tr>
</table>

## Quick Start

### Installation

Download the latest version for your platform:

| Platform | Download |
|----------|----------|
| **macOS** | [UV-Dash-x.x.x-arm64.dmg](https://github.com/hirune924/uv-dash/releases) |
| **Windows** | [UV-Dash-Setup-x.x.x.exe](https://github.com/hirune924/uv-dash/releases) |
| **Linux** | [UV-Dash-x.x.x.AppImage](https://github.com/hirune924/uv-dash/releases) |

**Requirements**: macOS 13+ / Windows 10+ / Ubuntu LTS

### Usage

1. **Launch UV Dash** - The app will check if `uv` is installed and offer to install it if needed
2. **Click "New App"** - Add an application from GitHub, ZIP file, or local folder
3. **Click "Run"** - Start your application with one click
4. **View in Browser** - Web apps automatically open when ready

That's it! For detailed instructions, see the [User Guide](docs/user-guide.md).

## Documentation

- **[User Guide](docs/user-guide.md)** - Complete walkthrough of all features
- **[Configuration Guide](docs/configuration.md)** - App configuration and framework support
- **[Advanced Usage](docs/advanced-usage.md)** - Multi-process apps, custom scripts, pre-hooks
- **[Building Guide](docs/building.md)** - Build from source and cross-platform packaging
- **[Contributing](docs/contributing.md)** - Development setup and contribution guidelines

## Supported Python Frameworks

UV Dash automatically detects and supports:

- **Streamlit** - Data applications and dashboards
- **FastAPI / Uvicorn** - Modern web APIs
- **Flask** - Traditional web applications
- **Gradio** - Machine learning demos and interfaces
- **Django** - Full-stack web framework
- **Custom CLI apps** - Any Python application with a run command

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS 4
- **Desktop**: Electron 38
- **Python**: uv package manager
- **Security**: Electron safeStorage API
- **i18n**: i18next + react-i18next

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please see the [Contributing Guide](docs/contributing.md) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/hirune924/uv-dash/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hirune924/uv-dash/discussions)

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/hirune924">hirune924</a>
</div>
