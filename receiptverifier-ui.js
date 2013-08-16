/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This is an example user interface, suitable for quick testing.
 * We would recommend using your own UI tools to display a suitable user
 * interface.
 *
 * Note: that the current use of Function( ) in this code does not
 * pass CSP: https://bugzilla.mozilla.org/show_bug.cgi?id=902946
 */

(function (exports) {

if (! exports.receipts) {
  exports.receipts = {};
}

// embedded https://github.com/potch/mu.js
var $ = (function(win, doc, undefined) {

    function pico(sel) {
        var ret,
            p,
            forEach = Array.prototype.forEach;

        ret = sel.nodeType ? [sel] : doc.querySelectorAll(sel);

        ret.each = function(fn) {
            forEach.call(ret, function(item) {
                fn.call(item);
            });
            return ret;
        };


        ret.on = function(type, handler) {
            ret.each(function() {
                on(this, type, handler);
            });
            return ret;
        };


        ret.css = function(o) {
            var p;
            if (typeof o == 'object') {
                for (p in o) {
                    ret.each(function() {
                        this.style[p] = o[p];
                    });
                }
                return ret;
            }
            return win.getComputedStyle(ret[0]).getPropertyValue(o);
        };


        ret.attr = function(o) {
            var p;
            if (typeof o == 'object') {
                for (p in o) {
                    ret.each(function() {
                        this.setAttribute(p, o[p]);
                    });
                }
                return ret;
            }
            return ret[0].getAttribute(o);
        };


        return ret;
    }

    var on = pico.on = function(el, type, handler) {
        el.addEventListener(type, function(e) {
            handler.call(e.target, e);
        }, false);
    };

    return pico;
})(typeof window !== 'undefined' ? window : global, typeof document !== 'undefined' ? document : undefined);


function Prompter(options) {
  var i;
  if (! this instanceof Prompter) {
    return new Prompter(options);
  }
  options = options || {};
  this.overlay = null;
  for (i in options) {
    if (options.hasOwnProperty(i) && i != 'verifier' &&
        i != 'templates' && i != 'verify' && i != 'verifierOptions') {
      if (this[i] === undefined) {
        throw 'Unknown option: ' + i;
      }
      this[i] = options[i];
    }
  }
  if (options.templates) {
    var old = this.templates;
    this.templates = {};
    for (i in old) {
      this.templates[i] = old[i];
    }
    for (i in options.templates) {
      if (options.templates.hasOwnProperty(i)) {
        this.templates[i] = options.templates[i];
      }
    }
  }
  if (! this.storeURL) {
    throw 'You must provide a storeURL option';
  }
  if (! this.supportHTML) {
    throw 'You must provide a supportHTML option';
  }
  if (options.verifier) {
    this.respond(options.verifier);
  }
  if (options.verify) {
    var verifier = new Verifier(options.verifierOptions);
    var self = this;
    verifier.verify(function () {
      self.respond(verifier);
    });
  }
}

Prompter.prototype = {

  storeURL: null,
  allowNoInstall: false,
  // FIXME: should be required (or self install):
  ignoreInternalError: false,
  fatalInternalError: false,
  // Maybe required?
  supportHTML: null,

  templates: {
    fatalInternalError: 'We have encountered a error that keeps us from continuing.  Please contact support: <%= supportHTML %>',
    internalError: 'We have encountered an error.  You may close this dialog to continue, but please also contact support: <%= supportHTML %>',
    storeInstall: 'Please visit the <a href="<%= quote(storeURL) %>">store page</a> to install the application.',
    refunded: 'You purchased this app, but then got a refund.  If you still want to use the application, you must <a href="<%= quote(storeURL) %>">purchase the application again</a>.',
    invalidReceiptIssuer: 'You purchased this application from <%= error.iss %> which is not a store we have a relationship with.  Please either <a href="<%= quote(storeURL) %>">re-purchase the application</a> or contact support: <%= supportHTML %>',
    invalidFromStore: 'The store reports that your purchase receipt is invalid.  Please <a href="<%= quote(storeURL) %>">visit the store to reinstall the application</a>.',
    receiptFormatError: 'Your purchase receipt is malformed.  Please <a href="<%= quote(storeURL) %>">visit the store to reinstall the application</a>.',
    genericError: 'An error has occurred.  <a href="<%= quote(storeURL) %>">Reinstalling the application</a> may fix this problem.  If not please contact support: <%= supportHTML %>',
    mozAppsNotSupported: 'This browser or device does not support the Marketplace Apps system.'
  },

  respond: function (verifier) {
    this.verifier = verifier;
    if (verifier.state instanceof verifier.states.VerificationIncomplete) {
      if (window.console && console.log) {
        console.log('Prompter called with verifier', verifier, 'before verification complete');
        if (console.trace) {
          console.track();
        }
      }
      throw 'Prompter called before verification complete';
    }
    if (verifier.state instanceof verifier.states.OK ||
        verifier.state instanceof verifier.states.NetworkError) {
      return;
    }
    if (verifier.state instanceof verifier.states.MozAppsNotSupported) {
      this.handleMozAppsNotSupported(verifier);
      return;
    }
    if (verifier.state instanceof verifier.states.InternalError) {
      if (this.ignoreInternalError) {
        return;
      }
      this.handleInternalError(verifier);
      return;
    }
    // FIXME: we need an option for rejecting a stale cache here
    if (verifier.state instanceof verifier.states.NeedsInstall) {
      this.handleInstall(verifier);
      return;
    }
    if (verifier.state instanceof verifier.states.NoValidReceipts) {
      var bestReason = null;
      verifier.iterReceiptErrors(function (receipt, error) {
        if (bestReason === null) {
          bestReason = error;
        } else if (bestReason instanceof verifier.states.NetworkError) {
          bestReason = error;
        }
      });
      this.handleReceiptError(verifier, bestReason);
      return;
    }
    if (window.console && console.log) {
      console.log('Unexpected state: ' + verifier.state);
    }
    throw 'Unexpected state in verifier: ' + verifier.state;
  },

  handleMozAppsNotSupported: function (verifier) {
    var blocking = ! this.allowNoInstall;
    this.display(this.render(this.templates.mozAppsNotSupported), blocking);
  },

  handleInternalError: function (verifier) {
    if (this.fatalInternalError) {
      this.display(this.render(this.templates.fatalInternalError), true);
    } else {
      this.display(this.render(this.templates.internalError), false);
    }
  },

  handleInstall: function (verifier) {
    var blocking = ! this.allowNoInstall;
    if (this.allowNoInstall && verifier.state instanceof verifier.states.NoReceipts) {
      // In this case, we don't care at all - they installed the app for free
      return;
    }
    var template = this.templates.storeInstall;
    var message = this.render(template);
    this.display(message, blocking);
  },

  handleReceiptError: function (verifier, error) {
    var template;
    this.error = error;
    if (error instanceof verifier.errors.Refunded) {
      template = this.templates.refunded;
    } else if (error instanceof verifier.errors.InvalidReceiptIssuer) {
      template = this.templates.invalidReceiptIssuer;
    } else if (error instanceof verifier.errors.InvalidFromStore) {
      template = this.templates.invalidFromStore;
    } else if (error instanceof verifier.errors.ReceiptFormatError) {
      template = this.templates.receiptFormatError;
    } else {
      template = this.templates.genericError;
    }
    var message = this.render(template);
    this.display(message, ! this.allowNoInstall);
  },

  // UI related functions:


  overlayId: 'moz-receiptverifier-overlay',

  // FIXME: you can still scroll the background
  // FIXME: the message box is slightly transparent
  // FIXME: excessive box-shadow?
  // FIXME: the X in the close button is off-center
  generalStyle:
  '#OVERLAYID-message,#OVERLAYID-message *,#OVERLAYID-message a:hover,#OVERLAYID-message a:visited,#OVERLAYID-message a:active {\n' +
  '  bottom:auto;clear:none;cursor:default;font-family:Helvetica,Arial,sans-serif;font-size:medium;font-style:normal;font-weight:normal;' +
  '  height:auto;left:auto;letter-spacing:normal;line-height:1.4;max-height:none;max-width:none;min-height:0;min-width:0;overflow:visible;' +
  '  right:auto;text-align:left;text-decoration:none;text-indent:0;text-transform:none;top:auto;visibility:visible;white-space:normal;' +
  '  width:auto;z-index:auto;\n' +
  '}\n' +
  '#OVERLAYID-message a {color: #00f;}\n' +
  '#OVERLAYID-message a:visited {color:#a0f;}\n' +
  '#OVERLAYID-message a:hover {text-decoration:underline;}\n' +
  '#OVERLAYID {\n' +
  '  position:fixed;top:0;left:0;z-index:9999;background:#000;opacity:0.85;width:100%;height:100%;\n' +
  '}\n' +
  '#OVERLAYID-message {\n' +
  '  z-index:1000;position:fixed;top:100px;left:50%;margin-left:-200px;width:400px;padding:0.75em 1em 0.75em 1em;' +
  '  border:3px solid #ccc;background:#fff;opacity:1.0;color:#000;border-radius:1em;\n' +
  '}\n' +
  '#OVERLAYID-close {\n' +
  '  display:block;position:fixed;top:91px;left:50%;margin-left:227px;z-index:1001;height:0;width:18px;padding:18px 0 0 0;' +
  '  overflow:hidden;background:#000 none;border:2px solid #fff;border-radius:18px;' +
  '  box-shadow:0 0 6px #000,1.6px 1.6px 1.6px rgba(0,0,0,0.3),-1.6px 1.6px 1.6px rgba(0,0,0,0.3),1.6px -1.6px 1.6px rgba(0,0,0,0.3),-1.6px -1.6px 1.6px rgba(0,0,0,0.3);' +
  '  color:#fff;cursor:pointer;user-select:none;\n' +
  '}\n' +
  '#OVERLAYID-close-text {\n' +
  '  display:block;text-align:center;width:18px;top:0px;left:0px;position:absolute;font-size:18px;line-height:18px;\n' +
  '}\n',

  createOverlay: function (blocking) {
    this.removeOverlay();
    this.addStyle();
    this.blocking = blocking;
    this.overlay = $(document.createElement('div'));
    this.overlay.attr({
      id: this.overlayId
    });
    this.message = $(document.createElement('div'));
    this.message.attr({
      id: this.overlayId + '-message'
    });
    this.overlay[0].appendChild(this.message[0]);
    if (! blocking) {
      this.close = $(document.createElement('div'));
      this.close.attr({
        id: this.overlayId + '-close'
      });
      var inner = $(document.createElement('div'));
      inner.attr({
        id: this.overlayId + '-close-text'
      });
      inner[0].appendChild(document.createTextNode('\xd7'));
      this.close[0].appendChild(inner[0]);
      this.overlay[0].appendChild(this.close[0]);
    }
    $('body').css({'z-index': '-1'})[0].appendChild(this.overlay[0]);
    var self = this;
    function tryCancel() {
      if (self.blocking) {
        self.flash();
      } else {
        self.removeOverlay();
      }
    }
    this.overlay.on('click', function (ev) {
      var target = ev.target;
      while (target) {
        if (self.message && target == self.message[0]) {
          return;
        }
        if (self.overlay && target == self.overlay[0]) {
          break;
        }
        target = target.parentNode;
      }
      tryCancel();
    });
    if (this.close) {
      this.close.on('click', function () {
        tryCancel();
      });
    }
    $(document).on('keypress', function (ev) {
      if (ev.keyCode == 27) {
        tryCancel();
      }
    });
  },

  // FIXME: for some reason this doesn't flash properly, but will if
  // you change tabs?
  flash: function () {
    if (! this.message) {
      return;
    }
    this.message.css({border: '3px solid #f00'});
    var self = this;
    setTimeout(function () {
      if (self.message) {
        self.message.css({border: '3px solid #ccc'});
      }
    }, 2000);
  },

  removeOverlay: function () {
    var existing = $('#' + this.overlayId)[0];
    if (existing) {
      existing.parentNode.removeChild(existing);
    }
    this.overlay = null;
    this.message = null;
    this.close = null;
  },

  addStyle: function () {
    var id = this.overlayId + '-style';
    var existing = $('#' + id);
    if (existing[0]) {
      return;
    }
    var el = document.createElement('style');
    el.id = id;
    el.setAttribute('type', 'text/css');
    var style = this.generalStyle;
    style = style.replace(/OVERLAYID/g, this.overlayId);
    el.appendChild(document.createTextNode(style));
    document.head.appendChild(el);
  },

  display: function (htmlMessage, blocking) {
    if (! this.message) {
      // FIXME: closeable might be lost
      this.createOverlay(blocking);
    }
    this.message[0].innerHTML = htmlMessage;
  },

  quote: function (text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&gt;').replace(/"/g, '&quot;');
  },

  _templateCache: {},

  render: function (template, data) {
    var fn;
    // From http://ejohn.org/blog/javascript-micro-templating/
    data = data || this;
    // Figure out if we're getting a template, or if we need to
    // load the template - and be sure to cache the result.
    if (this._templateCache[template]) {
      fn = this._templateCache[template];
    } else {
      fn =
        // Generate a reusable function that will serve as a template
        // generator (and which will be cached).
        new Function("obj",
          "var p=[],print=function(){p.push.apply(p,arguments);};" +

          // Introduce the data as local variables using with(){}
          "with(obj){p.push('" +

          // Convert the template into pure JavaScript
          template
            .replace(/[\r\t\n]/g, " ")
            .split("<%").join("\t")
            .replace(/((^|%>)[^\t]*)'/g, "$1\r")
            .replace(/\t=(.*?)%>/g, "',$1,'")
            .split("\t").join("');")
            .split("%>").join("p.push('")
            .split("\r").join("\\'") +
          "');}return p.join('');");
      this._templateCache[template] = fn;
    }
    return fn(data);
  }

};

exports.receipts.Prompter = Prompter;

})(typeof exports == "undefined" ? (this.mozmarket ? this.mozmarket : this.mozmarket = {}) : exports);
