/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function DOMRequest() {
  this.onsuccess = null;
  this.onerror = null;
  this.error = null;
  this.result = undefined;
  this.readyState = "pending";
}

DOMRequest.prototype.fireSuccess = function (result) {
  this.result = result;
  this.readyState = "done";
  if (this.onsuccess) {
    this.onsuccess({type: "success", target: this, toString: function () {return '[object Event]';}});
  }
};

DOMRequest.prototype.fireError = function (errorName) {
  this.error = {name: errorName, type: "error"};
  this.readyState = "done";
  if (this.onerror) {
    this.onerror();
  }
};

DOMRequest.prototype.toString = function () {
  return '[object DOMRequest]';
};

var mockMozApps = {
  _repo: {},
  monkeypatch: function () {
    navigator.mozApps = this;
  },
  install: function (manifestURL, installData) {
    var pending = new DOMRequest();
    var req = new XMLHttpRequest();
    var self = this;
    req.open("GET", manifestURL);
    req.onreadystatechange = function () {
      if (req.readyState != 4) {
        return;
      }
      if (req.status != 200) {
        pending.fireError("NETWORK_ERROR");
        return;
      }
      var manifest;
      try {
        manifest = JSON.parse(req.responseText);
      } catch (e) {
        pending.fireError("MANIFEST_PARSE_ERROR");
        return;
      }
      self._installManifest(manifestURL, manifest, this._getOrigin(location.href), installData, pending);
    };
    req.send();
    return pending;
  },

  _installManifest: function (manifestURL, manifest, installOrigin, installData, pending) {
    var origin = this._getOrigin(manifestURL);
    var appData = this._repo[origin] = {
      manifestURL: manifestURL,
      manifest: manifest,
      installTime: Date.now(),
      installData: installData,
      origin: origin,
      installOrigin: installOrigin
    };
    var app = new Application(this, appData);
    pending.fireSuccess(app);
  },

  _clear: function () {
    this._repo = {};
  },

  _getOrigin: function (url) {
    return URLParse(url).originOnly().toString();
  },

  getSelf: function () {
    var pending = new DOMRequest();
    var self = this;
    setTimeout(function () {
      var thisOrigin = URLParse(location.href).originOnly().toString();
      var appData = self._repo[thisOrigin];
      if (! appData) {
        pending.fireSuccess(null);
      } else {
        pending.fireSuccess(new Application(self, appData));
      }
    });
    return pending;
  }

};

function Application(repo, data) {
  this._repo = repo;
  this._rawData = data;
  this.manifestURL = data.manifestURL;
  // Note: doesn't do a deep copy
  this.manifest = data.manifest;
  this.origin = data.origin;
  this.installTime = data.installTime;
  this.receipts = data.installData && data.installData.receipts;
}

Application.prototype = {
  launch: function () {
    throw 'app.launch() not implemented';
  },
  uninstall: function () {
    var pending = new DOMRequest();
    var self = this;
    setTimeout(function () {
      delete self._repo[self.origin];
      pending.fireSuccess(this);
    });
    return pending;
  }
};
