/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

try {
  var express = require('express');
} catch (err) {
  console.log('Error: This example requires the express package. Please run:');
  console.log('npm install');
  process.exit(1);
}
var Verifier = require('receiptverifier').receipts.Verifier;
var app = express();
var media = __dirname + '/www';

/*
 * Array of absolute URLs to stores that can issue receipts for your app.
 *
 * Example:
 * installs_allowed_from = ['https://marketplace.firefox.com',
 *                          'https://marketplace-dev.allizom.org']
 *
 * If you don't specify this then the value of the app manifest
 * will be fetched from the client running your app.
 * If you rely on the client
 * then an attacker could hack the client code and issue a fake
 * receipt at a fake domain with a verifier URL that does nothing.
 *
 * */
var installs_allowed_from;


app.configure(function() {
  app.use(express.logger({format: 'dev'}));
  // You must call this before any routes to parse the HTTP POST body.
  app.use(express.bodyParser());
});

app.get('/', function (req, res) {
  res.sendfile(media + '/app.html');
});

app.post('/', function (req, res) {
  var store = new Verifier({
    onlog: console.log,
    // If this is set it will override the same value from the
    // app manifest. Use this to protect against fraud (see above).
    installs_allowed_from: installs_allowed_from
  });
  var receipts;
  try {
    receipts = req.body.receipts;
  } catch (er) {
    console.log('Error checking receipts: ' + er.toString());
    res.send('BAD_REQUEST', 400);
  }
  if (receipts) {
    store.verifyReceipts(req.body, function (verifier) {
      if (verifier.state.toString() === '[OK]') {
        console.log('Verification success!');
        res.send('OK', 200);
      } else {
        console.log('Verification failure!');
        res.send('PAYMENT_REQUIRED', 402);
      }
    });
  }
});


// Serve static files such as /www/img/*, /www/manifest.webapp, etc.
app.configure(function() {
  app.use(express.static(media));
});


var port = process.env['PORT'] || 3000;
app.listen(port);
console.log('Listening on port ' + port);
