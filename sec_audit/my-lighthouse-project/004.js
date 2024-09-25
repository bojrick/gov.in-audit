const fs = require('fs');
const { exec } = require('child_process');

// Read URLs from JSON file
fs.readFile('valid2.json', 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading the file:', err);
        return;
    }

    // Parse the JSON data directly as an array
    const urls = JSON.parse(data);

    // Function to crawl each URL using lighthouse-parade
    const crawlUrls = async () => {
        for (const url of urls) {
            const command = `npx lighthouse-parade ${url} --ignore-robots --lighthouse-concurrency=2 --max-crawl-depth=2`;
            console.log(`Crawling: ${url}`);
            await execCommand(command);
        }
        console.log('Crawling completed.');
    };

    // Function to execute shell commands
    const execCommand = (command) => {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing command: ${command}`, stderr);
                    reject(error);
                } else {
                    console.log(stdout);
                    resolve(stdout);
                }
            });
        });
    };

    // Start crawling
    crawlUrls();
});
