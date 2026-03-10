const fs = require('fs');
const path = require('path');

function getFileStructure(dirPath, basePath = '', maxDepth = 10, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];
  
  const items = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip node_modules, .git, and other common ignored directories
      if (entry.name === 'node_modules' || 
          entry.name === '.git' || 
          entry.name === '.expo' ||
          entry.name === '.next' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name.startsWith('.')) {
        continue;
      }
      
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        const children = getFileStructure(fullPath, relativePath, maxDepth, currentDepth + 1);
        items.push({
          name: entry.name,
          type: 'folder',
          path: relativePath,
          children: children
        });
      } else {
        const stats = fs.statSync(fullPath);
        const extension = path.extname(entry.name).slice(1);
        
        items.push({
          name: entry.name,
          type: extension || 'file',
          path: relativePath,
          size: formatBytes(stats.size)
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }
  
  return items.sort((a, b) => {
    // Folders first, then files
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileContent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (error) {
    throw new Error(`Error reading file: ${error.message}`);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'structure') {
    const rootPath = args[1] || '/home/user/app';
    const structure = getFileStructure(rootPath);
    console.log(JSON.stringify(structure, null, 2));
  } else if (command === 'file') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Error: File path is required');
      process.exit(1);
    }
    
    try {
      const content = getFileContent(filePath);
      console.log(JSON.stringify({ content, path: filePath }, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  } else {
    console.error('Usage: node get-structure.js [structure|file] [path]');
    process.exit(1);
  }
}

module.exports = { getFileStructure, getFileContent };