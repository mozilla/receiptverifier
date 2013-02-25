/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function sendToBackEnd (app) {
  var appRecord = {};
  // Make the App object into something we can JSONify.
  for (var attr in app) {
    appRecord[attr] = app[attr];
  }
  var req = new XMLHttpRequest();
  req.onload = function() {
    if (this.status == 200) {
      console.log('OK ' + this.responseText);
      // The receipt is valid! Remove the disabled banner.
      // Pro tip: on a real paid app you'd probably want to be more
      // clever here like load premium content from the server.
      var el = document.getElementById('app-disabled');
      el.parentNode.removeChild(el);
      document.write('<p>Receipt validated: this app is enabled</p>');
    } else {
      console.log('Failed: code: ' + this.status + ' response: ' + this.responseText);
    }
  };
  req.onerror = function() {
    console.log('App disabled: Failed to verify receipt on the server');
  }
  req.open('POST', '/', true);
  req.setRequestHeader("Content-type", "application/json");
  req.send(JSON.stringify(appRecord));
}

var request = navigator.mozApps.getSelf();
request.onerror = function () {
  console.log(request.error.name);
};
request.onsuccess = function () {
  var appRecords = request.result;
  console.log(appRecords);
  if (appRecords) {
    sendToBackEnd(appRecords);
  } else {
    console.log('No receipts were found on the device');
  }
};
