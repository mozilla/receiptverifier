/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* To run this code (in Firefox 16 or later):
 * 1) Visit about:config
 * 2) Add your (trusted) domain to dom.mozApps.whitelist (can be comma
 *    seperated list).  Otherwise you can't call
 *    navigator.mozApps.mgmt.getAll
 *    If you don't have an entry for dom.mozApps.whitelist, you can right click
 *    and add it as a new string.
 * 3) Go to your domain that you just whitelisted.
 * 4) Open Firefox's Web Console or Firebug's Console.
 * 5) Paste this code in and run to send your receipts to the server.js code
 *    running in Node.js.  Make sure you have
 *    apps installed!  https://marketplace.mozilla.org/en-US/  Make sure you
 *    also have jQuery included in your page.
 *
 * Note: these steps are subject to change. */
function sendToBackEnd (element, index, array) {
  var appRecord = $.extend(true, {}, element);
  
  $.ajax({
    type: 'POST',
    url: '/',
    data: JSON.stringify(appRecord),
    contentType: 'application/json',
    success: function (data) {
      console.log(data);
    },
    error: function (data) {
      console.log('error occurred');
      console.log(data);
    }
  });
}

var request = navigator.mozApps.mgmt.getAll();
request.onerror = function () {
  console.log(request.error.name);
};
request.onsuccess = function () {
  var appRecords = request.result;
  console.log(appRecords);
  appRecords.forEach(sendToBackEnd);
};