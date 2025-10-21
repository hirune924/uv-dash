const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Create dist directory
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Build main process
esbuild.build({
  entryPoints: ['src/main/index.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: 'dist/main',
  external: ['electron'],
  sourcemap: true,
}).then(() => {
  console.log('✓ Main process built');
}).catch(() => process.exit(1));

// Build renderer process
esbuild.build({
  entryPoints: ['src/renderer/index.tsx'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  outfile: 'dist/renderer/index.js',
  sourcemap: true,
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
}).then(() => {
  console.log('✓ Renderer process built');

  // Copy HTML
  fs.copyFileSync(
    path.join(__dirname, '../src/renderer/index.html'),
    path.join(__dirname, '../dist/renderer/index.html')
  );

  // Build Tailwind CSS (via PostCSS)
  execSync('npx postcss ./src/renderer/styles.css -o ./dist/renderer/styles.css', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });

  // Copy locales directory
  const localesSrc = path.join(__dirname, '../src/locales');
  const localesDest = path.join(__dirname, '../dist/locales');

  // Remove existing locales directory if it exists
  if (fs.existsSync(localesDest)) {
    fs.rmSync(localesDest, { recursive: true });
  }

  // Copy locales recursively
  fs.cpSync(localesSrc, localesDest, { recursive: true });

  console.log('✓ HTML and CSS processed');
}).catch(() => process.exit(1));
