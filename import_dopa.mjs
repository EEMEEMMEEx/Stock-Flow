import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple CSV parser that handles quotes
function parseCSV(text) {
    let result = [];
    let row = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        
        if (char === '"') {
            if (inQuotes && text[i+1] === '"') {
                currentValue += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentValue);
            currentValue = '';
        } else if (char === '\n' && !inQuotes) {
            row.push(currentValue);
            result.push(row);
            row = [];
            currentValue = '';
        } else if (char === '\r') {
            // ignore \r
        } else {
            currentValue += char;
        }
    }
    
    if (currentValue || row.length > 0) {
        row.push(currentValue);
        result.push(row);
    }
    
    return result;
}

const csvPath = '2.บัญชีรายการอุปกรณ์โครงการDOPA คลัง Forth_10.12.csv';
const csvContent = fs.readFileSync(path.join(__dirname, csvPath), 'utf8');
const rows = parseCSV(csvContent);

let sql = `
-- =================================================================
-- AUTO-GENERATED IMPORT SCRIPT FOR DOPA PROJECT
-- =================================================================

-- 1. Create the Project
DO $$
DECLARE
    v_project_id UUID;
    v_item_id UUID;
BEGIN
    -- Create Project
    INSERT INTO public.projects (name, description, location)
    VALUES ('DOPA (USO SHF)', 'ID คือ 25310-9999', 'คลัง Forth')
    RETURNING id INTO v_project_id;
    
`;

// Start reading data from row 4 (index 3)
for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 7) continue;

    const rawName = row[1]?.trim();
    if (!rawName) continue; // Skip empty rows

    // Clean up name
    const itemName = rawName.replace(/'/g, "''"); // escape single quotes for SQL
    let brandModel = row[2]?.trim().replace(/'/g, "''");
    if (brandModel === '-') brandModel = '';
    
    let note = row[7]?.trim().replace(/'/g, "''") || '';
    if (note === '-') note = '';

    // The remaining quantity is in column 6
    const remainingRaw = row[6]?.trim().replace(/,/g, '');
    const quantity = parseInt(remainingRaw);

    let description = brandModel;
    if (note) {
        description += description ? ` | หมายเหตุ: ${note}` : `หมายเหตุ: ${note}`;
    }

    sql += `
    -- Item: ${itemName}
    INSERT INTO public.items (name, description, unit)
    VALUES ('${itemName}', '${description}', 'ชิ้น')
    RETURNING id INTO v_item_id;
    `;

    if (!isNaN(quantity) && quantity > 0) {
        sql += `
    INSERT INTO public.stock_entries (project_id, item_id, quantity, notes)
    VALUES (v_project_id, v_item_id, ${quantity}, 'ยอดยกมาจากการ Import CSV');
    `;
    }
}

sql += `
END $$;
`;

fs.writeFileSync(path.join(__dirname, 'import_dopa.sql'), sql, 'utf8');
console.log('สร้างไฟล์ import_dopa.sql สำเร็จเรียบร้อยแล้ว!');
