# Open Web Apps Helper

This is a library to verify [Mozilla Web Apps](https://www.mozilla.org/en-US/apps/partners/) receipts.

It is particularly helpful for HTML-only applications (i.e., applications that don't have a smart server that can verify receipts), but can also be used server side with Node.js.

If you use the library, please tell me and let me inform you of updates by [putting your name into this form](https://docs.google.com/spreadsheet/viewform?formkey=dEdMQW55V0xUekxBODdVdjB5c3pKUHc6MQ). Thanks!

## Table of Contents

1. [Using the library the really quick way](https://github.com/mozilla/receiptverifier#using-the-library-the-really-quick-way)
  * [Prompter templates](https://github.com/mozilla/receiptverifier#prompter-templates)
2. [Using the library in the browser (Client Side)](https://github.com/mozilla/receiptverifier#using-the-library-in-the-browser-client-side)
  * [Options](https://github.com/mozilla/receiptverifier#options)
  * [Methods](https://github.com/mozilla/receiptverifier#methods)
3. [Example](https://github.com/mozilla/receiptverifier#example)
  * [States and Errors](https://github.com/mozilla/receiptverifier#states-and-errors)
4. [Using the library in Node.js (Server Side)](https://github.com/mozilla/receiptverifier#using-the-library-in-nodejs-server-side)
5. [Testing the library](https://github.com/mozilla/receiptverifier#testing-the-library)
6. [To Do](https://github.com/mozilla/receiptverifier#to-do)

## Using the library the really quick way

Below you'll see a description of the verifier, and how you can get the status of receipts, and then do something about that status.  But if you want to be really quick about it, you can use this:

```javascript
mozmarket.receipts.Prompter({
  storeURL: "https://marketplace.mozilla.org/app/myapp",
  supportHTML: '<a href="mailto:me@example.com">email me@example.com</a>',
  verify: true
});
```

This will run verification, and then throw up an error or prompt if something went wrong with that verification.

In addition to the `verify: true` option, you can set several other options:

**storeURL**: you must set this option.  This is the preferred installation page that you want to direct users to.  This probably is the detail page on a store, though you could point users to a self-installation page located on your own site, or really you can direct them anywhere (like to a page that offers the user many installation/store options).

**supportHTML**: this is a snippet of HTML that tells the user how to contact you for support.  It is included in several error messages.

**allowNoInstall**: default false.  If true, then users can continue to use the application even if the app isn't installed, though they will get a dialog encouraging them to install the application.

**ignoreInternalError**: default false.  There are some internal errors that keep verification from happening; these typically aren't the fault of the user.  If true then these errors are completely ignored.  If false then the user gets an error message, but can close the message and continue to use the app.

**fatalInternalError**: default false.  If true then when there is an internal message the user is completely blocked from using the application.

### Prompter templates

There is also actual text that is displayed to users, which is based on one of several templates.  These can be found in `mozmarket.receipts.Prompter.prototype.templates`.

Each is a template based on [this recipe](http://ejohn.org/blog/javascript-micro-templating/) - instructions are put into `<% if/etc ... %>` or `<%= variable/expression %>.  You must use `<%= quote(text) %>` to safely include text.  You should look at the templates for examples.

You can override these like:

```javascript
mozmarket.receipts.Prompter({
  templates: {
    internalError: "oops!"
  }
  ...
});
```

These are all the templates:

**internalError**: when there's an internal error, and you haven't set `ignoreInternalError`.

**fatalInternalError**: only applies if you used the `fatalInternalError` option.

**storeInstall**: this tells the user they must install the app from the store.

**refunded**: this happens when the user made a purchase, but got a refund for that purchase.

**invalidReceiptIssuer**: this is when the receipt was issued by a store you don't have a relationship (that is not listed in `installs_allowed_from` in your application manifest).

**invalidFromStore**: the store reported the receipt as invalid. Probably a simple reinstallation is all that is necessary.

**receiptFormatError**: the receipt itself is malformed.  Probably a reinstallation will fix this.

**genericError**: this fallback error shouldn't happen.  But it could?

To see an example of how these options interact, look at [test-ui.html](test-ui.html).

## Using the library in the browser (Client Side)

This library (besides `Prompter`) exposes a function `mozmarket.receipts.verify()`, which you use like:

```javascript
mozmarket.receipts.verify(function (verifier) {
  // Look at verifier.state to see how it went
}, {optional options});
```

The `verifier` is an instance of `mozmarket.receipts.Verifier`.  The callback will be called regardless of success or failure, including if the application wasn't installed, and even if there is an exception in the library itself.

The [example](#example) shows how to check the state.

### Options

The constructor takes several options:

**installs_allowed_from**: This is a list of origins that are allowed to issue receipts.  If you don't give this, the verifier will read this value from the [manifest](https://developer.mozilla.org/en/Apps/Manifest).  This is a fine default, but if you've *stopped* a relationship with a store you should pay attention to this option: the manifest indicates what stores can install the app *now*, but you should still respect receipts issued by the store in the past.

**requestTimeout**: The Verifier will contact the store, and this may time out.  This is the time (in milliseconds) to wait.  It defaults to 30 seconds.

**cacheTimeout**: The Verifier will cache results (using `localStorage`).  This is how long (in milliseconds) that a cached result will be considered valid.

**cacheStorage**: This defaults to `localStorage`.  You could potentially pass in a localStorage-like object in its place.  (If you have a use case for this, share with me, and maybe a more abstract interface is necessary.)  You can set this to null to stop caching. You shouldn't disable caching unless you implement it yourself somewhere else.

**refundWindow**: After an app is purchased, there's a period when you can get a refund very easily.  On the Mozilla Marketplace this is 30 minutes.  So if we cache a result during that first 30 minutes, once the time has passed we should verify that again as there is a relatively high probability of a receipt becoming invalid during that time.  The value is in milliseconds, and defaults to 40 minutes (to round up the 30 minutes a bit).

**onlog**: this is a function that will be called with log messages. The function is called like `verifier.onlog(level, message)`, with `level` one of the levels in `verifier.levels` (e.g., `verifier.level.INFO`).  There is a logger included that sends messages to the console.  Use `new mozmarket.receipts.Verifier({onlog: mozmarket.receipts.Verifier.consoleLogger})`

**logLevel**: this is the level of messages to send to the logger function.  E.g., `new mozmarket.receipts.Verifier({logLevel: "DEBUG", onlog: ...})`.  To see the levels, look at `mozmarket.receipts.Verifier.levels`


### Methods

The `mozmarket.receipts.verify()` function is mostly what you'll use. A couple methods you might want from the verifier object:

**verifier.clearCache()**: Throws away everything in the cache.  This deletes some things from localStorage, but only keys that start with `receiptverifier.`  You'll probably want to use `verifier = new mozmarket.receipts.Verifier(); verifier.clearCache(); verifier.verify(callback);` if you want to use this method.

**verifier.parseReceipt(receipt)**: Returns the parsed form of the receipt.  See [the receipt specification](https://wiki.mozilla.org/Apps/WebApplicationReceipt) for more.

**verifier.iterReceiptErrors(callback)**: Calls `callback(receipt, error)` for each error for an individual receipt.

## Example

To use this, you'd do something like:

```javascript
mozmarket.receipts.verify(function (verifier) {
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

**MozAppsNotSupported**: the `navigator.mozApps` API is not supported by this client.  The app can't be "installed" on this browser.

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

## Using the library in Node.js (Server Side)

This library is Node.js compatible.  It is registered in the Node Package
Manager's (NPM) registry at:
[npmjs.org](http://search.npmjs.org/#/receiptverifier)

You can install the node package with the command:
`npm install receiptverifier`

An example server using the receiptverifier package can be found in the
node_modules/receiptverifier/example directory.  That example just logs
verifications to the console, but you could log verifications to files or
database records.  The inject code provides the ability to forward your existing
installed application records to your server to test it.  See the comments in
those files for more documentation.

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

* Make sure we validate that the receipt is for *this* app, not some other app.

* A hook from the prompter to shut down the app (so you can't *just* remove the overlay element and use the app).

* Some server flow where a failure is sent to the server so it can require successful verification before sending the full assets again (probably by setting a cookie).

* Set a user-agent string on the verify check, that does something like `navigator.userAgent + '; receiptverifier/1.1'`
