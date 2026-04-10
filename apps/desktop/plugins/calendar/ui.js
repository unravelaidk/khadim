var fc = { exports: {} }, pe = {};
var T0;
function c1() {
  if (T0) return pe;
  T0 = 1;
  var E = /* @__PURE__ */ Symbol.for("react.transitional.element"), R = /* @__PURE__ */ Symbol.for("react.fragment");
  function N(v, B, K) {
    var J = null;
    if (K !== void 0 && (J = "" + K), B.key !== void 0 && (J = "" + B.key), "key" in B) {
      K = {};
      for (var ll in B)
        ll !== "key" && (K[ll] = B[ll]);
    } else K = B;
    return B = K.ref, {
      $$typeof: E,
      type: v,
      key: J,
      ref: B !== void 0 ? B : null,
      props: K
    };
  }
  return pe.Fragment = R, pe.jsx = N, pe.jsxs = N, pe;
}
var E0;
function s1() {
  return E0 || (E0 = 1, fc.exports = c1()), fc.exports;
}
var M = s1(), cc = { exports: {} }, Te = {}, sc = { exports: {} }, dc = {};
var A0;
function d1() {
  return A0 || (A0 = 1, (function(E) {
    function R(S, A) {
      var q = S.length;
      S.push(A);
      l: for (; 0 < q; ) {
        var cl = q - 1 >>> 1, vl = S[cl];
        if (0 < B(vl, A))
          S[cl] = A, S[q] = vl, q = cl;
        else break l;
      }
    }
    function N(S) {
      return S.length === 0 ? null : S[0];
    }
    function v(S) {
      if (S.length === 0) return null;
      var A = S[0], q = S.pop();
      if (q !== A) {
        S[0] = q;
        l: for (var cl = 0, vl = S.length, d = vl >>> 1; cl < d; ) {
          var T = 2 * (cl + 1) - 1, _ = S[T], O = T + 1, Q = S[O];
          if (0 > B(_, q))
            O < vl && 0 > B(Q, _) ? (S[cl] = Q, S[O] = q, cl = O) : (S[cl] = _, S[T] = q, cl = T);
          else if (O < vl && 0 > B(Q, q))
            S[cl] = Q, S[O] = q, cl = O;
          else break l;
        }
      }
      return A;
    }
    function B(S, A) {
      var q = S.sortIndex - A.sortIndex;
      return q !== 0 ? q : S.id - A.id;
    }
    if (E.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var K = performance;
      E.unstable_now = function() {
        return K.now();
      };
    } else {
      var J = Date, ll = J.now();
      E.unstable_now = function() {
        return J.now() - ll;
      };
    }
    var x = [], z = [], L = 1, H = null, el = 3, Dl = !1, El = !1, Sl = !1, zl = !1, I = typeof setTimeout == "function" ? setTimeout : null, Vl = typeof clearTimeout == "function" ? clearTimeout : null, bl = typeof setImmediate < "u" ? setImmediate : null;
    function G(S) {
      for (var A = N(z); A !== null; ) {
        if (A.callback === null) v(z);
        else if (A.startTime <= S)
          v(z), A.sortIndex = A.expirationTime, R(x, A);
        else break;
        A = N(z);
      }
    }
    function Ol(S) {
      if (Sl = !1, G(S), !El)
        if (N(x) !== null)
          El = !0, Rl || (Rl = !0, Wl());
        else {
          var A = N(z);
          A !== null && Et(Ol, A.startTime - S);
        }
    }
    var Rl = !1, X = -1, Ll = 5, xt = -1;
    function Va() {
      return zl ? !0 : !(E.unstable_now() - xt < Ll);
    }
    function Dt() {
      if (zl = !1, Rl) {
        var S = E.unstable_now();
        xt = S;
        var A = !0;
        try {
          l: {
            El = !1, Sl && (Sl = !1, Vl(X), X = -1), Dl = !0;
            var q = el;
            try {
              t: {
                for (G(S), H = N(x); H !== null && !(H.expirationTime > S && Va()); ) {
                  var cl = H.callback;
                  if (typeof cl == "function") {
                    H.callback = null, el = H.priorityLevel;
                    var vl = cl(
                      H.expirationTime <= S
                    );
                    if (S = E.unstable_now(), typeof vl == "function") {
                      H.callback = vl, G(S), A = !0;
                      break t;
                    }
                    H === N(x) && v(x), G(S);
                  } else v(x);
                  H = N(x);
                }
                if (H !== null) A = !0;
                else {
                  var d = N(z);
                  d !== null && Et(
                    Ol,
                    d.startTime - S
                  ), A = !1;
                }
              }
              break l;
            } finally {
              H = null, el = q, Dl = !1;
            }
            A = void 0;
          }
        } finally {
          A ? Wl() : Rl = !1;
        }
      }
    }
    var Wl;
    if (typeof bl == "function")
      Wl = function() {
        bl(Dt);
      };
    else if (typeof MessageChannel < "u") {
      var Ea = new MessageChannel(), Nt = Ea.port2;
      Ea.port1.onmessage = Dt, Wl = function() {
        Nt.postMessage(null);
      };
    } else
      Wl = function() {
        I(Dt, 0);
      };
    function Et(S, A) {
      X = I(function() {
        S(E.unstable_now());
      }, A);
    }
    E.unstable_IdlePriority = 5, E.unstable_ImmediatePriority = 1, E.unstable_LowPriority = 4, E.unstable_NormalPriority = 3, E.unstable_Profiling = null, E.unstable_UserBlockingPriority = 2, E.unstable_cancelCallback = function(S) {
      S.callback = null;
    }, E.unstable_forceFrameRate = function(S) {
      0 > S || 125 < S ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : Ll = 0 < S ? Math.floor(1e3 / S) : 5;
    }, E.unstable_getCurrentPriorityLevel = function() {
      return el;
    }, E.unstable_next = function(S) {
      switch (el) {
        case 1:
        case 2:
        case 3:
          var A = 3;
          break;
        default:
          A = el;
      }
      var q = el;
      el = A;
      try {
        return S();
      } finally {
        el = q;
      }
    }, E.unstable_requestPaint = function() {
      zl = !0;
    }, E.unstable_runWithPriority = function(S, A) {
      switch (S) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          S = 3;
      }
      var q = el;
      el = S;
      try {
        return A();
      } finally {
        el = q;
      }
    }, E.unstable_scheduleCallback = function(S, A, q) {
      var cl = E.unstable_now();
      switch (typeof q == "object" && q !== null ? (q = q.delay, q = typeof q == "number" && 0 < q ? cl + q : cl) : q = cl, S) {
        case 1:
          var vl = -1;
          break;
        case 2:
          vl = 250;
          break;
        case 5:
          vl = 1073741823;
          break;
        case 4:
          vl = 1e4;
          break;
        default:
          vl = 5e3;
      }
      return vl = q + vl, S = {
        id: L++,
        callback: A,
        priorityLevel: S,
        startTime: q,
        expirationTime: vl,
        sortIndex: -1
      }, q > cl ? (S.sortIndex = q, R(z, S), N(x) === null && S === N(z) && (Sl ? (Vl(X), X = -1) : Sl = !0, Et(Ol, q - cl))) : (S.sortIndex = vl, R(x, S), El || Dl || (El = !0, Rl || (Rl = !0, Wl()))), S;
    }, E.unstable_shouldYield = Va, E.unstable_wrapCallback = function(S) {
      var A = el;
      return function() {
        var q = el;
        el = A;
        try {
          return S.apply(this, arguments);
        } finally {
          el = q;
        }
      };
    };
  })(dc)), dc;
}
var _0;
function o1() {
  return _0 || (_0 = 1, sc.exports = d1()), sc.exports;
}
var oc = { exports: {} }, Y = {};
var M0;
function v1() {
  if (M0) return Y;
  M0 = 1;
  var E = /* @__PURE__ */ Symbol.for("react.transitional.element"), R = /* @__PURE__ */ Symbol.for("react.portal"), N = /* @__PURE__ */ Symbol.for("react.fragment"), v = /* @__PURE__ */ Symbol.for("react.strict_mode"), B = /* @__PURE__ */ Symbol.for("react.profiler"), K = /* @__PURE__ */ Symbol.for("react.consumer"), J = /* @__PURE__ */ Symbol.for("react.context"), ll = /* @__PURE__ */ Symbol.for("react.forward_ref"), x = /* @__PURE__ */ Symbol.for("react.suspense"), z = /* @__PURE__ */ Symbol.for("react.memo"), L = /* @__PURE__ */ Symbol.for("react.lazy"), H = /* @__PURE__ */ Symbol.for("react.activity"), el = Symbol.iterator;
  function Dl(d) {
    return d === null || typeof d != "object" ? null : (d = el && d[el] || d["@@iterator"], typeof d == "function" ? d : null);
  }
  var El = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, Sl = Object.assign, zl = {};
  function I(d, T, _) {
    this.props = d, this.context = T, this.refs = zl, this.updater = _ || El;
  }
  I.prototype.isReactComponent = {}, I.prototype.setState = function(d, T) {
    if (typeof d != "object" && typeof d != "function" && d != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, d, T, "setState");
  }, I.prototype.forceUpdate = function(d) {
    this.updater.enqueueForceUpdate(this, d, "forceUpdate");
  };
  function Vl() {
  }
  Vl.prototype = I.prototype;
  function bl(d, T, _) {
    this.props = d, this.context = T, this.refs = zl, this.updater = _ || El;
  }
  var G = bl.prototype = new Vl();
  G.constructor = bl, Sl(G, I.prototype), G.isPureReactComponent = !0;
  var Ol = Array.isArray;
  function Rl() {
  }
  var X = { H: null, A: null, T: null, S: null }, Ll = Object.prototype.hasOwnProperty;
  function xt(d, T, _) {
    var O = _.ref;
    return {
      $$typeof: E,
      type: d,
      key: T,
      ref: O !== void 0 ? O : null,
      props: _
    };
  }
  function Va(d, T) {
    return xt(d.type, T, d.props);
  }
  function Dt(d) {
    return typeof d == "object" && d !== null && d.$$typeof === E;
  }
  function Wl(d) {
    var T = { "=": "=0", ":": "=2" };
    return "$" + d.replace(/[=:]/g, function(_) {
      return T[_];
    });
  }
  var Ea = /\/+/g;
  function Nt(d, T) {
    return typeof d == "object" && d !== null && d.key != null ? Wl("" + d.key) : T.toString(36);
  }
  function Et(d) {
    switch (d.status) {
      case "fulfilled":
        return d.value;
      case "rejected":
        throw d.reason;
      default:
        switch (typeof d.status == "string" ? d.then(Rl, Rl) : (d.status = "pending", d.then(
          function(T) {
            d.status === "pending" && (d.status = "fulfilled", d.value = T);
          },
          function(T) {
            d.status === "pending" && (d.status = "rejected", d.reason = T);
          }
        )), d.status) {
          case "fulfilled":
            return d.value;
          case "rejected":
            throw d.reason;
        }
    }
    throw d;
  }
  function S(d, T, _, O, Q) {
    var w = typeof d;
    (w === "undefined" || w === "boolean") && (d = null);
    var nl = !1;
    if (d === null) nl = !0;
    else
      switch (w) {
        case "bigint":
        case "string":
        case "number":
          nl = !0;
          break;
        case "object":
          switch (d.$$typeof) {
            case E:
            case R:
              nl = !0;
              break;
            case L:
              return nl = d._init, S(
                nl(d._payload),
                T,
                _,
                O,
                Q
              );
          }
      }
    if (nl)
      return Q = Q(d), nl = O === "" ? "." + Nt(d, 0) : O, Ol(Q) ? (_ = "", nl != null && (_ = nl.replace(Ea, "$&/") + "/"), S(Q, T, _, "", function(Du) {
        return Du;
      })) : Q != null && (Dt(Q) && (Q = Va(
        Q,
        _ + (Q.key == null || d && d.key === Q.key ? "" : ("" + Q.key).replace(
          Ea,
          "$&/"
        ) + "/") + nl
      )), T.push(Q)), 1;
    nl = 0;
    var Jl = O === "" ? "." : O + ":";
    if (Ol(d))
      for (var Al = 0; Al < d.length; Al++)
        O = d[Al], w = Jl + Nt(O, Al), nl += S(
          O,
          T,
          _,
          w,
          Q
        );
    else if (Al = Dl(d), typeof Al == "function")
      for (d = Al.call(d), Al = 0; !(O = d.next()).done; )
        O = O.value, w = Jl + Nt(O, Al++), nl += S(
          O,
          T,
          _,
          w,
          Q
        );
    else if (w === "object") {
      if (typeof d.then == "function")
        return S(
          Et(d),
          T,
          _,
          O,
          Q
        );
      throw T = String(d), Error(
        "Objects are not valid as a React child (found: " + (T === "[object Object]" ? "object with keys {" + Object.keys(d).join(", ") + "}" : T) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return nl;
  }
  function A(d, T, _) {
    if (d == null) return d;
    var O = [], Q = 0;
    return S(d, O, "", "", function(w) {
      return T.call(_, w, Q++);
    }), O;
  }
  function q(d) {
    if (d._status === -1) {
      var T = d._result;
      T = T(), T.then(
        function(_) {
          (d._status === 0 || d._status === -1) && (d._status = 1, d._result = _);
        },
        function(_) {
          (d._status === 0 || d._status === -1) && (d._status = 2, d._result = _);
        }
      ), d._status === -1 && (d._status = 0, d._result = T);
    }
    if (d._status === 1) return d._result.default;
    throw d._result;
  }
  var cl = typeof reportError == "function" ? reportError : function(d) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var T = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof d == "object" && d !== null && typeof d.message == "string" ? String(d.message) : String(d),
        error: d
      });
      if (!window.dispatchEvent(T)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", d);
      return;
    }
    console.error(d);
  }, vl = {
    map: A,
    forEach: function(d, T, _) {
      A(
        d,
        function() {
          T.apply(this, arguments);
        },
        _
      );
    },
    count: function(d) {
      var T = 0;
      return A(d, function() {
        T++;
      }), T;
    },
    toArray: function(d) {
      return A(d, function(T) {
        return T;
      }) || [];
    },
    only: function(d) {
      if (!Dt(d))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return d;
    }
  };
  return Y.Activity = H, Y.Children = vl, Y.Component = I, Y.Fragment = N, Y.Profiler = B, Y.PureComponent = bl, Y.StrictMode = v, Y.Suspense = x, Y.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = X, Y.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(d) {
      return X.H.useMemoCache(d);
    }
  }, Y.cache = function(d) {
    return function() {
      return d.apply(null, arguments);
    };
  }, Y.cacheSignal = function() {
    return null;
  }, Y.cloneElement = function(d, T, _) {
    if (d == null)
      throw Error(
        "The argument must be a React element, but you passed " + d + "."
      );
    var O = Sl({}, d.props), Q = d.key;
    if (T != null)
      for (w in T.key !== void 0 && (Q = "" + T.key), T)
        !Ll.call(T, w) || w === "key" || w === "__self" || w === "__source" || w === "ref" && T.ref === void 0 || (O[w] = T[w]);
    var w = arguments.length - 2;
    if (w === 1) O.children = _;
    else if (1 < w) {
      for (var nl = Array(w), Jl = 0; Jl < w; Jl++)
        nl[Jl] = arguments[Jl + 2];
      O.children = nl;
    }
    return xt(d.type, Q, O);
  }, Y.createContext = function(d) {
    return d = {
      $$typeof: J,
      _currentValue: d,
      _currentValue2: d,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, d.Provider = d, d.Consumer = {
      $$typeof: K,
      _context: d
    }, d;
  }, Y.createElement = function(d, T, _) {
    var O, Q = {}, w = null;
    if (T != null)
      for (O in T.key !== void 0 && (w = "" + T.key), T)
        Ll.call(T, O) && O !== "key" && O !== "__self" && O !== "__source" && (Q[O] = T[O]);
    var nl = arguments.length - 2;
    if (nl === 1) Q.children = _;
    else if (1 < nl) {
      for (var Jl = Array(nl), Al = 0; Al < nl; Al++)
        Jl[Al] = arguments[Al + 2];
      Q.children = Jl;
    }
    if (d && d.defaultProps)
      for (O in nl = d.defaultProps, nl)
        Q[O] === void 0 && (Q[O] = nl[O]);
    return xt(d, w, Q);
  }, Y.createRef = function() {
    return { current: null };
  }, Y.forwardRef = function(d) {
    return { $$typeof: ll, render: d };
  }, Y.isValidElement = Dt, Y.lazy = function(d) {
    return {
      $$typeof: L,
      _payload: { _status: -1, _result: d },
      _init: q
    };
  }, Y.memo = function(d, T) {
    return {
      $$typeof: z,
      type: d,
      compare: T === void 0 ? null : T
    };
  }, Y.startTransition = function(d) {
    var T = X.T, _ = {};
    X.T = _;
    try {
      var O = d(), Q = X.S;
      Q !== null && Q(_, O), typeof O == "object" && O !== null && typeof O.then == "function" && O.then(Rl, cl);
    } catch (w) {
      cl(w);
    } finally {
      T !== null && _.types !== null && (T.types = _.types), X.T = T;
    }
  }, Y.unstable_useCacheRefresh = function() {
    return X.H.useCacheRefresh();
  }, Y.use = function(d) {
    return X.H.use(d);
  }, Y.useActionState = function(d, T, _) {
    return X.H.useActionState(d, T, _);
  }, Y.useCallback = function(d, T) {
    return X.H.useCallback(d, T);
  }, Y.useContext = function(d) {
    return X.H.useContext(d);
  }, Y.useDebugValue = function() {
  }, Y.useDeferredValue = function(d, T) {
    return X.H.useDeferredValue(d, T);
  }, Y.useEffect = function(d, T) {
    return X.H.useEffect(d, T);
  }, Y.useEffectEvent = function(d) {
    return X.H.useEffectEvent(d);
  }, Y.useId = function() {
    return X.H.useId();
  }, Y.useImperativeHandle = function(d, T, _) {
    return X.H.useImperativeHandle(d, T, _);
  }, Y.useInsertionEffect = function(d, T) {
    return X.H.useInsertionEffect(d, T);
  }, Y.useLayoutEffect = function(d, T) {
    return X.H.useLayoutEffect(d, T);
  }, Y.useMemo = function(d, T) {
    return X.H.useMemo(d, T);
  }, Y.useOptimistic = function(d, T) {
    return X.H.useOptimistic(d, T);
  }, Y.useReducer = function(d, T, _) {
    return X.H.useReducer(d, T, _);
  }, Y.useRef = function(d) {
    return X.H.useRef(d);
  }, Y.useState = function(d) {
    return X.H.useState(d);
  }, Y.useSyncExternalStore = function(d, T, _) {
    return X.H.useSyncExternalStore(
      d,
      T,
      _
    );
  }, Y.useTransition = function() {
    return X.H.useTransition();
  }, Y.version = "19.2.4", Y;
}
var x0;
function gc() {
  return x0 || (x0 = 1, oc.exports = v1()), oc.exports;
}
var vc = { exports: {} }, Kl = {};
var D0;
function y1() {
  if (D0) return Kl;
  D0 = 1;
  var E = gc();
  function R(x) {
    var z = "https://react.dev/errors/" + x;
    if (1 < arguments.length) {
      z += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var L = 2; L < arguments.length; L++)
        z += "&args[]=" + encodeURIComponent(arguments[L]);
    }
    return "Minified React error #" + x + "; visit " + z + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function N() {
  }
  var v = {
    d: {
      f: N,
      r: function() {
        throw Error(R(522));
      },
      D: N,
      C: N,
      L: N,
      m: N,
      X: N,
      S: N,
      M: N
    },
    p: 0,
    findDOMNode: null
  }, B = /* @__PURE__ */ Symbol.for("react.portal");
  function K(x, z, L) {
    var H = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: B,
      key: H == null ? null : "" + H,
      children: x,
      containerInfo: z,
      implementation: L
    };
  }
  var J = E.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function ll(x, z) {
    if (x === "font") return "";
    if (typeof z == "string")
      return z === "use-credentials" ? z : "";
  }
  return Kl.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = v, Kl.createPortal = function(x, z) {
    var L = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!z || z.nodeType !== 1 && z.nodeType !== 9 && z.nodeType !== 11)
      throw Error(R(299));
    return K(x, z, null, L);
  }, Kl.flushSync = function(x) {
    var z = J.T, L = v.p;
    try {
      if (J.T = null, v.p = 2, x) return x();
    } finally {
      J.T = z, v.p = L, v.d.f();
    }
  }, Kl.preconnect = function(x, z) {
    typeof x == "string" && (z ? (z = z.crossOrigin, z = typeof z == "string" ? z === "use-credentials" ? z : "" : void 0) : z = null, v.d.C(x, z));
  }, Kl.prefetchDNS = function(x) {
    typeof x == "string" && v.d.D(x);
  }, Kl.preinit = function(x, z) {
    if (typeof x == "string" && z && typeof z.as == "string") {
      var L = z.as, H = ll(L, z.crossOrigin), el = typeof z.integrity == "string" ? z.integrity : void 0, Dl = typeof z.fetchPriority == "string" ? z.fetchPriority : void 0;
      L === "style" ? v.d.S(
        x,
        typeof z.precedence == "string" ? z.precedence : void 0,
        {
          crossOrigin: H,
          integrity: el,
          fetchPriority: Dl
        }
      ) : L === "script" && v.d.X(x, {
        crossOrigin: H,
        integrity: el,
        fetchPriority: Dl,
        nonce: typeof z.nonce == "string" ? z.nonce : void 0
      });
    }
  }, Kl.preinitModule = function(x, z) {
    if (typeof x == "string")
      if (typeof z == "object" && z !== null) {
        if (z.as == null || z.as === "script") {
          var L = ll(
            z.as,
            z.crossOrigin
          );
          v.d.M(x, {
            crossOrigin: L,
            integrity: typeof z.integrity == "string" ? z.integrity : void 0,
            nonce: typeof z.nonce == "string" ? z.nonce : void 0
          });
        }
      } else z == null && v.d.M(x);
  }, Kl.preload = function(x, z) {
    if (typeof x == "string" && typeof z == "object" && z !== null && typeof z.as == "string") {
      var L = z.as, H = ll(L, z.crossOrigin);
      v.d.L(x, L, {
        crossOrigin: H,
        integrity: typeof z.integrity == "string" ? z.integrity : void 0,
        nonce: typeof z.nonce == "string" ? z.nonce : void 0,
        type: typeof z.type == "string" ? z.type : void 0,
        fetchPriority: typeof z.fetchPriority == "string" ? z.fetchPriority : void 0,
        referrerPolicy: typeof z.referrerPolicy == "string" ? z.referrerPolicy : void 0,
        imageSrcSet: typeof z.imageSrcSet == "string" ? z.imageSrcSet : void 0,
        imageSizes: typeof z.imageSizes == "string" ? z.imageSizes : void 0,
        media: typeof z.media == "string" ? z.media : void 0
      });
    }
  }, Kl.preloadModule = function(x, z) {
    if (typeof x == "string")
      if (z) {
        var L = ll(z.as, z.crossOrigin);
        v.d.m(x, {
          as: typeof z.as == "string" && z.as !== "script" ? z.as : void 0,
          crossOrigin: L,
          integrity: typeof z.integrity == "string" ? z.integrity : void 0
        });
      } else v.d.m(x);
  }, Kl.requestFormReset = function(x) {
    v.d.r(x);
  }, Kl.unstable_batchedUpdates = function(x, z) {
    return x(z);
  }, Kl.useFormState = function(x, z, L) {
    return J.H.useFormState(x, z, L);
  }, Kl.useFormStatus = function() {
    return J.H.useHostTransitionStatus();
  }, Kl.version = "19.2.4", Kl;
}
var O0;
function m1() {
  if (O0) return vc.exports;
  O0 = 1;
  function E() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(E);
      } catch (R) {
        console.error(R);
      }
  }
  return E(), vc.exports = y1(), vc.exports;
}
var U0;
function r1() {
  if (U0) return Te;
  U0 = 1;
  var E = o1(), R = gc(), N = m1();
  function v(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++)
        t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function B(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function K(l) {
    var t = l, a = l;
    if (l.alternate) for (; t.return; ) t = t.return;
    else {
      l = t;
      do
        t = l, (t.flags & 4098) !== 0 && (a = t.return), l = t.return;
      while (l);
    }
    return t.tag === 3 ? a : null;
  }
  function J(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function ll(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function x(l) {
    if (K(l) !== l)
      throw Error(v(188));
  }
  function z(l) {
    var t = l.alternate;
    if (!t) {
      if (t = K(l), t === null) throw Error(v(188));
      return t !== l ? null : l;
    }
    for (var a = l, u = t; ; ) {
      var e = a.return;
      if (e === null) break;
      var n = e.alternate;
      if (n === null) {
        if (u = e.return, u !== null) {
          a = u;
          continue;
        }
        break;
      }
      if (e.child === n.child) {
        for (n = e.child; n; ) {
          if (n === a) return x(e), l;
          if (n === u) return x(e), t;
          n = n.sibling;
        }
        throw Error(v(188));
      }
      if (a.return !== u.return) a = e, u = n;
      else {
        for (var i = !1, f = e.child; f; ) {
          if (f === a) {
            i = !0, a = e, u = n;
            break;
          }
          if (f === u) {
            i = !0, u = e, a = n;
            break;
          }
          f = f.sibling;
        }
        if (!i) {
          for (f = n.child; f; ) {
            if (f === a) {
              i = !0, a = n, u = e;
              break;
            }
            if (f === u) {
              i = !0, u = n, a = e;
              break;
            }
            f = f.sibling;
          }
          if (!i) throw Error(v(189));
        }
      }
      if (a.alternate !== u) throw Error(v(190));
    }
    if (a.tag !== 3) throw Error(v(188));
    return a.stateNode.current === a ? l : t;
  }
  function L(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = L(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var H = Object.assign, el = /* @__PURE__ */ Symbol.for("react.element"), Dl = /* @__PURE__ */ Symbol.for("react.transitional.element"), El = /* @__PURE__ */ Symbol.for("react.portal"), Sl = /* @__PURE__ */ Symbol.for("react.fragment"), zl = /* @__PURE__ */ Symbol.for("react.strict_mode"), I = /* @__PURE__ */ Symbol.for("react.profiler"), Vl = /* @__PURE__ */ Symbol.for("react.consumer"), bl = /* @__PURE__ */ Symbol.for("react.context"), G = /* @__PURE__ */ Symbol.for("react.forward_ref"), Ol = /* @__PURE__ */ Symbol.for("react.suspense"), Rl = /* @__PURE__ */ Symbol.for("react.suspense_list"), X = /* @__PURE__ */ Symbol.for("react.memo"), Ll = /* @__PURE__ */ Symbol.for("react.lazy"), xt = /* @__PURE__ */ Symbol.for("react.activity"), Va = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Dt = Symbol.iterator;
  function Wl(l) {
    return l === null || typeof l != "object" ? null : (l = Dt && l[Dt] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Ea = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Nt(l) {
    if (l == null) return null;
    if (typeof l == "function")
      return l.$$typeof === Ea ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case Sl:
        return "Fragment";
      case I:
        return "Profiler";
      case zl:
        return "StrictMode";
      case Ol:
        return "Suspense";
      case Rl:
        return "SuspenseList";
      case xt:
        return "Activity";
    }
    if (typeof l == "object")
      switch (l.$$typeof) {
        case El:
          return "Portal";
        case bl:
          return l.displayName || "Context";
        case Vl:
          return (l._context.displayName || "Context") + ".Consumer";
        case G:
          var t = l.render;
          return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
        case X:
          return t = l.displayName || null, t !== null ? t : Nt(l.type) || "Memo";
        case Ll:
          t = l._payload, l = l._init;
          try {
            return Nt(l(t));
          } catch {
          }
      }
    return null;
  }
  var Et = Array.isArray, S = R.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, A = N.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, q = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, cl = [], vl = -1;
  function d(l) {
    return { current: l };
  }
  function T(l) {
    0 > vl || (l.current = cl[vl], cl[vl] = null, vl--);
  }
  function _(l, t) {
    vl++, cl[vl] = l.current, l.current = t;
  }
  var O = d(null), Q = d(null), w = d(null), nl = d(null);
  function Jl(l, t) {
    switch (_(w, t), _(Q, l), _(O, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? Ko(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI)
          t = Ko(t), l = Jo(t, l);
        else
          switch (l) {
            case "svg":
              l = 1;
              break;
            case "math":
              l = 2;
              break;
            default:
              l = 0;
          }
    }
    T(O), _(O, l);
  }
  function Al() {
    T(O), T(Q), T(w);
  }
  function Du(l) {
    l.memoizedState !== null && _(nl, l);
    var t = O.current, a = Jo(t, l.type);
    t !== a && (_(Q, l), _(O, a));
  }
  function Ee(l) {
    Q.current === l && (T(O), T(Q)), nl.current === l && (T(nl), ge._currentValue = q);
  }
  var Zn, zc;
  function Aa(l) {
    if (Zn === void 0)
      try {
        throw Error();
      } catch (a) {
        var t = a.stack.trim().match(/\n( *(at )?)/);
        Zn = t && t[1] || "", zc = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + Zn + l + zc;
  }
  var Vn = !1;
  function Ln(l, t) {
    if (!l || Vn) return "";
    Vn = !0;
    var a = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var u = {
        DetermineComponentFrameRoot: function() {
          try {
            if (t) {
              var p = function() {
                throw Error();
              };
              if (Object.defineProperty(p.prototype, "props", {
                set: function() {
                  throw Error();
                }
              }), typeof Reflect == "object" && Reflect.construct) {
                try {
                  Reflect.construct(p, []);
                } catch (h) {
                  var r = h;
                }
                Reflect.construct(l, [], p);
              } else {
                try {
                  p.call();
                } catch (h) {
                  r = h;
                }
                l.call(p.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (h) {
                r = h;
              }
              (p = l()) && typeof p.catch == "function" && p.catch(function() {
              });
            }
          } catch (h) {
            if (h && r && typeof h.stack == "string")
              return [h.stack, r.stack];
          }
          return [null, null];
        }
      };
      u.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var e = Object.getOwnPropertyDescriptor(
        u.DetermineComponentFrameRoot,
        "name"
      );
      e && e.configurable && Object.defineProperty(
        u.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var n = u.DetermineComponentFrameRoot(), i = n[0], f = n[1];
      if (i && f) {
        var c = i.split(`
`), m = f.split(`
`);
        for (e = u = 0; u < c.length && !c[u].includes("DetermineComponentFrameRoot"); )
          u++;
        for (; e < m.length && !m[e].includes(
          "DetermineComponentFrameRoot"
        ); )
          e++;
        if (u === c.length || e === m.length)
          for (u = c.length - 1, e = m.length - 1; 1 <= u && 0 <= e && c[u] !== m[e]; )
            e--;
        for (; 1 <= u && 0 <= e; u--, e--)
          if (c[u] !== m[e]) {
            if (u !== 1 || e !== 1)
              do
                if (u--, e--, 0 > e || c[u] !== m[e]) {
                  var g = `
` + c[u].replace(" at new ", " at ");
                  return l.displayName && g.includes("<anonymous>") && (g = g.replace("<anonymous>", l.displayName)), g;
                }
              while (1 <= u && 0 <= e);
            break;
          }
      }
    } finally {
      Vn = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? Aa(a) : "";
  }
  function G0(l, t) {
    switch (l.tag) {
      case 26:
      case 27:
      case 5:
        return Aa(l.type);
      case 16:
        return Aa("Lazy");
      case 13:
        return l.child !== t && t !== null ? Aa("Suspense Fallback") : Aa("Suspense");
      case 19:
        return Aa("SuspenseList");
      case 0:
      case 15:
        return Ln(l.type, !1);
      case 11:
        return Ln(l.type.render, !1);
      case 1:
        return Ln(l.type, !0);
      case 31:
        return Aa("Activity");
      default:
        return "";
    }
  }
  function pc(l) {
    try {
      var t = "", a = null;
      do
        t += G0(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Kn = Object.prototype.hasOwnProperty, Jn = E.unstable_scheduleCallback, wn = E.unstable_cancelCallback, X0 = E.unstable_shouldYield, Q0 = E.unstable_requestPaint, ut = E.unstable_now, Z0 = E.unstable_getCurrentPriorityLevel, Tc = E.unstable_ImmediatePriority, Ec = E.unstable_UserBlockingPriority, Ae = E.unstable_NormalPriority, V0 = E.unstable_LowPriority, Ac = E.unstable_IdlePriority, L0 = E.log, K0 = E.unstable_setDisableYieldValue, Ou = null, et = null;
  function It(l) {
    if (typeof L0 == "function" && K0(l), et && typeof et.setStrictMode == "function")
      try {
        et.setStrictMode(Ou, l);
      } catch {
      }
  }
  var nt = Math.clz32 ? Math.clz32 : W0, J0 = Math.log, w0 = Math.LN2;
  function W0(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (J0(l) / w0 | 0) | 0;
  }
  var _e = 256, Me = 262144, xe = 4194304;
  function _a(l) {
    var t = l & 42;
    if (t !== 0) return t;
    switch (l & -l) {
      case 1:
        return 1;
      case 2:
        return 2;
      case 4:
        return 4;
      case 8:
        return 8;
      case 16:
        return 16;
      case 32:
        return 32;
      case 64:
        return 64;
      case 128:
        return 128;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
        return l & 261888;
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return l & 3932160;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return l & 62914560;
      case 67108864:
        return 67108864;
      case 134217728:
        return 134217728;
      case 268435456:
        return 268435456;
      case 536870912:
        return 536870912;
      case 1073741824:
        return 0;
      default:
        return l;
    }
  }
  function De(l, t, a) {
    var u = l.pendingLanes;
    if (u === 0) return 0;
    var e = 0, n = l.suspendedLanes, i = l.pingedLanes;
    l = l.warmLanes;
    var f = u & 134217727;
    return f !== 0 ? (u = f & ~n, u !== 0 ? e = _a(u) : (i &= f, i !== 0 ? e = _a(i) : a || (a = f & ~l, a !== 0 && (e = _a(a))))) : (f = u & ~n, f !== 0 ? e = _a(f) : i !== 0 ? e = _a(i) : a || (a = u & ~l, a !== 0 && (e = _a(a)))), e === 0 ? 0 : t !== 0 && t !== e && (t & n) === 0 && (n = e & -e, a = t & -t, n >= a || n === 32 && (a & 4194048) !== 0) ? t : e;
  }
  function Uu(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function $0(l, t) {
    switch (l) {
      case 1:
      case 2:
      case 4:
      case 8:
      case 64:
        return t + 250;
      case 16:
      case 32:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return -1;
      case 67108864:
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1;
      default:
        return -1;
    }
  }
  function _c() {
    var l = xe;
    return xe <<= 1, (xe & 62914560) === 0 && (xe = 4194304), l;
  }
  function Wn(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function Hu(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function k0(l, t, a, u, e, n) {
    var i = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var f = l.entanglements, c = l.expirationTimes, m = l.hiddenUpdates;
    for (a = i & ~a; 0 < a; ) {
      var g = 31 - nt(a), p = 1 << g;
      f[g] = 0, c[g] = -1;
      var r = m[g];
      if (r !== null)
        for (m[g] = null, g = 0; g < r.length; g++) {
          var h = r[g];
          h !== null && (h.lane &= -536870913);
        }
      a &= ~p;
    }
    u !== 0 && Mc(l, u, 0), n !== 0 && e === 0 && l.tag !== 0 && (l.suspendedLanes |= n & ~(i & ~t));
  }
  function Mc(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var u = 31 - nt(t);
    l.entangledLanes |= t, l.entanglements[u] = l.entanglements[u] | 1073741824 | a & 261930;
  }
  function xc(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var u = 31 - nt(a), e = 1 << u;
      e & t | l[u] & t && (l[u] |= t), a &= ~e;
    }
  }
  function Dc(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : $n(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function $n(l) {
    switch (l) {
      case 2:
        l = 1;
        break;
      case 8:
        l = 4;
        break;
      case 32:
        l = 16;
        break;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        l = 128;
        break;
      case 268435456:
        l = 134217728;
        break;
      default:
        l = 0;
    }
    return l;
  }
  function kn(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function Oc() {
    var l = A.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : r0(l.type));
  }
  function Uc(l, t) {
    var a = A.p;
    try {
      return A.p = l, t();
    } finally {
      A.p = a;
    }
  }
  var Pt = Math.random().toString(36).slice(2), Yl = "__reactFiber$" + Pt, $l = "__reactProps$" + Pt, La = "__reactContainer$" + Pt, Fn = "__reactEvents$" + Pt, F0 = "__reactListeners$" + Pt, I0 = "__reactHandles$" + Pt, Hc = "__reactResources$" + Pt, Cu = "__reactMarker$" + Pt;
  function In(l) {
    delete l[Yl], delete l[$l], delete l[Fn], delete l[F0], delete l[I0];
  }
  function Ka(l) {
    var t = l[Yl];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[La] || a[Yl]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null)
          for (l = Po(l); l !== null; ) {
            if (a = l[Yl]) return a;
            l = Po(l);
          }
        return t;
      }
      l = a, a = l.parentNode;
    }
    return null;
  }
  function Ja(l) {
    if (l = l[Yl] || l[La]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return l;
    }
    return null;
  }
  function Nu(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(v(33));
  }
  function wa(l) {
    var t = l[Hc];
    return t || (t = l[Hc] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function Bl(l) {
    l[Cu] = !0;
  }
  var Cc = /* @__PURE__ */ new Set(), Nc = {};
  function Ma(l, t) {
    Wa(l, t), Wa(l + "Capture", t);
  }
  function Wa(l, t) {
    for (Nc[l] = t, l = 0; l < t.length; l++)
      Cc.add(t[l]);
  }
  var P0 = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Rc = {}, jc = {};
  function lv(l) {
    return Kn.call(jc, l) ? !0 : Kn.call(Rc, l) ? !1 : P0.test(l) ? jc[l] = !0 : (Rc[l] = !0, !1);
  }
  function Oe(l, t, a) {
    if (lv(t))
      if (a === null) l.removeAttribute(t);
      else {
        switch (typeof a) {
          case "undefined":
          case "function":
          case "symbol":
            l.removeAttribute(t);
            return;
          case "boolean":
            var u = t.toLowerCase().slice(0, 5);
            if (u !== "data-" && u !== "aria-") {
              l.removeAttribute(t);
              return;
            }
        }
        l.setAttribute(t, "" + a);
      }
  }
  function Ue(l, t, a) {
    if (a === null) l.removeAttribute(t);
    else {
      switch (typeof a) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(t);
          return;
      }
      l.setAttribute(t, "" + a);
    }
  }
  function Rt(l, t, a, u) {
    if (u === null) l.removeAttribute(a);
    else {
      switch (typeof u) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(a);
          return;
      }
      l.setAttributeNS(t, a, "" + u);
    }
  }
  function yt(l) {
    switch (typeof l) {
      case "bigint":
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return l;
      case "object":
        return l;
      default:
        return "";
    }
  }
  function Bc(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function tv(l, t, a) {
    var u = Object.getOwnPropertyDescriptor(
      l.constructor.prototype,
      t
    );
    if (!l.hasOwnProperty(t) && typeof u < "u" && typeof u.get == "function" && typeof u.set == "function") {
      var e = u.get, n = u.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return e.call(this);
        },
        set: function(i) {
          a = "" + i, n.call(this, i);
        }
      }), Object.defineProperty(l, t, {
        enumerable: u.enumerable
      }), {
        getValue: function() {
          return a;
        },
        setValue: function(i) {
          a = "" + i;
        },
        stopTracking: function() {
          l._valueTracker = null, delete l[t];
        }
      };
    }
  }
  function Pn(l) {
    if (!l._valueTracker) {
      var t = Bc(l) ? "checked" : "value";
      l._valueTracker = tv(
        l,
        t,
        "" + l[t]
      );
    }
  }
  function qc(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), u = "";
    return l && (u = Bc(l) ? l.checked ? "true" : "false" : l.value), l = u, l !== a ? (t.setValue(l), !0) : !1;
  }
  function He(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var av = /[\n"\\]/g;
  function mt(l) {
    return l.replace(
      av,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function li(l, t, a, u, e, n, i, f) {
    l.name = "", i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" ? l.type = i : l.removeAttribute("type"), t != null ? i === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + yt(t)) : l.value !== "" + yt(t) && (l.value = "" + yt(t)) : i !== "submit" && i !== "reset" || l.removeAttribute("value"), t != null ? ti(l, i, yt(t)) : a != null ? ti(l, i, yt(a)) : u != null && l.removeAttribute("value"), e == null && n != null && (l.defaultChecked = !!n), e != null && (l.checked = e && typeof e != "function" && typeof e != "symbol"), f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" ? l.name = "" + yt(f) : l.removeAttribute("name");
  }
  function Yc(l, t, a, u, e, n, i, f) {
    if (n != null && typeof n != "function" && typeof n != "symbol" && typeof n != "boolean" && (l.type = n), t != null || a != null) {
      if (!(n !== "submit" && n !== "reset" || t != null)) {
        Pn(l);
        return;
      }
      a = a != null ? "" + yt(a) : "", t = t != null ? "" + yt(t) : a, f || t === l.value || (l.value = t), l.defaultValue = t;
    }
    u = u ?? e, u = typeof u != "function" && typeof u != "symbol" && !!u, l.checked = f ? l.checked : !!u, l.defaultChecked = !!u, i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (l.name = i), Pn(l);
  }
  function ti(l, t, a) {
    t === "number" && He(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function $a(l, t, a, u) {
    if (l = l.options, t) {
      t = {};
      for (var e = 0; e < a.length; e++)
        t["$" + a[e]] = !0;
      for (a = 0; a < l.length; a++)
        e = t.hasOwnProperty("$" + l[a].value), l[a].selected !== e && (l[a].selected = e), e && u && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + yt(a), t = null, e = 0; e < l.length; e++) {
        if (l[e].value === a) {
          l[e].selected = !0, u && (l[e].defaultSelected = !0);
          return;
        }
        t !== null || l[e].disabled || (t = l[e]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Gc(l, t, a) {
    if (t != null && (t = "" + yt(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + yt(a) : "";
  }
  function Xc(l, t, a, u) {
    if (t == null) {
      if (u != null) {
        if (a != null) throw Error(v(92));
        if (Et(u)) {
          if (1 < u.length) throw Error(v(93));
          u = u[0];
        }
        a = u;
      }
      a == null && (a = ""), t = a;
    }
    a = yt(t), l.defaultValue = a, u = l.textContent, u === a && u !== "" && u !== null && (l.value = u), Pn(l);
  }
  function ka(l, t) {
    if (t) {
      var a = l.firstChild;
      if (a && a === l.lastChild && a.nodeType === 3) {
        a.nodeValue = t;
        return;
      }
    }
    l.textContent = t;
  }
  var uv = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function Qc(l, t, a) {
    var u = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? u ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : u ? l.setProperty(t, a) : typeof a != "number" || a === 0 || uv.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function Zc(l, t, a) {
    if (t != null && typeof t != "object")
      throw Error(v(62));
    if (l = l.style, a != null) {
      for (var u in a)
        !a.hasOwnProperty(u) || t != null && t.hasOwnProperty(u) || (u.indexOf("--") === 0 ? l.setProperty(u, "") : u === "float" ? l.cssFloat = "" : l[u] = "");
      for (var e in t)
        u = t[e], t.hasOwnProperty(e) && a[e] !== u && Qc(l, e, u);
    } else
      for (var n in t)
        t.hasOwnProperty(n) && Qc(l, n, t[n]);
  }
  function ai(l) {
    if (l.indexOf("-") === -1) return !1;
    switch (l) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return !1;
      default:
        return !0;
    }
  }
  var ev = /* @__PURE__ */ new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]), nv = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Ce(l) {
    return nv.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function jt() {
  }
  var ui = null;
  function ei(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var Fa = null, Ia = null;
  function Vc(l) {
    var t = Ja(l);
    if (t && (l = t.stateNode)) {
      var a = l[$l] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (li(
            l,
            a.value,
            a.defaultValue,
            a.defaultValue,
            a.checked,
            a.defaultChecked,
            a.type,
            a.name
          ), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll(
              'input[name="' + mt(
                "" + t
              ) + '"][type="radio"]'
            ), t = 0; t < a.length; t++) {
              var u = a[t];
              if (u !== l && u.form === l.form) {
                var e = u[$l] || null;
                if (!e) throw Error(v(90));
                li(
                  u,
                  e.value,
                  e.defaultValue,
                  e.defaultValue,
                  e.checked,
                  e.defaultChecked,
                  e.type,
                  e.name
                );
              }
            }
            for (t = 0; t < a.length; t++)
              u = a[t], u.form === l.form && qc(u);
          }
          break l;
        case "textarea":
          Gc(l, a.value, a.defaultValue);
          break l;
        case "select":
          t = a.value, t != null && $a(l, !!a.multiple, t, !1);
      }
    }
  }
  var ni = !1;
  function Lc(l, t, a) {
    if (ni) return l(t, a);
    ni = !0;
    try {
      var u = l(t);
      return u;
    } finally {
      if (ni = !1, (Fa !== null || Ia !== null) && (zn(), Fa && (t = Fa, l = Ia, Ia = Fa = null, Vc(t), l)))
        for (t = 0; t < l.length; t++) Vc(l[t]);
    }
  }
  function Ru(l, t) {
    var a = l.stateNode;
    if (a === null) return null;
    var u = a[$l] || null;
    if (u === null) return null;
    a = u[t];
    l: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (u = !u.disabled) || (l = l.type, u = !(l === "button" || l === "input" || l === "select" || l === "textarea")), l = !u;
        break l;
      default:
        l = !1;
    }
    if (l) return null;
    if (a && typeof a != "function")
      throw Error(
        v(231, t, typeof a)
      );
    return a;
  }
  var Bt = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), ii = !1;
  if (Bt)
    try {
      var ju = {};
      Object.defineProperty(ju, "passive", {
        get: function() {
          ii = !0;
        }
      }), window.addEventListener("test", ju, ju), window.removeEventListener("test", ju, ju);
    } catch {
      ii = !1;
    }
  var la = null, fi = null, Ne = null;
  function Kc() {
    if (Ne) return Ne;
    var l, t = fi, a = t.length, u, e = "value" in la ? la.value : la.textContent, n = e.length;
    for (l = 0; l < a && t[l] === e[l]; l++) ;
    var i = a - l;
    for (u = 1; u <= i && t[a - u] === e[n - u]; u++) ;
    return Ne = e.slice(l, 1 < u ? 1 - u : void 0);
  }
  function Re(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function je() {
    return !0;
  }
  function Jc() {
    return !1;
  }
  function kl(l) {
    function t(a, u, e, n, i) {
      this._reactName = a, this._targetInst = e, this.type = u, this.nativeEvent = n, this.target = i, this.currentTarget = null;
      for (var f in l)
        l.hasOwnProperty(f) && (a = l[f], this[f] = a ? a(n) : n[f]);
      return this.isDefaultPrevented = (n.defaultPrevented != null ? n.defaultPrevented : n.returnValue === !1) ? je : Jc, this.isPropagationStopped = Jc, this;
    }
    return H(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var a = this.nativeEvent;
        a && (a.preventDefault ? a.preventDefault() : typeof a.returnValue != "unknown" && (a.returnValue = !1), this.isDefaultPrevented = je);
      },
      stopPropagation: function() {
        var a = this.nativeEvent;
        a && (a.stopPropagation ? a.stopPropagation() : typeof a.cancelBubble != "unknown" && (a.cancelBubble = !0), this.isPropagationStopped = je);
      },
      persist: function() {
      },
      isPersistent: je
    }), t;
  }
  var xa = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(l) {
      return l.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Be = kl(xa), Bu = H({}, xa, { view: 0, detail: 0 }), iv = kl(Bu), ci, si, qu, qe = H({}, Bu, {
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    getModifierState: oi,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== qu && (qu && l.type === "mousemove" ? (ci = l.screenX - qu.screenX, si = l.screenY - qu.screenY) : si = ci = 0, qu = l), ci);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : si;
    }
  }), wc = kl(qe), fv = H({}, qe, { dataTransfer: 0 }), cv = kl(fv), sv = H({}, Bu, { relatedTarget: 0 }), di = kl(sv), dv = H({}, xa, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), ov = kl(dv), vv = H({}, xa, {
    clipboardData: function(l) {
      return "clipboardData" in l ? l.clipboardData : window.clipboardData;
    }
  }), yv = kl(vv), mv = H({}, xa, { data: 0 }), Wc = kl(mv), rv = {
    Esc: "Escape",
    Spacebar: " ",
    Left: "ArrowLeft",
    Up: "ArrowUp",
    Right: "ArrowRight",
    Down: "ArrowDown",
    Del: "Delete",
    Win: "OS",
    Menu: "ContextMenu",
    Apps: "ContextMenu",
    Scroll: "ScrollLock",
    MozPrintableKey: "Unidentified"
  }, hv = {
    8: "Backspace",
    9: "Tab",
    12: "Clear",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    19: "Pause",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    45: "Insert",
    46: "Delete",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NumLock",
    145: "ScrollLock",
    224: "Meta"
  }, gv = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Sv(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = gv[l]) ? !!t[l] : !1;
  }
  function oi() {
    return Sv;
  }
  var bv = H({}, Bu, {
    key: function(l) {
      if (l.key) {
        var t = rv[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = Re(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? hv[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: oi,
    charCode: function(l) {
      return l.type === "keypress" ? Re(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? Re(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  }), zv = kl(bv), pv = H({}, qe, {
    pointerId: 0,
    width: 0,
    height: 0,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 0,
    isPrimary: 0
  }), $c = kl(pv), Tv = H({}, Bu, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: oi
  }), Ev = kl(Tv), Av = H({}, xa, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), _v = kl(Av), Mv = H({}, qe, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), xv = kl(Mv), Dv = H({}, xa, {
    newState: 0,
    oldState: 0
  }), Ov = kl(Dv), Uv = [9, 13, 27, 32], vi = Bt && "CompositionEvent" in window, Yu = null;
  Bt && "documentMode" in document && (Yu = document.documentMode);
  var Hv = Bt && "TextEvent" in window && !Yu, kc = Bt && (!vi || Yu && 8 < Yu && 11 >= Yu), Fc = " ", Ic = !1;
  function Pc(l, t) {
    switch (l) {
      case "keyup":
        return Uv.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return !0;
      default:
        return !1;
    }
  }
  function ls(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var Pa = !1;
  function Cv(l, t) {
    switch (l) {
      case "compositionend":
        return ls(t);
      case "keypress":
        return t.which !== 32 ? null : (Ic = !0, Fc);
      case "textInput":
        return l = t.data, l === Fc && Ic ? null : l;
      default:
        return null;
    }
  }
  function Nv(l, t) {
    if (Pa)
      return l === "compositionend" || !vi && Pc(l, t) ? (l = Kc(), Ne = fi = la = null, Pa = !1, l) : null;
    switch (l) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
          if (t.char && 1 < t.char.length)
            return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return kc && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Rv = {
    color: !0,
    date: !0,
    datetime: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    password: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0
  };
  function ts(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!Rv[l.type] : t === "textarea";
  }
  function as(l, t, a, u) {
    Fa ? Ia ? Ia.push(u) : Ia = [u] : Fa = u, t = xn(t, "onChange"), 0 < t.length && (a = new Be(
      "onChange",
      "change",
      null,
      a,
      u
    ), l.push({ event: a, listeners: t }));
  }
  var Gu = null, Xu = null;
  function jv(l) {
    Go(l, 0);
  }
  function Ye(l) {
    var t = Nu(l);
    if (qc(t)) return l;
  }
  function us(l, t) {
    if (l === "change") return t;
  }
  var es = !1;
  if (Bt) {
    var yi;
    if (Bt) {
      var mi = "oninput" in document;
      if (!mi) {
        var ns = document.createElement("div");
        ns.setAttribute("oninput", "return;"), mi = typeof ns.oninput == "function";
      }
      yi = mi;
    } else yi = !1;
    es = yi && (!document.documentMode || 9 < document.documentMode);
  }
  function is() {
    Gu && (Gu.detachEvent("onpropertychange", fs), Xu = Gu = null);
  }
  function fs(l) {
    if (l.propertyName === "value" && Ye(Xu)) {
      var t = [];
      as(
        t,
        Xu,
        l,
        ei(l)
      ), Lc(jv, t);
    }
  }
  function Bv(l, t, a) {
    l === "focusin" ? (is(), Gu = t, Xu = a, Gu.attachEvent("onpropertychange", fs)) : l === "focusout" && is();
  }
  function qv(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown")
      return Ye(Xu);
  }
  function Yv(l, t) {
    if (l === "click") return Ye(t);
  }
  function Gv(l, t) {
    if (l === "input" || l === "change")
      return Ye(t);
  }
  function Xv(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var it = typeof Object.is == "function" ? Object.is : Xv;
  function Qu(l, t) {
    if (it(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null)
      return !1;
    var a = Object.keys(l), u = Object.keys(t);
    if (a.length !== u.length) return !1;
    for (u = 0; u < a.length; u++) {
      var e = a[u];
      if (!Kn.call(t, e) || !it(l[e], t[e]))
        return !1;
    }
    return !0;
  }
  function cs(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function ss(l, t) {
    var a = cs(l);
    l = 0;
    for (var u; a; ) {
      if (a.nodeType === 3) {
        if (u = l + a.textContent.length, l <= t && u >= t)
          return { node: a, offset: t - l };
        l = u;
      }
      l: {
        for (; a; ) {
          if (a.nextSibling) {
            a = a.nextSibling;
            break l;
          }
          a = a.parentNode;
        }
        a = void 0;
      }
      a = cs(a);
    }
  }
  function ds(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? ds(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function os(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = He(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = He(l.document);
    }
    return t;
  }
  function ri(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var Qv = Bt && "documentMode" in document && 11 >= document.documentMode, lu = null, hi = null, Zu = null, gi = !1;
  function vs(l, t, a) {
    var u = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    gi || lu == null || lu !== He(u) || (u = lu, "selectionStart" in u && ri(u) ? u = { start: u.selectionStart, end: u.selectionEnd } : (u = (u.ownerDocument && u.ownerDocument.defaultView || window).getSelection(), u = {
      anchorNode: u.anchorNode,
      anchorOffset: u.anchorOffset,
      focusNode: u.focusNode,
      focusOffset: u.focusOffset
    }), Zu && Qu(Zu, u) || (Zu = u, u = xn(hi, "onSelect"), 0 < u.length && (t = new Be(
      "onSelect",
      "select",
      null,
      t,
      a
    ), l.push({ event: t, listeners: u }), t.target = lu)));
  }
  function Da(l, t) {
    var a = {};
    return a[l.toLowerCase()] = t.toLowerCase(), a["Webkit" + l] = "webkit" + t, a["Moz" + l] = "moz" + t, a;
  }
  var tu = {
    animationend: Da("Animation", "AnimationEnd"),
    animationiteration: Da("Animation", "AnimationIteration"),
    animationstart: Da("Animation", "AnimationStart"),
    transitionrun: Da("Transition", "TransitionRun"),
    transitionstart: Da("Transition", "TransitionStart"),
    transitioncancel: Da("Transition", "TransitionCancel"),
    transitionend: Da("Transition", "TransitionEnd")
  }, Si = {}, ys = {};
  Bt && (ys = document.createElement("div").style, "AnimationEvent" in window || (delete tu.animationend.animation, delete tu.animationiteration.animation, delete tu.animationstart.animation), "TransitionEvent" in window || delete tu.transitionend.transition);
  function Oa(l) {
    if (Si[l]) return Si[l];
    if (!tu[l]) return l;
    var t = tu[l], a;
    for (a in t)
      if (t.hasOwnProperty(a) && a in ys)
        return Si[l] = t[a];
    return l;
  }
  var ms = Oa("animationend"), rs = Oa("animationiteration"), hs = Oa("animationstart"), Zv = Oa("transitionrun"), Vv = Oa("transitionstart"), Lv = Oa("transitioncancel"), gs = Oa("transitionend"), Ss = /* @__PURE__ */ new Map(), bi = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  bi.push("scrollEnd");
  function At(l, t) {
    Ss.set(l, t), Ma(t, [l]);
  }
  var Ge = typeof reportError == "function" ? reportError : function(l) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof l == "object" && l !== null && typeof l.message == "string" ? String(l.message) : String(l),
        error: l
      });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", l);
      return;
    }
    console.error(l);
  }, rt = [], au = 0, zi = 0;
  function Xe() {
    for (var l = au, t = zi = au = 0; t < l; ) {
      var a = rt[t];
      rt[t++] = null;
      var u = rt[t];
      rt[t++] = null;
      var e = rt[t];
      rt[t++] = null;
      var n = rt[t];
      if (rt[t++] = null, u !== null && e !== null) {
        var i = u.pending;
        i === null ? e.next = e : (e.next = i.next, i.next = e), u.pending = e;
      }
      n !== 0 && bs(a, e, n);
    }
  }
  function Qe(l, t, a, u) {
    rt[au++] = l, rt[au++] = t, rt[au++] = a, rt[au++] = u, zi |= u, l.lanes |= u, l = l.alternate, l !== null && (l.lanes |= u);
  }
  function pi(l, t, a, u) {
    return Qe(l, t, a, u), Ze(l);
  }
  function Ua(l, t) {
    return Qe(l, null, null, t), Ze(l);
  }
  function bs(l, t, a) {
    l.lanes |= a;
    var u = l.alternate;
    u !== null && (u.lanes |= a);
    for (var e = !1, n = l.return; n !== null; )
      n.childLanes |= a, u = n.alternate, u !== null && (u.childLanes |= a), n.tag === 22 && (l = n.stateNode, l === null || l._visibility & 1 || (e = !0)), l = n, n = n.return;
    return l.tag === 3 ? (n = l.stateNode, e && t !== null && (e = 31 - nt(a), l = n.hiddenUpdates, u = l[e], u === null ? l[e] = [t] : u.push(t), t.lane = a | 536870912), n) : null;
  }
  function Ze(l) {
    if (50 < de)
      throw de = 0, Hf = null, Error(v(185));
    for (var t = l.return; t !== null; )
      l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var uu = {};
  function Kv(l, t, a, u) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function ft(l, t, a, u) {
    return new Kv(l, t, a, u);
  }
  function Ti(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function qt(l, t) {
    var a = l.alternate;
    return a === null ? (a = ft(
      l.tag,
      t,
      l.key,
      l.mode
    ), a.elementType = l.elementType, a.type = l.type, a.stateNode = l.stateNode, a.alternate = l, l.alternate = a) : (a.pendingProps = t, a.type = l.type, a.flags = 0, a.subtreeFlags = 0, a.deletions = null), a.flags = l.flags & 65011712, a.childLanes = l.childLanes, a.lanes = l.lanes, a.child = l.child, a.memoizedProps = l.memoizedProps, a.memoizedState = l.memoizedState, a.updateQueue = l.updateQueue, t = l.dependencies, a.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, a.sibling = l.sibling, a.index = l.index, a.ref = l.ref, a.refCleanup = l.refCleanup, a;
  }
  function zs(l, t) {
    l.flags &= 65011714;
    var a = l.alternate;
    return a === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = a.childLanes, l.lanes = a.lanes, l.child = a.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = a.memoizedProps, l.memoizedState = a.memoizedState, l.updateQueue = a.updateQueue, l.type = a.type, t = a.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function Ve(l, t, a, u, e, n) {
    var i = 0;
    if (u = l, typeof l == "function") Ti(l) && (i = 1);
    else if (typeof l == "string")
      i = ky(
        l,
        a,
        O.current
      ) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else
      l: switch (l) {
        case xt:
          return l = ft(31, a, t, e), l.elementType = xt, l.lanes = n, l;
        case Sl:
          return Ha(a.children, e, n, t);
        case zl:
          i = 8, e |= 24;
          break;
        case I:
          return l = ft(12, a, t, e | 2), l.elementType = I, l.lanes = n, l;
        case Ol:
          return l = ft(13, a, t, e), l.elementType = Ol, l.lanes = n, l;
        case Rl:
          return l = ft(19, a, t, e), l.elementType = Rl, l.lanes = n, l;
        default:
          if (typeof l == "object" && l !== null)
            switch (l.$$typeof) {
              case bl:
                i = 10;
                break l;
              case Vl:
                i = 9;
                break l;
              case G:
                i = 11;
                break l;
              case X:
                i = 14;
                break l;
              case Ll:
                i = 16, u = null;
                break l;
            }
          i = 29, a = Error(
            v(130, l === null ? "null" : typeof l, "")
          ), u = null;
      }
    return t = ft(i, a, t, e), t.elementType = l, t.type = u, t.lanes = n, t;
  }
  function Ha(l, t, a, u) {
    return l = ft(7, l, u, t), l.lanes = a, l;
  }
  function Ei(l, t, a) {
    return l = ft(6, l, null, t), l.lanes = a, l;
  }
  function ps(l) {
    var t = ft(18, null, null, 0);
    return t.stateNode = l, t;
  }
  function Ai(l, t, a) {
    return t = ft(
      4,
      l.children !== null ? l.children : [],
      l.key,
      t
    ), t.lanes = a, t.stateNode = {
      containerInfo: l.containerInfo,
      pendingChildren: null,
      implementation: l.implementation
    }, t;
  }
  var Ts = /* @__PURE__ */ new WeakMap();
  function ht(l, t) {
    if (typeof l == "object" && l !== null) {
      var a = Ts.get(l);
      return a !== void 0 ? a : (t = {
        value: l,
        source: t,
        stack: pc(t)
      }, Ts.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: pc(t)
    };
  }
  var eu = [], nu = 0, Le = null, Vu = 0, gt = [], St = 0, ta = null, Ot = 1, Ut = "";
  function Yt(l, t) {
    eu[nu++] = Vu, eu[nu++] = Le, Le = l, Vu = t;
  }
  function Es(l, t, a) {
    gt[St++] = Ot, gt[St++] = Ut, gt[St++] = ta, ta = l;
    var u = Ot;
    l = Ut;
    var e = 32 - nt(u) - 1;
    u &= ~(1 << e), a += 1;
    var n = 32 - nt(t) + e;
    if (30 < n) {
      var i = e - e % 5;
      n = (u & (1 << i) - 1).toString(32), u >>= i, e -= i, Ot = 1 << 32 - nt(t) + e | a << e | u, Ut = n + l;
    } else
      Ot = 1 << n | a << e | u, Ut = l;
  }
  function _i(l) {
    l.return !== null && (Yt(l, 1), Es(l, 1, 0));
  }
  function Mi(l) {
    for (; l === Le; )
      Le = eu[--nu], eu[nu] = null, Vu = eu[--nu], eu[nu] = null;
    for (; l === ta; )
      ta = gt[--St], gt[St] = null, Ut = gt[--St], gt[St] = null, Ot = gt[--St], gt[St] = null;
  }
  function As(l, t) {
    gt[St++] = Ot, gt[St++] = Ut, gt[St++] = ta, Ot = t.id, Ut = t.overflow, ta = l;
  }
  var Gl = null, ml = null, P = !1, aa = null, bt = !1, xi = Error(v(519));
  function ua(l) {
    var t = Error(
      v(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw Lu(ht(t, l)), xi;
  }
  function _s(l) {
    var t = l.stateNode, a = l.type, u = l.memoizedProps;
    switch (t[Yl] = l, t[$l] = u, a) {
      case "dialog":
        $("cancel", t), $("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        $("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < ve.length; a++)
          $(ve[a], t);
        break;
      case "source":
        $("error", t);
        break;
      case "img":
      case "image":
      case "link":
        $("error", t), $("load", t);
        break;
      case "details":
        $("toggle", t);
        break;
      case "input":
        $("invalid", t), Yc(
          t,
          u.value,
          u.defaultValue,
          u.checked,
          u.defaultChecked,
          u.type,
          u.name,
          !0
        );
        break;
      case "select":
        $("invalid", t);
        break;
      case "textarea":
        $("invalid", t), Xc(t, u.value, u.defaultValue, u.children);
    }
    a = u.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || u.suppressHydrationWarning === !0 || Vo(t.textContent, a) ? (u.popover != null && ($("beforetoggle", t), $("toggle", t)), u.onScroll != null && $("scroll", t), u.onScrollEnd != null && $("scrollend", t), u.onClick != null && (t.onclick = jt), t = !0) : t = !1, t || ua(l, !0);
  }
  function Ms(l) {
    for (Gl = l.return; Gl; )
      switch (Gl.tag) {
        case 5:
        case 31:
        case 13:
          bt = !1;
          return;
        case 27:
        case 3:
          bt = !0;
          return;
        default:
          Gl = Gl.return;
      }
  }
  function iu(l) {
    if (l !== Gl) return !1;
    if (!P) return Ms(l), P = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || Jf(l.type, l.memoizedProps)), a = !a), a && ml && ua(l), Ms(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(v(317));
      ml = Io(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(v(317));
      ml = Io(l);
    } else
      t === 27 ? (t = ml, ga(l.type) ? (l = Ff, Ff = null, ml = l) : ml = t) : ml = Gl ? pt(l.stateNode.nextSibling) : null;
    return !0;
  }
  function Ca() {
    ml = Gl = null, P = !1;
  }
  function Di() {
    var l = aa;
    return l !== null && (lt === null ? lt = l : lt.push.apply(
      lt,
      l
    ), aa = null), l;
  }
  function Lu(l) {
    aa === null ? aa = [l] : aa.push(l);
  }
  var Oi = d(null), Na = null, Gt = null;
  function ea(l, t, a) {
    _(Oi, t._currentValue), t._currentValue = a;
  }
  function Xt(l) {
    l._currentValue = Oi.current, T(Oi);
  }
  function Ui(l, t, a) {
    for (; l !== null; ) {
      var u = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, u !== null && (u.childLanes |= t)) : u !== null && (u.childLanes & t) !== t && (u.childLanes |= t), l === a) break;
      l = l.return;
    }
  }
  function Hi(l, t, a, u) {
    var e = l.child;
    for (e !== null && (e.return = l); e !== null; ) {
      var n = e.dependencies;
      if (n !== null) {
        var i = e.child;
        n = n.firstContext;
        l: for (; n !== null; ) {
          var f = n;
          n = e;
          for (var c = 0; c < t.length; c++)
            if (f.context === t[c]) {
              n.lanes |= a, f = n.alternate, f !== null && (f.lanes |= a), Ui(
                n.return,
                a,
                l
              ), u || (i = null);
              break l;
            }
          n = f.next;
        }
      } else if (e.tag === 18) {
        if (i = e.return, i === null) throw Error(v(341));
        i.lanes |= a, n = i.alternate, n !== null && (n.lanes |= a), Ui(i, a, l), i = null;
      } else i = e.child;
      if (i !== null) i.return = e;
      else
        for (i = e; i !== null; ) {
          if (i === l) {
            i = null;
            break;
          }
          if (e = i.sibling, e !== null) {
            e.return = i.return, i = e;
            break;
          }
          i = i.return;
        }
      e = i;
    }
  }
  function fu(l, t, a, u) {
    l = null;
    for (var e = t, n = !1; e !== null; ) {
      if (!n) {
        if ((e.flags & 524288) !== 0) n = !0;
        else if ((e.flags & 262144) !== 0) break;
      }
      if (e.tag === 10) {
        var i = e.alternate;
        if (i === null) throw Error(v(387));
        if (i = i.memoizedProps, i !== null) {
          var f = e.type;
          it(e.pendingProps.value, i.value) || (l !== null ? l.push(f) : l = [f]);
        }
      } else if (e === nl.current) {
        if (i = e.alternate, i === null) throw Error(v(387));
        i.memoizedState.memoizedState !== e.memoizedState.memoizedState && (l !== null ? l.push(ge) : l = [ge]);
      }
      e = e.return;
    }
    l !== null && Hi(
      t,
      l,
      a,
      u
    ), t.flags |= 262144;
  }
  function Ke(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!it(
        l.context._currentValue,
        l.memoizedValue
      ))
        return !0;
      l = l.next;
    }
    return !1;
  }
  function Ra(l) {
    Na = l, Gt = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Xl(l) {
    return xs(Na, l);
  }
  function Je(l, t) {
    return Na === null && Ra(l), xs(l, t);
  }
  function xs(l, t) {
    var a = t._currentValue;
    if (t = { context: t, memoizedValue: a, next: null }, Gt === null) {
      if (l === null) throw Error(v(308));
      Gt = t, l.dependencies = { lanes: 0, firstContext: t }, l.flags |= 524288;
    } else Gt = Gt.next = t;
    return a;
  }
  var Jv = typeof AbortController < "u" ? AbortController : function() {
    var l = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(a, u) {
        l.push(u);
      }
    };
    this.abort = function() {
      t.aborted = !0, l.forEach(function(a) {
        return a();
      });
    };
  }, wv = E.unstable_scheduleCallback, Wv = E.unstable_NormalPriority, Ul = {
    $$typeof: bl,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Ci() {
    return {
      controller: new Jv(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Ku(l) {
    l.refCount--, l.refCount === 0 && wv(Wv, function() {
      l.controller.abort();
    });
  }
  var Ju = null, Ni = 0, cu = 0, su = null;
  function $v(l, t) {
    if (Ju === null) {
      var a = Ju = [];
      Ni = 0, cu = qf(), su = {
        status: "pending",
        value: void 0,
        then: function(u) {
          a.push(u);
        }
      };
    }
    return Ni++, t.then(Ds, Ds), t;
  }
  function Ds() {
    if (--Ni === 0 && Ju !== null) {
      su !== null && (su.status = "fulfilled");
      var l = Ju;
      Ju = null, cu = 0, su = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function kv(l, t) {
    var a = [], u = {
      status: "pending",
      value: null,
      reason: null,
      then: function(e) {
        a.push(e);
      }
    };
    return l.then(
      function() {
        u.status = "fulfilled", u.value = t;
        for (var e = 0; e < a.length; e++) (0, a[e])(t);
      },
      function(e) {
        for (u.status = "rejected", u.reason = e, e = 0; e < a.length; e++)
          (0, a[e])(void 0);
      }
    ), u;
  }
  var Os = S.S;
  S.S = function(l, t) {
    yo = ut(), typeof t == "object" && t !== null && typeof t.then == "function" && $v(l, t), Os !== null && Os(l, t);
  };
  var ja = d(null);
  function Ri() {
    var l = ja.current;
    return l !== null ? l : yl.pooledCache;
  }
  function we(l, t) {
    t === null ? _(ja, ja.current) : _(ja, t.pool);
  }
  function Us() {
    var l = Ri();
    return l === null ? null : { parent: Ul._currentValue, pool: l };
  }
  var du = Error(v(460)), ji = Error(v(474)), We = Error(v(542)), $e = { then: function() {
  } };
  function Hs(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function Cs(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(jt, jt), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, Rs(l), l;
      default:
        if (typeof t.status == "string") t.then(jt, jt);
        else {
          if (l = yl, l !== null && 100 < l.shellSuspendCounter)
            throw Error(v(482));
          l = t, l.status = "pending", l.then(
            function(u) {
              if (t.status === "pending") {
                var e = t;
                e.status = "fulfilled", e.value = u;
              }
            },
            function(u) {
              if (t.status === "pending") {
                var e = t;
                e.status = "rejected", e.reason = u;
              }
            }
          );
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw l = t.reason, Rs(l), l;
        }
        throw qa = t, du;
    }
  }
  function Ba(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (qa = a, du) : a;
    }
  }
  var qa = null;
  function Ns() {
    if (qa === null) throw Error(v(459));
    var l = qa;
    return qa = null, l;
  }
  function Rs(l) {
    if (l === du || l === We)
      throw Error(v(483));
  }
  var ou = null, wu = 0;
  function ke(l) {
    var t = wu;
    return wu += 1, ou === null && (ou = []), Cs(ou, l, t);
  }
  function Wu(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function Fe(l, t) {
    throw t.$$typeof === el ? Error(v(525)) : (l = Object.prototype.toString.call(t), Error(
      v(
        31,
        l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l
      )
    ));
  }
  function js(l) {
    function t(o, s) {
      if (l) {
        var y = o.deletions;
        y === null ? (o.deletions = [s], o.flags |= 16) : y.push(s);
      }
    }
    function a(o, s) {
      if (!l) return null;
      for (; s !== null; )
        t(o, s), s = s.sibling;
      return null;
    }
    function u(o) {
      for (var s = /* @__PURE__ */ new Map(); o !== null; )
        o.key !== null ? s.set(o.key, o) : s.set(o.index, o), o = o.sibling;
      return s;
    }
    function e(o, s) {
      return o = qt(o, s), o.index = 0, o.sibling = null, o;
    }
    function n(o, s, y) {
      return o.index = y, l ? (y = o.alternate, y !== null ? (y = y.index, y < s ? (o.flags |= 67108866, s) : y) : (o.flags |= 67108866, s)) : (o.flags |= 1048576, s);
    }
    function i(o) {
      return l && o.alternate === null && (o.flags |= 67108866), o;
    }
    function f(o, s, y, b) {
      return s === null || s.tag !== 6 ? (s = Ei(y, o.mode, b), s.return = o, s) : (s = e(s, y), s.return = o, s);
    }
    function c(o, s, y, b) {
      var C = y.type;
      return C === Sl ? g(
        o,
        s,
        y.props.children,
        b,
        y.key
      ) : s !== null && (s.elementType === C || typeof C == "object" && C !== null && C.$$typeof === Ll && Ba(C) === s.type) ? (s = e(s, y.props), Wu(s, y), s.return = o, s) : (s = Ve(
        y.type,
        y.key,
        y.props,
        null,
        o.mode,
        b
      ), Wu(s, y), s.return = o, s);
    }
    function m(o, s, y, b) {
      return s === null || s.tag !== 4 || s.stateNode.containerInfo !== y.containerInfo || s.stateNode.implementation !== y.implementation ? (s = Ai(y, o.mode, b), s.return = o, s) : (s = e(s, y.children || []), s.return = o, s);
    }
    function g(o, s, y, b, C) {
      return s === null || s.tag !== 7 ? (s = Ha(
        y,
        o.mode,
        b,
        C
      ), s.return = o, s) : (s = e(s, y), s.return = o, s);
    }
    function p(o, s, y) {
      if (typeof s == "string" && s !== "" || typeof s == "number" || typeof s == "bigint")
        return s = Ei(
          "" + s,
          o.mode,
          y
        ), s.return = o, s;
      if (typeof s == "object" && s !== null) {
        switch (s.$$typeof) {
          case Dl:
            return y = Ve(
              s.type,
              s.key,
              s.props,
              null,
              o.mode,
              y
            ), Wu(y, s), y.return = o, y;
          case El:
            return s = Ai(
              s,
              o.mode,
              y
            ), s.return = o, s;
          case Ll:
            return s = Ba(s), p(o, s, y);
        }
        if (Et(s) || Wl(s))
          return s = Ha(
            s,
            o.mode,
            y,
            null
          ), s.return = o, s;
        if (typeof s.then == "function")
          return p(o, ke(s), y);
        if (s.$$typeof === bl)
          return p(
            o,
            Je(o, s),
            y
          );
        Fe(o, s);
      }
      return null;
    }
    function r(o, s, y, b) {
      var C = s !== null ? s.key : null;
      if (typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint")
        return C !== null ? null : f(o, s, "" + y, b);
      if (typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case Dl:
            return y.key === C ? c(o, s, y, b) : null;
          case El:
            return y.key === C ? m(o, s, y, b) : null;
          case Ll:
            return y = Ba(y), r(o, s, y, b);
        }
        if (Et(y) || Wl(y))
          return C !== null ? null : g(o, s, y, b, null);
        if (typeof y.then == "function")
          return r(
            o,
            s,
            ke(y),
            b
          );
        if (y.$$typeof === bl)
          return r(
            o,
            s,
            Je(o, y),
            b
          );
        Fe(o, y);
      }
      return null;
    }
    function h(o, s, y, b, C) {
      if (typeof b == "string" && b !== "" || typeof b == "number" || typeof b == "bigint")
        return o = o.get(y) || null, f(s, o, "" + b, C);
      if (typeof b == "object" && b !== null) {
        switch (b.$$typeof) {
          case Dl:
            return o = o.get(
              b.key === null ? y : b.key
            ) || null, c(s, o, b, C);
          case El:
            return o = o.get(
              b.key === null ? y : b.key
            ) || null, m(s, o, b, C);
          case Ll:
            return b = Ba(b), h(
              o,
              s,
              y,
              b,
              C
            );
        }
        if (Et(b) || Wl(b))
          return o = o.get(y) || null, g(s, o, b, C, null);
        if (typeof b.then == "function")
          return h(
            o,
            s,
            y,
            ke(b),
            C
          );
        if (b.$$typeof === bl)
          return h(
            o,
            s,
            y,
            Je(s, b),
            C
          );
        Fe(s, b);
      }
      return null;
    }
    function D(o, s, y, b) {
      for (var C = null, tl = null, U = s, V = s = 0, F = null; U !== null && V < y.length; V++) {
        U.index > V ? (F = U, U = null) : F = U.sibling;
        var al = r(
          o,
          U,
          y[V],
          b
        );
        if (al === null) {
          U === null && (U = F);
          break;
        }
        l && U && al.alternate === null && t(o, U), s = n(al, s, V), tl === null ? C = al : tl.sibling = al, tl = al, U = F;
      }
      if (V === y.length)
        return a(o, U), P && Yt(o, V), C;
      if (U === null) {
        for (; V < y.length; V++)
          U = p(o, y[V], b), U !== null && (s = n(
            U,
            s,
            V
          ), tl === null ? C = U : tl.sibling = U, tl = U);
        return P && Yt(o, V), C;
      }
      for (U = u(U); V < y.length; V++)
        F = h(
          U,
          o,
          V,
          y[V],
          b
        ), F !== null && (l && F.alternate !== null && U.delete(
          F.key === null ? V : F.key
        ), s = n(
          F,
          s,
          V
        ), tl === null ? C = F : tl.sibling = F, tl = F);
      return l && U.forEach(function(Ta) {
        return t(o, Ta);
      }), P && Yt(o, V), C;
    }
    function j(o, s, y, b) {
      if (y == null) throw Error(v(151));
      for (var C = null, tl = null, U = s, V = s = 0, F = null, al = y.next(); U !== null && !al.done; V++, al = y.next()) {
        U.index > V ? (F = U, U = null) : F = U.sibling;
        var Ta = r(o, U, al.value, b);
        if (Ta === null) {
          U === null && (U = F);
          break;
        }
        l && U && Ta.alternate === null && t(o, U), s = n(Ta, s, V), tl === null ? C = Ta : tl.sibling = Ta, tl = Ta, U = F;
      }
      if (al.done)
        return a(o, U), P && Yt(o, V), C;
      if (U === null) {
        for (; !al.done; V++, al = y.next())
          al = p(o, al.value, b), al !== null && (s = n(al, s, V), tl === null ? C = al : tl.sibling = al, tl = al);
        return P && Yt(o, V), C;
      }
      for (U = u(U); !al.done; V++, al = y.next())
        al = h(U, o, V, al.value, b), al !== null && (l && al.alternate !== null && U.delete(al.key === null ? V : al.key), s = n(al, s, V), tl === null ? C = al : tl.sibling = al, tl = al);
      return l && U.forEach(function(f1) {
        return t(o, f1);
      }), P && Yt(o, V), C;
    }
    function ol(o, s, y, b) {
      if (typeof y == "object" && y !== null && y.type === Sl && y.key === null && (y = y.props.children), typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case Dl:
            l: {
              for (var C = y.key; s !== null; ) {
                if (s.key === C) {
                  if (C = y.type, C === Sl) {
                    if (s.tag === 7) {
                      a(
                        o,
                        s.sibling
                      ), b = e(
                        s,
                        y.props.children
                      ), b.return = o, o = b;
                      break l;
                    }
                  } else if (s.elementType === C || typeof C == "object" && C !== null && C.$$typeof === Ll && Ba(C) === s.type) {
                    a(
                      o,
                      s.sibling
                    ), b = e(s, y.props), Wu(b, y), b.return = o, o = b;
                    break l;
                  }
                  a(o, s);
                  break;
                } else t(o, s);
                s = s.sibling;
              }
              y.type === Sl ? (b = Ha(
                y.props.children,
                o.mode,
                b,
                y.key
              ), b.return = o, o = b) : (b = Ve(
                y.type,
                y.key,
                y.props,
                null,
                o.mode,
                b
              ), Wu(b, y), b.return = o, o = b);
            }
            return i(o);
          case El:
            l: {
              for (C = y.key; s !== null; ) {
                if (s.key === C)
                  if (s.tag === 4 && s.stateNode.containerInfo === y.containerInfo && s.stateNode.implementation === y.implementation) {
                    a(
                      o,
                      s.sibling
                    ), b = e(s, y.children || []), b.return = o, o = b;
                    break l;
                  } else {
                    a(o, s);
                    break;
                  }
                else t(o, s);
                s = s.sibling;
              }
              b = Ai(y, o.mode, b), b.return = o, o = b;
            }
            return i(o);
          case Ll:
            return y = Ba(y), ol(
              o,
              s,
              y,
              b
            );
        }
        if (Et(y))
          return D(
            o,
            s,
            y,
            b
          );
        if (Wl(y)) {
          if (C = Wl(y), typeof C != "function") throw Error(v(150));
          return y = C.call(y), j(
            o,
            s,
            y,
            b
          );
        }
        if (typeof y.then == "function")
          return ol(
            o,
            s,
            ke(y),
            b
          );
        if (y.$$typeof === bl)
          return ol(
            o,
            s,
            Je(o, y),
            b
          );
        Fe(o, y);
      }
      return typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint" ? (y = "" + y, s !== null && s.tag === 6 ? (a(o, s.sibling), b = e(s, y), b.return = o, o = b) : (a(o, s), b = Ei(y, o.mode, b), b.return = o, o = b), i(o)) : a(o, s);
    }
    return function(o, s, y, b) {
      try {
        wu = 0;
        var C = ol(
          o,
          s,
          y,
          b
        );
        return ou = null, C;
      } catch (U) {
        if (U === du || U === We) throw U;
        var tl = ft(29, U, null, o.mode);
        return tl.lanes = b, tl.return = o, tl;
      }
    };
  }
  var Ya = js(!0), Bs = js(!1), na = !1;
  function Bi(l) {
    l.updateQueue = {
      baseState: l.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function qi(l, t) {
    l = l.updateQueue, t.updateQueue === l && (t.updateQueue = {
      baseState: l.baseState,
      firstBaseUpdate: l.firstBaseUpdate,
      lastBaseUpdate: l.lastBaseUpdate,
      shared: l.shared,
      callbacks: null
    });
  }
  function ia(l) {
    return { lane: l, tag: 0, payload: null, callback: null, next: null };
  }
  function fa(l, t, a) {
    var u = l.updateQueue;
    if (u === null) return null;
    if (u = u.shared, (ul & 2) !== 0) {
      var e = u.pending;
      return e === null ? t.next = t : (t.next = e.next, e.next = t), u.pending = t, t = Ze(l), bs(l, null, a), t;
    }
    return Qe(l, u, t, a), Ze(l);
  }
  function $u(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, xc(l, a);
    }
  }
  function Yi(l, t) {
    var a = l.updateQueue, u = l.alternate;
    if (u !== null && (u = u.updateQueue, a === u)) {
      var e = null, n = null;
      if (a = a.firstBaseUpdate, a !== null) {
        do {
          var i = {
            lane: a.lane,
            tag: a.tag,
            payload: a.payload,
            callback: null,
            next: null
          };
          n === null ? e = n = i : n = n.next = i, a = a.next;
        } while (a !== null);
        n === null ? e = n = t : n = n.next = t;
      } else e = n = t;
      a = {
        baseState: u.baseState,
        firstBaseUpdate: e,
        lastBaseUpdate: n,
        shared: u.shared,
        callbacks: u.callbacks
      }, l.updateQueue = a;
      return;
    }
    l = a.lastBaseUpdate, l === null ? a.firstBaseUpdate = t : l.next = t, a.lastBaseUpdate = t;
  }
  var Gi = !1;
  function ku() {
    if (Gi) {
      var l = su;
      if (l !== null) throw l;
    }
  }
  function Fu(l, t, a, u) {
    Gi = !1;
    var e = l.updateQueue;
    na = !1;
    var n = e.firstBaseUpdate, i = e.lastBaseUpdate, f = e.shared.pending;
    if (f !== null) {
      e.shared.pending = null;
      var c = f, m = c.next;
      c.next = null, i === null ? n = m : i.next = m, i = c;
      var g = l.alternate;
      g !== null && (g = g.updateQueue, f = g.lastBaseUpdate, f !== i && (f === null ? g.firstBaseUpdate = m : f.next = m, g.lastBaseUpdate = c));
    }
    if (n !== null) {
      var p = e.baseState;
      i = 0, g = m = c = null, f = n;
      do {
        var r = f.lane & -536870913, h = r !== f.lane;
        if (h ? (k & r) === r : (u & r) === r) {
          r !== 0 && r === cu && (Gi = !0), g !== null && (g = g.next = {
            lane: 0,
            tag: f.tag,
            payload: f.payload,
            callback: null,
            next: null
          });
          l: {
            var D = l, j = f;
            r = t;
            var ol = a;
            switch (j.tag) {
              case 1:
                if (D = j.payload, typeof D == "function") {
                  p = D.call(ol, p, r);
                  break l;
                }
                p = D;
                break l;
              case 3:
                D.flags = D.flags & -65537 | 128;
              case 0:
                if (D = j.payload, r = typeof D == "function" ? D.call(ol, p, r) : D, r == null) break l;
                p = H({}, p, r);
                break l;
              case 2:
                na = !0;
            }
          }
          r = f.callback, r !== null && (l.flags |= 64, h && (l.flags |= 8192), h = e.callbacks, h === null ? e.callbacks = [r] : h.push(r));
        } else
          h = {
            lane: r,
            tag: f.tag,
            payload: f.payload,
            callback: f.callback,
            next: null
          }, g === null ? (m = g = h, c = p) : g = g.next = h, i |= r;
        if (f = f.next, f === null) {
          if (f = e.shared.pending, f === null)
            break;
          h = f, f = h.next, h.next = null, e.lastBaseUpdate = h, e.shared.pending = null;
        }
      } while (!0);
      g === null && (c = p), e.baseState = c, e.firstBaseUpdate = m, e.lastBaseUpdate = g, n === null && (e.shared.lanes = 0), va |= i, l.lanes = i, l.memoizedState = p;
    }
  }
  function qs(l, t) {
    if (typeof l != "function")
      throw Error(v(191, l));
    l.call(t);
  }
  function Ys(l, t) {
    var a = l.callbacks;
    if (a !== null)
      for (l.callbacks = null, l = 0; l < a.length; l++)
        qs(a[l], t);
  }
  var vu = d(null), Ie = d(0);
  function Gs(l, t) {
    l = $t, _(Ie, l), _(vu, t), $t = l | t.baseLanes;
  }
  function Xi() {
    _(Ie, $t), _(vu, vu.current);
  }
  function Qi() {
    $t = Ie.current, T(vu), T(Ie);
  }
  var ct = d(null), zt = null;
  function ca(l) {
    var t = l.alternate;
    _(_l, _l.current & 1), _(ct, l), zt === null && (t === null || vu.current !== null || t.memoizedState !== null) && (zt = l);
  }
  function Zi(l) {
    _(_l, _l.current), _(ct, l), zt === null && (zt = l);
  }
  function Xs(l) {
    l.tag === 22 ? (_(_l, _l.current), _(ct, l), zt === null && (zt = l)) : sa();
  }
  function sa() {
    _(_l, _l.current), _(ct, ct.current);
  }
  function st(l) {
    T(ct), zt === l && (zt = null), T(_l);
  }
  var _l = d(0);
  function Pe(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var a = t.memoizedState;
        if (a !== null && (a = a.dehydrated, a === null || $f(a) || kf(a)))
          return t;
      } else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        t.child.return = t, t = t.child;
        continue;
      }
      if (t === l) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === l) return null;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
    return null;
  }
  var Qt = 0, Z = null, sl = null, Hl = null, ln = !1, yu = !1, Ga = !1, tn = 0, Iu = 0, mu = null, Fv = 0;
  function pl() {
    throw Error(v(321));
  }
  function Vi(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++)
      if (!it(l[a], t[a])) return !1;
    return !0;
  }
  function Li(l, t, a, u, e, n) {
    return Qt = n, Z = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, S.H = l === null || l.memoizedState === null ? Ed : nf, Ga = !1, n = a(u, e), Ga = !1, yu && (n = Zs(
      t,
      a,
      u,
      e
    )), Qs(l), n;
  }
  function Qs(l) {
    S.H = te;
    var t = sl !== null && sl.next !== null;
    if (Qt = 0, Hl = sl = Z = null, ln = !1, Iu = 0, mu = null, t) throw Error(v(300));
    l === null || Cl || (l = l.dependencies, l !== null && Ke(l) && (Cl = !0));
  }
  function Zs(l, t, a, u) {
    Z = l;
    var e = 0;
    do {
      if (yu && (mu = null), Iu = 0, yu = !1, 25 <= e) throw Error(v(301));
      if (e += 1, Hl = sl = null, l.updateQueue != null) {
        var n = l.updateQueue;
        n.lastEffect = null, n.events = null, n.stores = null, n.memoCache != null && (n.memoCache.index = 0);
      }
      S.H = Ad, n = t(a, u);
    } while (yu);
    return n;
  }
  function Iv() {
    var l = S.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? Pu(t) : t, l = l.useState()[0], (sl !== null ? sl.memoizedState : null) !== l && (Z.flags |= 1024), t;
  }
  function Ki() {
    var l = tn !== 0;
    return tn = 0, l;
  }
  function Ji(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function wi(l) {
    if (ln) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      ln = !1;
    }
    Qt = 0, Hl = sl = Z = null, yu = !1, Iu = tn = 0, mu = null;
  }
  function wl() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Hl === null ? Z.memoizedState = Hl = l : Hl = Hl.next = l, Hl;
  }
  function Ml() {
    if (sl === null) {
      var l = Z.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = sl.next;
    var t = Hl === null ? Z.memoizedState : Hl.next;
    if (t !== null)
      Hl = t, sl = l;
    else {
      if (l === null)
        throw Z.alternate === null ? Error(v(467)) : Error(v(310));
      sl = l, l = {
        memoizedState: sl.memoizedState,
        baseState: sl.baseState,
        baseQueue: sl.baseQueue,
        queue: sl.queue,
        next: null
      }, Hl === null ? Z.memoizedState = Hl = l : Hl = Hl.next = l;
    }
    return Hl;
  }
  function an() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Pu(l) {
    var t = Iu;
    return Iu += 1, mu === null && (mu = []), l = Cs(mu, l, t), t = Z, (Hl === null ? t.memoizedState : Hl.next) === null && (t = t.alternate, S.H = t === null || t.memoizedState === null ? Ed : nf), l;
  }
  function un(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return Pu(l);
      if (l.$$typeof === bl) return Xl(l);
    }
    throw Error(v(438, String(l)));
  }
  function Wi(l) {
    var t = null, a = Z.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var u = Z.alternate;
      u !== null && (u = u.updateQueue, u !== null && (u = u.memoCache, u != null && (t = {
        data: u.data.map(function(e) {
          return e.slice();
        }),
        index: 0
      })));
    }
    if (t == null && (t = { data: [], index: 0 }), a === null && (a = an(), Z.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0)
      for (a = t.data[t.index] = Array(l), u = 0; u < l; u++)
        a[u] = Va;
    return t.index++, a;
  }
  function Zt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function en(l) {
    var t = Ml();
    return $i(t, sl, l);
  }
  function $i(l, t, a) {
    var u = l.queue;
    if (u === null) throw Error(v(311));
    u.lastRenderedReducer = a;
    var e = l.baseQueue, n = u.pending;
    if (n !== null) {
      if (e !== null) {
        var i = e.next;
        e.next = n.next, n.next = i;
      }
      t.baseQueue = e = n, u.pending = null;
    }
    if (n = l.baseState, e === null) l.memoizedState = n;
    else {
      t = e.next;
      var f = i = null, c = null, m = t, g = !1;
      do {
        var p = m.lane & -536870913;
        if (p !== m.lane ? (k & p) === p : (Qt & p) === p) {
          var r = m.revertLane;
          if (r === 0)
            c !== null && (c = c.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: m.action,
              hasEagerState: m.hasEagerState,
              eagerState: m.eagerState,
              next: null
            }), p === cu && (g = !0);
          else if ((Qt & r) === r) {
            m = m.next, r === cu && (g = !0);
            continue;
          } else
            p = {
              lane: 0,
              revertLane: m.revertLane,
              gesture: null,
              action: m.action,
              hasEagerState: m.hasEagerState,
              eagerState: m.eagerState,
              next: null
            }, c === null ? (f = c = p, i = n) : c = c.next = p, Z.lanes |= r, va |= r;
          p = m.action, Ga && a(n, p), n = m.hasEagerState ? m.eagerState : a(n, p);
        } else
          r = {
            lane: p,
            revertLane: m.revertLane,
            gesture: m.gesture,
            action: m.action,
            hasEagerState: m.hasEagerState,
            eagerState: m.eagerState,
            next: null
          }, c === null ? (f = c = r, i = n) : c = c.next = r, Z.lanes |= p, va |= p;
        m = m.next;
      } while (m !== null && m !== t);
      if (c === null ? i = n : c.next = f, !it(n, l.memoizedState) && (Cl = !0, g && (a = su, a !== null)))
        throw a;
      l.memoizedState = n, l.baseState = i, l.baseQueue = c, u.lastRenderedState = n;
    }
    return e === null && (u.lanes = 0), [l.memoizedState, u.dispatch];
  }
  function ki(l) {
    var t = Ml(), a = t.queue;
    if (a === null) throw Error(v(311));
    a.lastRenderedReducer = l;
    var u = a.dispatch, e = a.pending, n = t.memoizedState;
    if (e !== null) {
      a.pending = null;
      var i = e = e.next;
      do
        n = l(n, i.action), i = i.next;
      while (i !== e);
      it(n, t.memoizedState) || (Cl = !0), t.memoizedState = n, t.baseQueue === null && (t.baseState = n), a.lastRenderedState = n;
    }
    return [n, u];
  }
  function Vs(l, t, a) {
    var u = Z, e = Ml(), n = P;
    if (n) {
      if (a === void 0) throw Error(v(407));
      a = a();
    } else a = t();
    var i = !it(
      (sl || e).memoizedState,
      a
    );
    if (i && (e.memoizedState = a, Cl = !0), e = e.queue, Pi(Js.bind(null, u, e, l), [
      l
    ]), e.getSnapshot !== t || i || Hl !== null && Hl.memoizedState.tag & 1) {
      if (u.flags |= 2048, ru(
        9,
        { destroy: void 0 },
        Ks.bind(
          null,
          u,
          e,
          a,
          t
        ),
        null
      ), yl === null) throw Error(v(349));
      n || (Qt & 127) !== 0 || Ls(u, t, a);
    }
    return a;
  }
  function Ls(l, t, a) {
    l.flags |= 16384, l = { getSnapshot: t, value: a }, t = Z.updateQueue, t === null ? (t = an(), Z.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
  }
  function Ks(l, t, a, u) {
    t.value = a, t.getSnapshot = u, ws(t) && Ws(l);
  }
  function Js(l, t, a) {
    return a(function() {
      ws(t) && Ws(l);
    });
  }
  function ws(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var a = t();
      return !it(l, a);
    } catch {
      return !0;
    }
  }
  function Ws(l) {
    var t = Ua(l, 2);
    t !== null && tt(t, l, 2);
  }
  function Fi(l) {
    var t = wl();
    if (typeof l == "function") {
      var a = l;
      if (l = a(), Ga) {
        It(!0);
        try {
          a();
        } finally {
          It(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = l, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Zt,
      lastRenderedState: l
    }, t;
  }
  function $s(l, t, a, u) {
    return l.baseState = a, $i(
      l,
      sl,
      typeof u == "function" ? u : Zt
    );
  }
  function Pv(l, t, a, u, e) {
    if (cn(l)) throw Error(v(485));
    if (l = t.action, l !== null) {
      var n = {
        payload: e,
        action: l,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function(i) {
          n.listeners.push(i);
        }
      };
      S.T !== null ? a(!0) : n.isTransition = !1, u(n), a = t.pending, a === null ? (n.next = t.pending = n, ks(t, n)) : (n.next = a.next, t.pending = a.next = n);
    }
  }
  function ks(l, t) {
    var a = t.action, u = t.payload, e = l.state;
    if (t.isTransition) {
      var n = S.T, i = {};
      S.T = i;
      try {
        var f = a(e, u), c = S.S;
        c !== null && c(i, f), Fs(l, t, f);
      } catch (m) {
        Ii(l, t, m);
      } finally {
        n !== null && i.types !== null && (n.types = i.types), S.T = n;
      }
    } else
      try {
        n = a(e, u), Fs(l, t, n);
      } catch (m) {
        Ii(l, t, m);
      }
  }
  function Fs(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(
      function(u) {
        Is(l, t, u);
      },
      function(u) {
        return Ii(l, t, u);
      }
    ) : Is(l, t, a);
  }
  function Is(l, t, a) {
    t.status = "fulfilled", t.value = a, Ps(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, ks(l, a)));
  }
  function Ii(l, t, a) {
    var u = l.pending;
    if (l.pending = null, u !== null) {
      u = u.next;
      do
        t.status = "rejected", t.reason = a, Ps(t), t = t.next;
      while (t !== u);
    }
    l.action = null;
  }
  function Ps(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function ld(l, t) {
    return t;
  }
  function td(l, t) {
    if (P) {
      var a = yl.formState;
      if (a !== null) {
        l: {
          var u = Z;
          if (P) {
            if (ml) {
              t: {
                for (var e = ml, n = bt; e.nodeType !== 8; ) {
                  if (!n) {
                    e = null;
                    break t;
                  }
                  if (e = pt(
                    e.nextSibling
                  ), e === null) {
                    e = null;
                    break t;
                  }
                }
                n = e.data, e = n === "F!" || n === "F" ? e : null;
              }
              if (e) {
                ml = pt(
                  e.nextSibling
                ), u = e.data === "F!";
                break l;
              }
            }
            ua(u);
          }
          u = !1;
        }
        u && (t = a[0]);
      }
    }
    return a = wl(), a.memoizedState = a.baseState = t, u = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: ld,
      lastRenderedState: t
    }, a.queue = u, a = zd.bind(
      null,
      Z,
      u
    ), u.dispatch = a, u = Fi(!1), n = ef.bind(
      null,
      Z,
      !1,
      u.queue
    ), u = wl(), e = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, u.queue = e, a = Pv.bind(
      null,
      Z,
      e,
      n,
      a
    ), e.dispatch = a, u.memoizedState = l, [t, a, !1];
  }
  function ad(l) {
    var t = Ml();
    return ud(t, sl, l);
  }
  function ud(l, t, a) {
    if (t = $i(
      l,
      t,
      ld
    )[0], l = en(Zt)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var u = Pu(t);
      } catch (i) {
        throw i === du ? We : i;
      }
    else u = t;
    t = Ml();
    var e = t.queue, n = e.dispatch;
    return a !== t.memoizedState && (Z.flags |= 2048, ru(
      9,
      { destroy: void 0 },
      ly.bind(null, e, a),
      null
    )), [u, n, l];
  }
  function ly(l, t) {
    l.action = t;
  }
  function ed(l) {
    var t = Ml(), a = sl;
    if (a !== null)
      return ud(t, a, l);
    Ml(), t = t.memoizedState, a = Ml();
    var u = a.queue.dispatch;
    return a.memoizedState = l, [t, u, !1];
  }
  function ru(l, t, a, u) {
    return l = { tag: l, create: a, deps: u, inst: t, next: null }, t = Z.updateQueue, t === null && (t = an(), Z.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (u = a.next, a.next = l, l.next = u, t.lastEffect = l), l;
  }
  function nd() {
    return Ml().memoizedState;
  }
  function nn(l, t, a, u) {
    var e = wl();
    Z.flags |= l, e.memoizedState = ru(
      1 | t,
      { destroy: void 0 },
      a,
      u === void 0 ? null : u
    );
  }
  function fn(l, t, a, u) {
    var e = Ml();
    u = u === void 0 ? null : u;
    var n = e.memoizedState.inst;
    sl !== null && u !== null && Vi(u, sl.memoizedState.deps) ? e.memoizedState = ru(t, n, a, u) : (Z.flags |= l, e.memoizedState = ru(
      1 | t,
      n,
      a,
      u
    ));
  }
  function id(l, t) {
    nn(8390656, 8, l, t);
  }
  function Pi(l, t) {
    fn(2048, 8, l, t);
  }
  function ty(l) {
    Z.flags |= 4;
    var t = Z.updateQueue;
    if (t === null)
      t = an(), Z.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function fd(l) {
    var t = Ml().memoizedState;
    return ty({ ref: t, nextImpl: l }), function() {
      if ((ul & 2) !== 0) throw Error(v(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function cd(l, t) {
    return fn(4, 2, l, t);
  }
  function sd(l, t) {
    return fn(4, 4, l, t);
  }
  function dd(l, t) {
    if (typeof t == "function") {
      l = l();
      var a = t(l);
      return function() {
        typeof a == "function" ? a() : t(null);
      };
    }
    if (t != null)
      return l = l(), t.current = l, function() {
        t.current = null;
      };
  }
  function od(l, t, a) {
    a = a != null ? a.concat([l]) : null, fn(4, 4, dd.bind(null, t, l), a);
  }
  function lf() {
  }
  function vd(l, t) {
    var a = Ml();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    return t !== null && Vi(t, u[1]) ? u[0] : (a.memoizedState = [l, t], l);
  }
  function yd(l, t) {
    var a = Ml();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    if (t !== null && Vi(t, u[1]))
      return u[0];
    if (u = l(), Ga) {
      It(!0);
      try {
        l();
      } finally {
        It(!1);
      }
    }
    return a.memoizedState = [u, t], u;
  }
  function tf(l, t, a) {
    return a === void 0 || (Qt & 1073741824) !== 0 && (k & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = ro(), Z.lanes |= l, va |= l, a);
  }
  function md(l, t, a, u) {
    return it(a, t) ? a : vu.current !== null ? (l = tf(l, a, u), it(l, t) || (Cl = !0), l) : (Qt & 42) === 0 || (Qt & 1073741824) !== 0 && (k & 261930) === 0 ? (Cl = !0, l.memoizedState = a) : (l = ro(), Z.lanes |= l, va |= l, t);
  }
  function rd(l, t, a, u, e) {
    var n = A.p;
    A.p = n !== 0 && 8 > n ? n : 8;
    var i = S.T, f = {};
    S.T = f, ef(l, !1, t, a);
    try {
      var c = e(), m = S.S;
      if (m !== null && m(f, c), c !== null && typeof c == "object" && typeof c.then == "function") {
        var g = kv(
          c,
          u
        );
        le(
          l,
          t,
          g,
          vt(l)
        );
      } else
        le(
          l,
          t,
          u,
          vt(l)
        );
    } catch (p) {
      le(
        l,
        t,
        { then: function() {
        }, status: "rejected", reason: p },
        vt()
      );
    } finally {
      A.p = n, i !== null && f.types !== null && (i.types = f.types), S.T = i;
    }
  }
  function ay() {
  }
  function af(l, t, a, u) {
    if (l.tag !== 5) throw Error(v(476));
    var e = hd(l).queue;
    rd(
      l,
      e,
      t,
      q,
      a === null ? ay : function() {
        return gd(l), a(u);
      }
    );
  }
  function hd(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: q,
      baseState: q,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Zt,
        lastRenderedState: q
      },
      next: null
    };
    var a = {};
    return t.next = {
      memoizedState: a,
      baseState: a,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Zt,
        lastRenderedState: a
      },
      next: null
    }, l.memoizedState = t, l = l.alternate, l !== null && (l.memoizedState = t), t;
  }
  function gd(l) {
    var t = hd(l);
    t.next === null && (t = l.alternate.memoizedState), le(
      l,
      t.next.queue,
      {},
      vt()
    );
  }
  function uf() {
    return Xl(ge);
  }
  function Sd() {
    return Ml().memoizedState;
  }
  function bd() {
    return Ml().memoizedState;
  }
  function uy(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = vt();
          l = ia(a);
          var u = fa(t, l, a);
          u !== null && (tt(u, t, a), $u(u, t, a)), t = { cache: Ci() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function ey(l, t, a) {
    var u = vt();
    a = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, cn(l) ? pd(t, a) : (a = pi(l, t, a, u), a !== null && (tt(a, l, u), Td(a, t, u)));
  }
  function zd(l, t, a) {
    var u = vt();
    le(l, t, a, u);
  }
  function le(l, t, a, u) {
    var e = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (cn(l)) pd(t, e);
    else {
      var n = l.alternate;
      if (l.lanes === 0 && (n === null || n.lanes === 0) && (n = t.lastRenderedReducer, n !== null))
        try {
          var i = t.lastRenderedState, f = n(i, a);
          if (e.hasEagerState = !0, e.eagerState = f, it(f, i))
            return Qe(l, t, e, 0), yl === null && Xe(), !1;
        } catch {
        }
      if (a = pi(l, t, e, u), a !== null)
        return tt(a, l, u), Td(a, t, u), !0;
    }
    return !1;
  }
  function ef(l, t, a, u) {
    if (u = {
      lane: 2,
      revertLane: qf(),
      gesture: null,
      action: u,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, cn(l)) {
      if (t) throw Error(v(479));
    } else
      t = pi(
        l,
        a,
        u,
        2
      ), t !== null && tt(t, l, 2);
  }
  function cn(l) {
    var t = l.alternate;
    return l === Z || t !== null && t === Z;
  }
  function pd(l, t) {
    yu = ln = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function Td(l, t, a) {
    if ((a & 4194048) !== 0) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, xc(l, a);
    }
  }
  var te = {
    readContext: Xl,
    use: un,
    useCallback: pl,
    useContext: pl,
    useEffect: pl,
    useImperativeHandle: pl,
    useLayoutEffect: pl,
    useInsertionEffect: pl,
    useMemo: pl,
    useReducer: pl,
    useRef: pl,
    useState: pl,
    useDebugValue: pl,
    useDeferredValue: pl,
    useTransition: pl,
    useSyncExternalStore: pl,
    useId: pl,
    useHostTransitionStatus: pl,
    useFormState: pl,
    useActionState: pl,
    useOptimistic: pl,
    useMemoCache: pl,
    useCacheRefresh: pl
  };
  te.useEffectEvent = pl;
  var Ed = {
    readContext: Xl,
    use: un,
    useCallback: function(l, t) {
      return wl().memoizedState = [
        l,
        t === void 0 ? null : t
      ], l;
    },
    useContext: Xl,
    useEffect: id,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, nn(
        4194308,
        4,
        dd.bind(null, t, l),
        a
      );
    },
    useLayoutEffect: function(l, t) {
      return nn(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      nn(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var a = wl();
      t = t === void 0 ? null : t;
      var u = l();
      if (Ga) {
        It(!0);
        try {
          l();
        } finally {
          It(!1);
        }
      }
      return a.memoizedState = [u, t], u;
    },
    useReducer: function(l, t, a) {
      var u = wl();
      if (a !== void 0) {
        var e = a(t);
        if (Ga) {
          It(!0);
          try {
            a(t);
          } finally {
            It(!1);
          }
        }
      } else e = t;
      return u.memoizedState = u.baseState = e, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: e
      }, u.queue = l, l = l.dispatch = ey.bind(
        null,
        Z,
        l
      ), [u.memoizedState, l];
    },
    useRef: function(l) {
      var t = wl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = Fi(l);
      var t = l.queue, a = zd.bind(null, Z, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: lf,
    useDeferredValue: function(l, t) {
      var a = wl();
      return tf(a, l, t);
    },
    useTransition: function() {
      var l = Fi(!1);
      return l = rd.bind(
        null,
        Z,
        l.queue,
        !0,
        !1
      ), wl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var u = Z, e = wl();
      if (P) {
        if (a === void 0)
          throw Error(v(407));
        a = a();
      } else {
        if (a = t(), yl === null)
          throw Error(v(349));
        (k & 127) !== 0 || Ls(u, t, a);
      }
      e.memoizedState = a;
      var n = { value: a, getSnapshot: t };
      return e.queue = n, id(Js.bind(null, u, n, l), [
        l
      ]), u.flags |= 2048, ru(
        9,
        { destroy: void 0 },
        Ks.bind(
          null,
          u,
          n,
          a,
          t
        ),
        null
      ), a;
    },
    useId: function() {
      var l = wl(), t = yl.identifierPrefix;
      if (P) {
        var a = Ut, u = Ot;
        a = (u & ~(1 << 32 - nt(u) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = tn++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else
        a = Fv++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: uf,
    useFormState: td,
    useActionState: td,
    useOptimistic: function(l) {
      var t = wl();
      t.memoizedState = t.baseState = l;
      var a = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = a, t = ef.bind(
        null,
        Z,
        !0,
        a
      ), a.dispatch = t, [l, t];
    },
    useMemoCache: Wi,
    useCacheRefresh: function() {
      return wl().memoizedState = uy.bind(
        null,
        Z
      );
    },
    useEffectEvent: function(l) {
      var t = wl(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((ul & 2) !== 0)
          throw Error(v(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, nf = {
    readContext: Xl,
    use: un,
    useCallback: vd,
    useContext: Xl,
    useEffect: Pi,
    useImperativeHandle: od,
    useInsertionEffect: cd,
    useLayoutEffect: sd,
    useMemo: yd,
    useReducer: en,
    useRef: nd,
    useState: function() {
      return en(Zt);
    },
    useDebugValue: lf,
    useDeferredValue: function(l, t) {
      var a = Ml();
      return md(
        a,
        sl.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = en(Zt)[0], t = Ml().memoizedState;
      return [
        typeof l == "boolean" ? l : Pu(l),
        t
      ];
    },
    useSyncExternalStore: Vs,
    useId: Sd,
    useHostTransitionStatus: uf,
    useFormState: ad,
    useActionState: ad,
    useOptimistic: function(l, t) {
      var a = Ml();
      return $s(a, sl, l, t);
    },
    useMemoCache: Wi,
    useCacheRefresh: bd
  };
  nf.useEffectEvent = fd;
  var Ad = {
    readContext: Xl,
    use: un,
    useCallback: vd,
    useContext: Xl,
    useEffect: Pi,
    useImperativeHandle: od,
    useInsertionEffect: cd,
    useLayoutEffect: sd,
    useMemo: yd,
    useReducer: ki,
    useRef: nd,
    useState: function() {
      return ki(Zt);
    },
    useDebugValue: lf,
    useDeferredValue: function(l, t) {
      var a = Ml();
      return sl === null ? tf(a, l, t) : md(
        a,
        sl.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = ki(Zt)[0], t = Ml().memoizedState;
      return [
        typeof l == "boolean" ? l : Pu(l),
        t
      ];
    },
    useSyncExternalStore: Vs,
    useId: Sd,
    useHostTransitionStatus: uf,
    useFormState: ed,
    useActionState: ed,
    useOptimistic: function(l, t) {
      var a = Ml();
      return sl !== null ? $s(a, sl, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: Wi,
    useCacheRefresh: bd
  };
  Ad.useEffectEvent = fd;
  function ff(l, t, a, u) {
    t = l.memoizedState, a = a(u, t), a = a == null ? t : H({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var cf = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var u = vt(), e = ia(u);
      e.payload = t, a != null && (e.callback = a), t = fa(l, e, u), t !== null && (tt(t, l, u), $u(t, l, u));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var u = vt(), e = ia(u);
      e.tag = 1, e.payload = t, a != null && (e.callback = a), t = fa(l, e, u), t !== null && (tt(t, l, u), $u(t, l, u));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = vt(), u = ia(a);
      u.tag = 2, t != null && (u.callback = t), t = fa(l, u, a), t !== null && (tt(t, l, a), $u(t, l, a));
    }
  };
  function _d(l, t, a, u, e, n, i) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(u, n, i) : t.prototype && t.prototype.isPureReactComponent ? !Qu(a, u) || !Qu(e, n) : !0;
  }
  function Md(l, t, a, u) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, u), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, u), t.state !== l && cf.enqueueReplaceState(t, t.state, null);
  }
  function Xa(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var u in t)
        u !== "ref" && (a[u] = t[u]);
    }
    if (l = l.defaultProps) {
      a === t && (a = H({}, a));
      for (var e in l)
        a[e] === void 0 && (a[e] = l[e]);
    }
    return a;
  }
  function xd(l) {
    Ge(l);
  }
  function Dd(l) {
    console.error(l);
  }
  function Od(l) {
    Ge(l);
  }
  function sn(l, t) {
    try {
      var a = l.onUncaughtError;
      a(t.value, { componentStack: t.stack });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function Ud(l, t, a) {
    try {
      var u = l.onCaughtError;
      u(a.value, {
        componentStack: a.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (e) {
      setTimeout(function() {
        throw e;
      });
    }
  }
  function sf(l, t, a) {
    return a = ia(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      sn(l, t);
    }, a;
  }
  function Hd(l) {
    return l = ia(l), l.tag = 3, l;
  }
  function Cd(l, t, a, u) {
    var e = a.type.getDerivedStateFromError;
    if (typeof e == "function") {
      var n = u.value;
      l.payload = function() {
        return e(n);
      }, l.callback = function() {
        Ud(t, a, u);
      };
    }
    var i = a.stateNode;
    i !== null && typeof i.componentDidCatch == "function" && (l.callback = function() {
      Ud(t, a, u), typeof e != "function" && (ya === null ? ya = /* @__PURE__ */ new Set([this]) : ya.add(this));
      var f = u.stack;
      this.componentDidCatch(u.value, {
        componentStack: f !== null ? f : ""
      });
    });
  }
  function ny(l, t, a, u, e) {
    if (a.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
      if (t = a.alternate, t !== null && fu(
        t,
        a,
        e,
        !0
      ), a = ct.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return zt === null ? pn() : a.alternate === null && Tl === 0 && (Tl = 3), a.flags &= -257, a.flags |= 65536, a.lanes = e, u === $e ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([u]) : t.add(u), Rf(l, u, e)), !1;
          case 22:
            return a.flags |= 65536, u === $e ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([u])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([u]) : a.add(u)), Rf(l, u, e)), !1;
        }
        throw Error(v(435, a.tag));
      }
      return Rf(l, u, e), pn(), !1;
    }
    if (P)
      return t = ct.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = e, u !== xi && (l = Error(v(422), { cause: u }), Lu(ht(l, a)))) : (u !== xi && (t = Error(v(423), {
        cause: u
      }), Lu(
        ht(t, a)
      )), l = l.current.alternate, l.flags |= 65536, e &= -e, l.lanes |= e, u = ht(u, a), e = sf(
        l.stateNode,
        u,
        e
      ), Yi(l, e), Tl !== 4 && (Tl = 2)), !1;
    var n = Error(v(520), { cause: u });
    if (n = ht(n, a), se === null ? se = [n] : se.push(n), Tl !== 4 && (Tl = 2), t === null) return !0;
    u = ht(u, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = e & -e, a.lanes |= l, l = sf(a.stateNode, u, l), Yi(a, l), !1;
        case 1:
          if (t = a.type, n = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || n !== null && typeof n.componentDidCatch == "function" && (ya === null || !ya.has(n))))
            return a.flags |= 65536, e &= -e, a.lanes |= e, e = Hd(e), Cd(
              e,
              l,
              a,
              u
            ), Yi(a, e), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var df = Error(v(461)), Cl = !1;
  function Ql(l, t, a, u) {
    t.child = l === null ? Bs(t, null, a, u) : Ya(
      t,
      l.child,
      a,
      u
    );
  }
  function Nd(l, t, a, u, e) {
    a = a.render;
    var n = t.ref;
    if ("ref" in u) {
      var i = {};
      for (var f in u)
        f !== "ref" && (i[f] = u[f]);
    } else i = u;
    return Ra(t), u = Li(
      l,
      t,
      a,
      i,
      n,
      e
    ), f = Ki(), l !== null && !Cl ? (Ji(l, t, e), Vt(l, t, e)) : (P && f && _i(t), t.flags |= 1, Ql(l, t, u, e), t.child);
  }
  function Rd(l, t, a, u, e) {
    if (l === null) {
      var n = a.type;
      return typeof n == "function" && !Ti(n) && n.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = n, jd(
        l,
        t,
        n,
        u,
        e
      )) : (l = Ve(
        a.type,
        null,
        u,
        t,
        t.mode,
        e
      ), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (n = l.child, !Sf(l, e)) {
      var i = n.memoizedProps;
      if (a = a.compare, a = a !== null ? a : Qu, a(i, u) && l.ref === t.ref)
        return Vt(l, t, e);
    }
    return t.flags |= 1, l = qt(n, u), l.ref = t.ref, l.return = t, t.child = l;
  }
  function jd(l, t, a, u, e) {
    if (l !== null) {
      var n = l.memoizedProps;
      if (Qu(n, u) && l.ref === t.ref)
        if (Cl = !1, t.pendingProps = u = n, Sf(l, e))
          (l.flags & 131072) !== 0 && (Cl = !0);
        else
          return t.lanes = l.lanes, Vt(l, t, e);
    }
    return of(
      l,
      t,
      a,
      u,
      e
    );
  }
  function Bd(l, t, a, u) {
    var e = u.children, n = l !== null ? l.memoizedState : null;
    if (l === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), u.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (n = n !== null ? n.baseLanes | a : a, l !== null) {
          for (u = t.child = l.child, e = 0; u !== null; )
            e = e | u.lanes | u.childLanes, u = u.sibling;
          u = e & ~n;
        } else u = 0, t.child = null;
        return qd(
          l,
          t,
          n,
          a,
          u
        );
      }
      if ((a & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, l !== null && we(
          t,
          n !== null ? n.cachePool : null
        ), n !== null ? Gs(t, n) : Xi(), Xs(t);
      else
        return u = t.lanes = 536870912, qd(
          l,
          t,
          n !== null ? n.baseLanes | a : a,
          a,
          u
        );
    } else
      n !== null ? (we(t, n.cachePool), Gs(t, n), sa(), t.memoizedState = null) : (l !== null && we(t, null), Xi(), sa());
    return Ql(l, t, e, a), t.child;
  }
  function ae(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function qd(l, t, a, u, e) {
    var n = Ri();
    return n = n === null ? null : { parent: Ul._currentValue, pool: n }, t.memoizedState = {
      baseLanes: a,
      cachePool: n
    }, l !== null && we(t, null), Xi(), Xs(t), l !== null && fu(l, t, u, !0), t.childLanes = e, null;
  }
  function dn(l, t) {
    return t = vn(
      { mode: t.mode, children: t.children },
      l.mode
    ), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function Yd(l, t, a) {
    return Ya(t, l.child, null, a), l = dn(t, t.pendingProps), l.flags |= 2, st(t), t.memoizedState = null, l;
  }
  function iy(l, t, a) {
    var u = t.pendingProps, e = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (P) {
        if (u.mode === "hidden")
          return l = dn(t, u), t.lanes = 536870912, ae(null, l);
        if (Zi(t), (l = ml) ? (l = Fo(
          l,
          bt
        ), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? { id: Ot, overflow: Ut } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = ps(l), a.return = t, t.child = a, Gl = t, ml = null)) : l = null, l === null) throw ua(t);
        return t.lanes = 536870912, null;
      }
      return dn(t, u);
    }
    var n = l.memoizedState;
    if (n !== null) {
      var i = n.dehydrated;
      if (Zi(t), e)
        if (t.flags & 256)
          t.flags &= -257, t = Yd(
            l,
            t,
            a
          );
        else if (t.memoizedState !== null)
          t.child = l.child, t.flags |= 128, t = null;
        else throw Error(v(558));
      else if (Cl || fu(l, t, a, !1), e = (a & l.childLanes) !== 0, Cl || e) {
        if (u = yl, u !== null && (i = Dc(u, a), i !== 0 && i !== n.retryLane))
          throw n.retryLane = i, Ua(l, i), tt(u, l, i), df;
        pn(), t = Yd(
          l,
          t,
          a
        );
      } else
        l = n.treeContext, ml = pt(i.nextSibling), Gl = t, P = !0, aa = null, bt = !1, l !== null && As(t, l), t = dn(t, u), t.flags |= 4096;
      return t;
    }
    return l = qt(l.child, {
      mode: u.mode,
      children: u.children
    }), l.ref = t.ref, t.child = l, l.return = t, l;
  }
  function on(l, t) {
    var a = t.ref;
    if (a === null)
      l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof a != "function" && typeof a != "object")
        throw Error(v(284));
      (l === null || l.ref !== a) && (t.flags |= 4194816);
    }
  }
  function of(l, t, a, u, e) {
    return Ra(t), a = Li(
      l,
      t,
      a,
      u,
      void 0,
      e
    ), u = Ki(), l !== null && !Cl ? (Ji(l, t, e), Vt(l, t, e)) : (P && u && _i(t), t.flags |= 1, Ql(l, t, a, e), t.child);
  }
  function Gd(l, t, a, u, e, n) {
    return Ra(t), t.updateQueue = null, a = Zs(
      t,
      u,
      a,
      e
    ), Qs(l), u = Ki(), l !== null && !Cl ? (Ji(l, t, n), Vt(l, t, n)) : (P && u && _i(t), t.flags |= 1, Ql(l, t, a, n), t.child);
  }
  function Xd(l, t, a, u, e) {
    if (Ra(t), t.stateNode === null) {
      var n = uu, i = a.contextType;
      typeof i == "object" && i !== null && (n = Xl(i)), n = new a(u, n), t.memoizedState = n.state !== null && n.state !== void 0 ? n.state : null, n.updater = cf, t.stateNode = n, n._reactInternals = t, n = t.stateNode, n.props = u, n.state = t.memoizedState, n.refs = {}, Bi(t), i = a.contextType, n.context = typeof i == "object" && i !== null ? Xl(i) : uu, n.state = t.memoizedState, i = a.getDerivedStateFromProps, typeof i == "function" && (ff(
        t,
        a,
        i,
        u
      ), n.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof n.getSnapshotBeforeUpdate == "function" || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (i = n.state, typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount(), i !== n.state && cf.enqueueReplaceState(n, n.state, null), Fu(t, u, n, e), ku(), n.state = t.memoizedState), typeof n.componentDidMount == "function" && (t.flags |= 4194308), u = !0;
    } else if (l === null) {
      n = t.stateNode;
      var f = t.memoizedProps, c = Xa(a, f);
      n.props = c;
      var m = n.context, g = a.contextType;
      i = uu, typeof g == "object" && g !== null && (i = Xl(g));
      var p = a.getDerivedStateFromProps;
      g = typeof p == "function" || typeof n.getSnapshotBeforeUpdate == "function", f = t.pendingProps !== f, g || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (f || m !== i) && Md(
        t,
        n,
        u,
        i
      ), na = !1;
      var r = t.memoizedState;
      n.state = r, Fu(t, u, n, e), ku(), m = t.memoizedState, f || r !== m || na ? (typeof p == "function" && (ff(
        t,
        a,
        p,
        u
      ), m = t.memoizedState), (c = na || _d(
        t,
        a,
        c,
        u,
        r,
        m,
        i
      )) ? (g || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount()), typeof n.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = m), n.props = u, n.state = m, n.context = i, u = c) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), u = !1);
    } else {
      n = t.stateNode, qi(l, t), i = t.memoizedProps, g = Xa(a, i), n.props = g, p = t.pendingProps, r = n.context, m = a.contextType, c = uu, typeof m == "object" && m !== null && (c = Xl(m)), f = a.getDerivedStateFromProps, (m = typeof f == "function" || typeof n.getSnapshotBeforeUpdate == "function") || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (i !== p || r !== c) && Md(
        t,
        n,
        u,
        c
      ), na = !1, r = t.memoizedState, n.state = r, Fu(t, u, n, e), ku();
      var h = t.memoizedState;
      i !== p || r !== h || na || l !== null && l.dependencies !== null && Ke(l.dependencies) ? (typeof f == "function" && (ff(
        t,
        a,
        f,
        u
      ), h = t.memoizedState), (g = na || _d(
        t,
        a,
        g,
        u,
        r,
        h,
        c
      ) || l !== null && l.dependencies !== null && Ke(l.dependencies)) ? (m || typeof n.UNSAFE_componentWillUpdate != "function" && typeof n.componentWillUpdate != "function" || (typeof n.componentWillUpdate == "function" && n.componentWillUpdate(u, h, c), typeof n.UNSAFE_componentWillUpdate == "function" && n.UNSAFE_componentWillUpdate(
        u,
        h,
        c
      )), typeof n.componentDidUpdate == "function" && (t.flags |= 4), typeof n.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && r === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && r === l.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = h), n.props = u, n.state = h, n.context = c, u = g) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && r === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && r === l.memoizedState || (t.flags |= 1024), u = !1);
    }
    return n = u, on(l, t), u = (t.flags & 128) !== 0, n || u ? (n = t.stateNode, a = u && typeof a.getDerivedStateFromError != "function" ? null : n.render(), t.flags |= 1, l !== null && u ? (t.child = Ya(
      t,
      l.child,
      null,
      e
    ), t.child = Ya(
      t,
      null,
      a,
      e
    )) : Ql(l, t, a, e), t.memoizedState = n.state, l = t.child) : l = Vt(
      l,
      t,
      e
    ), l;
  }
  function Qd(l, t, a, u) {
    return Ca(), t.flags |= 256, Ql(l, t, a, u), t.child;
  }
  var vf = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function yf(l) {
    return { baseLanes: l, cachePool: Us() };
  }
  function mf(l, t, a) {
    return l = l !== null ? l.childLanes & ~a : 0, t && (l |= ot), l;
  }
  function Zd(l, t, a) {
    var u = t.pendingProps, e = !1, n = (t.flags & 128) !== 0, i;
    if ((i = n) || (i = l !== null && l.memoizedState === null ? !1 : (_l.current & 2) !== 0), i && (e = !0, t.flags &= -129), i = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (P) {
        if (e ? ca(t) : sa(), (l = ml) ? (l = Fo(
          l,
          bt
        ), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? { id: Ot, overflow: Ut } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = ps(l), a.return = t, t.child = a, Gl = t, ml = null)) : l = null, l === null) throw ua(t);
        return kf(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var f = u.children;
      return u = u.fallback, e ? (sa(), e = t.mode, f = vn(
        { mode: "hidden", children: f },
        e
      ), u = Ha(
        u,
        e,
        a,
        null
      ), f.return = t, u.return = t, f.sibling = u, t.child = f, u = t.child, u.memoizedState = yf(a), u.childLanes = mf(
        l,
        i,
        a
      ), t.memoizedState = vf, ae(null, u)) : (ca(t), rf(t, f));
    }
    var c = l.memoizedState;
    if (c !== null && (f = c.dehydrated, f !== null)) {
      if (n)
        t.flags & 256 ? (ca(t), t.flags &= -257, t = hf(
          l,
          t,
          a
        )) : t.memoizedState !== null ? (sa(), t.child = l.child, t.flags |= 128, t = null) : (sa(), f = u.fallback, e = t.mode, u = vn(
          { mode: "visible", children: u.children },
          e
        ), f = Ha(
          f,
          e,
          a,
          null
        ), f.flags |= 2, u.return = t, f.return = t, u.sibling = f, t.child = u, Ya(
          t,
          l.child,
          null,
          a
        ), u = t.child, u.memoizedState = yf(a), u.childLanes = mf(
          l,
          i,
          a
        ), t.memoizedState = vf, t = ae(null, u));
      else if (ca(t), kf(f)) {
        if (i = f.nextSibling && f.nextSibling.dataset, i) var m = i.dgst;
        i = m, u = Error(v(419)), u.stack = "", u.digest = i, Lu({ value: u, source: null, stack: null }), t = hf(
          l,
          t,
          a
        );
      } else if (Cl || fu(l, t, a, !1), i = (a & l.childLanes) !== 0, Cl || i) {
        if (i = yl, i !== null && (u = Dc(i, a), u !== 0 && u !== c.retryLane))
          throw c.retryLane = u, Ua(l, u), tt(i, l, u), df;
        $f(f) || pn(), t = hf(
          l,
          t,
          a
        );
      } else
        $f(f) ? (t.flags |= 192, t.child = l.child, t = null) : (l = c.treeContext, ml = pt(
          f.nextSibling
        ), Gl = t, P = !0, aa = null, bt = !1, l !== null && As(t, l), t = rf(
          t,
          u.children
        ), t.flags |= 4096);
      return t;
    }
    return e ? (sa(), f = u.fallback, e = t.mode, c = l.child, m = c.sibling, u = qt(c, {
      mode: "hidden",
      children: u.children
    }), u.subtreeFlags = c.subtreeFlags & 65011712, m !== null ? f = qt(
      m,
      f
    ) : (f = Ha(
      f,
      e,
      a,
      null
    ), f.flags |= 2), f.return = t, u.return = t, u.sibling = f, t.child = u, ae(null, u), u = t.child, f = l.child.memoizedState, f === null ? f = yf(a) : (e = f.cachePool, e !== null ? (c = Ul._currentValue, e = e.parent !== c ? { parent: c, pool: c } : e) : e = Us(), f = {
      baseLanes: f.baseLanes | a,
      cachePool: e
    }), u.memoizedState = f, u.childLanes = mf(
      l,
      i,
      a
    ), t.memoizedState = vf, ae(l.child, u)) : (ca(t), a = l.child, l = a.sibling, a = qt(a, {
      mode: "visible",
      children: u.children
    }), a.return = t, a.sibling = null, l !== null && (i = t.deletions, i === null ? (t.deletions = [l], t.flags |= 16) : i.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function rf(l, t) {
    return t = vn(
      { mode: "visible", children: t },
      l.mode
    ), t.return = l, l.child = t;
  }
  function vn(l, t) {
    return l = ft(22, l, null, t), l.lanes = 0, l;
  }
  function hf(l, t, a) {
    return Ya(t, l.child, null, a), l = rf(
      t,
      t.pendingProps.children
    ), l.flags |= 2, t.memoizedState = null, l;
  }
  function Vd(l, t, a) {
    l.lanes |= t;
    var u = l.alternate;
    u !== null && (u.lanes |= t), Ui(l.return, t, a);
  }
  function gf(l, t, a, u, e, n) {
    var i = l.memoizedState;
    i === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: u,
      tail: a,
      tailMode: e,
      treeForkCount: n
    } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = u, i.tail = a, i.tailMode = e, i.treeForkCount = n);
  }
  function Ld(l, t, a) {
    var u = t.pendingProps, e = u.revealOrder, n = u.tail;
    u = u.children;
    var i = _l.current, f = (i & 2) !== 0;
    if (f ? (i = i & 1 | 2, t.flags |= 128) : i &= 1, _(_l, i), Ql(l, t, u, a), u = P ? Vu : 0, !f && l !== null && (l.flags & 128) !== 0)
      l: for (l = t.child; l !== null; ) {
        if (l.tag === 13)
          l.memoizedState !== null && Vd(l, a, t);
        else if (l.tag === 19)
          Vd(l, a, t);
        else if (l.child !== null) {
          l.child.return = l, l = l.child;
          continue;
        }
        if (l === t) break l;
        for (; l.sibling === null; ) {
          if (l.return === null || l.return === t)
            break l;
          l = l.return;
        }
        l.sibling.return = l.return, l = l.sibling;
      }
    switch (e) {
      case "forwards":
        for (a = t.child, e = null; a !== null; )
          l = a.alternate, l !== null && Pe(l) === null && (e = a), a = a.sibling;
        a = e, a === null ? (e = t.child, t.child = null) : (e = a.sibling, a.sibling = null), gf(
          t,
          !1,
          e,
          a,
          n,
          u
        );
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, e = t.child, t.child = null; e !== null; ) {
          if (l = e.alternate, l !== null && Pe(l) === null) {
            t.child = e;
            break;
          }
          l = e.sibling, e.sibling = a, a = e, e = l;
        }
        gf(
          t,
          !0,
          a,
          null,
          n,
          u
        );
        break;
      case "together":
        gf(
          t,
          !1,
          null,
          null,
          void 0,
          u
        );
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Vt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), va |= t.lanes, (a & t.childLanes) === 0)
      if (l !== null) {
        if (fu(
          l,
          t,
          a,
          !1
        ), (a & t.childLanes) === 0)
          return null;
      } else return null;
    if (l !== null && t.child !== l.child)
      throw Error(v(153));
    if (t.child !== null) {
      for (l = t.child, a = qt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; )
        l = l.sibling, a = a.sibling = qt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function Sf(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && Ke(l)));
  }
  function fy(l, t, a) {
    switch (t.tag) {
      case 3:
        Jl(t, t.stateNode.containerInfo), ea(t, Ul, l.memoizedState.cache), Ca();
        break;
      case 27:
      case 5:
        Du(t);
        break;
      case 4:
        Jl(t, t.stateNode.containerInfo);
        break;
      case 10:
        ea(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, Zi(t), null;
        break;
      case 13:
        var u = t.memoizedState;
        if (u !== null)
          return u.dehydrated !== null ? (ca(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? Zd(l, t, a) : (ca(t), l = Vt(
            l,
            t,
            a
          ), l !== null ? l.sibling : null);
        ca(t);
        break;
      case 19:
        var e = (l.flags & 128) !== 0;
        if (u = (a & t.childLanes) !== 0, u || (fu(
          l,
          t,
          a,
          !1
        ), u = (a & t.childLanes) !== 0), e) {
          if (u)
            return Ld(
              l,
              t,
              a
            );
          t.flags |= 128;
        }
        if (e = t.memoizedState, e !== null && (e.rendering = null, e.tail = null, e.lastEffect = null), _(_l, _l.current), u) break;
        return null;
      case 22:
        return t.lanes = 0, Bd(
          l,
          t,
          a,
          t.pendingProps
        );
      case 24:
        ea(t, Ul, l.memoizedState.cache);
    }
    return Vt(l, t, a);
  }
  function Kd(l, t, a) {
    if (l !== null)
      if (l.memoizedProps !== t.pendingProps)
        Cl = !0;
      else {
        if (!Sf(l, a) && (t.flags & 128) === 0)
          return Cl = !1, fy(
            l,
            t,
            a
          );
        Cl = (l.flags & 131072) !== 0;
      }
    else
      Cl = !1, P && (t.flags & 1048576) !== 0 && Es(t, Vu, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var u = t.pendingProps;
          if (l = Ba(t.elementType), t.type = l, typeof l == "function")
            Ti(l) ? (u = Xa(l, u), t.tag = 1, t = Xd(
              null,
              t,
              l,
              u,
              a
            )) : (t.tag = 0, t = of(
              null,
              t,
              l,
              u,
              a
            ));
          else {
            if (l != null) {
              var e = l.$$typeof;
              if (e === G) {
                t.tag = 11, t = Nd(
                  null,
                  t,
                  l,
                  u,
                  a
                );
                break l;
              } else if (e === X) {
                t.tag = 14, t = Rd(
                  null,
                  t,
                  l,
                  u,
                  a
                );
                break l;
              }
            }
            throw t = Nt(l) || l, Error(v(306, t, ""));
          }
        }
        return t;
      case 0:
        return of(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 1:
        return u = t.type, e = Xa(
          u,
          t.pendingProps
        ), Xd(
          l,
          t,
          u,
          e,
          a
        );
      case 3:
        l: {
          if (Jl(
            t,
            t.stateNode.containerInfo
          ), l === null) throw Error(v(387));
          u = t.pendingProps;
          var n = t.memoizedState;
          e = n.element, qi(l, t), Fu(t, u, null, a);
          var i = t.memoizedState;
          if (u = i.cache, ea(t, Ul, u), u !== n.cache && Hi(
            t,
            [Ul],
            a,
            !0
          ), ku(), u = i.element, n.isDehydrated)
            if (n = {
              element: u,
              isDehydrated: !1,
              cache: i.cache
            }, t.updateQueue.baseState = n, t.memoizedState = n, t.flags & 256) {
              t = Qd(
                l,
                t,
                u,
                a
              );
              break l;
            } else if (u !== e) {
              e = ht(
                Error(v(424)),
                t
              ), Lu(e), t = Qd(
                l,
                t,
                u,
                a
              );
              break l;
            } else
              for (l = t.stateNode.containerInfo, l.nodeType === 9 ? l = l.body : l = l.nodeName === "HTML" ? l.ownerDocument.body : l, ml = pt(l.firstChild), Gl = t, P = !0, aa = null, bt = !0, a = Bs(
                t,
                null,
                u,
                a
              ), t.child = a; a; )
                a.flags = a.flags & -3 | 4096, a = a.sibling;
          else {
            if (Ca(), u === e) {
              t = Vt(
                l,
                t,
                a
              );
              break l;
            }
            Ql(l, t, u, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return on(l, t), l === null ? (a = u0(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = a : P || (a = t.type, l = t.pendingProps, u = Dn(
          w.current
        ).createElement(a), u[Yl] = t, u[$l] = l, Zl(u, a, l), Bl(u), t.stateNode = u) : t.memoizedState = u0(
          t.type,
          l.memoizedProps,
          t.pendingProps,
          l.memoizedState
        ), null;
      case 27:
        return Du(t), l === null && P && (u = t.stateNode = l0(
          t.type,
          t.pendingProps,
          w.current
        ), Gl = t, bt = !0, e = ml, ga(t.type) ? (Ff = e, ml = pt(u.firstChild)) : ml = e), Ql(
          l,
          t,
          t.pendingProps.children,
          a
        ), on(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && P && ((e = u = ml) && (u = qy(
          u,
          t.type,
          t.pendingProps,
          bt
        ), u !== null ? (t.stateNode = u, Gl = t, ml = pt(u.firstChild), bt = !1, e = !0) : e = !1), e || ua(t)), Du(t), e = t.type, n = t.pendingProps, i = l !== null ? l.memoizedProps : null, u = n.children, Jf(e, n) ? u = null : i !== null && Jf(e, i) && (t.flags |= 32), t.memoizedState !== null && (e = Li(
          l,
          t,
          Iv,
          null,
          null,
          a
        ), ge._currentValue = e), on(l, t), Ql(l, t, u, a), t.child;
      case 6:
        return l === null && P && ((l = a = ml) && (a = Yy(
          a,
          t.pendingProps,
          bt
        ), a !== null ? (t.stateNode = a, Gl = t, ml = null, l = !0) : l = !1), l || ua(t)), null;
      case 13:
        return Zd(l, t, a);
      case 4:
        return Jl(
          t,
          t.stateNode.containerInfo
        ), u = t.pendingProps, l === null ? t.child = Ya(
          t,
          null,
          u,
          a
        ) : Ql(l, t, u, a), t.child;
      case 11:
        return Nd(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 7:
        return Ql(
          l,
          t,
          t.pendingProps,
          a
        ), t.child;
      case 8:
        return Ql(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 12:
        return Ql(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 10:
        return u = t.pendingProps, ea(t, t.type, u.value), Ql(l, t, u.children, a), t.child;
      case 9:
        return e = t.type._context, u = t.pendingProps.children, Ra(t), e = Xl(e), u = u(e), t.flags |= 1, Ql(l, t, u, a), t.child;
      case 14:
        return Rd(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 15:
        return jd(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 19:
        return Ld(l, t, a);
      case 31:
        return iy(l, t, a);
      case 22:
        return Bd(
          l,
          t,
          a,
          t.pendingProps
        );
      case 24:
        return Ra(t), u = Xl(Ul), l === null ? (e = Ri(), e === null && (e = yl, n = Ci(), e.pooledCache = n, n.refCount++, n !== null && (e.pooledCacheLanes |= a), e = n), t.memoizedState = { parent: u, cache: e }, Bi(t), ea(t, Ul, e)) : ((l.lanes & a) !== 0 && (qi(l, t), Fu(t, null, null, a), ku()), e = l.memoizedState, n = t.memoizedState, e.parent !== u ? (e = { parent: u, cache: u }, t.memoizedState = e, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = e), ea(t, Ul, u)) : (u = n.cache, ea(t, Ul, u), u !== e.cache && Hi(
          t,
          [Ul],
          a,
          !0
        ))), Ql(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(v(156, t.tag));
  }
  function Lt(l) {
    l.flags |= 4;
  }
  function bf(l, t, a, u, e) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (e & 335544128) === e)
        if (l.stateNode.complete) l.flags |= 8192;
        else if (bo()) l.flags |= 8192;
        else
          throw qa = $e, ji;
    } else l.flags &= -16777217;
  }
  function Jd(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      l.flags &= -16777217;
    else if (l.flags |= 16777216, !c0(t))
      if (bo()) l.flags |= 8192;
      else
        throw qa = $e, ji;
  }
  function yn(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? _c() : 536870912, l.lanes |= t, bu |= t);
  }
  function ue(l, t) {
    if (!P)
      switch (l.tailMode) {
        case "hidden":
          t = l.tail;
          for (var a = null; t !== null; )
            t.alternate !== null && (a = t), t = t.sibling;
          a === null ? l.tail = null : a.sibling = null;
          break;
        case "collapsed":
          a = l.tail;
          for (var u = null; a !== null; )
            a.alternate !== null && (u = a), a = a.sibling;
          u === null ? t || l.tail === null ? l.tail = null : l.tail.sibling = null : u.sibling = null;
      }
  }
  function rl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, u = 0;
    if (t)
      for (var e = l.child; e !== null; )
        a |= e.lanes | e.childLanes, u |= e.subtreeFlags & 65011712, u |= e.flags & 65011712, e.return = l, e = e.sibling;
    else
      for (e = l.child; e !== null; )
        a |= e.lanes | e.childLanes, u |= e.subtreeFlags, u |= e.flags, e.return = l, e = e.sibling;
    return l.subtreeFlags |= u, l.childLanes = a, t;
  }
  function cy(l, t, a) {
    var u = t.pendingProps;
    switch (Mi(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return rl(t), null;
      case 1:
        return rl(t), null;
      case 3:
        return a = t.stateNode, u = null, l !== null && (u = l.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), Xt(Ul), Al(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (iu(t) ? Lt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Di())), rl(t), null;
      case 26:
        var e = t.type, n = t.memoizedState;
        return l === null ? (Lt(t), n !== null ? (rl(t), Jd(t, n)) : (rl(t), bf(
          t,
          e,
          null,
          u,
          a
        ))) : n ? n !== l.memoizedState ? (Lt(t), rl(t), Jd(t, n)) : (rl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== u && Lt(t), rl(t), bf(
          t,
          e,
          l,
          u,
          a
        )), null;
      case 27:
        if (Ee(t), a = w.current, e = t.type, l !== null && t.stateNode != null)
          l.memoizedProps !== u && Lt(t);
        else {
          if (!u) {
            if (t.stateNode === null)
              throw Error(v(166));
            return rl(t), null;
          }
          l = O.current, iu(t) ? _s(t) : (l = l0(e, u, a), t.stateNode = l, Lt(t));
        }
        return rl(t), null;
      case 5:
        if (Ee(t), e = t.type, l !== null && t.stateNode != null)
          l.memoizedProps !== u && Lt(t);
        else {
          if (!u) {
            if (t.stateNode === null)
              throw Error(v(166));
            return rl(t), null;
          }
          if (n = O.current, iu(t))
            _s(t);
          else {
            var i = Dn(
              w.current
            );
            switch (n) {
              case 1:
                n = i.createElementNS(
                  "http://www.w3.org/2000/svg",
                  e
                );
                break;
              case 2:
                n = i.createElementNS(
                  "http://www.w3.org/1998/Math/MathML",
                  e
                );
                break;
              default:
                switch (e) {
                  case "svg":
                    n = i.createElementNS(
                      "http://www.w3.org/2000/svg",
                      e
                    );
                    break;
                  case "math":
                    n = i.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      e
                    );
                    break;
                  case "script":
                    n = i.createElement("div"), n.innerHTML = "<script><\/script>", n = n.removeChild(
                      n.firstChild
                    );
                    break;
                  case "select":
                    n = typeof u.is == "string" ? i.createElement("select", {
                      is: u.is
                    }) : i.createElement("select"), u.multiple ? n.multiple = !0 : u.size && (n.size = u.size);
                    break;
                  default:
                    n = typeof u.is == "string" ? i.createElement(e, { is: u.is }) : i.createElement(e);
                }
            }
            n[Yl] = t, n[$l] = u;
            l: for (i = t.child; i !== null; ) {
              if (i.tag === 5 || i.tag === 6)
                n.appendChild(i.stateNode);
              else if (i.tag !== 4 && i.tag !== 27 && i.child !== null) {
                i.child.return = i, i = i.child;
                continue;
              }
              if (i === t) break l;
              for (; i.sibling === null; ) {
                if (i.return === null || i.return === t)
                  break l;
                i = i.return;
              }
              i.sibling.return = i.return, i = i.sibling;
            }
            t.stateNode = n;
            l: switch (Zl(n, e, u), e) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                u = !!u.autoFocus;
                break l;
              case "img":
                u = !0;
                break l;
              default:
                u = !1;
            }
            u && Lt(t);
          }
        }
        return rl(t), bf(
          t,
          t.type,
          l === null ? null : l.memoizedProps,
          t.pendingProps,
          a
        ), null;
      case 6:
        if (l && t.stateNode != null)
          l.memoizedProps !== u && Lt(t);
        else {
          if (typeof u != "string" && t.stateNode === null)
            throw Error(v(166));
          if (l = w.current, iu(t)) {
            if (l = t.stateNode, a = t.memoizedProps, u = null, e = Gl, e !== null)
              switch (e.tag) {
                case 27:
                case 5:
                  u = e.memoizedProps;
              }
            l[Yl] = t, l = !!(l.nodeValue === a || u !== null && u.suppressHydrationWarning === !0 || Vo(l.nodeValue, a)), l || ua(t, !0);
          } else
            l = Dn(l).createTextNode(
              u
            ), l[Yl] = t, t.stateNode = l;
        }
        return rl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (u = iu(t), a !== null) {
            if (l === null) {
              if (!u) throw Error(v(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(v(557));
              l[Yl] = t;
            } else
              Ca(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            rl(t), l = !1;
          } else
            a = Di(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (st(t), t) : (st(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(v(558));
        }
        return rl(t), null;
      case 13:
        if (u = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (e = iu(t), u !== null && u.dehydrated !== null) {
            if (l === null) {
              if (!e) throw Error(v(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(v(317));
              e[Yl] = t;
            } else
              Ca(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            rl(t), e = !1;
          } else
            e = Di(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = e), e = !0;
          if (!e)
            return t.flags & 256 ? (st(t), t) : (st(t), null);
        }
        return st(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = u !== null, l = l !== null && l.memoizedState !== null, a && (u = t.child, e = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (e = u.alternate.memoizedState.cachePool.pool), n = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (n = u.memoizedState.cachePool.pool), n !== e && (u.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), yn(t, t.updateQueue), rl(t), null);
      case 4:
        return Al(), l === null && Qf(t.stateNode.containerInfo), rl(t), null;
      case 10:
        return Xt(t.type), rl(t), null;
      case 19:
        if (T(_l), u = t.memoizedState, u === null) return rl(t), null;
        if (e = (t.flags & 128) !== 0, n = u.rendering, n === null)
          if (e) ue(u, !1);
          else {
            if (Tl !== 0 || l !== null && (l.flags & 128) !== 0)
              for (l = t.child; l !== null; ) {
                if (n = Pe(l), n !== null) {
                  for (t.flags |= 128, ue(u, !1), l = n.updateQueue, t.updateQueue = l, yn(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; )
                    zs(a, l), a = a.sibling;
                  return _(
                    _l,
                    _l.current & 1 | 2
                  ), P && Yt(t, u.treeForkCount), t.child;
                }
                l = l.sibling;
              }
            u.tail !== null && ut() > Sn && (t.flags |= 128, e = !0, ue(u, !1), t.lanes = 4194304);
          }
        else {
          if (!e)
            if (l = Pe(n), l !== null) {
              if (t.flags |= 128, e = !0, l = l.updateQueue, t.updateQueue = l, yn(t, l), ue(u, !0), u.tail === null && u.tailMode === "hidden" && !n.alternate && !P)
                return rl(t), null;
            } else
              2 * ut() - u.renderingStartTime > Sn && a !== 536870912 && (t.flags |= 128, e = !0, ue(u, !1), t.lanes = 4194304);
          u.isBackwards ? (n.sibling = t.child, t.child = n) : (l = u.last, l !== null ? l.sibling = n : t.child = n, u.last = n);
        }
        return u.tail !== null ? (l = u.tail, u.rendering = l, u.tail = l.sibling, u.renderingStartTime = ut(), l.sibling = null, a = _l.current, _(
          _l,
          e ? a & 1 | 2 : a & 1
        ), P && Yt(t, u.treeForkCount), l) : (rl(t), null);
      case 22:
      case 23:
        return st(t), Qi(), u = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (rl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : rl(t), a = t.updateQueue, a !== null && yn(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== a && (t.flags |= 2048), l !== null && T(ja), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Xt(Ul), rl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(v(156, t.tag));
  }
  function sy(l, t) {
    switch (Mi(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Xt(Ul), Al(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Ee(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (st(t), t.alternate === null)
            throw Error(v(340));
          Ca();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 13:
        if (st(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(v(340));
          Ca();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return T(_l), null;
      case 4:
        return Al(), null;
      case 10:
        return Xt(t.type), null;
      case 22:
      case 23:
        return st(t), Qi(), l !== null && T(ja), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Xt(Ul), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function wd(l, t) {
    switch (Mi(t), t.tag) {
      case 3:
        Xt(Ul), Al();
        break;
      case 26:
      case 27:
      case 5:
        Ee(t);
        break;
      case 4:
        Al();
        break;
      case 31:
        t.memoizedState !== null && st(t);
        break;
      case 13:
        st(t);
        break;
      case 19:
        T(_l);
        break;
      case 10:
        Xt(t.type);
        break;
      case 22:
      case 23:
        st(t), Qi(), l !== null && T(ja);
        break;
      case 24:
        Xt(Ul);
    }
  }
  function ee(l, t) {
    try {
      var a = t.updateQueue, u = a !== null ? a.lastEffect : null;
      if (u !== null) {
        var e = u.next;
        a = e;
        do {
          if ((a.tag & l) === l) {
            u = void 0;
            var n = a.create, i = a.inst;
            u = n(), i.destroy = u;
          }
          a = a.next;
        } while (a !== e);
      }
    } catch (f) {
      fl(t, t.return, f);
    }
  }
  function da(l, t, a) {
    try {
      var u = t.updateQueue, e = u !== null ? u.lastEffect : null;
      if (e !== null) {
        var n = e.next;
        u = n;
        do {
          if ((u.tag & l) === l) {
            var i = u.inst, f = i.destroy;
            if (f !== void 0) {
              i.destroy = void 0, e = t;
              var c = a, m = f;
              try {
                m();
              } catch (g) {
                fl(
                  e,
                  c,
                  g
                );
              }
            }
          }
          u = u.next;
        } while (u !== n);
      }
    } catch (g) {
      fl(t, t.return, g);
    }
  }
  function Wd(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        Ys(t, a);
      } catch (u) {
        fl(l, l.return, u);
      }
    }
  }
  function $d(l, t, a) {
    a.props = Xa(
      l.type,
      l.memoizedProps
    ), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (u) {
      fl(l, t, u);
    }
  }
  function ne(l, t) {
    try {
      var a = l.ref;
      if (a !== null) {
        switch (l.tag) {
          case 26:
          case 27:
          case 5:
            var u = l.stateNode;
            break;
          case 30:
            u = l.stateNode;
            break;
          default:
            u = l.stateNode;
        }
        typeof a == "function" ? l.refCleanup = a(u) : a.current = u;
      }
    } catch (e) {
      fl(l, t, e);
    }
  }
  function Ht(l, t) {
    var a = l.ref, u = l.refCleanup;
    if (a !== null)
      if (typeof u == "function")
        try {
          u();
        } catch (e) {
          fl(l, t, e);
        } finally {
          l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
        }
      else if (typeof a == "function")
        try {
          a(null);
        } catch (e) {
          fl(l, t, e);
        }
      else a.current = null;
  }
  function kd(l) {
    var t = l.type, a = l.memoizedProps, u = l.stateNode;
    try {
      l: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          a.autoFocus && u.focus();
          break l;
        case "img":
          a.src ? u.src = a.src : a.srcSet && (u.srcset = a.srcSet);
      }
    } catch (e) {
      fl(l, l.return, e);
    }
  }
  function zf(l, t, a) {
    try {
      var u = l.stateNode;
      Hy(u, l.type, a, t), u[$l] = t;
    } catch (e) {
      fl(l, l.return, e);
    }
  }
  function Fd(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && ga(l.type) || l.tag === 4;
  }
  function pf(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Fd(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && ga(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function Tf(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6)
      l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = jt));
    else if (u !== 4 && (u === 27 && ga(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null))
      for (Tf(l, t, a), l = l.sibling; l !== null; )
        Tf(l, t, a), l = l.sibling;
  }
  function mn(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6)
      l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (u !== 4 && (u === 27 && ga(l.type) && (a = l.stateNode), l = l.child, l !== null))
      for (mn(l, t, a), l = l.sibling; l !== null; )
        mn(l, t, a), l = l.sibling;
  }
  function Id(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var u = l.type, e = t.attributes; e.length; )
        t.removeAttributeNode(e[0]);
      Zl(t, u, a), t[Yl] = l, t[$l] = a;
    } catch (n) {
      fl(l, l.return, n);
    }
  }
  var Kt = !1, Nl = !1, Ef = !1, Pd = typeof WeakSet == "function" ? WeakSet : Set, ql = null;
  function dy(l, t) {
    if (l = l.containerInfo, Lf = jn, l = os(l), ri(l)) {
      if ("selectionStart" in l)
        var a = {
          start: l.selectionStart,
          end: l.selectionEnd
        };
      else
        l: {
          a = (a = l.ownerDocument) && a.defaultView || window;
          var u = a.getSelection && a.getSelection();
          if (u && u.rangeCount !== 0) {
            a = u.anchorNode;
            var e = u.anchorOffset, n = u.focusNode;
            u = u.focusOffset;
            try {
              a.nodeType, n.nodeType;
            } catch {
              a = null;
              break l;
            }
            var i = 0, f = -1, c = -1, m = 0, g = 0, p = l, r = null;
            t: for (; ; ) {
              for (var h; p !== a || e !== 0 && p.nodeType !== 3 || (f = i + e), p !== n || u !== 0 && p.nodeType !== 3 || (c = i + u), p.nodeType === 3 && (i += p.nodeValue.length), (h = p.firstChild) !== null; )
                r = p, p = h;
              for (; ; ) {
                if (p === l) break t;
                if (r === a && ++m === e && (f = i), r === n && ++g === u && (c = i), (h = p.nextSibling) !== null) break;
                p = r, r = p.parentNode;
              }
              p = h;
            }
            a = f === -1 || c === -1 ? null : { start: f, end: c };
          } else a = null;
        }
      a = a || { start: 0, end: 0 };
    } else a = null;
    for (Kf = { focusedElem: l, selectionRange: a }, jn = !1, ql = t; ql !== null; )
      if (t = ql, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null)
        l.return = t, ql = l;
      else
        for (; ql !== null; ) {
          switch (t = ql, n = t.alternate, l = t.flags, t.tag) {
            case 0:
              if ((l & 4) !== 0 && (l = t.updateQueue, l = l !== null ? l.events : null, l !== null))
                for (a = 0; a < l.length; a++)
                  e = l[a], e.ref.impl = e.nextImpl;
              break;
            case 11:
            case 15:
              break;
            case 1:
              if ((l & 1024) !== 0 && n !== null) {
                l = void 0, a = t, e = n.memoizedProps, n = n.memoizedState, u = a.stateNode;
                try {
                  var D = Xa(
                    a.type,
                    e
                  );
                  l = u.getSnapshotBeforeUpdate(
                    D,
                    n
                  ), u.__reactInternalSnapshotBeforeUpdate = l;
                } catch (j) {
                  fl(
                    a,
                    a.return,
                    j
                  );
                }
              }
              break;
            case 3:
              if ((l & 1024) !== 0) {
                if (l = t.stateNode.containerInfo, a = l.nodeType, a === 9)
                  Wf(l);
                else if (a === 1)
                  switch (l.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      Wf(l);
                      break;
                    default:
                      l.textContent = "";
                  }
              }
              break;
            case 5:
            case 26:
            case 27:
            case 6:
            case 4:
            case 17:
              break;
            default:
              if ((l & 1024) !== 0) throw Error(v(163));
          }
          if (l = t.sibling, l !== null) {
            l.return = t.return, ql = l;
            break;
          }
          ql = t.return;
        }
  }
  function lo(l, t, a) {
    var u = a.flags;
    switch (a.tag) {
      case 0:
      case 11:
      case 15:
        wt(l, a), u & 4 && ee(5, a);
        break;
      case 1:
        if (wt(l, a), u & 4)
          if (l = a.stateNode, t === null)
            try {
              l.componentDidMount();
            } catch (i) {
              fl(a, a.return, i);
            }
          else {
            var e = Xa(
              a.type,
              t.memoizedProps
            );
            t = t.memoizedState;
            try {
              l.componentDidUpdate(
                e,
                t,
                l.__reactInternalSnapshotBeforeUpdate
              );
            } catch (i) {
              fl(
                a,
                a.return,
                i
              );
            }
          }
        u & 64 && Wd(a), u & 512 && ne(a, a.return);
        break;
      case 3:
        if (wt(l, a), u & 64 && (l = a.updateQueue, l !== null)) {
          if (t = null, a.child !== null)
            switch (a.child.tag) {
              case 27:
              case 5:
                t = a.child.stateNode;
                break;
              case 1:
                t = a.child.stateNode;
            }
          try {
            Ys(l, t);
          } catch (i) {
            fl(a, a.return, i);
          }
        }
        break;
      case 27:
        t === null && u & 4 && Id(a);
      case 26:
      case 5:
        wt(l, a), t === null && u & 4 && kd(a), u & 512 && ne(a, a.return);
        break;
      case 12:
        wt(l, a);
        break;
      case 31:
        wt(l, a), u & 4 && uo(l, a);
        break;
      case 13:
        wt(l, a), u & 4 && eo(l, a), u & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = by.bind(
          null,
          a
        ), Gy(l, a))));
        break;
      case 22:
        if (u = a.memoizedState !== null || Kt, !u) {
          t = t !== null && t.memoizedState !== null || Nl, e = Kt;
          var n = Nl;
          Kt = u, (Nl = t) && !n ? Wt(
            l,
            a,
            (a.subtreeFlags & 8772) !== 0
          ) : wt(l, a), Kt = e, Nl = n;
        }
        break;
      case 30:
        break;
      default:
        wt(l, a);
    }
  }
  function to(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, to(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && In(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var hl = null, Fl = !1;
  function Jt(l, t, a) {
    for (a = a.child; a !== null; )
      ao(l, t, a), a = a.sibling;
  }
  function ao(l, t, a) {
    if (et && typeof et.onCommitFiberUnmount == "function")
      try {
        et.onCommitFiberUnmount(Ou, a);
      } catch {
      }
    switch (a.tag) {
      case 26:
        Nl || Ht(a, t), Jt(
          l,
          t,
          a
        ), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        Nl || Ht(a, t);
        var u = hl, e = Fl;
        ga(a.type) && (hl = a.stateNode, Fl = !1), Jt(
          l,
          t,
          a
        ), me(a.stateNode), hl = u, Fl = e;
        break;
      case 5:
        Nl || Ht(a, t);
      case 6:
        if (u = hl, e = Fl, hl = null, Jt(
          l,
          t,
          a
        ), hl = u, Fl = e, hl !== null)
          if (Fl)
            try {
              (hl.nodeType === 9 ? hl.body : hl.nodeName === "HTML" ? hl.ownerDocument.body : hl).removeChild(a.stateNode);
            } catch (n) {
              fl(
                a,
                t,
                n
              );
            }
          else
            try {
              hl.removeChild(a.stateNode);
            } catch (n) {
              fl(
                a,
                t,
                n
              );
            }
        break;
      case 18:
        hl !== null && (Fl ? (l = hl, $o(
          l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l,
          a.stateNode
        ), xu(l)) : $o(hl, a.stateNode));
        break;
      case 4:
        u = hl, e = Fl, hl = a.stateNode.containerInfo, Fl = !0, Jt(
          l,
          t,
          a
        ), hl = u, Fl = e;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        da(2, a, t), Nl || da(4, a, t), Jt(
          l,
          t,
          a
        );
        break;
      case 1:
        Nl || (Ht(a, t), u = a.stateNode, typeof u.componentWillUnmount == "function" && $d(
          a,
          t,
          u
        )), Jt(
          l,
          t,
          a
        );
        break;
      case 21:
        Jt(
          l,
          t,
          a
        );
        break;
      case 22:
        Nl = (u = Nl) || a.memoizedState !== null, Jt(
          l,
          t,
          a
        ), Nl = u;
        break;
      default:
        Jt(
          l,
          t,
          a
        );
    }
  }
  function uo(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        xu(l);
      } catch (a) {
        fl(t, t.return, a);
      }
    }
  }
  function eo(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null))))
      try {
        xu(l);
      } catch (a) {
        fl(t, t.return, a);
      }
  }
  function oy(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Pd()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Pd()), t;
      default:
        throw Error(v(435, l.tag));
    }
  }
  function rn(l, t) {
    var a = oy(l);
    t.forEach(function(u) {
      if (!a.has(u)) {
        a.add(u);
        var e = zy.bind(null, l, u);
        u.then(e, e);
      }
    });
  }
  function Il(l, t) {
    var a = t.deletions;
    if (a !== null)
      for (var u = 0; u < a.length; u++) {
        var e = a[u], n = l, i = t, f = i;
        l: for (; f !== null; ) {
          switch (f.tag) {
            case 27:
              if (ga(f.type)) {
                hl = f.stateNode, Fl = !1;
                break l;
              }
              break;
            case 5:
              hl = f.stateNode, Fl = !1;
              break l;
            case 3:
            case 4:
              hl = f.stateNode.containerInfo, Fl = !0;
              break l;
          }
          f = f.return;
        }
        if (hl === null) throw Error(v(160));
        ao(n, i, e), hl = null, Fl = !1, n = e.alternate, n !== null && (n.return = null), e.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        no(t, l), t = t.sibling;
  }
  var _t = null;
  function no(l, t) {
    var a = l.alternate, u = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Il(t, l), Pl(l), u & 4 && (da(3, l, l.return), ee(3, l), da(5, l, l.return));
        break;
      case 1:
        Il(t, l), Pl(l), u & 512 && (Nl || a === null || Ht(a, a.return)), u & 64 && Kt && (l = l.updateQueue, l !== null && (u = l.callbacks, u !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? u : a.concat(u))));
        break;
      case 26:
        var e = _t;
        if (Il(t, l), Pl(l), u & 512 && (Nl || a === null || Ht(a, a.return)), u & 4) {
          var n = a !== null ? a.memoizedState : null;
          if (u = l.memoizedState, a === null)
            if (u === null)
              if (l.stateNode === null) {
                l: {
                  u = l.type, a = l.memoizedProps, e = e.ownerDocument || e;
                  t: switch (u) {
                    case "title":
                      n = e.getElementsByTagName("title")[0], (!n || n[Cu] || n[Yl] || n.namespaceURI === "http://www.w3.org/2000/svg" || n.hasAttribute("itemprop")) && (n = e.createElement(u), e.head.insertBefore(
                        n,
                        e.querySelector("head > title")
                      )), Zl(n, u, a), n[Yl] = l, Bl(n), u = n;
                      break l;
                    case "link":
                      var i = i0(
                        "link",
                        "href",
                        e
                      ).get(u + (a.href || ""));
                      if (i) {
                        for (var f = 0; f < i.length; f++)
                          if (n = i[f], n.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && n.getAttribute("rel") === (a.rel == null ? null : a.rel) && n.getAttribute("title") === (a.title == null ? null : a.title) && n.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                            i.splice(f, 1);
                            break t;
                          }
                      }
                      n = e.createElement(u), Zl(n, u, a), e.head.appendChild(n);
                      break;
                    case "meta":
                      if (i = i0(
                        "meta",
                        "content",
                        e
                      ).get(u + (a.content || ""))) {
                        for (f = 0; f < i.length; f++)
                          if (n = i[f], n.getAttribute("content") === (a.content == null ? null : "" + a.content) && n.getAttribute("name") === (a.name == null ? null : a.name) && n.getAttribute("property") === (a.property == null ? null : a.property) && n.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && n.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                            i.splice(f, 1);
                            break t;
                          }
                      }
                      n = e.createElement(u), Zl(n, u, a), e.head.appendChild(n);
                      break;
                    default:
                      throw Error(v(468, u));
                  }
                  n[Yl] = l, Bl(n), u = n;
                }
                l.stateNode = u;
              } else
                f0(
                  e,
                  l.type,
                  l.stateNode
                );
            else
              l.stateNode = n0(
                e,
                u,
                l.memoizedProps
              );
          else
            n !== u ? (n === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : n.count--, u === null ? f0(
              e,
              l.type,
              l.stateNode
            ) : n0(
              e,
              u,
              l.memoizedProps
            )) : u === null && l.stateNode !== null && zf(
              l,
              l.memoizedProps,
              a.memoizedProps
            );
        }
        break;
      case 27:
        Il(t, l), Pl(l), u & 512 && (Nl || a === null || Ht(a, a.return)), a !== null && u & 4 && zf(
          l,
          l.memoizedProps,
          a.memoizedProps
        );
        break;
      case 5:
        if (Il(t, l), Pl(l), u & 512 && (Nl || a === null || Ht(a, a.return)), l.flags & 32) {
          e = l.stateNode;
          try {
            ka(e, "");
          } catch (D) {
            fl(l, l.return, D);
          }
        }
        u & 4 && l.stateNode != null && (e = l.memoizedProps, zf(
          l,
          e,
          a !== null ? a.memoizedProps : e
        )), u & 1024 && (Ef = !0);
        break;
      case 6:
        if (Il(t, l), Pl(l), u & 4) {
          if (l.stateNode === null)
            throw Error(v(162));
          u = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = u;
          } catch (D) {
            fl(l, l.return, D);
          }
        }
        break;
      case 3:
        if (Hn = null, e = _t, _t = On(t.containerInfo), Il(t, l), _t = e, Pl(l), u & 4 && a !== null && a.memoizedState.isDehydrated)
          try {
            xu(t.containerInfo);
          } catch (D) {
            fl(l, l.return, D);
          }
        Ef && (Ef = !1, io(l));
        break;
      case 4:
        u = _t, _t = On(
          l.stateNode.containerInfo
        ), Il(t, l), Pl(l), _t = u;
        break;
      case 12:
        Il(t, l), Pl(l);
        break;
      case 31:
        Il(t, l), Pl(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, rn(l, u)));
        break;
      case 13:
        Il(t, l), Pl(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (gn = ut()), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, rn(l, u)));
        break;
      case 22:
        e = l.memoizedState !== null;
        var c = a !== null && a.memoizedState !== null, m = Kt, g = Nl;
        if (Kt = m || e, Nl = g || c, Il(t, l), Nl = g, Kt = m, Pl(l), u & 8192)
          l: for (t = l.stateNode, t._visibility = e ? t._visibility & -2 : t._visibility | 1, e && (a === null || c || Kt || Nl || Qa(l)), a = null, t = l; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (a === null) {
                c = a = t;
                try {
                  if (n = c.stateNode, e)
                    i = n.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none";
                  else {
                    f = c.stateNode;
                    var p = c.memoizedProps.style, r = p != null && p.hasOwnProperty("display") ? p.display : null;
                    f.style.display = r == null || typeof r == "boolean" ? "" : ("" + r).trim();
                  }
                } catch (D) {
                  fl(c, c.return, D);
                }
              }
            } else if (t.tag === 6) {
              if (a === null) {
                c = t;
                try {
                  c.stateNode.nodeValue = e ? "" : c.memoizedProps;
                } catch (D) {
                  fl(c, c.return, D);
                }
              }
            } else if (t.tag === 18) {
              if (a === null) {
                c = t;
                try {
                  var h = c.stateNode;
                  e ? ko(h, !0) : ko(c.stateNode, !1);
                } catch (D) {
                  fl(c, c.return, D);
                }
              }
            } else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === l) && t.child !== null) {
              t.child.return = t, t = t.child;
              continue;
            }
            if (t === l) break l;
            for (; t.sibling === null; ) {
              if (t.return === null || t.return === l) break l;
              a === t && (a = null), t = t.return;
            }
            a === t && (a = null), t.sibling.return = t.return, t = t.sibling;
          }
        u & 4 && (u = l.updateQueue, u !== null && (a = u.retryQueue, a !== null && (u.retryQueue = null, rn(l, a))));
        break;
      case 19:
        Il(t, l), Pl(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, rn(l, u)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        Il(t, l), Pl(l);
    }
  }
  function Pl(l) {
    var t = l.flags;
    if (t & 2) {
      try {
        for (var a, u = l.return; u !== null; ) {
          if (Fd(u)) {
            a = u;
            break;
          }
          u = u.return;
        }
        if (a == null) throw Error(v(160));
        switch (a.tag) {
          case 27:
            var e = a.stateNode, n = pf(l);
            mn(l, n, e);
            break;
          case 5:
            var i = a.stateNode;
            a.flags & 32 && (ka(i, ""), a.flags &= -33);
            var f = pf(l);
            mn(l, f, i);
            break;
          case 3:
          case 4:
            var c = a.stateNode.containerInfo, m = pf(l);
            Tf(
              l,
              m,
              c
            );
            break;
          default:
            throw Error(v(161));
        }
      } catch (g) {
        fl(l, l.return, g);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function io(l) {
    if (l.subtreeFlags & 1024)
      for (l = l.child; l !== null; ) {
        var t = l;
        io(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
      }
  }
  function wt(l, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        lo(l, t.alternate, t), t = t.sibling;
  }
  function Qa(l) {
    for (l = l.child; l !== null; ) {
      var t = l;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          da(4, t, t.return), Qa(t);
          break;
        case 1:
          Ht(t, t.return);
          var a = t.stateNode;
          typeof a.componentWillUnmount == "function" && $d(
            t,
            t.return,
            a
          ), Qa(t);
          break;
        case 27:
          me(t.stateNode);
        case 26:
        case 5:
          Ht(t, t.return), Qa(t);
          break;
        case 22:
          t.memoizedState === null && Qa(t);
          break;
        case 30:
          Qa(t);
          break;
        default:
          Qa(t);
      }
      l = l.sibling;
    }
  }
  function Wt(l, t, a) {
    for (a = a && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var u = t.alternate, e = l, n = t, i = n.flags;
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          Wt(
            e,
            n,
            a
          ), ee(4, n);
          break;
        case 1:
          if (Wt(
            e,
            n,
            a
          ), u = n, e = u.stateNode, typeof e.componentDidMount == "function")
            try {
              e.componentDidMount();
            } catch (m) {
              fl(u, u.return, m);
            }
          if (u = n, e = u.updateQueue, e !== null) {
            var f = u.stateNode;
            try {
              var c = e.shared.hiddenCallbacks;
              if (c !== null)
                for (e.shared.hiddenCallbacks = null, e = 0; e < c.length; e++)
                  qs(c[e], f);
            } catch (m) {
              fl(u, u.return, m);
            }
          }
          a && i & 64 && Wd(n), ne(n, n.return);
          break;
        case 27:
          Id(n);
        case 26:
        case 5:
          Wt(
            e,
            n,
            a
          ), a && u === null && i & 4 && kd(n), ne(n, n.return);
          break;
        case 12:
          Wt(
            e,
            n,
            a
          );
          break;
        case 31:
          Wt(
            e,
            n,
            a
          ), a && i & 4 && uo(e, n);
          break;
        case 13:
          Wt(
            e,
            n,
            a
          ), a && i & 4 && eo(e, n);
          break;
        case 22:
          n.memoizedState === null && Wt(
            e,
            n,
            a
          ), ne(n, n.return);
          break;
        case 30:
          break;
        default:
          Wt(
            e,
            n,
            a
          );
      }
      t = t.sibling;
    }
  }
  function Af(l, t) {
    var a = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== a && (l != null && l.refCount++, a != null && Ku(a));
  }
  function _f(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Ku(l));
  }
  function Mt(l, t, a, u) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        fo(
          l,
          t,
          a,
          u
        ), t = t.sibling;
  }
  function fo(l, t, a, u) {
    var e = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Mt(
          l,
          t,
          a,
          u
        ), e & 2048 && ee(9, t);
        break;
      case 1:
        Mt(
          l,
          t,
          a,
          u
        );
        break;
      case 3:
        Mt(
          l,
          t,
          a,
          u
        ), e & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Ku(l)));
        break;
      case 12:
        if (e & 2048) {
          Mt(
            l,
            t,
            a,
            u
          ), l = t.stateNode;
          try {
            var n = t.memoizedProps, i = n.id, f = n.onPostCommit;
            typeof f == "function" && f(
              i,
              t.alternate === null ? "mount" : "update",
              l.passiveEffectDuration,
              -0
            );
          } catch (c) {
            fl(t, t.return, c);
          }
        } else
          Mt(
            l,
            t,
            a,
            u
          );
        break;
      case 31:
        Mt(
          l,
          t,
          a,
          u
        );
        break;
      case 13:
        Mt(
          l,
          t,
          a,
          u
        );
        break;
      case 23:
        break;
      case 22:
        n = t.stateNode, i = t.alternate, t.memoizedState !== null ? n._visibility & 2 ? Mt(
          l,
          t,
          a,
          u
        ) : ie(l, t) : n._visibility & 2 ? Mt(
          l,
          t,
          a,
          u
        ) : (n._visibility |= 2, hu(
          l,
          t,
          a,
          u,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), e & 2048 && Af(i, t);
        break;
      case 24:
        Mt(
          l,
          t,
          a,
          u
        ), e & 2048 && _f(t.alternate, t);
        break;
      default:
        Mt(
          l,
          t,
          a,
          u
        );
    }
  }
  function hu(l, t, a, u, e) {
    for (e = e && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var n = l, i = t, f = a, c = u, m = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          hu(
            n,
            i,
            f,
            c,
            e
          ), ee(8, i);
          break;
        case 23:
          break;
        case 22:
          var g = i.stateNode;
          i.memoizedState !== null ? g._visibility & 2 ? hu(
            n,
            i,
            f,
            c,
            e
          ) : ie(
            n,
            i
          ) : (g._visibility |= 2, hu(
            n,
            i,
            f,
            c,
            e
          )), e && m & 2048 && Af(
            i.alternate,
            i
          );
          break;
        case 24:
          hu(
            n,
            i,
            f,
            c,
            e
          ), e && m & 2048 && _f(i.alternate, i);
          break;
        default:
          hu(
            n,
            i,
            f,
            c,
            e
          );
      }
      t = t.sibling;
    }
  }
  function ie(l, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var a = l, u = t, e = u.flags;
        switch (u.tag) {
          case 22:
            ie(a, u), e & 2048 && Af(
              u.alternate,
              u
            );
            break;
          case 24:
            ie(a, u), e & 2048 && _f(u.alternate, u);
            break;
          default:
            ie(a, u);
        }
        t = t.sibling;
      }
  }
  var fe = 8192;
  function gu(l, t, a) {
    if (l.subtreeFlags & fe)
      for (l = l.child; l !== null; )
        co(
          l,
          t,
          a
        ), l = l.sibling;
  }
  function co(l, t, a) {
    switch (l.tag) {
      case 26:
        gu(
          l,
          t,
          a
        ), l.flags & fe && l.memoizedState !== null && Fy(
          a,
          _t,
          l.memoizedState,
          l.memoizedProps
        );
        break;
      case 5:
        gu(
          l,
          t,
          a
        );
        break;
      case 3:
      case 4:
        var u = _t;
        _t = On(l.stateNode.containerInfo), gu(
          l,
          t,
          a
        ), _t = u;
        break;
      case 22:
        l.memoizedState === null && (u = l.alternate, u !== null && u.memoizedState !== null ? (u = fe, fe = 16777216, gu(
          l,
          t,
          a
        ), fe = u) : gu(
          l,
          t,
          a
        ));
        break;
      default:
        gu(
          l,
          t,
          a
        );
    }
  }
  function so(l) {
    var t = l.alternate;
    if (t !== null && (l = t.child, l !== null)) {
      t.child = null;
      do
        t = l.sibling, l.sibling = null, l = t;
      while (l !== null);
    }
  }
  function ce(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var a = 0; a < t.length; a++) {
          var u = t[a];
          ql = u, vo(
            u,
            l
          );
        }
      so(l);
    }
    if (l.subtreeFlags & 10256)
      for (l = l.child; l !== null; )
        oo(l), l = l.sibling;
  }
  function oo(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        ce(l), l.flags & 2048 && da(9, l, l.return);
        break;
      case 3:
        ce(l);
        break;
      case 12:
        ce(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, hn(l)) : ce(l);
        break;
      default:
        ce(l);
    }
  }
  function hn(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var a = 0; a < t.length; a++) {
          var u = t[a];
          ql = u, vo(
            u,
            l
          );
        }
      so(l);
    }
    for (l = l.child; l !== null; ) {
      switch (t = l, t.tag) {
        case 0:
        case 11:
        case 15:
          da(8, t, t.return), hn(t);
          break;
        case 22:
          a = t.stateNode, a._visibility & 2 && (a._visibility &= -3, hn(t));
          break;
        default:
          hn(t);
      }
      l = l.sibling;
    }
  }
  function vo(l, t) {
    for (; ql !== null; ) {
      var a = ql;
      switch (a.tag) {
        case 0:
        case 11:
        case 15:
          da(8, a, t);
          break;
        case 23:
        case 22:
          if (a.memoizedState !== null && a.memoizedState.cachePool !== null) {
            var u = a.memoizedState.cachePool.pool;
            u != null && u.refCount++;
          }
          break;
        case 24:
          Ku(a.memoizedState.cache);
      }
      if (u = a.child, u !== null) u.return = a, ql = u;
      else
        l: for (a = l; ql !== null; ) {
          u = ql;
          var e = u.sibling, n = u.return;
          if (to(u), u === a) {
            ql = null;
            break l;
          }
          if (e !== null) {
            e.return = n, ql = e;
            break l;
          }
          ql = n;
        }
    }
  }
  var vy = {
    getCacheForType: function(l) {
      var t = Xl(Ul), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Xl(Ul).controller.signal;
    }
  }, yy = typeof WeakMap == "function" ? WeakMap : Map, ul = 0, yl = null, W = null, k = 0, il = 0, dt = null, oa = !1, Su = !1, Mf = !1, $t = 0, Tl = 0, va = 0, Za = 0, xf = 0, ot = 0, bu = 0, se = null, lt = null, Df = !1, gn = 0, yo = 0, Sn = 1 / 0, bn = null, ya = null, jl = 0, ma = null, zu = null, kt = 0, Of = 0, Uf = null, mo = null, de = 0, Hf = null;
  function vt() {
    return (ul & 2) !== 0 && k !== 0 ? k & -k : S.T !== null ? qf() : Oc();
  }
  function ro() {
    if (ot === 0)
      if ((k & 536870912) === 0 || P) {
        var l = Me;
        Me <<= 1, (Me & 3932160) === 0 && (Me = 262144), ot = l;
      } else ot = 536870912;
    return l = ct.current, l !== null && (l.flags |= 32), ot;
  }
  function tt(l, t, a) {
    (l === yl && (il === 2 || il === 9) || l.cancelPendingCommit !== null) && (pu(l, 0), ra(
      l,
      k,
      ot,
      !1
    )), Hu(l, a), ((ul & 2) === 0 || l !== yl) && (l === yl && ((ul & 2) === 0 && (Za |= a), Tl === 4 && ra(
      l,
      k,
      ot,
      !1
    )), Ct(l));
  }
  function ho(l, t, a) {
    if ((ul & 6) !== 0) throw Error(v(327));
    var u = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || Uu(l, t), e = u ? hy(l, t) : Nf(l, t, !0), n = u;
    do {
      if (e === 0) {
        Su && !u && ra(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, n && !my(a)) {
          e = Nf(l, t, !1), n = !1;
          continue;
        }
        if (e === 2) {
          if (n = t, l.errorRecoveryDisabledLanes & n)
            var i = 0;
          else
            i = l.pendingLanes & -536870913, i = i !== 0 ? i : i & 536870912 ? 536870912 : 0;
          if (i !== 0) {
            t = i;
            l: {
              var f = l;
              e = se;
              var c = f.current.memoizedState.isDehydrated;
              if (c && (pu(f, i).flags |= 256), i = Nf(
                f,
                i,
                !1
              ), i !== 2) {
                if (Mf && !c) {
                  f.errorRecoveryDisabledLanes |= n, Za |= n, e = 4;
                  break l;
                }
                n = lt, lt = e, n !== null && (lt === null ? lt = n : lt.push.apply(
                  lt,
                  n
                ));
              }
              e = i;
            }
            if (n = !1, e !== 2) continue;
          }
        }
        if (e === 1) {
          pu(l, 0), ra(l, t, 0, !0);
          break;
        }
        l: {
          switch (u = l, n = e, n) {
            case 0:
            case 1:
              throw Error(v(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              ra(
                u,
                t,
                ot,
                !oa
              );
              break l;
            case 2:
              lt = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(v(329));
          }
          if ((t & 62914560) === t && (e = gn + 300 - ut(), 10 < e)) {
            if (ra(
              u,
              t,
              ot,
              !oa
            ), De(u, 0, !0) !== 0) break l;
            kt = t, u.timeoutHandle = wo(
              go.bind(
                null,
                u,
                a,
                lt,
                bn,
                Df,
                t,
                ot,
                Za,
                bu,
                oa,
                n,
                "Throttled",
                -0,
                0
              ),
              e
            );
            break l;
          }
          go(
            u,
            a,
            lt,
            bn,
            Df,
            t,
            ot,
            Za,
            bu,
            oa,
            n,
            null,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    Ct(l);
  }
  function go(l, t, a, u, e, n, i, f, c, m, g, p, r, h) {
    if (l.timeoutHandle = -1, p = t.subtreeFlags, p & 8192 || (p & 16785408) === 16785408) {
      p = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: jt
      }, co(
        t,
        n,
        p
      );
      var D = (n & 62914560) === n ? gn - ut() : (n & 4194048) === n ? yo - ut() : 0;
      if (D = Iy(
        p,
        D
      ), D !== null) {
        kt = n, l.cancelPendingCommit = D(
          _o.bind(
            null,
            l,
            t,
            n,
            a,
            u,
            e,
            i,
            f,
            c,
            g,
            p,
            null,
            r,
            h
          )
        ), ra(l, n, i, !m);
        return;
      }
    }
    _o(
      l,
      t,
      n,
      a,
      u,
      e,
      i,
      f,
      c
    );
  }
  function my(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null)))
        for (var u = 0; u < a.length; u++) {
          var e = a[u], n = e.getSnapshot;
          e = e.value;
          try {
            if (!it(n(), e)) return !1;
          } catch {
            return !1;
          }
        }
      if (a = t.child, t.subtreeFlags & 16384 && a !== null)
        a.return = t, t = a;
      else {
        if (t === l) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === l) return !0;
          t = t.return;
        }
        t.sibling.return = t.return, t = t.sibling;
      }
    }
    return !0;
  }
  function ra(l, t, a, u) {
    t &= ~xf, t &= ~Za, l.suspendedLanes |= t, l.pingedLanes &= ~t, u && (l.warmLanes |= t), u = l.expirationTimes;
    for (var e = t; 0 < e; ) {
      var n = 31 - nt(e), i = 1 << n;
      u[n] = -1, e &= ~i;
    }
    a !== 0 && Mc(l, a, t);
  }
  function zn() {
    return (ul & 6) === 0 ? (oe(0), !1) : !0;
  }
  function Cf() {
    if (W !== null) {
      if (il === 0)
        var l = W.return;
      else
        l = W, Gt = Na = null, wi(l), ou = null, wu = 0, l = W;
      for (; l !== null; )
        wd(l.alternate, l), l = l.return;
      W = null;
    }
  }
  function pu(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, Ry(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), kt = 0, Cf(), yl = l, W = a = qt(l.current, null), k = t, il = 0, dt = null, oa = !1, Su = Uu(l, t), Mf = !1, bu = ot = xf = Za = va = Tl = 0, lt = se = null, Df = !1, (t & 8) !== 0 && (t |= t & 32);
    var u = l.entangledLanes;
    if (u !== 0)
      for (l = l.entanglements, u &= t; 0 < u; ) {
        var e = 31 - nt(u), n = 1 << e;
        t |= l[e], u &= ~n;
      }
    return $t = t, Xe(), a;
  }
  function So(l, t) {
    Z = null, S.H = te, t === du || t === We ? (t = Ns(), il = 3) : t === ji ? (t = Ns(), il = 4) : il = t === df ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, dt = t, W === null && (Tl = 1, sn(
      l,
      ht(t, l.current)
    ));
  }
  function bo() {
    var l = ct.current;
    return l === null ? !0 : (k & 4194048) === k ? zt === null : (k & 62914560) === k || (k & 536870912) !== 0 ? l === zt : !1;
  }
  function zo() {
    var l = S.H;
    return S.H = te, l === null ? te : l;
  }
  function po() {
    var l = S.A;
    return S.A = vy, l;
  }
  function pn() {
    Tl = 4, oa || (k & 4194048) !== k && ct.current !== null || (Su = !0), (va & 134217727) === 0 && (Za & 134217727) === 0 || yl === null || ra(
      yl,
      k,
      ot,
      !1
    );
  }
  function Nf(l, t, a) {
    var u = ul;
    ul |= 2;
    var e = zo(), n = po();
    (yl !== l || k !== t) && (bn = null, pu(l, t)), t = !1;
    var i = Tl;
    l: do
      try {
        if (il !== 0 && W !== null) {
          var f = W, c = dt;
          switch (il) {
            case 8:
              Cf(), i = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              ct.current === null && (t = !0);
              var m = il;
              if (il = 0, dt = null, Tu(l, f, c, m), a && Su) {
                i = 0;
                break l;
              }
              break;
            default:
              m = il, il = 0, dt = null, Tu(l, f, c, m);
          }
        }
        ry(), i = Tl;
        break;
      } catch (g) {
        So(l, g);
      }
    while (!0);
    return t && l.shellSuspendCounter++, Gt = Na = null, ul = u, S.H = e, S.A = n, W === null && (yl = null, k = 0, Xe()), i;
  }
  function ry() {
    for (; W !== null; ) To(W);
  }
  function hy(l, t) {
    var a = ul;
    ul |= 2;
    var u = zo(), e = po();
    yl !== l || k !== t ? (bn = null, Sn = ut() + 500, pu(l, t)) : Su = Uu(
      l,
      t
    );
    l: do
      try {
        if (il !== 0 && W !== null) {
          t = W;
          var n = dt;
          t: switch (il) {
            case 1:
              il = 0, dt = null, Tu(l, t, n, 1);
              break;
            case 2:
            case 9:
              if (Hs(n)) {
                il = 0, dt = null, Eo(t);
                break;
              }
              t = function() {
                il !== 2 && il !== 9 || yl !== l || (il = 7), Ct(l);
              }, n.then(t, t);
              break l;
            case 3:
              il = 7;
              break l;
            case 4:
              il = 5;
              break l;
            case 7:
              Hs(n) ? (il = 0, dt = null, Eo(t)) : (il = 0, dt = null, Tu(l, t, n, 7));
              break;
            case 5:
              var i = null;
              switch (W.tag) {
                case 26:
                  i = W.memoizedState;
                case 5:
                case 27:
                  var f = W;
                  if (i ? c0(i) : f.stateNode.complete) {
                    il = 0, dt = null;
                    var c = f.sibling;
                    if (c !== null) W = c;
                    else {
                      var m = f.return;
                      m !== null ? (W = m, Tn(m)) : W = null;
                    }
                    break t;
                  }
              }
              il = 0, dt = null, Tu(l, t, n, 5);
              break;
            case 6:
              il = 0, dt = null, Tu(l, t, n, 6);
              break;
            case 8:
              Cf(), Tl = 6;
              break l;
            default:
              throw Error(v(462));
          }
        }
        gy();
        break;
      } catch (g) {
        So(l, g);
      }
    while (!0);
    return Gt = Na = null, S.H = u, S.A = e, ul = a, W !== null ? 0 : (yl = null, k = 0, Xe(), Tl);
  }
  function gy() {
    for (; W !== null && !X0(); )
      To(W);
  }
  function To(l) {
    var t = Kd(l.alternate, l, $t);
    l.memoizedProps = l.pendingProps, t === null ? Tn(l) : W = t;
  }
  function Eo(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Gd(
          a,
          t,
          t.pendingProps,
          t.type,
          void 0,
          k
        );
        break;
      case 11:
        t = Gd(
          a,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          k
        );
        break;
      case 5:
        wi(t);
      default:
        wd(a, t), t = W = zs(t, $t), t = Kd(a, t, $t);
    }
    l.memoizedProps = l.pendingProps, t === null ? Tn(l) : W = t;
  }
  function Tu(l, t, a, u) {
    Gt = Na = null, wi(t), ou = null, wu = 0;
    var e = t.return;
    try {
      if (ny(
        l,
        e,
        t,
        a,
        k
      )) {
        Tl = 1, sn(
          l,
          ht(a, l.current)
        ), W = null;
        return;
      }
    } catch (n) {
      if (e !== null) throw W = e, n;
      Tl = 1, sn(
        l,
        ht(a, l.current)
      ), W = null;
      return;
    }
    t.flags & 32768 ? (P || u === 1 ? l = !0 : Su || (k & 536870912) !== 0 ? l = !1 : (oa = l = !0, (u === 2 || u === 9 || u === 3 || u === 6) && (u = ct.current, u !== null && u.tag === 13 && (u.flags |= 16384))), Ao(t, l)) : Tn(t);
  }
  function Tn(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        Ao(
          t,
          oa
        );
        return;
      }
      l = t.return;
      var a = cy(
        t.alternate,
        t,
        $t
      );
      if (a !== null) {
        W = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        W = t;
        return;
      }
      W = t = l;
    } while (t !== null);
    Tl === 0 && (Tl = 5);
  }
  function Ao(l, t) {
    do {
      var a = sy(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, W = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        W = l;
        return;
      }
      W = l = a;
    } while (l !== null);
    Tl = 6, W = null;
  }
  function _o(l, t, a, u, e, n, i, f, c) {
    l.cancelPendingCommit = null;
    do
      En();
    while (jl !== 0);
    if ((ul & 6) !== 0) throw Error(v(327));
    if (t !== null) {
      if (t === l.current) throw Error(v(177));
      if (n = t.lanes | t.childLanes, n |= zi, k0(
        l,
        a,
        n,
        i,
        f,
        c
      ), l === yl && (W = yl = null, k = 0), zu = t, ma = l, kt = a, Of = n, Uf = e, mo = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, py(Ae, function() {
        return Uo(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = S.T, S.T = null, e = A.p, A.p = 2, i = ul, ul |= 4;
        try {
          dy(l, t, a);
        } finally {
          ul = i, A.p = e, S.T = u;
        }
      }
      jl = 1, Mo(), xo(), Do();
    }
  }
  function Mo() {
    if (jl === 1) {
      jl = 0;
      var l = ma, t = zu, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = S.T, S.T = null;
        var u = A.p;
        A.p = 2;
        var e = ul;
        ul |= 4;
        try {
          no(t, l);
          var n = Kf, i = os(l.containerInfo), f = n.focusedElem, c = n.selectionRange;
          if (i !== f && f && f.ownerDocument && ds(
            f.ownerDocument.documentElement,
            f
          )) {
            if (c !== null && ri(f)) {
              var m = c.start, g = c.end;
              if (g === void 0 && (g = m), "selectionStart" in f)
                f.selectionStart = m, f.selectionEnd = Math.min(
                  g,
                  f.value.length
                );
              else {
                var p = f.ownerDocument || document, r = p && p.defaultView || window;
                if (r.getSelection) {
                  var h = r.getSelection(), D = f.textContent.length, j = Math.min(c.start, D), ol = c.end === void 0 ? j : Math.min(c.end, D);
                  !h.extend && j > ol && (i = ol, ol = j, j = i);
                  var o = ss(
                    f,
                    j
                  ), s = ss(
                    f,
                    ol
                  );
                  if (o && s && (h.rangeCount !== 1 || h.anchorNode !== o.node || h.anchorOffset !== o.offset || h.focusNode !== s.node || h.focusOffset !== s.offset)) {
                    var y = p.createRange();
                    y.setStart(o.node, o.offset), h.removeAllRanges(), j > ol ? (h.addRange(y), h.extend(s.node, s.offset)) : (y.setEnd(s.node, s.offset), h.addRange(y));
                  }
                }
              }
            }
            for (p = [], h = f; h = h.parentNode; )
              h.nodeType === 1 && p.push({
                element: h,
                left: h.scrollLeft,
                top: h.scrollTop
              });
            for (typeof f.focus == "function" && f.focus(), f = 0; f < p.length; f++) {
              var b = p[f];
              b.element.scrollLeft = b.left, b.element.scrollTop = b.top;
            }
          }
          jn = !!Lf, Kf = Lf = null;
        } finally {
          ul = e, A.p = u, S.T = a;
        }
      }
      l.current = t, jl = 2;
    }
  }
  function xo() {
    if (jl === 2) {
      jl = 0;
      var l = ma, t = zu, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = S.T, S.T = null;
        var u = A.p;
        A.p = 2;
        var e = ul;
        ul |= 4;
        try {
          lo(l, t.alternate, t);
        } finally {
          ul = e, A.p = u, S.T = a;
        }
      }
      jl = 3;
    }
  }
  function Do() {
    if (jl === 4 || jl === 3) {
      jl = 0, Q0();
      var l = ma, t = zu, a = kt, u = mo;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? jl = 5 : (jl = 0, zu = ma = null, Oo(l, l.pendingLanes));
      var e = l.pendingLanes;
      if (e === 0 && (ya = null), kn(a), t = t.stateNode, et && typeof et.onCommitFiberRoot == "function")
        try {
          et.onCommitFiberRoot(
            Ou,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (u !== null) {
        t = S.T, e = A.p, A.p = 2, S.T = null;
        try {
          for (var n = l.onRecoverableError, i = 0; i < u.length; i++) {
            var f = u[i];
            n(f.value, {
              componentStack: f.stack
            });
          }
        } finally {
          S.T = t, A.p = e;
        }
      }
      (kt & 3) !== 0 && En(), Ct(l), e = l.pendingLanes, (a & 261930) !== 0 && (e & 42) !== 0 ? l === Hf ? de++ : (de = 0, Hf = l) : de = 0, oe(0);
    }
  }
  function Oo(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Ku(t)));
  }
  function En() {
    return Mo(), xo(), Do(), Uo();
  }
  function Uo() {
    if (jl !== 5) return !1;
    var l = ma, t = Of;
    Of = 0;
    var a = kn(kt), u = S.T, e = A.p;
    try {
      A.p = 32 > a ? 32 : a, S.T = null, a = Uf, Uf = null;
      var n = ma, i = kt;
      if (jl = 0, zu = ma = null, kt = 0, (ul & 6) !== 0) throw Error(v(331));
      var f = ul;
      if (ul |= 4, oo(n.current), fo(
        n,
        n.current,
        i,
        a
      ), ul = f, oe(0, !1), et && typeof et.onPostCommitFiberRoot == "function")
        try {
          et.onPostCommitFiberRoot(Ou, n);
        } catch {
        }
      return !0;
    } finally {
      A.p = e, S.T = u, Oo(l, t);
    }
  }
  function Ho(l, t, a) {
    t = ht(a, t), t = sf(l.stateNode, t, 2), l = fa(l, t, 2), l !== null && (Hu(l, 2), Ct(l));
  }
  function fl(l, t, a) {
    if (l.tag === 3)
      Ho(l, l, a);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          Ho(
            t,
            l,
            a
          );
          break;
        } else if (t.tag === 1) {
          var u = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (ya === null || !ya.has(u))) {
            l = ht(a, l), a = Hd(2), u = fa(t, a, 2), u !== null && (Cd(
              a,
              u,
              t,
              l
            ), Hu(u, 2), Ct(u));
            break;
          }
        }
        t = t.return;
      }
  }
  function Rf(l, t, a) {
    var u = l.pingCache;
    if (u === null) {
      u = l.pingCache = new yy();
      var e = /* @__PURE__ */ new Set();
      u.set(t, e);
    } else
      e = u.get(t), e === void 0 && (e = /* @__PURE__ */ new Set(), u.set(t, e));
    e.has(a) || (Mf = !0, e.add(a), l = Sy.bind(null, l, t, a), t.then(l, l));
  }
  function Sy(l, t, a) {
    var u = l.pingCache;
    u !== null && u.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, yl === l && (k & a) === a && (Tl === 4 || Tl === 3 && (k & 62914560) === k && 300 > ut() - gn ? (ul & 2) === 0 && pu(l, 0) : xf |= a, bu === k && (bu = 0)), Ct(l);
  }
  function Co(l, t) {
    t === 0 && (t = _c()), l = Ua(l, t), l !== null && (Hu(l, t), Ct(l));
  }
  function by(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), Co(l, a);
  }
  function zy(l, t) {
    var a = 0;
    switch (l.tag) {
      case 31:
      case 13:
        var u = l.stateNode, e = l.memoizedState;
        e !== null && (a = e.retryLane);
        break;
      case 19:
        u = l.stateNode;
        break;
      case 22:
        u = l.stateNode._retryCache;
        break;
      default:
        throw Error(v(314));
    }
    u !== null && u.delete(t), Co(l, a);
  }
  function py(l, t) {
    return Jn(l, t);
  }
  var An = null, Eu = null, jf = !1, _n = !1, Bf = !1, ha = 0;
  function Ct(l) {
    l !== Eu && l.next === null && (Eu === null ? An = Eu = l : Eu = Eu.next = l), _n = !0, jf || (jf = !0, Ey());
  }
  function oe(l, t) {
    if (!Bf && _n) {
      Bf = !0;
      do
        for (var a = !1, u = An; u !== null; ) {
          if (l !== 0) {
            var e = u.pendingLanes;
            if (e === 0) var n = 0;
            else {
              var i = u.suspendedLanes, f = u.pingedLanes;
              n = (1 << 31 - nt(42 | l) + 1) - 1, n &= e & ~(i & ~f), n = n & 201326741 ? n & 201326741 | 1 : n ? n | 2 : 0;
            }
            n !== 0 && (a = !0, Bo(u, n));
          } else
            n = k, n = De(
              u,
              u === yl ? n : 0,
              u.cancelPendingCommit !== null || u.timeoutHandle !== -1
            ), (n & 3) === 0 || Uu(u, n) || (a = !0, Bo(u, n));
          u = u.next;
        }
      while (a);
      Bf = !1;
    }
  }
  function Ty() {
    No();
  }
  function No() {
    _n = jf = !1;
    var l = 0;
    ha !== 0 && Ny() && (l = ha);
    for (var t = ut(), a = null, u = An; u !== null; ) {
      var e = u.next, n = Ro(u, t);
      n === 0 ? (u.next = null, a === null ? An = e : a.next = e, e === null && (Eu = a)) : (a = u, (l !== 0 || (n & 3) !== 0) && (_n = !0)), u = e;
    }
    jl !== 0 && jl !== 5 || oe(l), ha !== 0 && (ha = 0);
  }
  function Ro(l, t) {
    for (var a = l.suspendedLanes, u = l.pingedLanes, e = l.expirationTimes, n = l.pendingLanes & -62914561; 0 < n; ) {
      var i = 31 - nt(n), f = 1 << i, c = e[i];
      c === -1 ? ((f & a) === 0 || (f & u) !== 0) && (e[i] = $0(f, t)) : c <= t && (l.expiredLanes |= f), n &= ~f;
    }
    if (t = yl, a = k, a = De(
      l,
      l === t ? a : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), u = l.callbackNode, a === 0 || l === t && (il === 2 || il === 9) || l.cancelPendingCommit !== null)
      return u !== null && u !== null && wn(u), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || Uu(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (u !== null && wn(u), kn(a)) {
        case 2:
        case 8:
          a = Ec;
          break;
        case 32:
          a = Ae;
          break;
        case 268435456:
          a = Ac;
          break;
        default:
          a = Ae;
      }
      return u = jo.bind(null, l), a = Jn(a, u), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return u !== null && u !== null && wn(u), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function jo(l, t) {
    if (jl !== 0 && jl !== 5)
      return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (En() && l.callbackNode !== a)
      return null;
    var u = k;
    return u = De(
      l,
      l === yl ? u : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), u === 0 ? null : (ho(l, u, t), Ro(l, ut()), l.callbackNode != null && l.callbackNode === a ? jo.bind(null, l) : null);
  }
  function Bo(l, t) {
    if (En()) return null;
    ho(l, t, !0);
  }
  function Ey() {
    jy(function() {
      (ul & 6) !== 0 ? Jn(
        Tc,
        Ty
      ) : No();
    });
  }
  function qf() {
    if (ha === 0) {
      var l = cu;
      l === 0 && (l = _e, _e <<= 1, (_e & 261888) === 0 && (_e = 256)), ha = l;
    }
    return ha;
  }
  function qo(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Ce("" + l);
  }
  function Yo(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function Ay(l, t, a, u, e) {
    if (t === "submit" && a && a.stateNode === e) {
      var n = qo(
        (e[$l] || null).action
      ), i = u.submitter;
      i && (t = (t = i[$l] || null) ? qo(t.formAction) : i.getAttribute("formAction"), t !== null && (n = t, i = null));
      var f = new Be(
        "action",
        "action",
        null,
        u,
        e
      );
      l.push({
        event: f,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (u.defaultPrevented) {
                if (ha !== 0) {
                  var c = i ? Yo(e, i) : new FormData(e);
                  af(
                    a,
                    {
                      pending: !0,
                      data: c,
                      method: e.method,
                      action: n
                    },
                    null,
                    c
                  );
                }
              } else
                typeof n == "function" && (f.preventDefault(), c = i ? Yo(e, i) : new FormData(e), af(
                  a,
                  {
                    pending: !0,
                    data: c,
                    method: e.method,
                    action: n
                  },
                  n,
                  c
                ));
            },
            currentTarget: e
          }
        ]
      });
    }
  }
  for (var Yf = 0; Yf < bi.length; Yf++) {
    var Gf = bi[Yf], _y = Gf.toLowerCase(), My = Gf[0].toUpperCase() + Gf.slice(1);
    At(
      _y,
      "on" + My
    );
  }
  At(ms, "onAnimationEnd"), At(rs, "onAnimationIteration"), At(hs, "onAnimationStart"), At("dblclick", "onDoubleClick"), At("focusin", "onFocus"), At("focusout", "onBlur"), At(Zv, "onTransitionRun"), At(Vv, "onTransitionStart"), At(Lv, "onTransitionCancel"), At(gs, "onTransitionEnd"), Wa("onMouseEnter", ["mouseout", "mouseover"]), Wa("onMouseLeave", ["mouseout", "mouseover"]), Wa("onPointerEnter", ["pointerout", "pointerover"]), Wa("onPointerLeave", ["pointerout", "pointerover"]), Ma(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), Ma(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), Ma("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ma(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), Ma(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), Ma(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var ve = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), xy = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(ve)
  );
  function Go(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var u = l[a], e = u.event;
      u = u.listeners;
      l: {
        var n = void 0;
        if (t)
          for (var i = u.length - 1; 0 <= i; i--) {
            var f = u[i], c = f.instance, m = f.currentTarget;
            if (f = f.listener, c !== n && e.isPropagationStopped())
              break l;
            n = f, e.currentTarget = m;
            try {
              n(e);
            } catch (g) {
              Ge(g);
            }
            e.currentTarget = null, n = c;
          }
        else
          for (i = 0; i < u.length; i++) {
            if (f = u[i], c = f.instance, m = f.currentTarget, f = f.listener, c !== n && e.isPropagationStopped())
              break l;
            n = f, e.currentTarget = m;
            try {
              n(e);
            } catch (g) {
              Ge(g);
            }
            e.currentTarget = null, n = c;
          }
      }
    }
  }
  function $(l, t) {
    var a = t[Fn];
    a === void 0 && (a = t[Fn] = /* @__PURE__ */ new Set());
    var u = l + "__bubble";
    a.has(u) || (Xo(t, l, 2, !1), a.add(u));
  }
  function Xf(l, t, a) {
    var u = 0;
    t && (u |= 4), Xo(
      a,
      l,
      u,
      t
    );
  }
  var Mn = "_reactListening" + Math.random().toString(36).slice(2);
  function Qf(l) {
    if (!l[Mn]) {
      l[Mn] = !0, Cc.forEach(function(a) {
        a !== "selectionchange" && (xy.has(a) || Xf(a, !1, l), Xf(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[Mn] || (t[Mn] = !0, Xf("selectionchange", !1, t));
    }
  }
  function Xo(l, t, a, u) {
    switch (r0(t)) {
      case 2:
        var e = t1;
        break;
      case 8:
        e = a1;
        break;
      default:
        e = ac;
    }
    a = e.bind(
      null,
      t,
      a,
      l
    ), e = void 0, !ii || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (e = !0), u ? e !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: e
    }) : l.addEventListener(t, a, !0) : e !== void 0 ? l.addEventListener(t, a, {
      passive: e
    }) : l.addEventListener(t, a, !1);
  }
  function Zf(l, t, a, u, e) {
    var n = u;
    if ((t & 1) === 0 && (t & 2) === 0 && u !== null)
      l: for (; ; ) {
        if (u === null) return;
        var i = u.tag;
        if (i === 3 || i === 4) {
          var f = u.stateNode.containerInfo;
          if (f === e) break;
          if (i === 4)
            for (i = u.return; i !== null; ) {
              var c = i.tag;
              if ((c === 3 || c === 4) && i.stateNode.containerInfo === e)
                return;
              i = i.return;
            }
          for (; f !== null; ) {
            if (i = Ka(f), i === null) return;
            if (c = i.tag, c === 5 || c === 6 || c === 26 || c === 27) {
              u = n = i;
              continue l;
            }
            f = f.parentNode;
          }
        }
        u = u.return;
      }
    Lc(function() {
      var m = n, g = ei(a), p = [];
      l: {
        var r = Ss.get(l);
        if (r !== void 0) {
          var h = Be, D = l;
          switch (l) {
            case "keypress":
              if (Re(a) === 0) break l;
            case "keydown":
            case "keyup":
              h = zv;
              break;
            case "focusin":
              D = "focus", h = di;
              break;
            case "focusout":
              D = "blur", h = di;
              break;
            case "beforeblur":
            case "afterblur":
              h = di;
              break;
            case "click":
              if (a.button === 2) break l;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              h = wc;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              h = cv;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              h = Ev;
              break;
            case ms:
            case rs:
            case hs:
              h = ov;
              break;
            case gs:
              h = _v;
              break;
            case "scroll":
            case "scrollend":
              h = iv;
              break;
            case "wheel":
              h = xv;
              break;
            case "copy":
            case "cut":
            case "paste":
              h = yv;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              h = $c;
              break;
            case "toggle":
            case "beforetoggle":
              h = Ov;
          }
          var j = (t & 4) !== 0, ol = !j && (l === "scroll" || l === "scrollend"), o = j ? r !== null ? r + "Capture" : null : r;
          j = [];
          for (var s = m, y; s !== null; ) {
            var b = s;
            if (y = b.stateNode, b = b.tag, b !== 5 && b !== 26 && b !== 27 || y === null || o === null || (b = Ru(s, o), b != null && j.push(
              ye(s, b, y)
            )), ol) break;
            s = s.return;
          }
          0 < j.length && (r = new h(
            r,
            D,
            null,
            a,
            g
          ), p.push({ event: r, listeners: j }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (r = l === "mouseover" || l === "pointerover", h = l === "mouseout" || l === "pointerout", r && a !== ui && (D = a.relatedTarget || a.fromElement) && (Ka(D) || D[La]))
            break l;
          if ((h || r) && (r = g.window === g ? g : (r = g.ownerDocument) ? r.defaultView || r.parentWindow : window, h ? (D = a.relatedTarget || a.toElement, h = m, D = D ? Ka(D) : null, D !== null && (ol = K(D), j = D.tag, D !== ol || j !== 5 && j !== 27 && j !== 6) && (D = null)) : (h = null, D = m), h !== D)) {
            if (j = wc, b = "onMouseLeave", o = "onMouseEnter", s = "mouse", (l === "pointerout" || l === "pointerover") && (j = $c, b = "onPointerLeave", o = "onPointerEnter", s = "pointer"), ol = h == null ? r : Nu(h), y = D == null ? r : Nu(D), r = new j(
              b,
              s + "leave",
              h,
              a,
              g
            ), r.target = ol, r.relatedTarget = y, b = null, Ka(g) === m && (j = new j(
              o,
              s + "enter",
              D,
              a,
              g
            ), j.target = y, j.relatedTarget = ol, b = j), ol = b, h && D)
              t: {
                for (j = Dy, o = h, s = D, y = 0, b = o; b; b = j(b))
                  y++;
                b = 0;
                for (var C = s; C; C = j(C))
                  b++;
                for (; 0 < y - b; )
                  o = j(o), y--;
                for (; 0 < b - y; )
                  s = j(s), b--;
                for (; y--; ) {
                  if (o === s || s !== null && o === s.alternate) {
                    j = o;
                    break t;
                  }
                  o = j(o), s = j(s);
                }
                j = null;
              }
            else j = null;
            h !== null && Qo(
              p,
              r,
              h,
              j,
              !1
            ), D !== null && ol !== null && Qo(
              p,
              ol,
              D,
              j,
              !0
            );
          }
        }
        l: {
          if (r = m ? Nu(m) : window, h = r.nodeName && r.nodeName.toLowerCase(), h === "select" || h === "input" && r.type === "file")
            var tl = us;
          else if (ts(r))
            if (es)
              tl = Gv;
            else {
              tl = qv;
              var U = Bv;
            }
          else
            h = r.nodeName, !h || h.toLowerCase() !== "input" || r.type !== "checkbox" && r.type !== "radio" ? m && ai(m.elementType) && (tl = us) : tl = Yv;
          if (tl && (tl = tl(l, m))) {
            as(
              p,
              tl,
              a,
              g
            );
            break l;
          }
          U && U(l, r, m), l === "focusout" && m && r.type === "number" && m.memoizedProps.value != null && ti(r, "number", r.value);
        }
        switch (U = m ? Nu(m) : window, l) {
          case "focusin":
            (ts(U) || U.contentEditable === "true") && (lu = U, hi = m, Zu = null);
            break;
          case "focusout":
            Zu = hi = lu = null;
            break;
          case "mousedown":
            gi = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            gi = !1, vs(p, a, g);
            break;
          case "selectionchange":
            if (Qv) break;
          case "keydown":
          case "keyup":
            vs(p, a, g);
        }
        var V;
        if (vi)
          l: {
            switch (l) {
              case "compositionstart":
                var F = "onCompositionStart";
                break l;
              case "compositionend":
                F = "onCompositionEnd";
                break l;
              case "compositionupdate":
                F = "onCompositionUpdate";
                break l;
            }
            F = void 0;
          }
        else
          Pa ? Pc(l, a) && (F = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (F = "onCompositionStart");
        F && (kc && a.locale !== "ko" && (Pa || F !== "onCompositionStart" ? F === "onCompositionEnd" && Pa && (V = Kc()) : (la = g, fi = "value" in la ? la.value : la.textContent, Pa = !0)), U = xn(m, F), 0 < U.length && (F = new Wc(
          F,
          l,
          null,
          a,
          g
        ), p.push({ event: F, listeners: U }), V ? F.data = V : (V = ls(a), V !== null && (F.data = V)))), (V = Hv ? Cv(l, a) : Nv(l, a)) && (F = xn(m, "onBeforeInput"), 0 < F.length && (U = new Wc(
          "onBeforeInput",
          "beforeinput",
          null,
          a,
          g
        ), p.push({
          event: U,
          listeners: F
        }), U.data = V)), Ay(
          p,
          l,
          m,
          a,
          g
        );
      }
      Go(p, t);
    });
  }
  function ye(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function xn(l, t) {
    for (var a = t + "Capture", u = []; l !== null; ) {
      var e = l, n = e.stateNode;
      if (e = e.tag, e !== 5 && e !== 26 && e !== 27 || n === null || (e = Ru(l, a), e != null && u.unshift(
        ye(l, e, n)
      ), e = Ru(l, t), e != null && u.push(
        ye(l, e, n)
      )), l.tag === 3) return u;
      l = l.return;
    }
    return [];
  }
  function Dy(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function Qo(l, t, a, u, e) {
    for (var n = t._reactName, i = []; a !== null && a !== u; ) {
      var f = a, c = f.alternate, m = f.stateNode;
      if (f = f.tag, c !== null && c === u) break;
      f !== 5 && f !== 26 && f !== 27 || m === null || (c = m, e ? (m = Ru(a, n), m != null && i.unshift(
        ye(a, m, c)
      )) : e || (m = Ru(a, n), m != null && i.push(
        ye(a, m, c)
      ))), a = a.return;
    }
    i.length !== 0 && l.push({ event: t, listeners: i });
  }
  var Oy = /\r\n?/g, Uy = /\u0000|\uFFFD/g;
  function Zo(l) {
    return (typeof l == "string" ? l : "" + l).replace(Oy, `
`).replace(Uy, "");
  }
  function Vo(l, t) {
    return t = Zo(t), Zo(l) === t;
  }
  function dl(l, t, a, u, e, n) {
    switch (a) {
      case "children":
        typeof u == "string" ? t === "body" || t === "textarea" && u === "" || ka(l, u) : (typeof u == "number" || typeof u == "bigint") && t !== "body" && ka(l, "" + u);
        break;
      case "className":
        Ue(l, "class", u);
        break;
      case "tabIndex":
        Ue(l, "tabindex", u);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Ue(l, a, u);
        break;
      case "style":
        Zc(l, u, n);
        break;
      case "data":
        if (t !== "object") {
          Ue(l, "data", u);
          break;
        }
      case "src":
      case "href":
        if (u === "" && (t !== "a" || a !== "href")) {
          l.removeAttribute(a);
          break;
        }
        if (u == null || typeof u == "function" || typeof u == "symbol" || typeof u == "boolean") {
          l.removeAttribute(a);
          break;
        }
        u = Ce("" + u), l.setAttribute(a, u);
        break;
      case "action":
      case "formAction":
        if (typeof u == "function") {
          l.setAttribute(
            a,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
          );
          break;
        } else
          typeof n == "function" && (a === "formAction" ? (t !== "input" && dl(l, t, "name", e.name, e, null), dl(
            l,
            t,
            "formEncType",
            e.formEncType,
            e,
            null
          ), dl(
            l,
            t,
            "formMethod",
            e.formMethod,
            e,
            null
          ), dl(
            l,
            t,
            "formTarget",
            e.formTarget,
            e,
            null
          )) : (dl(l, t, "encType", e.encType, e, null), dl(l, t, "method", e.method, e, null), dl(l, t, "target", e.target, e, null)));
        if (u == null || typeof u == "symbol" || typeof u == "boolean") {
          l.removeAttribute(a);
          break;
        }
        u = Ce("" + u), l.setAttribute(a, u);
        break;
      case "onClick":
        u != null && (l.onclick = jt);
        break;
      case "onScroll":
        u != null && $("scroll", l);
        break;
      case "onScrollEnd":
        u != null && $("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u))
            throw Error(v(61));
          if (a = u.__html, a != null) {
            if (e.children != null) throw Error(v(60));
            l.innerHTML = a;
          }
        }
        break;
      case "multiple":
        l.multiple = u && typeof u != "function" && typeof u != "symbol";
        break;
      case "muted":
        l.muted = u && typeof u != "function" && typeof u != "symbol";
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "ref":
        break;
      case "autoFocus":
        break;
      case "xlinkHref":
        if (u == null || typeof u == "function" || typeof u == "boolean" || typeof u == "symbol") {
          l.removeAttribute("xlink:href");
          break;
        }
        a = Ce("" + u), l.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          a
        );
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        u != null && typeof u != "function" && typeof u != "symbol" ? l.setAttribute(a, "" + u) : l.removeAttribute(a);
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        u && typeof u != "function" && typeof u != "symbol" ? l.setAttribute(a, "") : l.removeAttribute(a);
        break;
      case "capture":
      case "download":
        u === !0 ? l.setAttribute(a, "") : u !== !1 && u != null && typeof u != "function" && typeof u != "symbol" ? l.setAttribute(a, u) : l.removeAttribute(a);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        u != null && typeof u != "function" && typeof u != "symbol" && !isNaN(u) && 1 <= u ? l.setAttribute(a, u) : l.removeAttribute(a);
        break;
      case "rowSpan":
      case "start":
        u == null || typeof u == "function" || typeof u == "symbol" || isNaN(u) ? l.removeAttribute(a) : l.setAttribute(a, u);
        break;
      case "popover":
        $("beforetoggle", l), $("toggle", l), Oe(l, "popover", u);
        break;
      case "xlinkActuate":
        Rt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          u
        );
        break;
      case "xlinkArcrole":
        Rt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          u
        );
        break;
      case "xlinkRole":
        Rt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          u
        );
        break;
      case "xlinkShow":
        Rt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          u
        );
        break;
      case "xlinkTitle":
        Rt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          u
        );
        break;
      case "xlinkType":
        Rt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          u
        );
        break;
      case "xmlBase":
        Rt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          u
        );
        break;
      case "xmlLang":
        Rt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          u
        );
        break;
      case "xmlSpace":
        Rt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          u
        );
        break;
      case "is":
        Oe(l, "is", u);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = ev.get(a) || a, Oe(l, a, u));
    }
  }
  function Vf(l, t, a, u, e, n) {
    switch (a) {
      case "style":
        Zc(l, u, n);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u))
            throw Error(v(61));
          if (a = u.__html, a != null) {
            if (e.children != null) throw Error(v(60));
            l.innerHTML = a;
          }
        }
        break;
      case "children":
        typeof u == "string" ? ka(l, u) : (typeof u == "number" || typeof u == "bigint") && ka(l, "" + u);
        break;
      case "onScroll":
        u != null && $("scroll", l);
        break;
      case "onScrollEnd":
        u != null && $("scrollend", l);
        break;
      case "onClick":
        u != null && (l.onclick = jt);
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "innerHTML":
      case "ref":
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        if (!Nc.hasOwnProperty(a))
          l: {
            if (a[0] === "o" && a[1] === "n" && (e = a.endsWith("Capture"), t = a.slice(2, e ? a.length - 7 : void 0), n = l[$l] || null, n = n != null ? n[a] : null, typeof n == "function" && l.removeEventListener(t, n, e), typeof u == "function")) {
              typeof n != "function" && n !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, u, e);
              break l;
            }
            a in l ? l[a] = u : u === !0 ? l.setAttribute(a, "") : Oe(l, a, u);
          }
    }
  }
  function Zl(l, t, a) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "img":
        $("error", l), $("load", l);
        var u = !1, e = !1, n;
        for (n in a)
          if (a.hasOwnProperty(n)) {
            var i = a[n];
            if (i != null)
              switch (n) {
                case "src":
                  u = !0;
                  break;
                case "srcSet":
                  e = !0;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(v(137, t));
                default:
                  dl(l, t, n, i, a, null);
              }
          }
        e && dl(l, t, "srcSet", a.srcSet, a, null), u && dl(l, t, "src", a.src, a, null);
        return;
      case "input":
        $("invalid", l);
        var f = n = i = e = null, c = null, m = null;
        for (u in a)
          if (a.hasOwnProperty(u)) {
            var g = a[u];
            if (g != null)
              switch (u) {
                case "name":
                  e = g;
                  break;
                case "type":
                  i = g;
                  break;
                case "checked":
                  c = g;
                  break;
                case "defaultChecked":
                  m = g;
                  break;
                case "value":
                  n = g;
                  break;
                case "defaultValue":
                  f = g;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (g != null)
                    throw Error(v(137, t));
                  break;
                default:
                  dl(l, t, u, g, a, null);
              }
          }
        Yc(
          l,
          n,
          f,
          c,
          m,
          i,
          e,
          !1
        );
        return;
      case "select":
        $("invalid", l), u = i = n = null;
        for (e in a)
          if (a.hasOwnProperty(e) && (f = a[e], f != null))
            switch (e) {
              case "value":
                n = f;
                break;
              case "defaultValue":
                i = f;
                break;
              case "multiple":
                u = f;
              default:
                dl(l, t, e, f, a, null);
            }
        t = n, a = i, l.multiple = !!u, t != null ? $a(l, !!u, t, !1) : a != null && $a(l, !!u, a, !0);
        return;
      case "textarea":
        $("invalid", l), n = e = u = null;
        for (i in a)
          if (a.hasOwnProperty(i) && (f = a[i], f != null))
            switch (i) {
              case "value":
                u = f;
                break;
              case "defaultValue":
                e = f;
                break;
              case "children":
                n = f;
                break;
              case "dangerouslySetInnerHTML":
                if (f != null) throw Error(v(91));
                break;
              default:
                dl(l, t, i, f, a, null);
            }
        Xc(l, u, e, n);
        return;
      case "option":
        for (c in a)
          a.hasOwnProperty(c) && (u = a[c], u != null) && (c === "selected" ? l.selected = u && typeof u != "function" && typeof u != "symbol" : dl(l, t, c, u, a, null));
        return;
      case "dialog":
        $("beforetoggle", l), $("toggle", l), $("cancel", l), $("close", l);
        break;
      case "iframe":
      case "object":
        $("load", l);
        break;
      case "video":
      case "audio":
        for (u = 0; u < ve.length; u++)
          $(ve[u], l);
        break;
      case "image":
        $("error", l), $("load", l);
        break;
      case "details":
        $("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        $("error", l), $("load", l);
      case "area":
      case "base":
      case "br":
      case "col":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "track":
      case "wbr":
      case "menuitem":
        for (m in a)
          if (a.hasOwnProperty(m) && (u = a[m], u != null))
            switch (m) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(v(137, t));
              default:
                dl(l, t, m, u, a, null);
            }
        return;
      default:
        if (ai(t)) {
          for (g in a)
            a.hasOwnProperty(g) && (u = a[g], u !== void 0 && Vf(
              l,
              t,
              g,
              u,
              a,
              void 0
            ));
          return;
        }
    }
    for (f in a)
      a.hasOwnProperty(f) && (u = a[f], u != null && dl(l, t, f, u, a, null));
  }
  function Hy(l, t, a, u) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "input":
        var e = null, n = null, i = null, f = null, c = null, m = null, g = null;
        for (h in a) {
          var p = a[h];
          if (a.hasOwnProperty(h) && p != null)
            switch (h) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                c = p;
              default:
                u.hasOwnProperty(h) || dl(l, t, h, null, u, p);
            }
        }
        for (var r in u) {
          var h = u[r];
          if (p = a[r], u.hasOwnProperty(r) && (h != null || p != null))
            switch (r) {
              case "type":
                n = h;
                break;
              case "name":
                e = h;
                break;
              case "checked":
                m = h;
                break;
              case "defaultChecked":
                g = h;
                break;
              case "value":
                i = h;
                break;
              case "defaultValue":
                f = h;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (h != null)
                  throw Error(v(137, t));
                break;
              default:
                h !== p && dl(
                  l,
                  t,
                  r,
                  h,
                  u,
                  p
                );
            }
        }
        li(
          l,
          i,
          f,
          c,
          m,
          g,
          n,
          e
        );
        return;
      case "select":
        h = i = f = r = null;
        for (n in a)
          if (c = a[n], a.hasOwnProperty(n) && c != null)
            switch (n) {
              case "value":
                break;
              case "multiple":
                h = c;
              default:
                u.hasOwnProperty(n) || dl(
                  l,
                  t,
                  n,
                  null,
                  u,
                  c
                );
            }
        for (e in u)
          if (n = u[e], c = a[e], u.hasOwnProperty(e) && (n != null || c != null))
            switch (e) {
              case "value":
                r = n;
                break;
              case "defaultValue":
                f = n;
                break;
              case "multiple":
                i = n;
              default:
                n !== c && dl(
                  l,
                  t,
                  e,
                  n,
                  u,
                  c
                );
            }
        t = f, a = i, u = h, r != null ? $a(l, !!a, r, !1) : !!u != !!a && (t != null ? $a(l, !!a, t, !0) : $a(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        h = r = null;
        for (f in a)
          if (e = a[f], a.hasOwnProperty(f) && e != null && !u.hasOwnProperty(f))
            switch (f) {
              case "value":
                break;
              case "children":
                break;
              default:
                dl(l, t, f, null, u, e);
            }
        for (i in u)
          if (e = u[i], n = a[i], u.hasOwnProperty(i) && (e != null || n != null))
            switch (i) {
              case "value":
                r = e;
                break;
              case "defaultValue":
                h = e;
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (e != null) throw Error(v(91));
                break;
              default:
                e !== n && dl(l, t, i, e, u, n);
            }
        Gc(l, r, h);
        return;
      case "option":
        for (var D in a)
          r = a[D], a.hasOwnProperty(D) && r != null && !u.hasOwnProperty(D) && (D === "selected" ? l.selected = !1 : dl(
            l,
            t,
            D,
            null,
            u,
            r
          ));
        for (c in u)
          r = u[c], h = a[c], u.hasOwnProperty(c) && r !== h && (r != null || h != null) && (c === "selected" ? l.selected = r && typeof r != "function" && typeof r != "symbol" : dl(
            l,
            t,
            c,
            r,
            u,
            h
          ));
        return;
      case "img":
      case "link":
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
      case "menuitem":
        for (var j in a)
          r = a[j], a.hasOwnProperty(j) && r != null && !u.hasOwnProperty(j) && dl(l, t, j, null, u, r);
        for (m in u)
          if (r = u[m], h = a[m], u.hasOwnProperty(m) && r !== h && (r != null || h != null))
            switch (m) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (r != null)
                  throw Error(v(137, t));
                break;
              default:
                dl(
                  l,
                  t,
                  m,
                  r,
                  u,
                  h
                );
            }
        return;
      default:
        if (ai(t)) {
          for (var ol in a)
            r = a[ol], a.hasOwnProperty(ol) && r !== void 0 && !u.hasOwnProperty(ol) && Vf(
              l,
              t,
              ol,
              void 0,
              u,
              r
            );
          for (g in u)
            r = u[g], h = a[g], !u.hasOwnProperty(g) || r === h || r === void 0 && h === void 0 || Vf(
              l,
              t,
              g,
              r,
              u,
              h
            );
          return;
        }
    }
    for (var o in a)
      r = a[o], a.hasOwnProperty(o) && r != null && !u.hasOwnProperty(o) && dl(l, t, o, null, u, r);
    for (p in u)
      r = u[p], h = a[p], !u.hasOwnProperty(p) || r === h || r == null && h == null || dl(l, t, p, r, u, h);
  }
  function Lo(l) {
    switch (l) {
      case "css":
      case "script":
      case "font":
      case "img":
      case "image":
      case "input":
      case "link":
        return !0;
      default:
        return !1;
    }
  }
  function Cy() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), u = 0; u < a.length; u++) {
        var e = a[u], n = e.transferSize, i = e.initiatorType, f = e.duration;
        if (n && f && Lo(i)) {
          for (i = 0, f = e.responseEnd, u += 1; u < a.length; u++) {
            var c = a[u], m = c.startTime;
            if (m > f) break;
            var g = c.transferSize, p = c.initiatorType;
            g && Lo(p) && (c = c.responseEnd, i += g * (c < f ? 1 : (f - m) / (c - m)));
          }
          if (--u, t += 8 * (n + i) / (e.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var Lf = null, Kf = null;
  function Dn(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function Ko(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Jo(l, t) {
    if (l === 0)
      switch (t) {
        case "svg":
          return 1;
        case "math":
          return 2;
        default:
          return 0;
      }
    return l === 1 && t === "foreignObject" ? 0 : l;
  }
  function Jf(l, t) {
    return l === "textarea" || l === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var wf = null;
  function Ny() {
    var l = window.event;
    return l && l.type === "popstate" ? l === wf ? !1 : (wf = l, !0) : (wf = null, !1);
  }
  var wo = typeof setTimeout == "function" ? setTimeout : void 0, Ry = typeof clearTimeout == "function" ? clearTimeout : void 0, Wo = typeof Promise == "function" ? Promise : void 0, jy = typeof queueMicrotask == "function" ? queueMicrotask : typeof Wo < "u" ? function(l) {
    return Wo.resolve(null).then(l).catch(By);
  } : wo;
  function By(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function ga(l) {
    return l === "head";
  }
  function $o(l, t) {
    var a = t, u = 0;
    do {
      var e = a.nextSibling;
      if (l.removeChild(a), e && e.nodeType === 8)
        if (a = e.data, a === "/$" || a === "/&") {
          if (u === 0) {
            l.removeChild(e), xu(t);
            return;
          }
          u--;
        } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&")
          u++;
        else if (a === "html")
          me(l.ownerDocument.documentElement);
        else if (a === "head") {
          a = l.ownerDocument.head, me(a);
          for (var n = a.firstChild; n; ) {
            var i = n.nextSibling, f = n.nodeName;
            n[Cu] || f === "SCRIPT" || f === "STYLE" || f === "LINK" && n.rel.toLowerCase() === "stylesheet" || a.removeChild(n), n = i;
          }
        } else
          a === "body" && me(l.ownerDocument.body);
      a = e;
    } while (a);
    xu(t);
  }
  function ko(l, t) {
    var a = l;
    l = 0;
    do {
      var u = a.nextSibling;
      if (a.nodeType === 1 ? t ? (a._stashedDisplay = a.style.display, a.style.display = "none") : (a.style.display = a._stashedDisplay || "", a.getAttribute("style") === "" && a.removeAttribute("style")) : a.nodeType === 3 && (t ? (a._stashedText = a.nodeValue, a.nodeValue = "") : a.nodeValue = a._stashedText || ""), u && u.nodeType === 8)
        if (a = u.data, a === "/$") {
          if (l === 0) break;
          l--;
        } else
          a !== "$" && a !== "$?" && a !== "$~" && a !== "$!" || l++;
      a = u;
    } while (a);
  }
  function Wf(l) {
    var t = l.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var a = t;
      switch (t = t.nextSibling, a.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Wf(a), In(a);
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (a.rel.toLowerCase() === "stylesheet") continue;
      }
      l.removeChild(a);
    }
  }
  function qy(l, t, a, u) {
    for (; l.nodeType === 1; ) {
      var e = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!u && (l.nodeName !== "INPUT" || l.type !== "hidden"))
          break;
      } else if (u) {
        if (!l[Cu])
          switch (t) {
            case "meta":
              if (!l.hasAttribute("itemprop")) break;
              return l;
            case "link":
              if (n = l.getAttribute("rel"), n === "stylesheet" && l.hasAttribute("data-precedence"))
                break;
              if (n !== e.rel || l.getAttribute("href") !== (e.href == null || e.href === "" ? null : e.href) || l.getAttribute("crossorigin") !== (e.crossOrigin == null ? null : e.crossOrigin) || l.getAttribute("title") !== (e.title == null ? null : e.title))
                break;
              return l;
            case "style":
              if (l.hasAttribute("data-precedence")) break;
              return l;
            case "script":
              if (n = l.getAttribute("src"), (n !== (e.src == null ? null : e.src) || l.getAttribute("type") !== (e.type == null ? null : e.type) || l.getAttribute("crossorigin") !== (e.crossOrigin == null ? null : e.crossOrigin)) && n && l.hasAttribute("async") && !l.hasAttribute("itemprop"))
                break;
              return l;
            default:
              return l;
          }
      } else if (t === "input" && l.type === "hidden") {
        var n = e.name == null ? null : "" + e.name;
        if (e.type === "hidden" && l.getAttribute("name") === n)
          return l;
      } else return l;
      if (l = pt(l.nextSibling), l === null) break;
    }
    return null;
  }
  function Yy(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = pt(l.nextSibling), l === null)) return null;
    return l;
  }
  function Fo(l, t) {
    for (; l.nodeType !== 8; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !t || (l = pt(l.nextSibling), l === null)) return null;
    return l;
  }
  function $f(l) {
    return l.data === "$?" || l.data === "$~";
  }
  function kf(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState !== "loading";
  }
  function Gy(l, t) {
    var a = l.ownerDocument;
    if (l.data === "$~") l._reactRetry = t;
    else if (l.data !== "$?" || a.readyState !== "loading")
      t();
    else {
      var u = function() {
        t(), a.removeEventListener("DOMContentLoaded", u);
      };
      a.addEventListener("DOMContentLoaded", u), l._reactRetry = u;
    }
  }
  function pt(l) {
    for (; l != null; l = l.nextSibling) {
      var t = l.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (t = l.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F")
          break;
        if (t === "/$" || t === "/&") return null;
      }
    }
    return l;
  }
  var Ff = null;
  function Io(l) {
    l = l.nextSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "/$" || a === "/&") {
          if (t === 0)
            return pt(l.nextSibling);
          t--;
        } else
          a !== "$" && a !== "$!" && a !== "$?" && a !== "$~" && a !== "&" || t++;
      }
      l = l.nextSibling;
    }
    return null;
  }
  function Po(l) {
    l = l.previousSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "$" || a === "$!" || a === "$?" || a === "$~" || a === "&") {
          if (t === 0) return l;
          t--;
        } else a !== "/$" && a !== "/&" || t++;
      }
      l = l.previousSibling;
    }
    return null;
  }
  function l0(l, t, a) {
    switch (t = Dn(a), l) {
      case "html":
        if (l = t.documentElement, !l) throw Error(v(452));
        return l;
      case "head":
        if (l = t.head, !l) throw Error(v(453));
        return l;
      case "body":
        if (l = t.body, !l) throw Error(v(454));
        return l;
      default:
        throw Error(v(451));
    }
  }
  function me(l) {
    for (var t = l.attributes; t.length; )
      l.removeAttributeNode(t[0]);
    In(l);
  }
  var Tt = /* @__PURE__ */ new Map(), t0 = /* @__PURE__ */ new Set();
  function On(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Ft = A.d;
  A.d = {
    f: Xy,
    r: Qy,
    D: Zy,
    C: Vy,
    L: Ly,
    m: Ky,
    X: wy,
    S: Jy,
    M: Wy
  };
  function Xy() {
    var l = Ft.f(), t = zn();
    return l || t;
  }
  function Qy(l) {
    var t = Ja(l);
    t !== null && t.tag === 5 && t.type === "form" ? gd(t) : Ft.r(l);
  }
  var Au = typeof document > "u" ? null : document;
  function a0(l, t, a) {
    var u = Au;
    if (u && typeof t == "string" && t) {
      var e = mt(t);
      e = 'link[rel="' + l + '"][href="' + e + '"]', typeof a == "string" && (e += '[crossorigin="' + a + '"]'), t0.has(e) || (t0.add(e), l = { rel: l, crossOrigin: a, href: t }, u.querySelector(e) === null && (t = u.createElement("link"), Zl(t, "link", l), Bl(t), u.head.appendChild(t)));
    }
  }
  function Zy(l) {
    Ft.D(l), a0("dns-prefetch", l, null);
  }
  function Vy(l, t) {
    Ft.C(l, t), a0("preconnect", l, t);
  }
  function Ly(l, t, a) {
    Ft.L(l, t, a);
    var u = Au;
    if (u && l && t) {
      var e = 'link[rel="preload"][as="' + mt(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (e += '[imagesrcset="' + mt(
        a.imageSrcSet
      ) + '"]', typeof a.imageSizes == "string" && (e += '[imagesizes="' + mt(
        a.imageSizes
      ) + '"]')) : e += '[href="' + mt(l) + '"]';
      var n = e;
      switch (t) {
        case "style":
          n = _u(l);
          break;
        case "script":
          n = Mu(l);
      }
      Tt.has(n) || (l = H(
        {
          rel: "preload",
          href: t === "image" && a && a.imageSrcSet ? void 0 : l,
          as: t
        },
        a
      ), Tt.set(n, l), u.querySelector(e) !== null || t === "style" && u.querySelector(re(n)) || t === "script" && u.querySelector(he(n)) || (t = u.createElement("link"), Zl(t, "link", l), Bl(t), u.head.appendChild(t)));
    }
  }
  function Ky(l, t) {
    Ft.m(l, t);
    var a = Au;
    if (a && l) {
      var u = t && typeof t.as == "string" ? t.as : "script", e = 'link[rel="modulepreload"][as="' + mt(u) + '"][href="' + mt(l) + '"]', n = e;
      switch (u) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          n = Mu(l);
      }
      if (!Tt.has(n) && (l = H({ rel: "modulepreload", href: l }, t), Tt.set(n, l), a.querySelector(e) === null)) {
        switch (u) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(he(n)))
              return;
        }
        u = a.createElement("link"), Zl(u, "link", l), Bl(u), a.head.appendChild(u);
      }
    }
  }
  function Jy(l, t, a) {
    Ft.S(l, t, a);
    var u = Au;
    if (u && l) {
      var e = wa(u).hoistableStyles, n = _u(l);
      t = t || "default";
      var i = e.get(n);
      if (!i) {
        var f = { loading: 0, preload: null };
        if (i = u.querySelector(
          re(n)
        ))
          f.loading = 5;
        else {
          l = H(
            { rel: "stylesheet", href: l, "data-precedence": t },
            a
          ), (a = Tt.get(n)) && If(l, a);
          var c = i = u.createElement("link");
          Bl(c), Zl(c, "link", l), c._p = new Promise(function(m, g) {
            c.onload = m, c.onerror = g;
          }), c.addEventListener("load", function() {
            f.loading |= 1;
          }), c.addEventListener("error", function() {
            f.loading |= 2;
          }), f.loading |= 4, Un(i, t, u);
        }
        i = {
          type: "stylesheet",
          instance: i,
          count: 1,
          state: f
        }, e.set(n, i);
      }
    }
  }
  function wy(l, t) {
    Ft.X(l, t);
    var a = Au;
    if (a && l) {
      var u = wa(a).hoistableScripts, e = Mu(l), n = u.get(e);
      n || (n = a.querySelector(he(e)), n || (l = H({ src: l, async: !0 }, t), (t = Tt.get(e)) && Pf(l, t), n = a.createElement("script"), Bl(n), Zl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, u.set(e, n));
    }
  }
  function Wy(l, t) {
    Ft.M(l, t);
    var a = Au;
    if (a && l) {
      var u = wa(a).hoistableScripts, e = Mu(l), n = u.get(e);
      n || (n = a.querySelector(he(e)), n || (l = H({ src: l, async: !0, type: "module" }, t), (t = Tt.get(e)) && Pf(l, t), n = a.createElement("script"), Bl(n), Zl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, u.set(e, n));
    }
  }
  function u0(l, t, a, u) {
    var e = (e = w.current) ? On(e) : null;
    if (!e) throw Error(v(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = _u(a.href), a = wa(
          e
        ).hoistableStyles, u = a.get(t), u || (u = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, u)), u) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (a.rel === "stylesheet" && typeof a.href == "string" && typeof a.precedence == "string") {
          l = _u(a.href);
          var n = wa(
            e
          ).hoistableStyles, i = n.get(l);
          if (i || (e = e.ownerDocument || e, i = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, n.set(l, i), (n = e.querySelector(
            re(l)
          )) && !n._p && (i.instance = n, i.state.loading = 5), Tt.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, Tt.set(l, a), n || $y(
            e,
            l,
            a,
            i.state
          ))), t && u === null)
            throw Error(v(528, ""));
          return i;
        }
        if (t && u !== null)
          throw Error(v(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Mu(a), a = wa(
          e
        ).hoistableScripts, u = a.get(t), u || (u = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, u)), u) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(v(444, l));
    }
  }
  function _u(l) {
    return 'href="' + mt(l) + '"';
  }
  function re(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function e0(l) {
    return H({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function $y(l, t, a, u) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? u.loading = 1 : (t = l.createElement("link"), u.preload = t, t.addEventListener("load", function() {
      return u.loading |= 1;
    }), t.addEventListener("error", function() {
      return u.loading |= 2;
    }), Zl(t, "link", a), Bl(t), l.head.appendChild(t));
  }
  function Mu(l) {
    return '[src="' + mt(l) + '"]';
  }
  function he(l) {
    return "script[async]" + l;
  }
  function n0(l, t, a) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var u = l.querySelector(
            'style[data-href~="' + mt(a.href) + '"]'
          );
          if (u)
            return t.instance = u, Bl(u), u;
          var e = H({}, a, {
            "data-href": a.href,
            "data-precedence": a.precedence,
            href: null,
            precedence: null
          });
          return u = (l.ownerDocument || l).createElement(
            "style"
          ), Bl(u), Zl(u, "style", e), Un(u, a.precedence, l), t.instance = u;
        case "stylesheet":
          e = _u(a.href);
          var n = l.querySelector(
            re(e)
          );
          if (n)
            return t.state.loading |= 4, t.instance = n, Bl(n), n;
          u = e0(a), (e = Tt.get(e)) && If(u, e), n = (l.ownerDocument || l).createElement("link"), Bl(n);
          var i = n;
          return i._p = new Promise(function(f, c) {
            i.onload = f, i.onerror = c;
          }), Zl(n, "link", u), t.state.loading |= 4, Un(n, a.precedence, l), t.instance = n;
        case "script":
          return n = Mu(a.src), (e = l.querySelector(
            he(n)
          )) ? (t.instance = e, Bl(e), e) : (u = a, (e = Tt.get(n)) && (u = H({}, a), Pf(u, e)), l = l.ownerDocument || l, e = l.createElement("script"), Bl(e), Zl(e, "link", u), l.head.appendChild(e), t.instance = e);
        case "void":
          return null;
        default:
          throw Error(v(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (u = t.instance, t.state.loading |= 4, Un(u, a.precedence, l));
    return t.instance;
  }
  function Un(l, t, a) {
    for (var u = a.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), e = u.length ? u[u.length - 1] : null, n = e, i = 0; i < u.length; i++) {
      var f = u[i];
      if (f.dataset.precedence === t) n = f;
      else if (n !== e) break;
    }
    n ? n.parentNode.insertBefore(l, n.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function If(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.title == null && (l.title = t.title);
  }
  function Pf(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.integrity == null && (l.integrity = t.integrity);
  }
  var Hn = null;
  function i0(l, t, a) {
    if (Hn === null) {
      var u = /* @__PURE__ */ new Map(), e = Hn = /* @__PURE__ */ new Map();
      e.set(a, u);
    } else
      e = Hn, u = e.get(a), u || (u = /* @__PURE__ */ new Map(), e.set(a, u));
    if (u.has(l)) return u;
    for (u.set(l, null), a = a.getElementsByTagName(l), e = 0; e < a.length; e++) {
      var n = a[e];
      if (!(n[Cu] || n[Yl] || l === "link" && n.getAttribute("rel") === "stylesheet") && n.namespaceURI !== "http://www.w3.org/2000/svg") {
        var i = n.getAttribute(t) || "";
        i = l + i;
        var f = u.get(i);
        f ? f.push(n) : u.set(i, [n]);
      }
    }
    return u;
  }
  function f0(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(
      a,
      t === "title" ? l.querySelector("head > title") : null
    );
  }
  function ky(l, t, a) {
    if (a === 1 || t.itemProp != null) return !1;
    switch (l) {
      case "meta":
      case "title":
        return !0;
      case "style":
        if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "")
          break;
        return !0;
      case "link":
        if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError)
          break;
        return t.rel === "stylesheet" ? (l = t.disabled, typeof t.precedence == "string" && l == null) : !0;
      case "script":
        if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string")
          return !0;
    }
    return !1;
  }
  function c0(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function Fy(l, t, a, u) {
    if (a.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var e = _u(u.href), n = t.querySelector(
          re(e)
        );
        if (n) {
          t = n._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = Cn.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = n, Bl(n);
          return;
        }
        n = t.ownerDocument || t, u = e0(u), (e = Tt.get(e)) && If(u, e), n = n.createElement("link"), Bl(n);
        var i = n;
        i._p = new Promise(function(f, c) {
          i.onload = f, i.onerror = c;
        }), Zl(n, "link", u), a.instance = n;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = Cn.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var lc = 0;
  function Iy(l, t) {
    return l.stylesheets && l.count === 0 && Rn(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var u = setTimeout(function() {
        if (l.stylesheets && Rn(l, l.stylesheets), l.unsuspend) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, 6e4 + t);
      0 < l.imgBytes && lc === 0 && (lc = 62500 * Cy());
      var e = setTimeout(
        function() {
          if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && Rn(l, l.stylesheets), l.unsuspend)) {
            var n = l.unsuspend;
            l.unsuspend = null, n();
          }
        },
        (l.imgBytes > lc ? 50 : 800) + t
      );
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(u), clearTimeout(e);
      };
    } : null;
  }
  function Cn() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) Rn(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var Nn = null;
  function Rn(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, Nn = /* @__PURE__ */ new Map(), t.forEach(Py, l), Nn = null, Cn.call(l));
  }
  function Py(l, t) {
    if (!(t.state.loading & 4)) {
      var a = Nn.get(l);
      if (a) var u = a.get(null);
      else {
        a = /* @__PURE__ */ new Map(), Nn.set(l, a);
        for (var e = l.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), n = 0; n < e.length; n++) {
          var i = e[n];
          (i.nodeName === "LINK" || i.getAttribute("media") !== "not all") && (a.set(i.dataset.precedence, i), u = i);
        }
        u && a.set(null, u);
      }
      e = t.instance, i = e.getAttribute("data-precedence"), n = a.get(i) || u, n === u && a.set(null, e), a.set(i, e), this.count++, u = Cn.bind(this), e.addEventListener("load", u), e.addEventListener("error", u), n ? n.parentNode.insertBefore(e, n.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(e, l.firstChild)), t.state.loading |= 4;
    }
  }
  var ge = {
    $$typeof: bl,
    Provider: null,
    Consumer: null,
    _currentValue: q,
    _currentValue2: q,
    _threadCount: 0
  };
  function l1(l, t, a, u, e, n, i, f, c) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Wn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Wn(0), this.hiddenUpdates = Wn(null), this.identifierPrefix = u, this.onUncaughtError = e, this.onCaughtError = n, this.onRecoverableError = i, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = c, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function s0(l, t, a, u, e, n, i, f, c, m, g, p) {
    return l = new l1(
      l,
      t,
      a,
      i,
      c,
      m,
      g,
      p,
      f
    ), t = 1, n === !0 && (t |= 24), n = ft(3, null, null, t), l.current = n, n.stateNode = l, t = Ci(), t.refCount++, l.pooledCache = t, t.refCount++, n.memoizedState = {
      element: u,
      isDehydrated: a,
      cache: t
    }, Bi(n), l;
  }
  function d0(l) {
    return l ? (l = uu, l) : uu;
  }
  function o0(l, t, a, u, e, n) {
    e = d0(e), u.context === null ? u.context = e : u.pendingContext = e, u = ia(t), u.payload = { element: a }, n = n === void 0 ? null : n, n !== null && (u.callback = n), a = fa(l, u, t), a !== null && (tt(a, l, t), $u(a, l, t));
  }
  function v0(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function tc(l, t) {
    v0(l, t), (l = l.alternate) && v0(l, t);
  }
  function y0(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Ua(l, 67108864);
      t !== null && tt(t, l, 67108864), tc(l, 67108864);
    }
  }
  function m0(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = vt();
      t = $n(t);
      var a = Ua(l, t);
      a !== null && tt(a, l, t), tc(l, t);
    }
  }
  var jn = !0;
  function t1(l, t, a, u) {
    var e = S.T;
    S.T = null;
    var n = A.p;
    try {
      A.p = 2, ac(l, t, a, u);
    } finally {
      A.p = n, S.T = e;
    }
  }
  function a1(l, t, a, u) {
    var e = S.T;
    S.T = null;
    var n = A.p;
    try {
      A.p = 8, ac(l, t, a, u);
    } finally {
      A.p = n, S.T = e;
    }
  }
  function ac(l, t, a, u) {
    if (jn) {
      var e = uc(u);
      if (e === null)
        Zf(
          l,
          t,
          u,
          Bn,
          a
        ), h0(l, u);
      else if (e1(
        e,
        l,
        t,
        a,
        u
      ))
        u.stopPropagation();
      else if (h0(l, u), t & 4 && -1 < u1.indexOf(l)) {
        for (; e !== null; ) {
          var n = Ja(e);
          if (n !== null)
            switch (n.tag) {
              case 3:
                if (n = n.stateNode, n.current.memoizedState.isDehydrated) {
                  var i = _a(n.pendingLanes);
                  if (i !== 0) {
                    var f = n;
                    for (f.pendingLanes |= 2, f.entangledLanes |= 2; i; ) {
                      var c = 1 << 31 - nt(i);
                      f.entanglements[1] |= c, i &= ~c;
                    }
                    Ct(n), (ul & 6) === 0 && (Sn = ut() + 500, oe(0));
                  }
                }
                break;
              case 31:
              case 13:
                f = Ua(n, 2), f !== null && tt(f, n, 2), zn(), tc(n, 2);
            }
          if (n = uc(u), n === null && Zf(
            l,
            t,
            u,
            Bn,
            a
          ), n === e) break;
          e = n;
        }
        e !== null && u.stopPropagation();
      } else
        Zf(
          l,
          t,
          u,
          null,
          a
        );
    }
  }
  function uc(l) {
    return l = ei(l), ec(l);
  }
  var Bn = null;
  function ec(l) {
    if (Bn = null, l = Ka(l), l !== null) {
      var t = K(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = J(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = ll(t), l !== null) return l;
          l = null;
        } else if (a === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated)
            return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return Bn = l, null;
  }
  function r0(l) {
    switch (l) {
      case "beforetoggle":
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "resize":
      case "seeked":
      case "submit":
      case "toggle":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 2;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "scroll":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 8;
      case "message":
        switch (Z0()) {
          case Tc:
            return 2;
          case Ec:
            return 8;
          case Ae:
          case V0:
            return 32;
          case Ac:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var nc = !1, Sa = null, ba = null, za = null, Se = /* @__PURE__ */ new Map(), be = /* @__PURE__ */ new Map(), pa = [], u1 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function h0(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        Sa = null;
        break;
      case "dragenter":
      case "dragleave":
        ba = null;
        break;
      case "mouseover":
      case "mouseout":
        za = null;
        break;
      case "pointerover":
      case "pointerout":
        Se.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        be.delete(t.pointerId);
    }
  }
  function ze(l, t, a, u, e, n) {
    return l === null || l.nativeEvent !== n ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: u,
      nativeEvent: n,
      targetContainers: [e]
    }, t !== null && (t = Ja(t), t !== null && y0(t)), l) : (l.eventSystemFlags |= u, t = l.targetContainers, e !== null && t.indexOf(e) === -1 && t.push(e), l);
  }
  function e1(l, t, a, u, e) {
    switch (t) {
      case "focusin":
        return Sa = ze(
          Sa,
          l,
          t,
          a,
          u,
          e
        ), !0;
      case "dragenter":
        return ba = ze(
          ba,
          l,
          t,
          a,
          u,
          e
        ), !0;
      case "mouseover":
        return za = ze(
          za,
          l,
          t,
          a,
          u,
          e
        ), !0;
      case "pointerover":
        var n = e.pointerId;
        return Se.set(
          n,
          ze(
            Se.get(n) || null,
            l,
            t,
            a,
            u,
            e
          )
        ), !0;
      case "gotpointercapture":
        return n = e.pointerId, be.set(
          n,
          ze(
            be.get(n) || null,
            l,
            t,
            a,
            u,
            e
          )
        ), !0;
    }
    return !1;
  }
  function g0(l) {
    var t = Ka(l.target);
    if (t !== null) {
      var a = K(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = J(a), t !== null) {
            l.blockedOn = t, Uc(l.priority, function() {
              m0(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = ll(a), t !== null) {
            l.blockedOn = t, Uc(l.priority, function() {
              m0(a);
            });
            return;
          }
        } else if (t === 3 && a.stateNode.current.memoizedState.isDehydrated) {
          l.blockedOn = a.tag === 3 ? a.stateNode.containerInfo : null;
          return;
        }
      }
    }
    l.blockedOn = null;
  }
  function qn(l) {
    if (l.blockedOn !== null) return !1;
    for (var t = l.targetContainers; 0 < t.length; ) {
      var a = uc(l.nativeEvent);
      if (a === null) {
        a = l.nativeEvent;
        var u = new a.constructor(
          a.type,
          a
        );
        ui = u, a.target.dispatchEvent(u), ui = null;
      } else
        return t = Ja(a), t !== null && y0(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function S0(l, t, a) {
    qn(l) && a.delete(t);
  }
  function n1() {
    nc = !1, Sa !== null && qn(Sa) && (Sa = null), ba !== null && qn(ba) && (ba = null), za !== null && qn(za) && (za = null), Se.forEach(S0), be.forEach(S0);
  }
  function Yn(l, t) {
    l.blockedOn === t && (l.blockedOn = null, nc || (nc = !0, E.unstable_scheduleCallback(
      E.unstable_NormalPriority,
      n1
    )));
  }
  var Gn = null;
  function b0(l) {
    Gn !== l && (Gn = l, E.unstable_scheduleCallback(
      E.unstable_NormalPriority,
      function() {
        Gn === l && (Gn = null);
        for (var t = 0; t < l.length; t += 3) {
          var a = l[t], u = l[t + 1], e = l[t + 2];
          if (typeof u != "function") {
            if (ec(u || a) === null)
              continue;
            break;
          }
          var n = Ja(a);
          n !== null && (l.splice(t, 3), t -= 3, af(
            n,
            {
              pending: !0,
              data: e,
              method: a.method,
              action: u
            },
            u,
            e
          ));
        }
      }
    ));
  }
  function xu(l) {
    function t(c) {
      return Yn(c, l);
    }
    Sa !== null && Yn(Sa, l), ba !== null && Yn(ba, l), za !== null && Yn(za, l), Se.forEach(t), be.forEach(t);
    for (var a = 0; a < pa.length; a++) {
      var u = pa[a];
      u.blockedOn === l && (u.blockedOn = null);
    }
    for (; 0 < pa.length && (a = pa[0], a.blockedOn === null); )
      g0(a), a.blockedOn === null && pa.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null)
      for (u = 0; u < a.length; u += 3) {
        var e = a[u], n = a[u + 1], i = e[$l] || null;
        if (typeof n == "function")
          i || b0(a);
        else if (i) {
          var f = null;
          if (n && n.hasAttribute("formAction")) {
            if (e = n, i = n[$l] || null)
              f = i.formAction;
            else if (ec(e) !== null) continue;
          } else f = i.action;
          typeof f == "function" ? a[u + 1] = f : (a.splice(u, 3), u -= 3), b0(a);
        }
      }
  }
  function z0() {
    function l(n) {
      n.canIntercept && n.info === "react-transition" && n.intercept({
        handler: function() {
          return new Promise(function(i) {
            return e = i;
          });
        },
        focusReset: "manual",
        scroll: "manual"
      });
    }
    function t() {
      e !== null && (e(), e = null), u || setTimeout(a, 20);
    }
    function a() {
      if (!u && !navigation.transition) {
        var n = navigation.currentEntry;
        n && n.url != null && navigation.navigate(n.url, {
          state: n.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var u = !1, e = null;
      return navigation.addEventListener("navigate", l), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(a, 100), function() {
        u = !0, navigation.removeEventListener("navigate", l), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), e !== null && (e(), e = null);
      };
    }
  }
  function ic(l) {
    this._internalRoot = l;
  }
  Xn.prototype.render = ic.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(v(409));
    var a = t.current, u = vt();
    o0(a, u, l, t, null, null);
  }, Xn.prototype.unmount = ic.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      o0(l.current, 2, null, l, null, null), zn(), t[La] = null;
    }
  };
  function Xn(l) {
    this._internalRoot = l;
  }
  Xn.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = Oc();
      l = { blockedOn: null, target: l, priority: t };
      for (var a = 0; a < pa.length && t !== 0 && t < pa[a].priority; a++) ;
      pa.splice(a, 0, l), a === 0 && g0(l);
    }
  };
  var p0 = R.version;
  if (p0 !== "19.2.4")
    throw Error(
      v(
        527,
        p0,
        "19.2.4"
      )
    );
  A.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(v(188)) : (l = Object.keys(l).join(","), Error(v(268, l)));
    return l = z(t), l = l !== null ? L(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var i1 = {
    bundleType: 0,
    version: "19.2.4",
    rendererPackageName: "react-dom",
    currentDispatcherRef: S,
    reconcilerVersion: "19.2.4"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Qn = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Qn.isDisabled && Qn.supportsFiber)
      try {
        Ou = Qn.inject(
          i1
        ), et = Qn;
      } catch {
      }
  }
  return Te.createRoot = function(l, t) {
    if (!B(l)) throw Error(v(299));
    var a = !1, u = "", e = xd, n = Dd, i = Od;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (e = t.onUncaughtError), t.onCaughtError !== void 0 && (n = t.onCaughtError), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = s0(
      l,
      1,
      !1,
      null,
      null,
      a,
      u,
      null,
      e,
      n,
      i,
      z0
    ), l[La] = t.current, Qf(l), new ic(t);
  }, Te.hydrateRoot = function(l, t, a) {
    if (!B(l)) throw Error(v(299));
    var u = !1, e = "", n = xd, i = Dd, f = Od, c = null;
    return a != null && (a.unstable_strictMode === !0 && (u = !0), a.identifierPrefix !== void 0 && (e = a.identifierPrefix), a.onUncaughtError !== void 0 && (n = a.onUncaughtError), a.onCaughtError !== void 0 && (i = a.onCaughtError), a.onRecoverableError !== void 0 && (f = a.onRecoverableError), a.formState !== void 0 && (c = a.formState)), t = s0(
      l,
      1,
      !0,
      t,
      a ?? null,
      u,
      e,
      c,
      n,
      i,
      f,
      z0
    ), t.context = d0(null), a = t.current, u = vt(), u = $n(u), e = ia(u), e.callback = null, fa(a, e, u), a = u, t.current.lanes = a, Hu(t, a), Ct(t), l[La] = t.current, Qf(l), new Xn(t);
  }, Te.version = "19.2.4", Te;
}
var H0;
function h1() {
  if (H0) return cc.exports;
  H0 = 1;
  function E() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(E);
      } catch (R) {
        console.error(R);
      }
  }
  return E(), cc.exports = r1(), cc.exports;
}
var g1 = h1(), gl = gc();
const S1 = "calendar", N0 = "events";
function Sc() {
  return window.__khadim(S1);
}
async function b1() {
  const E = await Sc().store.get(N0);
  if (!E) return [];
  try {
    return JSON.parse(E);
  } catch {
    return [];
  }
}
async function C0(E) {
  await Sc().store.set(N0, JSON.stringify(E));
}
function z1() {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function p1(E) {
  return Sc().events.on("calendar_updated", E);
}
function bc() {
  const [E, R] = gl.useState([]), [N, v] = gl.useState(!0), B = gl.useCallback(async () => {
    const ll = await b1();
    R(ll), v(!1);
  }, []);
  gl.useEffect(() => (B(), p1(B)), [B]);
  const K = gl.useCallback(
    async (ll) => {
      const x = { id: z1(), ...ll }, z = [...E, x];
      await C0(z), R(z);
    },
    [E]
  ), J = gl.useCallback(
    async (ll) => {
      const x = E.filter((z) => z.id !== ll);
      await C0(x), R(x);
    },
    [E]
  );
  return { events: E, loading: N, refresh: B, addEvent: K, deleteEvent: J };
}
function T1(E) {
  const R = new Date(E);
  return isNaN(R.getTime()) ? E : R.toLocaleDateString(void 0, { month: "short", day: "numeric" });
}
function rc(E) {
  const R = new Date(E);
  return isNaN(R.getTime()) ? "" : R.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
}
function hc(E, R) {
  return E?.slice(0, 10) === R?.slice(0, 10);
}
const R0 = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
], E1 = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.5)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
}, A1 = {
  background: "var(--surface-elevated, #1e2130)",
  border: "1px solid var(--glass-border-strong, rgba(255,255,255,0.15))",
  borderRadius: "16px",
  padding: "20px",
  width: "340px",
  boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  color: "var(--text-primary, #e2e8f0)",
  fontFamily: "inherit"
}, j0 = {
  background: "var(--glass-bg, rgba(255,255,255,0.06))",
  border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
  color: "var(--text-primary, #e2e8f0)",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "12px",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  fontFamily: "inherit"
}, B0 = {
  fontSize: "10px",
  fontWeight: 700,
  color: "var(--text-muted, #94a3b8)",
  marginBottom: "3px",
  display: "block"
};
function yc({
  label: E,
  type: R,
  value: N,
  onChange: v,
  placeholder: B
}) {
  return /* @__PURE__ */ M.jsxs("div", { children: [
    /* @__PURE__ */ M.jsx("label", { style: B0, children: E }),
    /* @__PURE__ */ M.jsx(
      "input",
      {
        style: j0,
        type: R,
        value: N,
        placeholder: B,
        onChange: (K) => v(K.target.value)
      }
    )
  ] });
}
function q0({ prefillDate: E, onClose: R }) {
  const { addEvent: N } = bc(), [v, B] = gl.useState(""), [K, J] = gl.useState(E ? `${E}T09:00` : ""), [ll, x] = gl.useState(E ? `${E}T10:00` : ""), [z, L] = gl.useState(""), [H, el] = gl.useState(""), Dl = gl.useRef(null);
  gl.useEffect(() => {
    Dl.current?.focus();
  }, []);
  const El = async () => {
    if (!v.trim() || !K || !ll) {
      el("Title, start and end are required.");
      return;
    }
    await N({ title: v.trim(), start: K, end: ll, description: z.trim(), all_day: !1 }), R();
  }, Sl = (zl) => {
    zl.target === zl.currentTarget && R();
  };
  return /* @__PURE__ */ M.jsx("div", { style: E1, onClick: Sl, children: /* @__PURE__ */ M.jsxs("div", { style: A1, children: [
    /* @__PURE__ */ M.jsx("h3", { style: { margin: 0, fontSize: "14px", fontWeight: 700 }, children: "New Event" }),
    /* @__PURE__ */ M.jsxs("div", { children: [
      /* @__PURE__ */ M.jsx("label", { style: B0, children: "Title" }),
      /* @__PURE__ */ M.jsx(
        "input",
        {
          ref: Dl,
          style: j0,
          type: "text",
          value: v,
          placeholder: "Meeting, deadline, appointment…",
          onChange: (zl) => B(zl.target.value),
          onKeyDown: (zl) => zl.key === "Enter" && El()
        }
      )
    ] }),
    /* @__PURE__ */ M.jsx(yc, { label: "Start", type: "datetime-local", value: K, onChange: J }),
    /* @__PURE__ */ M.jsx(yc, { label: "End", type: "datetime-local", value: ll, onChange: x }),
    /* @__PURE__ */ M.jsx(yc, { label: "Description (optional)", type: "text", value: z, onChange: L }),
    H && /* @__PURE__ */ M.jsx("p", { style: { margin: 0, fontSize: "11px", color: "var(--color-danger, #f87171)" }, children: H }),
    /* @__PURE__ */ M.jsxs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
      /* @__PURE__ */ M.jsx(
        "button",
        {
          onClick: R,
          style: {
            background: "var(--glass-bg, rgba(255,255,255,0.06))",
            border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
            color: "var(--text-primary, #e2e8f0)",
            borderRadius: "8px",
            padding: "6px 14px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Cancel"
        }
      ),
      /* @__PURE__ */ M.jsx(
        "button",
        {
          onClick: El,
          style: {
            background: "var(--surface-ink-solid, #6366f1)",
            border: "none",
            color: "#fff",
            borderRadius: "8px",
            padding: "6px 14px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer"
          },
          children: "Add Event"
        }
      )
    ] })
  ] }) });
}
const at = {
  root: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    padding: "12px",
    gap: "8px",
    fontFamily: "inherit",
    color: "var(--text-primary, #e2e8f0)"
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  navBtn: {
    background: "var(--glass-bg, rgba(255,255,255,0.06))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
    color: "var(--text-primary, #e2e8f0)",
    borderRadius: "8px",
    padding: "2px 10px",
    fontSize: "13px",
    cursor: "pointer"
  },
  monthLabel: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--text-primary, #e2e8f0)"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "1px"
  },
  dayHeader: {
    textAlign: "center",
    fontSize: "9px",
    fontWeight: 700,
    color: "var(--text-muted, #94a3b8)",
    padding: "3px 0"
  },
  divider: {
    height: "1px",
    background: "var(--glass-border, rgba(255,255,255,0.08))",
    margin: "4px 0"
  },
  label: {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--text-muted, #94a3b8)",
    letterSpacing: "0.05em"
  },
  list: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  eventItem: {
    padding: "6px 8px",
    borderRadius: "8px",
    background: "var(--glass-bg, rgba(255,255,255,0.04))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
    cursor: "pointer"
  },
  eventTitle: {
    fontSize: "11px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  eventTime: {
    fontSize: "10px",
    color: "var(--text-muted, #94a3b8)",
    marginTop: "1px"
  },
  addBtn: {
    width: "100%",
    marginTop: "4px",
    background: "var(--surface-ink-solid, #6366f1)",
    color: "var(--text-inverse, #fff)",
    border: "none",
    borderRadius: "10px",
    padding: "7px 0",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer"
  }
};
function _1({ day: E, iso: R, isToday: N, hasEvent: v, onClick: B }) {
  const [K, J] = gl.useState(!1);
  return /* @__PURE__ */ M.jsxs(
    "button",
    {
      onClick: B,
      onMouseEnter: () => J(!0),
      onMouseLeave: () => J(!1),
      style: {
        aspectRatio: "1",
        border: "none",
        cursor: "pointer",
        borderRadius: "6px",
        fontSize: "10px",
        fontWeight: N ? 800 : 500,
        background: N ? "var(--surface-ink-solid, #6366f1)" : K ? "var(--glass-bg-strong, rgba(255,255,255,0.1))" : "transparent",
        color: N ? "var(--text-inverse, #fff)" : "var(--text-primary, #e2e8f0)",
        position: "relative"
      },
      children: [
        E,
        v && /* @__PURE__ */ M.jsx(
          "span",
          {
            style: {
              position: "absolute",
              bottom: "2px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: N ? "var(--text-inverse, #fff)" : "var(--color-accent, #6366f1)"
            }
          }
        )
      ]
    }
  );
}
function M1() {
  const E = /* @__PURE__ */ new Date(), [R, N] = gl.useState(E.getFullYear()), [v, B] = gl.useState(E.getMonth()), [K, J] = gl.useState(!1), [ll, x] = gl.useState(null), { events: z } = bc(), L = E.toISOString().slice(0, 10), H = new Date(R, v, 1).getDay(), el = new Date(R, v + 1, 0).getDate(), Dl = () => {
    v === 0 ? (B(11), N((I) => I - 1)) : B((I) => I - 1);
  }, El = () => {
    v === 11 ? (B(0), N((I) => I + 1)) : B((I) => I + 1);
  }, Sl = (/* @__PURE__ */ new Date()).toISOString(), zl = z.filter((I) => I.end >= Sl).sort((I, Vl) => I.start.localeCompare(Vl.start)).slice(0, 10);
  return /* @__PURE__ */ M.jsxs("div", { style: at.root, children: [
    /* @__PURE__ */ M.jsxs("div", { style: at.nav, children: [
      /* @__PURE__ */ M.jsx("button", { style: at.navBtn, onClick: Dl, children: "‹" }),
      /* @__PURE__ */ M.jsxs("span", { style: at.monthLabel, children: [
        R0[v],
        " ",
        R
      ] }),
      /* @__PURE__ */ M.jsx("button", { style: at.navBtn, onClick: El, children: "›" })
    ] }),
    /* @__PURE__ */ M.jsxs("div", { style: at.grid, children: [
      ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((I) => /* @__PURE__ */ M.jsx("div", { style: at.dayHeader, children: I }, I)),
      Array.from({ length: H }, (I, Vl) => /* @__PURE__ */ M.jsx("div", {}, `e${Vl}`)),
      Array.from({ length: el }, (I, Vl) => {
        const bl = Vl + 1, G = `${R}-${String(v + 1).padStart(2, "0")}-${String(bl).padStart(2, "0")}`;
        return /* @__PURE__ */ M.jsx(
          _1,
          {
            day: bl,
            iso: G,
            isToday: G === L,
            hasEvent: z.some((Ol) => hc(Ol.start, G)),
            onClick: () => {
              x(G), J(!0);
            }
          },
          bl
        );
      })
    ] }),
    /* @__PURE__ */ M.jsx("div", { style: at.divider }),
    /* @__PURE__ */ M.jsx("div", { style: at.label, children: zl.length ? "UPCOMING" : "NO UPCOMING EVENTS" }),
    /* @__PURE__ */ M.jsx("div", { style: at.list, children: zl.map((I) => /* @__PURE__ */ M.jsx(x1, { ev: I }, I.id)) }),
    /* @__PURE__ */ M.jsx("button", { style: at.addBtn, onClick: () => {
      x(null), J(!0);
    }, children: "+ Add Event" }),
    K && /* @__PURE__ */ M.jsx(
      q0,
      {
        prefillDate: ll,
        onClose: () => J(!1)
      }
    )
  ] });
}
function x1({ ev: E }) {
  const [R, N] = gl.useState(!1);
  return /* @__PURE__ */ M.jsxs(
    "div",
    {
      style: {
        ...at.eventItem,
        background: R ? "var(--glass-bg-strong, rgba(255,255,255,0.08))" : "var(--glass-bg, rgba(255,255,255,0.04))"
      },
      onMouseEnter: () => N(!0),
      onMouseLeave: () => N(!1),
      children: [
        /* @__PURE__ */ M.jsx("div", { style: at.eventTitle, children: E.title }),
        /* @__PURE__ */ M.jsxs("div", { style: at.eventTime, children: [
          T1(E.start),
          " ",
          rc(E.start)
        ] })
      ]
    }
  );
}
const xl = {
  root: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    background: "var(--surface-bg, #131520)",
    fontFamily: "inherit",
    color: "var(--text-primary, #e2e8f0)"
  },
  topBar: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid var(--glass-border, rgba(255,255,255,0.08))"
  },
  navGroup: { display: "flex", alignItems: "center", gap: "8px" },
  navBtn: {
    background: "var(--glass-bg, rgba(255,255,255,0.06))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
    color: "var(--text-primary, #e2e8f0)",
    borderRadius: "8px",
    padding: "4px 12px",
    fontSize: "14px",
    cursor: "pointer"
  },
  monthTitle: { margin: 0, fontSize: "16px", fontWeight: 700, minWidth: "180px", textAlign: "center" },
  todayBtn: {
    background: "var(--glass-bg, rgba(255,255,255,0.06))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
    color: "var(--text-primary, #e2e8f0)",
    borderRadius: "8px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer"
  },
  addBtn: {
    background: "var(--surface-ink-solid, #6366f1)",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer"
  },
  body: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" },
  gridCol: {
    flex: 1,
    overflow: "hidden",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  },
  dayHeaders: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "4px"
  },
  dayHeader: {
    textAlign: "center",
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--text-muted, #94a3b8)",
    padding: "4px"
  },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "4px",
    flex: 1
  },
  sidePanel: {
    width: "260px",
    borderLeft: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
    padding: "16px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  sidePanelDate: { fontSize: "12px", fontWeight: 700 },
  eventCard: {
    padding: "10px",
    borderRadius: "10px",
    background: "var(--glass-bg, rgba(255,255,255,0.04))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  eventCardTitle: { fontSize: "12px", fontWeight: 700 },
  eventCardTime: { fontSize: "10px", color: "var(--text-muted, #94a3b8)" },
  eventCardDesc: { fontSize: "10px", color: "var(--text-secondary, #cbd5e1)", marginTop: "2px" },
  deleteBtn: {
    alignSelf: "flex-start",
    marginTop: "4px",
    background: "transparent",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#f87171",
    borderRadius: "6px",
    padding: "3px 10px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer"
  },
  sidePanelAddBtn: {
    width: "100%",
    background: "var(--surface-ink-solid, #6366f1)",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    padding: "7px 0",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer"
  }
};
function mc({ day: E, isToday: R, isSelected: N, isCurrentMonth: v, dayEvents: B, onClick: K }) {
  const [J, ll] = gl.useState(!1), x = N ? "var(--glass-bg-strong, rgba(255,255,255,0.08))" : J ? "var(--glass-bg-strong, rgba(255,255,255,0.06))" : "var(--glass-bg, rgba(255,255,255,0.03))", z = N ? "1px solid var(--color-accent, #6366f1)" : "1px solid var(--glass-border, rgba(255,255,255,0.06))";
  return /* @__PURE__ */ M.jsxs(
    "div",
    {
      onClick: K,
      onMouseEnter: () => ll(!0),
      onMouseLeave: () => ll(!1),
      style: {
        borderRadius: "8px",
        padding: "6px",
        minHeight: "60px",
        cursor: "pointer",
        background: v ? x : "var(--glass-bg, rgba(255,255,255,0.02))",
        border: z,
        opacity: v ? 1 : 0.3,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        overflow: "hidden",
        transition: "background 0.12s, border-color 0.12s"
      },
      children: [
        /* @__PURE__ */ M.jsx(
          "div",
          {
            style: {
              fontSize: "11px",
              fontWeight: R ? 800 : 500,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: R ? "var(--surface-ink-solid, #6366f1)" : "transparent",
              color: R ? "var(--text-inverse, #fff)" : "var(--text-primary, #e2e8f0)"
            },
            children: E
          }
        ),
        B.slice(0, 2).map((L) => /* @__PURE__ */ M.jsx(
          "div",
          {
            style: {
              fontSize: "9px",
              fontWeight: 600,
              background: "var(--color-accent, #6366f1)",
              opacity: 0.9,
              color: "#fff",
              borderRadius: "4px",
              padding: "1px 4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            },
            children: L.title
          },
          L.id
        )),
        B.length > 2 && /* @__PURE__ */ M.jsxs("div", { style: { fontSize: "9px", color: "var(--text-muted, #94a3b8)" }, children: [
          "+",
          B.length - 2,
          " more"
        ] })
      ]
    }
  );
}
function D1() {
  const E = /* @__PURE__ */ new Date(), R = E.toISOString().slice(0, 10), [N, v] = gl.useState(E.getFullYear()), [B, K] = gl.useState(E.getMonth()), [J, ll] = gl.useState(R), [x, z] = gl.useState(!1), { events: L, deleteEvent: H } = bc(), el = () => {
    B === 0 ? (K(11), v((G) => G - 1)) : K((G) => G - 1);
  }, Dl = () => {
    B === 11 ? (K(0), v((G) => G + 1)) : K((G) => G + 1);
  }, El = () => {
    v(E.getFullYear()), K(E.getMonth()), ll(R);
  }, Sl = new Date(N, B, 1).getDay(), zl = new Date(N, B + 1, 0).getDate(), I = new Date(N, B, 0).getDate(), Vl = (7 - (Sl + zl) % 7) % 7, bl = J ? L.filter((G) => hc(G.start, J)) : [];
  return /* @__PURE__ */ M.jsxs("div", { style: xl.root, children: [
    /* @__PURE__ */ M.jsxs("div", { style: xl.topBar, children: [
      /* @__PURE__ */ M.jsxs("div", { style: xl.navGroup, children: [
        /* @__PURE__ */ M.jsx("button", { style: xl.navBtn, onClick: el, children: "‹" }),
        /* @__PURE__ */ M.jsxs("h2", { style: xl.monthTitle, children: [
          R0[B],
          " ",
          N
        ] }),
        /* @__PURE__ */ M.jsx("button", { style: xl.navBtn, onClick: Dl, children: "›" })
      ] }),
      /* @__PURE__ */ M.jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
        /* @__PURE__ */ M.jsx("button", { style: xl.todayBtn, onClick: El, children: "Today" }),
        /* @__PURE__ */ M.jsx("button", { style: xl.addBtn, onClick: () => z(!0), children: "+ New Event" })
      ] })
    ] }),
    /* @__PURE__ */ M.jsxs("div", { style: xl.body, children: [
      /* @__PURE__ */ M.jsxs("div", { style: xl.gridCol, children: [
        /* @__PURE__ */ M.jsx("div", { style: xl.dayHeaders, children: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((G) => /* @__PURE__ */ M.jsx("div", { style: xl.dayHeader, children: G }, G)) }),
        /* @__PURE__ */ M.jsxs("div", { style: xl.daysGrid, children: [
          Array.from({ length: Sl }, (G, Ol) => {
            const Rl = I - Sl + Ol + 1;
            return /* @__PURE__ */ M.jsx(
              mc,
              {
                day: Rl,
                iso: "",
                isToday: !1,
                isSelected: !1,
                isCurrentMonth: !1,
                dayEvents: [],
                onClick: () => {
                }
              },
              `prev-${Ol}`
            );
          }),
          Array.from({ length: zl }, (G, Ol) => {
            const Rl = Ol + 1, X = `${N}-${String(B + 1).padStart(2, "0")}-${String(Rl).padStart(2, "0")}`;
            return /* @__PURE__ */ M.jsx(
              mc,
              {
                day: Rl,
                iso: X,
                isToday: X === R,
                isSelected: X === J,
                isCurrentMonth: !0,
                dayEvents: L.filter((Ll) => hc(Ll.start, X)),
                onClick: () => ll(X)
              },
              X
            );
          }),
          Array.from({ length: Vl }, (G, Ol) => /* @__PURE__ */ M.jsx(
            mc,
            {
              day: Ol + 1,
              iso: "",
              isToday: !1,
              isSelected: !1,
              isCurrentMonth: !1,
              dayEvents: [],
              onClick: () => {
              }
            },
            `next-${Ol}`
          ))
        ] })
      ] }),
      /* @__PURE__ */ M.jsxs("div", { style: xl.sidePanel, children: [
        /* @__PURE__ */ M.jsx("div", { style: xl.sidePanelDate, children: J ? (/* @__PURE__ */ new Date(J + "T00:00")).toLocaleDateString(void 0, {
          weekday: "long",
          month: "long",
          day: "numeric"
        }) : "Select a day" }),
        J && /* @__PURE__ */ M.jsxs(M.Fragment, { children: [
          bl.length === 0 && /* @__PURE__ */ M.jsx("div", { style: { fontSize: "11px", color: "var(--text-muted, #94a3b8)" }, children: "No events. Click + New Event to add one." }),
          bl.map((G) => /* @__PURE__ */ M.jsxs("div", { style: xl.eventCard, children: [
            /* @__PURE__ */ M.jsx("div", { style: xl.eventCardTitle, children: G.title }),
            /* @__PURE__ */ M.jsx("div", { style: xl.eventCardTime, children: G.all_day ? "All day" : `${rc(G.start)} – ${rc(G.end)}` }),
            G.description && /* @__PURE__ */ M.jsx("div", { style: xl.eventCardDesc, children: G.description }),
            /* @__PURE__ */ M.jsx("button", { style: xl.deleteBtn, onClick: () => H(G.id), children: "Delete" })
          ] }, G.id)),
          /* @__PURE__ */ M.jsx("button", { style: xl.sidePanelAddBtn, onClick: () => z(!0), children: "+ Add Event" })
        ] })
      ] })
    ] }),
    x && /* @__PURE__ */ M.jsx(
      q0,
      {
        prefillDate: J,
        onClose: () => z(!1)
      }
    )
  ] });
}
class Y0 extends HTMLElement {
  root = null;
  connectedCallback() {
    this.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;width:100%;", this.root = g1.createRoot(this), this.renderApp();
  }
  disconnectedCallback() {
    this.root?.unmount(), this.root = null;
  }
  renderApp() {
  }
}
class O1 extends Y0 {
  renderApp() {
    this.root?.render(/* @__PURE__ */ M.jsx(M1, {}));
  }
}
class U1 extends Y0 {
  renderApp() {
    this.root?.render(/* @__PURE__ */ M.jsx(D1, {}));
  }
}
customElements.get("khadim-calendar-sidebar") || customElements.define("khadim-calendar-sidebar", O1);
customElements.get("khadim-calendar-content") || customElements.define("khadim-calendar-content", U1);
