var restify = require('restify');
var builder = require('botbuilder');
var request = require('request-promise').defaults({ encoding: null });
var azure = require("botbuilder-azure");

// ********************SETUP************************

// Cosmos DB

var documentDbOptions = {
    host: process.env.documentDb_host,
    masterKey: process.env.documentDb_masterKey,
    database: process.env.documentDb_database,
    collection: process.env.documentDb_collection
};

var docDbClient = new azure.DocumentDbClient(documentDbOptions);
var cosmosStorage = new azure.AzureBotStorage({ gzipData: false }, docDbClient);

// **************************************************

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Javascript string interpolation
// https://mzl.la/2JJfWWf

// Typescript let vs var
// http://bit.ly/2l4Tj0J

// Conversation flow 
// https://bit.ly/2l4507R

// Create a request for recognition
// https://bit.ly/2l457jN

// Azure cognitive services
// https://bit.ly/2JvTAsc

// Azure cognitive services npm
// http://bit.ly/2t1OZ5R

// Computer Vision API - v2.0
// http://bit.ly/2y43jAq

// ComputerVisionAPIClient
// http://bit.ly/2LLvyFZ

// ImageAnalysis
// http://bit.ly/2HIlkE6

// BotBuilder-Samples
// http://bit.ly/2JGki0z

// Azure-SDK-for-Node
// http://bit.ly/2sRApyt

// Promise Node JS
// http://bit.ly/2JvdGCK

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector, [
    function (session) {
        session.send("Welcome to the receipts analytic service.");
        builder.Prompts.choice(session, "What do you want to do?", "Upload|Recognize", {listStyle: builder.ListStyle.button});
    }
]).set('storage', cosmosStorage);

bot.dialog('askForFile', [
    function (session) {
        builder.Prompts.attachment(session, "Upload picture");
    },
    function (session, results) {
        var msg = session.message;
        if (msg.attachments.length) {
            // Message with attachment, proceed to download it.
            // Skype & MS Teams attachment URLs are secured by a JwtToken, so we need to pass the token from our bot.
            let files = [];
            msg.attachments.forEach(function (attachment) {
                let fileDownload = request(attachment.contentUrl);

                fileDownload.then(
                    function (response) {
                        // Send reply with attachment type & size
                        var reply = new builder.Message(session)
                            .text('Attachment of %s type and size of %s bytes received.',
                            attachment.contentType, response.length);
                        session.send(reply);
                        files.push({ attachment: attachment, imageAnalysis: false });
                        session.beginDialog('recognize');
                    }).catch(function (err) {
                    console.log('Error downloading attachment:',
                        { statusCode: err.statusCode, message: err.response.statusMessage });
                });
            });
            (session.userData.files = session.userData.files || []).concat(files);
        } else {
            // No attachments were sent
            var reply = new builder.Message(session)
                .text('Hi there! This sample is intented to show how can I receive attachments but no attachment was sent to me. Please try again sending a new message with an attachment.');
            session.send(reply);
        }        
        
        session.endDialogWithResult();
    },
]).triggerAction({
    matches: /^u(pload)?$/i,
    onSelectAction: (session, args, next) => {
        session.beginDialog(args.action, next);
    }
});

bot.on('conversationUpdate', function (message) {
    console.log(message);
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, '/');
            }
        });
    }
});

bot.dialog('recognize', [ //recognizes user's attachments
    function (session, args) {        
        const ComputerVisionAPIClient = require('azure-cognitiveservices-computervision');
        const CognitiveServicesCredentials = require('ms-rest-azure').CognitiveServicesCredentials;
        let CognitiveCredentials = new CognitiveServicesCredentials(process.env.CognitiveServicesSubscriptionKey);
        // http://bit.ly/2t1OZ5R 
        let client = new ComputerVisionAPIClient(CognitiveCredentials, 'northeurope');
        
        let files = (session.userData.files = session.userData.files || []);               

        files.forEach(function (value, index) {
            if (value.imageAnalysis != false) {                
                return;
            }
            var file = session.userData.files[index].attachment;
            var contentUrl = file.contentUrl;

            let options = {};
            var promiseAnalyze = client.analyzeImage(contentUrl);
            promiseAnalyze.then(function (result) {
                session.send('Image analyzed');
                return ({ cognitiveFunction: 'analyzeImage', result: result, options: {} });
            }, function (err) {
                    session.send(`Error occured ${err}.`);
                });

            options = {};
            var promiseDescribe = client.describeImage(contentUrl);
            promiseDescribe.then(function (result) {
                session.send('Image described');
                return ({ cognitiveFunction: 'describeImage', result: result, options: {} });
            }, function (err) {
                    session.send(`Error occured ${err}.`);
                });

            options = {};
            options = { width: 76, height: 152, smartCropping: true };
            var promiseGetThumbnail = client.generateThumbnail(options.width, options.height, contentUrl, { smartCropping: options.smartCropping });
            promiseGetThumbnail.then(function (result) {
                session.send('Thumbnail generated.');
                return ({ cognitiveFunction: 'generateThumbnail', result: result, options: options });
            }, function (err) {
                    session.send(`Error occured ${err}.`);
                });

            options = {};
            options = { detectOrientation: true, language: 'unk' };
            var promiseRecognizePrintedText = client.recognizePrintedText(options.detectOrientation, contentUrl, { language: options.language });
            promiseRecognizePrintedText.then(function (result) {
                session.send('Text recognized.');
                return ({ cognitiveFunction: 'recognizePrintedText', result: result, options: options });
            }, function (err) {
                    session.send(`Error occured ${err}.`);
                });

            Promise
            .all([promiseAnalyze, promiseDescribe, promiseGetThumbnail, promiseRecognizePrintedText])
            .then(function (result) {
                session.userData.files[index] = { attachment: file, imageAnalysis: result };
                (session.userData.recognitions = session.userData.recognitions || []).push(result);
                session.endDialogWithResult(result);
            });
        });        
    }
]).triggerAction({
    matches: /^r(ecognize)?$/i,
    onSelectAction: (session, args, next) => {
        session.beginDialog(args.action, next);
    }
});
