import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Import only the runLighthouseAudit function
import { runLighthouseAudit } from './lighthouse-supabase.js';

// Define report directories
const REPORTS_DIR = path.join(process.cwd(), 'reports');
const HTML_REPORTS_DIR = path.join(REPORTS_DIR, 'html');
const JSON_REPORTS_DIR = path.join(REPORTS_DIR, 'json');

// Ensure the local reports directories exist
[REPORTS_DIR, HTML_REPORTS_DIR, JSON_REPORTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

async function runSingleAudit(url) {
    const id = uuidv4();
    try {
        await runLighthouseAudit(id, url);
        console.log(`Audit completed for ${url}`);
    } catch (error) {
        console.error(`Error running audit for ${url}:`, error);
    }
}

// Run the single audit
const testUrl = 'https://ehrms.wbpolice.gov.in';
runSingleAudit(testUrl).catch(console.error);
