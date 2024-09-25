const https = require('https');

const urls = [
  "https://nhb.org.in",
  "https://notary.gov.in",
  "https://www.gicre.in",
  "https://odishatax.gov.in",
  "https://swachhatahiseva.gov.in",
  "https://igod.gov.in/feedback"
];

urls.forEach(url => {
  https.get(url, (res) => {
    console.log(`${url} - Status Code: ${res.statusCode}`);
  }).on('error', (e) => {
    console.error(`${url} - Error: ${e.message}`);
  });
});
