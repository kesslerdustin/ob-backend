const os = require('os');

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (interface.family === 'IPv4' && !interface.internal) {
        ips.push(interface.address);
      }
    }
  }

  return ips;
}

console.log('🔍 Finding local IP addresses for CORS configuration...\n');

const localIPs = getLocalIPs();

if (localIPs.length === 0) {
  console.log('❌ No local IP addresses found');
} else {
  console.log('📱 Found local IP addresses:');
  localIPs.forEach((ip, index) => {
    console.log(`   ${index + 1}. ${ip}`);
  });

  console.log('\n🔧 To configure CORS for development, add this to your Heroku environment variables:');
  console.log(`   CORS_DEVELOPMENT_IPS=${localIPs.join(',')}`);

  console.log('\n📋 Or set it locally in your .env file:');
  console.log(`   CORS_DEVELOPMENT_IPS=${localIPs.join(',')}`);

  console.log('\n🚀 Expo development URLs that will be allowed:');
  localIPs.forEach(ip => {
    console.log(`   exp://${ip}:8081`);
  });
}

console.log('\n💡 To set environment variables on Heroku:');
console.log('   heroku config:set CORS_DEVELOPMENT_IPS=your,ip,addresses');
console.log('   heroku config:set NODE_ENV=production (for production)'); 