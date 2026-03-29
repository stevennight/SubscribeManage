import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const metadataPath = path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free/metadata/icon-families.json');
const outputPath = path.join(__dirname, '../src/assets/fa-icons.json');
const zhPath = path.join(__dirname, '../src/assets/fa-icons-zh.json');

const data = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
let zhData = {};
if (fs.existsSync(zhPath)) {
    zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
}

const icons = [];

for (const [key, value] of Object.entries(data)) {
    const free = value.familyStylesByLicense?.free || [];
    const terms = value.search?.terms || [];
    
    let zhKeyword = "";
    if (value.label && zhData[value.label]) {
        zhKeyword = zhData[value.label] + ",";
    }
    const searchString = (zhKeyword + terms.slice(0, 5).join(',')).toLowerCase();

    for (const item of free) {
        const styleMap = {
            'solid': 'fas',
            'regular': 'far',
            'brands': 'fab'
        };
        const prefix = styleMap[item.style];
        if (prefix) {
            icons.push({
                c: `${prefix} fa-${key}`,
                l: value.label || key,
                s: searchString
            });
        }
    }
}

// Deduplicate classes
const unique = [];
const seen = new Set();
for (const i of icons) {
    if (!seen.has(i.c)) {
        seen.add(i.c);
        unique.push(i);
    }
}

fs.writeFileSync(outputPath, JSON.stringify(unique));
console.log('Generated ' + unique.length + ' icons!');
