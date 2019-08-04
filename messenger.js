const spotify = require("./spotify");
const Request = require("request-promise");

const Commands = {
    ADD_TRACK: "ADD_TRACK",
    SEARCH_MORE: "SEARCH_MORE"
}

class Messenger {
    receivedMessage(event) {
        // Inform the user that we've read their message 
        this.sendReadReceipt(event.sender.id);

        // Here I'm just treating quick-reply buttons as postback buttons, to avoid repeating code
        if (event.message.quick_reply != null) {
            return this.receivedPostback({ sender: event.sender, postback: event.message.quick_reply });
        }
        else {
            this.searchMusic(event.sender.id, event.message.text);
        }
    }

    async receivedPostback(event) {
        const payload = JSON.parse(event.postback.payload);
        switch (payload.command) {
            case Commands.ADD_TRACK: {
                // Add the track (contained in the payload) to the Spotify queue.
                // Note: We created this payload data when we created the button in searchMusic()
                this.sendTypingIndicator(event.sender.id, true);
                await spotify.queueTrack(payload.track);
                this.sendTypingIndicator(event.sender.id, false);

                // All done, notify the user
                this.sendMessage(event.sender.id, { text: "Thanks! Your track has been added to the Jukebox playlist" });
                break;
            }
            case Commands.SEARCH_MORE: {
                // Call the search method again with the parameters in the payload
                this.searchMusic(event.sender.id, payload.terms, payload.skip, payload.limit);
                break;
            }
        }
    }

    async searchMusic(sender, terms, skip = 0, limit = 10) {
        // Begin a 'typing' indicator to show that we're working on a response
        this.sendTypingIndicator(sender, true);

        // We want to pull results from Spotify 'paginated' in batches of 20.
        // We'll order those by popularity and present the user with the top few results
        const queryBegin = skip - (skip % 20);
        const queryEnd = queryBegin + 20;
        const result = await spotify.searchTracks(terms, queryBegin, queryEnd);

        if (result.items.length > 1) {
            // If there are enough remaining results, we can give the user
            // a 'More' button to pull further results
            const remainingResults = result.total - limit - skip;
            const showMoreButton = (remainingResults > 0);

            // Sort the results by popularity
            result.items.sort((a, b) => (b.popularity - a.popularity));
            // Take the correct subset of tracks according to skip and limit
            result.items = result.items.slice(skip, skip + limit);

            const message = {
                attachment: {
                    type: "template",
                    payload: {
                        template_type: "generic",
                        elements: [],
                    }
                },
                quick_replies: []
            };

            // Add the more button if there were enough results. We provide the button
            // with all of the data it needs to be able to call this search function again and
            // get the next batch of results
            if (showMoreButton) {
                message.quick_replies = [{
                    content_type: "text",
                    title: "More Results",
                    payload: JSON.stringify({ 
                        command: Commands.SEARCH_MORE, 
                        terms: terms, 
                        skip: skip + limit, 
                        limit: limit 
                    })
                }];
            }

            // Build a list of buttons for each result track
            message.attachment.payload.elements = result.items.map((track) => {
                this.sortTrackArtwork(track);
                return {
                    title: track.name,
                    subtitle: this.generateArtistList(track),
                    buttons: [this.generatePostbackButton("Add", { command: Commands.ADD_TRACK, track: track.id })],
                    image_url: track.album.images.length > 0 ? track.album.images[0].url : ""
                };
            });

            // Send the finished result to the user
            await this.sendMessage(sender, message);
        }
        // Cancel the 'typing' indicator
        this.sendTypingIndicator(sender, false);
    }
    
    generatePostbackButton(title, payload) {
        return {
            type: "postback",
            title: title,
            payload: JSON.stringify(payload)
        };
    }

    generateArtistList(track) {
        // Assemble the list of artists as a comma separated list
        let artists = "";
        track.artists.forEach((artist) => {
            artists = artists + ", " + artist.name;
        });
        artists = artists.substring(2);
        return artists;
    }

    sortTrackArtwork(track) {
        // Sort the album images by size order ascending
        track.album.images.sort((a, b) => {
            return b.width - a.width;
        });
    }

    getSendOptions(recipient) {
        const result = {
            uri: "https://graph.facebook.com/v2.6/me/messages",
            qs: {
                access_token: process.env.MESSENGER_ACCESS_TOKEN
            },
            body: {
                recipient: {
                    id: recipient
                }
            },
            json: true
        };
        return result;
    }

    sendTypingIndicator(recipient, typing) {
        const options = this.getSendOptions(recipient);
        options.body.sender_action = typing ? "typing_on" : "typing_off";

        return this.send(options);
    }

    sendReadReceipt(recipient) {
        const options = this.getSendOptions(recipient);
        options.body.sender_action = "mark_seen";

        return this.send(options);
    }

    sendMessage(recipient, message) {
        const options = this.getSendOptions(recipient);
        options.body.message = message;

        return this.send(options);
    }

    async send(payload) {
        try {
            await Promise.resolve(Request.post(payload));
        }
        catch (error) {
            console.error(`Delivery to Facebook failed (${error})`);
        }
    }
}

module.exports = new Messenger();