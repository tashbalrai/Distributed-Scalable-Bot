exports.communicator = (function () {
    const
        reql = require('./../reql/reql.js');

    let _feed, _manager;

    let reqlCommunicator = {
        startListening: function startListening(host) {
            reql.feed.start(host).then(feed => {
                _feed = feed;
                _feed.each((err, change) => {
                    if (err !== null) throw err;

                    this.handleChange(change);
                }).catch(err => {
                    throw err;
                });
            });
        },
        stopListening: function stopListening() {
            reql.feed.stop();
        },
        setManager: function setManager(manager) {
            if (typeof manager !== 'object') {
                throw new Error('A manager object is required.');
            }

            _manager = manager;

            _manager.emitter.on('command_result', this.handleResults);
        },
        handleChange: function handleChange(change) {
            let delta = change.new_val;
            if (delta !== null) {
                _manager.emitter.emit('command', delta);
            }
        },
        handleResults: function handleResults(output) {
            let result = output.data;
            result.status = 1;
            reql.feed.updateResult(result).then(res => {
                console.log(`Command ${result.command} completed.`);
            }).catch(err => {
                console.log('ReqlError: ', err);
            });
        }
    };

    return reqlCommunicator;
})();