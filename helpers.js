var OWAVerifier = function (options) {
  if (this == window) {
    throw 'You forgot new';
  }
  options = options || {};
  this.app = undefined;
  this.products = [];
  this.receiptErrors = {};
  this.receiptVerifications = {};
  this._cacheStorage = options.cacheStorage || localStorage;
  this.cacheCheckInterval = options.cacheCheckInterval || (1000 * 60 * 60 * 24);
  this.state = this.states.VerificationIncomplete('.verify() has not been called');
  this.requestTimeout = options.requestTimeout || 30000;
  this.refundWindow = options.refundWindow || 1000 * 60 * 40; // 40 minutes, a rounded up value from the marketplace
  this.installs_allowed_from = options.installs_allowed_from || undefined;
  this.onlog = options.onlog;
  if (options.logLevel) {
    if (typeof options.logLevel == "string") {
      this.logLevel = this.levels[options.logLevel];
    } else {
      this.logLevel = options.logLevel;
    }
  }
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

OWAVerifier.State = function (name, superclass) {
  if (name === undefined) {
    return this;
  }
  function NewState(detail, attrs) {
    if (this === window) {
      throw 'You forgot new';
    }
    this.detail = detail;
    OWAVerifier._extend(this, attrs);
  }
  if (superclass === undefined) {
    superclass = OWAVerifier.State;
  }
  NewState.prototype = new superclass();
  NewState.name = name;
  NewState.prototype.name = name;
  return NewState;
};

OWAVerifier.State.prototype.toString = function () {
  var s = '[' + this.name;
  if (this.detail) {
    s += ' ' + this.detail;
  }
  for (var i in this) {
    if (this.hasOwnProperty(i) && i != 'detail') {
      if (typeof this[i] == "object" && this[i].toSource) {
        var repr = this[i].toSource();
      } else {
        var repr = JSON.stringify(this[i]);
      }
      s += ' ' + i + ': ' + repr;
    }
  }
  s += ']';
  return s;
};

OWAVerifier.states = {};
OWAVerifier.states.VerificationIncomplete = OWAVerifier.State("VerificationIncomplete");
OWAVerifier.states.NeedsInstall = OWAVerifier.State("NeedsInstall");
OWAVerifier.states.NetworkError = OWAVerifier.State("NetworkError");
OWAVerifier.states.NotInstalled = OWAVerifier.State("NotInstalled", OWAVerifier.states.NeedsInstall);
OWAVerifier.states.NoReceipts = OWAVerifier.State("NoReceipts", OWAVerifier.states.NeedsInstall);
OWAVerifier.states.NoValidReceipts = OWAVerifier.State("NoValidReceipts");
OWAVerifier.states.OK = OWAVerifier.State("OK");
OWAVerifier.states.InternalError = OWAVerifier.State("InternalError");
OWAVerifier.states.MozAppsError = OWAVerifier.State("MozAppsError", OWAVerifier.states.InternalError);
OWAVerifier.states.VerifierError = OWAVerifier.State("VerifierError", OWAVerifier.states.InternalError);
OWAVerifier.states.ServerError = OWAVerifier.State("ServerError", OWAVerifier.states.NetworkError);

OWAVerifier.states.toString = function () {
  var items = [];
  for (var i in this) {
    if (this.hasOwnProperty(i) && i != 'toString' && i != 'detail') {
      items.push(i);
    }
  }
  items.sort();
  return '{' + items.join(', ') + '}';
};

OWAVerifier.errors = {};
OWAVerifier.errors.ReceiptFormatError = OWAVerifier.State("ReceiptFormatError");
OWAVerifier.errors.ReceiptParseError = OWAVerifier.State("ReceiptParseError", OWAVerifier.errors.ReceiptFormatError);
OWAVerifier.errors.InvalidFromStore = OWAVerifier.State("InvalidFromStore");
OWAVerifier.errors.Refunded = OWAVerifier.State("Refunded");
OWAVerifier.errors.RequestTimeout = OWAVerifier.State("RequestTimeout", OWAVerifier.states.ServerError);
OWAVerifier.errors.ServerStatusError = OWAVerifier.State("ServerStatusError", OWAVerifier.states.ServerError);
OWAVerifier.errors.InvalidServerResponse = OWAVerifier.State("InvalidServerResponse", OWAVerifier.states.ServerError);
OWAVerifier.errors.InvalidReceiptIssuer = OWAVerifier.State("InvalidReceiptIssuer");
OWAVerifier.errors.ConnectionError = OWAVerifier.State("ConnectionError", OWAVerifier.states.NetworkError);
OWAVerifier.errors.ReceiptExpired = OWAVerifier.State("ReceiptExpired");

OWAVerifier.errors.toString = OWAVerifier.states.toString;

OWAVerifier.prototype = {

  toString: function () {
    var self = this;
    var s = '[OWAVerifier state: ' + this.state;
    if (this.products.length) {
      s += ' products: ' + this.products.map(function (i) {return i.url;}).join(', ');
    }
    this.iterReceiptErrors(function (receipt, error) {
      if (error == self.state) {
        // Sometimes a receipt error is promoted to the state
        s += ' Error(' + receipt.substr(0, 4) + '...' + receipt.substr(receipt.length-4) + '): [error is state]';
      } else {
        s += ' Error(' + receipt.substr(0, 4) + '...' + receipt.substr(receipt.length-4) + '): ' + error;
      }
    });
    if (this.app) {
      s += ' installed app: ' + this.app.manifestURL;
    }
    s += ']';
    return s;
  },

  iterReceiptErrors: function (callback) {
    for (var i in this.receiptErrors) {
      if (this.receiptErrors.hasOwnProperty(i)) {
        var result = callback(i, this.receiptErrors[i]);
        if (result === false) {
          break;
        }
      }
    }
  },

  verify: function (onVerified) {
    this.state = new this.states.VerificationIncomplete(".verify() has not completed");
    var result = navigator.mozApps.getSelf();
    var self = this;
    result.onsuccess = function () {
      try {
        self.app = this.result || null;
        if (! this.result) {
          self.state = new self.states.NotInstalled('The app is not installed');
          onVerified(self);
          return;
        }
        self.log(self.levels.INFO, "Got application: " + this.result.manifestURL);
        self.verifyReceipts(this.result, onVerified);
      } catch (e) {
        self.state = new self.states.VerifierError("Exception: " + e, {exception: e});
        onVerified(self);
      }
    };
    result.onerror = function () {
      self.state = new self.errors.MozAppsError("Error calling mozApps.getSelf: " + (this.error && this.error.name), {mozAppsError: this.error});
      self.log(self.levels.ERROR, "Got mozApps Error: " + (this.error && this.error.name));
      onVerified(self);
    };
  },

  verifyReceipts: function (app, onVerified) {
    if ((! app.receipts) || (! app.receipts.length)) {
      this.state = new this.states.NoReceipts("No receipts were found or installed");
      return;
    }
    if (this.installs_allowed_from === undefined) {
      this.installs_allowed_from = app.manifest.installs_allowed_from;
      this.log(this.levels.INFO, "Using installs_allowed_from value from manifest: " + JSON.stringify(this.installs_allowed_from));
    }
    var pending = app.receipts.length;
    var self = this;
    app.receipts.forEach(function (receipt) {
      self.log(self.levels.DEBUG, "Checking receipt " + receipt.substr(0, 4));
      var result = self.checkCache(receipt, false);
      if (result) {
        self.log(self.levels.INFO, "Got receipt (" + receipt.substr(0, 4) + ") status from cache: " + JSON.stringify(result));
        self._addReceiptVerification(receipt, result);
        pending--;
        if (! pending) {
          self._finishVerification(onVerified);
        }
        return;
      }
      try {
        self.verifyOneReceipt(app, receipt, function () {
          pending--;
          if (! pending) {
            self._finishVerification(onVerified);
          }
        });
      } catch (e) {
        self.log(self.levels.ERROR, "Got error in verifyOneReceipt: " + e);
        self._addReceiptError(receipt, new self.states.VerifierError("Exception in verifyOneReceipt: " + e, {exception: e}));
        // FIXME: potentially the callback could be called successfully, and exception still fire
        pending--;
        if (! pending) {
          self._finishVerification(onVerified);
        }
      }
    });
  },

  _finishVerification: function (onVerified) {
    try {
      this.log(this.levels.DEBUG, "Finished all receipt verification");
      if (this.state instanceof(this.states.VerificationIncomplete)) {
        this.log(this.levels.DEBUG, "No serious errors during verification");
        if (! this.products.length) {
          this.state = new this.states.NoValidReceipts("No receipts passed verification");
        } else {
          this.state = new this.states.OK();
        }
      }
      onVerified(this);
    } catch (e) {
      this.log(this.levels.ERROR, "Fatal error in _finishVerification: " + e);
      this.state = new this.states.VerifierError("Exception: " + e, {exception: e});
      onVerified(this);
    }
  },

  verifyOneReceipt: function (app, receipt, callback) {
    try {
      var parsed = this.parseReceipt(receipt);
    } catch (e) {
      this._addReceiptError(receipt, new this.errors.ReceiptParseError("Error decoding JSON: " + e, {exception: e}));
      callback();
      return;
    }
    var iss = parsed.iss;
    if (! iss) {
      this._addReceiptError(receipt, new this.errors.ReceiptFormatError("No (or empty) iss field"), {parsed: parsed});
      callback();
      return;
    }
    // FIXME: somewhat crude checking, case-sensitive:
    if (this.installs_allowed_from && this.installs_allowed_from.indexOf(iss) == -1 && this.installs_allowed_from.indexOf("*") == -1) {
      this._addReceiptError(receipt, new this.errors.InvalidReceiptIssuer("Issuer (iss) of receipt is not a valid installer: " + iss, {iss: iss}));
      callback();
      return;
    }
    var verify = parsed.verify;
    if (! verify) {
      this._addReceiptError(receipt, new this.errors.ReceiptFormatError("No (or empty) verify field"), {parsed: parsed});
      callback();
      return;
    }
    var req = new XMLHttpRequest();
    var self = this;
    var timeout = null;
    this.log(this.levels.INFO, "POSTing to " + verify);
    req.open("POST", verify);
    req.onreadystatechange = function () {
      if (req.readyState != 4) {
        return;
      }
      self.log(self.levels.INFO, "Request to " + verify + " completed with status: " + req.status);
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (req.status === 0) {
        self._addReceiptError(
          receipt,
          new self.errors.ConnectionError("Server could not be contacted", {request: req, url: verify}));
        callback();
        return;
      }
      if (req.status == 404) {
        self._addReceiptError(
          receipt,
          new self.errors.ServerStatusError("Server responded with 404 to " + verify,
                                            {request: req, status: req.status, url: verify}));
        callback();
        return;
      }
      if (req.status != 200) {
        self._addReceiptError(
          receipt,
          new self.errors.ServerStatusError("Server responded with non-200 status: " + req.status,
          {request: req, status: req.status, url: verify}));
        callback();
        return;
      }
      try {
        var result = JSON.parse(req.responseText);
      } catch (e) {
        self._addReceiptError(receipt, new self.errors.InvalidServerResponse("Invalid JSON from server", {request: req, text: req.responseText}));
        callback();
        return;
      }
      if (typeof result != "object" || result === null) {
        self._addReceiptError(receipt, new self.errors.InvalidServerResponse("Server did not respond with a JSON object (" + JSON.stringify(result) + ")", {request: req, text: req.responseText}));
        callback();
        return;
      }
      self.log(self.levels.INFO, "Receipt (" + receipt.substr(0, 4) + "...) completed with result: " + JSON.stringify(result));
      if (result.status == "ok" || result.status == "pending") {
        // FIXME: should represent pending better:
        self._addReceiptVerification(receipt, result);
        if (result.status == "ok") {
          self.saveResults(receipt, parsed, result);
        }
        callback();
        return;
      }
      if (result.status == "refunded") {
        self._addReceiptError(receipt, new self.errors.Refunded("Application payment was refunded", {result: result}));
        callback();
        return;
      }
      if (result.status == "expired") {
        self._addReceiptError(receipt, new self.errors.ReceiptExpired("Receipt expired", {result: result}));
        // FIXME: sometimes an error, sometimes not?  Accumulate separately?
        self._addReceiptVerification(receipt, result);
        callback();
        return;
      }
      if (result.status == "invalid") {
        self._addReceiptError(receipt, new self.errors.InvalidFromStore("The store reports the receipt is invalid", {result: result}));
        callback();
        return;
      }
      self._addReceiptError(receipt, new self.errors.InvalidServerResponse("Store replied with unknown status: " + result.status, {result: result}));
      callback();
    };
    req.send(receipt);
    if (this.requestTimeout) {
      timeout = setTimeout(function () {
        req.abort();
        self.log(self.levels.ERROR, "Request to " + verify + " timed out");
        self._addReceiptError(
          receipt,
          new self.errors.RequestTimeout(
            "The request timed out after " + this.requestTimeout + " milliseconds",
            {request: req, url: verify})
        );
      }, this.requestTimeout);
    }
  },

  _addReceiptError: function (receipt, error) {
    this.receiptErrors[receipt] = error;
    if (error instanceof this.states.NetworkError) {
      if (this.state instanceof this.states.VerificationIncomplete) {
        this.state = error;
      }
    }
  },

  _addReceiptVerification: function (receipt, result) {
    this.receiptVerifications[receipt] = result;
    this.products.push(this.parseReceipt(receipt).product);
  },

  checkCache: function (receipt, networkFailure) {
    // FIXME: this should distinguish between getting a cached value when it's helpful
    // and when it's needed (due to network error)
    if (! this._cacheStorage) {
      return null;
    }
    var key = this._makeKey(receipt);
    var value = this._cacheStorage.getItem(key);
    if (! value) {
      return null;
    }
    try {
      value = JSON.parse(value);
    } catch (e) {
      this._cacheStorage.removeItem(key);
      return null;
    }
    var result = value.result;
    if (! networkFailure) {
      if (value.created + this.checkInterval > Date.now()) {
        return null;
      }
      if (result.status == "pending") {
        // If it was pending we should check again
        return null;
      }
      var parsed = this.parseReceipt(receipt);
      if (parsed.iat && value.created - parsed.iat < this.refundWindow && Date.now() - parsed.iat > this.refundWindow) {
        // The receipt was last checked during the refund window, and
        // the refund window has passed, so we should check the
        // receipt again
        return null;
      }
      return result;
    } else {
      // If there was a network failure we should offer whatever value
      // we have cached
      return result;
    }
  },

  saveResults: function (receipt, parsedReceipt, result) {
    if (! this._cacheStorage) {
      return;
    }
    var key = this._makeKey(receipt);
    var value = {created: Date.now(), result: result};
    this._cacheStorage.setItem(key, JSON.stringify(value));
  },

  clearCache: function () {
    if (! this._cacheStorage) {
      return;
    }
    var bad = [];
    for (var i=0; i<this._cacheStorage.length; i++) {
      var key = this._cacheStorage.key(i);
      if (key.substr(0, 4) == "app.") {
        bad.push(key);
      }
    }
    for (i=0; i<bad.length; i++) {
      this._cacheStorage.removeItem(bad[i]);
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
  },

  _base64urlencode: function (s) {
    s = btoa(s);
    s = s.replace(/\+/g, '-');
    s = s.replace(/\//g, '_');
    s = s.replace(/[\n=]/g, '');
    return s;
  },

  levels: {
    "DEBUG": 10,
    "INFO": 20,
    "NOTIFY": 30,
    "WARN": 40,
    "ERROR": 50
  },

  logLevel: 2,

  log: function (level, message) {
    if ((! this.onlog) || level < this.logLevel) {
      return;
    }
    this.onlog(level, message);
  }

};

OWAVerifier.consoleLogger = function (level, message) {
  if (! console) {
    return;
  }
  if (level <= this.levels.DEBUG && console.debug) {
    console.debug(message);
  } else if (level <= this.levels.INFO && console.info) {
    console.info(message);
  } else if (level <= this.levels.NOTIFY && console.log) {
    console.log(message);
  } else if (level <= this.levels.WARN && console.warn) {
    console.warn(message);
  } else if (console.error) {
    console.error(message);
  } else {
    console.log(message);
  }
};


OWAVerifier.prototype.states = OWAVerifier.states;
OWAVerifier.prototype.errors = OWAVerifier.errors;
OWAVerifier.prototype.consoleLogger = OWAVerifier.consoleLogger;
