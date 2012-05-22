# Open Web Apps Helper

This is a (currently) small library to do helpful things for your [Mozilla Web Apps](https://www.mozilla.org/en-US/apps/partners/) app.

Right now it does validation of receipts, specifically targetted at HTML-only applications (i.e., applications where the server doesn't do anything but serve static files).


## Using the library

To use this, you'd do something like:

```javascript
var verifier = new OWAVerifier();
verifier.verify(function (verifier) {
  if (verifier.state instanceof verifier.states.NeedsInstall) {
    forcePurchase("You must install this app");
    return;
  }
  if (verifier.state instanceof verifier.states.NetworkError) {
    // it was some kind of network or server error
    // i.e., not the fault of the user
    // you may want to let the user in, but for a limited time
  } else if (verifier.state instanceof verifier.states.InternalError) {
    // The verifier library itself got messed up; this shouldn't happen!
    // It's up to you if you want to reject the user at this point
    logToServer(verifier.app, verifier.error);
  } else if {verifier.state instanceof verifier.states.OK) {
    // Everything is cool
  } else {
    // Some other error occurred; maybe it was never a valid receipt, maybe
    // the receipt is corrupted, or someone is trying to mess around.
    // It would not be a bad idea to log this.
    logToServer(verifier.app, verifier.receiptErrors);
    forcePurchase("Your purchase is invalid; please purchase again, or reinstall from the Marketplace");
  }
});

function forcePurchase(reason) {
  // Of course, this is kind of terrible, but you can do better yourself ;)
  alert('You must install!\n' + reason);
  location.href = 'https://marketplace.mozilla.org/en-US/app/myapp';
}

function logToServer(app, data) {
  try {
    app = JSON.stringify(app);
  } catch (e) {
    app = app + '';
  }
  try {
    data = JSON.stringify(data);
  } catch (e) {
    data = data + '';
  }
  var req = new XMLHttpRequest();
  req.open('POST', '/receipt-error-log');
  req.send('app=' + encodeURIComponent(app) + '&error=' + encodeURIComponent(data));
}

```


### States and Errors

The `verifier.state` object can be an instance of one of these items; each is a property of `OWAVerifier.states`:

**OK**: everything went okay!

**NoValidReceipts**: the application is installed, and has receipts, but none of the receipts are valid.  The receipts may be syntactically invalid, may be part of a store that's not expected, may be rejected by the store as invalid, or may be refunded.  Look to `verifier.receiptErrors` for details.

**NetworkError**: some network error occurred that kept validation from completing.  That is, a receipt seemed okay but we weren't able to contact the server to verify if.  This will happen when the user agent is offline.

**ServerError**: subclass of `NetworkError`; the server did something wrong.  This might be an invalid response from the server, or a wifi login in the way, or the server is down, etc.  Like a network error, it's not the user's fault!

**VerificationIncomplete**: this is the state until the verification actually completes.

**NeedsInstall**: an error that indicates the application needs to be installed.

**NoReceipts**: a subclass of `NeedsInstall`; the application is installed, but has no receipts.  This would probably be the result of a self-install or free install.

**NotInstalled**: a subclass of `NeedsInstall`; the application is simply not installed.

**InternalError**: something went wrong with the verifier itself or the `navigator.mozApps` API.  This of course shouldn't happen; please report any such errors.

**MozAppsError**: subclass of `InternalError`; this is generally an error with the `navigator.mozApps.getSelf()` call.

**VerifierError**: subclass of `InternalError`; an exception somewhere in the verifier code.

There are also errors that can be assigned to individual receipts, contained in `OWAVerifier.errors`:

**InvalidFromStore**: the store responded that the receipt is invalid.  This may mean the store has no record of the receipt, doesn't recognize the signature, or some other state.

**ReceiptExpired**: the store responded that the receipt has expired.  This is generally a recoverable error, in that the receipt can be refreshed once expired.  This refreshing has not yet been implemented.

**Refunded**: the store reports that the payment was refunded.

**InvalidReceiptIssuer**: the receipt was issued by a store not listed in your `installs_allowed_from` list.

**ConnectionError**: subclass of `OWAVerifier.states.NetworkError`; happens when the connection to the server fails.

**RequestTimeout**: a subclass of `OWAVerifier.states.NetworkError`; the request timed out.  You can set `verifier.requestTimeout` to a millisecond value to control this.

**ServerStatusError**: a subclass of `OWAVerifier.states.ServerError`; the server responded with a non-200 response.

**InvalidServerResponse**: a subclass of `OWAVerifier.states.ServerError`; the server responded with a non-JSON response, or a JSON response that didn't contain a valid `status`.

**ReceiptFormatError**: the receipt itself is invalid.  It might be badly formatted, or is missing required properties.

**ReceiptParseError**: subclass of `ReceiptFormatError`; the receipt is not valid [JWT](http://tools.ietf.org/html/draft-jones-json-web-token-10).  This should only happen if the store that issued the receipt is simply broken, or the receipt was corrupted.


## Testing the library

The testing is a bit ad hoc, but it does exist.  To test the library get an app installed how you want (maybe in a refunded state, for instance, or install an invalid receipt, etc).  Then change your `/etc/hosts` to point the app's domain at your own machine.  Then open up `test.html`.  This will do some rough tests -- though of course it doesn't know what you intended to test, so it mostly displays the results.  You should then visually inspect them to make sure they match what you expect (no error, the error you expect, the products you expect, etc).


## To Do

* Include a direct option to allow receipt checking to pass for a while when there's a network error.  One option to allow the stale cached value, and another option to allow no verification at all to occur when there's a network error.  This requies some persistance to time-limit.

* Smarter time/polling suggestions, especially during the refund window.

* Include something like `logToServer` in the verifier itself.

* Maybe look into logging to the Marketplace itself.

* This requires [CORS](http://www.w3.org/TR/cors/), but the Marketplace doesn't have another way to access the validator.  Investigate JSONP?

* Consider encapsulating this more.  Might guard against at least the most trivial hacks.

* Better testing, of course.  More automated testing wouldn't be able to interact directly with the Marketplace though.

* Do some checking of `installOrigin` and the receipt origin.
