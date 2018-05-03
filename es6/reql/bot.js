exports.bot = (function () {
    const
        r = require('rethinkdb'),
        dbCreds = require('./../../config/config.json').rethinkdb,
        tblPoll = 'poll_data',
        tblCommand = 'bot_commands',
        tblConfig = 'trade_config',
        tbl = 'bots';

    let bot = {
        getList: function getList(filters) {
            return new Promise((resolve, reject) => {
                r.connect(dbCreds).then(conn => {
                    if (filters !== undefined && typeof filters === 'object') {
                        r.table(tbl).filter(filters).run(conn).then(cursor => {
                            return cursor.toArray();
                        }).then(results => {
                            conn.close();
                            resolve(results);
                        }).catch(err => {
                            if (conn) {
                                conn.close();
                            }
                            reject(err);
                        });
                    } else {
                        r.table(tbl).run(conn).then(cursor => {
                            return cursor.toArray();
                        }).then(results => {
                            conn.close();
                            resolve(results);
                        }).catch(err => {
                            if (conn) {
                                conn.close();
                            }
                            reject(err);
                        });
                    }
                }).catch(err => {
                    reject(err);
                });
            });
        },
        getConfig: function getConfig() {
            return new Promise((resolve, reject) => {
                r.connect(dbCreds).then(conn => {
                    r.table(tblConfig).run(conn).then(cursor => {
                        conn.close();
                        resolve(cursor.toArray());
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        getFree: function getFree(n) {
            return new Promise((resolve, reject) => {
                if (n === undefined || typeof n !== 'number') {
                    //if limit number is not set then default it to 5 records.
                    n = 5;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).filter({
                        host_ip: null,
                        status: 0
                    }).limit(n).run(conn).then(cursor => {
                        return cursor.toArray();
                    }).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        getPollData: function getPollData(botId) {
            return new Promise((resolve, reject) => {

                if (botId === undefined || typeof botId !== 'string') {
                    reject(new Error('Bot ID must not be empty and should be a string value.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tblPoll).get(botId).run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        setPollData: function setPollData(botId, data) {
            return new Promise((resolve, reject) => {

                if (!botId || typeof botId !== 'string') {
                    reject(new Error('Bot ID must not be empty and should be a string value.'));
                    return;
                }

                if (!data || typeof data !== 'object') {
                    //if no data is set; make it empty object.
                    data = {};
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tblPoll).get(botId).replace({
                        id: botId,
                        data: data
                    }).run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        getStatus: function getStatus(botId) {
            return new Promise((resolve, reject) => {

                if (!botId || typeof botId !== 'string') {
                    reject(new Error('Bot ID must not be empty and should be a string value.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).get(botId).pluck('status').run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        setStatus: function setStatus(botId, status) {
            return new Promise((resolve, reject) => {

                if (!botId || typeof botId !== 'string') {
                    reject(new Error('Bot ID must not be empty and should be a string value.'));
                    return;
                }

                if (status === undefined || status === null || typeof status !== 'number') {
                    //if no data is set; make it empty object.
                    reject(new Error('Status identifier not present'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).get(botId).update({
                        status: status
                    }).run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        markOnline: function markOnline(botIds, host) {
            return new Promise((resolve, reject) => {

                if (!Array.isArray(botIds) || botIds.length <= 0) {
                    reject(new Error('Bot ID must not be empty and should be an array.'));
                    return;
                }

                if (!host || typeof host !== 'string') {
                    reject(new Error('Host must not be empty and should be a string value.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).getAll(r.args(botIds)).update({
                        status: 1,
                        host_ip: host
                    }).run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        markOffline: function markOffline(botIds, host) {
            return new Promise((resolve, reject) => {

                if (!Array.isArray(botIds) || botIds.length <= 0) {
                    reject(new Error('Bot ID must not be empty and should be an array.'));
                    return;
                }

                if (!host || typeof host !== 'string') {
                    reject(new Error('Host must not be empty and should be a string value.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).getAll(r.args(botIds)).update({
                        status: 0,
                        host_ip: null
                    }).run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });;
                }).catch(err => {
                    reject(err);
                })
            });
        },
        insert: function insert(bot) {
            return new Promise((resolve, reject) => {
                if (typeof bot !== 'object') {
                    reject(new Error('Record has to be of type object.'));
                    return;
                }

                if (!bot.hasOwnProperty('id')
                    || !bot.hasOwnProperty('account')
                    || !bot.hasOwnProperty('password')
                    || !bot.hasOwnProperty('shared_secret')
                    || !bot.hasOwnProperty('identity_secret')
                ) {
                    reject(new Error('A new bot records must have following fields "id", "account", "password", "shared_secret", and "identity_secret".'));
                    return;
                }

                if (typeof bot.id !== 'number') {
                    reject(new Error('Bot "ID" has to be a numeric 64bit steamId.'));
                    return;
                }

                if (typeof bot.account !== 'string') {
                    reject(new Error('Bot "account" has to be a string.'));
                    return;
                }

                if (typeof bot.password !== 'string') {
                    reject(new Error('Bot "password" has to be a string.'));
                    return;
                }

                if (typeof bot.shared_secret !== 'string') {
                    reject(new Error('Bot "shared_secret" has to be a string from 2fa file.'));
                    return;
                }

                if (typeof bot.identity_secret !== 'string') {
                    reject(new Error('Bot "identity_secret" has to be a string from 2fa file.'));
                    return;
                }

                if (typeof bot.host_ip !== 'string') {
                    bot.host_ip = null;
                }

                if (typeof bot.status !== 'number') {
                    bot.status = 0;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).insert(bot).run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        updateCommand: function updateCommand(id, obj) {
            return new Promise((resolve, reject) => {
                if (!id || typeof id !== 'string') {
                    reject(new Error("Offer id must be a non-empty string value."));
                    return;
                }

                if (typeof obj !== 'object' || Object.keys(obj).length <= 0) {
                    reject(new Error("Update values must be an object and be of object type."));
                    return;
                }

                // if (!obj.hasOwnProperty('code')) {
                //     obj.code = null;
                // }

                if (!obj.hasOwnProperty('error')) {
                    obj.error = null;
                }

                if (!obj.hasOwnProperty('result')) {
                    obj.result = null;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tblCommand).get(id).update({ output_data: obj }).run(conn).then(result => {
                        conn.close();
                        resolve(result);
                    }).catch(err => {
                        if (conn) {
                            conn.close();
                        }
                        reject(err);
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },
        log: function log(msg) {
            return new Promise((resolve, reject) => {
                if (typeof msg !== 'string') {
                    reject(new Error('Log message has to be of string type.'));
                    return;
                }

                let obj = {};
                obj.timestamp = new Date();
                obj.bot = process.env.BOT_WORKER_ID;
                obj.message = msg;
                obj.code = msg.split('-')[0].trim();

                r.connect(dbCreds)
                    .then(conn => {
                        r.table('logs')
                            .insert(obj)
                            .run(conn)
                            .then(result => {
                                conn.close();
                                console.log(`BOT[${obj.bot}] => ${obj.message} (${obj.code})`);
                                resolve(result);
                            })
                            .catch(err => {
                                if (conn) {
                                    conn.close();
                                }
                                reject(err);
                            });
                    }).catch(err => {
                        reject(err);
                    });
            });
        }
    }

    return bot;
})();