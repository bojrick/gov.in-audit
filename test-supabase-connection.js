import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in .env file');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testConnection() {
    try {
        console.log('Testing Supabase connection...');
        const { data, error } = await supabase.from('gov_in_website_dir').select('count', { count: 'exact' });
        if (error) throw error;
        console.log('Connection successful!');
        console.log(`gov_in_website_dir table has ${data[0].count} rows`);

        // Fetch and log sample data from gov_in_website_dir
        const { data: sampleData, error: sampleError } = await supabase
            .from('gov_in_website_dir')
            .select('*')
            .limit(5);
        if (sampleError) throw sampleError;
        console.log('Sample data from gov_in_website_dir:');
        console.log(sampleData);

        // Check websites_report_tracking table
        const { data: reportData, error: reportError } = await supabase
            .from('websites_report_tracking')
            .select('count', { count: 'exact' });
        if (reportError) throw reportError;
        console.log(`websites_report_tracking table has ${reportData[0].count} rows`);

        // Fetch and log sample data from websites_report_tracking
        const { data: sampleReportData, error: sampleReportError } = await supabase
            .from('websites_report_tracking')
            .select('*')
            .limit(5);
        if (sampleReportError) throw sampleReportError;
        console.log('Sample data from websites_report_tracking:');
        console.log(sampleReportData);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testConnection();
