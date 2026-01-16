const https = require('https');

const url = process.argv[2];

if (!url) {
    console.error('Usage: node scripts/verify-deploy.js <url>');
    process.exit(1);
}

console.log(`Checking deployment at: ${url}`);

const req = https.get(url, (res) => {
    console.log(`Status Code: ${res.statusCode}`);

    if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('✅ Deployment is reachable!');
    } else {
        console.error('❌ Deployment returned an error status.');
        process.exit(1);
    }

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (data.includes('Orbital Nadir') || data.includes('next')) {
            console.log('✅ Content verification passed (Found app title/content).');
        } else {
            console.warn('⚠️  Content verification warning: Could not find expected text.');
        }
    });

});

req.on('error', (e) => {
    console.error(`❌ Connection error: ${e.message}`);
    process.exit(1);
});
