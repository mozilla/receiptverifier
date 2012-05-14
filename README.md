## Open Web Apps Helper

This is a (currently) small library to do helpful things for your
[Mozilla Web Apps](https://www.mozilla.org/en-US/apps/partners/) app.

Right now it does validation of receipts, specifically targetted at
HTML-only applications (i.e., applications where the server doesn't do
anything but serve static files).

To use this, you'd do something like:

    var cache = new OWAHelper.Cache();
    var pending = navigator.mozApps.getSelf();
    pending.onsuccess = function () {
      if (! this.result) {
        forcePurchase('You must install this app');
        return;
      }
      cache.verifyReceipts(app, ["https://marketplace.mozilla.org"], function (error, result) {
        if (error && error.code != OWAHelper.errors.RECEIPT_NETWORK_ERRORS) {
          forcePurchase(error.detail);
        }
      });
    };
    pending.onerror = function () {
      forcePurchase('There is an error with your apps environment: ' + this.error);
    };

    function forcePurchase(reason) {
      // Of course, this is kind of terrible, but you can do better yourself ;)
      alert('You must install!\n' + reason);
      location.href = 'https://marketplace.mozilla.org/en-US/app/myapp';
    }
