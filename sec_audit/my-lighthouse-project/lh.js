const fs = require('fs');
const { lighthouseBatchParallel } = require('lighthouse-batch-parallel');

// Read the input from valid.json
const targetWebsites = JSON.parse(fs.readFileSync('./valid.json', 'utf8'));

const customAuditsConfig = {
  'first-contentful-paint': 'First Contentful Paint',
  'first-meaningful-paint': 'First Meaningful Paint',
  'speed-index':            'Speed Index',
};

const lighthouseAuditing = lighthouseBatchParallel({ 
  input: targetWebsites,  // Use the websites loaded from valid.json
  customAudits: { stream: customAuditsConfig },
  throttling:   'applied3G',
  outputFormat: 'jsObject',
  workersNum:   2,
});

let reports = [];

lighthouseAuditing.on('data', ({ data }) => {
  reports.push(data);
});

lighthouseAuditing.on('error', ({ error }) => {
  console.error('Error occurred:', error);
});

lighthouseAuditing.on('end', () => {
  console.log(reports);
  if (reports.length > 0) {
    console.log(reports[0].audits); // Ensure reports is not empty before accessing
  }
});
