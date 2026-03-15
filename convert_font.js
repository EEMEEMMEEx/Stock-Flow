import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.join(__dirname, 'src', 'assets', 'Prompt-Regular.ttf');
const outputPath = path.join(__dirname, 'src', 'assets', 'Prompt-Regular.ttf.base64');

try {
    const fontBuffer = fs.readFileSync(fontPath);
    const fontBase64 = fontBuffer.toString('base64');
    fs.writeFileSync(outputPath, fontBase64);
    console.log('Font converted to base64 successfully!');
} catch (error) {
    console.error('Error converting font:', error);
    process.exit(1);
}
