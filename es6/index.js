'use strict';

const
    manager = require('./manager/manager.js').manager,
    communicator = require('./communicator/communicator.js').communicator,
    readline = require('readline'),
    os = require('os'),
    cpus = os.cpus(),
    totalMem = os.totalmem(),
    ifaces = os.networkInterfaces();

let totalMemMB = totalMem / (1024 * 1024), i, iface = [], rl;

//TODO: cleanup forks.
//Handle process exit.
process.on("SIGINT", manager.cleanup);
//process.on("SIGTERM", manager.cleanup);
//process.on("SIGHUP", manager.cleanup);

console.log("****** CURRENT NODE STATISTICS ****** \n");
console.log(`Total System Memory: ${totalMemMB} MB`);
console.log(`Total CPUs: ${cpus.length} Cores\n`);
for (i = 0; i < cpus.length; i += 1) {
    console.log(`CPU (${i}): ${cpus[i].model}`);
}

rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n****** Network Interfaced Detected ******\n");
for (const dev in ifaces) {
    iface = iface.concat(ifaces[dev].filter(function (details) {
        return details.family === 'IPv4';
    }));
}

for (i = 0; i < iface.length; i += 1) {
    console.log(`IPv4 (${i}): ${iface[i].address}`);
}


rl.question(`\nChoose the host IP address from the above list (enter a number 0-${i - 1}): `, (ip) => {
    if (!isFinite(ip)) {
        console.log('Host IP address is required to proceed.');
        rl.close();
        return;
    }

    if (iface[ip]) {
        ip = iface[ip].address;
    } else {
        console.log('Unable to track the IP address.');
        rl.close();
        return;
    }

    console.log('\nNote: Actual number of forks will depend on the number of free bots available in the bots pool.');
    rl.question(`\nHow many number of forks you want? (Recommended: ${cpus.length}):`, (n) => {
        if (!n || !isFinite(n)) {
            n = cpus.length;
        }
        n = Number(n);
        manager.setHost(ip);
        manager.forkBots(n).then(bots => {
            console.log(bots);
            communicator.setManager(manager);
            communicator.startListening(ip);
        }).catch(err => {
            console.log(err);
        });
        rl.close();
    });
});