## Open Web Apps Helper

This is a (currently) small library to do helpful things for your
[Mozilla Web Apps](https://www.mozilla.org/en-US/apps/partners/) app.

Right now it does validation of receipts, specifically targetted at
HTML-only applications (i.e., applications where the server doesn't do
anything but serve static files).

### Using the library

To use this, you'd do something like:

    var verifier = new OWAVerifier();
    verifier.verify(function (verifier) {
      if (verifier.error.NEED_INSTALL) {
        forcePurchase("You must install this app");
        return;
      }
      if (verifier.error) {
        if (verifier.error.INTERNAL_ERROR) {
          // The verifier library itself got messed up; this shouldn't happen!
          // It's up to you if you want to reject the user at this point
          logToServer(verifier.app, verifier.error);
        } else if (verifier.error.NETWORK_ERROR) {
          // it was some kind of network or server error
          // i.e., not the fault of the user
          // you may want to let the user in, but for a limited time
        } else if (verifier.error.REFUNDED) {
          forcePurchase("You got a refund!  Buy it again if you've changed your mind");
        } else {
          // Some other error occurred; maybe it was never a valid receipt, maybe
          // the receipt is corrupted, or someone is trying to mess around.
          // It would not be a bad idea to log this.
          logToServer(verifier.app.receipts, verifier.error);
          forcePurchase("Your purchase is invalid; please purchase again, or reinstall from the Marketplace");
        }
      }
    });

    function forcePurchase(reason) {
      // Of course, this is kind of terrible, but you can do better yourself ;)
      alert('You must install!\n' + reason);
      location.href = 'https://marketplace.mozilla.org/en-US/app/myapp';
    }

    function logToServer(appData, errorData) {
      try {
        appData = JSON.stringify(appData);
      } catch (e) {
        appData = appData + '';
      }
      try {
        errorData = JSON.stringify(errorData);
      } catch (e) {
        errorData = errorData + '';
      }
      var req = new XMLHttpRequest();
      req.open('POST', '/receipt-error-log');
      req.send('appdata=' + encodeURIComponent(appData) + '&error=' + encodeURIComponent(errorData));
    }

### Testing the library

The testing is a bit ad hoc, but it does exist.  To test the library
get an app installed how you want (maybe in a refunded state, for
instance, or install an invalid receipt, etc).  Then change your
`/etc/hosts` to point the app's domain at your own machine.  Then open
up `test.html`.  This will do some rough tests -- though of course it
doesn't know what you intended to test, so it mostly displays the
results.  You should then visually inspect them to make sure they
match what you expect (no error, the error you expect, the products
you expect, etc).

### To Do

* Change `.error` to `.state` to represent a more general sort of
  state (installed, uninstalled, and the errors).

* Include a direct option to allow receipt checking to pass for a
  while when there's a network error.  One option to allow the stale
  cached value, and another option to allow no verification at all to
  occur when there's a network error.  This requies some persistance
  to time-limit.

* Smarter time/polling suggestions, especially during the refund window.

* Add a logging option.  E.g., `verifier.onlog = function (message) {}`

* Include something like `logToServer` in the verifier itself.

* Maybe look into logging to the Marketplace itself.

* This requires [CORS](http://www.w3.org/TR/cors/), but the
  Marketplace doesn't have another way to access the validator.
  Investigate JSONP?

* Consider encapsulating this more.  Might guard against at least the
  most trivial hacks.

* Better testing, of course.  More automated testing wouldn't be able
  to interact directly with the Marketplace though.
