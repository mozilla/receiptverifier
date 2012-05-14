if (typeof OWAHelper == "undefined") {
  OWAHelper = {};
}

OWAHelper.errors = {
  NO_RECEIPTS: "NO_RECEIPTS",
  RECEIPT_ERRORS: "RECEIPT_ERRORS",
  RECEIPT_NETWORK_ERRORS: "RECEIPT_NETWORK_ERRORS",
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  RECEIPT_PARSE_ERROR: "RECEIPT_PARSE_ERROR",
  RECEIPT_INVALID: "RECEIPT_INVALID",
  STORE_INVALID: "STORE_INVALID",
  REFUNDED: "REFUNDED"
};

OWAHelper.verifyReceipts = function (app, installsAllowedFrom, callback, cache) {
  if ((! app.receipts) || (! app.receipts.length)) {
    callback({code: OWAHelper.errors.NO_RECEIPTS, detail: "No receipts installed"}, null);
    return;
  }
  var checkedReceiptErrors = {code: OWAHelper.errors.RECEIPT_NETWORK_ERRORS};
  var anyErrors = false;
  var checkedReceiptResults= {};
  var pending = app.receipts.length;
  app.receipts.each(function (receipt) {
    if (cache) {
      var result = cache.check(receipt);
      if (result) {
        checkedReceiptResults[receipt] = result;
        return;
      }
    }
    OWAHelper.verifyOneReceipt(app, receipt, installsAllowedFrom, function (error, result) {
      if (error) {
        checkedReceiptErrors[receipt] = error;
        if (error.code != OWAHelper.errors.NETWORK_ERROR && error.code != OWAHelpers.errors.SERVER_ERROR) {
          checkedReceiptErrors.code = OWAHelper.errors.RECEIPT_ERRORS;
        }
        anyErrors = true;
      } else {
        checkedReceiptResults[receipt] = result;
      }
      pending--;
      if (! pending) {
        if (anyErrors) {
          callback(checkedReceiptErrors, checkedReceiptResults);
        } else {
          callback(null, checkedReceiptResults);
        }
      }
    });
  });
};

OWAHelper.verifyOneReceipt = function (app, receipt, installsAllowedFrom, callback) {
  try {
    var parsed = OWAHelper.parseReceipt(receipt);
  } catch (e) {
    callback({code: OWAHelper.errors.RECEIPT_PARSE_ERROR, detail: e});
    return;
  }
  if (typeof installsAllowedFrom == "string") {
    // A calling error, but we'll gloss over it:
    installsAllowedFrom = [installsAllowedFrom];
  }
  var iss = parsed.iss;
  if (! iss) {
    callback({code: OWAHelpers.RECEIPT_INVALID, detail: "No (or empty) iss field"});
    return;
  }
  // FIXME: somewhat crude checking, case-sensitive:
  if (installsAllowedFrom && installsAllowedFrom.indexOf(iss) == -1 && installsAllowedFrom.indexOf("*") == -1) {
    callback({code: OWAHelpers.INVALID_INSTALLS_ALLOWED_FROM, detail: "Installer of receipt is not a valid installer: " + iss});
    return;
  }
  var verify = parsed.verify;
  var req = new XMLHttpRequest();
  req.open("POST", verify);
  req.onreadystatechange = function () {
    if (req.readyState != 4) {
      return;
    }
    if (req.status === 0) {
      callback({code: OWAHelpers.errors.NETWORK_ERROR, detail: "Server could not be contacted", request: req});
      return;
    }
    if (req.status != 200) {
      callback({code: OWAHelpers.errors.SERVER_ERROR, detail: "Server responded with non-200 status: " + req.status, request: req});
      return;
    }
    try {
      var result = JSON.parse(req.responseText);
    } catch (e) {
      callback({code: OWAHelpers.errors.SERVER_ERROR, detail: "Invalid JSON from server", request: req});
      return;
    }
    if (result.status == "ok" || result.status == "pending") {
      result.application = app;
      callback(null, result);
      return;
    }
    if (result.status == "refunded") {
      callback({code: OWAHelpers.errors.REFUNDED, detail: "Application payment was refunded", result: result});
      return;
    }
    if (result.status == "expired") {
      // FIXME: sometimes an error, sometimes not?  Accumulate separately?
      callback(null, result);
      return;
    }
    if (result.status == "invalid") {
      callback({code: OWAHelpers.errors.STORE_INVALID, detail: "The store reports the receipt is invalid", result: result});
      return;
    }
    callback({code: OWAHelpers.errors.SERVER_ERROR, detail: "Store replied with unknown status: " + result.status, result: result});
  };
  req.send(receipt);
};

OWAHelper.parseReceipt = function (receipt) {
  if (receipt.indexOf('.') == -1) {
    throw 'Not valid JWT';
  }
  var body = receipt.substr(0, receipt.indexOf('.'));
  body = atob(body);
  body = JSON.parse(body);
  return body;
};

OWAHelper.Cache = function (options) {
  if (this == window) {
    throw 'You forgot new';
  }
  options = options || {};
  this.storage = options.storage || localStorage;
  this.checkInterval = options.checkInterval || (1000 * 60 * 60 * 24);
};

OWAHelper.Cache.prototype = {
  check: function (receipt) {
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
    for (var receipt in results) {
      if (! results.hasOwnProperty(receipt)) {
        continue;
      }
      var key = this._makeKey(receipt);
      var value = {created: Date.now().getTime(), result: results[receipt]};
      this.storage.saveItem(key, JSON.stringify(value));
    }
  },
  _makeKey: function (receipt) {
    return 'app.' + receipt;
  },
  verifyReceipts: function (app, installsAllowedFrom, callback) {
    var self = this;
    OWAHelper.verifyReceipts(
      app,
      installsAllowedFrom,
      function (error, result) {
        if (! error) {
          self.saveResults(result);
        }
        callback(error, result);
      },
      this);
  }
};
