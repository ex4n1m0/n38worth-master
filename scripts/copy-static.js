const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', '.next', 'server', 'app');
const targetDir = path.join(__dirname, '..', 'out');

// Create out directory
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy static files
const staticSource = path.join(__dirname, '..', '.next', 'static');
const staticTarget = path.join(targetDir, '_next', 'static');

if (fs.existsSync(staticSource)) {
  fs.cpSync(staticSource, staticTarget, { recursive: true });
  console.log('Copied static files');
}

// Copy public files
const publicSource = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicSource)) {
  fs.cpSync(publicSource, targetDir, { recursive: true });
  console.log('Copied public files');
}

// Function to copy HTML files recursively
function copyHtmlFiles(source, target) {
  if (!fs.existsSync(source)) return;
  
  const items = fs.readdirSync(source);
  
  items.forEach(item => {
    const sourcePath = path.join(source, item);
    const targetPath = path.join(target, item);
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      // Skip API routes and special directories
      if (item === 'api' || item.startsWith('_')) return;
      
      // Create directory and copy HTML files
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      copyHtmlFiles(sourcePath, targetPath);
    } else if (item.endsWith('.html')) {
      // Copy HTML file
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`Copied: ${item}`);
    }
  });
}

// Copy HTML files from .next/server/app
copyHtmlFiles(sourceDir, targetDir);

// Ensure index.html exists at root
const indexSource = path.join(sourceDir, 'index.html');
const indexTarget = path.join(targetDir, 'index.html');
if (fs.existsSync(indexSource) && !fs.existsSync(indexTarget)) {
  fs.copyFileSync(indexSource, indexTarget);
  console.log('Copied root index.html');
}

console.log('Static export completed!');