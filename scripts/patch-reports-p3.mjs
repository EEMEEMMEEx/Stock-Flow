import fs from 'node:fs';

const reportsPath = 'src/pages/Reports.jsx';
let content = fs.readFileSync(reportsPath, 'utf8');

const target = `    } catch (error) {
      console.error(error);
      toast.error(t('reports.export.excelFailed'));
    }
  };`;

const replacement = `    } catch (error) {
      console.error(error);
      toast.error(t('reports.export.excelFailed'));
    } finally {
      setExcelLoading(false);
    }
  };`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(reportsPath, content, 'utf8');
  console.log('Successfully patched Reports.jsx with finally block');
} else {
  // Try CRLF
  const targetCRLF = target.replace(/\n/g, '\r\n');
  const replacementCRLF = replacement.replace(/\n/g, '\r\n');
  if (content.includes(targetCRLF)) {
    content = content.replace(targetCRLF, replacementCRLF);
    fs.writeFileSync(reportsPath, content, 'utf8');
    console.log('Successfully patched Reports.jsx (CRLF) with finally block');
  } else {
    console.error('Target not found in Reports.jsx');
    process.exit(1);
  }
}
