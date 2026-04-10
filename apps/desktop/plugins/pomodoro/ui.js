var rf = { exports: {} }, pu = {};
var pr;
function sv() {
  if (pr) return pu;
  pr = 1;
  var r = /* @__PURE__ */ Symbol.for("react.transitional.element"), H = /* @__PURE__ */ Symbol.for("react.fragment");
  function C(m, R, Z) {
    var V = null;
    if (Z !== void 0 && (V = "" + Z), R.key !== void 0 && (V = "" + R.key), "key" in R) {
      Z = {};
      for (var X in R)
        X !== "key" && (Z[X] = R[X]);
    } else Z = R;
    return R = Z.ref, {
      $$typeof: r,
      type: m,
      key: V,
      ref: R !== void 0 ? R : null,
      props: Z
    };
  }
  return pu.Fragment = H, pu.jsx = C, pu.jsxs = C, pu;
}
var zr;
function ov() {
  return zr || (zr = 1, rf.exports = sv()), rf.exports;
}
var g = ov(), mf = { exports: {} }, zu = {}, vf = { exports: {} }, hf = {};
var Tr;
function dv() {
  return Tr || (Tr = 1, (function(r) {
    function H(p, N) {
      var Q = p.length;
      p.push(N);
      l: for (; 0 < Q; ) {
        var sl = Q - 1 >>> 1, ml = p[sl];
        if (0 < R(ml, N))
          p[sl] = N, p[Q] = ml, Q = sl;
        else break l;
      }
    }
    function C(p) {
      return p.length === 0 ? null : p[0];
    }
    function m(p) {
      if (p.length === 0) return null;
      var N = p[0], Q = p.pop();
      if (Q !== N) {
        p[0] = Q;
        l: for (var sl = 0, ml = p.length, o = ml >>> 1; sl < o; ) {
          var E = 2 * (sl + 1) - 1, O = p[E], j = E + 1, K = p[j];
          if (0 > R(O, Q))
            j < ml && 0 > R(K, O) ? (p[sl] = K, p[j] = Q, sl = j) : (p[sl] = O, p[E] = Q, sl = E);
          else if (j < ml && 0 > R(K, Q))
            p[sl] = K, p[j] = Q, sl = j;
          else break l;
        }
      }
      return N;
    }
    function R(p, N) {
      var Q = p.sortIndex - N.sortIndex;
      return Q !== 0 ? Q : p.id - N.id;
    }
    if (r.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var Z = performance;
      r.unstable_now = function() {
        return Z.now();
      };
    } else {
      var V = Date, X = V.now();
      r.unstable_now = function() {
        return V.now() - X;
      };
    }
    var M = [], v = [], A = 1, _ = null, Y = 3, B = !1, hl = !1, nl = !1, Xl = !1, Dl = typeof setTimeout == "function" ? setTimeout : null, lt = typeof clearTimeout == "function" ? clearTimeout : null, _l = typeof setImmediate < "u" ? setImmediate : null;
    function Rl(p) {
      for (var N = C(v); N !== null; ) {
        if (N.callback === null) m(v);
        else if (N.startTime <= p)
          m(v), N.sortIndex = N.expirationTime, H(M, N);
        else break;
        N = C(v);
      }
    }
    function jl(p) {
      if (nl = !1, Rl(p), !hl)
        if (C(M) !== null)
          hl = !0, Sl || (Sl = !0, Jl());
        else {
          var N = C(v);
          N !== null && pt(jl, N.startTime - p);
        }
    }
    var Sl = !1, k = -1, Kl = 5, _t = -1;
    function Xa() {
      return Xl ? !0 : !(r.unstable_now() - _t < Kl);
    }
    function At() {
      if (Xl = !1, Sl) {
        var p = r.unstable_now();
        _t = p;
        var N = !0;
        try {
          l: {
            hl = !1, nl && (nl = !1, lt(k), k = -1), B = !0;
            var Q = Y;
            try {
              t: {
                for (Rl(p), _ = C(M); _ !== null && !(_.expirationTime > p && Xa()); ) {
                  var sl = _.callback;
                  if (typeof sl == "function") {
                    _.callback = null, Y = _.priorityLevel;
                    var ml = sl(
                      _.expirationTime <= p
                    );
                    if (p = r.unstable_now(), typeof ml == "function") {
                      _.callback = ml, Rl(p), N = !0;
                      break t;
                    }
                    _ === C(M) && m(M), Rl(p);
                  } else m(M);
                  _ = C(M);
                }
                if (_ !== null) N = !0;
                else {
                  var o = C(v);
                  o !== null && pt(
                    jl,
                    o.startTime - p
                  ), N = !1;
                }
              }
              break l;
            } finally {
              _ = null, Y = Q, B = !1;
            }
            N = void 0;
          }
        } finally {
          N ? Jl() : Sl = !1;
        }
      }
    }
    var Jl;
    if (typeof _l == "function")
      Jl = function() {
        _l(At);
      };
    else if (typeof MessageChannel < "u") {
      var pa = new MessageChannel(), jt = pa.port2;
      pa.port1.onmessage = At, Jl = function() {
        jt.postMessage(null);
      };
    } else
      Jl = function() {
        Dl(At, 0);
      };
    function pt(p, N) {
      k = Dl(function() {
        p(r.unstable_now());
      }, N);
    }
    r.unstable_IdlePriority = 5, r.unstable_ImmediatePriority = 1, r.unstable_LowPriority = 4, r.unstable_NormalPriority = 3, r.unstable_Profiling = null, r.unstable_UserBlockingPriority = 2, r.unstable_cancelCallback = function(p) {
      p.callback = null;
    }, r.unstable_forceFrameRate = function(p) {
      0 > p || 125 < p ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : Kl = 0 < p ? Math.floor(1e3 / p) : 5;
    }, r.unstable_getCurrentPriorityLevel = function() {
      return Y;
    }, r.unstable_next = function(p) {
      switch (Y) {
        case 1:
        case 2:
        case 3:
          var N = 3;
          break;
        default:
          N = Y;
      }
      var Q = Y;
      Y = N;
      try {
        return p();
      } finally {
        Y = Q;
      }
    }, r.unstable_requestPaint = function() {
      Xl = !0;
    }, r.unstable_runWithPriority = function(p, N) {
      switch (p) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          p = 3;
      }
      var Q = Y;
      Y = p;
      try {
        return N();
      } finally {
        Y = Q;
      }
    }, r.unstable_scheduleCallback = function(p, N, Q) {
      var sl = r.unstable_now();
      switch (typeof Q == "object" && Q !== null ? (Q = Q.delay, Q = typeof Q == "number" && 0 < Q ? sl + Q : sl) : Q = sl, p) {
        case 1:
          var ml = -1;
          break;
        case 2:
          ml = 250;
          break;
        case 5:
          ml = 1073741823;
          break;
        case 4:
          ml = 1e4;
          break;
        default:
          ml = 5e3;
      }
      return ml = Q + ml, p = {
        id: A++,
        callback: N,
        priorityLevel: p,
        startTime: Q,
        expirationTime: ml,
        sortIndex: -1
      }, Q > sl ? (p.sortIndex = Q, H(v, p), C(M) === null && p === C(v) && (nl ? (lt(k), k = -1) : nl = !0, pt(jl, Q - sl))) : (p.sortIndex = ml, H(M, p), hl || B || (hl = !0, Sl || (Sl = !0, Jl()))), p;
    }, r.unstable_shouldYield = Xa, r.unstable_wrapCallback = function(p) {
      var N = Y;
      return function() {
        var Q = Y;
        Y = N;
        try {
          return p.apply(this, arguments);
        } finally {
          Y = Q;
        }
      };
    };
  })(hf)), hf;
}
var Er;
function rv() {
  return Er || (Er = 1, vf.exports = dv()), vf.exports;
}
var yf = { exports: {} }, L = {};
var _r;
function mv() {
  if (_r) return L;
  _r = 1;
  var r = /* @__PURE__ */ Symbol.for("react.transitional.element"), H = /* @__PURE__ */ Symbol.for("react.portal"), C = /* @__PURE__ */ Symbol.for("react.fragment"), m = /* @__PURE__ */ Symbol.for("react.strict_mode"), R = /* @__PURE__ */ Symbol.for("react.profiler"), Z = /* @__PURE__ */ Symbol.for("react.consumer"), V = /* @__PURE__ */ Symbol.for("react.context"), X = /* @__PURE__ */ Symbol.for("react.forward_ref"), M = /* @__PURE__ */ Symbol.for("react.suspense"), v = /* @__PURE__ */ Symbol.for("react.memo"), A = /* @__PURE__ */ Symbol.for("react.lazy"), _ = /* @__PURE__ */ Symbol.for("react.activity"), Y = Symbol.iterator;
  function B(o) {
    return o === null || typeof o != "object" ? null : (o = Y && o[Y] || o["@@iterator"], typeof o == "function" ? o : null);
  }
  var hl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, nl = Object.assign, Xl = {};
  function Dl(o, E, O) {
    this.props = o, this.context = E, this.refs = Xl, this.updater = O || hl;
  }
  Dl.prototype.isReactComponent = {}, Dl.prototype.setState = function(o, E) {
    if (typeof o != "object" && typeof o != "function" && o != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, o, E, "setState");
  }, Dl.prototype.forceUpdate = function(o) {
    this.updater.enqueueForceUpdate(this, o, "forceUpdate");
  };
  function lt() {
  }
  lt.prototype = Dl.prototype;
  function _l(o, E, O) {
    this.props = o, this.context = E, this.refs = Xl, this.updater = O || hl;
  }
  var Rl = _l.prototype = new lt();
  Rl.constructor = _l, nl(Rl, Dl.prototype), Rl.isPureReactComponent = !0;
  var jl = Array.isArray;
  function Sl() {
  }
  var k = { H: null, A: null, T: null, S: null }, Kl = Object.prototype.hasOwnProperty;
  function _t(o, E, O) {
    var j = O.ref;
    return {
      $$typeof: r,
      type: o,
      key: E,
      ref: j !== void 0 ? j : null,
      props: O
    };
  }
  function Xa(o, E) {
    return _t(o.type, E, o.props);
  }
  function At(o) {
    return typeof o == "object" && o !== null && o.$$typeof === r;
  }
  function Jl(o) {
    var E = { "=": "=0", ":": "=2" };
    return "$" + o.replace(/[=:]/g, function(O) {
      return E[O];
    });
  }
  var pa = /\/+/g;
  function jt(o, E) {
    return typeof o == "object" && o !== null && o.key != null ? Jl("" + o.key) : E.toString(36);
  }
  function pt(o) {
    switch (o.status) {
      case "fulfilled":
        return o.value;
      case "rejected":
        throw o.reason;
      default:
        switch (typeof o.status == "string" ? o.then(Sl, Sl) : (o.status = "pending", o.then(
          function(E) {
            o.status === "pending" && (o.status = "fulfilled", o.value = E);
          },
          function(E) {
            o.status === "pending" && (o.status = "rejected", o.reason = E);
          }
        )), o.status) {
          case "fulfilled":
            return o.value;
          case "rejected":
            throw o.reason;
        }
    }
    throw o;
  }
  function p(o, E, O, j, K) {
    var W = typeof o;
    (W === "undefined" || W === "boolean") && (o = null);
    var il = !1;
    if (o === null) il = !0;
    else
      switch (W) {
        case "bigint":
        case "string":
        case "number":
          il = !0;
          break;
        case "object":
          switch (o.$$typeof) {
            case r:
            case H:
              il = !0;
              break;
            case A:
              return il = o._init, p(
                il(o._payload),
                E,
                O,
                j,
                K
              );
          }
      }
    if (il)
      return K = K(o), il = j === "" ? "." + jt(o, 0) : j, jl(K) ? (O = "", il != null && (O = il.replace(pa, "$&/") + "/"), p(K, E, O, "", function(Ne) {
        return Ne;
      })) : K != null && (At(K) && (K = Xa(
        K,
        O + (K.key == null || o && o.key === K.key ? "" : ("" + K.key).replace(
          pa,
          "$&/"
        ) + "/") + il
      )), E.push(K)), 1;
    il = 0;
    var Ll = j === "" ? "." : j + ":";
    if (jl(o))
      for (var zl = 0; zl < o.length; zl++)
        j = o[zl], W = Ll + jt(j, zl), il += p(
          j,
          E,
          O,
          W,
          K
        );
    else if (zl = B(o), typeof zl == "function")
      for (o = zl.call(o), zl = 0; !(j = o.next()).done; )
        j = j.value, W = Ll + jt(j, zl++), il += p(
          j,
          E,
          O,
          W,
          K
        );
    else if (W === "object") {
      if (typeof o.then == "function")
        return p(
          pt(o),
          E,
          O,
          j,
          K
        );
      throw E = String(o), Error(
        "Objects are not valid as a React child (found: " + (E === "[object Object]" ? "object with keys {" + Object.keys(o).join(", ") + "}" : E) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return il;
  }
  function N(o, E, O) {
    if (o == null) return o;
    var j = [], K = 0;
    return p(o, j, "", "", function(W) {
      return E.call(O, W, K++);
    }), j;
  }
  function Q(o) {
    if (o._status === -1) {
      var E = o._result;
      E = E(), E.then(
        function(O) {
          (o._status === 0 || o._status === -1) && (o._status = 1, o._result = O);
        },
        function(O) {
          (o._status === 0 || o._status === -1) && (o._status = 2, o._result = O);
        }
      ), o._status === -1 && (o._status = 0, o._result = E);
    }
    if (o._status === 1) return o._result.default;
    throw o._result;
  }
  var sl = typeof reportError == "function" ? reportError : function(o) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var E = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof o == "object" && o !== null && typeof o.message == "string" ? String(o.message) : String(o),
        error: o
      });
      if (!window.dispatchEvent(E)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", o);
      return;
    }
    console.error(o);
  }, ml = {
    map: N,
    forEach: function(o, E, O) {
      N(
        o,
        function() {
          E.apply(this, arguments);
        },
        O
      );
    },
    count: function(o) {
      var E = 0;
      return N(o, function() {
        E++;
      }), E;
    },
    toArray: function(o) {
      return N(o, function(E) {
        return E;
      }) || [];
    },
    only: function(o) {
      if (!At(o))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return o;
    }
  };
  return L.Activity = _, L.Children = ml, L.Component = Dl, L.Fragment = C, L.Profiler = R, L.PureComponent = _l, L.StrictMode = m, L.Suspense = M, L.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = k, L.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(o) {
      return k.H.useMemoCache(o);
    }
  }, L.cache = function(o) {
    return function() {
      return o.apply(null, arguments);
    };
  }, L.cacheSignal = function() {
    return null;
  }, L.cloneElement = function(o, E, O) {
    if (o == null)
      throw Error(
        "The argument must be a React element, but you passed " + o + "."
      );
    var j = nl({}, o.props), K = o.key;
    if (E != null)
      for (W in E.key !== void 0 && (K = "" + E.key), E)
        !Kl.call(E, W) || W === "key" || W === "__self" || W === "__source" || W === "ref" && E.ref === void 0 || (j[W] = E[W]);
    var W = arguments.length - 2;
    if (W === 1) j.children = O;
    else if (1 < W) {
      for (var il = Array(W), Ll = 0; Ll < W; Ll++)
        il[Ll] = arguments[Ll + 2];
      j.children = il;
    }
    return _t(o.type, K, j);
  }, L.createContext = function(o) {
    return o = {
      $$typeof: V,
      _currentValue: o,
      _currentValue2: o,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, o.Provider = o, o.Consumer = {
      $$typeof: Z,
      _context: o
    }, o;
  }, L.createElement = function(o, E, O) {
    var j, K = {}, W = null;
    if (E != null)
      for (j in E.key !== void 0 && (W = "" + E.key), E)
        Kl.call(E, j) && j !== "key" && j !== "__self" && j !== "__source" && (K[j] = E[j]);
    var il = arguments.length - 2;
    if (il === 1) K.children = O;
    else if (1 < il) {
      for (var Ll = Array(il), zl = 0; zl < il; zl++)
        Ll[zl] = arguments[zl + 2];
      K.children = Ll;
    }
    if (o && o.defaultProps)
      for (j in il = o.defaultProps, il)
        K[j] === void 0 && (K[j] = il[j]);
    return _t(o, W, K);
  }, L.createRef = function() {
    return { current: null };
  }, L.forwardRef = function(o) {
    return { $$typeof: X, render: o };
  }, L.isValidElement = At, L.lazy = function(o) {
    return {
      $$typeof: A,
      _payload: { _status: -1, _result: o },
      _init: Q
    };
  }, L.memo = function(o, E) {
    return {
      $$typeof: v,
      type: o,
      compare: E === void 0 ? null : E
    };
  }, L.startTransition = function(o) {
    var E = k.T, O = {};
    k.T = O;
    try {
      var j = o(), K = k.S;
      K !== null && K(O, j), typeof j == "object" && j !== null && typeof j.then == "function" && j.then(Sl, sl);
    } catch (W) {
      sl(W);
    } finally {
      E !== null && O.types !== null && (E.types = O.types), k.T = E;
    }
  }, L.unstable_useCacheRefresh = function() {
    return k.H.useCacheRefresh();
  }, L.use = function(o) {
    return k.H.use(o);
  }, L.useActionState = function(o, E, O) {
    return k.H.useActionState(o, E, O);
  }, L.useCallback = function(o, E) {
    return k.H.useCallback(o, E);
  }, L.useContext = function(o) {
    return k.H.useContext(o);
  }, L.useDebugValue = function() {
  }, L.useDeferredValue = function(o, E) {
    return k.H.useDeferredValue(o, E);
  }, L.useEffect = function(o, E) {
    return k.H.useEffect(o, E);
  }, L.useEffectEvent = function(o) {
    return k.H.useEffectEvent(o);
  }, L.useId = function() {
    return k.H.useId();
  }, L.useImperativeHandle = function(o, E, O) {
    return k.H.useImperativeHandle(o, E, O);
  }, L.useInsertionEffect = function(o, E) {
    return k.H.useInsertionEffect(o, E);
  }, L.useLayoutEffect = function(o, E) {
    return k.H.useLayoutEffect(o, E);
  }, L.useMemo = function(o, E) {
    return k.H.useMemo(o, E);
  }, L.useOptimistic = function(o, E) {
    return k.H.useOptimistic(o, E);
  }, L.useReducer = function(o, E, O) {
    return k.H.useReducer(o, E, O);
  }, L.useRef = function(o) {
    return k.H.useRef(o);
  }, L.useState = function(o) {
    return k.H.useState(o);
  }, L.useSyncExternalStore = function(o, E, O) {
    return k.H.useSyncExternalStore(
      o,
      E,
      O
    );
  }, L.useTransition = function() {
    return k.H.useTransition();
  }, L.version = "19.2.4", L;
}
var Ar;
function bf() {
  return Ar || (Ar = 1, yf.exports = mv()), yf.exports;
}
var gf = { exports: {} }, Zl = {};
var Mr;
function vv() {
  if (Mr) return Zl;
  Mr = 1;
  var r = bf();
  function H(M) {
    var v = "https://react.dev/errors/" + M;
    if (1 < arguments.length) {
      v += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var A = 2; A < arguments.length; A++)
        v += "&args[]=" + encodeURIComponent(arguments[A]);
    }
    return "Minified React error #" + M + "; visit " + v + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function C() {
  }
  var m = {
    d: {
      f: C,
      r: function() {
        throw Error(H(522));
      },
      D: C,
      C,
      L: C,
      m: C,
      X: C,
      S: C,
      M: C
    },
    p: 0,
    findDOMNode: null
  }, R = /* @__PURE__ */ Symbol.for("react.portal");
  function Z(M, v, A) {
    var _ = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: R,
      key: _ == null ? null : "" + _,
      children: M,
      containerInfo: v,
      implementation: A
    };
  }
  var V = r.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function X(M, v) {
    if (M === "font") return "";
    if (typeof v == "string")
      return v === "use-credentials" ? v : "";
  }
  return Zl.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = m, Zl.createPortal = function(M, v) {
    var A = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!v || v.nodeType !== 1 && v.nodeType !== 9 && v.nodeType !== 11)
      throw Error(H(299));
    return Z(M, v, null, A);
  }, Zl.flushSync = function(M) {
    var v = V.T, A = m.p;
    try {
      if (V.T = null, m.p = 2, M) return M();
    } finally {
      V.T = v, m.p = A, m.d.f();
    }
  }, Zl.preconnect = function(M, v) {
    typeof M == "string" && (v ? (v = v.crossOrigin, v = typeof v == "string" ? v === "use-credentials" ? v : "" : void 0) : v = null, m.d.C(M, v));
  }, Zl.prefetchDNS = function(M) {
    typeof M == "string" && m.d.D(M);
  }, Zl.preinit = function(M, v) {
    if (typeof M == "string" && v && typeof v.as == "string") {
      var A = v.as, _ = X(A, v.crossOrigin), Y = typeof v.integrity == "string" ? v.integrity : void 0, B = typeof v.fetchPriority == "string" ? v.fetchPriority : void 0;
      A === "style" ? m.d.S(
        M,
        typeof v.precedence == "string" ? v.precedence : void 0,
        {
          crossOrigin: _,
          integrity: Y,
          fetchPriority: B
        }
      ) : A === "script" && m.d.X(M, {
        crossOrigin: _,
        integrity: Y,
        fetchPriority: B,
        nonce: typeof v.nonce == "string" ? v.nonce : void 0
      });
    }
  }, Zl.preinitModule = function(M, v) {
    if (typeof M == "string")
      if (typeof v == "object" && v !== null) {
        if (v.as == null || v.as === "script") {
          var A = X(
            v.as,
            v.crossOrigin
          );
          m.d.M(M, {
            crossOrigin: A,
            integrity: typeof v.integrity == "string" ? v.integrity : void 0,
            nonce: typeof v.nonce == "string" ? v.nonce : void 0
          });
        }
      } else v == null && m.d.M(M);
  }, Zl.preload = function(M, v) {
    if (typeof M == "string" && typeof v == "object" && v !== null && typeof v.as == "string") {
      var A = v.as, _ = X(A, v.crossOrigin);
      m.d.L(M, A, {
        crossOrigin: _,
        integrity: typeof v.integrity == "string" ? v.integrity : void 0,
        nonce: typeof v.nonce == "string" ? v.nonce : void 0,
        type: typeof v.type == "string" ? v.type : void 0,
        fetchPriority: typeof v.fetchPriority == "string" ? v.fetchPriority : void 0,
        referrerPolicy: typeof v.referrerPolicy == "string" ? v.referrerPolicy : void 0,
        imageSrcSet: typeof v.imageSrcSet == "string" ? v.imageSrcSet : void 0,
        imageSizes: typeof v.imageSizes == "string" ? v.imageSizes : void 0,
        media: typeof v.media == "string" ? v.media : void 0
      });
    }
  }, Zl.preloadModule = function(M, v) {
    if (typeof M == "string")
      if (v) {
        var A = X(v.as, v.crossOrigin);
        m.d.m(M, {
          as: typeof v.as == "string" && v.as !== "script" ? v.as : void 0,
          crossOrigin: A,
          integrity: typeof v.integrity == "string" ? v.integrity : void 0
        });
      } else m.d.m(M);
  }, Zl.requestFormReset = function(M) {
    m.d.r(M);
  }, Zl.unstable_batchedUpdates = function(M, v) {
    return M(v);
  }, Zl.useFormState = function(M, v, A) {
    return V.H.useFormState(M, v, A);
  }, Zl.useFormStatus = function() {
    return V.H.useHostTransitionStatus();
  }, Zl.version = "19.2.4", Zl;
}
var Nr;
function hv() {
  if (Nr) return gf.exports;
  Nr = 1;
  function r() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(r);
      } catch (H) {
        console.error(H);
      }
  }
  return r(), gf.exports = vv(), gf.exports;
}
var Or;
function yv() {
  if (Or) return zu;
  Or = 1;
  var r = rv(), H = bf(), C = hv();
  function m(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++)
        t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function R(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function Z(l) {
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
  function V(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function X(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function M(l) {
    if (Z(l) !== l)
      throw Error(m(188));
  }
  function v(l) {
    var t = l.alternate;
    if (!t) {
      if (t = Z(l), t === null) throw Error(m(188));
      return t !== l ? null : l;
    }
    for (var a = l, e = t; ; ) {
      var u = a.return;
      if (u === null) break;
      var n = u.alternate;
      if (n === null) {
        if (e = u.return, e !== null) {
          a = e;
          continue;
        }
        break;
      }
      if (u.child === n.child) {
        for (n = u.child; n; ) {
          if (n === a) return M(u), l;
          if (n === e) return M(u), t;
          n = n.sibling;
        }
        throw Error(m(188));
      }
      if (a.return !== e.return) a = u, e = n;
      else {
        for (var i = !1, c = u.child; c; ) {
          if (c === a) {
            i = !0, a = u, e = n;
            break;
          }
          if (c === e) {
            i = !0, e = u, a = n;
            break;
          }
          c = c.sibling;
        }
        if (!i) {
          for (c = n.child; c; ) {
            if (c === a) {
              i = !0, a = n, e = u;
              break;
            }
            if (c === e) {
              i = !0, e = n, a = u;
              break;
            }
            c = c.sibling;
          }
          if (!i) throw Error(m(189));
        }
      }
      if (a.alternate !== e) throw Error(m(190));
    }
    if (a.tag !== 3) throw Error(m(188));
    return a.stateNode.current === a ? l : t;
  }
  function A(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = A(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var _ = Object.assign, Y = /* @__PURE__ */ Symbol.for("react.element"), B = /* @__PURE__ */ Symbol.for("react.transitional.element"), hl = /* @__PURE__ */ Symbol.for("react.portal"), nl = /* @__PURE__ */ Symbol.for("react.fragment"), Xl = /* @__PURE__ */ Symbol.for("react.strict_mode"), Dl = /* @__PURE__ */ Symbol.for("react.profiler"), lt = /* @__PURE__ */ Symbol.for("react.consumer"), _l = /* @__PURE__ */ Symbol.for("react.context"), Rl = /* @__PURE__ */ Symbol.for("react.forward_ref"), jl = /* @__PURE__ */ Symbol.for("react.suspense"), Sl = /* @__PURE__ */ Symbol.for("react.suspense_list"), k = /* @__PURE__ */ Symbol.for("react.memo"), Kl = /* @__PURE__ */ Symbol.for("react.lazy"), _t = /* @__PURE__ */ Symbol.for("react.activity"), Xa = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), At = Symbol.iterator;
  function Jl(l) {
    return l === null || typeof l != "object" ? null : (l = At && l[At] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var pa = /* @__PURE__ */ Symbol.for("react.client.reference");
  function jt(l) {
    if (l == null) return null;
    if (typeof l == "function")
      return l.$$typeof === pa ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case nl:
        return "Fragment";
      case Dl:
        return "Profiler";
      case Xl:
        return "StrictMode";
      case jl:
        return "Suspense";
      case Sl:
        return "SuspenseList";
      case _t:
        return "Activity";
    }
    if (typeof l == "object")
      switch (l.$$typeof) {
        case hl:
          return "Portal";
        case _l:
          return l.displayName || "Context";
        case lt:
          return (l._context.displayName || "Context") + ".Consumer";
        case Rl:
          var t = l.render;
          return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
        case k:
          return t = l.displayName || null, t !== null ? t : jt(l.type) || "Memo";
        case Kl:
          t = l._payload, l = l._init;
          try {
            return jt(l(t));
          } catch {
          }
      }
    return null;
  }
  var pt = Array.isArray, p = H.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, N = C.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Q = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, sl = [], ml = -1;
  function o(l) {
    return { current: l };
  }
  function E(l) {
    0 > ml || (l.current = sl[ml], sl[ml] = null, ml--);
  }
  function O(l, t) {
    ml++, sl[ml] = l.current, l.current = t;
  }
  var j = o(null), K = o(null), W = o(null), il = o(null);
  function Ll(l, t) {
    switch (O(W, t), O(K, l), O(j, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? Vd(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI)
          t = Vd(t), l = Kd(t, l);
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
    E(j), O(j, l);
  }
  function zl() {
    E(j), E(K), E(W);
  }
  function Ne(l) {
    l.memoizedState !== null && O(il, l);
    var t = j.current, a = Kd(t, l.type);
    t !== a && (O(K, l), O(j, a));
  }
  function Au(l) {
    K.current === l && (E(j), E(K)), il.current === l && (E(il), gu._currentValue = Q);
  }
  var wn, Sf;
  function za(l) {
    if (wn === void 0)
      try {
        throw Error();
      } catch (a) {
        var t = a.stack.trim().match(/\n( *(at )?)/);
        wn = t && t[1] || "", Sf = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + wn + l + Sf;
  }
  var kn = !1;
  function Wn(l, t) {
    if (!l || kn) return "";
    kn = !0;
    var a = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var e = {
        DetermineComponentFrameRoot: function() {
          try {
            if (t) {
              var T = function() {
                throw Error();
              };
              if (Object.defineProperty(T.prototype, "props", {
                set: function() {
                  throw Error();
                }
              }), typeof Reflect == "object" && Reflect.construct) {
                try {
                  Reflect.construct(T, []);
                } catch (S) {
                  var b = S;
                }
                Reflect.construct(l, [], T);
              } else {
                try {
                  T.call();
                } catch (S) {
                  b = S;
                }
                l.call(T.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (S) {
                b = S;
              }
              (T = l()) && typeof T.catch == "function" && T.catch(function() {
              });
            }
          } catch (S) {
            if (S && b && typeof S.stack == "string")
              return [S.stack, b.stack];
          }
          return [null, null];
        }
      };
      e.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var u = Object.getOwnPropertyDescriptor(
        e.DetermineComponentFrameRoot,
        "name"
      );
      u && u.configurable && Object.defineProperty(
        e.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var n = e.DetermineComponentFrameRoot(), i = n[0], c = n[1];
      if (i && c) {
        var f = i.split(`
`), y = c.split(`
`);
        for (u = e = 0; e < f.length && !f[e].includes("DetermineComponentFrameRoot"); )
          e++;
        for (; u < y.length && !y[u].includes(
          "DetermineComponentFrameRoot"
        ); )
          u++;
        if (e === f.length || u === y.length)
          for (e = f.length - 1, u = y.length - 1; 1 <= e && 0 <= u && f[e] !== y[u]; )
            u--;
        for (; 1 <= e && 0 <= u; e--, u--)
          if (f[e] !== y[u]) {
            if (e !== 1 || u !== 1)
              do
                if (e--, u--, 0 > u || f[e] !== y[u]) {
                  var x = `
` + f[e].replace(" at new ", " at ");
                  return l.displayName && x.includes("<anonymous>") && (x = x.replace("<anonymous>", l.displayName)), x;
                }
              while (1 <= e && 0 <= u);
            break;
          }
      }
    } finally {
      kn = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? za(a) : "";
  }
  function Qr(l, t) {
    switch (l.tag) {
      case 26:
      case 27:
      case 5:
        return za(l.type);
      case 16:
        return za("Lazy");
      case 13:
        return l.child !== t && t !== null ? za("Suspense Fallback") : za("Suspense");
      case 19:
        return za("SuspenseList");
      case 0:
      case 15:
        return Wn(l.type, !1);
      case 11:
        return Wn(l.type.render, !1);
      case 1:
        return Wn(l.type, !0);
      case 31:
        return za("Activity");
      default:
        return "";
    }
  }
  function xf(l) {
    try {
      var t = "", a = null;
      do
        t += Qr(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (e) {
      return `
Error generating stack: ` + e.message + `
` + e.stack;
    }
  }
  var $n = Object.prototype.hasOwnProperty, Fn = r.unstable_scheduleCallback, In = r.unstable_cancelCallback, Xr = r.unstable_shouldYield, Zr = r.unstable_requestPaint, tt = r.unstable_now, Lr = r.unstable_getCurrentPriorityLevel, pf = r.unstable_ImmediatePriority, zf = r.unstable_UserBlockingPriority, Mu = r.unstable_NormalPriority, Vr = r.unstable_LowPriority, Tf = r.unstable_IdlePriority, Kr = r.log, Jr = r.unstable_setDisableYieldValue, Oe = null, at = null;
  function $t(l) {
    if (typeof Kr == "function" && Jr(l), at && typeof at.setStrictMode == "function")
      try {
        at.setStrictMode(Oe, l);
      } catch {
      }
  }
  var et = Math.clz32 ? Math.clz32 : Wr, wr = Math.log, kr = Math.LN2;
  function Wr(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (wr(l) / kr | 0) | 0;
  }
  var Nu = 256, Ou = 262144, Du = 4194304;
  function Ta(l) {
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
  function ju(l, t, a) {
    var e = l.pendingLanes;
    if (e === 0) return 0;
    var u = 0, n = l.suspendedLanes, i = l.pingedLanes;
    l = l.warmLanes;
    var c = e & 134217727;
    return c !== 0 ? (e = c & ~n, e !== 0 ? u = Ta(e) : (i &= c, i !== 0 ? u = Ta(i) : a || (a = c & ~l, a !== 0 && (u = Ta(a))))) : (c = e & ~n, c !== 0 ? u = Ta(c) : i !== 0 ? u = Ta(i) : a || (a = e & ~l, a !== 0 && (u = Ta(a)))), u === 0 ? 0 : t !== 0 && t !== u && (t & n) === 0 && (n = u & -u, a = t & -t, n >= a || n === 32 && (a & 4194048) !== 0) ? t : u;
  }
  function De(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function $r(l, t) {
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
  function Ef() {
    var l = Du;
    return Du <<= 1, (Du & 62914560) === 0 && (Du = 4194304), l;
  }
  function Pn(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function je(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function Fr(l, t, a, e, u, n) {
    var i = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var c = l.entanglements, f = l.expirationTimes, y = l.hiddenUpdates;
    for (a = i & ~a; 0 < a; ) {
      var x = 31 - et(a), T = 1 << x;
      c[x] = 0, f[x] = -1;
      var b = y[x];
      if (b !== null)
        for (y[x] = null, x = 0; x < b.length; x++) {
          var S = b[x];
          S !== null && (S.lane &= -536870913);
        }
      a &= ~T;
    }
    e !== 0 && _f(l, e, 0), n !== 0 && u === 0 && l.tag !== 0 && (l.suspendedLanes |= n & ~(i & ~t));
  }
  function _f(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var e = 31 - et(t);
    l.entangledLanes |= t, l.entanglements[e] = l.entanglements[e] | 1073741824 | a & 261930;
  }
  function Af(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var e = 31 - et(a), u = 1 << e;
      u & t | l[e] & t && (l[e] |= t), a &= ~u;
    }
  }
  function Mf(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : li(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function li(l) {
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
  function ti(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function Nf() {
    var l = N.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : vr(l.type));
  }
  function Of(l, t) {
    var a = N.p;
    try {
      return N.p = l, t();
    } finally {
      N.p = a;
    }
  }
  var Ft = Math.random().toString(36).slice(2), Bl = "__reactFiber$" + Ft, wl = "__reactProps$" + Ft, Za = "__reactContainer$" + Ft, ai = "__reactEvents$" + Ft, Ir = "__reactListeners$" + Ft, Pr = "__reactHandles$" + Ft, Df = "__reactResources$" + Ft, Ue = "__reactMarker$" + Ft;
  function ei(l) {
    delete l[Bl], delete l[wl], delete l[ai], delete l[Ir], delete l[Pr];
  }
  function La(l) {
    var t = l[Bl];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[Za] || a[Bl]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null)
          for (l = Id(l); l !== null; ) {
            if (a = l[Bl]) return a;
            l = Id(l);
          }
        return t;
      }
      l = a, a = l.parentNode;
    }
    return null;
  }
  function Va(l) {
    if (l = l[Bl] || l[Za]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return l;
    }
    return null;
  }
  function Ce(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(m(33));
  }
  function Ka(l) {
    var t = l[Df];
    return t || (t = l[Df] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function Cl(l) {
    l[Ue] = !0;
  }
  var jf = /* @__PURE__ */ new Set(), Uf = {};
  function Ea(l, t) {
    Ja(l, t), Ja(l + "Capture", t);
  }
  function Ja(l, t) {
    for (Uf[l] = t, l = 0; l < t.length; l++)
      jf.add(t[l]);
  }
  var lm = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Cf = {}, Hf = {};
  function tm(l) {
    return $n.call(Hf, l) ? !0 : $n.call(Cf, l) ? !1 : lm.test(l) ? Hf[l] = !0 : (Cf[l] = !0, !1);
  }
  function Uu(l, t, a) {
    if (tm(t))
      if (a === null) l.removeAttribute(t);
      else {
        switch (typeof a) {
          case "undefined":
          case "function":
          case "symbol":
            l.removeAttribute(t);
            return;
          case "boolean":
            var e = t.toLowerCase().slice(0, 5);
            if (e !== "data-" && e !== "aria-") {
              l.removeAttribute(t);
              return;
            }
        }
        l.setAttribute(t, "" + a);
      }
  }
  function Cu(l, t, a) {
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
  function Ut(l, t, a, e) {
    if (e === null) l.removeAttribute(a);
    else {
      switch (typeof e) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(a);
          return;
      }
      l.setAttributeNS(t, a, "" + e);
    }
  }
  function dt(l) {
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
  function Rf(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function am(l, t, a) {
    var e = Object.getOwnPropertyDescriptor(
      l.constructor.prototype,
      t
    );
    if (!l.hasOwnProperty(t) && typeof e < "u" && typeof e.get == "function" && typeof e.set == "function") {
      var u = e.get, n = e.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return u.call(this);
        },
        set: function(i) {
          a = "" + i, n.call(this, i);
        }
      }), Object.defineProperty(l, t, {
        enumerable: e.enumerable
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
  function ui(l) {
    if (!l._valueTracker) {
      var t = Rf(l) ? "checked" : "value";
      l._valueTracker = am(
        l,
        t,
        "" + l[t]
      );
    }
  }
  function Bf(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), e = "";
    return l && (e = Rf(l) ? l.checked ? "true" : "false" : l.value), l = e, l !== a ? (t.setValue(l), !0) : !1;
  }
  function Hu(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var em = /[\n"\\]/g;
  function rt(l) {
    return l.replace(
      em,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function ni(l, t, a, e, u, n, i, c) {
    l.name = "", i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" ? l.type = i : l.removeAttribute("type"), t != null ? i === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + dt(t)) : l.value !== "" + dt(t) && (l.value = "" + dt(t)) : i !== "submit" && i !== "reset" || l.removeAttribute("value"), t != null ? ii(l, i, dt(t)) : a != null ? ii(l, i, dt(a)) : e != null && l.removeAttribute("value"), u == null && n != null && (l.defaultChecked = !!n), u != null && (l.checked = u && typeof u != "function" && typeof u != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + dt(c) : l.removeAttribute("name");
  }
  function qf(l, t, a, e, u, n, i, c) {
    if (n != null && typeof n != "function" && typeof n != "symbol" && typeof n != "boolean" && (l.type = n), t != null || a != null) {
      if (!(n !== "submit" && n !== "reset" || t != null)) {
        ui(l);
        return;
      }
      a = a != null ? "" + dt(a) : "", t = t != null ? "" + dt(t) : a, c || t === l.value || (l.value = t), l.defaultValue = t;
    }
    e = e ?? u, e = typeof e != "function" && typeof e != "symbol" && !!e, l.checked = c ? l.checked : !!e, l.defaultChecked = !!e, i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (l.name = i), ui(l);
  }
  function ii(l, t, a) {
    t === "number" && Hu(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function wa(l, t, a, e) {
    if (l = l.options, t) {
      t = {};
      for (var u = 0; u < a.length; u++)
        t["$" + a[u]] = !0;
      for (a = 0; a < l.length; a++)
        u = t.hasOwnProperty("$" + l[a].value), l[a].selected !== u && (l[a].selected = u), u && e && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + dt(a), t = null, u = 0; u < l.length; u++) {
        if (l[u].value === a) {
          l[u].selected = !0, e && (l[u].defaultSelected = !0);
          return;
        }
        t !== null || l[u].disabled || (t = l[u]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Yf(l, t, a) {
    if (t != null && (t = "" + dt(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + dt(a) : "";
  }
  function Gf(l, t, a, e) {
    if (t == null) {
      if (e != null) {
        if (a != null) throw Error(m(92));
        if (pt(e)) {
          if (1 < e.length) throw Error(m(93));
          e = e[0];
        }
        a = e;
      }
      a == null && (a = ""), t = a;
    }
    a = dt(t), l.defaultValue = a, e = l.textContent, e === a && e !== "" && e !== null && (l.value = e), ui(l);
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
  var um = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function Qf(l, t, a) {
    var e = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? e ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : e ? l.setProperty(t, a) : typeof a != "number" || a === 0 || um.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function Xf(l, t, a) {
    if (t != null && typeof t != "object")
      throw Error(m(62));
    if (l = l.style, a != null) {
      for (var e in a)
        !a.hasOwnProperty(e) || t != null && t.hasOwnProperty(e) || (e.indexOf("--") === 0 ? l.setProperty(e, "") : e === "float" ? l.cssFloat = "" : l[e] = "");
      for (var u in t)
        e = t[u], t.hasOwnProperty(u) && a[u] !== e && Qf(l, u, e);
    } else
      for (var n in t)
        t.hasOwnProperty(n) && Qf(l, n, t[n]);
  }
  function ci(l) {
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
  var nm = /* @__PURE__ */ new Map([
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
  ]), im = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Ru(l) {
    return im.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function Ct() {
  }
  var fi = null;
  function si(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var Wa = null, $a = null;
  function Zf(l) {
    var t = Va(l);
    if (t && (l = t.stateNode)) {
      var a = l[wl] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (ni(
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
              'input[name="' + rt(
                "" + t
              ) + '"][type="radio"]'
            ), t = 0; t < a.length; t++) {
              var e = a[t];
              if (e !== l && e.form === l.form) {
                var u = e[wl] || null;
                if (!u) throw Error(m(90));
                ni(
                  e,
                  u.value,
                  u.defaultValue,
                  u.defaultValue,
                  u.checked,
                  u.defaultChecked,
                  u.type,
                  u.name
                );
              }
            }
            for (t = 0; t < a.length; t++)
              e = a[t], e.form === l.form && Bf(e);
          }
          break l;
        case "textarea":
          Yf(l, a.value, a.defaultValue);
          break l;
        case "select":
          t = a.value, t != null && wa(l, !!a.multiple, t, !1);
      }
    }
  }
  var oi = !1;
  function Lf(l, t, a) {
    if (oi) return l(t, a);
    oi = !0;
    try {
      var e = l(t);
      return e;
    } finally {
      if (oi = !1, (Wa !== null || $a !== null) && (Tn(), Wa && (t = Wa, l = $a, $a = Wa = null, Zf(t), l)))
        for (t = 0; t < l.length; t++) Zf(l[t]);
    }
  }
  function He(l, t) {
    var a = l.stateNode;
    if (a === null) return null;
    var e = a[wl] || null;
    if (e === null) return null;
    a = e[t];
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
        (e = !e.disabled) || (l = l.type, e = !(l === "button" || l === "input" || l === "select" || l === "textarea")), l = !e;
        break l;
      default:
        l = !1;
    }
    if (l) return null;
    if (a && typeof a != "function")
      throw Error(
        m(231, t, typeof a)
      );
    return a;
  }
  var Ht = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), di = !1;
  if (Ht)
    try {
      var Re = {};
      Object.defineProperty(Re, "passive", {
        get: function() {
          di = !0;
        }
      }), window.addEventListener("test", Re, Re), window.removeEventListener("test", Re, Re);
    } catch {
      di = !1;
    }
  var It = null, ri = null, Bu = null;
  function Vf() {
    if (Bu) return Bu;
    var l, t = ri, a = t.length, e, u = "value" in It ? It.value : It.textContent, n = u.length;
    for (l = 0; l < a && t[l] === u[l]; l++) ;
    var i = a - l;
    for (e = 1; e <= i && t[a - e] === u[n - e]; e++) ;
    return Bu = u.slice(l, 1 < e ? 1 - e : void 0);
  }
  function qu(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function Yu() {
    return !0;
  }
  function Kf() {
    return !1;
  }
  function kl(l) {
    function t(a, e, u, n, i) {
      this._reactName = a, this._targetInst = u, this.type = e, this.nativeEvent = n, this.target = i, this.currentTarget = null;
      for (var c in l)
        l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(n) : n[c]);
      return this.isDefaultPrevented = (n.defaultPrevented != null ? n.defaultPrevented : n.returnValue === !1) ? Yu : Kf, this.isPropagationStopped = Kf, this;
    }
    return _(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var a = this.nativeEvent;
        a && (a.preventDefault ? a.preventDefault() : typeof a.returnValue != "unknown" && (a.returnValue = !1), this.isDefaultPrevented = Yu);
      },
      stopPropagation: function() {
        var a = this.nativeEvent;
        a && (a.stopPropagation ? a.stopPropagation() : typeof a.cancelBubble != "unknown" && (a.cancelBubble = !0), this.isPropagationStopped = Yu);
      },
      persist: function() {
      },
      isPersistent: Yu
    }), t;
  }
  var _a = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(l) {
      return l.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Gu = kl(_a), Be = _({}, _a, { view: 0, detail: 0 }), cm = kl(Be), mi, vi, qe, Qu = _({}, Be, {
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
    getModifierState: yi,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== qe && (qe && l.type === "mousemove" ? (mi = l.screenX - qe.screenX, vi = l.screenY - qe.screenY) : vi = mi = 0, qe = l), mi);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : vi;
    }
  }), Jf = kl(Qu), fm = _({}, Qu, { dataTransfer: 0 }), sm = kl(fm), om = _({}, Be, { relatedTarget: 0 }), hi = kl(om), dm = _({}, _a, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), rm = kl(dm), mm = _({}, _a, {
    clipboardData: function(l) {
      return "clipboardData" in l ? l.clipboardData : window.clipboardData;
    }
  }), vm = kl(mm), hm = _({}, _a, { data: 0 }), wf = kl(hm), ym = {
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
  }, gm = {
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
  }, bm = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Sm(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = bm[l]) ? !!t[l] : !1;
  }
  function yi() {
    return Sm;
  }
  var xm = _({}, Be, {
    key: function(l) {
      if (l.key) {
        var t = ym[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = qu(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? gm[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: yi,
    charCode: function(l) {
      return l.type === "keypress" ? qu(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? qu(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  }), pm = kl(xm), zm = _({}, Qu, {
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
  }), kf = kl(zm), Tm = _({}, Be, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: yi
  }), Em = kl(Tm), _m = _({}, _a, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), Am = kl(_m), Mm = _({}, Qu, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), Nm = kl(Mm), Om = _({}, _a, {
    newState: 0,
    oldState: 0
  }), Dm = kl(Om), jm = [9, 13, 27, 32], gi = Ht && "CompositionEvent" in window, Ye = null;
  Ht && "documentMode" in document && (Ye = document.documentMode);
  var Um = Ht && "TextEvent" in window && !Ye, Wf = Ht && (!gi || Ye && 8 < Ye && 11 >= Ye), $f = " ", Ff = !1;
  function If(l, t) {
    switch (l) {
      case "keyup":
        return jm.indexOf(t.keyCode) !== -1;
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
  function Pf(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var Fa = !1;
  function Cm(l, t) {
    switch (l) {
      case "compositionend":
        return Pf(t);
      case "keypress":
        return t.which !== 32 ? null : (Ff = !0, $f);
      case "textInput":
        return l = t.data, l === $f && Ff ? null : l;
      default:
        return null;
    }
  }
  function Hm(l, t) {
    if (Fa)
      return l === "compositionend" || !gi && If(l, t) ? (l = Vf(), Bu = ri = It = null, Fa = !1, l) : null;
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
        return Wf && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Rm = {
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
  function ls(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!Rm[l.type] : t === "textarea";
  }
  function ts(l, t, a, e) {
    Wa ? $a ? $a.push(e) : $a = [e] : Wa = e, t = Dn(t, "onChange"), 0 < t.length && (a = new Gu(
      "onChange",
      "change",
      null,
      a,
      e
    ), l.push({ event: a, listeners: t }));
  }
  var Ge = null, Qe = null;
  function Bm(l) {
    Yd(l, 0);
  }
  function Xu(l) {
    var t = Ce(l);
    if (Bf(t)) return l;
  }
  function as(l, t) {
    if (l === "change") return t;
  }
  var es = !1;
  if (Ht) {
    var bi;
    if (Ht) {
      var Si = "oninput" in document;
      if (!Si) {
        var us = document.createElement("div");
        us.setAttribute("oninput", "return;"), Si = typeof us.oninput == "function";
      }
      bi = Si;
    } else bi = !1;
    es = bi && (!document.documentMode || 9 < document.documentMode);
  }
  function ns() {
    Ge && (Ge.detachEvent("onpropertychange", is), Qe = Ge = null);
  }
  function is(l) {
    if (l.propertyName === "value" && Xu(Qe)) {
      var t = [];
      ts(
        t,
        Qe,
        l,
        si(l)
      ), Lf(Bm, t);
    }
  }
  function qm(l, t, a) {
    l === "focusin" ? (ns(), Ge = t, Qe = a, Ge.attachEvent("onpropertychange", is)) : l === "focusout" && ns();
  }
  function Ym(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown")
      return Xu(Qe);
  }
  function Gm(l, t) {
    if (l === "click") return Xu(t);
  }
  function Qm(l, t) {
    if (l === "input" || l === "change")
      return Xu(t);
  }
  function Xm(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var ut = typeof Object.is == "function" ? Object.is : Xm;
  function Xe(l, t) {
    if (ut(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null)
      return !1;
    var a = Object.keys(l), e = Object.keys(t);
    if (a.length !== e.length) return !1;
    for (e = 0; e < a.length; e++) {
      var u = a[e];
      if (!$n.call(t, u) || !ut(l[u], t[u]))
        return !1;
    }
    return !0;
  }
  function cs(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function fs(l, t) {
    var a = cs(l);
    l = 0;
    for (var e; a; ) {
      if (a.nodeType === 3) {
        if (e = l + a.textContent.length, l <= t && e >= t)
          return { node: a, offset: t - l };
        l = e;
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
  function ss(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? ss(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function os(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = Hu(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = Hu(l.document);
    }
    return t;
  }
  function xi(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var Zm = Ht && "documentMode" in document && 11 >= document.documentMode, Ia = null, pi = null, Ze = null, zi = !1;
  function ds(l, t, a) {
    var e = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    zi || Ia == null || Ia !== Hu(e) || (e = Ia, "selectionStart" in e && xi(e) ? e = { start: e.selectionStart, end: e.selectionEnd } : (e = (e.ownerDocument && e.ownerDocument.defaultView || window).getSelection(), e = {
      anchorNode: e.anchorNode,
      anchorOffset: e.anchorOffset,
      focusNode: e.focusNode,
      focusOffset: e.focusOffset
    }), Ze && Xe(Ze, e) || (Ze = e, e = Dn(pi, "onSelect"), 0 < e.length && (t = new Gu(
      "onSelect",
      "select",
      null,
      t,
      a
    ), l.push({ event: t, listeners: e }), t.target = Ia)));
  }
  function Aa(l, t) {
    var a = {};
    return a[l.toLowerCase()] = t.toLowerCase(), a["Webkit" + l] = "webkit" + t, a["Moz" + l] = "moz" + t, a;
  }
  var Pa = {
    animationend: Aa("Animation", "AnimationEnd"),
    animationiteration: Aa("Animation", "AnimationIteration"),
    animationstart: Aa("Animation", "AnimationStart"),
    transitionrun: Aa("Transition", "TransitionRun"),
    transitionstart: Aa("Transition", "TransitionStart"),
    transitioncancel: Aa("Transition", "TransitionCancel"),
    transitionend: Aa("Transition", "TransitionEnd")
  }, Ti = {}, rs = {};
  Ht && (rs = document.createElement("div").style, "AnimationEvent" in window || (delete Pa.animationend.animation, delete Pa.animationiteration.animation, delete Pa.animationstart.animation), "TransitionEvent" in window || delete Pa.transitionend.transition);
  function Ma(l) {
    if (Ti[l]) return Ti[l];
    if (!Pa[l]) return l;
    var t = Pa[l], a;
    for (a in t)
      if (t.hasOwnProperty(a) && a in rs)
        return Ti[l] = t[a];
    return l;
  }
  var ms = Ma("animationend"), vs = Ma("animationiteration"), hs = Ma("animationstart"), Lm = Ma("transitionrun"), Vm = Ma("transitionstart"), Km = Ma("transitioncancel"), ys = Ma("transitionend"), gs = /* @__PURE__ */ new Map(), Ei = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  Ei.push("scrollEnd");
  function zt(l, t) {
    gs.set(l, t), Ea(t, [l]);
  }
  var Zu = typeof reportError == "function" ? reportError : function(l) {
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
  }, mt = [], le = 0, _i = 0;
  function Lu() {
    for (var l = le, t = _i = le = 0; t < l; ) {
      var a = mt[t];
      mt[t++] = null;
      var e = mt[t];
      mt[t++] = null;
      var u = mt[t];
      mt[t++] = null;
      var n = mt[t];
      if (mt[t++] = null, e !== null && u !== null) {
        var i = e.pending;
        i === null ? u.next = u : (u.next = i.next, i.next = u), e.pending = u;
      }
      n !== 0 && bs(a, u, n);
    }
  }
  function Vu(l, t, a, e) {
    mt[le++] = l, mt[le++] = t, mt[le++] = a, mt[le++] = e, _i |= e, l.lanes |= e, l = l.alternate, l !== null && (l.lanes |= e);
  }
  function Ai(l, t, a, e) {
    return Vu(l, t, a, e), Ku(l);
  }
  function Na(l, t) {
    return Vu(l, null, null, t), Ku(l);
  }
  function bs(l, t, a) {
    l.lanes |= a;
    var e = l.alternate;
    e !== null && (e.lanes |= a);
    for (var u = !1, n = l.return; n !== null; )
      n.childLanes |= a, e = n.alternate, e !== null && (e.childLanes |= a), n.tag === 22 && (l = n.stateNode, l === null || l._visibility & 1 || (u = !0)), l = n, n = n.return;
    return l.tag === 3 ? (n = l.stateNode, u && t !== null && (u = 31 - et(a), l = n.hiddenUpdates, e = l[u], e === null ? l[u] = [t] : e.push(t), t.lane = a | 536870912), n) : null;
  }
  function Ku(l) {
    if (50 < ou)
      throw ou = 0, Rc = null, Error(m(185));
    for (var t = l.return; t !== null; )
      l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var te = {};
  function Jm(l, t, a, e) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = e, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function nt(l, t, a, e) {
    return new Jm(l, t, a, e);
  }
  function Mi(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function Rt(l, t) {
    var a = l.alternate;
    return a === null ? (a = nt(
      l.tag,
      t,
      l.key,
      l.mode
    ), a.elementType = l.elementType, a.type = l.type, a.stateNode = l.stateNode, a.alternate = l, l.alternate = a) : (a.pendingProps = t, a.type = l.type, a.flags = 0, a.subtreeFlags = 0, a.deletions = null), a.flags = l.flags & 65011712, a.childLanes = l.childLanes, a.lanes = l.lanes, a.child = l.child, a.memoizedProps = l.memoizedProps, a.memoizedState = l.memoizedState, a.updateQueue = l.updateQueue, t = l.dependencies, a.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, a.sibling = l.sibling, a.index = l.index, a.ref = l.ref, a.refCleanup = l.refCleanup, a;
  }
  function Ss(l, t) {
    l.flags &= 65011714;
    var a = l.alternate;
    return a === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = a.childLanes, l.lanes = a.lanes, l.child = a.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = a.memoizedProps, l.memoizedState = a.memoizedState, l.updateQueue = a.updateQueue, l.type = a.type, t = a.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function Ju(l, t, a, e, u, n) {
    var i = 0;
    if (e = l, typeof l == "function") Mi(l) && (i = 1);
    else if (typeof l == "string")
      i = F0(
        l,
        a,
        j.current
      ) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else
      l: switch (l) {
        case _t:
          return l = nt(31, a, t, u), l.elementType = _t, l.lanes = n, l;
        case nl:
          return Oa(a.children, u, n, t);
        case Xl:
          i = 8, u |= 24;
          break;
        case Dl:
          return l = nt(12, a, t, u | 2), l.elementType = Dl, l.lanes = n, l;
        case jl:
          return l = nt(13, a, t, u), l.elementType = jl, l.lanes = n, l;
        case Sl:
          return l = nt(19, a, t, u), l.elementType = Sl, l.lanes = n, l;
        default:
          if (typeof l == "object" && l !== null)
            switch (l.$$typeof) {
              case _l:
                i = 10;
                break l;
              case lt:
                i = 9;
                break l;
              case Rl:
                i = 11;
                break l;
              case k:
                i = 14;
                break l;
              case Kl:
                i = 16, e = null;
                break l;
            }
          i = 29, a = Error(
            m(130, l === null ? "null" : typeof l, "")
          ), e = null;
      }
    return t = nt(i, a, t, u), t.elementType = l, t.type = e, t.lanes = n, t;
  }
  function Oa(l, t, a, e) {
    return l = nt(7, l, e, t), l.lanes = a, l;
  }
  function Ni(l, t, a) {
    return l = nt(6, l, null, t), l.lanes = a, l;
  }
  function xs(l) {
    var t = nt(18, null, null, 0);
    return t.stateNode = l, t;
  }
  function Oi(l, t, a) {
    return t = nt(
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
  var ps = /* @__PURE__ */ new WeakMap();
  function vt(l, t) {
    if (typeof l == "object" && l !== null) {
      var a = ps.get(l);
      return a !== void 0 ? a : (t = {
        value: l,
        source: t,
        stack: xf(t)
      }, ps.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: xf(t)
    };
  }
  var ae = [], ee = 0, wu = null, Le = 0, ht = [], yt = 0, Pt = null, Mt = 1, Nt = "";
  function Bt(l, t) {
    ae[ee++] = Le, ae[ee++] = wu, wu = l, Le = t;
  }
  function zs(l, t, a) {
    ht[yt++] = Mt, ht[yt++] = Nt, ht[yt++] = Pt, Pt = l;
    var e = Mt;
    l = Nt;
    var u = 32 - et(e) - 1;
    e &= ~(1 << u), a += 1;
    var n = 32 - et(t) + u;
    if (30 < n) {
      var i = u - u % 5;
      n = (e & (1 << i) - 1).toString(32), e >>= i, u -= i, Mt = 1 << 32 - et(t) + u | a << u | e, Nt = n + l;
    } else
      Mt = 1 << n | a << u | e, Nt = l;
  }
  function Di(l) {
    l.return !== null && (Bt(l, 1), zs(l, 1, 0));
  }
  function ji(l) {
    for (; l === wu; )
      wu = ae[--ee], ae[ee] = null, Le = ae[--ee], ae[ee] = null;
    for (; l === Pt; )
      Pt = ht[--yt], ht[yt] = null, Nt = ht[--yt], ht[yt] = null, Mt = ht[--yt], ht[yt] = null;
  }
  function Ts(l, t) {
    ht[yt++] = Mt, ht[yt++] = Nt, ht[yt++] = Pt, Mt = t.id, Nt = t.overflow, Pt = l;
  }
  var ql = null, yl = null, ll = !1, la = null, gt = !1, Ui = Error(m(519));
  function ta(l) {
    var t = Error(
      m(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw Ve(vt(t, l)), Ui;
  }
  function Es(l) {
    var t = l.stateNode, a = l.type, e = l.memoizedProps;
    switch (t[Bl] = l, t[wl] = e, a) {
      case "dialog":
        F("cancel", t), F("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        F("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < ru.length; a++)
          F(ru[a], t);
        break;
      case "source":
        F("error", t);
        break;
      case "img":
      case "image":
      case "link":
        F("error", t), F("load", t);
        break;
      case "details":
        F("toggle", t);
        break;
      case "input":
        F("invalid", t), qf(
          t,
          e.value,
          e.defaultValue,
          e.checked,
          e.defaultChecked,
          e.type,
          e.name,
          !0
        );
        break;
      case "select":
        F("invalid", t);
        break;
      case "textarea":
        F("invalid", t), Gf(t, e.value, e.defaultValue, e.children);
    }
    a = e.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || e.suppressHydrationWarning === !0 || Zd(t.textContent, a) ? (e.popover != null && (F("beforetoggle", t), F("toggle", t)), e.onScroll != null && F("scroll", t), e.onScrollEnd != null && F("scrollend", t), e.onClick != null && (t.onclick = Ct), t = !0) : t = !1, t || ta(l, !0);
  }
  function _s(l) {
    for (ql = l.return; ql; )
      switch (ql.tag) {
        case 5:
        case 31:
        case 13:
          gt = !1;
          return;
        case 27:
        case 3:
          gt = !0;
          return;
        default:
          ql = ql.return;
      }
  }
  function ue(l) {
    if (l !== ql) return !1;
    if (!ll) return _s(l), ll = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || $c(l.type, l.memoizedProps)), a = !a), a && yl && ta(l), _s(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(m(317));
      yl = Fd(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(m(317));
      yl = Fd(l);
    } else
      t === 27 ? (t = yl, ha(l.type) ? (l = tf, tf = null, yl = l) : yl = t) : yl = ql ? St(l.stateNode.nextSibling) : null;
    return !0;
  }
  function Da() {
    yl = ql = null, ll = !1;
  }
  function Ci() {
    var l = la;
    return l !== null && (Il === null ? Il = l : Il.push.apply(
      Il,
      l
    ), la = null), l;
  }
  function Ve(l) {
    la === null ? la = [l] : la.push(l);
  }
  var Hi = o(null), ja = null, qt = null;
  function aa(l, t, a) {
    O(Hi, t._currentValue), t._currentValue = a;
  }
  function Yt(l) {
    l._currentValue = Hi.current, E(Hi);
  }
  function Ri(l, t, a) {
    for (; l !== null; ) {
      var e = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, e !== null && (e.childLanes |= t)) : e !== null && (e.childLanes & t) !== t && (e.childLanes |= t), l === a) break;
      l = l.return;
    }
  }
  function Bi(l, t, a, e) {
    var u = l.child;
    for (u !== null && (u.return = l); u !== null; ) {
      var n = u.dependencies;
      if (n !== null) {
        var i = u.child;
        n = n.firstContext;
        l: for (; n !== null; ) {
          var c = n;
          n = u;
          for (var f = 0; f < t.length; f++)
            if (c.context === t[f]) {
              n.lanes |= a, c = n.alternate, c !== null && (c.lanes |= a), Ri(
                n.return,
                a,
                l
              ), e || (i = null);
              break l;
            }
          n = c.next;
        }
      } else if (u.tag === 18) {
        if (i = u.return, i === null) throw Error(m(341));
        i.lanes |= a, n = i.alternate, n !== null && (n.lanes |= a), Ri(i, a, l), i = null;
      } else i = u.child;
      if (i !== null) i.return = u;
      else
        for (i = u; i !== null; ) {
          if (i === l) {
            i = null;
            break;
          }
          if (u = i.sibling, u !== null) {
            u.return = i.return, i = u;
            break;
          }
          i = i.return;
        }
      u = i;
    }
  }
  function ne(l, t, a, e) {
    l = null;
    for (var u = t, n = !1; u !== null; ) {
      if (!n) {
        if ((u.flags & 524288) !== 0) n = !0;
        else if ((u.flags & 262144) !== 0) break;
      }
      if (u.tag === 10) {
        var i = u.alternate;
        if (i === null) throw Error(m(387));
        if (i = i.memoizedProps, i !== null) {
          var c = u.type;
          ut(u.pendingProps.value, i.value) || (l !== null ? l.push(c) : l = [c]);
        }
      } else if (u === il.current) {
        if (i = u.alternate, i === null) throw Error(m(387));
        i.memoizedState.memoizedState !== u.memoizedState.memoizedState && (l !== null ? l.push(gu) : l = [gu]);
      }
      u = u.return;
    }
    l !== null && Bi(
      t,
      l,
      a,
      e
    ), t.flags |= 262144;
  }
  function ku(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!ut(
        l.context._currentValue,
        l.memoizedValue
      ))
        return !0;
      l = l.next;
    }
    return !1;
  }
  function Ua(l) {
    ja = l, qt = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Yl(l) {
    return As(ja, l);
  }
  function Wu(l, t) {
    return ja === null && Ua(l), As(l, t);
  }
  function As(l, t) {
    var a = t._currentValue;
    if (t = { context: t, memoizedValue: a, next: null }, qt === null) {
      if (l === null) throw Error(m(308));
      qt = t, l.dependencies = { lanes: 0, firstContext: t }, l.flags |= 524288;
    } else qt = qt.next = t;
    return a;
  }
  var wm = typeof AbortController < "u" ? AbortController : function() {
    var l = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(a, e) {
        l.push(e);
      }
    };
    this.abort = function() {
      t.aborted = !0, l.forEach(function(a) {
        return a();
      });
    };
  }, km = r.unstable_scheduleCallback, Wm = r.unstable_NormalPriority, Al = {
    $$typeof: _l,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function qi() {
    return {
      controller: new wm(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Ke(l) {
    l.refCount--, l.refCount === 0 && km(Wm, function() {
      l.controller.abort();
    });
  }
  var Je = null, Yi = 0, ie = 0, ce = null;
  function $m(l, t) {
    if (Je === null) {
      var a = Je = [];
      Yi = 0, ie = Xc(), ce = {
        status: "pending",
        value: void 0,
        then: function(e) {
          a.push(e);
        }
      };
    }
    return Yi++, t.then(Ms, Ms), t;
  }
  function Ms() {
    if (--Yi === 0 && Je !== null) {
      ce !== null && (ce.status = "fulfilled");
      var l = Je;
      Je = null, ie = 0, ce = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function Fm(l, t) {
    var a = [], e = {
      status: "pending",
      value: null,
      reason: null,
      then: function(u) {
        a.push(u);
      }
    };
    return l.then(
      function() {
        e.status = "fulfilled", e.value = t;
        for (var u = 0; u < a.length; u++) (0, a[u])(t);
      },
      function(u) {
        for (e.status = "rejected", e.reason = u, u = 0; u < a.length; u++)
          (0, a[u])(void 0);
      }
    ), e;
  }
  var Ns = p.S;
  p.S = function(l, t) {
    rd = tt(), typeof t == "object" && t !== null && typeof t.then == "function" && $m(l, t), Ns !== null && Ns(l, t);
  };
  var Ca = o(null);
  function Gi() {
    var l = Ca.current;
    return l !== null ? l : vl.pooledCache;
  }
  function $u(l, t) {
    t === null ? O(Ca, Ca.current) : O(Ca, t.pool);
  }
  function Os() {
    var l = Gi();
    return l === null ? null : { parent: Al._currentValue, pool: l };
  }
  var fe = Error(m(460)), Qi = Error(m(474)), Fu = Error(m(542)), Iu = { then: function() {
  } };
  function Ds(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function js(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(Ct, Ct), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, Cs(l), l;
      default:
        if (typeof t.status == "string") t.then(Ct, Ct);
        else {
          if (l = vl, l !== null && 100 < l.shellSuspendCounter)
            throw Error(m(482));
          l = t, l.status = "pending", l.then(
            function(e) {
              if (t.status === "pending") {
                var u = t;
                u.status = "fulfilled", u.value = e;
              }
            },
            function(e) {
              if (t.status === "pending") {
                var u = t;
                u.status = "rejected", u.reason = e;
              }
            }
          );
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw l = t.reason, Cs(l), l;
        }
        throw Ra = t, fe;
    }
  }
  function Ha(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (Ra = a, fe) : a;
    }
  }
  var Ra = null;
  function Us() {
    if (Ra === null) throw Error(m(459));
    var l = Ra;
    return Ra = null, l;
  }
  function Cs(l) {
    if (l === fe || l === Fu)
      throw Error(m(483));
  }
  var se = null, we = 0;
  function Pu(l) {
    var t = we;
    return we += 1, se === null && (se = []), js(se, l, t);
  }
  function ke(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function ln(l, t) {
    throw t.$$typeof === Y ? Error(m(525)) : (l = Object.prototype.toString.call(t), Error(
      m(
        31,
        l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l
      )
    ));
  }
  function Hs(l) {
    function t(d, s) {
      if (l) {
        var h = d.deletions;
        h === null ? (d.deletions = [s], d.flags |= 16) : h.push(s);
      }
    }
    function a(d, s) {
      if (!l) return null;
      for (; s !== null; )
        t(d, s), s = s.sibling;
      return null;
    }
    function e(d) {
      for (var s = /* @__PURE__ */ new Map(); d !== null; )
        d.key !== null ? s.set(d.key, d) : s.set(d.index, d), d = d.sibling;
      return s;
    }
    function u(d, s) {
      return d = Rt(d, s), d.index = 0, d.sibling = null, d;
    }
    function n(d, s, h) {
      return d.index = h, l ? (h = d.alternate, h !== null ? (h = h.index, h < s ? (d.flags |= 67108866, s) : h) : (d.flags |= 67108866, s)) : (d.flags |= 1048576, s);
    }
    function i(d) {
      return l && d.alternate === null && (d.flags |= 67108866), d;
    }
    function c(d, s, h, z) {
      return s === null || s.tag !== 6 ? (s = Ni(h, d.mode, z), s.return = d, s) : (s = u(s, h), s.return = d, s);
    }
    function f(d, s, h, z) {
      var q = h.type;
      return q === nl ? x(
        d,
        s,
        h.props.children,
        z,
        h.key
      ) : s !== null && (s.elementType === q || typeof q == "object" && q !== null && q.$$typeof === Kl && Ha(q) === s.type) ? (s = u(s, h.props), ke(s, h), s.return = d, s) : (s = Ju(
        h.type,
        h.key,
        h.props,
        null,
        d.mode,
        z
      ), ke(s, h), s.return = d, s);
    }
    function y(d, s, h, z) {
      return s === null || s.tag !== 4 || s.stateNode.containerInfo !== h.containerInfo || s.stateNode.implementation !== h.implementation ? (s = Oi(h, d.mode, z), s.return = d, s) : (s = u(s, h.children || []), s.return = d, s);
    }
    function x(d, s, h, z, q) {
      return s === null || s.tag !== 7 ? (s = Oa(
        h,
        d.mode,
        z,
        q
      ), s.return = d, s) : (s = u(s, h), s.return = d, s);
    }
    function T(d, s, h) {
      if (typeof s == "string" && s !== "" || typeof s == "number" || typeof s == "bigint")
        return s = Ni(
          "" + s,
          d.mode,
          h
        ), s.return = d, s;
      if (typeof s == "object" && s !== null) {
        switch (s.$$typeof) {
          case B:
            return h = Ju(
              s.type,
              s.key,
              s.props,
              null,
              d.mode,
              h
            ), ke(h, s), h.return = d, h;
          case hl:
            return s = Oi(
              s,
              d.mode,
              h
            ), s.return = d, s;
          case Kl:
            return s = Ha(s), T(d, s, h);
        }
        if (pt(s) || Jl(s))
          return s = Oa(
            s,
            d.mode,
            h,
            null
          ), s.return = d, s;
        if (typeof s.then == "function")
          return T(d, Pu(s), h);
        if (s.$$typeof === _l)
          return T(
            d,
            Wu(d, s),
            h
          );
        ln(d, s);
      }
      return null;
    }
    function b(d, s, h, z) {
      var q = s !== null ? s.key : null;
      if (typeof h == "string" && h !== "" || typeof h == "number" || typeof h == "bigint")
        return q !== null ? null : c(d, s, "" + h, z);
      if (typeof h == "object" && h !== null) {
        switch (h.$$typeof) {
          case B:
            return h.key === q ? f(d, s, h, z) : null;
          case hl:
            return h.key === q ? y(d, s, h, z) : null;
          case Kl:
            return h = Ha(h), b(d, s, h, z);
        }
        if (pt(h) || Jl(h))
          return q !== null ? null : x(d, s, h, z, null);
        if (typeof h.then == "function")
          return b(
            d,
            s,
            Pu(h),
            z
          );
        if (h.$$typeof === _l)
          return b(
            d,
            s,
            Wu(d, h),
            z
          );
        ln(d, h);
      }
      return null;
    }
    function S(d, s, h, z, q) {
      if (typeof z == "string" && z !== "" || typeof z == "number" || typeof z == "bigint")
        return d = d.get(h) || null, c(s, d, "" + z, q);
      if (typeof z == "object" && z !== null) {
        switch (z.$$typeof) {
          case B:
            return d = d.get(
              z.key === null ? h : z.key
            ) || null, f(s, d, z, q);
          case hl:
            return d = d.get(
              z.key === null ? h : z.key
            ) || null, y(s, d, z, q);
          case Kl:
            return z = Ha(z), S(
              d,
              s,
              h,
              z,
              q
            );
        }
        if (pt(z) || Jl(z))
          return d = d.get(h) || null, x(s, d, z, q, null);
        if (typeof z.then == "function")
          return S(
            d,
            s,
            h,
            Pu(z),
            q
          );
        if (z.$$typeof === _l)
          return S(
            d,
            s,
            h,
            Wu(s, z),
            q
          );
        ln(s, z);
      }
      return null;
    }
    function D(d, s, h, z) {
      for (var q = null, tl = null, U = s, w = s = 0, P = null; U !== null && w < h.length; w++) {
        U.index > w ? (P = U, U = null) : P = U.sibling;
        var al = b(
          d,
          U,
          h[w],
          z
        );
        if (al === null) {
          U === null && (U = P);
          break;
        }
        l && U && al.alternate === null && t(d, U), s = n(al, s, w), tl === null ? q = al : tl.sibling = al, tl = al, U = P;
      }
      if (w === h.length)
        return a(d, U), ll && Bt(d, w), q;
      if (U === null) {
        for (; w < h.length; w++)
          U = T(d, h[w], z), U !== null && (s = n(
            U,
            s,
            w
          ), tl === null ? q = U : tl.sibling = U, tl = U);
        return ll && Bt(d, w), q;
      }
      for (U = e(U); w < h.length; w++)
        P = S(
          U,
          d,
          w,
          h[w],
          z
        ), P !== null && (l && P.alternate !== null && U.delete(
          P.key === null ? w : P.key
        ), s = n(
          P,
          s,
          w
        ), tl === null ? q = P : tl.sibling = P, tl = P);
      return l && U.forEach(function(xa) {
        return t(d, xa);
      }), ll && Bt(d, w), q;
    }
    function G(d, s, h, z) {
      if (h == null) throw Error(m(151));
      for (var q = null, tl = null, U = s, w = s = 0, P = null, al = h.next(); U !== null && !al.done; w++, al = h.next()) {
        U.index > w ? (P = U, U = null) : P = U.sibling;
        var xa = b(d, U, al.value, z);
        if (xa === null) {
          U === null && (U = P);
          break;
        }
        l && U && xa.alternate === null && t(d, U), s = n(xa, s, w), tl === null ? q = xa : tl.sibling = xa, tl = xa, U = P;
      }
      if (al.done)
        return a(d, U), ll && Bt(d, w), q;
      if (U === null) {
        for (; !al.done; w++, al = h.next())
          al = T(d, al.value, z), al !== null && (s = n(al, s, w), tl === null ? q = al : tl.sibling = al, tl = al);
        return ll && Bt(d, w), q;
      }
      for (U = e(U); !al.done; w++, al = h.next())
        al = S(U, d, w, al.value, z), al !== null && (l && al.alternate !== null && U.delete(al.key === null ? w : al.key), s = n(al, s, w), tl === null ? q = al : tl.sibling = al, tl = al);
      return l && U.forEach(function(fv) {
        return t(d, fv);
      }), ll && Bt(d, w), q;
    }
    function rl(d, s, h, z) {
      if (typeof h == "object" && h !== null && h.type === nl && h.key === null && (h = h.props.children), typeof h == "object" && h !== null) {
        switch (h.$$typeof) {
          case B:
            l: {
              for (var q = h.key; s !== null; ) {
                if (s.key === q) {
                  if (q = h.type, q === nl) {
                    if (s.tag === 7) {
                      a(
                        d,
                        s.sibling
                      ), z = u(
                        s,
                        h.props.children
                      ), z.return = d, d = z;
                      break l;
                    }
                  } else if (s.elementType === q || typeof q == "object" && q !== null && q.$$typeof === Kl && Ha(q) === s.type) {
                    a(
                      d,
                      s.sibling
                    ), z = u(s, h.props), ke(z, h), z.return = d, d = z;
                    break l;
                  }
                  a(d, s);
                  break;
                } else t(d, s);
                s = s.sibling;
              }
              h.type === nl ? (z = Oa(
                h.props.children,
                d.mode,
                z,
                h.key
              ), z.return = d, d = z) : (z = Ju(
                h.type,
                h.key,
                h.props,
                null,
                d.mode,
                z
              ), ke(z, h), z.return = d, d = z);
            }
            return i(d);
          case hl:
            l: {
              for (q = h.key; s !== null; ) {
                if (s.key === q)
                  if (s.tag === 4 && s.stateNode.containerInfo === h.containerInfo && s.stateNode.implementation === h.implementation) {
                    a(
                      d,
                      s.sibling
                    ), z = u(s, h.children || []), z.return = d, d = z;
                    break l;
                  } else {
                    a(d, s);
                    break;
                  }
                else t(d, s);
                s = s.sibling;
              }
              z = Oi(h, d.mode, z), z.return = d, d = z;
            }
            return i(d);
          case Kl:
            return h = Ha(h), rl(
              d,
              s,
              h,
              z
            );
        }
        if (pt(h))
          return D(
            d,
            s,
            h,
            z
          );
        if (Jl(h)) {
          if (q = Jl(h), typeof q != "function") throw Error(m(150));
          return h = q.call(h), G(
            d,
            s,
            h,
            z
          );
        }
        if (typeof h.then == "function")
          return rl(
            d,
            s,
            Pu(h),
            z
          );
        if (h.$$typeof === _l)
          return rl(
            d,
            s,
            Wu(d, h),
            z
          );
        ln(d, h);
      }
      return typeof h == "string" && h !== "" || typeof h == "number" || typeof h == "bigint" ? (h = "" + h, s !== null && s.tag === 6 ? (a(d, s.sibling), z = u(s, h), z.return = d, d = z) : (a(d, s), z = Ni(h, d.mode, z), z.return = d, d = z), i(d)) : a(d, s);
    }
    return function(d, s, h, z) {
      try {
        we = 0;
        var q = rl(
          d,
          s,
          h,
          z
        );
        return se = null, q;
      } catch (U) {
        if (U === fe || U === Fu) throw U;
        var tl = nt(29, U, null, d.mode);
        return tl.lanes = z, tl.return = d, tl;
      }
    };
  }
  var Ba = Hs(!0), Rs = Hs(!1), ea = !1;
  function Xi(l) {
    l.updateQueue = {
      baseState: l.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function Zi(l, t) {
    l = l.updateQueue, t.updateQueue === l && (t.updateQueue = {
      baseState: l.baseState,
      firstBaseUpdate: l.firstBaseUpdate,
      lastBaseUpdate: l.lastBaseUpdate,
      shared: l.shared,
      callbacks: null
    });
  }
  function ua(l) {
    return { lane: l, tag: 0, payload: null, callback: null, next: null };
  }
  function na(l, t, a) {
    var e = l.updateQueue;
    if (e === null) return null;
    if (e = e.shared, (ul & 2) !== 0) {
      var u = e.pending;
      return u === null ? t.next = t : (t.next = u.next, u.next = t), e.pending = t, t = Ku(l), bs(l, null, a), t;
    }
    return Vu(l, e, t, a), Ku(l);
  }
  function We(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var e = t.lanes;
      e &= l.pendingLanes, a |= e, t.lanes = a, Af(l, a);
    }
  }
  function Li(l, t) {
    var a = l.updateQueue, e = l.alternate;
    if (e !== null && (e = e.updateQueue, a === e)) {
      var u = null, n = null;
      if (a = a.firstBaseUpdate, a !== null) {
        do {
          var i = {
            lane: a.lane,
            tag: a.tag,
            payload: a.payload,
            callback: null,
            next: null
          };
          n === null ? u = n = i : n = n.next = i, a = a.next;
        } while (a !== null);
        n === null ? u = n = t : n = n.next = t;
      } else u = n = t;
      a = {
        baseState: e.baseState,
        firstBaseUpdate: u,
        lastBaseUpdate: n,
        shared: e.shared,
        callbacks: e.callbacks
      }, l.updateQueue = a;
      return;
    }
    l = a.lastBaseUpdate, l === null ? a.firstBaseUpdate = t : l.next = t, a.lastBaseUpdate = t;
  }
  var Vi = !1;
  function $e() {
    if (Vi) {
      var l = ce;
      if (l !== null) throw l;
    }
  }
  function Fe(l, t, a, e) {
    Vi = !1;
    var u = l.updateQueue;
    ea = !1;
    var n = u.firstBaseUpdate, i = u.lastBaseUpdate, c = u.shared.pending;
    if (c !== null) {
      u.shared.pending = null;
      var f = c, y = f.next;
      f.next = null, i === null ? n = y : i.next = y, i = f;
      var x = l.alternate;
      x !== null && (x = x.updateQueue, c = x.lastBaseUpdate, c !== i && (c === null ? x.firstBaseUpdate = y : c.next = y, x.lastBaseUpdate = f));
    }
    if (n !== null) {
      var T = u.baseState;
      i = 0, x = y = f = null, c = n;
      do {
        var b = c.lane & -536870913, S = b !== c.lane;
        if (S ? (I & b) === b : (e & b) === b) {
          b !== 0 && b === ie && (Vi = !0), x !== null && (x = x.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var D = l, G = c;
            b = t;
            var rl = a;
            switch (G.tag) {
              case 1:
                if (D = G.payload, typeof D == "function") {
                  T = D.call(rl, T, b);
                  break l;
                }
                T = D;
                break l;
              case 3:
                D.flags = D.flags & -65537 | 128;
              case 0:
                if (D = G.payload, b = typeof D == "function" ? D.call(rl, T, b) : D, b == null) break l;
                T = _({}, T, b);
                break l;
              case 2:
                ea = !0;
            }
          }
          b = c.callback, b !== null && (l.flags |= 64, S && (l.flags |= 8192), S = u.callbacks, S === null ? u.callbacks = [b] : S.push(b));
        } else
          S = {
            lane: b,
            tag: c.tag,
            payload: c.payload,
            callback: c.callback,
            next: null
          }, x === null ? (y = x = S, f = T) : x = x.next = S, i |= b;
        if (c = c.next, c === null) {
          if (c = u.shared.pending, c === null)
            break;
          S = c, c = S.next, S.next = null, u.lastBaseUpdate = S, u.shared.pending = null;
        }
      } while (!0);
      x === null && (f = T), u.baseState = f, u.firstBaseUpdate = y, u.lastBaseUpdate = x, n === null && (u.shared.lanes = 0), oa |= i, l.lanes = i, l.memoizedState = T;
    }
  }
  function Bs(l, t) {
    if (typeof l != "function")
      throw Error(m(191, l));
    l.call(t);
  }
  function qs(l, t) {
    var a = l.callbacks;
    if (a !== null)
      for (l.callbacks = null, l = 0; l < a.length; l++)
        Bs(a[l], t);
  }
  var oe = o(null), tn = o(0);
  function Ys(l, t) {
    l = wt, O(tn, l), O(oe, t), wt = l | t.baseLanes;
  }
  function Ki() {
    O(tn, wt), O(oe, oe.current);
  }
  function Ji() {
    wt = tn.current, E(oe), E(tn);
  }
  var it = o(null), bt = null;
  function ia(l) {
    var t = l.alternate;
    O(Tl, Tl.current & 1), O(it, l), bt === null && (t === null || oe.current !== null || t.memoizedState !== null) && (bt = l);
  }
  function wi(l) {
    O(Tl, Tl.current), O(it, l), bt === null && (bt = l);
  }
  function Gs(l) {
    l.tag === 22 ? (O(Tl, Tl.current), O(it, l), bt === null && (bt = l)) : ca();
  }
  function ca() {
    O(Tl, Tl.current), O(it, it.current);
  }
  function ct(l) {
    E(it), bt === l && (bt = null), E(Tl);
  }
  var Tl = o(0);
  function an(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var a = t.memoizedState;
        if (a !== null && (a = a.dehydrated, a === null || Pc(a) || lf(a)))
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
  var Gt = 0, J = null, ol = null, Ml = null, en = !1, de = !1, qa = !1, un = 0, Ie = 0, re = null, Im = 0;
  function xl() {
    throw Error(m(321));
  }
  function ki(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++)
      if (!ut(l[a], t[a])) return !1;
    return !0;
  }
  function Wi(l, t, a, e, u, n) {
    return Gt = n, J = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, p.H = l === null || l.memoizedState === null ? To : oc, qa = !1, n = a(e, u), qa = !1, de && (n = Xs(
      t,
      a,
      e,
      u
    )), Qs(l), n;
  }
  function Qs(l) {
    p.H = tu;
    var t = ol !== null && ol.next !== null;
    if (Gt = 0, Ml = ol = J = null, en = !1, Ie = 0, re = null, t) throw Error(m(300));
    l === null || Nl || (l = l.dependencies, l !== null && ku(l) && (Nl = !0));
  }
  function Xs(l, t, a, e) {
    J = l;
    var u = 0;
    do {
      if (de && (re = null), Ie = 0, de = !1, 25 <= u) throw Error(m(301));
      if (u += 1, Ml = ol = null, l.updateQueue != null) {
        var n = l.updateQueue;
        n.lastEffect = null, n.events = null, n.stores = null, n.memoCache != null && (n.memoCache.index = 0);
      }
      p.H = Eo, n = t(a, e);
    } while (de);
    return n;
  }
  function Pm() {
    var l = p.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? Pe(t) : t, l = l.useState()[0], (ol !== null ? ol.memoizedState : null) !== l && (J.flags |= 1024), t;
  }
  function $i() {
    var l = un !== 0;
    return un = 0, l;
  }
  function Fi(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function Ii(l) {
    if (en) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      en = !1;
    }
    Gt = 0, Ml = ol = J = null, de = !1, Ie = un = 0, re = null;
  }
  function Vl() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Ml === null ? J.memoizedState = Ml = l : Ml = Ml.next = l, Ml;
  }
  function El() {
    if (ol === null) {
      var l = J.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = ol.next;
    var t = Ml === null ? J.memoizedState : Ml.next;
    if (t !== null)
      Ml = t, ol = l;
    else {
      if (l === null)
        throw J.alternate === null ? Error(m(467)) : Error(m(310));
      ol = l, l = {
        memoizedState: ol.memoizedState,
        baseState: ol.baseState,
        baseQueue: ol.baseQueue,
        queue: ol.queue,
        next: null
      }, Ml === null ? J.memoizedState = Ml = l : Ml = Ml.next = l;
    }
    return Ml;
  }
  function nn() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Pe(l) {
    var t = Ie;
    return Ie += 1, re === null && (re = []), l = js(re, l, t), t = J, (Ml === null ? t.memoizedState : Ml.next) === null && (t = t.alternate, p.H = t === null || t.memoizedState === null ? To : oc), l;
  }
  function cn(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return Pe(l);
      if (l.$$typeof === _l) return Yl(l);
    }
    throw Error(m(438, String(l)));
  }
  function Pi(l) {
    var t = null, a = J.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var e = J.alternate;
      e !== null && (e = e.updateQueue, e !== null && (e = e.memoCache, e != null && (t = {
        data: e.data.map(function(u) {
          return u.slice();
        }),
        index: 0
      })));
    }
    if (t == null && (t = { data: [], index: 0 }), a === null && (a = nn(), J.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0)
      for (a = t.data[t.index] = Array(l), e = 0; e < l; e++)
        a[e] = Xa;
    return t.index++, a;
  }
  function Qt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function fn(l) {
    var t = El();
    return lc(t, ol, l);
  }
  function lc(l, t, a) {
    var e = l.queue;
    if (e === null) throw Error(m(311));
    e.lastRenderedReducer = a;
    var u = l.baseQueue, n = e.pending;
    if (n !== null) {
      if (u !== null) {
        var i = u.next;
        u.next = n.next, n.next = i;
      }
      t.baseQueue = u = n, e.pending = null;
    }
    if (n = l.baseState, u === null) l.memoizedState = n;
    else {
      t = u.next;
      var c = i = null, f = null, y = t, x = !1;
      do {
        var T = y.lane & -536870913;
        if (T !== y.lane ? (I & T) === T : (Gt & T) === T) {
          var b = y.revertLane;
          if (b === 0)
            f !== null && (f = f.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: y.action,
              hasEagerState: y.hasEagerState,
              eagerState: y.eagerState,
              next: null
            }), T === ie && (x = !0);
          else if ((Gt & b) === b) {
            y = y.next, b === ie && (x = !0);
            continue;
          } else
            T = {
              lane: 0,
              revertLane: y.revertLane,
              gesture: null,
              action: y.action,
              hasEagerState: y.hasEagerState,
              eagerState: y.eagerState,
              next: null
            }, f === null ? (c = f = T, i = n) : f = f.next = T, J.lanes |= b, oa |= b;
          T = y.action, qa && a(n, T), n = y.hasEagerState ? y.eagerState : a(n, T);
        } else
          b = {
            lane: T,
            revertLane: y.revertLane,
            gesture: y.gesture,
            action: y.action,
            hasEagerState: y.hasEagerState,
            eagerState: y.eagerState,
            next: null
          }, f === null ? (c = f = b, i = n) : f = f.next = b, J.lanes |= T, oa |= T;
        y = y.next;
      } while (y !== null && y !== t);
      if (f === null ? i = n : f.next = c, !ut(n, l.memoizedState) && (Nl = !0, x && (a = ce, a !== null)))
        throw a;
      l.memoizedState = n, l.baseState = i, l.baseQueue = f, e.lastRenderedState = n;
    }
    return u === null && (e.lanes = 0), [l.memoizedState, e.dispatch];
  }
  function tc(l) {
    var t = El(), a = t.queue;
    if (a === null) throw Error(m(311));
    a.lastRenderedReducer = l;
    var e = a.dispatch, u = a.pending, n = t.memoizedState;
    if (u !== null) {
      a.pending = null;
      var i = u = u.next;
      do
        n = l(n, i.action), i = i.next;
      while (i !== u);
      ut(n, t.memoizedState) || (Nl = !0), t.memoizedState = n, t.baseQueue === null && (t.baseState = n), a.lastRenderedState = n;
    }
    return [n, e];
  }
  function Zs(l, t, a) {
    var e = J, u = El(), n = ll;
    if (n) {
      if (a === void 0) throw Error(m(407));
      a = a();
    } else a = t();
    var i = !ut(
      (ol || u).memoizedState,
      a
    );
    if (i && (u.memoizedState = a, Nl = !0), u = u.queue, uc(Ks.bind(null, e, u, l), [
      l
    ]), u.getSnapshot !== t || i || Ml !== null && Ml.memoizedState.tag & 1) {
      if (e.flags |= 2048, me(
        9,
        { destroy: void 0 },
        Vs.bind(
          null,
          e,
          u,
          a,
          t
        ),
        null
      ), vl === null) throw Error(m(349));
      n || (Gt & 127) !== 0 || Ls(e, t, a);
    }
    return a;
  }
  function Ls(l, t, a) {
    l.flags |= 16384, l = { getSnapshot: t, value: a }, t = J.updateQueue, t === null ? (t = nn(), J.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
  }
  function Vs(l, t, a, e) {
    t.value = a, t.getSnapshot = e, Js(t) && ws(l);
  }
  function Ks(l, t, a) {
    return a(function() {
      Js(t) && ws(l);
    });
  }
  function Js(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var a = t();
      return !ut(l, a);
    } catch {
      return !0;
    }
  }
  function ws(l) {
    var t = Na(l, 2);
    t !== null && Pl(t, l, 2);
  }
  function ac(l) {
    var t = Vl();
    if (typeof l == "function") {
      var a = l;
      if (l = a(), qa) {
        $t(!0);
        try {
          a();
        } finally {
          $t(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = l, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Qt,
      lastRenderedState: l
    }, t;
  }
  function ks(l, t, a, e) {
    return l.baseState = a, lc(
      l,
      ol,
      typeof e == "function" ? e : Qt
    );
  }
  function l0(l, t, a, e, u) {
    if (dn(l)) throw Error(m(485));
    if (l = t.action, l !== null) {
      var n = {
        payload: u,
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
      p.T !== null ? a(!0) : n.isTransition = !1, e(n), a = t.pending, a === null ? (n.next = t.pending = n, Ws(t, n)) : (n.next = a.next, t.pending = a.next = n);
    }
  }
  function Ws(l, t) {
    var a = t.action, e = t.payload, u = l.state;
    if (t.isTransition) {
      var n = p.T, i = {};
      p.T = i;
      try {
        var c = a(u, e), f = p.S;
        f !== null && f(i, c), $s(l, t, c);
      } catch (y) {
        ec(l, t, y);
      } finally {
        n !== null && i.types !== null && (n.types = i.types), p.T = n;
      }
    } else
      try {
        n = a(u, e), $s(l, t, n);
      } catch (y) {
        ec(l, t, y);
      }
  }
  function $s(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(
      function(e) {
        Fs(l, t, e);
      },
      function(e) {
        return ec(l, t, e);
      }
    ) : Fs(l, t, a);
  }
  function Fs(l, t, a) {
    t.status = "fulfilled", t.value = a, Is(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, Ws(l, a)));
  }
  function ec(l, t, a) {
    var e = l.pending;
    if (l.pending = null, e !== null) {
      e = e.next;
      do
        t.status = "rejected", t.reason = a, Is(t), t = t.next;
      while (t !== e);
    }
    l.action = null;
  }
  function Is(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function Ps(l, t) {
    return t;
  }
  function lo(l, t) {
    if (ll) {
      var a = vl.formState;
      if (a !== null) {
        l: {
          var e = J;
          if (ll) {
            if (yl) {
              t: {
                for (var u = yl, n = gt; u.nodeType !== 8; ) {
                  if (!n) {
                    u = null;
                    break t;
                  }
                  if (u = St(
                    u.nextSibling
                  ), u === null) {
                    u = null;
                    break t;
                  }
                }
                n = u.data, u = n === "F!" || n === "F" ? u : null;
              }
              if (u) {
                yl = St(
                  u.nextSibling
                ), e = u.data === "F!";
                break l;
              }
            }
            ta(e);
          }
          e = !1;
        }
        e && (t = a[0]);
      }
    }
    return a = Vl(), a.memoizedState = a.baseState = t, e = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Ps,
      lastRenderedState: t
    }, a.queue = e, a = xo.bind(
      null,
      J,
      e
    ), e.dispatch = a, e = ac(!1), n = sc.bind(
      null,
      J,
      !1,
      e.queue
    ), e = Vl(), u = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, e.queue = u, a = l0.bind(
      null,
      J,
      u,
      n,
      a
    ), u.dispatch = a, e.memoizedState = l, [t, a, !1];
  }
  function to(l) {
    var t = El();
    return ao(t, ol, l);
  }
  function ao(l, t, a) {
    if (t = lc(
      l,
      t,
      Ps
    )[0], l = fn(Qt)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var e = Pe(t);
      } catch (i) {
        throw i === fe ? Fu : i;
      }
    else e = t;
    t = El();
    var u = t.queue, n = u.dispatch;
    return a !== t.memoizedState && (J.flags |= 2048, me(
      9,
      { destroy: void 0 },
      t0.bind(null, u, a),
      null
    )), [e, n, l];
  }
  function t0(l, t) {
    l.action = t;
  }
  function eo(l) {
    var t = El(), a = ol;
    if (a !== null)
      return ao(t, a, l);
    El(), t = t.memoizedState, a = El();
    var e = a.queue.dispatch;
    return a.memoizedState = l, [t, e, !1];
  }
  function me(l, t, a, e) {
    return l = { tag: l, create: a, deps: e, inst: t, next: null }, t = J.updateQueue, t === null && (t = nn(), J.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (e = a.next, a.next = l, l.next = e, t.lastEffect = l), l;
  }
  function uo() {
    return El().memoizedState;
  }
  function sn(l, t, a, e) {
    var u = Vl();
    J.flags |= l, u.memoizedState = me(
      1 | t,
      { destroy: void 0 },
      a,
      e === void 0 ? null : e
    );
  }
  function on(l, t, a, e) {
    var u = El();
    e = e === void 0 ? null : e;
    var n = u.memoizedState.inst;
    ol !== null && e !== null && ki(e, ol.memoizedState.deps) ? u.memoizedState = me(t, n, a, e) : (J.flags |= l, u.memoizedState = me(
      1 | t,
      n,
      a,
      e
    ));
  }
  function no(l, t) {
    sn(8390656, 8, l, t);
  }
  function uc(l, t) {
    on(2048, 8, l, t);
  }
  function a0(l) {
    J.flags |= 4;
    var t = J.updateQueue;
    if (t === null)
      t = nn(), J.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function io(l) {
    var t = El().memoizedState;
    return a0({ ref: t, nextImpl: l }), function() {
      if ((ul & 2) !== 0) throw Error(m(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function co(l, t) {
    return on(4, 2, l, t);
  }
  function fo(l, t) {
    return on(4, 4, l, t);
  }
  function so(l, t) {
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
  function oo(l, t, a) {
    a = a != null ? a.concat([l]) : null, on(4, 4, so.bind(null, t, l), a);
  }
  function nc() {
  }
  function ro(l, t) {
    var a = El();
    t = t === void 0 ? null : t;
    var e = a.memoizedState;
    return t !== null && ki(t, e[1]) ? e[0] : (a.memoizedState = [l, t], l);
  }
  function mo(l, t) {
    var a = El();
    t = t === void 0 ? null : t;
    var e = a.memoizedState;
    if (t !== null && ki(t, e[1]))
      return e[0];
    if (e = l(), qa) {
      $t(!0);
      try {
        l();
      } finally {
        $t(!1);
      }
    }
    return a.memoizedState = [e, t], e;
  }
  function ic(l, t, a) {
    return a === void 0 || (Gt & 1073741824) !== 0 && (I & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = vd(), J.lanes |= l, oa |= l, a);
  }
  function vo(l, t, a, e) {
    return ut(a, t) ? a : oe.current !== null ? (l = ic(l, a, e), ut(l, t) || (Nl = !0), l) : (Gt & 42) === 0 || (Gt & 1073741824) !== 0 && (I & 261930) === 0 ? (Nl = !0, l.memoizedState = a) : (l = vd(), J.lanes |= l, oa |= l, t);
  }
  function ho(l, t, a, e, u) {
    var n = N.p;
    N.p = n !== 0 && 8 > n ? n : 8;
    var i = p.T, c = {};
    p.T = c, sc(l, !1, t, a);
    try {
      var f = u(), y = p.S;
      if (y !== null && y(c, f), f !== null && typeof f == "object" && typeof f.then == "function") {
        var x = Fm(
          f,
          e
        );
        lu(
          l,
          t,
          x,
          ot(l)
        );
      } else
        lu(
          l,
          t,
          e,
          ot(l)
        );
    } catch (T) {
      lu(
        l,
        t,
        { then: function() {
        }, status: "rejected", reason: T },
        ot()
      );
    } finally {
      N.p = n, i !== null && c.types !== null && (i.types = c.types), p.T = i;
    }
  }
  function e0() {
  }
  function cc(l, t, a, e) {
    if (l.tag !== 5) throw Error(m(476));
    var u = yo(l).queue;
    ho(
      l,
      u,
      t,
      Q,
      a === null ? e0 : function() {
        return go(l), a(e);
      }
    );
  }
  function yo(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: Q,
      baseState: Q,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Qt,
        lastRenderedState: Q
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
        lastRenderedReducer: Qt,
        lastRenderedState: a
      },
      next: null
    }, l.memoizedState = t, l = l.alternate, l !== null && (l.memoizedState = t), t;
  }
  function go(l) {
    var t = yo(l);
    t.next === null && (t = l.alternate.memoizedState), lu(
      l,
      t.next.queue,
      {},
      ot()
    );
  }
  function fc() {
    return Yl(gu);
  }
  function bo() {
    return El().memoizedState;
  }
  function So() {
    return El().memoizedState;
  }
  function u0(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = ot();
          l = ua(a);
          var e = na(t, l, a);
          e !== null && (Pl(e, t, a), We(e, t, a)), t = { cache: qi() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function n0(l, t, a) {
    var e = ot();
    a = {
      lane: e,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, dn(l) ? po(t, a) : (a = Ai(l, t, a, e), a !== null && (Pl(a, l, e), zo(a, t, e)));
  }
  function xo(l, t, a) {
    var e = ot();
    lu(l, t, a, e);
  }
  function lu(l, t, a, e) {
    var u = {
      lane: e,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (dn(l)) po(t, u);
    else {
      var n = l.alternate;
      if (l.lanes === 0 && (n === null || n.lanes === 0) && (n = t.lastRenderedReducer, n !== null))
        try {
          var i = t.lastRenderedState, c = n(i, a);
          if (u.hasEagerState = !0, u.eagerState = c, ut(c, i))
            return Vu(l, t, u, 0), vl === null && Lu(), !1;
        } catch {
        }
      if (a = Ai(l, t, u, e), a !== null)
        return Pl(a, l, e), zo(a, t, e), !0;
    }
    return !1;
  }
  function sc(l, t, a, e) {
    if (e = {
      lane: 2,
      revertLane: Xc(),
      gesture: null,
      action: e,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, dn(l)) {
      if (t) throw Error(m(479));
    } else
      t = Ai(
        l,
        a,
        e,
        2
      ), t !== null && Pl(t, l, 2);
  }
  function dn(l) {
    var t = l.alternate;
    return l === J || t !== null && t === J;
  }
  function po(l, t) {
    de = en = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function zo(l, t, a) {
    if ((a & 4194048) !== 0) {
      var e = t.lanes;
      e &= l.pendingLanes, a |= e, t.lanes = a, Af(l, a);
    }
  }
  var tu = {
    readContext: Yl,
    use: cn,
    useCallback: xl,
    useContext: xl,
    useEffect: xl,
    useImperativeHandle: xl,
    useLayoutEffect: xl,
    useInsertionEffect: xl,
    useMemo: xl,
    useReducer: xl,
    useRef: xl,
    useState: xl,
    useDebugValue: xl,
    useDeferredValue: xl,
    useTransition: xl,
    useSyncExternalStore: xl,
    useId: xl,
    useHostTransitionStatus: xl,
    useFormState: xl,
    useActionState: xl,
    useOptimistic: xl,
    useMemoCache: xl,
    useCacheRefresh: xl
  };
  tu.useEffectEvent = xl;
  var To = {
    readContext: Yl,
    use: cn,
    useCallback: function(l, t) {
      return Vl().memoizedState = [
        l,
        t === void 0 ? null : t
      ], l;
    },
    useContext: Yl,
    useEffect: no,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, sn(
        4194308,
        4,
        so.bind(null, t, l),
        a
      );
    },
    useLayoutEffect: function(l, t) {
      return sn(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      sn(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var a = Vl();
      t = t === void 0 ? null : t;
      var e = l();
      if (qa) {
        $t(!0);
        try {
          l();
        } finally {
          $t(!1);
        }
      }
      return a.memoizedState = [e, t], e;
    },
    useReducer: function(l, t, a) {
      var e = Vl();
      if (a !== void 0) {
        var u = a(t);
        if (qa) {
          $t(!0);
          try {
            a(t);
          } finally {
            $t(!1);
          }
        }
      } else u = t;
      return e.memoizedState = e.baseState = u, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: u
      }, e.queue = l, l = l.dispatch = n0.bind(
        null,
        J,
        l
      ), [e.memoizedState, l];
    },
    useRef: function(l) {
      var t = Vl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = ac(l);
      var t = l.queue, a = xo.bind(null, J, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: nc,
    useDeferredValue: function(l, t) {
      var a = Vl();
      return ic(a, l, t);
    },
    useTransition: function() {
      var l = ac(!1);
      return l = ho.bind(
        null,
        J,
        l.queue,
        !0,
        !1
      ), Vl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var e = J, u = Vl();
      if (ll) {
        if (a === void 0)
          throw Error(m(407));
        a = a();
      } else {
        if (a = t(), vl === null)
          throw Error(m(349));
        (I & 127) !== 0 || Ls(e, t, a);
      }
      u.memoizedState = a;
      var n = { value: a, getSnapshot: t };
      return u.queue = n, no(Ks.bind(null, e, n, l), [
        l
      ]), e.flags |= 2048, me(
        9,
        { destroy: void 0 },
        Vs.bind(
          null,
          e,
          n,
          a,
          t
        ),
        null
      ), a;
    },
    useId: function() {
      var l = Vl(), t = vl.identifierPrefix;
      if (ll) {
        var a = Nt, e = Mt;
        a = (e & ~(1 << 32 - et(e) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = un++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else
        a = Im++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: fc,
    useFormState: lo,
    useActionState: lo,
    useOptimistic: function(l) {
      var t = Vl();
      t.memoizedState = t.baseState = l;
      var a = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = a, t = sc.bind(
        null,
        J,
        !0,
        a
      ), a.dispatch = t, [l, t];
    },
    useMemoCache: Pi,
    useCacheRefresh: function() {
      return Vl().memoizedState = u0.bind(
        null,
        J
      );
    },
    useEffectEvent: function(l) {
      var t = Vl(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((ul & 2) !== 0)
          throw Error(m(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, oc = {
    readContext: Yl,
    use: cn,
    useCallback: ro,
    useContext: Yl,
    useEffect: uc,
    useImperativeHandle: oo,
    useInsertionEffect: co,
    useLayoutEffect: fo,
    useMemo: mo,
    useReducer: fn,
    useRef: uo,
    useState: function() {
      return fn(Qt);
    },
    useDebugValue: nc,
    useDeferredValue: function(l, t) {
      var a = El();
      return vo(
        a,
        ol.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = fn(Qt)[0], t = El().memoizedState;
      return [
        typeof l == "boolean" ? l : Pe(l),
        t
      ];
    },
    useSyncExternalStore: Zs,
    useId: bo,
    useHostTransitionStatus: fc,
    useFormState: to,
    useActionState: to,
    useOptimistic: function(l, t) {
      var a = El();
      return ks(a, ol, l, t);
    },
    useMemoCache: Pi,
    useCacheRefresh: So
  };
  oc.useEffectEvent = io;
  var Eo = {
    readContext: Yl,
    use: cn,
    useCallback: ro,
    useContext: Yl,
    useEffect: uc,
    useImperativeHandle: oo,
    useInsertionEffect: co,
    useLayoutEffect: fo,
    useMemo: mo,
    useReducer: tc,
    useRef: uo,
    useState: function() {
      return tc(Qt);
    },
    useDebugValue: nc,
    useDeferredValue: function(l, t) {
      var a = El();
      return ol === null ? ic(a, l, t) : vo(
        a,
        ol.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = tc(Qt)[0], t = El().memoizedState;
      return [
        typeof l == "boolean" ? l : Pe(l),
        t
      ];
    },
    useSyncExternalStore: Zs,
    useId: bo,
    useHostTransitionStatus: fc,
    useFormState: eo,
    useActionState: eo,
    useOptimistic: function(l, t) {
      var a = El();
      return ol !== null ? ks(a, ol, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: Pi,
    useCacheRefresh: So
  };
  Eo.useEffectEvent = io;
  function dc(l, t, a, e) {
    t = l.memoizedState, a = a(e, t), a = a == null ? t : _({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var rc = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var e = ot(), u = ua(e);
      u.payload = t, a != null && (u.callback = a), t = na(l, u, e), t !== null && (Pl(t, l, e), We(t, l, e));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var e = ot(), u = ua(e);
      u.tag = 1, u.payload = t, a != null && (u.callback = a), t = na(l, u, e), t !== null && (Pl(t, l, e), We(t, l, e));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = ot(), e = ua(a);
      e.tag = 2, t != null && (e.callback = t), t = na(l, e, a), t !== null && (Pl(t, l, a), We(t, l, a));
    }
  };
  function _o(l, t, a, e, u, n, i) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(e, n, i) : t.prototype && t.prototype.isPureReactComponent ? !Xe(a, e) || !Xe(u, n) : !0;
  }
  function Ao(l, t, a, e) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, e), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, e), t.state !== l && rc.enqueueReplaceState(t, t.state, null);
  }
  function Ya(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var e in t)
        e !== "ref" && (a[e] = t[e]);
    }
    if (l = l.defaultProps) {
      a === t && (a = _({}, a));
      for (var u in l)
        a[u] === void 0 && (a[u] = l[u]);
    }
    return a;
  }
  function Mo(l) {
    Zu(l);
  }
  function No(l) {
    console.error(l);
  }
  function Oo(l) {
    Zu(l);
  }
  function rn(l, t) {
    try {
      var a = l.onUncaughtError;
      a(t.value, { componentStack: t.stack });
    } catch (e) {
      setTimeout(function() {
        throw e;
      });
    }
  }
  function Do(l, t, a) {
    try {
      var e = l.onCaughtError;
      e(a.value, {
        componentStack: a.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function mc(l, t, a) {
    return a = ua(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      rn(l, t);
    }, a;
  }
  function jo(l) {
    return l = ua(l), l.tag = 3, l;
  }
  function Uo(l, t, a, e) {
    var u = a.type.getDerivedStateFromError;
    if (typeof u == "function") {
      var n = e.value;
      l.payload = function() {
        return u(n);
      }, l.callback = function() {
        Do(t, a, e);
      };
    }
    var i = a.stateNode;
    i !== null && typeof i.componentDidCatch == "function" && (l.callback = function() {
      Do(t, a, e), typeof u != "function" && (da === null ? da = /* @__PURE__ */ new Set([this]) : da.add(this));
      var c = e.stack;
      this.componentDidCatch(e.value, {
        componentStack: c !== null ? c : ""
      });
    });
  }
  function i0(l, t, a, e, u) {
    if (a.flags |= 32768, e !== null && typeof e == "object" && typeof e.then == "function") {
      if (t = a.alternate, t !== null && ne(
        t,
        a,
        u,
        !0
      ), a = it.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return bt === null ? En() : a.alternate === null && pl === 0 && (pl = 3), a.flags &= -257, a.flags |= 65536, a.lanes = u, e === Iu ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([e]) : t.add(e), Yc(l, e, u)), !1;
          case 22:
            return a.flags |= 65536, e === Iu ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([e])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([e]) : a.add(e)), Yc(l, e, u)), !1;
        }
        throw Error(m(435, a.tag));
      }
      return Yc(l, e, u), En(), !1;
    }
    if (ll)
      return t = it.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = u, e !== Ui && (l = Error(m(422), { cause: e }), Ve(vt(l, a)))) : (e !== Ui && (t = Error(m(423), {
        cause: e
      }), Ve(
        vt(t, a)
      )), l = l.current.alternate, l.flags |= 65536, u &= -u, l.lanes |= u, e = vt(e, a), u = mc(
        l.stateNode,
        e,
        u
      ), Li(l, u), pl !== 4 && (pl = 2)), !1;
    var n = Error(m(520), { cause: e });
    if (n = vt(n, a), su === null ? su = [n] : su.push(n), pl !== 4 && (pl = 2), t === null) return !0;
    e = vt(e, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = u & -u, a.lanes |= l, l = mc(a.stateNode, e, l), Li(a, l), !1;
        case 1:
          if (t = a.type, n = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || n !== null && typeof n.componentDidCatch == "function" && (da === null || !da.has(n))))
            return a.flags |= 65536, u &= -u, a.lanes |= u, u = jo(u), Uo(
              u,
              l,
              a,
              e
            ), Li(a, u), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var vc = Error(m(461)), Nl = !1;
  function Gl(l, t, a, e) {
    t.child = l === null ? Rs(t, null, a, e) : Ba(
      t,
      l.child,
      a,
      e
    );
  }
  function Co(l, t, a, e, u) {
    a = a.render;
    var n = t.ref;
    if ("ref" in e) {
      var i = {};
      for (var c in e)
        c !== "ref" && (i[c] = e[c]);
    } else i = e;
    return Ua(t), e = Wi(
      l,
      t,
      a,
      i,
      n,
      u
    ), c = $i(), l !== null && !Nl ? (Fi(l, t, u), Xt(l, t, u)) : (ll && c && Di(t), t.flags |= 1, Gl(l, t, e, u), t.child);
  }
  function Ho(l, t, a, e, u) {
    if (l === null) {
      var n = a.type;
      return typeof n == "function" && !Mi(n) && n.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = n, Ro(
        l,
        t,
        n,
        e,
        u
      )) : (l = Ju(
        a.type,
        null,
        e,
        t,
        t.mode,
        u
      ), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (n = l.child, !zc(l, u)) {
      var i = n.memoizedProps;
      if (a = a.compare, a = a !== null ? a : Xe, a(i, e) && l.ref === t.ref)
        return Xt(l, t, u);
    }
    return t.flags |= 1, l = Rt(n, e), l.ref = t.ref, l.return = t, t.child = l;
  }
  function Ro(l, t, a, e, u) {
    if (l !== null) {
      var n = l.memoizedProps;
      if (Xe(n, e) && l.ref === t.ref)
        if (Nl = !1, t.pendingProps = e = n, zc(l, u))
          (l.flags & 131072) !== 0 && (Nl = !0);
        else
          return t.lanes = l.lanes, Xt(l, t, u);
    }
    return hc(
      l,
      t,
      a,
      e,
      u
    );
  }
  function Bo(l, t, a, e) {
    var u = e.children, n = l !== null ? l.memoizedState : null;
    if (l === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), e.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (n = n !== null ? n.baseLanes | a : a, l !== null) {
          for (e = t.child = l.child, u = 0; e !== null; )
            u = u | e.lanes | e.childLanes, e = e.sibling;
          e = u & ~n;
        } else e = 0, t.child = null;
        return qo(
          l,
          t,
          n,
          a,
          e
        );
      }
      if ((a & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, l !== null && $u(
          t,
          n !== null ? n.cachePool : null
        ), n !== null ? Ys(t, n) : Ki(), Gs(t);
      else
        return e = t.lanes = 536870912, qo(
          l,
          t,
          n !== null ? n.baseLanes | a : a,
          a,
          e
        );
    } else
      n !== null ? ($u(t, n.cachePool), Ys(t, n), ca(), t.memoizedState = null) : (l !== null && $u(t, null), Ki(), ca());
    return Gl(l, t, u, a), t.child;
  }
  function au(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function qo(l, t, a, e, u) {
    var n = Gi();
    return n = n === null ? null : { parent: Al._currentValue, pool: n }, t.memoizedState = {
      baseLanes: a,
      cachePool: n
    }, l !== null && $u(t, null), Ki(), Gs(t), l !== null && ne(l, t, e, !0), t.childLanes = u, null;
  }
  function mn(l, t) {
    return t = hn(
      { mode: t.mode, children: t.children },
      l.mode
    ), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function Yo(l, t, a) {
    return Ba(t, l.child, null, a), l = mn(t, t.pendingProps), l.flags |= 2, ct(t), t.memoizedState = null, l;
  }
  function c0(l, t, a) {
    var e = t.pendingProps, u = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (ll) {
        if (e.mode === "hidden")
          return l = mn(t, e), t.lanes = 536870912, au(null, l);
        if (wi(t), (l = yl) ? (l = $d(
          l,
          gt
        ), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: Pt !== null ? { id: Mt, overflow: Nt } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = xs(l), a.return = t, t.child = a, ql = t, yl = null)) : l = null, l === null) throw ta(t);
        return t.lanes = 536870912, null;
      }
      return mn(t, e);
    }
    var n = l.memoizedState;
    if (n !== null) {
      var i = n.dehydrated;
      if (wi(t), u)
        if (t.flags & 256)
          t.flags &= -257, t = Yo(
            l,
            t,
            a
          );
        else if (t.memoizedState !== null)
          t.child = l.child, t.flags |= 128, t = null;
        else throw Error(m(558));
      else if (Nl || ne(l, t, a, !1), u = (a & l.childLanes) !== 0, Nl || u) {
        if (e = vl, e !== null && (i = Mf(e, a), i !== 0 && i !== n.retryLane))
          throw n.retryLane = i, Na(l, i), Pl(e, l, i), vc;
        En(), t = Yo(
          l,
          t,
          a
        );
      } else
        l = n.treeContext, yl = St(i.nextSibling), ql = t, ll = !0, la = null, gt = !1, l !== null && Ts(t, l), t = mn(t, e), t.flags |= 4096;
      return t;
    }
    return l = Rt(l.child, {
      mode: e.mode,
      children: e.children
    }), l.ref = t.ref, t.child = l, l.return = t, l;
  }
  function vn(l, t) {
    var a = t.ref;
    if (a === null)
      l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof a != "function" && typeof a != "object")
        throw Error(m(284));
      (l === null || l.ref !== a) && (t.flags |= 4194816);
    }
  }
  function hc(l, t, a, e, u) {
    return Ua(t), a = Wi(
      l,
      t,
      a,
      e,
      void 0,
      u
    ), e = $i(), l !== null && !Nl ? (Fi(l, t, u), Xt(l, t, u)) : (ll && e && Di(t), t.flags |= 1, Gl(l, t, a, u), t.child);
  }
  function Go(l, t, a, e, u, n) {
    return Ua(t), t.updateQueue = null, a = Xs(
      t,
      e,
      a,
      u
    ), Qs(l), e = $i(), l !== null && !Nl ? (Fi(l, t, n), Xt(l, t, n)) : (ll && e && Di(t), t.flags |= 1, Gl(l, t, a, n), t.child);
  }
  function Qo(l, t, a, e, u) {
    if (Ua(t), t.stateNode === null) {
      var n = te, i = a.contextType;
      typeof i == "object" && i !== null && (n = Yl(i)), n = new a(e, n), t.memoizedState = n.state !== null && n.state !== void 0 ? n.state : null, n.updater = rc, t.stateNode = n, n._reactInternals = t, n = t.stateNode, n.props = e, n.state = t.memoizedState, n.refs = {}, Xi(t), i = a.contextType, n.context = typeof i == "object" && i !== null ? Yl(i) : te, n.state = t.memoizedState, i = a.getDerivedStateFromProps, typeof i == "function" && (dc(
        t,
        a,
        i,
        e
      ), n.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof n.getSnapshotBeforeUpdate == "function" || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (i = n.state, typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount(), i !== n.state && rc.enqueueReplaceState(n, n.state, null), Fe(t, e, n, u), $e(), n.state = t.memoizedState), typeof n.componentDidMount == "function" && (t.flags |= 4194308), e = !0;
    } else if (l === null) {
      n = t.stateNode;
      var c = t.memoizedProps, f = Ya(a, c);
      n.props = f;
      var y = n.context, x = a.contextType;
      i = te, typeof x == "object" && x !== null && (i = Yl(x));
      var T = a.getDerivedStateFromProps;
      x = typeof T == "function" || typeof n.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, x || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (c || y !== i) && Ao(
        t,
        n,
        e,
        i
      ), ea = !1;
      var b = t.memoizedState;
      n.state = b, Fe(t, e, n, u), $e(), y = t.memoizedState, c || b !== y || ea ? (typeof T == "function" && (dc(
        t,
        a,
        T,
        e
      ), y = t.memoizedState), (f = ea || _o(
        t,
        a,
        f,
        e,
        b,
        y,
        i
      )) ? (x || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount()), typeof n.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = e, t.memoizedState = y), n.props = e, n.state = y, n.context = i, e = f) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), e = !1);
    } else {
      n = t.stateNode, Zi(l, t), i = t.memoizedProps, x = Ya(a, i), n.props = x, T = t.pendingProps, b = n.context, y = a.contextType, f = te, typeof y == "object" && y !== null && (f = Yl(y)), c = a.getDerivedStateFromProps, (y = typeof c == "function" || typeof n.getSnapshotBeforeUpdate == "function") || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (i !== T || b !== f) && Ao(
        t,
        n,
        e,
        f
      ), ea = !1, b = t.memoizedState, n.state = b, Fe(t, e, n, u), $e();
      var S = t.memoizedState;
      i !== T || b !== S || ea || l !== null && l.dependencies !== null && ku(l.dependencies) ? (typeof c == "function" && (dc(
        t,
        a,
        c,
        e
      ), S = t.memoizedState), (x = ea || _o(
        t,
        a,
        x,
        e,
        b,
        S,
        f
      ) || l !== null && l.dependencies !== null && ku(l.dependencies)) ? (y || typeof n.UNSAFE_componentWillUpdate != "function" && typeof n.componentWillUpdate != "function" || (typeof n.componentWillUpdate == "function" && n.componentWillUpdate(e, S, f), typeof n.UNSAFE_componentWillUpdate == "function" && n.UNSAFE_componentWillUpdate(
        e,
        S,
        f
      )), typeof n.componentDidUpdate == "function" && (t.flags |= 4), typeof n.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 1024), t.memoizedProps = e, t.memoizedState = S), n.props = e, n.state = S, n.context = f, e = x) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 1024), e = !1);
    }
    return n = e, vn(l, t), e = (t.flags & 128) !== 0, n || e ? (n = t.stateNode, a = e && typeof a.getDerivedStateFromError != "function" ? null : n.render(), t.flags |= 1, l !== null && e ? (t.child = Ba(
      t,
      l.child,
      null,
      u
    ), t.child = Ba(
      t,
      null,
      a,
      u
    )) : Gl(l, t, a, u), t.memoizedState = n.state, l = t.child) : l = Xt(
      l,
      t,
      u
    ), l;
  }
  function Xo(l, t, a, e) {
    return Da(), t.flags |= 256, Gl(l, t, a, e), t.child;
  }
  var yc = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function gc(l) {
    return { baseLanes: l, cachePool: Os() };
  }
  function bc(l, t, a) {
    return l = l !== null ? l.childLanes & ~a : 0, t && (l |= st), l;
  }
  function Zo(l, t, a) {
    var e = t.pendingProps, u = !1, n = (t.flags & 128) !== 0, i;
    if ((i = n) || (i = l !== null && l.memoizedState === null ? !1 : (Tl.current & 2) !== 0), i && (u = !0, t.flags &= -129), i = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (ll) {
        if (u ? ia(t) : ca(), (l = yl) ? (l = $d(
          l,
          gt
        ), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: Pt !== null ? { id: Mt, overflow: Nt } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = xs(l), a.return = t, t.child = a, ql = t, yl = null)) : l = null, l === null) throw ta(t);
        return lf(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = e.children;
      return e = e.fallback, u ? (ca(), u = t.mode, c = hn(
        { mode: "hidden", children: c },
        u
      ), e = Oa(
        e,
        u,
        a,
        null
      ), c.return = t, e.return = t, c.sibling = e, t.child = c, e = t.child, e.memoizedState = gc(a), e.childLanes = bc(
        l,
        i,
        a
      ), t.memoizedState = yc, au(null, e)) : (ia(t), Sc(t, c));
    }
    var f = l.memoizedState;
    if (f !== null && (c = f.dehydrated, c !== null)) {
      if (n)
        t.flags & 256 ? (ia(t), t.flags &= -257, t = xc(
          l,
          t,
          a
        )) : t.memoizedState !== null ? (ca(), t.child = l.child, t.flags |= 128, t = null) : (ca(), c = e.fallback, u = t.mode, e = hn(
          { mode: "visible", children: e.children },
          u
        ), c = Oa(
          c,
          u,
          a,
          null
        ), c.flags |= 2, e.return = t, c.return = t, e.sibling = c, t.child = e, Ba(
          t,
          l.child,
          null,
          a
        ), e = t.child, e.memoizedState = gc(a), e.childLanes = bc(
          l,
          i,
          a
        ), t.memoizedState = yc, t = au(null, e));
      else if (ia(t), lf(c)) {
        if (i = c.nextSibling && c.nextSibling.dataset, i) var y = i.dgst;
        i = y, e = Error(m(419)), e.stack = "", e.digest = i, Ve({ value: e, source: null, stack: null }), t = xc(
          l,
          t,
          a
        );
      } else if (Nl || ne(l, t, a, !1), i = (a & l.childLanes) !== 0, Nl || i) {
        if (i = vl, i !== null && (e = Mf(i, a), e !== 0 && e !== f.retryLane))
          throw f.retryLane = e, Na(l, e), Pl(i, l, e), vc;
        Pc(c) || En(), t = xc(
          l,
          t,
          a
        );
      } else
        Pc(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = f.treeContext, yl = St(
          c.nextSibling
        ), ql = t, ll = !0, la = null, gt = !1, l !== null && Ts(t, l), t = Sc(
          t,
          e.children
        ), t.flags |= 4096);
      return t;
    }
    return u ? (ca(), c = e.fallback, u = t.mode, f = l.child, y = f.sibling, e = Rt(f, {
      mode: "hidden",
      children: e.children
    }), e.subtreeFlags = f.subtreeFlags & 65011712, y !== null ? c = Rt(
      y,
      c
    ) : (c = Oa(
      c,
      u,
      a,
      null
    ), c.flags |= 2), c.return = t, e.return = t, e.sibling = c, t.child = e, au(null, e), e = t.child, c = l.child.memoizedState, c === null ? c = gc(a) : (u = c.cachePool, u !== null ? (f = Al._currentValue, u = u.parent !== f ? { parent: f, pool: f } : u) : u = Os(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: u
    }), e.memoizedState = c, e.childLanes = bc(
      l,
      i,
      a
    ), t.memoizedState = yc, au(l.child, e)) : (ia(t), a = l.child, l = a.sibling, a = Rt(a, {
      mode: "visible",
      children: e.children
    }), a.return = t, a.sibling = null, l !== null && (i = t.deletions, i === null ? (t.deletions = [l], t.flags |= 16) : i.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function Sc(l, t) {
    return t = hn(
      { mode: "visible", children: t },
      l.mode
    ), t.return = l, l.child = t;
  }
  function hn(l, t) {
    return l = nt(22, l, null, t), l.lanes = 0, l;
  }
  function xc(l, t, a) {
    return Ba(t, l.child, null, a), l = Sc(
      t,
      t.pendingProps.children
    ), l.flags |= 2, t.memoizedState = null, l;
  }
  function Lo(l, t, a) {
    l.lanes |= t;
    var e = l.alternate;
    e !== null && (e.lanes |= t), Ri(l.return, t, a);
  }
  function pc(l, t, a, e, u, n) {
    var i = l.memoizedState;
    i === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: e,
      tail: a,
      tailMode: u,
      treeForkCount: n
    } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = e, i.tail = a, i.tailMode = u, i.treeForkCount = n);
  }
  function Vo(l, t, a) {
    var e = t.pendingProps, u = e.revealOrder, n = e.tail;
    e = e.children;
    var i = Tl.current, c = (i & 2) !== 0;
    if (c ? (i = i & 1 | 2, t.flags |= 128) : i &= 1, O(Tl, i), Gl(l, t, e, a), e = ll ? Le : 0, !c && l !== null && (l.flags & 128) !== 0)
      l: for (l = t.child; l !== null; ) {
        if (l.tag === 13)
          l.memoizedState !== null && Lo(l, a, t);
        else if (l.tag === 19)
          Lo(l, a, t);
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
    switch (u) {
      case "forwards":
        for (a = t.child, u = null; a !== null; )
          l = a.alternate, l !== null && an(l) === null && (u = a), a = a.sibling;
        a = u, a === null ? (u = t.child, t.child = null) : (u = a.sibling, a.sibling = null), pc(
          t,
          !1,
          u,
          a,
          n,
          e
        );
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, u = t.child, t.child = null; u !== null; ) {
          if (l = u.alternate, l !== null && an(l) === null) {
            t.child = u;
            break;
          }
          l = u.sibling, u.sibling = a, a = u, u = l;
        }
        pc(
          t,
          !0,
          a,
          null,
          n,
          e
        );
        break;
      case "together":
        pc(
          t,
          !1,
          null,
          null,
          void 0,
          e
        );
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Xt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), oa |= t.lanes, (a & t.childLanes) === 0)
      if (l !== null) {
        if (ne(
          l,
          t,
          a,
          !1
        ), (a & t.childLanes) === 0)
          return null;
      } else return null;
    if (l !== null && t.child !== l.child)
      throw Error(m(153));
    if (t.child !== null) {
      for (l = t.child, a = Rt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; )
        l = l.sibling, a = a.sibling = Rt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function zc(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && ku(l)));
  }
  function f0(l, t, a) {
    switch (t.tag) {
      case 3:
        Ll(t, t.stateNode.containerInfo), aa(t, Al, l.memoizedState.cache), Da();
        break;
      case 27:
      case 5:
        Ne(t);
        break;
      case 4:
        Ll(t, t.stateNode.containerInfo);
        break;
      case 10:
        aa(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, wi(t), null;
        break;
      case 13:
        var e = t.memoizedState;
        if (e !== null)
          return e.dehydrated !== null ? (ia(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? Zo(l, t, a) : (ia(t), l = Xt(
            l,
            t,
            a
          ), l !== null ? l.sibling : null);
        ia(t);
        break;
      case 19:
        var u = (l.flags & 128) !== 0;
        if (e = (a & t.childLanes) !== 0, e || (ne(
          l,
          t,
          a,
          !1
        ), e = (a & t.childLanes) !== 0), u) {
          if (e)
            return Vo(
              l,
              t,
              a
            );
          t.flags |= 128;
        }
        if (u = t.memoizedState, u !== null && (u.rendering = null, u.tail = null, u.lastEffect = null), O(Tl, Tl.current), e) break;
        return null;
      case 22:
        return t.lanes = 0, Bo(
          l,
          t,
          a,
          t.pendingProps
        );
      case 24:
        aa(t, Al, l.memoizedState.cache);
    }
    return Xt(l, t, a);
  }
  function Ko(l, t, a) {
    if (l !== null)
      if (l.memoizedProps !== t.pendingProps)
        Nl = !0;
      else {
        if (!zc(l, a) && (t.flags & 128) === 0)
          return Nl = !1, f0(
            l,
            t,
            a
          );
        Nl = (l.flags & 131072) !== 0;
      }
    else
      Nl = !1, ll && (t.flags & 1048576) !== 0 && zs(t, Le, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var e = t.pendingProps;
          if (l = Ha(t.elementType), t.type = l, typeof l == "function")
            Mi(l) ? (e = Ya(l, e), t.tag = 1, t = Qo(
              null,
              t,
              l,
              e,
              a
            )) : (t.tag = 0, t = hc(
              null,
              t,
              l,
              e,
              a
            ));
          else {
            if (l != null) {
              var u = l.$$typeof;
              if (u === Rl) {
                t.tag = 11, t = Co(
                  null,
                  t,
                  l,
                  e,
                  a
                );
                break l;
              } else if (u === k) {
                t.tag = 14, t = Ho(
                  null,
                  t,
                  l,
                  e,
                  a
                );
                break l;
              }
            }
            throw t = jt(l) || l, Error(m(306, t, ""));
          }
        }
        return t;
      case 0:
        return hc(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 1:
        return e = t.type, u = Ya(
          e,
          t.pendingProps
        ), Qo(
          l,
          t,
          e,
          u,
          a
        );
      case 3:
        l: {
          if (Ll(
            t,
            t.stateNode.containerInfo
          ), l === null) throw Error(m(387));
          e = t.pendingProps;
          var n = t.memoizedState;
          u = n.element, Zi(l, t), Fe(t, e, null, a);
          var i = t.memoizedState;
          if (e = i.cache, aa(t, Al, e), e !== n.cache && Bi(
            t,
            [Al],
            a,
            !0
          ), $e(), e = i.element, n.isDehydrated)
            if (n = {
              element: e,
              isDehydrated: !1,
              cache: i.cache
            }, t.updateQueue.baseState = n, t.memoizedState = n, t.flags & 256) {
              t = Xo(
                l,
                t,
                e,
                a
              );
              break l;
            } else if (e !== u) {
              u = vt(
                Error(m(424)),
                t
              ), Ve(u), t = Xo(
                l,
                t,
                e,
                a
              );
              break l;
            } else
              for (l = t.stateNode.containerInfo, l.nodeType === 9 ? l = l.body : l = l.nodeName === "HTML" ? l.ownerDocument.body : l, yl = St(l.firstChild), ql = t, ll = !0, la = null, gt = !0, a = Rs(
                t,
                null,
                e,
                a
              ), t.child = a; a; )
                a.flags = a.flags & -3 | 4096, a = a.sibling;
          else {
            if (Da(), e === u) {
              t = Xt(
                l,
                t,
                a
              );
              break l;
            }
            Gl(l, t, e, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return vn(l, t), l === null ? (a = ar(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = a : ll || (a = t.type, l = t.pendingProps, e = jn(
          W.current
        ).createElement(a), e[Bl] = t, e[wl] = l, Ql(e, a, l), Cl(e), t.stateNode = e) : t.memoizedState = ar(
          t.type,
          l.memoizedProps,
          t.pendingProps,
          l.memoizedState
        ), null;
      case 27:
        return Ne(t), l === null && ll && (e = t.stateNode = Pd(
          t.type,
          t.pendingProps,
          W.current
        ), ql = t, gt = !0, u = yl, ha(t.type) ? (tf = u, yl = St(e.firstChild)) : yl = u), Gl(
          l,
          t,
          t.pendingProps.children,
          a
        ), vn(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && ll && ((u = e = yl) && (e = Y0(
          e,
          t.type,
          t.pendingProps,
          gt
        ), e !== null ? (t.stateNode = e, ql = t, yl = St(e.firstChild), gt = !1, u = !0) : u = !1), u || ta(t)), Ne(t), u = t.type, n = t.pendingProps, i = l !== null ? l.memoizedProps : null, e = n.children, $c(u, n) ? e = null : i !== null && $c(u, i) && (t.flags |= 32), t.memoizedState !== null && (u = Wi(
          l,
          t,
          Pm,
          null,
          null,
          a
        ), gu._currentValue = u), vn(l, t), Gl(l, t, e, a), t.child;
      case 6:
        return l === null && ll && ((l = a = yl) && (a = G0(
          a,
          t.pendingProps,
          gt
        ), a !== null ? (t.stateNode = a, ql = t, yl = null, l = !0) : l = !1), l || ta(t)), null;
      case 13:
        return Zo(l, t, a);
      case 4:
        return Ll(
          t,
          t.stateNode.containerInfo
        ), e = t.pendingProps, l === null ? t.child = Ba(
          t,
          null,
          e,
          a
        ) : Gl(l, t, e, a), t.child;
      case 11:
        return Co(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 7:
        return Gl(
          l,
          t,
          t.pendingProps,
          a
        ), t.child;
      case 8:
        return Gl(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 12:
        return Gl(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 10:
        return e = t.pendingProps, aa(t, t.type, e.value), Gl(l, t, e.children, a), t.child;
      case 9:
        return u = t.type._context, e = t.pendingProps.children, Ua(t), u = Yl(u), e = e(u), t.flags |= 1, Gl(l, t, e, a), t.child;
      case 14:
        return Ho(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 15:
        return Ro(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 19:
        return Vo(l, t, a);
      case 31:
        return c0(l, t, a);
      case 22:
        return Bo(
          l,
          t,
          a,
          t.pendingProps
        );
      case 24:
        return Ua(t), e = Yl(Al), l === null ? (u = Gi(), u === null && (u = vl, n = qi(), u.pooledCache = n, n.refCount++, n !== null && (u.pooledCacheLanes |= a), u = n), t.memoizedState = { parent: e, cache: u }, Xi(t), aa(t, Al, u)) : ((l.lanes & a) !== 0 && (Zi(l, t), Fe(t, null, null, a), $e()), u = l.memoizedState, n = t.memoizedState, u.parent !== e ? (u = { parent: e, cache: e }, t.memoizedState = u, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = u), aa(t, Al, e)) : (e = n.cache, aa(t, Al, e), e !== u.cache && Bi(
          t,
          [Al],
          a,
          !0
        ))), Gl(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(m(156, t.tag));
  }
  function Zt(l) {
    l.flags |= 4;
  }
  function Tc(l, t, a, e, u) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (u & 335544128) === u)
        if (l.stateNode.complete) l.flags |= 8192;
        else if (bd()) l.flags |= 8192;
        else
          throw Ra = Iu, Qi;
    } else l.flags &= -16777217;
  }
  function Jo(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      l.flags &= -16777217;
    else if (l.flags |= 16777216, !cr(t))
      if (bd()) l.flags |= 8192;
      else
        throw Ra = Iu, Qi;
  }
  function yn(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? Ef() : 536870912, l.lanes |= t, ge |= t);
  }
  function eu(l, t) {
    if (!ll)
      switch (l.tailMode) {
        case "hidden":
          t = l.tail;
          for (var a = null; t !== null; )
            t.alternate !== null && (a = t), t = t.sibling;
          a === null ? l.tail = null : a.sibling = null;
          break;
        case "collapsed":
          a = l.tail;
          for (var e = null; a !== null; )
            a.alternate !== null && (e = a), a = a.sibling;
          e === null ? t || l.tail === null ? l.tail = null : l.tail.sibling = null : e.sibling = null;
      }
  }
  function gl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, e = 0;
    if (t)
      for (var u = l.child; u !== null; )
        a |= u.lanes | u.childLanes, e |= u.subtreeFlags & 65011712, e |= u.flags & 65011712, u.return = l, u = u.sibling;
    else
      for (u = l.child; u !== null; )
        a |= u.lanes | u.childLanes, e |= u.subtreeFlags, e |= u.flags, u.return = l, u = u.sibling;
    return l.subtreeFlags |= e, l.childLanes = a, t;
  }
  function s0(l, t, a) {
    var e = t.pendingProps;
    switch (ji(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return gl(t), null;
      case 1:
        return gl(t), null;
      case 3:
        return a = t.stateNode, e = null, l !== null && (e = l.memoizedState.cache), t.memoizedState.cache !== e && (t.flags |= 2048), Yt(Al), zl(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (ue(t) ? Zt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Ci())), gl(t), null;
      case 26:
        var u = t.type, n = t.memoizedState;
        return l === null ? (Zt(t), n !== null ? (gl(t), Jo(t, n)) : (gl(t), Tc(
          t,
          u,
          null,
          e,
          a
        ))) : n ? n !== l.memoizedState ? (Zt(t), gl(t), Jo(t, n)) : (gl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== e && Zt(t), gl(t), Tc(
          t,
          u,
          l,
          e,
          a
        )), null;
      case 27:
        if (Au(t), a = W.current, u = t.type, l !== null && t.stateNode != null)
          l.memoizedProps !== e && Zt(t);
        else {
          if (!e) {
            if (t.stateNode === null)
              throw Error(m(166));
            return gl(t), null;
          }
          l = j.current, ue(t) ? Es(t) : (l = Pd(u, e, a), t.stateNode = l, Zt(t));
        }
        return gl(t), null;
      case 5:
        if (Au(t), u = t.type, l !== null && t.stateNode != null)
          l.memoizedProps !== e && Zt(t);
        else {
          if (!e) {
            if (t.stateNode === null)
              throw Error(m(166));
            return gl(t), null;
          }
          if (n = j.current, ue(t))
            Es(t);
          else {
            var i = jn(
              W.current
            );
            switch (n) {
              case 1:
                n = i.createElementNS(
                  "http://www.w3.org/2000/svg",
                  u
                );
                break;
              case 2:
                n = i.createElementNS(
                  "http://www.w3.org/1998/Math/MathML",
                  u
                );
                break;
              default:
                switch (u) {
                  case "svg":
                    n = i.createElementNS(
                      "http://www.w3.org/2000/svg",
                      u
                    );
                    break;
                  case "math":
                    n = i.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      u
                    );
                    break;
                  case "script":
                    n = i.createElement("div"), n.innerHTML = "<script><\/script>", n = n.removeChild(
                      n.firstChild
                    );
                    break;
                  case "select":
                    n = typeof e.is == "string" ? i.createElement("select", {
                      is: e.is
                    }) : i.createElement("select"), e.multiple ? n.multiple = !0 : e.size && (n.size = e.size);
                    break;
                  default:
                    n = typeof e.is == "string" ? i.createElement(u, { is: e.is }) : i.createElement(u);
                }
            }
            n[Bl] = t, n[wl] = e;
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
            l: switch (Ql(n, u, e), u) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                e = !!e.autoFocus;
                break l;
              case "img":
                e = !0;
                break l;
              default:
                e = !1;
            }
            e && Zt(t);
          }
        }
        return gl(t), Tc(
          t,
          t.type,
          l === null ? null : l.memoizedProps,
          t.pendingProps,
          a
        ), null;
      case 6:
        if (l && t.stateNode != null)
          l.memoizedProps !== e && Zt(t);
        else {
          if (typeof e != "string" && t.stateNode === null)
            throw Error(m(166));
          if (l = W.current, ue(t)) {
            if (l = t.stateNode, a = t.memoizedProps, e = null, u = ql, u !== null)
              switch (u.tag) {
                case 27:
                case 5:
                  e = u.memoizedProps;
              }
            l[Bl] = t, l = !!(l.nodeValue === a || e !== null && e.suppressHydrationWarning === !0 || Zd(l.nodeValue, a)), l || ta(t, !0);
          } else
            l = jn(l).createTextNode(
              e
            ), l[Bl] = t, t.stateNode = l;
        }
        return gl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (e = ue(t), a !== null) {
            if (l === null) {
              if (!e) throw Error(m(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(m(557));
              l[Bl] = t;
            } else
              Da(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            gl(t), l = !1;
          } else
            a = Ci(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (ct(t), t) : (ct(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(m(558));
        }
        return gl(t), null;
      case 13:
        if (e = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (u = ue(t), e !== null && e.dehydrated !== null) {
            if (l === null) {
              if (!u) throw Error(m(318));
              if (u = t.memoizedState, u = u !== null ? u.dehydrated : null, !u) throw Error(m(317));
              u[Bl] = t;
            } else
              Da(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            gl(t), u = !1;
          } else
            u = Ci(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = u), u = !0;
          if (!u)
            return t.flags & 256 ? (ct(t), t) : (ct(t), null);
        }
        return ct(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = e !== null, l = l !== null && l.memoizedState !== null, a && (e = t.child, u = null, e.alternate !== null && e.alternate.memoizedState !== null && e.alternate.memoizedState.cachePool !== null && (u = e.alternate.memoizedState.cachePool.pool), n = null, e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), n !== u && (e.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), yn(t, t.updateQueue), gl(t), null);
      case 4:
        return zl(), l === null && Kc(t.stateNode.containerInfo), gl(t), null;
      case 10:
        return Yt(t.type), gl(t), null;
      case 19:
        if (E(Tl), e = t.memoizedState, e === null) return gl(t), null;
        if (u = (t.flags & 128) !== 0, n = e.rendering, n === null)
          if (u) eu(e, !1);
          else {
            if (pl !== 0 || l !== null && (l.flags & 128) !== 0)
              for (l = t.child; l !== null; ) {
                if (n = an(l), n !== null) {
                  for (t.flags |= 128, eu(e, !1), l = n.updateQueue, t.updateQueue = l, yn(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; )
                    Ss(a, l), a = a.sibling;
                  return O(
                    Tl,
                    Tl.current & 1 | 2
                  ), ll && Bt(t, e.treeForkCount), t.child;
                }
                l = l.sibling;
              }
            e.tail !== null && tt() > pn && (t.flags |= 128, u = !0, eu(e, !1), t.lanes = 4194304);
          }
        else {
          if (!u)
            if (l = an(n), l !== null) {
              if (t.flags |= 128, u = !0, l = l.updateQueue, t.updateQueue = l, yn(t, l), eu(e, !0), e.tail === null && e.tailMode === "hidden" && !n.alternate && !ll)
                return gl(t), null;
            } else
              2 * tt() - e.renderingStartTime > pn && a !== 536870912 && (t.flags |= 128, u = !0, eu(e, !1), t.lanes = 4194304);
          e.isBackwards ? (n.sibling = t.child, t.child = n) : (l = e.last, l !== null ? l.sibling = n : t.child = n, e.last = n);
        }
        return e.tail !== null ? (l = e.tail, e.rendering = l, e.tail = l.sibling, e.renderingStartTime = tt(), l.sibling = null, a = Tl.current, O(
          Tl,
          u ? a & 1 | 2 : a & 1
        ), ll && Bt(t, e.treeForkCount), l) : (gl(t), null);
      case 22:
      case 23:
        return ct(t), Ji(), e = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== e && (t.flags |= 8192) : e && (t.flags |= 8192), e ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (gl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : gl(t), a = t.updateQueue, a !== null && yn(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== a && (t.flags |= 2048), l !== null && E(Ca), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Yt(Al), gl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(m(156, t.tag));
  }
  function o0(l, t) {
    switch (ji(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Yt(Al), zl(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Au(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (ct(t), t.alternate === null)
            throw Error(m(340));
          Da();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 13:
        if (ct(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(m(340));
          Da();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return E(Tl), null;
      case 4:
        return zl(), null;
      case 10:
        return Yt(t.type), null;
      case 22:
      case 23:
        return ct(t), Ji(), l !== null && E(Ca), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Yt(Al), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function wo(l, t) {
    switch (ji(t), t.tag) {
      case 3:
        Yt(Al), zl();
        break;
      case 26:
      case 27:
      case 5:
        Au(t);
        break;
      case 4:
        zl();
        break;
      case 31:
        t.memoizedState !== null && ct(t);
        break;
      case 13:
        ct(t);
        break;
      case 19:
        E(Tl);
        break;
      case 10:
        Yt(t.type);
        break;
      case 22:
      case 23:
        ct(t), Ji(), l !== null && E(Ca);
        break;
      case 24:
        Yt(Al);
    }
  }
  function uu(l, t) {
    try {
      var a = t.updateQueue, e = a !== null ? a.lastEffect : null;
      if (e !== null) {
        var u = e.next;
        a = u;
        do {
          if ((a.tag & l) === l) {
            e = void 0;
            var n = a.create, i = a.inst;
            e = n(), i.destroy = e;
          }
          a = a.next;
        } while (a !== u);
      }
    } catch (c) {
      fl(t, t.return, c);
    }
  }
  function fa(l, t, a) {
    try {
      var e = t.updateQueue, u = e !== null ? e.lastEffect : null;
      if (u !== null) {
        var n = u.next;
        e = n;
        do {
          if ((e.tag & l) === l) {
            var i = e.inst, c = i.destroy;
            if (c !== void 0) {
              i.destroy = void 0, u = t;
              var f = a, y = c;
              try {
                y();
              } catch (x) {
                fl(
                  u,
                  f,
                  x
                );
              }
            }
          }
          e = e.next;
        } while (e !== n);
      }
    } catch (x) {
      fl(t, t.return, x);
    }
  }
  function ko(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        qs(t, a);
      } catch (e) {
        fl(l, l.return, e);
      }
    }
  }
  function Wo(l, t, a) {
    a.props = Ya(
      l.type,
      l.memoizedProps
    ), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (e) {
      fl(l, t, e);
    }
  }
  function nu(l, t) {
    try {
      var a = l.ref;
      if (a !== null) {
        switch (l.tag) {
          case 26:
          case 27:
          case 5:
            var e = l.stateNode;
            break;
          case 30:
            e = l.stateNode;
            break;
          default:
            e = l.stateNode;
        }
        typeof a == "function" ? l.refCleanup = a(e) : a.current = e;
      }
    } catch (u) {
      fl(l, t, u);
    }
  }
  function Ot(l, t) {
    var a = l.ref, e = l.refCleanup;
    if (a !== null)
      if (typeof e == "function")
        try {
          e();
        } catch (u) {
          fl(l, t, u);
        } finally {
          l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
        }
      else if (typeof a == "function")
        try {
          a(null);
        } catch (u) {
          fl(l, t, u);
        }
      else a.current = null;
  }
  function $o(l) {
    var t = l.type, a = l.memoizedProps, e = l.stateNode;
    try {
      l: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          a.autoFocus && e.focus();
          break l;
        case "img":
          a.src ? e.src = a.src : a.srcSet && (e.srcset = a.srcSet);
      }
    } catch (u) {
      fl(l, l.return, u);
    }
  }
  function Ec(l, t, a) {
    try {
      var e = l.stateNode;
      U0(e, l.type, a, t), e[wl] = t;
    } catch (u) {
      fl(l, l.return, u);
    }
  }
  function Fo(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && ha(l.type) || l.tag === 4;
  }
  function _c(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Fo(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && ha(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function Ac(l, t, a) {
    var e = l.tag;
    if (e === 5 || e === 6)
      l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = Ct));
    else if (e !== 4 && (e === 27 && ha(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null))
      for (Ac(l, t, a), l = l.sibling; l !== null; )
        Ac(l, t, a), l = l.sibling;
  }
  function gn(l, t, a) {
    var e = l.tag;
    if (e === 5 || e === 6)
      l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (e !== 4 && (e === 27 && ha(l.type) && (a = l.stateNode), l = l.child, l !== null))
      for (gn(l, t, a), l = l.sibling; l !== null; )
        gn(l, t, a), l = l.sibling;
  }
  function Io(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var e = l.type, u = t.attributes; u.length; )
        t.removeAttributeNode(u[0]);
      Ql(t, e, a), t[Bl] = l, t[wl] = a;
    } catch (n) {
      fl(l, l.return, n);
    }
  }
  var Lt = !1, Ol = !1, Mc = !1, Po = typeof WeakSet == "function" ? WeakSet : Set, Hl = null;
  function d0(l, t) {
    if (l = l.containerInfo, kc = Yn, l = os(l), xi(l)) {
      if ("selectionStart" in l)
        var a = {
          start: l.selectionStart,
          end: l.selectionEnd
        };
      else
        l: {
          a = (a = l.ownerDocument) && a.defaultView || window;
          var e = a.getSelection && a.getSelection();
          if (e && e.rangeCount !== 0) {
            a = e.anchorNode;
            var u = e.anchorOffset, n = e.focusNode;
            e = e.focusOffset;
            try {
              a.nodeType, n.nodeType;
            } catch {
              a = null;
              break l;
            }
            var i = 0, c = -1, f = -1, y = 0, x = 0, T = l, b = null;
            t: for (; ; ) {
              for (var S; T !== a || u !== 0 && T.nodeType !== 3 || (c = i + u), T !== n || e !== 0 && T.nodeType !== 3 || (f = i + e), T.nodeType === 3 && (i += T.nodeValue.length), (S = T.firstChild) !== null; )
                b = T, T = S;
              for (; ; ) {
                if (T === l) break t;
                if (b === a && ++y === u && (c = i), b === n && ++x === e && (f = i), (S = T.nextSibling) !== null) break;
                T = b, b = T.parentNode;
              }
              T = S;
            }
            a = c === -1 || f === -1 ? null : { start: c, end: f };
          } else a = null;
        }
      a = a || { start: 0, end: 0 };
    } else a = null;
    for (Wc = { focusedElem: l, selectionRange: a }, Yn = !1, Hl = t; Hl !== null; )
      if (t = Hl, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null)
        l.return = t, Hl = l;
      else
        for (; Hl !== null; ) {
          switch (t = Hl, n = t.alternate, l = t.flags, t.tag) {
            case 0:
              if ((l & 4) !== 0 && (l = t.updateQueue, l = l !== null ? l.events : null, l !== null))
                for (a = 0; a < l.length; a++)
                  u = l[a], u.ref.impl = u.nextImpl;
              break;
            case 11:
            case 15:
              break;
            case 1:
              if ((l & 1024) !== 0 && n !== null) {
                l = void 0, a = t, u = n.memoizedProps, n = n.memoizedState, e = a.stateNode;
                try {
                  var D = Ya(
                    a.type,
                    u
                  );
                  l = e.getSnapshotBeforeUpdate(
                    D,
                    n
                  ), e.__reactInternalSnapshotBeforeUpdate = l;
                } catch (G) {
                  fl(
                    a,
                    a.return,
                    G
                  );
                }
              }
              break;
            case 3:
              if ((l & 1024) !== 0) {
                if (l = t.stateNode.containerInfo, a = l.nodeType, a === 9)
                  Ic(l);
                else if (a === 1)
                  switch (l.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      Ic(l);
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
              if ((l & 1024) !== 0) throw Error(m(163));
          }
          if (l = t.sibling, l !== null) {
            l.return = t.return, Hl = l;
            break;
          }
          Hl = t.return;
        }
  }
  function ld(l, t, a) {
    var e = a.flags;
    switch (a.tag) {
      case 0:
      case 11:
      case 15:
        Kt(l, a), e & 4 && uu(5, a);
        break;
      case 1:
        if (Kt(l, a), e & 4)
          if (l = a.stateNode, t === null)
            try {
              l.componentDidMount();
            } catch (i) {
              fl(a, a.return, i);
            }
          else {
            var u = Ya(
              a.type,
              t.memoizedProps
            );
            t = t.memoizedState;
            try {
              l.componentDidUpdate(
                u,
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
        e & 64 && ko(a), e & 512 && nu(a, a.return);
        break;
      case 3:
        if (Kt(l, a), e & 64 && (l = a.updateQueue, l !== null)) {
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
            qs(l, t);
          } catch (i) {
            fl(a, a.return, i);
          }
        }
        break;
      case 27:
        t === null && e & 4 && Io(a);
      case 26:
      case 5:
        Kt(l, a), t === null && e & 4 && $o(a), e & 512 && nu(a, a.return);
        break;
      case 12:
        Kt(l, a);
        break;
      case 31:
        Kt(l, a), e & 4 && ed(l, a);
        break;
      case 13:
        Kt(l, a), e & 4 && ud(l, a), e & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = x0.bind(
          null,
          a
        ), Q0(l, a))));
        break;
      case 22:
        if (e = a.memoizedState !== null || Lt, !e) {
          t = t !== null && t.memoizedState !== null || Ol, u = Lt;
          var n = Ol;
          Lt = e, (Ol = t) && !n ? Jt(
            l,
            a,
            (a.subtreeFlags & 8772) !== 0
          ) : Kt(l, a), Lt = u, Ol = n;
        }
        break;
      case 30:
        break;
      default:
        Kt(l, a);
    }
  }
  function td(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, td(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && ei(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var bl = null, Wl = !1;
  function Vt(l, t, a) {
    for (a = a.child; a !== null; )
      ad(l, t, a), a = a.sibling;
  }
  function ad(l, t, a) {
    if (at && typeof at.onCommitFiberUnmount == "function")
      try {
        at.onCommitFiberUnmount(Oe, a);
      } catch {
      }
    switch (a.tag) {
      case 26:
        Ol || Ot(a, t), Vt(
          l,
          t,
          a
        ), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        Ol || Ot(a, t);
        var e = bl, u = Wl;
        ha(a.type) && (bl = a.stateNode, Wl = !1), Vt(
          l,
          t,
          a
        ), vu(a.stateNode), bl = e, Wl = u;
        break;
      case 5:
        Ol || Ot(a, t);
      case 6:
        if (e = bl, u = Wl, bl = null, Vt(
          l,
          t,
          a
        ), bl = e, Wl = u, bl !== null)
          if (Wl)
            try {
              (bl.nodeType === 9 ? bl.body : bl.nodeName === "HTML" ? bl.ownerDocument.body : bl).removeChild(a.stateNode);
            } catch (n) {
              fl(
                a,
                t,
                n
              );
            }
          else
            try {
              bl.removeChild(a.stateNode);
            } catch (n) {
              fl(
                a,
                t,
                n
              );
            }
        break;
      case 18:
        bl !== null && (Wl ? (l = bl, kd(
          l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l,
          a.stateNode
        ), _e(l)) : kd(bl, a.stateNode));
        break;
      case 4:
        e = bl, u = Wl, bl = a.stateNode.containerInfo, Wl = !0, Vt(
          l,
          t,
          a
        ), bl = e, Wl = u;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        fa(2, a, t), Ol || fa(4, a, t), Vt(
          l,
          t,
          a
        );
        break;
      case 1:
        Ol || (Ot(a, t), e = a.stateNode, typeof e.componentWillUnmount == "function" && Wo(
          a,
          t,
          e
        )), Vt(
          l,
          t,
          a
        );
        break;
      case 21:
        Vt(
          l,
          t,
          a
        );
        break;
      case 22:
        Ol = (e = Ol) || a.memoizedState !== null, Vt(
          l,
          t,
          a
        ), Ol = e;
        break;
      default:
        Vt(
          l,
          t,
          a
        );
    }
  }
  function ed(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        _e(l);
      } catch (a) {
        fl(t, t.return, a);
      }
    }
  }
  function ud(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null))))
      try {
        _e(l);
      } catch (a) {
        fl(t, t.return, a);
      }
  }
  function r0(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Po()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Po()), t;
      default:
        throw Error(m(435, l.tag));
    }
  }
  function bn(l, t) {
    var a = r0(l);
    t.forEach(function(e) {
      if (!a.has(e)) {
        a.add(e);
        var u = p0.bind(null, l, e);
        e.then(u, u);
      }
    });
  }
  function $l(l, t) {
    var a = t.deletions;
    if (a !== null)
      for (var e = 0; e < a.length; e++) {
        var u = a[e], n = l, i = t, c = i;
        l: for (; c !== null; ) {
          switch (c.tag) {
            case 27:
              if (ha(c.type)) {
                bl = c.stateNode, Wl = !1;
                break l;
              }
              break;
            case 5:
              bl = c.stateNode, Wl = !1;
              break l;
            case 3:
            case 4:
              bl = c.stateNode.containerInfo, Wl = !0;
              break l;
          }
          c = c.return;
        }
        if (bl === null) throw Error(m(160));
        ad(n, i, u), bl = null, Wl = !1, n = u.alternate, n !== null && (n.return = null), u.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        nd(t, l), t = t.sibling;
  }
  var Tt = null;
  function nd(l, t) {
    var a = l.alternate, e = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        $l(t, l), Fl(l), e & 4 && (fa(3, l, l.return), uu(3, l), fa(5, l, l.return));
        break;
      case 1:
        $l(t, l), Fl(l), e & 512 && (Ol || a === null || Ot(a, a.return)), e & 64 && Lt && (l = l.updateQueue, l !== null && (e = l.callbacks, e !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? e : a.concat(e))));
        break;
      case 26:
        var u = Tt;
        if ($l(t, l), Fl(l), e & 512 && (Ol || a === null || Ot(a, a.return)), e & 4) {
          var n = a !== null ? a.memoizedState : null;
          if (e = l.memoizedState, a === null)
            if (e === null)
              if (l.stateNode === null) {
                l: {
                  e = l.type, a = l.memoizedProps, u = u.ownerDocument || u;
                  t: switch (e) {
                    case "title":
                      n = u.getElementsByTagName("title")[0], (!n || n[Ue] || n[Bl] || n.namespaceURI === "http://www.w3.org/2000/svg" || n.hasAttribute("itemprop")) && (n = u.createElement(e), u.head.insertBefore(
                        n,
                        u.querySelector("head > title")
                      )), Ql(n, e, a), n[Bl] = l, Cl(n), e = n;
                      break l;
                    case "link":
                      var i = nr(
                        "link",
                        "href",
                        u
                      ).get(e + (a.href || ""));
                      if (i) {
                        for (var c = 0; c < i.length; c++)
                          if (n = i[c], n.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && n.getAttribute("rel") === (a.rel == null ? null : a.rel) && n.getAttribute("title") === (a.title == null ? null : a.title) && n.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                            i.splice(c, 1);
                            break t;
                          }
                      }
                      n = u.createElement(e), Ql(n, e, a), u.head.appendChild(n);
                      break;
                    case "meta":
                      if (i = nr(
                        "meta",
                        "content",
                        u
                      ).get(e + (a.content || ""))) {
                        for (c = 0; c < i.length; c++)
                          if (n = i[c], n.getAttribute("content") === (a.content == null ? null : "" + a.content) && n.getAttribute("name") === (a.name == null ? null : a.name) && n.getAttribute("property") === (a.property == null ? null : a.property) && n.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && n.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                            i.splice(c, 1);
                            break t;
                          }
                      }
                      n = u.createElement(e), Ql(n, e, a), u.head.appendChild(n);
                      break;
                    default:
                      throw Error(m(468, e));
                  }
                  n[Bl] = l, Cl(n), e = n;
                }
                l.stateNode = e;
              } else
                ir(
                  u,
                  l.type,
                  l.stateNode
                );
            else
              l.stateNode = ur(
                u,
                e,
                l.memoizedProps
              );
          else
            n !== e ? (n === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : n.count--, e === null ? ir(
              u,
              l.type,
              l.stateNode
            ) : ur(
              u,
              e,
              l.memoizedProps
            )) : e === null && l.stateNode !== null && Ec(
              l,
              l.memoizedProps,
              a.memoizedProps
            );
        }
        break;
      case 27:
        $l(t, l), Fl(l), e & 512 && (Ol || a === null || Ot(a, a.return)), a !== null && e & 4 && Ec(
          l,
          l.memoizedProps,
          a.memoizedProps
        );
        break;
      case 5:
        if ($l(t, l), Fl(l), e & 512 && (Ol || a === null || Ot(a, a.return)), l.flags & 32) {
          u = l.stateNode;
          try {
            ka(u, "");
          } catch (D) {
            fl(l, l.return, D);
          }
        }
        e & 4 && l.stateNode != null && (u = l.memoizedProps, Ec(
          l,
          u,
          a !== null ? a.memoizedProps : u
        )), e & 1024 && (Mc = !0);
        break;
      case 6:
        if ($l(t, l), Fl(l), e & 4) {
          if (l.stateNode === null)
            throw Error(m(162));
          e = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = e;
          } catch (D) {
            fl(l, l.return, D);
          }
        }
        break;
      case 3:
        if (Hn = null, u = Tt, Tt = Un(t.containerInfo), $l(t, l), Tt = u, Fl(l), e & 4 && a !== null && a.memoizedState.isDehydrated)
          try {
            _e(t.containerInfo);
          } catch (D) {
            fl(l, l.return, D);
          }
        Mc && (Mc = !1, id(l));
        break;
      case 4:
        e = Tt, Tt = Un(
          l.stateNode.containerInfo
        ), $l(t, l), Fl(l), Tt = e;
        break;
      case 12:
        $l(t, l), Fl(l);
        break;
      case 31:
        $l(t, l), Fl(l), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, bn(l, e)));
        break;
      case 13:
        $l(t, l), Fl(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (xn = tt()), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, bn(l, e)));
        break;
      case 22:
        u = l.memoizedState !== null;
        var f = a !== null && a.memoizedState !== null, y = Lt, x = Ol;
        if (Lt = y || u, Ol = x || f, $l(t, l), Ol = x, Lt = y, Fl(l), e & 8192)
          l: for (t = l.stateNode, t._visibility = u ? t._visibility & -2 : t._visibility | 1, u && (a === null || f || Lt || Ol || Ga(l)), a = null, t = l; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (a === null) {
                f = a = t;
                try {
                  if (n = f.stateNode, u)
                    i = n.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none";
                  else {
                    c = f.stateNode;
                    var T = f.memoizedProps.style, b = T != null && T.hasOwnProperty("display") ? T.display : null;
                    c.style.display = b == null || typeof b == "boolean" ? "" : ("" + b).trim();
                  }
                } catch (D) {
                  fl(f, f.return, D);
                }
              }
            } else if (t.tag === 6) {
              if (a === null) {
                f = t;
                try {
                  f.stateNode.nodeValue = u ? "" : f.memoizedProps;
                } catch (D) {
                  fl(f, f.return, D);
                }
              }
            } else if (t.tag === 18) {
              if (a === null) {
                f = t;
                try {
                  var S = f.stateNode;
                  u ? Wd(S, !0) : Wd(f.stateNode, !1);
                } catch (D) {
                  fl(f, f.return, D);
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
        e & 4 && (e = l.updateQueue, e !== null && (a = e.retryQueue, a !== null && (e.retryQueue = null, bn(l, a))));
        break;
      case 19:
        $l(t, l), Fl(l), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, bn(l, e)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        $l(t, l), Fl(l);
    }
  }
  function Fl(l) {
    var t = l.flags;
    if (t & 2) {
      try {
        for (var a, e = l.return; e !== null; ) {
          if (Fo(e)) {
            a = e;
            break;
          }
          e = e.return;
        }
        if (a == null) throw Error(m(160));
        switch (a.tag) {
          case 27:
            var u = a.stateNode, n = _c(l);
            gn(l, n, u);
            break;
          case 5:
            var i = a.stateNode;
            a.flags & 32 && (ka(i, ""), a.flags &= -33);
            var c = _c(l);
            gn(l, c, i);
            break;
          case 3:
          case 4:
            var f = a.stateNode.containerInfo, y = _c(l);
            Ac(
              l,
              y,
              f
            );
            break;
          default:
            throw Error(m(161));
        }
      } catch (x) {
        fl(l, l.return, x);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function id(l) {
    if (l.subtreeFlags & 1024)
      for (l = l.child; l !== null; ) {
        var t = l;
        id(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
      }
  }
  function Kt(l, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        ld(l, t.alternate, t), t = t.sibling;
  }
  function Ga(l) {
    for (l = l.child; l !== null; ) {
      var t = l;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          fa(4, t, t.return), Ga(t);
          break;
        case 1:
          Ot(t, t.return);
          var a = t.stateNode;
          typeof a.componentWillUnmount == "function" && Wo(
            t,
            t.return,
            a
          ), Ga(t);
          break;
        case 27:
          vu(t.stateNode);
        case 26:
        case 5:
          Ot(t, t.return), Ga(t);
          break;
        case 22:
          t.memoizedState === null && Ga(t);
          break;
        case 30:
          Ga(t);
          break;
        default:
          Ga(t);
      }
      l = l.sibling;
    }
  }
  function Jt(l, t, a) {
    for (a = a && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var e = t.alternate, u = l, n = t, i = n.flags;
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          Jt(
            u,
            n,
            a
          ), uu(4, n);
          break;
        case 1:
          if (Jt(
            u,
            n,
            a
          ), e = n, u = e.stateNode, typeof u.componentDidMount == "function")
            try {
              u.componentDidMount();
            } catch (y) {
              fl(e, e.return, y);
            }
          if (e = n, u = e.updateQueue, u !== null) {
            var c = e.stateNode;
            try {
              var f = u.shared.hiddenCallbacks;
              if (f !== null)
                for (u.shared.hiddenCallbacks = null, u = 0; u < f.length; u++)
                  Bs(f[u], c);
            } catch (y) {
              fl(e, e.return, y);
            }
          }
          a && i & 64 && ko(n), nu(n, n.return);
          break;
        case 27:
          Io(n);
        case 26:
        case 5:
          Jt(
            u,
            n,
            a
          ), a && e === null && i & 4 && $o(n), nu(n, n.return);
          break;
        case 12:
          Jt(
            u,
            n,
            a
          );
          break;
        case 31:
          Jt(
            u,
            n,
            a
          ), a && i & 4 && ed(u, n);
          break;
        case 13:
          Jt(
            u,
            n,
            a
          ), a && i & 4 && ud(u, n);
          break;
        case 22:
          n.memoizedState === null && Jt(
            u,
            n,
            a
          ), nu(n, n.return);
          break;
        case 30:
          break;
        default:
          Jt(
            u,
            n,
            a
          );
      }
      t = t.sibling;
    }
  }
  function Nc(l, t) {
    var a = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== a && (l != null && l.refCount++, a != null && Ke(a));
  }
  function Oc(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Ke(l));
  }
  function Et(l, t, a, e) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        cd(
          l,
          t,
          a,
          e
        ), t = t.sibling;
  }
  function cd(l, t, a, e) {
    var u = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Et(
          l,
          t,
          a,
          e
        ), u & 2048 && uu(9, t);
        break;
      case 1:
        Et(
          l,
          t,
          a,
          e
        );
        break;
      case 3:
        Et(
          l,
          t,
          a,
          e
        ), u & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Ke(l)));
        break;
      case 12:
        if (u & 2048) {
          Et(
            l,
            t,
            a,
            e
          ), l = t.stateNode;
          try {
            var n = t.memoizedProps, i = n.id, c = n.onPostCommit;
            typeof c == "function" && c(
              i,
              t.alternate === null ? "mount" : "update",
              l.passiveEffectDuration,
              -0
            );
          } catch (f) {
            fl(t, t.return, f);
          }
        } else
          Et(
            l,
            t,
            a,
            e
          );
        break;
      case 31:
        Et(
          l,
          t,
          a,
          e
        );
        break;
      case 13:
        Et(
          l,
          t,
          a,
          e
        );
        break;
      case 23:
        break;
      case 22:
        n = t.stateNode, i = t.alternate, t.memoizedState !== null ? n._visibility & 2 ? Et(
          l,
          t,
          a,
          e
        ) : iu(l, t) : n._visibility & 2 ? Et(
          l,
          t,
          a,
          e
        ) : (n._visibility |= 2, ve(
          l,
          t,
          a,
          e,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), u & 2048 && Nc(i, t);
        break;
      case 24:
        Et(
          l,
          t,
          a,
          e
        ), u & 2048 && Oc(t.alternate, t);
        break;
      default:
        Et(
          l,
          t,
          a,
          e
        );
    }
  }
  function ve(l, t, a, e, u) {
    for (u = u && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var n = l, i = t, c = a, f = e, y = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          ve(
            n,
            i,
            c,
            f,
            u
          ), uu(8, i);
          break;
        case 23:
          break;
        case 22:
          var x = i.stateNode;
          i.memoizedState !== null ? x._visibility & 2 ? ve(
            n,
            i,
            c,
            f,
            u
          ) : iu(
            n,
            i
          ) : (x._visibility |= 2, ve(
            n,
            i,
            c,
            f,
            u
          )), u && y & 2048 && Nc(
            i.alternate,
            i
          );
          break;
        case 24:
          ve(
            n,
            i,
            c,
            f,
            u
          ), u && y & 2048 && Oc(i.alternate, i);
          break;
        default:
          ve(
            n,
            i,
            c,
            f,
            u
          );
      }
      t = t.sibling;
    }
  }
  function iu(l, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var a = l, e = t, u = e.flags;
        switch (e.tag) {
          case 22:
            iu(a, e), u & 2048 && Nc(
              e.alternate,
              e
            );
            break;
          case 24:
            iu(a, e), u & 2048 && Oc(e.alternate, e);
            break;
          default:
            iu(a, e);
        }
        t = t.sibling;
      }
  }
  var cu = 8192;
  function he(l, t, a) {
    if (l.subtreeFlags & cu)
      for (l = l.child; l !== null; )
        fd(
          l,
          t,
          a
        ), l = l.sibling;
  }
  function fd(l, t, a) {
    switch (l.tag) {
      case 26:
        he(
          l,
          t,
          a
        ), l.flags & cu && l.memoizedState !== null && I0(
          a,
          Tt,
          l.memoizedState,
          l.memoizedProps
        );
        break;
      case 5:
        he(
          l,
          t,
          a
        );
        break;
      case 3:
      case 4:
        var e = Tt;
        Tt = Un(l.stateNode.containerInfo), he(
          l,
          t,
          a
        ), Tt = e;
        break;
      case 22:
        l.memoizedState === null && (e = l.alternate, e !== null && e.memoizedState !== null ? (e = cu, cu = 16777216, he(
          l,
          t,
          a
        ), cu = e) : he(
          l,
          t,
          a
        ));
        break;
      default:
        he(
          l,
          t,
          a
        );
    }
  }
  function sd(l) {
    var t = l.alternate;
    if (t !== null && (l = t.child, l !== null)) {
      t.child = null;
      do
        t = l.sibling, l.sibling = null, l = t;
      while (l !== null);
    }
  }
  function fu(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var a = 0; a < t.length; a++) {
          var e = t[a];
          Hl = e, dd(
            e,
            l
          );
        }
      sd(l);
    }
    if (l.subtreeFlags & 10256)
      for (l = l.child; l !== null; )
        od(l), l = l.sibling;
  }
  function od(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        fu(l), l.flags & 2048 && fa(9, l, l.return);
        break;
      case 3:
        fu(l);
        break;
      case 12:
        fu(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, Sn(l)) : fu(l);
        break;
      default:
        fu(l);
    }
  }
  function Sn(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var a = 0; a < t.length; a++) {
          var e = t[a];
          Hl = e, dd(
            e,
            l
          );
        }
      sd(l);
    }
    for (l = l.child; l !== null; ) {
      switch (t = l, t.tag) {
        case 0:
        case 11:
        case 15:
          fa(8, t, t.return), Sn(t);
          break;
        case 22:
          a = t.stateNode, a._visibility & 2 && (a._visibility &= -3, Sn(t));
          break;
        default:
          Sn(t);
      }
      l = l.sibling;
    }
  }
  function dd(l, t) {
    for (; Hl !== null; ) {
      var a = Hl;
      switch (a.tag) {
        case 0:
        case 11:
        case 15:
          fa(8, a, t);
          break;
        case 23:
        case 22:
          if (a.memoizedState !== null && a.memoizedState.cachePool !== null) {
            var e = a.memoizedState.cachePool.pool;
            e != null && e.refCount++;
          }
          break;
        case 24:
          Ke(a.memoizedState.cache);
      }
      if (e = a.child, e !== null) e.return = a, Hl = e;
      else
        l: for (a = l; Hl !== null; ) {
          e = Hl;
          var u = e.sibling, n = e.return;
          if (td(e), e === a) {
            Hl = null;
            break l;
          }
          if (u !== null) {
            u.return = n, Hl = u;
            break l;
          }
          Hl = n;
        }
    }
  }
  var m0 = {
    getCacheForType: function(l) {
      var t = Yl(Al), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Yl(Al).controller.signal;
    }
  }, v0 = typeof WeakMap == "function" ? WeakMap : Map, ul = 0, vl = null, $ = null, I = 0, cl = 0, ft = null, sa = !1, ye = !1, Dc = !1, wt = 0, pl = 0, oa = 0, Qa = 0, jc = 0, st = 0, ge = 0, su = null, Il = null, Uc = !1, xn = 0, rd = 0, pn = 1 / 0, zn = null, da = null, Ul = 0, ra = null, be = null, kt = 0, Cc = 0, Hc = null, md = null, ou = 0, Rc = null;
  function ot() {
    return (ul & 2) !== 0 && I !== 0 ? I & -I : p.T !== null ? Xc() : Nf();
  }
  function vd() {
    if (st === 0)
      if ((I & 536870912) === 0 || ll) {
        var l = Ou;
        Ou <<= 1, (Ou & 3932160) === 0 && (Ou = 262144), st = l;
      } else st = 536870912;
    return l = it.current, l !== null && (l.flags |= 32), st;
  }
  function Pl(l, t, a) {
    (l === vl && (cl === 2 || cl === 9) || l.cancelPendingCommit !== null) && (Se(l, 0), ma(
      l,
      I,
      st,
      !1
    )), je(l, a), ((ul & 2) === 0 || l !== vl) && (l === vl && ((ul & 2) === 0 && (Qa |= a), pl === 4 && ma(
      l,
      I,
      st,
      !1
    )), Dt(l));
  }
  function hd(l, t, a) {
    if ((ul & 6) !== 0) throw Error(m(327));
    var e = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || De(l, t), u = e ? g0(l, t) : qc(l, t, !0), n = e;
    do {
      if (u === 0) {
        ye && !e && ma(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, n && !h0(a)) {
          u = qc(l, t, !1), n = !1;
          continue;
        }
        if (u === 2) {
          if (n = t, l.errorRecoveryDisabledLanes & n)
            var i = 0;
          else
            i = l.pendingLanes & -536870913, i = i !== 0 ? i : i & 536870912 ? 536870912 : 0;
          if (i !== 0) {
            t = i;
            l: {
              var c = l;
              u = su;
              var f = c.current.memoizedState.isDehydrated;
              if (f && (Se(c, i).flags |= 256), i = qc(
                c,
                i,
                !1
              ), i !== 2) {
                if (Dc && !f) {
                  c.errorRecoveryDisabledLanes |= n, Qa |= n, u = 4;
                  break l;
                }
                n = Il, Il = u, n !== null && (Il === null ? Il = n : Il.push.apply(
                  Il,
                  n
                ));
              }
              u = i;
            }
            if (n = !1, u !== 2) continue;
          }
        }
        if (u === 1) {
          Se(l, 0), ma(l, t, 0, !0);
          break;
        }
        l: {
          switch (e = l, n = u, n) {
            case 0:
            case 1:
              throw Error(m(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              ma(
                e,
                t,
                st,
                !sa
              );
              break l;
            case 2:
              Il = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(m(329));
          }
          if ((t & 62914560) === t && (u = xn + 300 - tt(), 10 < u)) {
            if (ma(
              e,
              t,
              st,
              !sa
            ), ju(e, 0, !0) !== 0) break l;
            kt = t, e.timeoutHandle = Jd(
              yd.bind(
                null,
                e,
                a,
                Il,
                zn,
                Uc,
                t,
                st,
                Qa,
                ge,
                sa,
                n,
                "Throttled",
                -0,
                0
              ),
              u
            );
            break l;
          }
          yd(
            e,
            a,
            Il,
            zn,
            Uc,
            t,
            st,
            Qa,
            ge,
            sa,
            n,
            null,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    Dt(l);
  }
  function yd(l, t, a, e, u, n, i, c, f, y, x, T, b, S) {
    if (l.timeoutHandle = -1, T = t.subtreeFlags, T & 8192 || (T & 16785408) === 16785408) {
      T = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: Ct
      }, fd(
        t,
        n,
        T
      );
      var D = (n & 62914560) === n ? xn - tt() : (n & 4194048) === n ? rd - tt() : 0;
      if (D = P0(
        T,
        D
      ), D !== null) {
        kt = n, l.cancelPendingCommit = D(
          Ed.bind(
            null,
            l,
            t,
            n,
            a,
            e,
            u,
            i,
            c,
            f,
            x,
            T,
            null,
            b,
            S
          )
        ), ma(l, n, i, !y);
        return;
      }
    }
    Ed(
      l,
      t,
      n,
      a,
      e,
      u,
      i,
      c,
      f
    );
  }
  function h0(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null)))
        for (var e = 0; e < a.length; e++) {
          var u = a[e], n = u.getSnapshot;
          u = u.value;
          try {
            if (!ut(n(), u)) return !1;
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
  function ma(l, t, a, e) {
    t &= ~jc, t &= ~Qa, l.suspendedLanes |= t, l.pingedLanes &= ~t, e && (l.warmLanes |= t), e = l.expirationTimes;
    for (var u = t; 0 < u; ) {
      var n = 31 - et(u), i = 1 << n;
      e[n] = -1, u &= ~i;
    }
    a !== 0 && _f(l, a, t);
  }
  function Tn() {
    return (ul & 6) === 0 ? (du(0), !1) : !0;
  }
  function Bc() {
    if ($ !== null) {
      if (cl === 0)
        var l = $.return;
      else
        l = $, qt = ja = null, Ii(l), se = null, we = 0, l = $;
      for (; l !== null; )
        wo(l.alternate, l), l = l.return;
      $ = null;
    }
  }
  function Se(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, R0(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), kt = 0, Bc(), vl = l, $ = a = Rt(l.current, null), I = t, cl = 0, ft = null, sa = !1, ye = De(l, t), Dc = !1, ge = st = jc = Qa = oa = pl = 0, Il = su = null, Uc = !1, (t & 8) !== 0 && (t |= t & 32);
    var e = l.entangledLanes;
    if (e !== 0)
      for (l = l.entanglements, e &= t; 0 < e; ) {
        var u = 31 - et(e), n = 1 << u;
        t |= l[u], e &= ~n;
      }
    return wt = t, Lu(), a;
  }
  function gd(l, t) {
    J = null, p.H = tu, t === fe || t === Fu ? (t = Us(), cl = 3) : t === Qi ? (t = Us(), cl = 4) : cl = t === vc ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, ft = t, $ === null && (pl = 1, rn(
      l,
      vt(t, l.current)
    ));
  }
  function bd() {
    var l = it.current;
    return l === null ? !0 : (I & 4194048) === I ? bt === null : (I & 62914560) === I || (I & 536870912) !== 0 ? l === bt : !1;
  }
  function Sd() {
    var l = p.H;
    return p.H = tu, l === null ? tu : l;
  }
  function xd() {
    var l = p.A;
    return p.A = m0, l;
  }
  function En() {
    pl = 4, sa || (I & 4194048) !== I && it.current !== null || (ye = !0), (oa & 134217727) === 0 && (Qa & 134217727) === 0 || vl === null || ma(
      vl,
      I,
      st,
      !1
    );
  }
  function qc(l, t, a) {
    var e = ul;
    ul |= 2;
    var u = Sd(), n = xd();
    (vl !== l || I !== t) && (zn = null, Se(l, t)), t = !1;
    var i = pl;
    l: do
      try {
        if (cl !== 0 && $ !== null) {
          var c = $, f = ft;
          switch (cl) {
            case 8:
              Bc(), i = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              it.current === null && (t = !0);
              var y = cl;
              if (cl = 0, ft = null, xe(l, c, f, y), a && ye) {
                i = 0;
                break l;
              }
              break;
            default:
              y = cl, cl = 0, ft = null, xe(l, c, f, y);
          }
        }
        y0(), i = pl;
        break;
      } catch (x) {
        gd(l, x);
      }
    while (!0);
    return t && l.shellSuspendCounter++, qt = ja = null, ul = e, p.H = u, p.A = n, $ === null && (vl = null, I = 0, Lu()), i;
  }
  function y0() {
    for (; $ !== null; ) pd($);
  }
  function g0(l, t) {
    var a = ul;
    ul |= 2;
    var e = Sd(), u = xd();
    vl !== l || I !== t ? (zn = null, pn = tt() + 500, Se(l, t)) : ye = De(
      l,
      t
    );
    l: do
      try {
        if (cl !== 0 && $ !== null) {
          t = $;
          var n = ft;
          t: switch (cl) {
            case 1:
              cl = 0, ft = null, xe(l, t, n, 1);
              break;
            case 2:
            case 9:
              if (Ds(n)) {
                cl = 0, ft = null, zd(t);
                break;
              }
              t = function() {
                cl !== 2 && cl !== 9 || vl !== l || (cl = 7), Dt(l);
              }, n.then(t, t);
              break l;
            case 3:
              cl = 7;
              break l;
            case 4:
              cl = 5;
              break l;
            case 7:
              Ds(n) ? (cl = 0, ft = null, zd(t)) : (cl = 0, ft = null, xe(l, t, n, 7));
              break;
            case 5:
              var i = null;
              switch ($.tag) {
                case 26:
                  i = $.memoizedState;
                case 5:
                case 27:
                  var c = $;
                  if (i ? cr(i) : c.stateNode.complete) {
                    cl = 0, ft = null;
                    var f = c.sibling;
                    if (f !== null) $ = f;
                    else {
                      var y = c.return;
                      y !== null ? ($ = y, _n(y)) : $ = null;
                    }
                    break t;
                  }
              }
              cl = 0, ft = null, xe(l, t, n, 5);
              break;
            case 6:
              cl = 0, ft = null, xe(l, t, n, 6);
              break;
            case 8:
              Bc(), pl = 6;
              break l;
            default:
              throw Error(m(462));
          }
        }
        b0();
        break;
      } catch (x) {
        gd(l, x);
      }
    while (!0);
    return qt = ja = null, p.H = e, p.A = u, ul = a, $ !== null ? 0 : (vl = null, I = 0, Lu(), pl);
  }
  function b0() {
    for (; $ !== null && !Xr(); )
      pd($);
  }
  function pd(l) {
    var t = Ko(l.alternate, l, wt);
    l.memoizedProps = l.pendingProps, t === null ? _n(l) : $ = t;
  }
  function zd(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Go(
          a,
          t,
          t.pendingProps,
          t.type,
          void 0,
          I
        );
        break;
      case 11:
        t = Go(
          a,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          I
        );
        break;
      case 5:
        Ii(t);
      default:
        wo(a, t), t = $ = Ss(t, wt), t = Ko(a, t, wt);
    }
    l.memoizedProps = l.pendingProps, t === null ? _n(l) : $ = t;
  }
  function xe(l, t, a, e) {
    qt = ja = null, Ii(t), se = null, we = 0;
    var u = t.return;
    try {
      if (i0(
        l,
        u,
        t,
        a,
        I
      )) {
        pl = 1, rn(
          l,
          vt(a, l.current)
        ), $ = null;
        return;
      }
    } catch (n) {
      if (u !== null) throw $ = u, n;
      pl = 1, rn(
        l,
        vt(a, l.current)
      ), $ = null;
      return;
    }
    t.flags & 32768 ? (ll || e === 1 ? l = !0 : ye || (I & 536870912) !== 0 ? l = !1 : (sa = l = !0, (e === 2 || e === 9 || e === 3 || e === 6) && (e = it.current, e !== null && e.tag === 13 && (e.flags |= 16384))), Td(t, l)) : _n(t);
  }
  function _n(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        Td(
          t,
          sa
        );
        return;
      }
      l = t.return;
      var a = s0(
        t.alternate,
        t,
        wt
      );
      if (a !== null) {
        $ = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        $ = t;
        return;
      }
      $ = t = l;
    } while (t !== null);
    pl === 0 && (pl = 5);
  }
  function Td(l, t) {
    do {
      var a = o0(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, $ = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        $ = l;
        return;
      }
      $ = l = a;
    } while (l !== null);
    pl = 6, $ = null;
  }
  function Ed(l, t, a, e, u, n, i, c, f) {
    l.cancelPendingCommit = null;
    do
      An();
    while (Ul !== 0);
    if ((ul & 6) !== 0) throw Error(m(327));
    if (t !== null) {
      if (t === l.current) throw Error(m(177));
      if (n = t.lanes | t.childLanes, n |= _i, Fr(
        l,
        a,
        n,
        i,
        c,
        f
      ), l === vl && ($ = vl = null, I = 0), be = t, ra = l, kt = a, Cc = n, Hc = u, md = e, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, z0(Mu, function() {
        return Od(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), e = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || e) {
        e = p.T, p.T = null, u = N.p, N.p = 2, i = ul, ul |= 4;
        try {
          d0(l, t, a);
        } finally {
          ul = i, N.p = u, p.T = e;
        }
      }
      Ul = 1, _d(), Ad(), Md();
    }
  }
  function _d() {
    if (Ul === 1) {
      Ul = 0;
      var l = ra, t = be, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = p.T, p.T = null;
        var e = N.p;
        N.p = 2;
        var u = ul;
        ul |= 4;
        try {
          nd(t, l);
          var n = Wc, i = os(l.containerInfo), c = n.focusedElem, f = n.selectionRange;
          if (i !== c && c && c.ownerDocument && ss(
            c.ownerDocument.documentElement,
            c
          )) {
            if (f !== null && xi(c)) {
              var y = f.start, x = f.end;
              if (x === void 0 && (x = y), "selectionStart" in c)
                c.selectionStart = y, c.selectionEnd = Math.min(
                  x,
                  c.value.length
                );
              else {
                var T = c.ownerDocument || document, b = T && T.defaultView || window;
                if (b.getSelection) {
                  var S = b.getSelection(), D = c.textContent.length, G = Math.min(f.start, D), rl = f.end === void 0 ? G : Math.min(f.end, D);
                  !S.extend && G > rl && (i = rl, rl = G, G = i);
                  var d = fs(
                    c,
                    G
                  ), s = fs(
                    c,
                    rl
                  );
                  if (d && s && (S.rangeCount !== 1 || S.anchorNode !== d.node || S.anchorOffset !== d.offset || S.focusNode !== s.node || S.focusOffset !== s.offset)) {
                    var h = T.createRange();
                    h.setStart(d.node, d.offset), S.removeAllRanges(), G > rl ? (S.addRange(h), S.extend(s.node, s.offset)) : (h.setEnd(s.node, s.offset), S.addRange(h));
                  }
                }
              }
            }
            for (T = [], S = c; S = S.parentNode; )
              S.nodeType === 1 && T.push({
                element: S,
                left: S.scrollLeft,
                top: S.scrollTop
              });
            for (typeof c.focus == "function" && c.focus(), c = 0; c < T.length; c++) {
              var z = T[c];
              z.element.scrollLeft = z.left, z.element.scrollTop = z.top;
            }
          }
          Yn = !!kc, Wc = kc = null;
        } finally {
          ul = u, N.p = e, p.T = a;
        }
      }
      l.current = t, Ul = 2;
    }
  }
  function Ad() {
    if (Ul === 2) {
      Ul = 0;
      var l = ra, t = be, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = p.T, p.T = null;
        var e = N.p;
        N.p = 2;
        var u = ul;
        ul |= 4;
        try {
          ld(l, t.alternate, t);
        } finally {
          ul = u, N.p = e, p.T = a;
        }
      }
      Ul = 3;
    }
  }
  function Md() {
    if (Ul === 4 || Ul === 3) {
      Ul = 0, Zr();
      var l = ra, t = be, a = kt, e = md;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Ul = 5 : (Ul = 0, be = ra = null, Nd(l, l.pendingLanes));
      var u = l.pendingLanes;
      if (u === 0 && (da = null), ti(a), t = t.stateNode, at && typeof at.onCommitFiberRoot == "function")
        try {
          at.onCommitFiberRoot(
            Oe,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (e !== null) {
        t = p.T, u = N.p, N.p = 2, p.T = null;
        try {
          for (var n = l.onRecoverableError, i = 0; i < e.length; i++) {
            var c = e[i];
            n(c.value, {
              componentStack: c.stack
            });
          }
        } finally {
          p.T = t, N.p = u;
        }
      }
      (kt & 3) !== 0 && An(), Dt(l), u = l.pendingLanes, (a & 261930) !== 0 && (u & 42) !== 0 ? l === Rc ? ou++ : (ou = 0, Rc = l) : ou = 0, du(0);
    }
  }
  function Nd(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Ke(t)));
  }
  function An() {
    return _d(), Ad(), Md(), Od();
  }
  function Od() {
    if (Ul !== 5) return !1;
    var l = ra, t = Cc;
    Cc = 0;
    var a = ti(kt), e = p.T, u = N.p;
    try {
      N.p = 32 > a ? 32 : a, p.T = null, a = Hc, Hc = null;
      var n = ra, i = kt;
      if (Ul = 0, be = ra = null, kt = 0, (ul & 6) !== 0) throw Error(m(331));
      var c = ul;
      if (ul |= 4, od(n.current), cd(
        n,
        n.current,
        i,
        a
      ), ul = c, du(0, !1), at && typeof at.onPostCommitFiberRoot == "function")
        try {
          at.onPostCommitFiberRoot(Oe, n);
        } catch {
        }
      return !0;
    } finally {
      N.p = u, p.T = e, Nd(l, t);
    }
  }
  function Dd(l, t, a) {
    t = vt(a, t), t = mc(l.stateNode, t, 2), l = na(l, t, 2), l !== null && (je(l, 2), Dt(l));
  }
  function fl(l, t, a) {
    if (l.tag === 3)
      Dd(l, l, a);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          Dd(
            t,
            l,
            a
          );
          break;
        } else if (t.tag === 1) {
          var e = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof e.componentDidCatch == "function" && (da === null || !da.has(e))) {
            l = vt(a, l), a = jo(2), e = na(t, a, 2), e !== null && (Uo(
              a,
              e,
              t,
              l
            ), je(e, 2), Dt(e));
            break;
          }
        }
        t = t.return;
      }
  }
  function Yc(l, t, a) {
    var e = l.pingCache;
    if (e === null) {
      e = l.pingCache = new v0();
      var u = /* @__PURE__ */ new Set();
      e.set(t, u);
    } else
      u = e.get(t), u === void 0 && (u = /* @__PURE__ */ new Set(), e.set(t, u));
    u.has(a) || (Dc = !0, u.add(a), l = S0.bind(null, l, t, a), t.then(l, l));
  }
  function S0(l, t, a) {
    var e = l.pingCache;
    e !== null && e.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, vl === l && (I & a) === a && (pl === 4 || pl === 3 && (I & 62914560) === I && 300 > tt() - xn ? (ul & 2) === 0 && Se(l, 0) : jc |= a, ge === I && (ge = 0)), Dt(l);
  }
  function jd(l, t) {
    t === 0 && (t = Ef()), l = Na(l, t), l !== null && (je(l, t), Dt(l));
  }
  function x0(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), jd(l, a);
  }
  function p0(l, t) {
    var a = 0;
    switch (l.tag) {
      case 31:
      case 13:
        var e = l.stateNode, u = l.memoizedState;
        u !== null && (a = u.retryLane);
        break;
      case 19:
        e = l.stateNode;
        break;
      case 22:
        e = l.stateNode._retryCache;
        break;
      default:
        throw Error(m(314));
    }
    e !== null && e.delete(t), jd(l, a);
  }
  function z0(l, t) {
    return Fn(l, t);
  }
  var Mn = null, pe = null, Gc = !1, Nn = !1, Qc = !1, va = 0;
  function Dt(l) {
    l !== pe && l.next === null && (pe === null ? Mn = pe = l : pe = pe.next = l), Nn = !0, Gc || (Gc = !0, E0());
  }
  function du(l, t) {
    if (!Qc && Nn) {
      Qc = !0;
      do
        for (var a = !1, e = Mn; e !== null; ) {
          if (l !== 0) {
            var u = e.pendingLanes;
            if (u === 0) var n = 0;
            else {
              var i = e.suspendedLanes, c = e.pingedLanes;
              n = (1 << 31 - et(42 | l) + 1) - 1, n &= u & ~(i & ~c), n = n & 201326741 ? n & 201326741 | 1 : n ? n | 2 : 0;
            }
            n !== 0 && (a = !0, Rd(e, n));
          } else
            n = I, n = ju(
              e,
              e === vl ? n : 0,
              e.cancelPendingCommit !== null || e.timeoutHandle !== -1
            ), (n & 3) === 0 || De(e, n) || (a = !0, Rd(e, n));
          e = e.next;
        }
      while (a);
      Qc = !1;
    }
  }
  function T0() {
    Ud();
  }
  function Ud() {
    Nn = Gc = !1;
    var l = 0;
    va !== 0 && H0() && (l = va);
    for (var t = tt(), a = null, e = Mn; e !== null; ) {
      var u = e.next, n = Cd(e, t);
      n === 0 ? (e.next = null, a === null ? Mn = u : a.next = u, u === null && (pe = a)) : (a = e, (l !== 0 || (n & 3) !== 0) && (Nn = !0)), e = u;
    }
    Ul !== 0 && Ul !== 5 || du(l), va !== 0 && (va = 0);
  }
  function Cd(l, t) {
    for (var a = l.suspendedLanes, e = l.pingedLanes, u = l.expirationTimes, n = l.pendingLanes & -62914561; 0 < n; ) {
      var i = 31 - et(n), c = 1 << i, f = u[i];
      f === -1 ? ((c & a) === 0 || (c & e) !== 0) && (u[i] = $r(c, t)) : f <= t && (l.expiredLanes |= c), n &= ~c;
    }
    if (t = vl, a = I, a = ju(
      l,
      l === t ? a : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), e = l.callbackNode, a === 0 || l === t && (cl === 2 || cl === 9) || l.cancelPendingCommit !== null)
      return e !== null && e !== null && In(e), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || De(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (e !== null && In(e), ti(a)) {
        case 2:
        case 8:
          a = zf;
          break;
        case 32:
          a = Mu;
          break;
        case 268435456:
          a = Tf;
          break;
        default:
          a = Mu;
      }
      return e = Hd.bind(null, l), a = Fn(a, e), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return e !== null && e !== null && In(e), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function Hd(l, t) {
    if (Ul !== 0 && Ul !== 5)
      return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (An() && l.callbackNode !== a)
      return null;
    var e = I;
    return e = ju(
      l,
      l === vl ? e : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), e === 0 ? null : (hd(l, e, t), Cd(l, tt()), l.callbackNode != null && l.callbackNode === a ? Hd.bind(null, l) : null);
  }
  function Rd(l, t) {
    if (An()) return null;
    hd(l, t, !0);
  }
  function E0() {
    B0(function() {
      (ul & 6) !== 0 ? Fn(
        pf,
        T0
      ) : Ud();
    });
  }
  function Xc() {
    if (va === 0) {
      var l = ie;
      l === 0 && (l = Nu, Nu <<= 1, (Nu & 261888) === 0 && (Nu = 256)), va = l;
    }
    return va;
  }
  function Bd(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Ru("" + l);
  }
  function qd(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function _0(l, t, a, e, u) {
    if (t === "submit" && a && a.stateNode === u) {
      var n = Bd(
        (u[wl] || null).action
      ), i = e.submitter;
      i && (t = (t = i[wl] || null) ? Bd(t.formAction) : i.getAttribute("formAction"), t !== null && (n = t, i = null));
      var c = new Gu(
        "action",
        "action",
        null,
        e,
        u
      );
      l.push({
        event: c,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (e.defaultPrevented) {
                if (va !== 0) {
                  var f = i ? qd(u, i) : new FormData(u);
                  cc(
                    a,
                    {
                      pending: !0,
                      data: f,
                      method: u.method,
                      action: n
                    },
                    null,
                    f
                  );
                }
              } else
                typeof n == "function" && (c.preventDefault(), f = i ? qd(u, i) : new FormData(u), cc(
                  a,
                  {
                    pending: !0,
                    data: f,
                    method: u.method,
                    action: n
                  },
                  n,
                  f
                ));
            },
            currentTarget: u
          }
        ]
      });
    }
  }
  for (var Zc = 0; Zc < Ei.length; Zc++) {
    var Lc = Ei[Zc], A0 = Lc.toLowerCase(), M0 = Lc[0].toUpperCase() + Lc.slice(1);
    zt(
      A0,
      "on" + M0
    );
  }
  zt(ms, "onAnimationEnd"), zt(vs, "onAnimationIteration"), zt(hs, "onAnimationStart"), zt("dblclick", "onDoubleClick"), zt("focusin", "onFocus"), zt("focusout", "onBlur"), zt(Lm, "onTransitionRun"), zt(Vm, "onTransitionStart"), zt(Km, "onTransitionCancel"), zt(ys, "onTransitionEnd"), Ja("onMouseEnter", ["mouseout", "mouseover"]), Ja("onMouseLeave", ["mouseout", "mouseover"]), Ja("onPointerEnter", ["pointerout", "pointerover"]), Ja("onPointerLeave", ["pointerout", "pointerover"]), Ea(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), Ea(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), Ea("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ea(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), Ea(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), Ea(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var ru = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), N0 = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(ru)
  );
  function Yd(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var e = l[a], u = e.event;
      e = e.listeners;
      l: {
        var n = void 0;
        if (t)
          for (var i = e.length - 1; 0 <= i; i--) {
            var c = e[i], f = c.instance, y = c.currentTarget;
            if (c = c.listener, f !== n && u.isPropagationStopped())
              break l;
            n = c, u.currentTarget = y;
            try {
              n(u);
            } catch (x) {
              Zu(x);
            }
            u.currentTarget = null, n = f;
          }
        else
          for (i = 0; i < e.length; i++) {
            if (c = e[i], f = c.instance, y = c.currentTarget, c = c.listener, f !== n && u.isPropagationStopped())
              break l;
            n = c, u.currentTarget = y;
            try {
              n(u);
            } catch (x) {
              Zu(x);
            }
            u.currentTarget = null, n = f;
          }
      }
    }
  }
  function F(l, t) {
    var a = t[ai];
    a === void 0 && (a = t[ai] = /* @__PURE__ */ new Set());
    var e = l + "__bubble";
    a.has(e) || (Gd(t, l, 2, !1), a.add(e));
  }
  function Vc(l, t, a) {
    var e = 0;
    t && (e |= 4), Gd(
      a,
      l,
      e,
      t
    );
  }
  var On = "_reactListening" + Math.random().toString(36).slice(2);
  function Kc(l) {
    if (!l[On]) {
      l[On] = !0, jf.forEach(function(a) {
        a !== "selectionchange" && (N0.has(a) || Vc(a, !1, l), Vc(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[On] || (t[On] = !0, Vc("selectionchange", !1, t));
    }
  }
  function Gd(l, t, a, e) {
    switch (vr(t)) {
      case 2:
        var u = av;
        break;
      case 8:
        u = ev;
        break;
      default:
        u = cf;
    }
    a = u.bind(
      null,
      t,
      a,
      l
    ), u = void 0, !di || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (u = !0), e ? u !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: u
    }) : l.addEventListener(t, a, !0) : u !== void 0 ? l.addEventListener(t, a, {
      passive: u
    }) : l.addEventListener(t, a, !1);
  }
  function Jc(l, t, a, e, u) {
    var n = e;
    if ((t & 1) === 0 && (t & 2) === 0 && e !== null)
      l: for (; ; ) {
        if (e === null) return;
        var i = e.tag;
        if (i === 3 || i === 4) {
          var c = e.stateNode.containerInfo;
          if (c === u) break;
          if (i === 4)
            for (i = e.return; i !== null; ) {
              var f = i.tag;
              if ((f === 3 || f === 4) && i.stateNode.containerInfo === u)
                return;
              i = i.return;
            }
          for (; c !== null; ) {
            if (i = La(c), i === null) return;
            if (f = i.tag, f === 5 || f === 6 || f === 26 || f === 27) {
              e = n = i;
              continue l;
            }
            c = c.parentNode;
          }
        }
        e = e.return;
      }
    Lf(function() {
      var y = n, x = si(a), T = [];
      l: {
        var b = gs.get(l);
        if (b !== void 0) {
          var S = Gu, D = l;
          switch (l) {
            case "keypress":
              if (qu(a) === 0) break l;
            case "keydown":
            case "keyup":
              S = pm;
              break;
            case "focusin":
              D = "focus", S = hi;
              break;
            case "focusout":
              D = "blur", S = hi;
              break;
            case "beforeblur":
            case "afterblur":
              S = hi;
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
              S = Jf;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              S = sm;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              S = Em;
              break;
            case ms:
            case vs:
            case hs:
              S = rm;
              break;
            case ys:
              S = Am;
              break;
            case "scroll":
            case "scrollend":
              S = cm;
              break;
            case "wheel":
              S = Nm;
              break;
            case "copy":
            case "cut":
            case "paste":
              S = vm;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              S = kf;
              break;
            case "toggle":
            case "beforetoggle":
              S = Dm;
          }
          var G = (t & 4) !== 0, rl = !G && (l === "scroll" || l === "scrollend"), d = G ? b !== null ? b + "Capture" : null : b;
          G = [];
          for (var s = y, h; s !== null; ) {
            var z = s;
            if (h = z.stateNode, z = z.tag, z !== 5 && z !== 26 && z !== 27 || h === null || d === null || (z = He(s, d), z != null && G.push(
              mu(s, z, h)
            )), rl) break;
            s = s.return;
          }
          0 < G.length && (b = new S(
            b,
            D,
            null,
            a,
            x
          ), T.push({ event: b, listeners: G }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (b = l === "mouseover" || l === "pointerover", S = l === "mouseout" || l === "pointerout", b && a !== fi && (D = a.relatedTarget || a.fromElement) && (La(D) || D[Za]))
            break l;
          if ((S || b) && (b = x.window === x ? x : (b = x.ownerDocument) ? b.defaultView || b.parentWindow : window, S ? (D = a.relatedTarget || a.toElement, S = y, D = D ? La(D) : null, D !== null && (rl = Z(D), G = D.tag, D !== rl || G !== 5 && G !== 27 && G !== 6) && (D = null)) : (S = null, D = y), S !== D)) {
            if (G = Jf, z = "onMouseLeave", d = "onMouseEnter", s = "mouse", (l === "pointerout" || l === "pointerover") && (G = kf, z = "onPointerLeave", d = "onPointerEnter", s = "pointer"), rl = S == null ? b : Ce(S), h = D == null ? b : Ce(D), b = new G(
              z,
              s + "leave",
              S,
              a,
              x
            ), b.target = rl, b.relatedTarget = h, z = null, La(x) === y && (G = new G(
              d,
              s + "enter",
              D,
              a,
              x
            ), G.target = h, G.relatedTarget = rl, z = G), rl = z, S && D)
              t: {
                for (G = O0, d = S, s = D, h = 0, z = d; z; z = G(z))
                  h++;
                z = 0;
                for (var q = s; q; q = G(q))
                  z++;
                for (; 0 < h - z; )
                  d = G(d), h--;
                for (; 0 < z - h; )
                  s = G(s), z--;
                for (; h--; ) {
                  if (d === s || s !== null && d === s.alternate) {
                    G = d;
                    break t;
                  }
                  d = G(d), s = G(s);
                }
                G = null;
              }
            else G = null;
            S !== null && Qd(
              T,
              b,
              S,
              G,
              !1
            ), D !== null && rl !== null && Qd(
              T,
              rl,
              D,
              G,
              !0
            );
          }
        }
        l: {
          if (b = y ? Ce(y) : window, S = b.nodeName && b.nodeName.toLowerCase(), S === "select" || S === "input" && b.type === "file")
            var tl = as;
          else if (ls(b))
            if (es)
              tl = Qm;
            else {
              tl = Ym;
              var U = qm;
            }
          else
            S = b.nodeName, !S || S.toLowerCase() !== "input" || b.type !== "checkbox" && b.type !== "radio" ? y && ci(y.elementType) && (tl = as) : tl = Gm;
          if (tl && (tl = tl(l, y))) {
            ts(
              T,
              tl,
              a,
              x
            );
            break l;
          }
          U && U(l, b, y), l === "focusout" && y && b.type === "number" && y.memoizedProps.value != null && ii(b, "number", b.value);
        }
        switch (U = y ? Ce(y) : window, l) {
          case "focusin":
            (ls(U) || U.contentEditable === "true") && (Ia = U, pi = y, Ze = null);
            break;
          case "focusout":
            Ze = pi = Ia = null;
            break;
          case "mousedown":
            zi = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            zi = !1, ds(T, a, x);
            break;
          case "selectionchange":
            if (Zm) break;
          case "keydown":
          case "keyup":
            ds(T, a, x);
        }
        var w;
        if (gi)
          l: {
            switch (l) {
              case "compositionstart":
                var P = "onCompositionStart";
                break l;
              case "compositionend":
                P = "onCompositionEnd";
                break l;
              case "compositionupdate":
                P = "onCompositionUpdate";
                break l;
            }
            P = void 0;
          }
        else
          Fa ? If(l, a) && (P = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (P = "onCompositionStart");
        P && (Wf && a.locale !== "ko" && (Fa || P !== "onCompositionStart" ? P === "onCompositionEnd" && Fa && (w = Vf()) : (It = x, ri = "value" in It ? It.value : It.textContent, Fa = !0)), U = Dn(y, P), 0 < U.length && (P = new wf(
          P,
          l,
          null,
          a,
          x
        ), T.push({ event: P, listeners: U }), w ? P.data = w : (w = Pf(a), w !== null && (P.data = w)))), (w = Um ? Cm(l, a) : Hm(l, a)) && (P = Dn(y, "onBeforeInput"), 0 < P.length && (U = new wf(
          "onBeforeInput",
          "beforeinput",
          null,
          a,
          x
        ), T.push({
          event: U,
          listeners: P
        }), U.data = w)), _0(
          T,
          l,
          y,
          a,
          x
        );
      }
      Yd(T, t);
    });
  }
  function mu(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function Dn(l, t) {
    for (var a = t + "Capture", e = []; l !== null; ) {
      var u = l, n = u.stateNode;
      if (u = u.tag, u !== 5 && u !== 26 && u !== 27 || n === null || (u = He(l, a), u != null && e.unshift(
        mu(l, u, n)
      ), u = He(l, t), u != null && e.push(
        mu(l, u, n)
      )), l.tag === 3) return e;
      l = l.return;
    }
    return [];
  }
  function O0(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function Qd(l, t, a, e, u) {
    for (var n = t._reactName, i = []; a !== null && a !== e; ) {
      var c = a, f = c.alternate, y = c.stateNode;
      if (c = c.tag, f !== null && f === e) break;
      c !== 5 && c !== 26 && c !== 27 || y === null || (f = y, u ? (y = He(a, n), y != null && i.unshift(
        mu(a, y, f)
      )) : u || (y = He(a, n), y != null && i.push(
        mu(a, y, f)
      ))), a = a.return;
    }
    i.length !== 0 && l.push({ event: t, listeners: i });
  }
  var D0 = /\r\n?/g, j0 = /\u0000|\uFFFD/g;
  function Xd(l) {
    return (typeof l == "string" ? l : "" + l).replace(D0, `
`).replace(j0, "");
  }
  function Zd(l, t) {
    return t = Xd(t), Xd(l) === t;
  }
  function dl(l, t, a, e, u, n) {
    switch (a) {
      case "children":
        typeof e == "string" ? t === "body" || t === "textarea" && e === "" || ka(l, e) : (typeof e == "number" || typeof e == "bigint") && t !== "body" && ka(l, "" + e);
        break;
      case "className":
        Cu(l, "class", e);
        break;
      case "tabIndex":
        Cu(l, "tabindex", e);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Cu(l, a, e);
        break;
      case "style":
        Xf(l, e, n);
        break;
      case "data":
        if (t !== "object") {
          Cu(l, "data", e);
          break;
        }
      case "src":
      case "href":
        if (e === "" && (t !== "a" || a !== "href")) {
          l.removeAttribute(a);
          break;
        }
        if (e == null || typeof e == "function" || typeof e == "symbol" || typeof e == "boolean") {
          l.removeAttribute(a);
          break;
        }
        e = Ru("" + e), l.setAttribute(a, e);
        break;
      case "action":
      case "formAction":
        if (typeof e == "function") {
          l.setAttribute(
            a,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
          );
          break;
        } else
          typeof n == "function" && (a === "formAction" ? (t !== "input" && dl(l, t, "name", u.name, u, null), dl(
            l,
            t,
            "formEncType",
            u.formEncType,
            u,
            null
          ), dl(
            l,
            t,
            "formMethod",
            u.formMethod,
            u,
            null
          ), dl(
            l,
            t,
            "formTarget",
            u.formTarget,
            u,
            null
          )) : (dl(l, t, "encType", u.encType, u, null), dl(l, t, "method", u.method, u, null), dl(l, t, "target", u.target, u, null)));
        if (e == null || typeof e == "symbol" || typeof e == "boolean") {
          l.removeAttribute(a);
          break;
        }
        e = Ru("" + e), l.setAttribute(a, e);
        break;
      case "onClick":
        e != null && (l.onclick = Ct);
        break;
      case "onScroll":
        e != null && F("scroll", l);
        break;
      case "onScrollEnd":
        e != null && F("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (e != null) {
          if (typeof e != "object" || !("__html" in e))
            throw Error(m(61));
          if (a = e.__html, a != null) {
            if (u.children != null) throw Error(m(60));
            l.innerHTML = a;
          }
        }
        break;
      case "multiple":
        l.multiple = e && typeof e != "function" && typeof e != "symbol";
        break;
      case "muted":
        l.muted = e && typeof e != "function" && typeof e != "symbol";
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
        if (e == null || typeof e == "function" || typeof e == "boolean" || typeof e == "symbol") {
          l.removeAttribute("xlink:href");
          break;
        }
        a = Ru("" + e), l.setAttributeNS(
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
        e != null && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, "" + e) : l.removeAttribute(a);
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
        e && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, "") : l.removeAttribute(a);
        break;
      case "capture":
      case "download":
        e === !0 ? l.setAttribute(a, "") : e !== !1 && e != null && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, e) : l.removeAttribute(a);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        e != null && typeof e != "function" && typeof e != "symbol" && !isNaN(e) && 1 <= e ? l.setAttribute(a, e) : l.removeAttribute(a);
        break;
      case "rowSpan":
      case "start":
        e == null || typeof e == "function" || typeof e == "symbol" || isNaN(e) ? l.removeAttribute(a) : l.setAttribute(a, e);
        break;
      case "popover":
        F("beforetoggle", l), F("toggle", l), Uu(l, "popover", e);
        break;
      case "xlinkActuate":
        Ut(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          e
        );
        break;
      case "xlinkArcrole":
        Ut(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          e
        );
        break;
      case "xlinkRole":
        Ut(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          e
        );
        break;
      case "xlinkShow":
        Ut(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          e
        );
        break;
      case "xlinkTitle":
        Ut(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          e
        );
        break;
      case "xlinkType":
        Ut(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          e
        );
        break;
      case "xmlBase":
        Ut(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          e
        );
        break;
      case "xmlLang":
        Ut(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          e
        );
        break;
      case "xmlSpace":
        Ut(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          e
        );
        break;
      case "is":
        Uu(l, "is", e);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = nm.get(a) || a, Uu(l, a, e));
    }
  }
  function wc(l, t, a, e, u, n) {
    switch (a) {
      case "style":
        Xf(l, e, n);
        break;
      case "dangerouslySetInnerHTML":
        if (e != null) {
          if (typeof e != "object" || !("__html" in e))
            throw Error(m(61));
          if (a = e.__html, a != null) {
            if (u.children != null) throw Error(m(60));
            l.innerHTML = a;
          }
        }
        break;
      case "children":
        typeof e == "string" ? ka(l, e) : (typeof e == "number" || typeof e == "bigint") && ka(l, "" + e);
        break;
      case "onScroll":
        e != null && F("scroll", l);
        break;
      case "onScrollEnd":
        e != null && F("scrollend", l);
        break;
      case "onClick":
        e != null && (l.onclick = Ct);
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
        if (!Uf.hasOwnProperty(a))
          l: {
            if (a[0] === "o" && a[1] === "n" && (u = a.endsWith("Capture"), t = a.slice(2, u ? a.length - 7 : void 0), n = l[wl] || null, n = n != null ? n[a] : null, typeof n == "function" && l.removeEventListener(t, n, u), typeof e == "function")) {
              typeof n != "function" && n !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, e, u);
              break l;
            }
            a in l ? l[a] = e : e === !0 ? l.setAttribute(a, "") : Uu(l, a, e);
          }
    }
  }
  function Ql(l, t, a) {
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
        F("error", l), F("load", l);
        var e = !1, u = !1, n;
        for (n in a)
          if (a.hasOwnProperty(n)) {
            var i = a[n];
            if (i != null)
              switch (n) {
                case "src":
                  e = !0;
                  break;
                case "srcSet":
                  u = !0;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(m(137, t));
                default:
                  dl(l, t, n, i, a, null);
              }
          }
        u && dl(l, t, "srcSet", a.srcSet, a, null), e && dl(l, t, "src", a.src, a, null);
        return;
      case "input":
        F("invalid", l);
        var c = n = i = u = null, f = null, y = null;
        for (e in a)
          if (a.hasOwnProperty(e)) {
            var x = a[e];
            if (x != null)
              switch (e) {
                case "name":
                  u = x;
                  break;
                case "type":
                  i = x;
                  break;
                case "checked":
                  f = x;
                  break;
                case "defaultChecked":
                  y = x;
                  break;
                case "value":
                  n = x;
                  break;
                case "defaultValue":
                  c = x;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (x != null)
                    throw Error(m(137, t));
                  break;
                default:
                  dl(l, t, e, x, a, null);
              }
          }
        qf(
          l,
          n,
          c,
          f,
          y,
          i,
          u,
          !1
        );
        return;
      case "select":
        F("invalid", l), e = i = n = null;
        for (u in a)
          if (a.hasOwnProperty(u) && (c = a[u], c != null))
            switch (u) {
              case "value":
                n = c;
                break;
              case "defaultValue":
                i = c;
                break;
              case "multiple":
                e = c;
              default:
                dl(l, t, u, c, a, null);
            }
        t = n, a = i, l.multiple = !!e, t != null ? wa(l, !!e, t, !1) : a != null && wa(l, !!e, a, !0);
        return;
      case "textarea":
        F("invalid", l), n = u = e = null;
        for (i in a)
          if (a.hasOwnProperty(i) && (c = a[i], c != null))
            switch (i) {
              case "value":
                e = c;
                break;
              case "defaultValue":
                u = c;
                break;
              case "children":
                n = c;
                break;
              case "dangerouslySetInnerHTML":
                if (c != null) throw Error(m(91));
                break;
              default:
                dl(l, t, i, c, a, null);
            }
        Gf(l, e, u, n);
        return;
      case "option":
        for (f in a)
          a.hasOwnProperty(f) && (e = a[f], e != null) && (f === "selected" ? l.selected = e && typeof e != "function" && typeof e != "symbol" : dl(l, t, f, e, a, null));
        return;
      case "dialog":
        F("beforetoggle", l), F("toggle", l), F("cancel", l), F("close", l);
        break;
      case "iframe":
      case "object":
        F("load", l);
        break;
      case "video":
      case "audio":
        for (e = 0; e < ru.length; e++)
          F(ru[e], l);
        break;
      case "image":
        F("error", l), F("load", l);
        break;
      case "details":
        F("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        F("error", l), F("load", l);
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
        for (y in a)
          if (a.hasOwnProperty(y) && (e = a[y], e != null))
            switch (y) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(m(137, t));
              default:
                dl(l, t, y, e, a, null);
            }
        return;
      default:
        if (ci(t)) {
          for (x in a)
            a.hasOwnProperty(x) && (e = a[x], e !== void 0 && wc(
              l,
              t,
              x,
              e,
              a,
              void 0
            ));
          return;
        }
    }
    for (c in a)
      a.hasOwnProperty(c) && (e = a[c], e != null && dl(l, t, c, e, a, null));
  }
  function U0(l, t, a, e) {
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
        var u = null, n = null, i = null, c = null, f = null, y = null, x = null;
        for (S in a) {
          var T = a[S];
          if (a.hasOwnProperty(S) && T != null)
            switch (S) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                f = T;
              default:
                e.hasOwnProperty(S) || dl(l, t, S, null, e, T);
            }
        }
        for (var b in e) {
          var S = e[b];
          if (T = a[b], e.hasOwnProperty(b) && (S != null || T != null))
            switch (b) {
              case "type":
                n = S;
                break;
              case "name":
                u = S;
                break;
              case "checked":
                y = S;
                break;
              case "defaultChecked":
                x = S;
                break;
              case "value":
                i = S;
                break;
              case "defaultValue":
                c = S;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (S != null)
                  throw Error(m(137, t));
                break;
              default:
                S !== T && dl(
                  l,
                  t,
                  b,
                  S,
                  e,
                  T
                );
            }
        }
        ni(
          l,
          i,
          c,
          f,
          y,
          x,
          n,
          u
        );
        return;
      case "select":
        S = i = c = b = null;
        for (n in a)
          if (f = a[n], a.hasOwnProperty(n) && f != null)
            switch (n) {
              case "value":
                break;
              case "multiple":
                S = f;
              default:
                e.hasOwnProperty(n) || dl(
                  l,
                  t,
                  n,
                  null,
                  e,
                  f
                );
            }
        for (u in e)
          if (n = e[u], f = a[u], e.hasOwnProperty(u) && (n != null || f != null))
            switch (u) {
              case "value":
                b = n;
                break;
              case "defaultValue":
                c = n;
                break;
              case "multiple":
                i = n;
              default:
                n !== f && dl(
                  l,
                  t,
                  u,
                  n,
                  e,
                  f
                );
            }
        t = c, a = i, e = S, b != null ? wa(l, !!a, b, !1) : !!e != !!a && (t != null ? wa(l, !!a, t, !0) : wa(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        S = b = null;
        for (c in a)
          if (u = a[c], a.hasOwnProperty(c) && u != null && !e.hasOwnProperty(c))
            switch (c) {
              case "value":
                break;
              case "children":
                break;
              default:
                dl(l, t, c, null, e, u);
            }
        for (i in e)
          if (u = e[i], n = a[i], e.hasOwnProperty(i) && (u != null || n != null))
            switch (i) {
              case "value":
                b = u;
                break;
              case "defaultValue":
                S = u;
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (u != null) throw Error(m(91));
                break;
              default:
                u !== n && dl(l, t, i, u, e, n);
            }
        Yf(l, b, S);
        return;
      case "option":
        for (var D in a)
          b = a[D], a.hasOwnProperty(D) && b != null && !e.hasOwnProperty(D) && (D === "selected" ? l.selected = !1 : dl(
            l,
            t,
            D,
            null,
            e,
            b
          ));
        for (f in e)
          b = e[f], S = a[f], e.hasOwnProperty(f) && b !== S && (b != null || S != null) && (f === "selected" ? l.selected = b && typeof b != "function" && typeof b != "symbol" : dl(
            l,
            t,
            f,
            b,
            e,
            S
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
        for (var G in a)
          b = a[G], a.hasOwnProperty(G) && b != null && !e.hasOwnProperty(G) && dl(l, t, G, null, e, b);
        for (y in e)
          if (b = e[y], S = a[y], e.hasOwnProperty(y) && b !== S && (b != null || S != null))
            switch (y) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (b != null)
                  throw Error(m(137, t));
                break;
              default:
                dl(
                  l,
                  t,
                  y,
                  b,
                  e,
                  S
                );
            }
        return;
      default:
        if (ci(t)) {
          for (var rl in a)
            b = a[rl], a.hasOwnProperty(rl) && b !== void 0 && !e.hasOwnProperty(rl) && wc(
              l,
              t,
              rl,
              void 0,
              e,
              b
            );
          for (x in e)
            b = e[x], S = a[x], !e.hasOwnProperty(x) || b === S || b === void 0 && S === void 0 || wc(
              l,
              t,
              x,
              b,
              e,
              S
            );
          return;
        }
    }
    for (var d in a)
      b = a[d], a.hasOwnProperty(d) && b != null && !e.hasOwnProperty(d) && dl(l, t, d, null, e, b);
    for (T in e)
      b = e[T], S = a[T], !e.hasOwnProperty(T) || b === S || b == null && S == null || dl(l, t, T, b, e, S);
  }
  function Ld(l) {
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
  function C0() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), e = 0; e < a.length; e++) {
        var u = a[e], n = u.transferSize, i = u.initiatorType, c = u.duration;
        if (n && c && Ld(i)) {
          for (i = 0, c = u.responseEnd, e += 1; e < a.length; e++) {
            var f = a[e], y = f.startTime;
            if (y > c) break;
            var x = f.transferSize, T = f.initiatorType;
            x && Ld(T) && (f = f.responseEnd, i += x * (f < c ? 1 : (c - y) / (f - y)));
          }
          if (--e, t += 8 * (n + i) / (u.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var kc = null, Wc = null;
  function jn(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function Vd(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Kd(l, t) {
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
  function $c(l, t) {
    return l === "textarea" || l === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Fc = null;
  function H0() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Fc ? !1 : (Fc = l, !0) : (Fc = null, !1);
  }
  var Jd = typeof setTimeout == "function" ? setTimeout : void 0, R0 = typeof clearTimeout == "function" ? clearTimeout : void 0, wd = typeof Promise == "function" ? Promise : void 0, B0 = typeof queueMicrotask == "function" ? queueMicrotask : typeof wd < "u" ? function(l) {
    return wd.resolve(null).then(l).catch(q0);
  } : Jd;
  function q0(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function ha(l) {
    return l === "head";
  }
  function kd(l, t) {
    var a = t, e = 0;
    do {
      var u = a.nextSibling;
      if (l.removeChild(a), u && u.nodeType === 8)
        if (a = u.data, a === "/$" || a === "/&") {
          if (e === 0) {
            l.removeChild(u), _e(t);
            return;
          }
          e--;
        } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&")
          e++;
        else if (a === "html")
          vu(l.ownerDocument.documentElement);
        else if (a === "head") {
          a = l.ownerDocument.head, vu(a);
          for (var n = a.firstChild; n; ) {
            var i = n.nextSibling, c = n.nodeName;
            n[Ue] || c === "SCRIPT" || c === "STYLE" || c === "LINK" && n.rel.toLowerCase() === "stylesheet" || a.removeChild(n), n = i;
          }
        } else
          a === "body" && vu(l.ownerDocument.body);
      a = u;
    } while (a);
    _e(t);
  }
  function Wd(l, t) {
    var a = l;
    l = 0;
    do {
      var e = a.nextSibling;
      if (a.nodeType === 1 ? t ? (a._stashedDisplay = a.style.display, a.style.display = "none") : (a.style.display = a._stashedDisplay || "", a.getAttribute("style") === "" && a.removeAttribute("style")) : a.nodeType === 3 && (t ? (a._stashedText = a.nodeValue, a.nodeValue = "") : a.nodeValue = a._stashedText || ""), e && e.nodeType === 8)
        if (a = e.data, a === "/$") {
          if (l === 0) break;
          l--;
        } else
          a !== "$" && a !== "$?" && a !== "$~" && a !== "$!" || l++;
      a = e;
    } while (a);
  }
  function Ic(l) {
    var t = l.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var a = t;
      switch (t = t.nextSibling, a.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Ic(a), ei(a);
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
  function Y0(l, t, a, e) {
    for (; l.nodeType === 1; ) {
      var u = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!e && (l.nodeName !== "INPUT" || l.type !== "hidden"))
          break;
      } else if (e) {
        if (!l[Ue])
          switch (t) {
            case "meta":
              if (!l.hasAttribute("itemprop")) break;
              return l;
            case "link":
              if (n = l.getAttribute("rel"), n === "stylesheet" && l.hasAttribute("data-precedence"))
                break;
              if (n !== u.rel || l.getAttribute("href") !== (u.href == null || u.href === "" ? null : u.href) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin) || l.getAttribute("title") !== (u.title == null ? null : u.title))
                break;
              return l;
            case "style":
              if (l.hasAttribute("data-precedence")) break;
              return l;
            case "script":
              if (n = l.getAttribute("src"), (n !== (u.src == null ? null : u.src) || l.getAttribute("type") !== (u.type == null ? null : u.type) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin)) && n && l.hasAttribute("async") && !l.hasAttribute("itemprop"))
                break;
              return l;
            default:
              return l;
          }
      } else if (t === "input" && l.type === "hidden") {
        var n = u.name == null ? null : "" + u.name;
        if (u.type === "hidden" && l.getAttribute("name") === n)
          return l;
      } else return l;
      if (l = St(l.nextSibling), l === null) break;
    }
    return null;
  }
  function G0(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = St(l.nextSibling), l === null)) return null;
    return l;
  }
  function $d(l, t) {
    for (; l.nodeType !== 8; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !t || (l = St(l.nextSibling), l === null)) return null;
    return l;
  }
  function Pc(l) {
    return l.data === "$?" || l.data === "$~";
  }
  function lf(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState !== "loading";
  }
  function Q0(l, t) {
    var a = l.ownerDocument;
    if (l.data === "$~") l._reactRetry = t;
    else if (l.data !== "$?" || a.readyState !== "loading")
      t();
    else {
      var e = function() {
        t(), a.removeEventListener("DOMContentLoaded", e);
      };
      a.addEventListener("DOMContentLoaded", e), l._reactRetry = e;
    }
  }
  function St(l) {
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
  var tf = null;
  function Fd(l) {
    l = l.nextSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "/$" || a === "/&") {
          if (t === 0)
            return St(l.nextSibling);
          t--;
        } else
          a !== "$" && a !== "$!" && a !== "$?" && a !== "$~" && a !== "&" || t++;
      }
      l = l.nextSibling;
    }
    return null;
  }
  function Id(l) {
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
  function Pd(l, t, a) {
    switch (t = jn(a), l) {
      case "html":
        if (l = t.documentElement, !l) throw Error(m(452));
        return l;
      case "head":
        if (l = t.head, !l) throw Error(m(453));
        return l;
      case "body":
        if (l = t.body, !l) throw Error(m(454));
        return l;
      default:
        throw Error(m(451));
    }
  }
  function vu(l) {
    for (var t = l.attributes; t.length; )
      l.removeAttributeNode(t[0]);
    ei(l);
  }
  var xt = /* @__PURE__ */ new Map(), lr = /* @__PURE__ */ new Set();
  function Un(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Wt = N.d;
  N.d = {
    f: X0,
    r: Z0,
    D: L0,
    C: V0,
    L: K0,
    m: J0,
    X: k0,
    S: w0,
    M: W0
  };
  function X0() {
    var l = Wt.f(), t = Tn();
    return l || t;
  }
  function Z0(l) {
    var t = Va(l);
    t !== null && t.tag === 5 && t.type === "form" ? go(t) : Wt.r(l);
  }
  var ze = typeof document > "u" ? null : document;
  function tr(l, t, a) {
    var e = ze;
    if (e && typeof t == "string" && t) {
      var u = rt(t);
      u = 'link[rel="' + l + '"][href="' + u + '"]', typeof a == "string" && (u += '[crossorigin="' + a + '"]'), lr.has(u) || (lr.add(u), l = { rel: l, crossOrigin: a, href: t }, e.querySelector(u) === null && (t = e.createElement("link"), Ql(t, "link", l), Cl(t), e.head.appendChild(t)));
    }
  }
  function L0(l) {
    Wt.D(l), tr("dns-prefetch", l, null);
  }
  function V0(l, t) {
    Wt.C(l, t), tr("preconnect", l, t);
  }
  function K0(l, t, a) {
    Wt.L(l, t, a);
    var e = ze;
    if (e && l && t) {
      var u = 'link[rel="preload"][as="' + rt(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (u += '[imagesrcset="' + rt(
        a.imageSrcSet
      ) + '"]', typeof a.imageSizes == "string" && (u += '[imagesizes="' + rt(
        a.imageSizes
      ) + '"]')) : u += '[href="' + rt(l) + '"]';
      var n = u;
      switch (t) {
        case "style":
          n = Te(l);
          break;
        case "script":
          n = Ee(l);
      }
      xt.has(n) || (l = _(
        {
          rel: "preload",
          href: t === "image" && a && a.imageSrcSet ? void 0 : l,
          as: t
        },
        a
      ), xt.set(n, l), e.querySelector(u) !== null || t === "style" && e.querySelector(hu(n)) || t === "script" && e.querySelector(yu(n)) || (t = e.createElement("link"), Ql(t, "link", l), Cl(t), e.head.appendChild(t)));
    }
  }
  function J0(l, t) {
    Wt.m(l, t);
    var a = ze;
    if (a && l) {
      var e = t && typeof t.as == "string" ? t.as : "script", u = 'link[rel="modulepreload"][as="' + rt(e) + '"][href="' + rt(l) + '"]', n = u;
      switch (e) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          n = Ee(l);
      }
      if (!xt.has(n) && (l = _({ rel: "modulepreload", href: l }, t), xt.set(n, l), a.querySelector(u) === null)) {
        switch (e) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(yu(n)))
              return;
        }
        e = a.createElement("link"), Ql(e, "link", l), Cl(e), a.head.appendChild(e);
      }
    }
  }
  function w0(l, t, a) {
    Wt.S(l, t, a);
    var e = ze;
    if (e && l) {
      var u = Ka(e).hoistableStyles, n = Te(l);
      t = t || "default";
      var i = u.get(n);
      if (!i) {
        var c = { loading: 0, preload: null };
        if (i = e.querySelector(
          hu(n)
        ))
          c.loading = 5;
        else {
          l = _(
            { rel: "stylesheet", href: l, "data-precedence": t },
            a
          ), (a = xt.get(n)) && af(l, a);
          var f = i = e.createElement("link");
          Cl(f), Ql(f, "link", l), f._p = new Promise(function(y, x) {
            f.onload = y, f.onerror = x;
          }), f.addEventListener("load", function() {
            c.loading |= 1;
          }), f.addEventListener("error", function() {
            c.loading |= 2;
          }), c.loading |= 4, Cn(i, t, e);
        }
        i = {
          type: "stylesheet",
          instance: i,
          count: 1,
          state: c
        }, u.set(n, i);
      }
    }
  }
  function k0(l, t) {
    Wt.X(l, t);
    var a = ze;
    if (a && l) {
      var e = Ka(a).hoistableScripts, u = Ee(l), n = e.get(u);
      n || (n = a.querySelector(yu(u)), n || (l = _({ src: l, async: !0 }, t), (t = xt.get(u)) && ef(l, t), n = a.createElement("script"), Cl(n), Ql(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, e.set(u, n));
    }
  }
  function W0(l, t) {
    Wt.M(l, t);
    var a = ze;
    if (a && l) {
      var e = Ka(a).hoistableScripts, u = Ee(l), n = e.get(u);
      n || (n = a.querySelector(yu(u)), n || (l = _({ src: l, async: !0, type: "module" }, t), (t = xt.get(u)) && ef(l, t), n = a.createElement("script"), Cl(n), Ql(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, e.set(u, n));
    }
  }
  function ar(l, t, a, e) {
    var u = (u = W.current) ? Un(u) : null;
    if (!u) throw Error(m(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = Te(a.href), a = Ka(
          u
        ).hoistableStyles, e = a.get(t), e || (e = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, e)), e) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (a.rel === "stylesheet" && typeof a.href == "string" && typeof a.precedence == "string") {
          l = Te(a.href);
          var n = Ka(
            u
          ).hoistableStyles, i = n.get(l);
          if (i || (u = u.ownerDocument || u, i = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, n.set(l, i), (n = u.querySelector(
            hu(l)
          )) && !n._p && (i.instance = n, i.state.loading = 5), xt.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, xt.set(l, a), n || $0(
            u,
            l,
            a,
            i.state
          ))), t && e === null)
            throw Error(m(528, ""));
          return i;
        }
        if (t && e !== null)
          throw Error(m(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Ee(a), a = Ka(
          u
        ).hoistableScripts, e = a.get(t), e || (e = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, e)), e) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(m(444, l));
    }
  }
  function Te(l) {
    return 'href="' + rt(l) + '"';
  }
  function hu(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function er(l) {
    return _({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function $0(l, t, a, e) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? e.loading = 1 : (t = l.createElement("link"), e.preload = t, t.addEventListener("load", function() {
      return e.loading |= 1;
    }), t.addEventListener("error", function() {
      return e.loading |= 2;
    }), Ql(t, "link", a), Cl(t), l.head.appendChild(t));
  }
  function Ee(l) {
    return '[src="' + rt(l) + '"]';
  }
  function yu(l) {
    return "script[async]" + l;
  }
  function ur(l, t, a) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var e = l.querySelector(
            'style[data-href~="' + rt(a.href) + '"]'
          );
          if (e)
            return t.instance = e, Cl(e), e;
          var u = _({}, a, {
            "data-href": a.href,
            "data-precedence": a.precedence,
            href: null,
            precedence: null
          });
          return e = (l.ownerDocument || l).createElement(
            "style"
          ), Cl(e), Ql(e, "style", u), Cn(e, a.precedence, l), t.instance = e;
        case "stylesheet":
          u = Te(a.href);
          var n = l.querySelector(
            hu(u)
          );
          if (n)
            return t.state.loading |= 4, t.instance = n, Cl(n), n;
          e = er(a), (u = xt.get(u)) && af(e, u), n = (l.ownerDocument || l).createElement("link"), Cl(n);
          var i = n;
          return i._p = new Promise(function(c, f) {
            i.onload = c, i.onerror = f;
          }), Ql(n, "link", e), t.state.loading |= 4, Cn(n, a.precedence, l), t.instance = n;
        case "script":
          return n = Ee(a.src), (u = l.querySelector(
            yu(n)
          )) ? (t.instance = u, Cl(u), u) : (e = a, (u = xt.get(n)) && (e = _({}, a), ef(e, u)), l = l.ownerDocument || l, u = l.createElement("script"), Cl(u), Ql(u, "link", e), l.head.appendChild(u), t.instance = u);
        case "void":
          return null;
        default:
          throw Error(m(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (e = t.instance, t.state.loading |= 4, Cn(e, a.precedence, l));
    return t.instance;
  }
  function Cn(l, t, a) {
    for (var e = a.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), u = e.length ? e[e.length - 1] : null, n = u, i = 0; i < e.length; i++) {
      var c = e[i];
      if (c.dataset.precedence === t) n = c;
      else if (n !== u) break;
    }
    n ? n.parentNode.insertBefore(l, n.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function af(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.title == null && (l.title = t.title);
  }
  function ef(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.integrity == null && (l.integrity = t.integrity);
  }
  var Hn = null;
  function nr(l, t, a) {
    if (Hn === null) {
      var e = /* @__PURE__ */ new Map(), u = Hn = /* @__PURE__ */ new Map();
      u.set(a, e);
    } else
      u = Hn, e = u.get(a), e || (e = /* @__PURE__ */ new Map(), u.set(a, e));
    if (e.has(l)) return e;
    for (e.set(l, null), a = a.getElementsByTagName(l), u = 0; u < a.length; u++) {
      var n = a[u];
      if (!(n[Ue] || n[Bl] || l === "link" && n.getAttribute("rel") === "stylesheet") && n.namespaceURI !== "http://www.w3.org/2000/svg") {
        var i = n.getAttribute(t) || "";
        i = l + i;
        var c = e.get(i);
        c ? c.push(n) : e.set(i, [n]);
      }
    }
    return e;
  }
  function ir(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(
      a,
      t === "title" ? l.querySelector("head > title") : null
    );
  }
  function F0(l, t, a) {
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
  function cr(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function I0(l, t, a, e) {
    if (a.type === "stylesheet" && (typeof e.media != "string" || matchMedia(e.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var u = Te(e.href), n = t.querySelector(
          hu(u)
        );
        if (n) {
          t = n._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = Rn.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = n, Cl(n);
          return;
        }
        n = t.ownerDocument || t, e = er(e), (u = xt.get(u)) && af(e, u), n = n.createElement("link"), Cl(n);
        var i = n;
        i._p = new Promise(function(c, f) {
          i.onload = c, i.onerror = f;
        }), Ql(n, "link", e), a.instance = n;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = Rn.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var uf = 0;
  function P0(l, t) {
    return l.stylesheets && l.count === 0 && qn(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var e = setTimeout(function() {
        if (l.stylesheets && qn(l, l.stylesheets), l.unsuspend) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, 6e4 + t);
      0 < l.imgBytes && uf === 0 && (uf = 62500 * C0());
      var u = setTimeout(
        function() {
          if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && qn(l, l.stylesheets), l.unsuspend)) {
            var n = l.unsuspend;
            l.unsuspend = null, n();
          }
        },
        (l.imgBytes > uf ? 50 : 800) + t
      );
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(e), clearTimeout(u);
      };
    } : null;
  }
  function Rn() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) qn(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var Bn = null;
  function qn(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, Bn = /* @__PURE__ */ new Map(), t.forEach(lv, l), Bn = null, Rn.call(l));
  }
  function lv(l, t) {
    if (!(t.state.loading & 4)) {
      var a = Bn.get(l);
      if (a) var e = a.get(null);
      else {
        a = /* @__PURE__ */ new Map(), Bn.set(l, a);
        for (var u = l.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), n = 0; n < u.length; n++) {
          var i = u[n];
          (i.nodeName === "LINK" || i.getAttribute("media") !== "not all") && (a.set(i.dataset.precedence, i), e = i);
        }
        e && a.set(null, e);
      }
      u = t.instance, i = u.getAttribute("data-precedence"), n = a.get(i) || e, n === e && a.set(null, u), a.set(i, u), this.count++, e = Rn.bind(this), u.addEventListener("load", e), u.addEventListener("error", e), n ? n.parentNode.insertBefore(u, n.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(u, l.firstChild)), t.state.loading |= 4;
    }
  }
  var gu = {
    $$typeof: _l,
    Provider: null,
    Consumer: null,
    _currentValue: Q,
    _currentValue2: Q,
    _threadCount: 0
  };
  function tv(l, t, a, e, u, n, i, c, f) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Pn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Pn(0), this.hiddenUpdates = Pn(null), this.identifierPrefix = e, this.onUncaughtError = u, this.onCaughtError = n, this.onRecoverableError = i, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = f, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function fr(l, t, a, e, u, n, i, c, f, y, x, T) {
    return l = new tv(
      l,
      t,
      a,
      i,
      f,
      y,
      x,
      T,
      c
    ), t = 1, n === !0 && (t |= 24), n = nt(3, null, null, t), l.current = n, n.stateNode = l, t = qi(), t.refCount++, l.pooledCache = t, t.refCount++, n.memoizedState = {
      element: e,
      isDehydrated: a,
      cache: t
    }, Xi(n), l;
  }
  function sr(l) {
    return l ? (l = te, l) : te;
  }
  function or(l, t, a, e, u, n) {
    u = sr(u), e.context === null ? e.context = u : e.pendingContext = u, e = ua(t), e.payload = { element: a }, n = n === void 0 ? null : n, n !== null && (e.callback = n), a = na(l, e, t), a !== null && (Pl(a, l, t), We(a, l, t));
  }
  function dr(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function nf(l, t) {
    dr(l, t), (l = l.alternate) && dr(l, t);
  }
  function rr(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Na(l, 67108864);
      t !== null && Pl(t, l, 67108864), nf(l, 67108864);
    }
  }
  function mr(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = ot();
      t = li(t);
      var a = Na(l, t);
      a !== null && Pl(a, l, t), nf(l, t);
    }
  }
  var Yn = !0;
  function av(l, t, a, e) {
    var u = p.T;
    p.T = null;
    var n = N.p;
    try {
      N.p = 2, cf(l, t, a, e);
    } finally {
      N.p = n, p.T = u;
    }
  }
  function ev(l, t, a, e) {
    var u = p.T;
    p.T = null;
    var n = N.p;
    try {
      N.p = 8, cf(l, t, a, e);
    } finally {
      N.p = n, p.T = u;
    }
  }
  function cf(l, t, a, e) {
    if (Yn) {
      var u = ff(e);
      if (u === null)
        Jc(
          l,
          t,
          e,
          Gn,
          a
        ), hr(l, e);
      else if (nv(
        u,
        l,
        t,
        a,
        e
      ))
        e.stopPropagation();
      else if (hr(l, e), t & 4 && -1 < uv.indexOf(l)) {
        for (; u !== null; ) {
          var n = Va(u);
          if (n !== null)
            switch (n.tag) {
              case 3:
                if (n = n.stateNode, n.current.memoizedState.isDehydrated) {
                  var i = Ta(n.pendingLanes);
                  if (i !== 0) {
                    var c = n;
                    for (c.pendingLanes |= 2, c.entangledLanes |= 2; i; ) {
                      var f = 1 << 31 - et(i);
                      c.entanglements[1] |= f, i &= ~f;
                    }
                    Dt(n), (ul & 6) === 0 && (pn = tt() + 500, du(0));
                  }
                }
                break;
              case 31:
              case 13:
                c = Na(n, 2), c !== null && Pl(c, n, 2), Tn(), nf(n, 2);
            }
          if (n = ff(e), n === null && Jc(
            l,
            t,
            e,
            Gn,
            a
          ), n === u) break;
          u = n;
        }
        u !== null && e.stopPropagation();
      } else
        Jc(
          l,
          t,
          e,
          null,
          a
        );
    }
  }
  function ff(l) {
    return l = si(l), sf(l);
  }
  var Gn = null;
  function sf(l) {
    if (Gn = null, l = La(l), l !== null) {
      var t = Z(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = V(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = X(t), l !== null) return l;
          l = null;
        } else if (a === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated)
            return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return Gn = l, null;
  }
  function vr(l) {
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
        switch (Lr()) {
          case pf:
            return 2;
          case zf:
            return 8;
          case Mu:
          case Vr:
            return 32;
          case Tf:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var of = !1, ya = null, ga = null, ba = null, bu = /* @__PURE__ */ new Map(), Su = /* @__PURE__ */ new Map(), Sa = [], uv = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function hr(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        ya = null;
        break;
      case "dragenter":
      case "dragleave":
        ga = null;
        break;
      case "mouseover":
      case "mouseout":
        ba = null;
        break;
      case "pointerover":
      case "pointerout":
        bu.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Su.delete(t.pointerId);
    }
  }
  function xu(l, t, a, e, u, n) {
    return l === null || l.nativeEvent !== n ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: e,
      nativeEvent: n,
      targetContainers: [u]
    }, t !== null && (t = Va(t), t !== null && rr(t)), l) : (l.eventSystemFlags |= e, t = l.targetContainers, u !== null && t.indexOf(u) === -1 && t.push(u), l);
  }
  function nv(l, t, a, e, u) {
    switch (t) {
      case "focusin":
        return ya = xu(
          ya,
          l,
          t,
          a,
          e,
          u
        ), !0;
      case "dragenter":
        return ga = xu(
          ga,
          l,
          t,
          a,
          e,
          u
        ), !0;
      case "mouseover":
        return ba = xu(
          ba,
          l,
          t,
          a,
          e,
          u
        ), !0;
      case "pointerover":
        var n = u.pointerId;
        return bu.set(
          n,
          xu(
            bu.get(n) || null,
            l,
            t,
            a,
            e,
            u
          )
        ), !0;
      case "gotpointercapture":
        return n = u.pointerId, Su.set(
          n,
          xu(
            Su.get(n) || null,
            l,
            t,
            a,
            e,
            u
          )
        ), !0;
    }
    return !1;
  }
  function yr(l) {
    var t = La(l.target);
    if (t !== null) {
      var a = Z(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = V(a), t !== null) {
            l.blockedOn = t, Of(l.priority, function() {
              mr(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = X(a), t !== null) {
            l.blockedOn = t, Of(l.priority, function() {
              mr(a);
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
  function Qn(l) {
    if (l.blockedOn !== null) return !1;
    for (var t = l.targetContainers; 0 < t.length; ) {
      var a = ff(l.nativeEvent);
      if (a === null) {
        a = l.nativeEvent;
        var e = new a.constructor(
          a.type,
          a
        );
        fi = e, a.target.dispatchEvent(e), fi = null;
      } else
        return t = Va(a), t !== null && rr(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function gr(l, t, a) {
    Qn(l) && a.delete(t);
  }
  function iv() {
    of = !1, ya !== null && Qn(ya) && (ya = null), ga !== null && Qn(ga) && (ga = null), ba !== null && Qn(ba) && (ba = null), bu.forEach(gr), Su.forEach(gr);
  }
  function Xn(l, t) {
    l.blockedOn === t && (l.blockedOn = null, of || (of = !0, r.unstable_scheduleCallback(
      r.unstable_NormalPriority,
      iv
    )));
  }
  var Zn = null;
  function br(l) {
    Zn !== l && (Zn = l, r.unstable_scheduleCallback(
      r.unstable_NormalPriority,
      function() {
        Zn === l && (Zn = null);
        for (var t = 0; t < l.length; t += 3) {
          var a = l[t], e = l[t + 1], u = l[t + 2];
          if (typeof e != "function") {
            if (sf(e || a) === null)
              continue;
            break;
          }
          var n = Va(a);
          n !== null && (l.splice(t, 3), t -= 3, cc(
            n,
            {
              pending: !0,
              data: u,
              method: a.method,
              action: e
            },
            e,
            u
          ));
        }
      }
    ));
  }
  function _e(l) {
    function t(f) {
      return Xn(f, l);
    }
    ya !== null && Xn(ya, l), ga !== null && Xn(ga, l), ba !== null && Xn(ba, l), bu.forEach(t), Su.forEach(t);
    for (var a = 0; a < Sa.length; a++) {
      var e = Sa[a];
      e.blockedOn === l && (e.blockedOn = null);
    }
    for (; 0 < Sa.length && (a = Sa[0], a.blockedOn === null); )
      yr(a), a.blockedOn === null && Sa.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null)
      for (e = 0; e < a.length; e += 3) {
        var u = a[e], n = a[e + 1], i = u[wl] || null;
        if (typeof n == "function")
          i || br(a);
        else if (i) {
          var c = null;
          if (n && n.hasAttribute("formAction")) {
            if (u = n, i = n[wl] || null)
              c = i.formAction;
            else if (sf(u) !== null) continue;
          } else c = i.action;
          typeof c == "function" ? a[e + 1] = c : (a.splice(e, 3), e -= 3), br(a);
        }
      }
  }
  function Sr() {
    function l(n) {
      n.canIntercept && n.info === "react-transition" && n.intercept({
        handler: function() {
          return new Promise(function(i) {
            return u = i;
          });
        },
        focusReset: "manual",
        scroll: "manual"
      });
    }
    function t() {
      u !== null && (u(), u = null), e || setTimeout(a, 20);
    }
    function a() {
      if (!e && !navigation.transition) {
        var n = navigation.currentEntry;
        n && n.url != null && navigation.navigate(n.url, {
          state: n.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var e = !1, u = null;
      return navigation.addEventListener("navigate", l), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(a, 100), function() {
        e = !0, navigation.removeEventListener("navigate", l), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), u !== null && (u(), u = null);
      };
    }
  }
  function df(l) {
    this._internalRoot = l;
  }
  Ln.prototype.render = df.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(m(409));
    var a = t.current, e = ot();
    or(a, e, l, t, null, null);
  }, Ln.prototype.unmount = df.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      or(l.current, 2, null, l, null, null), Tn(), t[Za] = null;
    }
  };
  function Ln(l) {
    this._internalRoot = l;
  }
  Ln.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = Nf();
      l = { blockedOn: null, target: l, priority: t };
      for (var a = 0; a < Sa.length && t !== 0 && t < Sa[a].priority; a++) ;
      Sa.splice(a, 0, l), a === 0 && yr(l);
    }
  };
  var xr = H.version;
  if (xr !== "19.2.4")
    throw Error(
      m(
        527,
        xr,
        "19.2.4"
      )
    );
  N.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(m(188)) : (l = Object.keys(l).join(","), Error(m(268, l)));
    return l = v(t), l = l !== null ? A(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var cv = {
    bundleType: 0,
    version: "19.2.4",
    rendererPackageName: "react-dom",
    currentDispatcherRef: p,
    reconcilerVersion: "19.2.4"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Vn = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Vn.isDisabled && Vn.supportsFiber)
      try {
        Oe = Vn.inject(
          cv
        ), at = Vn;
      } catch {
      }
  }
  return zu.createRoot = function(l, t) {
    if (!R(l)) throw Error(m(299));
    var a = !1, e = "", u = Mo, n = No, i = Oo;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (e = t.identifierPrefix), t.onUncaughtError !== void 0 && (u = t.onUncaughtError), t.onCaughtError !== void 0 && (n = t.onCaughtError), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = fr(
      l,
      1,
      !1,
      null,
      null,
      a,
      e,
      null,
      u,
      n,
      i,
      Sr
    ), l[Za] = t.current, Kc(l), new df(t);
  }, zu.hydrateRoot = function(l, t, a) {
    if (!R(l)) throw Error(m(299));
    var e = !1, u = "", n = Mo, i = No, c = Oo, f = null;
    return a != null && (a.unstable_strictMode === !0 && (e = !0), a.identifierPrefix !== void 0 && (u = a.identifierPrefix), a.onUncaughtError !== void 0 && (n = a.onUncaughtError), a.onCaughtError !== void 0 && (i = a.onCaughtError), a.onRecoverableError !== void 0 && (c = a.onRecoverableError), a.formState !== void 0 && (f = a.formState)), t = fr(
      l,
      1,
      !0,
      t,
      a ?? null,
      e,
      u,
      f,
      n,
      i,
      c,
      Sr
    ), t.context = sr(null), a = t.current, e = ot(), e = li(e), u = ua(e), u.callback = null, na(a, u, e), a = e, t.current.lanes = a, je(t, a), Dt(t), l[Za] = t.current, Kc(l), new Ln(t);
  }, zu.version = "19.2.4", zu;
}
var Dr;
function gv() {
  if (Dr) return mf.exports;
  Dr = 1;
  function r() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(r);
      } catch (H) {
        console.error(H);
      }
  }
  return r(), mf.exports = yv(), mf.exports;
}
var bv = gv(), el = bf();
const Sv = "pomodoro", Cr = "tasks", Hr = "timer";
function Me() {
  return window.__khadim(Sv);
}
const Eu = {
  status: "idle",
  task_id: "",
  remaining_seconds: 0,
  session_minutes: 25,
  break_minutes: 5
};
async function Rr() {
  const r = await Me().store.get(Cr);
  if (!r) return [];
  try {
    return JSON.parse(r);
  } catch {
    return [];
  }
}
async function Tu(r) {
  await Me().store.set(Cr, JSON.stringify(r));
}
async function xv() {
  const r = await Me().store.get(Hr);
  if (!r) return Eu;
  try {
    return JSON.parse(r);
  } catch {
    return Eu;
  }
}
async function Ae(r) {
  await Me().store.set(Hr, JSON.stringify(r));
}
function pv() {
  return `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function zv(r) {
  return Me().events.on("pomodoro_updated", r);
}
function Tv(r) {
  return Me().events.on("pomodoro_timer", r);
}
function _u() {
  const [r, H] = el.useState([]), [C, m] = el.useState(!0), R = el.useCallback(async () => {
    const v = await Rr();
    H(v), m(!1);
  }, []);
  el.useEffect(() => (R(), zv(R)), [R]);
  const Z = el.useCallback(async (v) => {
    const A = {
      id: pv(),
      ...v,
      elapsed_seconds: 0,
      completed: !1,
      pomodoros_done: 0
    }, _ = [...r, A];
    return await Tu(_), H(_), A;
  }, [r]), V = el.useCallback(async (v) => {
    const A = r.filter((_) => _.id !== v);
    await Tu(A), H(A);
  }, [r]), X = el.useCallback(async (v) => {
    const A = r.map((_) => _.id === v ? { ..._, completed: !0 } : _);
    await Tu(A), H(A);
  }, [r]), M = el.useCallback(async (v, A) => {
    const _ = r.map((Y) => Y.id === v ? { ...Y, ...A } : Y);
    await Tu(_), H(_);
  }, [r]);
  return { tasks: r, loading: C, refresh: R, addTask: Z, deleteTask: V, completeTask: X, updateTask: M };
}
function Kn() {
  const [r, H] = el.useState(Eu), C = el.useRef(null), m = el.useRef(r);
  m.current = r, el.useEffect(() => {
    xv().then(H);
  }, []), el.useEffect(() => Tv((A) => {
    try {
      const _ = JSON.parse(A);
      H(_);
    } catch {
    }
  }), []), el.useEffect(() => (C.current && clearInterval(C.current), (r.status === "running" || r.status === "break") && (C.current = setInterval(() => {
    H((v) => {
      if (v.remaining_seconds <= 1) {
        const A = v.status === "running" ? { ...v, status: "break", remaining_seconds: v.break_minutes * 60 } : { ...v, status: "idle", remaining_seconds: 0 };
        return v.status === "running" && v.task_id && Ev(v.task_id, v.session_minutes), Ae(A), A;
      }
      return { ...v, remaining_seconds: v.remaining_seconds - 1 };
    });
  }, 1e3)), () => {
    C.current && clearInterval(C.current);
  }), [r.status]);
  const R = el.useCallback(async (v, A = 25, _ = 5) => {
    const Y = {
      status: "running",
      task_id: v,
      remaining_seconds: A * 60,
      session_minutes: A,
      break_minutes: _
    };
    await Ae(Y), H(Y);
  }, []), Z = el.useCallback(async () => {
    const v = { ...m.current, status: "paused" };
    await Ae(v), H(v);
  }, []), V = el.useCallback(async () => {
    const v = { ...m.current, status: "running" };
    await Ae(v), H(v);
  }, []), X = el.useCallback(async () => {
    const v = { ...Eu };
    await Ae(v), H(v);
  }, []), M = el.useCallback(async () => {
    const v = { ...Eu };
    await Ae(v), H(v);
  }, []);
  return { timer: r, start: R, pause: Z, resume: V, stop: X, skipBreak: M };
}
async function Ev(r, H) {
  const m = (await Rr()).map(
    (R) => R.id === r ? { ...R, pomodoros_done: R.pomodoros_done + 1, elapsed_seconds: R.elapsed_seconds + H * 60 } : R
  );
  await Tu(m);
}
function Br(r) {
  const H = Math.floor(r / 60), C = r % 60;
  return `${H}:${C.toString().padStart(2, "0")}`;
}
function Jn(r) {
  if (r < 60) return `${r}m`;
  const H = Math.floor(r / 60), C = r % 60;
  return C > 0 ? `${H}h ${C}m` : `${H}h`;
}
function qr(r) {
  return r.estimated_minutes <= 0 ? 0 : Math.min(100, Math.round(r.elapsed_seconds / (r.estimated_minutes * 60) * 100));
}
const _v = [
  { m: 15, label: "15m", desc: "Quick review" },
  { m: 25, label: "25m", desc: "Standard" },
  { m: 30, label: "30m", desc: "Light study" },
  { m: 45, label: "45m", desc: "Deep read" },
  { m: 60, label: "1h", desc: "Problem set" },
  { m: 90, label: "1.5h", desc: "Long session" }
];
function Yr({ onClose: r }) {
  const { addTask: H } = _u(), [C, m] = el.useState(""), [R, Z] = el.useState(""), [V, X] = el.useState(25), [M, v] = el.useState(""), A = el.useRef(null);
  el.useEffect(() => {
    A.current?.focus();
  }, []);
  const _ = async () => {
    if (!C.trim()) {
      v("Give your task a name.");
      return;
    }
    await H({ title: C.trim(), description: R.trim(), estimated_minutes: V }), r();
  }, Y = [
    "w-full px-3 py-2 rounded-xl text-[12px] outline-none transition-all duration-150",
    "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
    "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
    "focus:border-[var(--surface-ink-solid)] focus:bg-[rgba(99,102,241,0.04)]"
  ].join(" ");
  return /* @__PURE__ */ g.jsx(
    "div",
    {
      className: "fixed inset-0 z-[9999] flex items-center justify-center",
      style: { background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" },
      onClick: (B) => {
        B.target === B.currentTarget && r();
      },
      children: /* @__PURE__ */ g.jsxs(
        "div",
        {
          className: "flex flex-col gap-4 w-[380px] p-5 rounded-2xl border text-[var(--text-primary)]",
          style: {
            background: "var(--surface-elevated, #1e2130)",
            borderColor: "var(--glass-border-strong, rgba(255,255,255,0.15))",
            boxShadow: "0 24px 64px -12px rgba(0,0,0,0.5)",
            fontFamily: "inherit"
          },
          children: [
            /* @__PURE__ */ g.jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ g.jsx("h3", { className: "text-[15px] font-extrabold tracking-tight m-0", children: "New Study Task" }),
              /* @__PURE__ */ g.jsx(
                "button",
                {
                  onClick: r,
                  className: "w-6 h-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] cursor-pointer border-none bg-transparent transition-all",
                  children: /* @__PURE__ */ g.jsx("svg", { className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", strokeWidth: 2.5, viewBox: "0 0 24 24", children: /* @__PURE__ */ g.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18L18 6M6 6l12 12" }) })
                }
              )
            ] }),
            /* @__PURE__ */ g.jsxs("div", { children: [
              /* @__PURE__ */ g.jsx("label", { className: "block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5", children: "What are you studying?" }),
              /* @__PURE__ */ g.jsx(
                "input",
                {
                  ref: A,
                  className: Y,
                  type: "text",
                  value: C,
                  placeholder: "e.g. Linear Algebra Ch. 5",
                  onChange: (B) => {
                    m(B.target.value), v("");
                  },
                  onKeyDown: (B) => B.key === "Enter" && _(),
                  style: { fontFamily: "inherit" }
                }
              )
            ] }),
            /* @__PURE__ */ g.jsxs("div", { children: [
              /* @__PURE__ */ g.jsxs("label", { className: "block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5", children: [
                "Details ",
                /* @__PURE__ */ g.jsx("span", { className: "normal-case tracking-normal font-normal", children: "(optional)" })
              ] }),
              /* @__PURE__ */ g.jsx(
                "input",
                {
                  className: Y,
                  type: "text",
                  value: R,
                  placeholder: "Topics, exercises, page numbers…",
                  onChange: (B) => Z(B.target.value),
                  style: { fontFamily: "inherit" }
                }
              )
            ] }),
            /* @__PURE__ */ g.jsxs("div", { children: [
              /* @__PURE__ */ g.jsx("label", { className: "block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-2", children: "Estimated time" }),
              /* @__PURE__ */ g.jsx("div", { className: "grid grid-cols-3 gap-1.5", children: _v.map((B) => /* @__PURE__ */ g.jsxs(
                "button",
                {
                  onClick: () => X(B.m),
                  className: [
                    "flex flex-col items-center py-2 rounded-xl text-center cursor-pointer border transition-all duration-100",
                    V === B.m ? "bg-[var(--surface-ink-solid)] border-[var(--surface-ink-solid)] text-white shadow-[0_2px_12px_-2px_rgba(99,102,241,0.3)]" : "bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
                  ].join(" "),
                  children: [
                    /* @__PURE__ */ g.jsx("span", { className: "text-[13px] font-extrabold leading-none", children: B.label }),
                    /* @__PURE__ */ g.jsx("span", { className: `text-[8px] font-semibold mt-0.5 ${V === B.m ? "text-white/70" : "text-[var(--text-muted)]"}`, children: B.desc })
                  ]
                },
                B.m
              )) }),
              /* @__PURE__ */ g.jsxs("div", { className: "flex items-center gap-2 mt-2.5", children: [
                /* @__PURE__ */ g.jsx("span", { className: "text-[10px] font-semibold text-[var(--text-muted)]", children: "or" }),
                /* @__PURE__ */ g.jsx(
                  "input",
                  {
                    className: "w-16 px-2.5 py-1.5 rounded-lg text-[12px] text-center outline-none tabular-nums bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:border-[var(--surface-ink-solid)]",
                    type: "number",
                    min: 1,
                    max: 300,
                    value: V,
                    onChange: (B) => X(Math.max(1, parseInt(B.target.value) || 25)),
                    style: { fontFamily: "inherit" }
                  }
                ),
                /* @__PURE__ */ g.jsx("span", { className: "text-[10px] font-semibold text-[var(--text-muted)]", children: "minutes" })
              ] })
            ] }),
            M && /* @__PURE__ */ g.jsx("p", { className: "text-[11px] text-[#f87171] m-0 -mt-1", children: M }),
            /* @__PURE__ */ g.jsxs("div", { className: "flex gap-2 justify-end pt-1", children: [
              /* @__PURE__ */ g.jsx(
                "button",
                {
                  onClick: r,
                  className: "px-4 py-2 rounded-xl text-[12px] font-semibold cursor-pointer bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-all",
                  children: "Cancel"
                }
              ),
              /* @__PURE__ */ g.jsx(
                "button",
                {
                  onClick: _,
                  className: "px-5 py-2 rounded-xl text-[12px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.97] transition-all shadow-[0_2px_12px_-2px_rgba(99,102,241,0.3)]",
                  children: "Add Task"
                }
              )
            ] })
          ]
        }
      )
    }
  );
}
function Av() {
  const { timer: r, pause: H, resume: C, stop: m, skipBreak: R, start: Z } = Kn(), { tasks: V } = _u(), X = r.status !== "idle", M = r.task_id ? V.find((k) => k.id === r.task_id) : null, v = r.status === "running", A = r.status === "break", _ = r.status === "paused", Y = 64, B = 3, hl = (Y - B * 2) / 2, nl = 2 * Math.PI * hl, Xl = r.status === "break" ? r.break_minutes * 60 : r.session_minutes * 60, Dl = Xl > 0 && X ? r.remaining_seconds / Xl : 1, lt = nl * (1 - Dl), _l = v ? "var(--surface-ink-solid, #6366f1)" : A ? "#34d399" : "var(--text-muted, #64748b)", Rl = v ? "Focusing" : _ ? "Paused" : A ? "Break" : "Ready", jl = v ? "var(--surface-ink-solid, #6366f1)" : A ? "#34d399" : "var(--text-muted, #94a3b8)", Sl = "px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all duration-100";
  return /* @__PURE__ */ g.jsxs("div", { className: "rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3", children: [
    /* @__PURE__ */ g.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ g.jsxs("div", { className: "relative flex-shrink-0", style: { width: Y, height: Y }, children: [
        /* @__PURE__ */ g.jsxs("svg", { width: Y, height: Y, className: "-rotate-90", children: [
          /* @__PURE__ */ g.jsx("circle", { cx: Y / 2, cy: Y / 2, r: hl, fill: "none", stroke: "var(--glass-bg-strong, rgba(255,255,255,0.06))", strokeWidth: B }),
          X && /* @__PURE__ */ g.jsx(
            "circle",
            {
              cx: Y / 2,
              cy: Y / 2,
              r: hl,
              fill: "none",
              stroke: _l,
              strokeWidth: B,
              strokeDasharray: nl,
              strokeDashoffset: lt,
              strokeLinecap: "round",
              className: "transition-all duration-500 ease-linear"
            }
          )
        ] }),
        /* @__PURE__ */ g.jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ g.jsx("span", { className: "text-[15px] font-extrabold tabular-nums leading-none", style: {
          letterSpacing: "-0.02em",
          color: X ? "var(--text-primary)" : "var(--text-muted, #64748b)"
        }, children: Br(X ? r.remaining_seconds : 1500) }) })
      ] }),
      /* @__PURE__ */ g.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ g.jsx("div", { className: "text-[9px] font-bold uppercase tracking-[0.1em] mb-0.5", style: { color: jl }, children: Rl }),
        M ? /* @__PURE__ */ g.jsx("div", { className: "text-[11px] font-semibold text-[var(--text-primary)] truncate", children: M.title }) : /* @__PURE__ */ g.jsx("div", { className: "text-[11px] text-[var(--text-muted)]", children: X ? "Free session" : "Pick a task below" })
      ] })
    ] }),
    /* @__PURE__ */ g.jsxs("div", { className: "flex gap-1.5 mt-2.5", children: [
      r.status === "idle" && /* @__PURE__ */ g.jsx(
        "button",
        {
          className: `${Sl} flex-1 border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110`,
          onClick: () => {
            Z("", 25, 5);
          },
          children: "Start"
        }
      ),
      v && /* @__PURE__ */ g.jsxs(g.Fragment, { children: [
        /* @__PURE__ */ g.jsx(
          "button",
          {
            className: `${Sl} flex-1 border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`,
            onClick: () => {
              H();
            },
            children: "Pause"
          }
        ),
        /* @__PURE__ */ g.jsx(
          "button",
          {
            className: `${Sl} border border-[rgba(239,68,68,0.2)] bg-transparent text-[#f87171] hover:bg-[rgba(239,68,68,0.1)]`,
            onClick: () => {
              m();
            },
            children: "Stop"
          }
        )
      ] }),
      _ && /* @__PURE__ */ g.jsxs(g.Fragment, { children: [
        /* @__PURE__ */ g.jsx(
          "button",
          {
            className: `${Sl} flex-1 border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110`,
            onClick: () => {
              C();
            },
            children: "Resume"
          }
        ),
        /* @__PURE__ */ g.jsx(
          "button",
          {
            className: `${Sl} border border-[rgba(239,68,68,0.2)] bg-transparent text-[#f87171] hover:bg-[rgba(239,68,68,0.1)]`,
            onClick: () => {
              m();
            },
            children: "Stop"
          }
        )
      ] }),
      A && /* @__PURE__ */ g.jsx(
        "button",
        {
          className: `${Sl} flex-1 border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`,
          onClick: () => {
            R();
          },
          children: "Skip Break"
        }
      )
    ] })
  ] });
}
function jr({ task: r, isCurrent: H, onStart: C }) {
  const [m, R] = el.useState(!1), Z = qr(r);
  return /* @__PURE__ */ g.jsxs(
    "button",
    {
      onMouseEnter: () => R(!0),
      onMouseLeave: () => R(!1),
      onClick: () => !r.completed && C(),
      className: [
        "w-full text-left rounded-xl border px-2.5 py-2 transition-all duration-100 cursor-pointer",
        "flex flex-col gap-1",
        r.completed ? "opacity-40 border-[var(--glass-border)] bg-transparent" : H ? "border-[var(--surface-ink-solid)] bg-[rgba(99,102,241,0.08)]" : m ? "border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]" : "border-[var(--glass-border)] bg-[var(--glass-bg)]"
      ].join(" "),
      style: { outline: "none" },
      children: [
        /* @__PURE__ */ g.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ g.jsx(
            "div",
            {
              className: "w-1.5 h-1.5 rounded-full flex-shrink-0",
              style: {
                background: r.completed ? "#34d399" : H ? "var(--surface-ink-solid, #6366f1)" : Z > 0 ? "var(--text-muted, #94a3b8)" : "var(--glass-border-strong, rgba(255,255,255,0.15))"
              }
            }
          ),
          /* @__PURE__ */ g.jsx("span", { className: [
            "text-[11px] font-semibold truncate flex-1",
            r.completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
          ].join(" "), children: r.title }),
          /* @__PURE__ */ g.jsx("span", { className: "flex-shrink-0 text-[9px] font-bold text-[var(--text-muted)] tabular-nums", children: Jn(r.estimated_minutes) })
        ] }),
        !r.completed && Z > 0 && /* @__PURE__ */ g.jsx("div", { className: "h-[2px] w-full rounded-full bg-[var(--glass-bg-strong)] overflow-hidden ml-3.5", style: { width: "calc(100% - 14px)" }, children: /* @__PURE__ */ g.jsx(
          "div",
          {
            className: "h-full rounded-full transition-all duration-500",
            style: {
              width: `${Z}%`,
              background: Z >= 100 ? "#34d399" : H ? "var(--surface-ink-solid)" : "var(--text-muted, #64748b)"
            }
          }
        ) })
      ]
    }
  );
}
function Mv() {
  const { tasks: r } = _u(), { timer: H, start: C } = Kn(), [m, R] = el.useState(!1), Z = H.status !== "idle", V = r.filter((A) => !A.completed), X = r.filter((A) => A.completed), M = V.reduce((A, _) => A + _.estimated_minutes, 0), v = (A) => {
    const _ = r.find((Y) => Y.id === A);
    _ && C(A, Math.min(_.estimated_minutes, 90) || 25, 5);
  };
  return /* @__PURE__ */ g.jsxs("div", { className: "flex flex-col flex-1 min-h-0 overflow-hidden p-3 gap-2.5 text-[var(--text-primary)]", style: { fontFamily: "inherit" }, children: [
    /* @__PURE__ */ g.jsx(Av, {}),
    /* @__PURE__ */ g.jsx("div", { className: "flex items-center justify-between px-1", children: /* @__PURE__ */ g.jsx("span", { className: "text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]", children: V.length > 0 ? `${V.length} tasks · ${Jn(M)}` : "No tasks" }) }),
    /* @__PURE__ */ g.jsxs("div", { className: "flex-1 overflow-y-auto flex flex-col gap-1", style: { scrollbarWidth: "thin" }, children: [
      V.map((A) => /* @__PURE__ */ g.jsx(
        jr,
        {
          task: A,
          isCurrent: H.task_id === A.id && Z,
          onStart: () => v(A.id)
        },
        A.id
      )),
      X.length > 0 && /* @__PURE__ */ g.jsxs(g.Fragment, { children: [
        /* @__PURE__ */ g.jsx("div", { className: "text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mt-2 mb-0.5 px-1", children: "Done" }),
        X.slice(0, 4).map((A) => /* @__PURE__ */ g.jsx(jr, { task: A, isCurrent: !1, onStart: () => {
        } }, A.id)),
        X.length > 4 && /* @__PURE__ */ g.jsxs("span", { className: "text-[9px] text-[var(--text-muted)] px-1", children: [
          "+",
          X.length - 4,
          " more"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ g.jsx(
      "button",
      {
        onClick: () => R(!0),
        className: "w-full py-2 rounded-xl text-[11px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.98] transition-all",
        children: "+ Add Task"
      }
    ),
    m && /* @__PURE__ */ g.jsx(Yr, { onClose: () => R(!1) })
  ] });
}
function Nv() {
  const { timer: r, start: H, pause: C, resume: m, stop: R, skipBreak: Z } = Kn(), { tasks: V } = _u(), X = r.status === "running", M = r.status === "break", v = r.status === "paused", A = r.status === "idle", _ = !A, Y = M ? r.break_minutes * 60 : r.session_minutes * 60, B = Y > 0 && _ ? r.remaining_seconds / Y : 1, hl = r.task_id ? V.find((Sl) => Sl.id === r.task_id) : null, nl = 120, Xl = 4, Dl = (nl - Xl * 2) / 2, lt = 2 * Math.PI * Dl, _l = lt * (1 - B), Rl = X ? "var(--surface-ink-solid, #6366f1)" : M ? "#34d399" : v ? "var(--text-muted, #64748b)" : "var(--glass-border-strong)", jl = "px-4 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all duration-100 outline-none";
  return /* @__PURE__ */ g.jsxs("div", { className: "flex items-center gap-6 px-5 py-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]", children: [
    /* @__PURE__ */ g.jsxs("div", { className: "relative flex-shrink-0", style: { width: nl, height: nl }, children: [
      _ && /* @__PURE__ */ g.jsx("div", { className: "absolute rounded-full", style: {
        inset: "8px",
        background: X ? "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)" : M ? "radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)" : "none"
      } }),
      /* @__PURE__ */ g.jsxs("svg", { width: nl, height: nl, className: "-rotate-90", children: [
        /* @__PURE__ */ g.jsx(
          "circle",
          {
            cx: nl / 2,
            cy: nl / 2,
            r: Dl,
            fill: "none",
            stroke: "var(--glass-bg-strong, rgba(255,255,255,0.06))",
            strokeWidth: Xl
          }
        ),
        /* @__PURE__ */ g.jsx(
          "circle",
          {
            cx: nl / 2,
            cy: nl / 2,
            r: Dl,
            fill: "none",
            stroke: Rl,
            strokeWidth: Xl,
            strokeDasharray: lt,
            strokeDashoffset: _l,
            strokeLinecap: "round",
            className: "transition-all duration-500 ease-linear"
          }
        )
      ] }),
      /* @__PURE__ */ g.jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
        /* @__PURE__ */ g.jsx("span", { className: "tabular-nums leading-none transition-colors duration-300", style: {
          fontSize: "26px",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: A ? "var(--text-muted, #475569)" : "var(--text-primary)"
        }, children: Br(A ? 1500 : r.remaining_seconds) }),
        /* @__PURE__ */ g.jsx("span", { className: "mt-1 text-[8px] font-bold uppercase tracking-[0.12em] transition-colors", style: { color: Rl }, children: X ? "focusing" : M ? "break" : v ? "paused" : "ready" })
      ] })
    ] }),
    /* @__PURE__ */ g.jsxs("div", { className: "flex-1 min-w-0 flex flex-col gap-2.5", children: [
      hl ? /* @__PURE__ */ g.jsxs("div", { children: [
        /* @__PURE__ */ g.jsx("div", { className: "text-[12px] font-bold text-[var(--text-primary)] truncate", children: hl.title }),
        hl.description && /* @__PURE__ */ g.jsx("div", { className: "text-[10px] text-[var(--text-muted)] mt-0.5 truncate", children: hl.description })
      ] }) : /* @__PURE__ */ g.jsx("div", { className: "text-[11px] text-[var(--text-muted)]", children: _ ? "Free focus session" : "Select a task or start a free session" }),
      /* @__PURE__ */ g.jsxs("div", { className: "flex gap-2 flex-wrap", children: [
        A && /* @__PURE__ */ g.jsx(
          "button",
          {
            className: `${jl} border-none bg-[var(--surface-ink-solid)] text-white shadow-[0_2px_12px_-2px_rgba(99,102,241,0.3)] hover:brightness-110 active:scale-[0.97]`,
            onClick: () => {
              H("", 25, 5);
            },
            children: "Start Session"
          }
        ),
        X && /* @__PURE__ */ g.jsxs(g.Fragment, { children: [
          /* @__PURE__ */ g.jsx(
            "button",
            {
              className: `${jl} bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`,
              onClick: () => {
                C();
              },
              children: "Pause"
            }
          ),
          /* @__PURE__ */ g.jsx(
            "button",
            {
              className: `${jl} bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.18)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)]`,
              onClick: () => {
                R();
              },
              children: "Stop"
            }
          )
        ] }),
        v && /* @__PURE__ */ g.jsxs(g.Fragment, { children: [
          /* @__PURE__ */ g.jsx(
            "button",
            {
              className: `${jl} border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110`,
              onClick: () => {
                m();
              },
              children: "Resume"
            }
          ),
          /* @__PURE__ */ g.jsx(
            "button",
            {
              className: `${jl} bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.18)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)]`,
              onClick: () => {
                R();
              },
              children: "Stop"
            }
          )
        ] }),
        M && /* @__PURE__ */ g.jsx(
          "button",
          {
            className: `${jl} bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`,
            onClick: () => {
              Z();
            },
            children: "Skip Break"
          }
        )
      ] })
    ] })
  ] });
}
function Ov({ tasks: r }) {
  const H = r.reduce((R, Z) => R + Z.pomodoros_done, 0), C = r.reduce((R, Z) => R + Math.floor(Z.elapsed_seconds / 60), 0), m = r.filter((R) => R.completed).length;
  return r.length === 0 ? null : /* @__PURE__ */ g.jsxs("div", { className: "flex gap-4 text-[11px] tabular-nums", children: [
    /* @__PURE__ */ g.jsxs("span", { className: "flex items-center gap-1.5 text-[var(--text-muted)]", children: [
      /* @__PURE__ */ g.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-[var(--surface-ink-solid)] opacity-70" }),
      /* @__PURE__ */ g.jsx("strong", { className: "text-[var(--text-primary)]", children: H }),
      " sessions"
    ] }),
    /* @__PURE__ */ g.jsxs("span", { className: "flex items-center gap-1.5 text-[var(--text-muted)]", children: [
      /* @__PURE__ */ g.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-[#f59e0b] opacity-70" }),
      /* @__PURE__ */ g.jsx("strong", { className: "text-[var(--text-primary)]", children: Jn(C) }),
      " focused"
    ] }),
    /* @__PURE__ */ g.jsxs("span", { className: "flex items-center gap-1.5 text-[var(--text-muted)]", children: [
      /* @__PURE__ */ g.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-[#34d399] opacity-70" }),
      /* @__PURE__ */ g.jsxs("strong", { className: "text-[var(--text-primary)]", children: [
        m,
        "/",
        r.length
      ] }),
      " done"
    ] })
  ] });
}
function Ur({ task: r, isActive: H, isCurrent: C, onStart: m, onComplete: R, onDelete: Z }) {
  const [V, X] = el.useState(!1), M = qr(r);
  return /* @__PURE__ */ g.jsxs(
    "div",
    {
      onMouseEnter: () => X(!0),
      onMouseLeave: () => X(!1),
      className: [
        "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-100",
        r.completed ? "opacity-40 border-transparent" : C ? "border-[var(--surface-ink-solid)] bg-[rgba(99,102,241,0.05)]" : V ? "border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]" : "border-transparent bg-transparent hover:bg-[var(--glass-bg)]"
      ].join(" "),
      children: [
        /* @__PURE__ */ g.jsx(
          "button",
          {
            onClick: () => !r.completed && R(),
            className: [
              "w-[16px] h-[16px] rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0 cursor-pointer transition-all bg-transparent",
              r.completed ? "bg-[#34d399] border-[#34d399]" : V ? "border-[var(--text-muted)] hover:border-[var(--surface-ink-solid)]" : "border-[var(--glass-border-strong)]"
            ].join(" "),
            children: r.completed && /* @__PURE__ */ g.jsx("svg", { className: "w-2 h-2 text-white", fill: "none", stroke: "currentColor", strokeWidth: 3.5, viewBox: "0 0 24 24", children: /* @__PURE__ */ g.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) })
          }
        ),
        /* @__PURE__ */ g.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ g.jsxs("div", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ g.jsx("span", { className: [
              "text-[12px] font-semibold truncate",
              r.completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
            ].join(" "), children: r.title }),
            C && /* @__PURE__ */ g.jsx("span", { className: "flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--surface-ink-solid)] animate-pulse" })
          ] }),
          r.description && !r.completed && /* @__PURE__ */ g.jsx("p", { className: "text-[10px] text-[var(--text-muted)] mt-0.5 truncate m-0", children: r.description })
        ] }),
        !r.completed && /* @__PURE__ */ g.jsxs("div", { className: "flex items-center gap-2.5 flex-shrink-0", children: [
          M > 0 && (() => {
            const Y = 2 * Math.PI * 8, B = Y * (1 - M / 100);
            return /* @__PURE__ */ g.jsxs("svg", { width: 20, height: 20, className: "-rotate-90", children: [
              /* @__PURE__ */ g.jsx("circle", { cx: 20 / 2, cy: 20 / 2, r: 8, fill: "none", stroke: "var(--glass-bg-strong)", strokeWidth: 2 }),
              /* @__PURE__ */ g.jsx(
                "circle",
                {
                  cx: 20 / 2,
                  cy: 20 / 2,
                  r: 8,
                  fill: "none",
                  stroke: M >= 100 ? "#34d399" : "var(--surface-ink-solid)",
                  strokeWidth: 2,
                  strokeDasharray: Y,
                  strokeDashoffset: B,
                  strokeLinecap: "round"
                }
              )
            ] });
          })(),
          /* @__PURE__ */ g.jsx("span", { className: "text-[10px] font-bold text-[var(--text-muted)] tabular-nums w-8 text-right", children: Jn(r.estimated_minutes) })
        ] }),
        V && !r.completed && /* @__PURE__ */ g.jsxs("div", { className: "flex gap-1 flex-shrink-0", children: [
          !H && /* @__PURE__ */ g.jsx(
            "button",
            {
              onClick: (v) => {
                v.stopPropagation(), m();
              },
              className: "w-6 h-6 flex items-center justify-center rounded-md cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 transition-all",
              title: "Start timer",
              children: /* @__PURE__ */ g.jsx("svg", { className: "w-2.5 h-2.5", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ g.jsx("path", { d: "M8 5v14l11-7z" }) })
            }
          ),
          /* @__PURE__ */ g.jsx(
            "button",
            {
              onClick: (v) => {
                v.stopPropagation(), Z();
              },
              className: "w-6 h-6 flex items-center justify-center rounded-md cursor-pointer border border-[rgba(239,68,68,0.15)] bg-transparent text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] transition-all",
              title: "Remove",
              children: /* @__PURE__ */ g.jsx("svg", { className: "w-2.5 h-2.5", fill: "none", stroke: "currentColor", strokeWidth: 2.5, viewBox: "0 0 24 24", children: /* @__PURE__ */ g.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18L18 6M6 6l12 12" }) })
            }
          )
        ] })
      ]
    }
  );
}
function Dv({ onAdd: r }) {
  return /* @__PURE__ */ g.jsxs("div", { className: "flex flex-col items-center py-10 text-center", children: [
    /* @__PURE__ */ g.jsx("div", { className: "w-12 h-12 rounded-2xl bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)] flex items-center justify-center mb-3", children: /* @__PURE__ */ g.jsx("svg", { className: "w-5 h-5 text-[var(--text-muted)]", fill: "none", stroke: "currentColor", strokeWidth: 1.5, viewBox: "0 0 24 24", children: /* @__PURE__ */ g.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" }) }) }),
    /* @__PURE__ */ g.jsx("h3", { className: "text-[13px] font-bold text-[var(--text-primary)] mb-1", children: "No tasks yet" }),
    /* @__PURE__ */ g.jsx("p", { className: "text-[11px] text-[var(--text-muted)] max-w-[220px] leading-relaxed mb-4", children: "Add study tasks or ask the AI — it will estimate time for you." }),
    /* @__PURE__ */ g.jsx(
      "button",
      {
        onClick: r,
        className: "px-4 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.97] transition-all",
        children: "+ Add Task"
      }
    )
  ] });
}
function jv() {
  const { tasks: r, completeTask: H, deleteTask: C } = _u(), { timer: m, start: R } = Kn(), [Z, V] = el.useState(!1), [X, M] = el.useState(!1), v = m.status !== "idle", A = el.useMemo(() => r.filter((B) => !B.completed), [r]), _ = el.useMemo(() => r.filter((B) => B.completed), [r]), Y = (B) => {
    const hl = r.find((nl) => nl.id === B);
    hl && R(B, Math.min(hl.estimated_minutes, 90) || 25, 5);
  };
  return /* @__PURE__ */ g.jsxs("div", { className: "flex flex-col flex-1 min-h-0 overflow-hidden bg-[var(--surface-bg)] text-[var(--text-primary)]", style: { fontFamily: "inherit" }, children: [
    /* @__PURE__ */ g.jsx("div", { className: "flex-1 overflow-y-auto", style: { scrollbarWidth: "thin" }, children: /* @__PURE__ */ g.jsxs("div", { className: "mx-auto max-w-[560px] px-5 py-5 flex flex-col gap-5", children: [
      /* @__PURE__ */ g.jsx(Nv, {}),
      /* @__PURE__ */ g.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ g.jsx(Ov, { tasks: r }),
        /* @__PURE__ */ g.jsxs(
          "button",
          {
            onClick: () => V(!0),
            className: "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.97] transition-all flex-shrink-0",
            children: [
              /* @__PURE__ */ g.jsx("svg", { className: "w-2.5 h-2.5", fill: "none", stroke: "currentColor", strokeWidth: 2.5, viewBox: "0 0 24 24", children: /* @__PURE__ */ g.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 4v16m8-8H4" }) }),
              "Add"
            ]
          }
        )
      ] }),
      A.length === 0 && !X ? /* @__PURE__ */ g.jsx(Dv, { onAdd: () => V(!0) }) : /* @__PURE__ */ g.jsx("div", { className: "flex flex-col gap-0.5", children: A.map((B) => /* @__PURE__ */ g.jsx(
        Ur,
        {
          task: B,
          isActive: v,
          isCurrent: m.task_id === B.id && v,
          onStart: () => Y(B.id),
          onComplete: () => {
            H(B.id);
          },
          onDelete: () => {
            C(B.id);
          }
        },
        B.id
      )) }),
      _.length > 0 && /* @__PURE__ */ g.jsxs("div", { children: [
        /* @__PURE__ */ g.jsxs(
          "button",
          {
            onClick: () => M(!X),
            className: "flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] cursor-pointer bg-transparent border-none hover:text-[var(--text-secondary)] transition-colors mb-1",
            children: [
              /* @__PURE__ */ g.jsx(
                "svg",
                {
                  className: `w-2.5 h-2.5 transition-transform ${X ? "rotate-90" : ""}`,
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: 2.5,
                  viewBox: "0 0 24 24",
                  children: /* @__PURE__ */ g.jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5l7 7-7 7" })
                }
              ),
              _.length,
              " completed"
            ]
          }
        ),
        X && /* @__PURE__ */ g.jsx("div", { className: "flex flex-col gap-0.5", children: _.map((B) => /* @__PURE__ */ g.jsx(
          Ur,
          {
            task: B,
            isActive: v,
            isCurrent: !1,
            onStart: () => {
            },
            onComplete: () => {
            },
            onDelete: () => {
              C(B.id);
            }
          },
          B.id
        )) })
      ] })
    ] }) }),
    Z && /* @__PURE__ */ g.jsx(Yr, { onClose: () => V(!1) })
  ] });
}
class Gr extends HTMLElement {
  root = null;
  connectedCallback() {
    this.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;width:100%;", this.root = bv.createRoot(this), this.renderApp();
  }
  disconnectedCallback() {
    this.root?.unmount(), this.root = null;
  }
  renderApp() {
  }
}
class Uv extends Gr {
  renderApp() {
    this.root?.render(/* @__PURE__ */ g.jsx(Mv, {}));
  }
}
class Cv extends Gr {
  renderApp() {
    this.root?.render(/* @__PURE__ */ g.jsx(jv, {}));
  }
}
customElements.get("khadim-pomodoro-sidebar") || customElements.define("khadim-pomodoro-sidebar", Uv);
customElements.get("khadim-pomodoro-content") || customElements.define("khadim-pomodoro-content", Cv);
