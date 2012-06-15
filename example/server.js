/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

try {
  var express = require('express');
} catch (err) {
  console.log('Error: This example requires the express package. Please run:');
  console.log('npm install express');
  process.exit(1);
}
var app = express.createServer();
// Note the relative path because we are in the example directory.
var Verifier = require('../receiptverifier').receipts.Verifier;

/* This block is needed to parse the HTTP POST body.  It also needs to go
 * before any routes are defined! */
app.configure(function () {
  app.use(express.bodyParser());
});

/* Here we can use express to serve files as well.  Note how you must set the
 * content type to 'application/x-web-app-manifest+json' for webapp
 * manifests! */
app.get('/', function (req, res) {
  res.sendfile('index.html');
});
app.get('/manifest.webapp', function (req, res) {
  res.header('Content-Type', 'application/x-web-app-manifest+json');
  res.sendfile('manifest.webapp');
});

app.post('/', function (req, res) {
  /* Here we set the console.log function to be used for logging.
   * Remove the options hash from the constructor if this added logging is 
   * unnecessary.  Or you could have your custom logging function to write to
   * files. */
  var myVerifier = new Verifier({ onlog: console.log });
  
  // Log the request body.
  //console.log(req.body);
  myVerifier.verifyReceipts(req.body, function (verifier) {
    
    // Log the verifier object after verification.
    //console.log(verifier);
    // Log the result for the verification.
    //console.log(verifier.state.toString());
    if (verifier.state.toString() === '[OK]') {
      console.log('Verification success!');
      res.send('{ receiptState: ' + verifier.state.toString() + '}',
        {'Content-Type': 'application/json'}, 200);
    } else {
      console.log('Verification failure!');
      res.send('{ receiptState: ' + verifier.state.toString() + '}',
        {'Content-Type': 'application/json'}, 400);
    }
  });
});

app.listen(3000);
console.log('server running on port 3000');