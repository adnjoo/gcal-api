const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

// Load OAuth2 client
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = 'token.json';

// Load client secrets
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.error('Error loading credentials:', err);
    authorize(JSON.parse(content), createEvent);
});

function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Load token or request new one
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getAccessToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
    console.log('Authorize this app by visiting:', authUrl);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter the code from that page: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
            callback(oAuth2Client);
        });
    });
}

function createEvent(auth) {
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
        summary: 'Test Event',
        location: 'Online',
        description: 'Created via Node.js',
        start: {
            dateTime: '2025-03-22T10:00:00-07:00',
            timeZone: 'America/Los_Angeles',
        },
        end: {
            dateTime: '2025-03-22T11:00:00-07:00',
            timeZone: 'America/Los_Angeles',
        },
    };

    calendar.events.insert({
        calendarId: 'primary',
        resource: event,
    }, (err, res) => {
        if (err) return console.error('Error creating event:', err);
        console.log('Event created:', res.data.htmlLink);
    });
}
