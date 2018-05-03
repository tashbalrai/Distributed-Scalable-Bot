var
    EventEmitter = require('events').EventEmitter,
    Path = require('path'),
    reql = require('./../reql/reql.js'),
    Bot = require('./bot.js'),
    TradeOfferManager = require('steam-tradeoffer-manager'),
    OfferState = TradeOfferManager.ETradeOfferState,
    sprintf = require('sprintf-js').sprintf,
    EMsg = require('./errors.js'),
    ItemState = require('./itemstate.js');

Bot.prototype.setupTradeManager = function (sessionId, Cookies, APIKey) {
    var options = {};
    reql.bot.getConfig().then(config => {
        this._options.trade = config[0];
        options = config[0].trade;
        options.steam = this._client;

        this._manager = new TradeOfferManager(options);
        this._manager.setCookies(Cookies, err => {
            if (err != null) {
                this.emit('error', err);
                return;
            }
            this.emit('tradeManagerReady');
            this.loadPollData();
            this._manager.on('pollData', this.savePollData.bind(this));
            this._manager.on('newOffer', this.newOffer.bind(this));
            this._manager.on('sentOfferChanged', this.sentOfferChanged.bind(this));
            this._manager.on('pollFailure', this.pollFailure.bind(this)); // can be used to notify user about steam down or makeing errors
            this._manager.on('pollSuccess', this.pollSuccess.bind(this));
            this.setupConfirmations();
        });
    }).catch(err => {
        this.emit('error', err);
    });
};

Bot.prototype.getManagerResource = function (resource) {
    if (TradeOfferManager.hasOwnProperty(resource) && typeof TradeOfferManager[resource] === 'object') {
        return TradeOfferManager[resource];
    } else {
        return false;
    }
};

Bot.prototype.getStateName = function (state) {
    var stateName = TradeOfferManager.getStateName(state);
    if (typeof stateName === 'string') {
        return stateName;
    } else {
        return false;
    }
};

Bot.prototype.getTradeManager = function () {
    if (this._manager) {
        return this._manager;
    } else {
        return false;
    }
};

Bot.prototype.shutDownManager = function () {
    if (this.getCommunityManager()) {
        this.getCommunityManager().stopConfirmationChecker();
        this.getTradeManager().shutdown();
    } else {
        this.emit('debug', 'Unable to get trade manager.');
    }
};

Bot.prototype.getCommunityManager = function () {
    if (this.getTradeManager()) {
        return this.getTradeManager()._community;
    } else {
        this.emit('debug', 'Unable to get trade manager.');
        return false;
    }
};

Bot.prototype.setupConfirmations = function () {
    if (this.getCommunityManager()) {
        this.getCommunityManager()
            .startConfirmationChecker(this._options.trade.trade.confirmationPollInterval, this._options.identity_secret);
        this.emit('confirmationPollingStarted');
    } else {
        this.emit('debug', 'Unable to get community manager to setup confirmation polling.');
    }
};

Bot.prototype.loadPollData = function () {
    reql.bot.getPollData(this._options.id).then(data => {
        if (data) {
            this.getTradeManager().pollData = data.data;
        }
    }).catch(err => {
        this.emit('debug', err);
    });
};

Bot.prototype.savePollData = function (newData) {
    reql.bot.setPollData(this._options.id, newData).then(result => {
        this.emit('debug', 'Poll data saved.');
    }).catch(err => {
        this.emit('error', err);
    })
};

Bot.prototype.getUserInventory = function (input) {
    return new Promise((resolve, reject) => {
        if (!input.data.hasOwnProperty('partner')) {
            reql.bot.log(EMsg["ER1001"]);
            reject(new Error(EMsg["ER1001"]));
            return;
        }

        let steamId;
        steamId = input.data.partner;
        //steamId is not SteamID instance then try to create it.
        if (typeof steamId === 'string') {
            steamId = new TradeOfferManager.SteamID(steamId);
        }

        this.getTradeManager()
            .loadUserInventory(steamId, 730, 2, true, (err, inv, cur) => {
                if (err !== null) {
                    reql.bot.log(sprintf(EMsg["ER1002"], err.message));
                    reject(new Error(sprintf(EMsg["ER1002"], err.message)));
                    return;
                }

                let inventory = [], i;
                for (i = 0; i < inv.length; i++) {
                    inventory[i] = {};
                    inventory[i].market_hash_name = inv[i].market_hash_name;
                    inventory[i].id = inventory[i].asset_id = inv[i].id;
                    inventory[i].image = inv[i].getImageURL();
                }

                resolve(inventory);
            });
    });
};

Bot.prototype.getOwnInventory = function (input) {
    return new Promise((resolve, reject) => {
        //steamId is not SteamID instance then try to create it.
        let steamId;
        steamId = new TradeOfferManager.SteamID(process.env.BOT_WORKER_ID);

        this.getTradeManager()
            .loadInventory(730, 2, true, (err, inv, cur) => {
                if (err !== null) {
                    reql.bot.log(sprintf(EMsg["ER1012"], err.message));
                    reject(new Error(sprintf(EMsg["ER1012"], err.message)));
                    return;
                }

                let inventory = [], i;
                for (i = 0; i < inv.length; i++) {
                    inventory[i] = {};
                    inventory[i].market_hash_name = inv[i].market_hash_name;
                    inventory[i].id = inventory[i].asset_id = inv[i].id;
                }

                resolve(inventory);
            });
    });
};

Bot.prototype.getUserDetails = function (offer) {
    return new Promise((resolve, reject) => {
        offer.getUserDetails((err, me, them) => {
            if (err !== null) {
                reql.bot.log(sprintf(EMsg["ER1007"], err.message));
                reject(new Error(sprintf(EMsg["ER1007"], err.message)));
                return;
            }

            if (me.escrowDays > 0 || them.escrowDays > 0) {
                reql.bot.log(sprintf(EMsg["ER1008"], me.escrowDays, them.escrowDays));
                reject(new Error(sprintf(EMsg["ER1008"], me.escrowDays, them.escrowDays)));
                return;
            }

            resolve({ me: me, them: them });
        });
    });
};

Bot.prototype.deposit = function (input) {
    return new Promise((resolve, reject) => {
        if (typeof input.data !== "object"
            || typeof input.data.input_data !== "object") {
            reql.bot.log(EMsg["ER1003"]);
            reject(new Error(EMsg["ER1003"]));
            return;
        }

        if (typeof input.data.token !== "string"
            || input.data.token.length <= 0) {
            reql.bot.log(EMsg["ER1004"]);
            reject(new Error(EMsg["ER1004"]));
            return;
        }

        if (input.data.input_data.hasOwnProperty('items_to_receive')
            && input.data.input_data.items_to_receive.length <= 0) {
            reql.bot.log(EMsg["ER1005"])
                .catch(err => {
                    console.log(err);
                });
            reject(new Error(EMsg["ER1005"]));
            return;
        }

        if (input.data.input_data.hasOwnProperty('items_to_give')
            && input.data.input_data.items_to_give.length > 0) {
            reql.bot.log(EMsg["ER1006"]);
            reject(new Error(EMsg["ER1006"]));
            return;
        }

        let offer;
        offer = this.getTradeManager().createOffer(new TradeOfferManager.SteamID(input.data.partner.toString()), input.data.token);

        this.getUserDetails(offer)
            .then(details => {
                this.getUserInventory(input)
                    .then(inventory => {
                        let found = false, inputItems = input.data.input_data.items_to_receive, items = [];

                        for (let i = 0; i < inputItems.length; i += 1) {
                            for (let j = 0; j < inventory.length; j += 1) {
                                if (!inputItems[i].hasOwnProperty('asset_id')) {
                                    reql.bot.log(EMsg["ER1009"]);
                                    reject(new Error(EMsg["ER1009"]));
                                    return;
                                }

                                if (inputItems[i].asset_id == inventory[j].asset_id) {
                                    offer.addTheirItem({
                                        assetid: inputItems[i].id,
                                        appid: 730,
                                        contextid: 2,
                                        amount: 1
                                    });
                                    found = true;
                                }
                            }

                            if (found === false) {
                                reql.bot.log(sprintf(EMsg["ER1010"], inputItems[i].market_hash_name, inputItems[i].asset_id));
                                reject(new Error(sprintf(EMsg["ER1010"], inputItems[i].market_hash_name, inputItems[i].asset_id)));
                                return;
                            } else {
                                found = false; //let's set for the next item iteration.
                            }
                        }
                        return offer;
                    })
                    .then(offer => {
                        let
                            securityToken = (Math.random()).toString(16).replace('0.', ''),
                            timestamp = Date.now();

                        offer.setMessage(`Security Token: ${securityToken}, Timestamp: ${timestamp}`);
                        offer.send((err, status) => {
                            if (err !== null) {
                                reql.bot.log(sprintf(EMsg["ER1011"], offer.id, err.message));
                                reject(new Error(sprintf(EMsg["ER1011"], offer.id, err.message)));
                            }

                            let result = {
                                id: offer.id,
                                security_token: securityToken,
                                timestamp: timestamp,
                                message: sprintf(EMsg["LOG1003"], offer.id)
                            };

                            if (status === 'pending') {
                                result.message = "Offer awaiting mobile confirmation";
                            }

                            offer.data('agent', 'bot');
                            offer.data('security_token', securityToken);
                            offer.data('type', 'deposit');
                            offer.data('command_id', input.data.id);

                            reql.inventory.saveOffer(this.getOfferJson(offer))
                                .then(res => {
                                    resolve(result);
                                }).catch(err => {
                                    reql.bot.log(EMsg["DB-ER1001"]);
                                    reject(new Error(EMsg["DB-ER1001"]));
                                });
                        }); // End offer.send
                    }); //End getUserInventory
            }); //End getUserDetails
    });
};

Bot.prototype.getOfferJson = function getOfferJson(offer) {
    return {
        id: offer.id,
        state: offer.state,
        items_to_give: offer.itemsToGive,
        items_to_receive: offer.itemsToReceive,
        partner: offer.partner.getSteamID64(),
        is_our_offer: offer.isOurOffer,
        message: offer.message,
        expires: offer.expires ? offer.expires.toString() : offer.expires,
        created: offer.created ? offer.created.toString() : offer.created,
        updated: offer.updated ? offer.updated.toString() : offer.updated,
        trade_id: offer.tradeID,
        bot: process.env.BOT_WORKER_ID,
        type: offer.data('type'),
        security_token: offer.data('security_token')
    };
};

Bot.prototype.withdraw = function (input) {
    return new Promise((resolve, reject) => {
        if (typeof input.data !== "object"
            || typeof input.data.input_data !== "object") {
            reql.bot.log(EMsg["ER1013"]);
            reject(new Error(EMsg["ER1013"]));
            return;
        }

        if (typeof input.data.token !== "string"
            || input.data.token.length <= 0) {
            reql.bot.log(EMsg["ER1014"]);
            reject(new Error(EMsg["ER1014"]));
            return;
        }

        if (input.data.input_data.hasOwnProperty('items_to_give')
            && input.data.input_data.items_to_give.length <= 0) {
            reql.bot.log(EMsg["ER1015"]);
            reject(new Error(EMsg["ER1015"]));
            return;
        }

        if (input.data.input_data.hasOwnProperty('items_to_receive')
            && input.data.input_data.items_to_receive.length > 0) {
            reql.bot.log(EMsg["ER1016"]);
            reject(new Error(EMsg["ER1016"]));
            return;
        }

        let offer, inputItems = input.data.input_data.items_to_give;
        offer = this.getTradeManager().createOffer(new TradeOfferManager.SteamID(input.data.partner.toString()), input.data.token);

        this.getUserDetails(offer)
            .then(details => {
                reql.inventory.getUserItems(process.env.BOT_WORKER_ID, inputItems)
                    .then(items => {
                        if (items.length !== inputItems.length) {
                            reql.bot.log(EMsg["ER1017"]);
                            reject(new Error(EMsg["ER1017"]));
                        }

                        this.getOwnInventory(input)
                            .then(inventory => {
                                let found = false;

                                for (let i = 0; i < items.length; i += 1) {
                                    for (let j = 0; j < inventory.length; j += 1) {
                                        if (items[i].asset_id === inventory[j].asset_id) {
                                            offer.addMyItem({
                                                assetid: items[i].asset_id,
                                                appid: 730,
                                                contextid: 2,
                                                amount: 1
                                            });
                                            found = true;
                                        }
                                    }

                                    if (found === false) {
                                        reql.bot.log(sprintf(EMsg["ER1018"], items[i].market_hash_name, items[i].asset_id));
                                        reject(new Error(sprintf(EMsg["ER1018"], items[i].market_hash_name, items[i].asset_id)));
                                    } else {
                                        found = false; //let's set for the next item iteration.
                                    }
                                }
                                return { offer, items };
                            })
                            .then(offerAndItems => {
                                let
                                    offer = offerAndItems.offer,
                                    items = offerAndItems.items;

                                reql.inventory.updateItems(process.env.BOT_WORKER_ID, items, {
                                    state: ItemState.WithdrawalRequested,
                                })
                                .then(res => {
                                    let
                                        securityToken = (Math.random()).toString(16).replace('0.', ''),
                                        timestamp = Date.now();

                                    offer.setMessage(`Security Token: ${securityToken}, Timestamp: ${timestamp}`);
                                    offer.send((err, status) => {
                                        if (err !== null) {
                                            reql.bot.log(sprintf(EMsg["ER1019"], offer.id, err.message));
                                            reql.inventory.updateItems(process.env.BOT_WORKER_ID, items, {
                                                state: ItemState.Active,
                                            })
                                            .catch(err => {
                                                reql.bot.log(sprintf(EMsg["DB-ER1019"], err.message));
                                            });
                                            reject(new Error(sprintf(EMsg["ER1019"], offer.id, err.message)));
                                        }

                                        let result = {
                                            id: offer.id,
                                            security_token: securityToken,
                                            timestamp: timestamp,
                                            message: sprintf(EMsg["LOG1005"], offer.id)
                                        };

                                        if (status === 'pending') {
                                            result.message = sprintf(EMsg["LOG1004"], offer.id);
                                        }

                                        offer.data('agent', 'bot');
                                        offer.data('security_token', securityToken);
                                        offer.data('type', 'withdraw');
                                        offer.data('command_id', input.data.id);

                                        reql.inventory.saveOffer(this.getOfferJson(offer))
                                        .then(res => {
                                            return res;
                                        })
                                        .then(res => {
                                            reql.inventory.updateItems(process.env.BOT_WORKER_ID, items, {
                                                state: ItemState.WithdrawalAwaiting,
                                                sent_offer_id: offer.id
                                            })
                                            .then(res => {
                                                resolve(result);
                                            })
                                            .catch(err => {
                                                reql.bot.log(sprintf(EMsg["DB-ER1002"], offer.id, err.message));
                                            });
                                        })
                                        .catch(err => {
                                            reql.bot.log(sprintf(EMsg["DB-ER1003"], offer.id, err.message));
                                        });
                                    });
                                }); // End offer.send        
                            }); //End getOwnInventory
                    })
                    .catch(err => {
                        reql.bot.log(sprintf(EMsg["DB-ER1004"], offer.id, err.message));
                    }); //End reql.inventory.getUserItems
            }); //End getUserDetails
    });
};

Bot.prototype.getOfferNewItems = function (offer) {
    return new Promise((resolve, reject) => {
        function fetchTradeItems(attempt) {
            if (attempt >= 5) {
                reql.bot.log(sprintf(EMsg["ER1020"], offer.id, attempt));
                reject(new Error(sprintf(EMsg["ER1020"], offer.id, attempt)));
                return;
            }

            offer.getReceivedItems((err, items) => {
                if (err !== null) {
                    setTimeout(fetchTradeItems, 5000, ++attempt);
                    return;
                }

                if (offer.itemsToReceive.length === items.length) {
                    resolve(items);
                } else {
                    setTimeout(fetchTradeItems, 5000, ++attempt);
                    return;
                }
            });
        }
        fetchTradeItems(0);
    });
};

require('./tradestates.js');