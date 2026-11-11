const fs = require('fs');
const sB64 = fs.readFileSync('public/assets/slogan_ulsan.png').toString('base64');
const lB64 = fs.readFileSync('public/assets/logo_ulsan.png').toString('base64');
const content = `// Embedded Official Assets for Ulsan Education
const ASSET_SLOGAN = "data:image/png;base64,${sB64}";
const ASSET_LOGO = "data:image/png;base64,${lB64}";
if (typeof module !== 'undefined') module.exports = { ASSET_SLOGAN, ASSET_LOGO };
`;
fs.writeFileSync('public/assets/images_data.js', content);
console.log('Successfully created public/assets/images_data.js');

