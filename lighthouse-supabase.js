import 'dotenv/config'; // Load environment variables
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { performance } from 'perf_hooks';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

// Add this at the beginning of your script
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Add this function to retry failed operations
async function retry(operation, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      log(`Attempt ${attempt} failed, retrying...`, 'warn');
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Define report directories
const REPORTS_DIR = path.join(process.cwd(), 'reports');
const HTML_REPORTS_DIR = path.join(REPORTS_DIR, 'html');
const JSON_REPORTS_DIR = path.join(REPORTS_DIR, 'json');
const R2_REPORTS_DIR = 'lighthouse-reports';

// Ensure the local reports directories exist
[REPORTS_DIR, HTML_REPORTS_DIR, JSON_REPORTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Update these lines to use the correct Supabase URL and key
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file');
}

// Initialize Supabase client with the service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// R2 configuration
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_ACCOUNT_ID) {
    throw new Error('R2 credentials must be set in .env file');
}

const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

const limit = pLimit(5); // Limit concurrent processes

// Add a simple logging function
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    console[type](`[${timestamp}] ${message}`);
}

// Upload file to R2 storage
async function uploadToR2(filePath, storagePath) {
    try {
        const fileContent = fs.readFileSync(filePath);
        const fullStoragePath = `${R2_REPORTS_DIR}/${storagePath}`;
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: fullStoragePath,
            Body: fileContent,
            ContentType: storagePath.endsWith('.json') ? 'application/json' : 'text/html',
        });

        await r2Client.send(command);
        const publicURL = `https://${R2_BUCKET_NAME}.r2.cloudflarestorage.com/${fullStoragePath}`;
        log(`Successfully uploaded ${filePath} to R2`);
        return publicURL;
    } catch (error) {
        log(`Error uploading ${filePath} to R2: ${error.message}`, 'error');
        throw error;
    }
}

// Update the status of the audit in `websites_report_tracking`
async function updateStatus(id, status, jsonPath = null, htmlPath = null, errorMsg = null, timeTaken = null) {
    try {
        const { error } = await supabase
            .from('websites_report_tracking')
            .update({
                status,
                json_path: jsonPath,
                html_path: htmlPath,
                error_message: errorMsg,
                time_taken: timeTaken,
                updated_at: new Date(),
            })
            .eq('id', id);

        if (error) throw new Error(`Failed to update status for ${id}: ${error.message}`);
        log(`Updated status for ${id} to ${status}`);
    } catch (error) {
        log(`Error updating status for ${id}: ${error.message}`, 'error');
    }
}

// Run Lighthouse audit and log the result
async function runLighthouseAudit(id, url) {
    log(`Starting audit for ${url}`);
    await updateStatus(id, 'in-progress');

    const startTime = performance.now();

    try {
        const reportPath = path.join(REPORTS_DIR, id);
        
        log(`Running Lighthouse for ${url}`);
        execSync(`lighthouse ${url} --chrome-flags="--headless --no-sandbox --disable-gpu --ignore-certificate-errors" --output json --output html --output-path ${reportPath} --quiet`, { stdio: 'inherit' });

        const jsonFilePath = `${reportPath}.report.json`;
        const htmlFilePath = `${reportPath}.report.html`;

        log(`Uploading reports for ${url}`);
        const jsonUrl = await retry(() => uploadToR2(jsonFilePath, `json/${id}.report.json`));
        const htmlUrl = await retry(() => uploadToR2(htmlFilePath, `html/${id}.report.html`));

        // Clean up local files after upload
        fs.unlinkSync(jsonFilePath);
        fs.unlinkSync(htmlFilePath);

        const endTime = performance.now();
        const timeTaken = ((endTime - startTime) / 1000).toFixed(2) + ' seconds';

        await updateStatus(id, 'completed', jsonUrl, htmlUrl, null, timeTaken);
        log(`Audit completed for ${url} in ${timeTaken}`);
    } catch (error) {
        const endTime = performance.now();
        const timeTaken = ((endTime - startTime) / 1000).toFixed(2) + ' seconds';

        log(`Failed to audit ${url}: ${error.message}`, 'error');
        await updateStatus(id, 'failed', null, null, error.message, timeTaken);
    }
}

// Update the syncLinksFromGovInWebsiteDir function
async function syncLinksFromGovInWebsiteDir() {
    try {
        log('Fetching all links from gov_in_website_dir');
        let allLinks = [];
        let page = 0;
        const pageSize = 1000;
        
        // Fetch all links in batches
        while (true) {
            const { data: links, error, count } = await supabase
                .from('gov_in_website_dir')
                .select('link')
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw new Error(`Error fetching links: ${error.message}`);
            
            if (!links || links.length === 0) break;
            
            allLinks = allLinks.concat(links);
            page++;
            
            if (links.length < pageSize) break;
        }

        log(`Found ${allLinks.length} links in gov_in_website_dir.`);

        // Get all existing URLs in websites_report_tracking
        const { data: existingUrls, error: existingUrlsError } = await supabase
            .from('websites_report_tracking')
            .select('id, url, status');

        if (existingUrlsError) throw new Error(`Error fetching existing URLs: ${existingUrlsError.message}`);

        const existingUrlMap = new Map(existingUrls.map(item => [item.url, item]));

        // Prepare links to insert and update
        const linksToInsert = [];
        const idsToUpdate = [];

        allLinks.forEach(link => {
            const existingEntry = existingUrlMap.get(link.link);
            if (!existingEntry) {
                linksToInsert.push({ url: link.link, status: 'pending' });
            } else if (['failed', 'in-progress'].includes(existingEntry.status)) {
                idsToUpdate.push(existingEntry.id);
            }
        });

        // Insert new links in batches
        const BATCH_SIZE = 1000;
        for (let i = 0; i < linksToInsert.length; i += BATCH_SIZE) {
            const batch = linksToInsert.slice(i, i + BATCH_SIZE);
            const { error: insertError } = await supabase
                .from('websites_report_tracking')
                .insert(batch);

            if (insertError) {
                log(`Error inserting batch: ${insertError.message}`, 'error');
            } else {
                log(`Inserted batch of ${batch.length} links`);
            }
        }

        // Update status of failed and in-progress links to pending
        if (idsToUpdate.length > 0) {
            const { error: updateError } = await supabase
                .from('websites_report_tracking')
                .update({ status: 'pending' })
                .in('id', idsToUpdate);

            if (updateError) {
                log(`Error updating statuses: ${updateError.message}`, 'error');
            } else {
                log(`Updated status to pending for ${idsToUpdate.length} links`);
            }
        }

        log(`Sync complete. Inserted ${linksToInsert.length} new links and updated ${idsToUpdate.length} existing links.`);
    } catch (error) {
        log(`Error in syncLinksFromGovInWebsiteDir: ${error.message}`, 'error');
    }
}

// Update the processWebsites function
async function processWebsites() {
    try {
        log('Fetching pending websites from websites_report_tracking');
        const { data, error } = await supabase
            .from('websites_report_tracking')
            .select('id, url')
            .eq('status', 'pending');

        if (error) throw new Error(`Error fetching pending websites: ${error.message}`);

        if (!data || data.length === 0) {
            log('No pending websites found. All websites might have been processed or none are in pending status.', 'warn');
            return;
        }

        log(`Found ${data.length} pending websites to process.`);

        const tasks = data.map(({ id, url }) => limit(() => runLighthouseAudit(id, url)));
        await Promise.all(tasks);
        log('All audits completed!');
    } catch (error) {
        log(`Error in processWebsites: ${error.message}`, 'error');
    }
}

// Add this function to log table data
async function logTableData(tableName, limit = 5) {
    try {
        const { data, error, count } = await supabase
            .from(tableName)
            .select('*', { count: 'exact' })
            .limit(limit);

        if (error) throw new Error(`Error fetching data from ${tableName}: ${error.message}`);

        log(`Table ${tableName} contains ${count} rows`);
        log(`Sample data from ${tableName}:`);
        console.log(data);

        return { count, isEmpty: count === 0 };
    } catch (error) {
        log(`Error logging table data for ${tableName}: ${error.message}`, 'error');
        return { count: null, isEmpty: true };
    }
}

// Update the main function
async function main() {
    try {
        log('Starting the Lighthouse audit process');
        
        // Check Supabase connection and log table contents
        log('Checking gov_in_website_dir table:');
        const { count: govInWebsiteCount, isEmpty: isGovInWebsiteEmpty } = await logTableData('gov_in_website_dir');

        log('Checking websites_report_tracking table:');
        const { count: websitesReportTrackingCount, isEmpty: isWebsitesReportTrackingEmpty } = await logTableData('websites_report_tracking');

        if (isGovInWebsiteEmpty) {
            log('The gov_in_website_dir table is empty. Please populate it with links before running this script.', 'warn');
            return;
        }

        log('Successfully connected to Supabase and checked table contents');

        await syncLinksFromGovInWebsiteDir();
        await processWebsites();
        log('Lighthouse audit process completed');
    } catch (error) {
        log(`Unhandled error in main function: ${error.message}`, 'error');
    }
}

// Start the process
main();

// Add export statements for the functions we need in run-single-audit.js
export { runLighthouseAudit };
