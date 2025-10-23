const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const executablePath = path.join(appPath, 'Contents', 'MacOS', context.packager.appInfo.productFilename);
  
  console.log('Removing adhoc code signature from:', executablePath);
  
  try {
    execSync(`codesign --remove-signature "${executablePath}"`, { stdio: 'inherit' });
    execSync(`codesign --remove-signature "${appPath}"`, { stdio: 'inherit' });
    console.log('Successfully removed code signatures');
  } catch (error) {
    console.warn('Failed to remove signature (may not be signed):', error.message);
  }
};
