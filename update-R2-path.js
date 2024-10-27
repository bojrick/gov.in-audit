import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in .env file');
}

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

// Function to log messages
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    console[type](`[${timestamp}] ${message}`);
}

// Function to list objects in R2 bucket
async function listAllR2Objects(prefix) {
    let allObjects = [];
    let continuationToken = undefined;

    do {
        const command = new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        });

        try {
            const { Contents, NextContinuationToken } = await r2Client.send(command);
            if (Contents) {
                allObjects = allObjects.concat(Contents);
            }
            continuationToken = NextContinuationToken;
        } catch (error) {
            log(`Error listing R2 objects: ${error.message}`, 'error');
            break;
        }
    } while (continuationToken);

    return allObjects;
}

// Function to update R2 paths in Supabase
async function updateR2Paths() {
    try {
        log('Fetching completed records from websites_report_tracking');
        const { data: records, error } = await supabase
            .from('websites_report_tracking')
            .select('id, json_path, html_path')
            .eq('status', 'completed');

        if (error) throw new Error(`Error fetching records: ${error.message}`);

        log(`Found ${records.length} completed records to update`);

        let updatedCount = 0;
        let notFoundCount = 0;

        for (const record of records) {
            const jsonObjects = await listAllR2Objects('lighthouse-reports/json/');
            const htmlObjects = await listAllR2Objects('lighthouse-reports/html/');

            const jsonObject = jsonObjects.find(obj => obj.Key.includes(record.id));
            const htmlObject = htmlObjects.find(obj => obj.Key.includes(record.id));

            if (jsonObject && htmlObject) {
                const jsonPath = `https://${R2_BUCKET_NAME}.r2.cloudflarestorage.com/${jsonObject.Key}`;
                const htmlPath = `https://${R2_BUCKET_NAME}.r2.cloudflarestorage.com/${htmlObject.Key}`;

                if (jsonPath !== record.json_path || htmlPath !== record.html_path) {
                    const { error: updateError } = await supabase
                        .from('websites_report_tracking')
                        .update({ json_path: jsonPath, html_path: htmlPath })
                        .eq('id', record.id);

                    if (updateError) {
                        log(`Error updating record ${record.id}: ${updateError.message}`, 'error');
                    } else {
                        updatedCount++;
                        log(`Updated record ${record.id}`);
                    }
                }
            } else {
                notFoundCount++;
                log(`Could not find R2 objects for record ${record.id}`, 'warn');
            }
        }

        log(`Finished updating R2 paths. Updated: ${updatedCount}, Not found: ${notFoundCount}`);
    } catch (error) {
        log(`Error in updateR2Paths: ${error.message}`, 'error');
    }
}

// Main function
async function main() {
    try {
        log('Starting R2 path update process');
        await updateR2Paths();
        log('R2 path update process completed');
    } catch (error) {
        log(`Unhandled error in main function: ${error.message}`, 'error');
    }
}

// Run the script
main();
