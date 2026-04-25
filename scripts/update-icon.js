const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceImage = path.join(__dirname, '..', 'public', 'BlueVibePoster.png');
const androidResDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const iconSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function generateIcons() {
  console.log('Generating app icons from BlueVibePoster.png...');

  for (const [dir, size] of Object.entries(iconSizes)) {
    const targetDir = path.join(androidResDir, dir);
    
    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Generate ic_launcher.png
    await sharp(sourceImage)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(path.join(targetDir, 'ic_launcher.png'));

    // Generate ic_launcher_round.png (same as ic_launcher for now)
    await sharp(sourceImage)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_round.png'));

    // Generate ic_launcher_foreground.png
    await sharp(sourceImage)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));

    console.log(`Generated icons for ${dir} (${size}x${size})`);
  }

  console.log('All app icons generated successfully!');
}

generateIcons().catch(console.error);