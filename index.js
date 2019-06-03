const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const messenger = require("./messenger");
const spotify = require("./spotify");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server available on port ${port}`);
});

app.get("/webhook", (req, res) => {
    // Your verify token. Should be a random string.
    const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;

    // Parse the query params
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
        // Checks the mode and token sent is correct
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            // Responds with the challenge token from the request
            console.log("Responded to Facebook verification request");
            return res.status(200).send(challenge);
        }
    }
    // Responds with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
    // Checks this is an event from a page subscription
    if (req.body.object === "page") {
        // Iterates over each entry - there may be multiple if batched
        req.body.entry.forEach(entry => {
            // entry.messaging is an array, but
            // will only ever contain one message, so we get index 0
            const event = entry.messaging[0];
            const senderId = event.sender.id;

            // Check if the event is a message or postback and
            // pass the event to the appropriate handler function
            if (event.message) {
                messenger.receivedMessage(event);
            }
            else if (event.postback) {
                messenger.receivedPostback(event);
            }
        });

        // Returns a '200 OK' response to all requests
        res.sendStatus(200);
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }
});

app.get("/spotify", (req, res) => {
    spotify.receivedAuthCode(req.query.code);
    res.status(200).send();
});