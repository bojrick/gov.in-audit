const { lighthouseBatchParallel } = require('lighthouse-batch-parallel');
const fs = require('fs');
const path = require('path');

// Read the URLs from the JSON file
let urls;

try {
    const data = fs.readFileSync('./valid2.json', 'utf8');
    urls = JSON.parse(data);
    
    if (!Array.isArray(urls)) {
        throw new Error('The content of valid.json must be an array.');
    }
} catch (error) {
    console.error('Failed to read or parse valid.json:', error);
    process.exit(1);
}

const targetWebsites = urls.map(url => ({
    Device: 'desktop', 
    URL: url
}));

const customAuditsConfig = {
    'first-contentful-paint': 'First Contentful Paint',
    'first-meaningful-paint': 'First Meaningful Paint',
    'speed-index': 'Speed Index',
    'interactive': 'Time to Interactive',
    'first-cpu-idle': 'First CPU Idle',
    'max-potential-fid': 'Max Potential First Input Delay',
};

// Set up Lighthouse auditing
const lighthouseAuditing = lighthouseBatchParallel({ 
    input: {
        stream: targetWebsites,
    },
    customAudits: { stream: customAuditsConfig },
    throttling: 'applied3G',
    outputFormat: 'json',
    workersNum: 2,
    timeout: 120000,
});

let reports = [];

lighthouseAuditing.on('data', ({ data }) => {
    reports.push(data);  // Push the raw data object directly
    console.log(`Processed: ${JSON.stringify(data)}`);
});

lighthouseAuditing.on('error', ({ error }) => {
    console.error('Error:', JSON.stringify(error, null, 2));
});

lighthouseAuditing.on('end', () => {
    console.log('Auditing complete. Saving reports...');
    const outputPath = path.join(__dirname, 'lighthouse-reports.json');
    
    // Stringify the reports array once and save
    fs.writeFileSync(outputPath, JSON.stringify(reports, null, 2));  
    console.log(`Reports saved to ${outputPath}`);
});
