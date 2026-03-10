const fs = require('fs');
const path = require('path');

function editFile(filePath, newContent) {
  try {
    // Ensure the file path is within the allowed directory
    const fullPath = path.resolve(filePath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    // Write the new content
    fs.writeFileSync(fullPath, newContent, 'utf8');
    
    return {
      success: true,
      message: `File ${filePath} updated successfully`,
      path: filePath
    };
  } catch (error) {
    throw new Error(`Error editing file: ${error.message}`);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'edit') {
    const filePath = args[1];
    const contentArg = args[2];

    if (!filePath) {
      console.error('Error: File path is required');
      process.exit(1);
    }

    // Content can be provided as argument or via a file path (if starts with @)
    let content = contentArg;

    if (!content) {
      console.error('Error: Content is required');
      process.exit(1);
    }

    try {
      // If content starts with @, treat it as a file path
      if (content.startsWith('@')) {
        const contentFilePath = content.substring(1);
        console.error(`Debug: Reading content from file: ${contentFilePath}`);
        content = fs.readFileSync(contentFilePath, 'utf8');
        console.error(`Debug: Read ${content.length} bytes from file`);
      }

      // Decode base64 content if it's encoded
      let decodedContent = content;
      try {
        decodedContent = Buffer.from(content, 'base64').toString('utf8');
        console.error(`Debug: Decoded base64 content, final size: ${decodedContent.length} bytes`);
      } catch (e) {
        // If it's not base64, use as is
        decodedContent = content;
        console.error(`Debug: Using content as-is, size: ${decodedContent.length} bytes`);
      }

      console.error(`Debug: About to edit file: ${filePath}`);
      const result = editFile(filePath, decodedContent);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      process.exit(1);
    }
  } else {
    console.error('Usage: node edit-file.js edit [filePath] [content|@contentFile]');
    process.exit(1);
  }
}

module.exports = { editFile };