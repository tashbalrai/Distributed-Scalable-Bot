var
    EventEmitter = require('events').EventEmitter,
    Steam = require('steam'),
    SteamWebLogOn = require('steam-weblogon'),
    GetSteamAPIKey = require('steam-web-api-key'),
    SteamTotp = require('steam-totp'),
    sprintf = require('sprintf-js').sprintf,
    EMsg = require('./errors.js'),
    reql = require('./../reql/reql.js'),
    Util = require('util'),
    Path = require('path');

function Bot(options) {
    if (!options || typeof options !== 'object') {
        throw new Error("Bot options must be an object.");
    }

    if (!options.hasOwnProperty('account')
        || !options.hasOwnProperty('password')
        || !options.hasOwnProperty('shared_secret')
        || !options.hasOwnProperty('identity_secret')
        || !options.hasOwnProperty('account')
    ) {
        reql.bot.log(EMsg["ER1030"]);
        throw new Error(EMsg["ER1030"]);
    }

    this._options = options;

    EventEmitter.call(this);
    this._client = new Steam.SteamClient();
    this._user = new Steam.SteamUser(this._client);
    this._web = new SteamWebLogOn(this._client, this._user);

    //restart the bot if disconnected from server or got logged off automatically.
    this._client.on('error', (err) => {
        this.emit('error', err);
    });
    this._client.on('loggedOff', () => {
        this.emit('loggedOff');
    });

}

Util.inherits(Bot, EventEmitter);
module.exports = Bot;

Bot.prototype.getClient = function () {
    return this._client;
};

Bot.prototype.getUser = function () {
    return this._user;
};

Bot.prototype.getWeb = function () {
    return this._web;
};

Bot.prototype.getBotDetails = function () {
    var options = {
        account_name: this._options.account,
        password: this._options.password,
        two_factor_code: SteamTotp.generateAuthCode(this._options.shared_secret)
    }

    return options;
};

Bot.prototype.logIn = function () {
    this.getClient().connect();
    this.getClient().on('connected', () => {
        this.getUser().logOn(this.getBotDetails());
    });

    this.getClient().on('logOnResponse', (logonResp) => {
        if (logonResp.eresult === Steam.EResult.OK) {
            this.emit('loggedIn', logonResp);
            this.getWeb().webLogOn((sessionID, newCookie) => {
                this._sessID = sessionID;
                this._wcookie = newCookie;
                GetSteamAPIKey({
                    sessionID: sessionID,
                    webCookie: newCookie
                }, (err, APIKey) => {
                    this._APIKey = APIKey;
                    this.setupTradeManager(sessionID, newCookie, APIKey);
                });
            });
        } else {
            this.emit('loginFailed', logonResp);
        }
    });
};

require('./trademanager.js');