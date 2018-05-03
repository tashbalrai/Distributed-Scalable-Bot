exports.manager = (function () {
    const
        eventEmitter = require('events').EventEmitter,
        util = require('util'),
        fork = require('child_process').fork,
        reql = require('./../reql/reql.js');

    let registry = {}, communicator, host, exiting = false;

    function send(msg) {
        if (typeof msg !== 'object') {
            return new Error('Message should be of object type.');
        }

        if (registry.hasOwnProperty(msg.to)) {
            registry[msg.to].worker.send(msg);
        } else {
            return new Error(`Cannot find the worker ${msg.to} in our registered workers.`);
        }
    }

    function setupWorker(options) {
        let regId;

        regId = options.id;
        registry[regId] = {};
        registry[regId].options = options;
        registry[regId].worker = fork(
            './manager/worker.js',
            [JSON.stringify(options)],
            {
                env: {
                    BOT_WORKER_ID: options.id,
                }
            }
        );

        mgr.emitter.emit('debug', `Worker (${registry[regId].worker.pid}) forked.`);

        registry[regId].worker.on('error', handleWorkerError);
        registry[regId].worker.on('exit', handleExitedWorker);
        registry[regId].worker.on('message', handleWorkerMessage);
    }

    function forkBots(num) {
        if (typeof num !== 'number') {
            throw new Error('A number is expected.');
        }


        return new Promise((resolve, reject) => {
            reql.bot.getFree(num).then(bots => {
                if (bots.length < 0) {
                    reject(new Error('No more free bots available in the pool.'));
                    return;
                }
                return bots;
            }).then(bots => {
                if (bots.length <= 0) {
                    reject(new Error('Unable to find idle bots to fork.'));
                    return;
                }

                bots.forEach(function (data, index) {
                    setupWorker(data);

                    if (index === bots.length - 1) {
                        resolve(`The total of ${bots.length} workers would be started.`);
                        return;
                    }
                });
            }).catch(err => {
                reject(new Error('Error: ' + err.message));
                return;
            })
        });
    }  //End forkBots(num)

    function handleWorkerError(err) {
        mgr.emitter.emit('error', `Worker error (${err.message}): ${err.trace}`);
    } //End handleWorkerError(err)

    function handleExitedWorker(code, signal) {
        //TODO: 
        // Add number of retries; 
        // Free the bot if not able to start after N retries.
        // Add timeout to refork the worker bot to prevent lock out of steam account.

        mgr.emitter.emit('debug', `Worker dead with code (${code}) and signal (${signal})`);

        if (exiting) {
            //Do nothing we want to exit.
            return;
        }

        for (let regId in registry) {
            if (registry.hasOwnProperty(regId) && registry[regId].worker.connected === false) {
                mgr.emitter.emit('debug', `BOT[${regId}] -> dead.`);
                setupWorker(registry[regId].options);
                mgr.emitter.emit('debug', `BOT[${regId}] -> restarted. PID:${registry[regId].worker.pid}`);
            }
        }
    } //End handleWorkerExited(code, signal)

    function handleWorkerMessage(msg) {
        if (msg.to === "manager") {
            handleOwnMessage(msg);
        } else {
            mgr.emitter.emit('command_result', msg);
        }
    }

    function handleOwnMessage(msg) {
        if (msg.data.command === "ready") {
            reql.bot.markOnline([msg.data.input_data.bot], host).then(result => {
                mgr.emitter.emit('debug', `BOT[${msg.data.input_data.bot}] -> online.`);
            }).catch(err => {
                mgr.emitter.emit('debug', `BOT[${msg.data.input_data.bot}] -> Error: online failed. [${err.message}]`);
                if (registry.hasOwnProperty(msg.data.input_data.bot)) {
                    //Not able to be online. Lets kill this bot to re attempt.
                    registry[msg.data.input_data.bot].worker.kill('SIGINT');
                }
            });
        }
    }

    function cleanup() {
        let regIds = [];
        exiting = true;
        for (const id in registry) {
            regIds[regIds.length] = id;
            registry[id].worker.kill('SIGINT');
        }

        reql.bot.markOffline(regIds, host).then(result => {
            process.exit();
        }).catch(err => {
            console.log(err);
        })

    }

    function setHost(ip) {
        host = ip;
    }

    let mgr = {
        forkBots: forkBots,
        setHost: setHost,
        cleanup: cleanup,
        emitter: new eventEmitter()
    };

    //Events.
    mgr.emitter.on('command', (input) => {
        let msg = {};
        msg.to = input.bot;
        msg.data = input;
        send(msg);
        //console.log(`Command Received: ${JSON.stringify(input)}`);
    });

    mgr.emitter.on('debug', msg => {
        console.log('MANAGER => ', msg);
    });
    mgr.emitter.on('error', msg => {
        console.log('MANAGER ERROR => ', msg);
    });

    return mgr;

})();

