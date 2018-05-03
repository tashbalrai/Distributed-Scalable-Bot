exports.inventory = (function () {
    const
        r = require('rethinkdb'),
        dbCreds = require('./../../config/config.json').rethinkdb,
        ItemState = require('./../bot/itemstate.js'),
        tbl = 'inventory',
        tblOffer = 'offers';

    let inventory = {
        getItems: function getItems(botId) {
            return new Promise((resolve, reject) => {

                if (botId === undefined || typeof botId !== 'number') {
                    reject(new Error('Bot ID must not be empty and should be a number.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).filter({
                        "bot": botId
                    }).run(conn).then(cursor => {
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
                }).catch(err => {
                    reject(err);
                });
            });
        },
        saveItems: function saveItems(items) {
            return new Promise((resolve, reject) => {

                if (typeof items !== 'object') {
                    reject(new Error('Item(s) must either be an array of objects or a single item object.'));
                    return;
                }

                let vItems;
                vItems = this.validateItem(items);

                if (vItems instanceof Error) {
                    reject(vItems);
                    return;
                }

                for (let i = 0; i < vItems.length; i += 1) {
                    vItems[i].id = [vItems[i].bot, vItems[i].asset_id];
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).insert(vItems).run(conn).then(results => {
                        conn.close();
                        resolve(results);
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
        removeWithdrawnItems: function removeWithdrawnItems(botId, offerId) {
            return new Promise((resolve, reject) => {
                if (!isFinite(botId)) {
                    reject(new Error('Bot ID must not be empty.'));
                    return;
                }

                if (!isFinite(offerId)) {
                    reject(new Error('Offer ID must not be empty.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).filter({
                        sent_offer_id: offerId,
                        bot: botId
                    })
                        .delete()
                        .run(conn)
                        .then(result => {
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
        getUserItems: function getUserItems(botId, inputItems) {
            return new Promise((resolve, reject) => {
                if (!isFinite(botId)) {
                    reject(new Error('Bot ID must not be empty.'));
                    return;
                }

                if (!Array.isArray(inputItems) || inputItems.length <= 0) {
                    reject(new Error('Items should be an array of items and should not be empty.'));
                    return;
                }

                let ids = [];
                for (let i = 0; i < inputItems.length; i += 1) {
                    if (!inputItems[i].hasOwnProperty('asset_id')) {
                        reject({ code: "ER1009", message: "Some of the input items params missing." });
                        return;
                    }

                    ids[i] = [botId, inputItems[i].asset_id];
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).getAll(r.args(ids)).filter({ state: ItemState.Active })
                        .run(conn)
                        .then(result => {
                            conn.close();
                            resolve(result.toArray());
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
        updateItems: function updateItems(botId, inputItems, data) {
            return new Promise((resolve, reject) => {
                if (!isFinite(botId)) {
                    reject(new Error('Bot ID must not be empty.'));
                    return;
                }

                if (!Array.isArray(inputItems) || inputItems.length <= 0) {
                    reject(new Error('Items should be an array of items and should not be empty.'));
                    return;
                }

                if (typeof data !== 'object' && Object.keys(data).length < 0) {
                    reject(new Error('Update data must not be empty.'));
                    return;
                }

                let ids = [];
                for (let i = 0; i < inputItems.length; i += 1) {
                    ids[i] = [botId, inputItems[i].asset_id];
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).getAll(r.args(ids)).update(data)
                        .run(conn)
                        .then(result => {
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
        updateItemsByFilters: function updateItemsByFilters(filterObj, updateObj) {
            return new Promise((resolve, reject) => {
                if (typeof filterObj !== 'object' && Object.keys(filterObj).length < 0) {
                    reject(new Error('Filter object must not be empty.'));
                    return;
                }

                if (typeof updateObj !== 'object' && Object.keys(updateObj).length < 0) {
                    reject(new Error('Update object must not be empty.'));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tbl).filter(filterObj).update(updateObj)
                        .run(conn)
                        .then(result => {
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
        validateItem: function validateItem(items) {
            if (!Array.isArray(items)) {
                items = [items];
            }

            for (let i = 0; i < items.length; i += 1) {

                if (!items[i].hasOwnProperty('asset_id')
                    || !items[i].hasOwnProperty('market_hash_name')
                    || !items[i].hasOwnProperty('owner')
                ) {
                    return new Error('Item(s) is missing required fields. Following fields must be present: "asset_id", "market_hash_name", "partner". Item#: ' + i);
                }

                if (!isFinite(items[i].asset_id)) {
                    return new Error('The field "asset_id" should be numeric. Item#: ' + i);
                }

                if (typeof items[i].market_hash_name !== 'string') {
                    return new Error('The field "market_hash_name" should be of string type. Item#: ' + i);
                }

                // if (typeof items[i].price !== 'number') {
                // return new Error('The field "price" should be of numeric type. Item#: '+ i);
                // }

                if (!isFinite(items[i].owner)) {
                    return new Error('The field "owner" should be numeric. Item#: ' + i);
                }

                // if (!items[i].context_id) {
                // context_id not set; set it to CSGO game i.e. 2
                // items[i].context_id = 2;
                // }

                // if (!items[i].app_id) {
                // app_id not set; set it to CSGO game i.e. 730
                // items[i].app_id = 730;
                // }

            }

            return items;
        },
        saveOffer: function saveOffer(offer) {
            return new Promise((resolve, reject) => {
                if (typeof offer !== 'object') {
                    reject(new Error("Trade offer must be of type object."));
                    return;
                }
                r.connect(dbCreds).then(conn => {
                    r.table(tblOffer).insert(offer).run(conn).then(result => {
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
        deleteOffer: function deleteOffer(id) {
            return new Promise((resolve, reject) => {
                if (!id || typeof id !== 'string') {
                    reject(new Error("Offer id must be a non-empty string value."));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tblOffer).get(id).delete().limit(1).run(conn).then(result => {
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
        updateOffer: function updateOffer(id, obj) {
            return new Promise((resolve, reject) => {
                if (!id || typeof id !== 'string') {
                    reject(new Error("Offer id must be a non-empty string value."));
                    return;
                }

                if (typeof obj !== 'object' || Object.keys(obj).length <= 0) {
                    reject(new Error("Update values must be an object and be of object type."));
                    return;
                }

                r.connect(dbCreds).then(conn => {
                    r.table(tblOffer).get(id).update(obj).run(conn).then(result => {
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
        }
    }

    return inventory;
})();