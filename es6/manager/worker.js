const
    Bot = require('./../bot/bot.js'),
    sprintf = require('sprintf-js').sprintf,
    EMsg = require('./../bot/errors.js'),
    reql = require('./../reql/reql.js');

let
    bot = new Bot(JSON.parse(process.argv[2]));


bot.emit('debug', `Worker bot started PID => ${process.pid}`);

bot.logIn();

//Events
bot.on('loggedIn', response => {
    bot.emit('debug', `Logged in`);
});
bot.on('tradeManagerReady', () => {
    bot.emit('debug', `Trade manager setup completed.`);
});
bot.on('confirmationPollingStarted', () => {
    bot.emit('debug', `Confirmation polling started.`);
    //Send ready signal to the manager.
    send({
        to: "manager",
        data: {
            command: "ready",
            input_data: {
                bot: process.env.BOT_WORKER_ID
            }
        }
    });
});
bot.on('error', (err) => {
    if (err.message.indexOf('HTTP error 503') !== -1) {
        //service is unavailalbe lets
        exitWorker();
    } else if (err.message.indexOf('Disconnected') !== -1) {
        //bot got disconnected.
        exitWorker();
    } else {
        reql.bot.log(sprintf(EMsg["ER1031"], process.env.BOT_WORKER_ID, err.message));
    }
});
bot.on('loginFailed', (resp) => {
    reql.bot.log(sprintf(EMsg["ER1031"], process.env.BOT_WORKER_ID, JSON.stringify(resp)));
});
bot.on('debug', msg => {
    console.log(`BOT[${process.env.BOT_WORKER_ID}] => ${msg}`);
});
//Events end.

function send(msg) {
    bot.emit('debug', `completing command ${msg.data.command}`);
    process.send(msg);
}

process.on('message', (msg) => {
    if (!msg.data || !msg.data.hasOwnProperty('command')) {
        sendError(msg, { message: EMsg["ER1032"] });
        return;
    }

    bot.emit('debug', `processing command ${msg.data.command}`);

    // Start command getUserInventory
    if ('getuserinventory' === msg.data.command.toLowerCase()) {
        bot.getUserInventory(msg).then(result => {
            sendSuccess(msg, result);
        }).catch(err => {
            sendError(msg, err);
        });
    } else if ('deposit' === msg.data.command.toLowerCase()) {
        //send offer to partner to receive his items.
        bot.deposit(msg).then(result => {
            sendSuccess(msg, result);
        }).catch(err => {
            sendError(msg, err);
        });
    } else if ('withdraw' === msg.data.command.toLowerCase()) {
        //Create send offer functionality.
        bot.withdraw(msg).then(result => {
            sendSuccess(msg, result);
        }).catch(err => {
            sendError(msg, err);
        });
    } else {
        sendError(msg, { message: EMsg["ER1033"] });
    }
});

function exitWorker() {
    //We should not restart it too early otherwise steam will lock the account.
    //Let's set it to 10 sec.
    setTimeout(() => {
        //May be node-steam connected it self to steam again. No restart needed.
        if (!bot.getClient().loggedOn) {
            //Let's restart this worker by exiting it.
            process.exit();
        }
    }, 10000);
}

function sendSuccess(msg, result) {
    msg.data.output_data = {
        error: null,
        result: result
    };

    send(msg);
}

function sendError(msg, error) {
    msg.data.output_data = {
        error: error.message,
        result: null
    };

    send(msg);
}