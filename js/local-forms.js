(function () {
  var brand = window.BRAND || {};
  var lang = (document.documentElement.lang || "").toLowerCase();
  var success =
    lang.indexOf("en") === 0
      ? brand.formSuccessEn || "Request received."
      : brand.formSuccessRu || "Заявка принята.";

  function fakeResponse() {
    return Promise.resolve(
      new Response(
        JSON.stringify({ success: true, data: { message: success } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
  }

  function isAjaxUrl(url) {
    var value = String(url || "");
    return /admin-ajax\.php/i.test(value) || /\/api\/contact/i.test(value);
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      if (isAjaxUrl(url)) return fakeResponse();
      return originalFetch.apply(this, arguments);
    };
  }

  if (window.XMLHttpRequest) {
    var send = XMLHttpRequest.prototype.send;
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__climoraAjax = isAjaxUrl(url);
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__climoraAjax) {
        var xhr = this;
        setTimeout(function () {
          Object.defineProperty(xhr, "status", { value: 200 });
          Object.defineProperty(xhr, "readyState", { value: 4 });
          Object.defineProperty(xhr, "responseText", {
            value: JSON.stringify({ success: true, data: { message: success } }),
          });
          xhr.onreadystatechange && xhr.onreadystatechange();
          xhr.onload && xhr.onload();
        }, 200);
        return;
      }
      return send.apply(this, arguments);
    };
  }
})();
