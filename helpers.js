var OWAVerifier = function (options) {
  if (this == window) {
    throw 'You forgot new';
  }
  options = options || {};
  this.app = undefined;
  this.products = [];
  this.receiptErrors = {};
  this.receiptVerifications = {};
  this.cacheStorage = options.cacheStorage || localStorage;
  this.cacheCheckInterval = options.cacheCheckInterval || (1000 * 60 * 60 * 24);
  this.error = this.errors.VERIFICATION_INCOMPLETE('.verify() has not been called');
  this.requestTimeout = options.requestTimeout || 30000;
};

OWAVerifier._extend = function (obj, attrs) {
  if (attrs) {
    for (var i in attrs) {
      if (attrs.hasOwnProperty(i)) {
        obj[i] = attrs[i];
      }
    }
  }
};

OWAVerifier.Error = function (name, typeOptions) {
  function Err(detail, errorOptions) {
    var result = {name: name, detail: detail};
    OWAVerifier._extend(result, typeOptions);
    OWAVerifier._extend(result, errorOptions);
    result.toString = function toString() {
      var s = '[Error ' + this.name + ' ' + this.detail;
      for (var i in errorOptions) {
        if (errorOptions.hasOwnProperty(i) && this.detail.indexOf(errorOptions[i]+'') == -1) {
          s += ' ' + i + ': ' + errorOptions[i];
        }
      }
      s += ']';
      return s;
    };
    return result;
  }
  Err.name = name;
  Err.toString = function () {
    return '[Error ' + name + ']';
  };
  OWAVerifier._extend(Err, typeOptions);
  return Err;
};

OWAVerifier.prototype = {

  errors: {
    VERIFICATION_INCOMPLETE: OWAVerifier.Error("VERIFICATION_INCOMPLETE"),
    NO_RECEIPTS: OWAVerifier.Error("NO_RECEIPTS", {NEED_INSTALL: true}),
    NO_APP: OWAVerifier.Error("NO_APP", {NEED_INSTALL: true}),
    MOZAPPS_ERROR: OWAVerifier.Error("MOZAPPS_ERROR", {INTERNAL_ERROR: true}),
    VERIFIER_ERROR: OWAVerifier.Error("VERIFIER_ERROR", {INTERNAL_ERROR: true}),
    RECEIPT_ERRORS: OWAVerifier.Error("RECEIPT_ERRORS"),
    NETWORK_ERROR: OWAVerifier.Error("NETWORK_ERRORS", {NETWORK_ERROR: true}),
    SERVER_ERROR: OWAVerifier.Error("SERVER_ERROR", {NETWORK_ERROR: true}),
    RECEIPT_PARSE_ERROR: OWAVerifier.Error("RECEIPT_PARSE_ERROR", {RECEIPT_SYNTAX: true}),
    STORE_PARSE_ERROR: OWAVerifier.Error("STORE_PARSE_ERROR", {NETWORK_ERROR: true}),
    STORE_INVALID: OWAVerifier.Error("STORE_INVALID", {NETWORK_ERROR: true}),
    REFUNDED: OWAVerifier.Error("REFUNDED"),
    RECEIPT_INVALID: OWAVerifier.Error("RECEIPT_INVALID"),
    REQUEST_TIMEOUT: OWAVerifier.Error("REQUEST_TIMEOUT", {NETWORK_ERROR: true})
  },

  toString: function () {
    var s = '[OWAVerifier error status: ' + (this.error || 'no error');
    if (this.products.length) {
      s += ' products: ' + this.products.join(',');
    }
    if (this.app) {
      s += ' installed app: ' + this.app.manifestURL;
    }
    s += ']';
    return s;
  },

  verify: function (callback) {
    this.error = this.errors.VERIFICATION_INCOMPLETE(".verify() has not completed");
    var result = navigator.mozApps.getSelf();
    var self = this;
    result.onsuccess = function () {
      try {
        self.app = this.result || null;
        if (! this.result) {
          self.error = self.errors.NO_APP('The app is not installed');
          callback(self);
        }
        self.verifyReceipts(this.result, undefined, callback);
      } catch (e) {
        self.error = self.errors.VERIFIER_ERROR("Exception: " + e, {exception: e});
        callback(self);
      }
    };
    result.onerror = function () {
      self.error = self.errors.MOZAPPS_ERROR("Error calling mozApps.getSelf: " + (this.error && this.error.name), {mozAppsError: this.error});
      callback(self);
    };
  },

  verifyReceipts: function (app, installsAllowedFrom, callback) {
    if ((! app.receipts) || (! app.receipts.length)) {
      this.error = this.errors.NO_RECEIPTS("No receipts were found or installed");
      return;
    }
    if (installsAllowedFrom === undefined) {
      installsAllowedFrom = app.manifest.installs_allowed_from;
    }
    var pending = app.receipts.length;
    var self = this;
    app.receipts.forEach(function (receipt) {
      var result = self.checkCache(receipt);
      if (result) {
        self._addReceiptValidation(receipt, result);
        return;
      }
      self.verifyOneReceipt(app, receipt, installsAllowedFrom, function () {
        pending--;
        if (! pending) {
          if (self.error && self.error.name == 'VERIFICATION_INCOMPLETE') {
            self.error = null;
          }
          callback(self);
        }
      });
    });
  },

  verifyOneReceipt: function (app, receipt, installsAllowedFrom, callback) {
    console.log('first');
    try {
      var parsed = this.parseReceipt(receipt);
    } catch (e) {
      // While bad, this is non-fatal
      console.log('yikes', e, receipt);
      this._addReceiptError(receipt, this.errors.RECEIPT_PARSE_ERROR("Error decoding JSON: " + e, {exception: e}));
      callback();
      return;
    }
    console.log('second');
    if (typeof installsAllowedFrom == "string") {
      // A calling error, but we'll gloss over it:
      installsAllowedFrom = [installsAllowedFrom];
    }
    console.log('trying it out', parsed);
    var iss = parsed.iss;
    if (! iss) {
      this._addReceiptError(receipt, this.errors.RECEIPT_INVALID("No (or empty) iss field"), {parsed: parsed});
      callback();
      return;
    }
    console.log('everything is cool');
    // FIXME: somewhat crude checking, case-sensitive:
    if (installsAllowedFrom && installsAllowedFrom.indexOf(iss) == -1 && installsAllowedFrom.indexOf("*") == -1) {
      this._addReceiptError(receipt, this.errors.INVALID_INSTALLS_ALLOWED_FROM("Installer of receipt is not a valid installer: " + iss));
      callback();
      return;
    }
    console.log('almost');
    var verify = parsed.verify;
    if (! verify) {
      this._addReceiptError(receipt, this.errors.RECEIPT_INVALID("No (or empty) verify field"), {parsed: parsed});
      callback();
      return;
    }
    console.log('practically', parsed);
    var req = new XMLHttpRequest();
    var self = this;
    req.open("POST", verify);
    console.log('sending request', req, this.requestTimeout);
    req.onreadystatechange = function () {
      if (req.readyState != 4) {
        return;
      }
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      console.log('request finished', req);
      if (req.status === 0) {
        self._addReceiptError(receipt, self.errors.NETWORK_ERROR("Server could not be contacted", {request: req}));
        callback();
        return;
      }
      if (req.status == 404) {
        self._addReceiptError(receipt, self.errors.SERVER_ERROR("Server responded with 404 to " + verify, {request: req}));
        callback();
        return;
      }
      if (req.status != 200) {
        self._addReceiptError(receipt, self.errors.SERVER_ERROR("Server responded with non-200 status: " + req.status, {request: req}));
        callback();
        return;
      }
      try {
        var result = JSON.parse(req.responseText);
      } catch (e) {
        self._addReceiptError(receipt, self.errors.SERVER_ERROR("Invalid JSON from server", {request: req}));
        callback();
        return;
      }
      console.log('result', result);
      if (result.status == "ok" || result.status == "pending") {
        self._addReceiptValidation(result);
        callback();
        return;
      }
      if (result.status == "refunded") {
        self._addReceiptError(self.errors.REFUNDED("Application payment was refunded", {result: result}));
        callback();
        return;
      }
      if (result.status == "expired") {
        self._addReceiptError(receipt, self.errors.EXPIRED("Receipt expired", {result: result}));
        // FIXME: sometimes an error, sometimes not?  Accumulate separately?
        self._addReceiptValidation(receipt, result);
        callback();
        return;
      }
      if (result.status == "invalid") {
        self._addReceiptError(receipt, self.errors.STORE_INVALID("The store reports the receipt is invalid", {result: result}));
        callback();
        return;
      }
      self._addReceiptError(receipt, self.errors.SERVER_ERROR("Store replied with unknown status: " + result.status, {result: result}));
      callback();
    };
    req.send(receipt);
    var timeout;
    if (this.requestTimeout) {
      timeout = setTimeout(function () {
        console.log('timing out request', req, req.readyState);
        //req.abort();
        self._addReceiptError(
          receipt,
          self.errors.REQUEST_TIMEOUT(
            "The request timed out after " + this.requestTimeout + " milliseconds",
            {url: verify})
        );
      }, this.requestTimeout);
    }
    xreq = req;
    console.log('sent request', req.readyState);
  },

  _addReceiptError: function (receipt, error) {
    this.receiptErrors[receipt] = error;
    if (error.NETWORK_ERROR) {
      if ((! this.error) || this.error.name == 'VERIFICATION_INCOMPLETE') {
        this.error = this.errors.NETWORK_ERROR(error.detail);
      }
    } else if (error.PARSE_ERROR) {
      // The error was a syntactically invalid receipt, not indicative of anything wrong per se
      null;
    } else {
      this.error = this.errors.RECEIPT_ERROR;
    }
  },

  _addReceiptValidation: function (receipt, result) {
    this.receiptValidations[receipt] = result;
    this.products.push(result.product);
  },

  checkCache: function (receipt) {
    if (! this.storage) {
      return null;
    }
    var key = this._makeKey(receipt);
    var value = this.storage.getItem(key);
    if (! value) {
      return null;
    }
    try {
      value = JSON.parse(value);
    } catch (e) {
      this.storage.removeItem(key);
      return null;
    }
    if (value.created + this.checkInterval > Date.now().getTime()) {
      // FIXME: maybe make this a fallback?
      return null;
    }
    return value.result;
  },

  saveResults: function (results) {
    if (! this.storage) {
      return;
    }
    for (var receipt in results) {
      if (! results.hasOwnProperty(receipt)) {
        continue;
      }
      var key = this._makeKey(receipt);
      var value = {created: Date.now().getTime(), result: results[receipt]};
      this.storage.saveItem(key, JSON.stringify(value));
    }
  },

  clearCache: function () {
    if (! this.storage) {
      return;
    }
    var bad = [];
    for (var i=0; i<this.storage.length; i++) {
      var key = this.storage.key(i);
      if (key.substr(0, 4) == "app.") {
        bad.push(key);
      }
    }
    for (i=0; i<bad.length; i++) {
      this.storage.removeItem(bad[i]);
    }
  },

  _makeKey: function (receipt) {
    return 'app.' + receipt;
  },

  parseReceipt: function (receipt) {
    if (receipt.indexOf('.') == -1) {
      throw 'Not valid JWT';
    }
    var majorParts = receipt.split('~');
    var dataParts = majorParts[1].split('.');
    var body = dataParts[1];
    body = this._base64urldecode(body);
    body = JSON.parse(body);
    return body;
  },

  _base64urldecode: function (s) {
    s = s.replace(/-/g, '+'); // 62nd char of encoding
    s = s.replace(/_/g, '/'); // 63rd char of encoding
    switch (s.length % 4) { // Pad with trailing '='s
      case 0: break; // No pad chars in this case
      case 1: s += "==="; break;
      case 2: s += "=="; break;
      case 3: s += "="; break;
      default: throw "Illegal base64url string!";
    }
    return atob(s); // Standard base64 decoder
  }

};
