const EventEmitter = require('eventemitter3');
const cors = require("cors");
const express = require("express");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { body, query, validationResult } = require("express-validator");

const Config = require("./config/config.json");
const AUTH_PUBLIC_KEY = fs.readFileSync(__dirname + '/config' + '/public.key');

const PORT = Config.Port;
const CLIENT_WHITELIST = Config.ClientWhiteList;

let emitter = new EventEmitter();
let app = express();

app.use(cors());
app.use(express.json());

function extractTokenFromHeader(header) {
    return header.split(" ")[1];
}

function subscribeToPublicChannel(req, res) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
    });

    const onWelcome = () => {
        let welcome = {
            sender: "[server]",
            channel: req.params.name,
            message: "connected to " + req.params.name + " channel."
        }
        res.write(`data: ${JSON.stringify(welcome)}\n\n`);
    }

    const onError = () => {
        let err = {
            sender: "[server]",
            channel: req.params.name,
            message: "disconnected to " + req.params.name + " channel."
        }
        res.write(`data: ${JSON.stringify(err)}\n\n`);
    }

    const onMessage = data => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    const eventName = "message";

    emitter.once("open", onWelcome);
    emitter.emit("open");

    emitter.on(eventName, onMessage);
    emitter.on("error", onError);

    req.on("close", () => {
        emitter.removeListener(eventName, onMessage)
        emitter.removeListener("error", onError)
        emitter.removeListener("open", onWelcome)
        res.end();
    });
}

function subscribeToUserInbox(req, res) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
    });

    const onWelcome = () => {
        let welcome = {
            sender: "[server]",
            channel: req.params.name,
            message: "connected to " + req.params.id + " inbox."
        }
        res.write(`data: ${JSON.stringify(welcome)}\n\n`);
    }

    const onError = () => {
        let err = {
            sender: "[server]",
            channel: req.params.name,
            message: "disconnected to " + req.params.id + " inbox."
        }
        res.write(`data: ${JSON.stringify(err)}\n\n`);
    }

    const onMessage = data => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    const eventName = "message-inbox-" + req.params.id;

    emitter.once("open", onWelcome);
    emitter.emit("open");

    emitter.on(eventName, onMessage);
    emitter.on("error", onError);

    req.on("close", () => {
        emitter.removeListener(eventName, onMessage)
        emitter.removeListener("error", onError)
        emitter.removeListener("open", onWelcome)
        res.end();
    });
}

function pushMessageToPublicChannel(req, res, payload) {
    const eventName = "message";
    const result = Object.assign(req.body, {
        sender: {
            id: payload.sub,
            name: payload.name          //todo : change to avatarName here..
        }
    });
    emitter.emit(eventName, result)
    res.json({ message: "success" })
}

function pushMessageToUserInbox(req, res, payload) {
    const eventName = "message-inbox-" + req.params.id;
    const result = Object.assign(req.body, {
        sender: {
            id: payload.sub,
            name: payload.name          //todo : change to avatarName here..
        }
    });
    emitter.emit(eventName, result)
    res.json({ message: "success" })
}

// Protect every route with access token
app.use([
    query("client_id").isIn(CLIENT_WHITELIST)
],
(req, res, next) => {
    try {
        validationResult(req).throw();

        if (!req.headers.authorization) {
            return res.status(403).json({ error: 'No credentials sent!' });
        }
        next();
    }
    catch (err) {
        return res.status(400).send();
    }
});

//Subscribe (public channel)
app.get("/subscribe/channels/public/:name", (req, res) => {
    let token = extractTokenFromHeader(req.headers.authorization);

    jwt.verify(token, AUTH_PUBLIC_KEY, (err, payload) => {
        if (err) {
            res.status(401).send({ auth: false, message: 'Failed to authenticate token.' });
            return;
        }

        subscribeToPublicChannel(req, res);
    });
});

//Subscribe to user inbox
app.get("/subscribe/channels/users/:id/inbox", (req, res) => {
    let token = extractTokenFromHeader(req.headers.authorization);

    jwt.verify(token, AUTH_PUBLIC_KEY, (err, payload) => {
        if (err) {
            res.status(401).send({ auth: false, message: 'Failed to authenticate token.' });
            return;
        }

        if (payload.sub == req.params.id) {
            subscribeToUserInbox(req, res);
        }
        else {
            res.status(401).send({ auth: false, message: 'Failed to authenticate token.' });
        }
    });
});

// Push message to public channel
app.post("/message/channels/public", [
    body("channel").exists(),
    body("event").exists(),
    body("message").exists(),
    body("sender").not().exists()
],
(req, res) => {
    try {
        validationResult(req).throw();

        let token = extractTokenFromHeader(req.headers.authorization);

        jwt.verify(token, AUTH_PUBLIC_KEY, (err, payload) => {
            if (err) {
                res.status(401).send({ auth: false, message: 'Failed to authenticate token.' });
                return;
            }

            pushMessageToPublicChannel(req, res, payload);
        });
    }
    catch (err) {
        res.status(400).send();
    }
});

// Push message to user inbox
app.post("/message/channels/users/:id/inbox", [
    body("event").exists(),
    body("message").exists(),
    body("channel").not().exists(),
    body("sender").not().exists()
],
(req, res) => {
    try {
        validationResult(req).throw();

        let token = extractTokenFromHeader(req.headers.authorization);

        jwt.verify(token, AUTH_PUBLIC_KEY, (err, payload) => {
            if (err) {
                res.status(401).send({ auth: false, message: 'Failed to authenticate token.' });
                return;
            }

            pushMessageToUserInbox(req, res, payload);
        });
    }
    catch (err) {
        res.status(400).send();
    }
});

//TODO
//Subscribe to private channel (only specific participant can see the message)

//array example
// http://server/url?array=["foo","bar"] //array = field name

//user express validator is array
/*
app.get("/subscribe/channels/private", (req, res) => {

    try {

    //verify jwt in header here...
    //verify payload of sub to make sure it in the req-params participant


    //then
    //participant seperate by underscore (might need express validator to make an array for us)
    //ex. 502049234_324092384234 (we need to sort it service side)

    //seperate them then sort and concat with - (minus) again..
    //and use that with event name : message-private-(participant with - (minus) here..)

    //then handle normal keep alive
    //down here..
    }
    catch (err) {
        //bad request
    }
});
*/

app.listen(process.env.PORT || PORT, () => {
    console.log("Chat server has started...");
});
