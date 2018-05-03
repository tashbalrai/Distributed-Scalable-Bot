exports.feed = (function () {
    const
        r = require('rethinkdb'),
        dbCreds = require('./../../config/config.json').rethinkdb,
        tbl = 'bot_commands';

    let _connFeed;

    let feed = {
        start: function start(host) {
            return new Promise((resolve, reject) => {
                if (!host) {
                    reject(new Error('Host parameter is required.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    _connFeed = conn;
                    return r.table(tbl).filter({
                        host_ip: host,
                        status: 0
                    }).changes().run(conn);
                }).then(cursor => {
                    resolve(cursor);
                }).catch(err => {
                    if (_connFeed) {
                        _connFeed.close();
                    }
                    reject(err);
                });
            });
        },
        stop: function stop() {
            if (_connFeed) {
                _connFeed.close();
                return true;
            }
        },
        updateResult: function updateResult(result) {
            return new Promise((resolve, reject) => {
                if (typeof result !== 'object') {
                    reject(new Error("Command result must be an object."));
                    return;
                }

                if (!result.hasOwnProperty('id')
                    || !result.hasOwnProperty('output_data')) {
                    reject(new Error("Command result is missing the required data."));
                    return;
                }

                if (_connFeed) {
                    r.table(tbl).get(result.id).replace(result).run(_connFeed).then(response => {
                        resolve(response);
                    }).catch(err => {
                        reject(err);
                    });
                } else {
                    reject(new Error("Reql connection not established."));
                }
            });
        }
    }

    return feed;
})();