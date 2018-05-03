var
    EventEmitter = require('events').EventEmitter,
    Path = require('path'),
    reql = require('./../reql/reql.js'),
    Bot = require('./bot.js'),
    TradeOfferManager = require('steam-tradeoffer-manager'),
    sprintf = require('sprintf-js').sprintf,
    EMsg = require('./errors.js'),
    OfferState = TradeOfferManager.ETradeOfferState,
    ItemState = require('./itemstate.js');

Bot.prototype.sentOfferChanged = function (offer, oldState) {
    let type = offer.data('type');
    if (type === 'deposit') {
        if (offer.state === OfferState.Accepted) {
            this.depositOfferAccepted(offer);
        } else if (offer.state === OfferState.InvalidItems) {
            this.depositOfferInvalidItems(offer);
        } else if (offer.state === OfferState.Expired
            || offer.state === OfferState.Canceled
            || offer.state === OfferState.Declined
            || offer.state === OfferState.Countered) {
            this.depositOfferNotAccepted(offer);
        } else {
            reql.bot.log(sprintf(EMsg["ER1021"], offer.id));
        }
    } else if (type === 'withdraw') {
        if (offer.state === OfferState.Accepted) {
            this.withdrawOfferAccepted(offer);
        } else if (offer.state === OfferState.InvalidItems) {
            this.withdrawOfferInvalidItems(offer);
        } else if (offer.state === OfferState.Expired
            || offer.state === OfferState.Canceled
            || offer.state === OfferState.Declined
            || offer.state === OfferState.Countered) {
            this.withdrawOfferNotAccepted(offer);
        } else if (offer.state === OfferState.Active) {
            this.withdrawOfferActive(offer);
        } else {
            reql.bot.log(sprintf(EMsg["ER1022"], offer.id));
        }
    } else {
        reql.bot.log(sprintf(EMsg["ER1023"], offer.id));
    }
};

Bot.prototype.pollFailure = function () { };
Bot.prototype.pollSuccess = function () { };
Bot.prototype.newOffer = function (offer) {
    //we do not deal with direct offer for the moment.
    offer.cancel();
    reql.bot.log(sprintf(EMsg["ER1024"], offer.partner.getSteamID64(), offer.id));
};

Bot.prototype.depositOfferAccepted = function (offer) {
    this.getOfferNewItems(offer)
        .then(items => {
            //Got items
            let invItems = [];
            for (let i = 0; i < items.length; i += 1) {
                invItems[i] = {
                    asset_id: items[i].id,
                    market_hash_name: items[i].market_hash_name,
                    image: items[i].getImageURL(),
                    owner: offer.partner.getSteamID64(),
                    bot: process.env.BOT_WORKER_ID,
                    offer_id: offer.id,
                    state: ItemState.Active
                };
            }
            return invItems;
        })
        .then(invItems => {
            //save inventory
            reql.inventory.saveItems(invItems)
                .then(result => {
                    return result;
                })
                .catch(err => {
                    reql.bot.log(sprintf(EMsg["DB-ER1005"], offer.id, err.message));
                });
        })
        .then(result => {
            //update offer to accepted state.
            reql.inventory.updateOffer(offer.id, {
                state: offer.state,
                trade_id: offer.tradeID
            })
                .then(result => {
                    //update the command output_data to reflect the status.
                    let data = {
                        result: {
                            id: offer.id,
                            trade_id: offer.tradeID,
                            security_token: offer.data('security_token'),
                            message: sprintf(EMsg["LOG1001"], offer.id),
                            done: true
                        }
                    };

                    reql.bot.updateCommand(offer.data('command_id'), data)
                        .then(result => {
                            reql.bot.log(sprintf(EMsg["LOG1001"], offer.id));
                        })
                        .catch(err => {
                            reql.bot.log(sprintf(EMsg["DB-ER1006"], offer.id, err.message));
                        });
                })
                .catch(err => {
                    reql.bot.log(sprintf(EMsg["DB-ER1007"], offer.id, offer.state, offer.tradeID, err.message));
                });
        })
        .catch(emsg => {
            reql.inventory.updateOffer(offer.id, {
                state: offer.state,
                trade_id: offer.tradeID,
                is_bad: true
            })
                .then(() => {
                    //update command output_data to reflect the declined status.
                    reql.bot.updateCommand(offer.data('command_id'), { error: sprintf(EMsg["1025"], offer.id) })
                        .catch(err => {
                            reql.bot.log(sprintf(EMsg["DB-ER1008"], offer.id, err.message));
                        })
                })
                .catch(err => {
                    reql.bot.log(sprintf(EMsg["DB-ER1009"], offer.id, err.message));
                });
        });
}

Bot.prototype.depositOfferNotAccepted = function (offer) {
    //update offer to countered state.
    offer.cancel();
    reql.inventory.updateOffer(offer.id, {
        state: offer.state,
        trade_id: offer.tradeID
    }).then(result => {
        //update command output_data to reflect the expired status.
        reql.bot.log(sprintf(EMsg["ER1026"], offer.id, OfferState[offer.state]))
            .catch(err => {
                console.log(err);
            });
        reql.bot.updateCommand(offer.data('command_id'), { error: sprintf(EMsg["ER1026"], offer.id, OfferState[offer.state]) })
            .catch(err => {
                reql.bot.log(sprintf(EMsg["DB-ER1010"], OfferState[offer.state], offer.id, err.message));
            });
    })
    .catch(err => {
        reql.bot.log(sprintf(EMsg["DB-ER1011"], OfferState[offer.state], offer.id, err.message));
    });
}

Bot.prototype.depositOfferInvalidItems = function (offer) {
    //update offer to invalid items state.
    reql.inventory.updateOffer(offer.id, {
        state: offer.state,
        trade_id: offer.tradeID
    }).then(result => {
        //update command output_data to reflect the invalid items status.
        reql.bot.updateCommand(offer.data('command_id'), { error: sprintf(EMsg["ER1027"], offer.id, OfferState[offer.state]) })
            .catch(err => {
                reql.bot.log(sprintf(EMsg["DB-ER1012"], offer.id, OfferState[offer.state], err.message));
            });
    })
        .catch(err => {
            reql.bot.log(sprintf(EMsg["DB-ER1013"], offer.id, OfferState[offer.state], err.message));
        });
}

Bot.prototype.withdrawOfferAccepted = function (offer) {
    reql.inventory.updateOffer(offer.id, {
        state: offer.state,
        trade_id: offer.tradeID
    }).then(result => {
        reql.bot.log(sprintf(EMsg["LOG1002"], offer.id));
        reql.inventory.updateItemsByFilters({
            bot: process.env.BOT_WORKER_ID,
            owner: offer.partner.getSteamID64(),
            sent_offer_id: offer.id,
            state: ItemState.WithdrawalAwaiting
        }, {
                state: ItemState.Deleted
            })
            .then(res => {
                //update command output_data to reflect the invalid items status.
                let result = {
                    result: {
                        id: offer.id,
                        trade_id: offer.tradeID,
                        security_token: offer.data('security_token'),
                        message: sprintf(EMsg["LOG1002"], offer.id),
                        done: true
                    }
                };

                reql.bot.updateCommand(offer.data('command_id'), result)
                    .catch(err => {
                        reql.bot.log(sprintf(EMsg["DB-ER1014"], offer.id, err.message));
                    });
            })
            .catch(err => {
                reql.bot.log(sprintf(EMsg["DB-ER1015"], offer.id, err.message));
            })
    }).catch(err => {
        reql.bot.log(sprintf(EMsg["DB-ER1016"], offer.id, err.message));
    });
}

Bot.prototype.withdrawOfferNotAccepted = function (offer) {
    //Since user tried to counter/cancel/decline withdrawal offer or the withdrawal offer we sent expired.
    //Either due to mistake or trying to hack our system.
    //We cancel such offer and reset the item back to previous state.
    //so that user can retry the withdrawl in case accidental offer state change.
    reql.inventory.updateItemsByFilters({
        bot: process.env.BOT_WORKER_ID,
        owner: offer.partner.getSteamID64(),
        sent_offer_id: offer.id,
        state: ItemState.WithdrawalAwaiting
    }, {
            state: ItemState.Active
        })
        .then(res => {
            offer.cancel();
            //update command output_data to reflect the invalid items status.
            reql.bot.log(sprintf(EMsg["ER1028"], offer.id, OfferState[offer.state]));
            reql.bot.updateCommand(offer.data('command_id'), { error: sprintf(EMsg["ER1028"], offer.id, OfferState[offer.state]) })
                .catch(err => {
                    reql.bot.log(sprintf(EMsg["DB-ER1017"], OfferState[offer.state], offer.id, err.message));
                });
        })
        .catch(err => {
            //log error if update items by filters is unsuccessful
            reql.bot.log(sprintf(EMsg["DB-ER1018"], OfferState[offer.state], offer.id, err.message));
        });
}

Bot.prototype.withdrawOfferActive = function (offer) {
    // Withdraw offer we sent with confirmation awaiting is now active
    // update command output_data to reflect the invalid items status.
    reql.bot.log(sprintf(EMsg["LOG1005"], offer.id));
    reql.bot.updateCommand(offer.data('command_id'), { 
        result: {
            message: sprintf(EMsg["LOG1005"], offer.id)
        }  
    })
}

Bot.prototype.withdrawOfferInvalidItems = function (offer) {
    reql.bot.log(sprintf(EMsg["ER1029"], offer.id, OfferState[offer.state]));
}
