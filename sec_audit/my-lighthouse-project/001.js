const { lighthouseBatchParallel } = require('lighthouse-batch-parallel');

// Define target websites for auditing
const targetWebsites = [
  {
    Device: 'mobile',
    URL: 'https://www.npmjs.com/package/lighthouse-batch-parallel'
  },
  {
    Device: 'desktop',
    URL: 'https://www.npmjs.com/package/lighthouse-batch-parallel'
  },
];

// Define custom audit metrics
const customAuditsConfig = {
  'first-contentful-paint': 'First Contentful Paint',
  'first-meaningful-paint': 'First Meaningful Paint',
  'speed-index': 'Speed Index',
};

// Initialize Lighthouse auditing
const lighthouseAuditing = lighthouseBatchParallel({
  input: './valid2.json',
  customAudits: { stream: customAuditsConfig },
  throttling: 'applied3G',
  outputFormat: 'jsObject',
  workersNum: 2,
});

// Array to store reports
let reports = [];

// Collect reports as they come in
lighthouseAuditing.on('data', ({ data }) => {
  reports.push(data);
});

// Handle errors
lighthouseAuditing.on('error', ({ error }) => {
  console.error('Error during Lighthouse auditing:', error);
});

// Log the results when auditing ends
lighthouseAuditing.on('end', () => {
  console.log('Auditing complete. Reports:', reports);
  if (reports.length > 0) {
    console.log('Audits:', reports[0].audits);
  } else {
    console.log('No reports generated.');
  }
});
