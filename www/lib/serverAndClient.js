// serverAndClient.js
// globals for client and server

if (Meteor.isClient) {
    ctx = null; // The global client state
    layers = {}; // contains almost all information about attributes
    googlemap = null; // our main googlemap instance
    colormaps = {};
}

if (Meteor.isServer) {

    SERVER_DIR = Meteor.settings.server.SERVER_DIR;
    TEMP_DIR = Meteor.settings.server.TEMP_DIR;
    IS_MAIN_SERVER = Meteor.settings.server.jobs.IS_MAIN_SERVER;
    IS_CALC_SERVER = Meteor.settings.server.jobs.IS_CALC_SERVER;
    MAIN_MONGO_URL = Meteor.settings.server.jobs.MAIN_MONGO_URL;

    var exec = Npm.require('child_process').exec;
    var process = Npm.require('process');
    
    Meteor.startup(function () {
        process.env.MAIL_URL = 'smtp://hexmap%40ucsc.edu:Juno6666@smtp.gmail.com:587';
    });
    sendMail = function (users, subject, msg, callback) {

        // Send mail to user(s) with the given subject and message.
        // This can take one username or an array of usernames.
        var command =
            'echo "'
            + msg
            + '" | '
            + 'mail -s "'
            + subject
            + '" -S from="'
            + ADMIN_EMAIL
            + '" '
          //+ '" -S from="hexmap@ucsc.edu" '
            + users.toString();
        
        console.log('sendMail():', command);
        
        // Don't send from localhost, macOS mail doesn't support the 'from' option.
        if (URL_BASE.indexOf('localhost') > -1) return;
        
        exec(command, function (error, stdout, stderr) {
            if (error) {
                var errMsg = 'Error on sendMail(): ' + error;
                console.log(errMsg);
                if (callback) { callback(errMsg); }
            } else {
                if (callback) { callback(); }
            }
        });
    }
}
// Some global settings available to server and client.
URL_BASE = Meteor.settings.public.URL_BASE;
VIEW_DIR = Meteor.settings.public.VIEW_DIR;
LAYOUT_INPUT_DIR = Meteor.settings.public.LAYOUT_INPUT_DIR;
FEATURE_SPACE_DIR = Meteor.settings.public.FEATURE_SPACE_DIR;
ADMIN_EMAIL = Meteor.settings.public.ADMIN_EMAIL;
GOOGLE_API_KEY = Meteor.settings.public.GOOGLE_API_KEY;

if (Meteor.settings.public.DEV === 'yes') {//no booleans with strict JSON
    DEV = true; //development functionality will be included
} else {
    DEV = false;
}

// TODO test logic should not be in production code
TEST_DATA_DIR = '/Users/swat/dev/hexagram/tests/pyUnittest/testData/';

/*
// Deny all client-side updates to user documents
Meteor.users.deny({
  update() { return true; }
});
*/
