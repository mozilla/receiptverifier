# Open Web Apps Helper

This is a library to verify [Mozilla Web Apps](https://www.mozilla.org/en-US/apps/partners/) receipts.

It is particularly helpful for HTML-only applications (i.e., applications that don't have a smart server that can verify receipts).


## Using the library

This library exposes a function `mozmarket.verifyReceipts`, which you use like:

```javascript
mozmarket.verifyReceipts(function (verifier) {
  // Look at verifier.state to see how it went
}, {optional options});
```

The `verifier` is an instance of `mozmarket.ReceiptVerifier`.  The callback will be called regardless of success or failure, including if the application wasn't installed, and even if there is an exception in the library itself.

The [example](#example) shows how to check the state.

### Options

The constructor takes several options:

**installs_allowed_from**: This is a list of origins that are allowed to issue receipts.  If you don't give this, the verifier will read this value from the [manifest](https://developer.mozilla.org/en/Apps/Manifest).  This is a fine default, but if you've *stopped* a relationship with a store you should pay attention to this option: the manifest indicates what stores can install the app *now*, but you should still respect receipts issued by the store in the past.

**requestTimeout**: The ReceiptVerifier will contact the store, and this may time out.  This is the time (in milliseconds) to wait.  It defaults to 30 seconds.

**cacheTimeout**: The ReceiptVerifier will cache results (using `localStorage`).  This is how long (in milliseconds) that a cached result will be considered valid.

**cacheStorage**: This defaults to `localStorage`.  You could potentially pass in a localStorage-like object in its place.  (If you have a use case for this, share with me, and maybe a more abstract interface is necessary.)  You can set this to null to stop caching. You shouldn't disable caching unless you implement it yourself somewhere else.

**refundWindow**: After an app is purchased, there's a period when you can get a refund very easily.  On the Mozilla Marketplace this is 30 minutes.  So if we cache a result during that first 30 minutes, once the time has passed we should verify that again as there is a relatively high probability of a receipt becoming invalid during that time.  The value is in milliseconds, and defaults to 40 minutes (to round up the 30 minutes a bit).

**onlog**: this is a function that will be called with log messages. The function is called like `verifier.onlog(level, message)`, with `level` one of the levels in `verifier.levels` (e.g., `verifier.level.INFO`).  There is a logger included that sends messages to the console.  Use `new mozmarket.ReceiptVerifier({onlog: mozmarket.ReceiptVerifier.consoleLogger})`

**logLevel**: this is the level of messages to send to the logger function.  E.g., `new mozmarket.ReceiptVerifier({logLevel: "DEBUG", onlog: ...})`.  To see the levels, look at `mozmarket.ReceiptVerifier.levels`


### Methods

The `.verify()` method is mostly what you'll use.  A couple others:

**verifier.clearCache()**: Throws away everything in the cache.  This deletes some things from localStorage, but only keys that start with `receiptverifier.`

**verifier.parseReceipt(receipt)**: Returns the parsed form of the receipt.  See [the receipt specification](https://wiki.mozilla.org/Apps/WebApplicationReceipt) for more.

**verifier.iterReceiptErrors(callback)**: Calls `callback(receipt, error)` for each error for an individual receipt.

## Example

To use this, you'd do something like:

```javascript
mozmarket.verifyReceipts(function (verifier) {
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

The `verifier.state` object can be an instance of one of these items; each is a property of `verifier.states`:

**OK**: everything went okay!

**OKCache**: subclass of `OK`; everything went okay, and we used some cached results to verify this.

**OKStaleCache**: subclass of `OK`; everything didn't really go okay, there was some network error, but we had previously cached results of a past verification.  These cached items were too old, but were an acceptable fallback.  Or not acceptable, you can check for this state. The network errors will still be present in `verifier.receiptErrors`.

**NoValidReceipts**: the application is installed, and has receipts, but none of the receipts are valid.  The receipts may be syntactically invalid, may be from a store that is not allowed, may be rejected by the store as invalid, or may be refunded.  Look to `verifier.receiptErrors` for details.

**NetworkError**: some network error occurred that kept validation from completing.  That is, a receipt seemed okay but we weren't able to contact the server to verify if.  This will happen when the user agent is offline.

**ServerError**: subclass of `NetworkError`; the server did something wrong.  This might be an invalid response from the server, or a wifi login in the way, or the server is down, etc.  Like a network error, it's not the user's fault!

**VerificationIncomplete**: this is the state until the verification actually completes.

**NeedsInstall**: an error that indicates the application needs to be installed.

**NoReceipts**: a subclass of `NeedsInstall`; the application is installed, but has no receipts.  This would probably be the result of a self-install or free install.

**NotInstalled**: a subclass of `NeedsInstall`; the application is simply not installed.

**InternalError**: something went wrong with the verifier itself or the `navigator.mozApps` API.  This of course shouldn't happen; please report any such errors.

**MozAppsError**: subclass of `InternalError`; this is generally an error with the `navigator.mozApps.getSelf()` call.

**VerifierError**: subclass of `InternalError`; an exception somewhere in the verifier code.

There are also errors that can be assigned to individual receipts, enumerated in `verifier.errors`:

**InvalidFromStore**: the store responded that the receipt is invalid. This may mean the store has no record of the receipt, doesn't recognize the signature, or some other state.

**ReceiptExpired**: the store responded that the receipt has expired. This is generally a recoverable error, in that the receipt can be refreshed once expired.  This refreshing has not yet been implemented.

**Refunded**: the store reports that the payment was refunded.

**InvalidReceiptIssuer**: the receipt was issued by a store not listed in your `installs_allowed_from` list.

**ConnectionError**: subclass of `verifier.states.NetworkError`; happens when the connection to the server fails.

**RequestTimeout**: a subclass of `verifier.states.NetworkError`; the request timed out.  You can set `verifier.requestTimeout` to a millisecond value to control this.

**ServerStatusError**: a subclass of `verifier.states.ServerError`; the server responded with a non-200 response.

**InvalidServerResponse**: a subclass of `verifier.states.ServerError`; the server responded with a non-JSON response, or a JSON response that didn't contain a valid `status`.

**ReceiptFormatError**: the receipt itself is invalid.  It might be badly formatted, or is missing required properties.

**ReceiptParseError**: subclass of `ReceiptFormatError`; the receipt is not valid [JWT](http://tools.ietf.org/html/draft-jones-json-web-token-10).  This should only happen if the store that issued the receipt is simply broken, or the receipt was corrupted.


## Testing the library

There is a fairly complete test in `test.html`.  Be sure to check the library out with `git clone --recursive` or else after you've checked it out to use `git submodule update`; this brings in modules specifically used for testing.

If you load the page the tests will run, and after a minute or so you should see a summary of results at the top.  The tests use [doctest.js](http://ianb.github.com/doctestjs).


## To Do

* Include something like `logToServer` in the verifier itself.

* Maybe look into logging to the Marketplace itself.

* This requires [CORS](http://www.w3.org/TR/cors/), but the Marketplace doesn't have another way to access the validator. Investigate JSONP?

* Do some checking of `installOrigin` and the receipt origin.

* Some harder timeout for cached items, when a stale result is no longer okay.

* Cache receipts longer once they age, as they are increasingly unlikely to become invalid.

* Include something to send the receipts to the server for more secure verification.
