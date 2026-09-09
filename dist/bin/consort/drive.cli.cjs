#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl, importMetaUrl;
var init_cjs_shims = __esm({
  "node_modules/tsup/assets/cjs_shims.js"() {
    "use strict";
    getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
    importMetaUrl = /* @__PURE__ */ getImportMetaUrl();
  }
});

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.regexpCode = exports2.getEsmExportName = exports2.getProperty = exports2.safeStringify = exports2.stringify = exports2.strConcat = exports2.addCodeArg = exports2.str = exports2._ = exports2.nil = exports2._Code = exports2.Name = exports2.IDENTIFIER = exports2._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports2._CodeOrName = _CodeOrName;
    exports2.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports2.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports2.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports2._Code = _Code;
    exports2.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports2._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports2.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports2.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports2.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports2.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports2.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports2.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports2.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports2.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports2.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports2.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ValueScope = exports2.ValueScopeName = exports2.Scope = exports2.varKinds = exports2.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports2.UsedValueState = UsedValueState = {}));
    exports2.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports2.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports2.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports2.varKinds.var : exports2.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports2.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.or = exports2.and = exports2.not = exports2.CodeGen = exports2.operators = exports2.varKinds = exports2.ValueScopeName = exports2.ValueScope = exports2.Scope = exports2.Name = exports2.regexpCode = exports2.stringify = exports2.getProperty = exports2.nil = exports2.strConcat = exports2.str = exports2._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports2, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports2, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports2, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports2, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports2, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports2, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports2, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports2.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports2.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports2.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports2.not = not;
    var andCode = mappend(exports2.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports2.and = and;
    var orCode = mappend(exports2.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports2.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.checkStrictMode = exports2.getErrorPath = exports2.Type = exports2.useFunc = exports2.setEvaluated = exports2.evaluatedPropsToName = exports2.mergeEvaluated = exports2.eachItem = exports2.unescapeJsonPointer = exports2.escapeJsonPointer = exports2.escapeFragment = exports2.unescapeFragment = exports2.schemaRefOrVal = exports2.schemaHasRulesButRef = exports2.schemaHasRules = exports2.checkUnknownRules = exports2.alwaysValidSchema = exports2.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports2.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports2.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports2.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports2.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports2.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports2.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports2.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports2.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports2.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports2.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports2.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports2.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports2.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports2.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports2.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports2.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports2.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports2.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports2.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extendErrors = exports2.resetErrorsCount = exports2.reportExtraError = exports2.reportError = exports2.keyword$DataError = exports2.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports2.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports2.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports2.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports2.reportError = reportError;
    function reportExtraError(cxt, error = exports2.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports2.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports2.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports2.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.boolOrEmptySchema = exports2.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports2.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports2.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getRules = exports2.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports2.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports2.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.shouldUseRule = exports2.shouldUseGroup = exports2.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports2.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports2.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports2.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.reportTypeError = exports2.checkDataTypes = exports2.checkDataType = exports2.coerceAndCheckDataType = exports2.getJSONTypes = exports2.getSchemaTypes = exports2.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports2.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports2.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports2.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports2.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports2.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports2.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports2.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports2.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateUnion = exports2.validateArray = exports2.usePattern = exports2.callValidateCode = exports2.schemaProperties = exports2.allSchemaProperties = exports2.noPropertyInData = exports2.propertyInData = exports2.isOwnProperty = exports2.hasPropFunc = exports2.reportMissingProp = exports2.checkMissingProp = exports2.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports2.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports2.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports2.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports2.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports2.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports2.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports2.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports2.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports2.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports2.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports2.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports2.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports2.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateKeywordUsage = exports2.validSchemaType = exports2.funcKeywordCode = exports2.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports2.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports2.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports2.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports2.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extendSubschemaMode = exports2.extendSubschemaData = exports2.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports2.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports2.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports2.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    module2.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var traverse = module2.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getSchemaRefs = exports2.resolveUrl = exports2.normalizeId = exports2._getFullPath = exports2.getFullPath = exports2.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports2.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize) {
      if (normalize !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports2.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports2._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports2.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports2.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports2.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getData = exports2.KeywordCxt = exports2.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports2.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports2.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports2.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports2.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports2.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveSchema = exports2.getCompilingSchema = exports2.resolveRef = exports2.compileSchema = exports2.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports2.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports2.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve3.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports2.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports2.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve3(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports2.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports2, module2) {
    module2.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function consumeIsZone(buffer) {
      buffer.length = 0;
      return true;
    }
    function consumeHextets(buffer, address, output) {
      if (buffer.length) {
        const hex = stringArrayToHexStripped(buffer);
        if (hex !== "") {
          address.push(hex);
        } else {
          output.error = true;
          return false;
        }
        buffer.length = 0;
      }
      return true;
    }
    function getIPV6(input) {
      let tokenCount = 0;
      const output = { error: false, address: "", zone: "" };
      const address = [];
      const buffer = [];
      let endipv6Encountered = false;
      let endIpv6 = false;
      let consume = consumeHextets;
      for (let i = 0; i < input.length; i++) {
        const cursor = input[i];
        if (cursor === "[" || cursor === "]") {
          continue;
        }
        if (cursor === ":") {
          if (endipv6Encountered === true) {
            endIpv6 = true;
          }
          if (!consume(buffer, address, output)) {
            break;
          }
          if (++tokenCount > 7) {
            output.error = true;
            break;
          }
          if (i > 0 && input[i - 1] === ":") {
            endipv6Encountered = true;
          }
          address.push(":");
          continue;
        } else if (cursor === "%") {
          if (!consume(buffer, address, output)) {
            break;
          }
          consume = consumeIsZone;
        } else {
          buffer.push(cursor);
          continue;
        }
      }
      if (buffer.length) {
        if (consume === consumeIsZone) {
          output.zone = buffer.join("");
        } else if (endIpv6) {
          address.push(buffer.join(""));
        } else {
          address.push(stringArrayToHexStripped(buffer));
        }
      }
      output.address = address.join("");
      return output;
    }
    function normalizeIPv6(host) {
      if (findToken(host, ":") < 2) {
        return { host, isIPV6: false };
      }
      const ipv6 = getIPV6(host);
      if (!ipv6.error) {
        let newHost = ipv6.address;
        let escapedHost = ipv6.address;
        if (ipv6.zone) {
          newHost += "%" + ipv6.zone;
          escapedHost += "%25" + ipv6.zone;
        }
        return { host: newHost, isIPV6: true, escapedHost };
      } else {
        return { host, isIPV6: false };
      }
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path14) {
      let input = path14;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(input[i])) {
          output += input[i];
        } else {
          output += escape(input[i]);
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(component.userinfo);
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = unescape(component.host);
        if (!isIPv4(host)) {
          const ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module2.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var { isUUID } = require_utils();
    var URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const [path14, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path14 && path14 !== "/" ? path14 : void 0;
        wsComponent.query = query;
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module2.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    function normalize(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve3(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const resolved = resolveComponent(parse(baseURI, schemelessOptions), parse(relativeURI, schemelessOptions), schemelessOptions, true);
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative7, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative7 = parse(serialize(relative7, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative7.scheme) {
        target.scheme = relative7.scheme;
        target.userinfo = relative7.userinfo;
        target.host = relative7.host;
        target.port = relative7.port;
        target.path = removeDotSegments(relative7.path || "");
        target.query = relative7.query;
      } else {
        if (relative7.userinfo !== void 0 || relative7.host !== void 0 || relative7.port !== void 0) {
          target.userinfo = relative7.userinfo;
          target.host = relative7.host;
          target.port = relative7.port;
          target.path = removeDotSegments(relative7.path || "");
          target.query = relative7.query;
        } else {
          if (!relative7.path) {
            target.path = base.path;
            if (relative7.query !== void 0) {
              target.query = relative7.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative7.path[0] === "/") {
              target.path = removeDotSegments(relative7.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative7.path;
              } else if (!base.path) {
                target.path = relative7.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative7.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative7.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative7.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA.toLowerCase() === normalizedB.toLowerCase();
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = escapePreservingEscapes(component.path);
          if (component.scheme !== void 0) {
            component.path = component.path.split("%3A").join(":");
          }
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", component.query);
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", component.fragment);
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const ipv6result = normalizeIPv6(parsed.host);
            parsed.host = ipv6result.host.toLowerCase();
            isIP = ipv6result.isIPV6;
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
          if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
            try {
              parsed.host = URL.domainToASCII(parsed.host.toLowerCase());
            } catch (e) {
              parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
            }
          }
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.scheme !== void 0) {
              parsed.scheme = unescape(parsed.scheme);
            }
            if (parsed.host !== void 0) {
              parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
            }
          }
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.fragment) {
            try {
              parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
            } catch {
              parsed.error = parsed.error || "URI malformed";
            }
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri === "string") {
        const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri, opts);
        return malformedAuthorityOrPort ? void 0 : normalized;
      }
      if (typeof uri === "object") {
        return serialize(uri, opts);
      }
    }
    var fastUri = {
      SCHEMES,
      normalize,
      resolve: resolve3,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module2.exports = fastUri;
    module2.exports.default = fastUri;
    module2.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports2.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv2 = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema: loadSchema2 } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema2(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv2.ValidationError = validation_error_1.default;
    Ajv2.MissingRefError = ref_error_1.default;
    exports2.default = Ajv2;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.callRef = exports2.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports2.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports2.callRef = callRef;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports2.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports2.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports2.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports2.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports2.validateAdditionalItems = validateAdditionalItems;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports2.validateTuple = validateTuple;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateSchemaDeps = exports2.validatePropertyDeps = exports2.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports2.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports2.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports2.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports2.validateSchemaDeps = validateSchemaDeps;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports2.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports2.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.contentVocabulary = exports2.metadataVocabulary = void 0;
    exports2.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports2.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft7.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft7Vocabularies = [
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary
    ];
    exports2.default = draft7Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports2.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports2, module2) {
    module2.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS({
  "node_modules/ajv/dist/ajv.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MissingRefError = exports2.ValidationError = exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = exports2.Ajv = void 0;
    var core_1 = require_core();
    var draft7_1 = require_draft7();
    var discriminator_1 = require_discriminator();
    var draft7MetaSchema = require_json_schema_draft_07();
    var META_SUPPORT_DATA = ["/properties"];
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var Ajv2 = class extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports2.Ajv = Ajv2;
    module2.exports = exports2 = Ajv2;
    module2.exports.Ajv = Ajv2;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = Ajv2;
    var validate_1 = require_validate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports2, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports2, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// bin/consort/drive.cli.ts
var drive_cli_exports = {};
__export(drive_cli_exports, {
  composeInputPause: () => composeInputPause
});
module.exports = __toCommonJS(drive_cli_exports);
init_cjs_shims();

// consort/config/consort-env.ts
init_cjs_shims();
var ENV_PREFIXES = ["LAKEBASE_CONSORT_", "LAKEBASE_SFTDD_", "LAKEBASE_TDD_"];
var ENV_PREFIX = ENV_PREFIXES[0];
var LEGACY_REMOVAL_VERSION = "v0.4.0";
var warnedLegacyEnv = /* @__PURE__ */ new Set();
function consortEnv(suffix, env = process.env) {
  for (let i = 0; i < ENV_PREFIXES.length; i++) {
    const name = `${ENV_PREFIXES[i]}${suffix}`;
    const v = env[name];
    if (v !== void 0) {
      if (i > 0) warnLegacyEnv(name, suffix);
      return v;
    }
  }
  return void 0;
}
function warnLegacyEnv(legacyName, suffix) {
  if (warnedLegacyEnv.has(legacyName)) return;
  warnedLegacyEnv.add(legacyName);
  try {
    process.stderr.write(
      `[deprecated] ${legacyName} is a legacy sftdd/tdd-era env name; use ${ENV_PREFIX}${suffix} instead (removed in consort ${LEGACY_REMOVAL_VERSION}). Still honored for now.
`
    );
  } catch {
  }
}

// consort/config/consort-paths.ts
init_cjs_shims();
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var LEGACY_ARTIFACT_ROOT = ".sftdd";
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
var artifactRootsRegexAlternation = () => ALL_ARTIFACT_ROOTS.map((r) => r.replace(/[.]/g, "\\.")).join("|");
function resolveConsortDir(projectDir = process.cwd()) {
  const next = (0, import_node_path.join)(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = (0, import_node_path.join)(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var planningDir = (tdd) => (0, import_node_path.join)(tdd, "planning");
var sprintsDir = (tdd) => (0, import_node_path.join)(tdd, "sprints");
var cyclesRootDir = (tdd) => (0, import_node_path.join)(tdd, "cycles");
var experimentsRootDir = (tdd) => (0, import_node_path.join)(tdd, "experiments");
var escalationsDir = (tdd) => (0, import_node_path.join)(tdd, "escalations");
var escalationFile = (tdd, id) => (0, import_node_path.join)(escalationsDir(tdd), `${id}.json`);
var acReviewJson = (tdd, f, s, ac) => (0, import_node_path.join)(cyclesRootDir(tdd), f, s, ac, "review.json");
var storyReviewJson = (tdd, f, s) => (0, import_node_path.join)(cyclesRootDir(tdd), f, s, "review.json");
var workflowStateJson = (tdd) => (0, import_node_path.join)(tdd, "workflow-state.json");
var productOverviewMd = (tdd) => (0, import_node_path.join)(tdd, "product-overview.md");
var nfrsMd = (tdd) => (0, import_node_path.join)(tdd, "nfrs.md");
var intakeReadyOnDisk = (tdd) => fs.existsSync(productOverviewMd(tdd)) && fs.existsSync(nfrsMd(tdd));
var intakeApprovedMarker = (tdd) => (0, import_node_path.join)(tdd, "intake", "approved");
var intakeApprovedOnDisk = (tdd) => fs.existsSync(intakeApprovedMarker(tdd));
var designDir = (tdd) => (0, import_node_path.join)(tdd, "design");
var designGuideJson = (tdd) => (0, import_node_path.join)(designDir(tdd), "design-guide.json");
var architectureDir = (tdd) => (0, import_node_path.join)(tdd, "architecture");
var architectureConventionsJson = (tdd) => (0, import_node_path.join)(architectureDir(tdd), "conventions.json");
var architectureCanonJson = (tdd) => (0, import_node_path.join)(architectureDir(tdd), "canon.json");
var featureProposalsMd = (tdd) => (0, import_node_path.join)(planningDir(tdd), "feature-proposals.md");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-spec.json");
var featureRequestMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-request.md");
var architectureJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "architecture.json");
var dbDesignJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "db-design.json");
var featureTestListJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "test-list.json");
var pipelineJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "pipeline.json");
var featureDeployEvidenceJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "deploy-evidence.json");
var storiesDir = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => (0, import_node_path.join)(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "acs");
var acJson = (tdd, f, s, ac) => (0, import_node_path.join)(acsDir(tdd, f, s), `${ac}.json`);
var storyTestListJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "test-list-per-story.json");
var reflectVerdictJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "reflect-verdict.json");
var handbackFile = (tdd, f, role, story) => (0, import_node_path.join)(featureDir(tdd, f), ".handback", `${role}${story ? `.${story}` : ""}.md`);
var cycleDir = (tdd, f, s, ac) => (0, import_node_path.join)(cyclesRootDir(tdd), f, s, ac);
var sprintDir = (tdd, sprint) => (0, import_node_path.join)(sprintsDir(tdd), sprint);
var sprintGatesJson = (tdd, sprint) => (0, import_node_path.join)(sprintDir(tdd, sprint), "gates.json");
var backlogJson = (tdd, sprint) => (0, import_node_path.join)(sprintDir(tdd, sprint), "backlog.json");
var sprintRequestedJson = (tdd, sprint) => (0, import_node_path.join)(sprintDir(tdd, sprint), "requested.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
function requireFeatureDir(tdd, featureId) {
  const dir = findFeatureDir(tdd, featureId);
  if (!dir) throw new Error(`feature ${featureId} not found (or ambiguous) under ${featuresDir(tdd)}`);
  return dir;
}
function storyAcIds(tdd, f, s) {
  const ids = /* @__PURE__ */ new Set();
  const sj = storyJson(tdd, f, s);
  if (fs.existsSync(sj)) {
    try {
      const data = JSON.parse(fs.readFileSync(sj, "utf8"));
      if (Array.isArray(data.acs)) {
        for (const a of data.acs) {
          const id = typeof a === "string" ? a : a?.id;
          if (typeof id === "string" && id.length > 0) ids.add(id);
        }
      }
    } catch {
    }
  }
  const dir = acsDir(tdd, f, s);
  if (fs.existsSync(dir)) {
    try {
      for (const file of fs.readdirSync(dir)) {
        const m = /^(.+)\.json$/.exec(file);
        if (!m) continue;
        const base = m[1];
        try {
          const obj = JSON.parse(fs.readFileSync((0, import_node_path.join)(dir, file), "utf8"));
          if (obj && typeof obj.id === "string" && obj.id === base) ids.add(base);
        } catch {
        }
      }
    } catch {
    }
  }
  return [...ids];
}
function readAcLayer(tdd, f, acId) {
  const stories = storiesDir(tdd, f);
  if (!fs.existsSync(stories)) return void 0;
  for (const s of fs.readdirSync(stories)) {
    const file = acJson(tdd, f, s, acId);
    if (!fs.existsSync(file)) continue;
    try {
      const ac = JSON.parse(fs.readFileSync(file, "utf8"));
      if (ac.layer === "API" || ac.layer === "E2E" || ac.layer === "Infra") return ac.layer;
    } catch {
    }
  }
  return void 0;
}
function readAcArchitecturalNotes(tdd, f, acId) {
  const stories = storiesDir(tdd, f);
  if (!fs.existsSync(stories)) return void 0;
  for (const s of fs.readdirSync(stories)) {
    const file = acJson(tdd, f, s, acId);
    if (!fs.existsSync(file)) continue;
    try {
      const ac = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof ac.architectural_notes === "string" && ac.architectural_notes.trim().length > 0) {
        return ac.architectural_notes;
      }
    } catch {
    }
  }
  return void 0;
}
var hasFeatureRequest = (tdd, f) => fs.existsSync(featureRequestMd(tdd, f));
var TSHIRT_SIZES = /* @__PURE__ */ new Set(["XS", "S", "M", "L", "XL"]);
var isTshirtSize = (x) => typeof x === "string" && TSHIRT_SIZES.has(x);
var planningEstimatesJson = (tdd) => (0, import_node_path.join)(planningDir(tdd), "estimates.json");
function readEstimates(tdd) {
  const file = planningEstimatesJson(tdd);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(data.estimates)) return [];
    return data.estimates.flatMap((e) => {
      const id = e?.feature_id;
      const size = e?.size;
      if (typeof id !== "string" || !id || !isTshirtSize(size)) return [];
      const rationale = e?.rationale;
      return [{ feature_id: id, size, ...typeof rationale === "string" ? { rationale } : {} }];
    });
  } catch {
    return [];
  }
}
var hasEstimates = (tdd) => readEstimates(tdd).length > 0;
var backlogFeatureIds = (b) => b.features.map((f) => f.id);
function readBacklog(tdd, sprint) {
  const file = backlogJson(tdd, sprint);
  if (!fs.existsSync(file)) return { sprint, features: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const features = Array.isArray(data.features) ? data.features.flatMap((x) => {
      if (typeof x === "string" && x.length > 0) return [{ id: x }];
      const id = x?.id;
      if (typeof id !== "string" || !id) return [];
      const size = x?.size;
      return [{ id, ...isTshirtSize(size) ? { size } : {} }];
    }) : [];
    return { sprint, features };
  } catch {
    return { sprint, features: [] };
  }
}
function writeBacklog(tdd, backlog) {
  fs.mkdirSync(sprintDir(tdd, backlog.sprint), { recursive: true });
  fs.writeFileSync(backlogJson(tdd, backlog.sprint), JSON.stringify(backlog, null, 2) + "\n", "utf8");
}
function readRequested(tdd, sprint) {
  const file = sprintRequestedJson(tdd, sprint);
  if (!fs.existsSync(file)) return void 0;
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function syncBacklog(tdd, sprint) {
  const sizeOf = new Map(readEstimates(tdd).map((e) => [e.feature_id, e.size]));
  const root = featuresDir(tdd);
  const requested = readRequested(tdd, sprint);
  const scope = requested ? new Set(requested) : void 0;
  const committed = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => {
    try {
      if (!fs.statSync((0, import_node_path.join)(root, d)).isDirectory()) return false;
      if (!fs.existsSync((0, import_node_path.join)(root, d, "feature-request.md"))) return false;
      return scope ? scope.has(d) : true;
    } catch {
      return false;
    }
  }).sort() : [];
  const features = committed.map((id) => {
    const size = sizeOf.get(id);
    return { id, ...size ? { size } : {} };
  });
  const backlog = { sprint, features };
  writeBacklog(tdd, backlog);
  return backlog;
}

// consort/config/migrate-artifact-dir.ts
init_cjs_shims();
var import_node_child_process = require("child_process");
var fs2 = __toESM(require("fs"), 1);
var import_node_path2 = require("path");
function isGitRepo(projectDir) {
  return fs2.existsSync((0, import_node_path2.join)(projectDir, ".git"));
}
function rewriteGitignore(projectDir) {
  const gi = (0, import_node_path2.join)(projectDir, ".gitignore");
  if (!fs2.existsSync(gi)) return;
  const before = fs2.readFileSync(gi, "utf8");
  let after = before;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    after = after.replace(
      new RegExp(`(^|\\s)${legacyName.replace(".", "\\.")}/`, "gm"),
      `$1${ARTIFACT_ROOT}/`
    );
  }
  if (after !== before) fs2.writeFileSync(gi, after);
}
function migrateLegacyArtifactDir(projectDir = process.cwd()) {
  const next = (0, import_node_path2.join)(projectDir, ARTIFACT_ROOT);
  if (fs2.existsSync(next)) return { migrated: false, root: next };
  const legacyName = LEGACY_ARTIFACT_ROOTS.find((name) => fs2.existsSync((0, import_node_path2.join)(projectDir, name)));
  if (!legacyName) return { migrated: false, root: next };
  const legacy = (0, import_node_path2.join)(projectDir, legacyName);
  if (isGitRepo(projectDir)) {
    try {
      (0, import_node_child_process.execFileSync)("git", ["mv", legacyName, ARTIFACT_ROOT], {
        cwd: projectDir,
        stdio: "ignore"
      });
      rewriteGitignore(projectDir);
      return { migrated: true, root: next, via: "git" };
    } catch {
    }
  }
  fs2.renameSync(legacy, next);
  rewriteGitignore(projectDir);
  return { migrated: true, root: next, via: "fs" };
}

// bin/consort/drive.cli.ts
var fs22 = __toESM(require("fs"), 1);
var path13 = __toESM(require("path"), 1);

// consort/session/relaunch-detached.ts
init_cjs_shims();
var import_node_child_process2 = require("child_process");
function relaunchDetached(childArgs, opts = {}) {
  try {
    const child = (0, import_node_child_process2.spawn)(process.execPath, [process.argv[1], ...childArgs], {
      detached: true,
      // setsid(2): new session + process group, escapes the caller's group-SIGTERM
      stdio: opts.stdio ?? "ignore",
      env: opts.env ?? process.env
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}

// bin/consort/drive.cli.ts
var readline2 = __toESM(require("readline"), 1);

// consort/logging/turn-recorder.ts
init_cjs_shims();
var import_node_crypto = require("crypto");
var import_node_fs = require("fs");
var import_node_path3 = require("path");

// consort/logging/replay-build.ts
init_cjs_shims();
var import_fs = require("fs");
var import_path = require("path");
var SCAFFOLD_OWNED = /* @__PURE__ */ new Set([
  ".git",
  ...ALL_ARTIFACT_ROOTS,
  ".lakebase",
  "scripts",
  ".claude",
  ".github",
  "node_modules"
]);
var JUNK_DIRS = /* @__PURE__ */ new Set([
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".git",
  "node_modules"
]);
var JUNK_FILES = /* @__PURE__ */ new Set([
  ".env",
  ".DS_Store",
  "Makefile",
  "deploy-targets.yaml",
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml"
]);
function codeTreeFilter(root) {
  return (src) => {
    const rel = src.slice(root.length).replace(/^[/\\]+/, "");
    if (rel === "") return true;
    const segs = rel.split(/[/\\]/);
    if (SCAFFOLD_OWNED.has(segs[0])) return false;
    if (segs.some((s) => JUNK_DIRS.has(s))) return false;
    const base = segs[segs.length - 1];
    return !(JUNK_FILES.has(base) || base.endsWith(".pyc"));
  };
}
function inScopeFiles(root) {
  const keep = codeTreeFilter(root);
  const out = /* @__PURE__ */ new Set();
  const walk2 = (abs) => {
    for (const name of (0, import_fs.readdirSync)(abs)) {
      const p = (0, import_path.join)(abs, name);
      if (!keep(p)) continue;
      if ((0, import_fs.statSync)(p).isDirectory()) walk2(p);
      else out.add((0, import_path.relative)(root, p));
    }
  };
  if ((0, import_fs.existsSync)(root)) walk2(root);
  return out;
}
function syncTreeFromSnapshot(codeSrc, projectDir) {
  const snapshot = inScopeFiles(codeSrc);
  for (const rel of inScopeFiles(projectDir)) {
    if (!snapshot.has(rel)) (0, import_fs.rmSync)((0, import_path.join)(projectDir, rel), { force: true });
  }
  (0, import_fs.cpSync)(codeSrc, projectDir, { recursive: true, force: true, filter: codeTreeFilter(codeSrc) });
}
function storyTurnsDir(replayBuildDir, featureId, story) {
  return (0, import_path.join)(featuresDir(replayBuildDir), featureId, "stories", story, "turns");
}
function listBuildTurns(replayBuildDir, featureId, story) {
  const dir = storyTurnsDir(replayBuildDir, featureId, story);
  if (!(0, import_fs.existsSync)(dir)) return [];
  return (0, import_fs.readdirSync)(dir).filter((n) => !n.startsWith(".")).sort();
}
function replayBuildTurn(args) {
  const { replayBuildDir, projectDir, consortDir, featureId, story, turnIndex } = args;
  const turns = listBuildTurns(replayBuildDir, featureId, story).filter((n) => !/reflect/i.test(n));
  if (turnIndex < 1 || turnIndex > turns.length) return false;
  const turnDir = (0, import_path.join)(storyTurnsDir(replayBuildDir, featureId, story), turns[turnIndex - 1]);
  const codeSrc = (0, import_path.join)(turnDir, "code");
  if (!(0, import_fs.existsSync)(codeSrc)) return false;
  syncTreeFromSnapshot(codeSrc, projectDir);
  const REPLAYED_VERDICTS = ["review-verdict.json", "regression-assessment.json", "superseded-tests.json"];
  const cyclesSrc = (0, import_path.join)(turnDir, "tdd", "cycles");
  if ((0, import_fs.existsSync)(cyclesSrc)) {
    (0, import_fs.cpSync)(cyclesSrc, cyclesRootDir(consortDir), {
      recursive: true,
      force: true,
      filter: (src) => (0, import_fs.statSync)(src).isDirectory() || REPLAYED_VERDICTS.some((v) => src.endsWith(v))
    });
  }
  return true;
}
function verdictFromStoryCyclesDir(storyCyclesDir) {
  if (!(0, import_fs.existsSync)(storyCyclesDir)) return void 0;
  let sawPass = false;
  for (const ac of (0, import_fs.readdirSync)(storyCyclesDir)) {
    const acDir = (0, import_path.join)(storyCyclesDir, ac);
    if (!(0, import_fs.statSync)(acDir).isDirectory()) continue;
    const gf = (0, import_path.join)(acDir, "green-failure.json");
    if ((0, import_fs.existsSync)(gf)) {
      try {
        if (JSON.parse((0, import_fs.readFileSync)(gf, "utf8")).assessed === false) return "fail";
      } catch {
      }
    }
    for (const f of (0, import_fs.readdirSync)(acDir)) {
      if (!/^cycle-.*\.json$/.test(f)) continue;
      try {
        if (JSON.parse((0, import_fs.readFileSync)((0, import_path.join)(acDir, f), "utf8")).green_at) sawPass = true;
      } catch {
      }
    }
  }
  return sawPass ? "pass" : void 0;
}
function recordedBuildVerdict(replayBuildDir, featureId, story, turnIndex) {
  const turns = listBuildTurns(replayBuildDir, featureId, story).filter((n) => !/reflect/i.test(n));
  if (turnIndex < 1 || turnIndex > turns.length) return void 0;
  return verdictFromStoryCyclesDir(
    (0, import_path.join)(storyTurnsDir(replayBuildDir, featureId, story), turns[turnIndex - 1], "tdd", "cycles", featureId, story)
  );
}
function liveBuildVerdict(consortDir, featureId, story) {
  return verdictFromStoryCyclesDir((0, import_path.join)(cyclesRootDir(consortDir), featureId, story));
}
var ReplayDivergenceError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReplayDivergenceError";
  }
};
function assertReplayBuildVerdictMatch(args) {
  const recorded = recordedBuildVerdict(args.replayBuildDir, args.featureId, args.story, args.turnIndex);
  if (!recorded) return;
  const live = liveBuildVerdict(args.consortDir, args.featureId, args.story);
  if (!live || live === recorded) return;
  throw new ReplayDivergenceError(
    `[drive] REPLAY DIVERGENCE: build turn ${args.turnIndex} (${args.role} ${args.story}) \u2013 recorded verdict was ${recorded.toUpperCase()} but the live verify returned ${live.toUpperCase()}. The synced tree reproduces record-time, so a differing verdict means the corpus + code have drifted (a regression). Halting \u2013 debug the turn's snapshot vs the live verify; do not silently continue.`
  );
}

// consort/logging/turn-recorder.ts
var PROJECT_ROOT_TOKEN = "<PROJECT_ROOT>";
function relativizeProjectPaths(text, projectDir) {
  if (!text || !projectDir) return text;
  const root = projectDir.replace(/\/+$/, "");
  if (!root) return text;
  return text.split(root + "/").join(PROJECT_ROOT_TOKEN + "/").split(root).join(PROJECT_ROOT_TOKEN);
}
var NON_ARTIFACT_CONSORT = /* @__PURE__ */ new Set(["agent-log.jsonl", "drive-live.log", "next.json"]);
function isRecorderOwned(relUnderConsort) {
  const p = relUnderConsort.split("\\").join("/");
  return p === ".recorder-state.json" || p === "correspondence.jsonl" || p === "routing-decisions.jsonl" || p === "turns" || p.startsWith("turns/");
}
function projectRoutingStateBag(state) {
  const s = state ?? {};
  const bag = {};
  if (typeof s.phase === "string") bag.phase = s.phase;
  const active = s.buildActive;
  if (active !== void 0) bag.buildActive = active;
  const stories = s.stories ?? {};
  const b = active ? stories[active]?.build : void 0;
  if (b) {
    for (const k of [
      "experimentCut",
      "testsWritten",
      "codeWritten",
      "reviewStoryPending",
      "refactorStoryPending",
      "reviewAc",
      "refactorAc",
      "assessGreenAc",
      "repairRegressionAc",
      "greenSupersededAc",
      "awaitingAcceptance",
      "deployVerified",
      "accepted"
    ]) {
      if (b[k] !== void 0) bag[k] = b[k];
    }
  }
  return bag;
}
function recordRoutingDecision(recordDir, action, state, iteration, source) {
  const rec = {
    iteration,
    source,
    action,
    stateBag: projectRoutingStateBag(state),
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  (0, import_node_fs.mkdirSync)(recordDir, { recursive: true });
  (0, import_node_fs.appendFileSync)((0, import_node_path3.join)(recordDir, "routing-decisions.jsonl"), JSON.stringify(rec) + "\n");
}
function recordCorrespondence(recordDir, entry) {
  (0, import_node_fs.mkdirSync)(recordDir, { recursive: true });
  (0, import_node_fs.appendFileSync)((0, import_node_path3.join)(recordDir, "correspondence.jsonl"), JSON.stringify(entry) + "\n");
}
function recordReplaySet(args) {
  const { turnDir, projectDir, consortDir, inputs, prompt, guidelines, levers } = args;
  const setDir = (0, import_node_path3.join)(turnDir, "replay-set");
  (0, import_node_fs.mkdirSync)(setDir, { recursive: true });
  const keep = codeTreeFilter(projectDir);
  const preDir = (0, import_node_path3.join)(setDir, "pre-project");
  for (const abs of walk(projectDir, keep)) {
    const rel = (0, import_node_path3.relative)(projectDir, abs);
    const dst = (0, import_node_path3.join)(preDir, rel);
    (0, import_node_fs.mkdirSync)((0, import_node_path3.dirname)(dst), { recursive: true });
    (0, import_node_fs.cpSync)(abs, dst);
  }
  const preConsortDir = (0, import_node_path3.join)(setDir, "pre-consort");
  for (const abs of walk(consortDir, preConsortKeep)) {
    const rel = (0, import_node_path3.relative)(consortDir, abs);
    const dst = (0, import_node_path3.join)(preConsortDir, rel);
    (0, import_node_fs.mkdirSync)((0, import_node_path3.dirname)(dst), { recursive: true });
    (0, import_node_fs.cpSync)(abs, dst);
  }
  const inDir = (0, import_node_path3.join)(setDir, "inputs");
  (0, import_node_fs.mkdirSync)(inDir, { recursive: true });
  for (const [id, content] of Object.entries(inputs)) {
    (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(inDir, id.replace(/[/\\]/g, "_")), content);
  }
  (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(setDir, "prompt.txt"), relativizeProjectPaths(prompt, projectDir));
  (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(setDir, "guidelines.json"), JSON.stringify(guidelines ?? [], null, 2) + "\n");
  (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(setDir, "levers.json"), JSON.stringify(levers ?? {}, null, 2) + "\n");
}
function expectedTurnFiles(action, opts = {}) {
  if (opts.liveIndex) {
    return action.kind === "invoke-role" ? ["turn.json", "transcript.md"] : ["turn.json"];
  }
  const base = ["turn.json", "files"];
  if (action.kind !== "invoke-role" || !opts.liveCapture) return base;
  return [
    ...base,
    "transcript.md",
    "replay-set/pre-project",
    "replay-set/inputs",
    "replay-set/prompt.txt",
    "replay-set/guidelines.json",
    "replay-set/levers.json"
  ];
}
function assertTurnComplete(turnDir, action, opts = {}) {
  const missing = expectedTurnFiles(action, opts).filter((rel) => !(0, import_node_fs.existsSync)((0, import_node_path3.join)(turnDir, rel)));
  if (missing.length > 0) {
    throw new Error(
      `RECORD AUDIT FAILED \u2013 turn ${turnDir} (${labelForAction(action)}) is missing required recorded file(s): ${missing.join(", ")}. The capture is aborting so the corpus is not silently incomplete. Every ${action.kind === "invoke-role" ? "agent" : ""} turn must record its full set (see expectedTurnFiles). Fix the recorder path that dropped it, then re-capture.`
    );
  }
}
function labelForAction(action) {
  const a = action;
  const kind = String(a.kind ?? "turn");
  if (kind === "invoke-role") {
    const role = String(a.role ?? "role");
    const mode = a.buildMode ?? a.mode;
    return mode ? `${role}-${mode}` : role;
  }
  if (kind === "approve-gate" || kind === "approve-intake-gate" || kind === "approve-plan-gate" || kind === "approve-promote-gate") {
    if (kind === "approve-intake-gate") return "gate-intake";
    if (kind === "approve-plan-gate") return "gate-plan";
    if (kind === "approve-promote-gate") return "gate-promote";
    return "gate-spec";
  }
  if (kind === "approve-deploy-gate") return "gate-deploy";
  if (kind === "surface-gate") return "gate-surface";
  return kind;
}
function sha1(abs) {
  return (0, import_node_crypto.createHash)("sha1").update((0, import_node_fs.readFileSync)(abs)).digest("hex");
}
function renderTranscriptMd(t, label) {
  const lines = [];
  lines.push(`# ${label}${t.role ? ` (${t.role})` : ""}${t.model ? ` \u2013 ${t.model}` : ""}`, "");
  lines.push("## Prompt", "", "```", t.prompt.trim() || "(empty)", "```", "");
  lines.push("## Tools used", "");
  if (t.tools.length === 0) {
    lines.push("(none)", "");
  } else {
    for (const tool of t.tools) lines.push(`- ${tool}`);
    lines.push("");
  }
  lines.push("## Final reasoning", "", t.finalText.trim() || "(no final assistant text)", "");
  return lines.join("\n");
}
function preConsortKeep(abs) {
  const base = abs.split(/[/\\]/).pop() ?? "";
  if (base === "agent-log.jsonl" || base === "correspondence.jsonl") return false;
  if (base === "agent-live.log" || /\.(pid|lock|sock)$/.test(base)) return false;
  return true;
}
function walk(dir, keep) {
  if (!(0, import_node_fs.existsSync)(dir)) return [];
  const out = [];
  for (const entry of (0, import_node_fs.readdirSync)(dir)) {
    const abs = (0, import_node_path3.join)(dir, entry);
    if (keep && !keep(abs)) continue;
    let st;
    try {
      st = (0, import_node_fs.statSync)(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs, keep));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}
function scan(projectDir, consortDir) {
  const map = /* @__PURE__ */ new Map();
  for (const abs of walk(consortDir)) {
    const rel = (0, import_node_path3.relative)(projectDir, abs);
    const relConsort = (0, import_node_path3.relative)(consortDir, abs);
    if (NON_ARTIFACT_CONSORT.has(relConsort)) continue;
    if (isRecorderOwned(relConsort)) continue;
    map.set(rel, { abs, rel, underConsort: true, sha: sha1(abs) });
  }
  const keep = codeTreeFilter(projectDir);
  for (const abs of walk(projectDir, keep)) {
    const rel = (0, import_node_path3.relative)(projectDir, abs);
    if (map.has(rel)) continue;
    map.set(rel, { abs, rel, underConsort: false, sha: sha1(abs) });
  }
  return map;
}
function writeRecorderState(recordDir, cur) {
  const files = {};
  for (const [rel, f] of cur) files[rel] = f.sha;
  (0, import_node_fs.mkdirSync)(recordDir, { recursive: true });
  (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(recordDir, ".recorder-state.json"), JSON.stringify({ files }, null, 2) + "\n");
}
function seedRecorderBaseline(args) {
  if ((0, import_node_fs.existsSync)((0, import_node_path3.join)(args.recordDir, ".recorder-state.json"))) return false;
  writeRecorderState(args.recordDir, scan(args.projectDir, args.consortDir));
  return true;
}
function readState(recordDir) {
  const f = (0, import_node_path3.join)(recordDir, ".recorder-state.json");
  if (!(0, import_node_fs.existsSync)(f)) return { files: {} };
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(f, "utf8"));
  } catch {
    return { files: {} };
  }
}
function readIndex(recordDir) {
  const f = (0, import_node_path3.join)(recordDir, "turns", "index.json");
  if (!(0, import_node_fs.existsSync)(f)) return [];
  try {
    const data = JSON.parse((0, import_node_fs.readFileSync)(f, "utf8"));
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}
function pad(n) {
  return String(n).padStart(4, "0");
}
function lastRecordedOrdinal(recordDir) {
  const idx = readIndex(recordDir);
  return idx.length ? idx[idx.length - 1].ordinal : null;
}
function turnDirFor(recordDir, action) {
  return (0, import_node_path3.join)(recordDir, "turns", `${pad(readIndex(recordDir).length)}-${labelForAction(action)}`);
}
function recordTurn(args) {
  const { recordDir, projectDir, consortDir, action, step, transcript } = args;
  const snapshotContent = args.snapshotContent !== false;
  const a = action;
  const prior = readState(recordDir);
  const cur = scan(projectDir, consortDir);
  const produced = [];
  for (const [rel, f] of cur) {
    if (prior.files[rel] !== f.sha) produced.push(rel);
  }
  const deleted = [];
  for (const rel of Object.keys(prior.files)) {
    if (!cur.has(rel)) deleted.push(rel);
  }
  produced.sort();
  deleted.sort();
  const ordinal = readIndex(recordDir).length;
  const label = labelForAction(action);
  const dirName = `${pad(ordinal)}-${label}`;
  const turnDir = (0, import_node_path3.join)(recordDir, "turns", dirName);
  (0, import_node_fs.mkdirSync)(turnDir, { recursive: true });
  if (snapshotContent) {
    (0, import_node_fs.mkdirSync)((0, import_node_path3.join)(turnDir, "files"), { recursive: true });
    const artifactsDir = (0, import_node_path3.join)(recordDir, "recorded-artifacts");
    for (const rel of produced) {
      const f = cur.get(rel);
      const dst = (0, import_node_path3.join)(turnDir, "files", rel);
      (0, import_node_fs.mkdirSync)((0, import_node_path3.dirname)(dst), { recursive: true });
      (0, import_node_fs.cpSync)(f.abs, dst);
      if (f.underConsort) {
        const mirror = (0, import_node_path3.join)(artifactsDir, (0, import_node_path3.relative)(consortDir, f.abs));
        (0, import_node_fs.mkdirSync)((0, import_node_path3.dirname)(mirror), { recursive: true });
        (0, import_node_fs.cpSync)(f.abs, mirror);
      }
    }
    for (const rel of deleted) {
      const abs = (0, import_node_path3.join)(projectDir, rel);
      if (abs.startsWith(consortDir)) {
        const mirror = (0, import_node_path3.join)(artifactsDir, (0, import_node_path3.relative)(consortDir, abs));
        if ((0, import_node_fs.existsSync)(mirror)) (0, import_node_fs.rmSync)(mirror, { force: true });
      }
    }
  }
  let transcriptSummary;
  if (transcript) {
    const rel = (s) => relativizeProjectPaths(s, projectDir);
    const portable = {
      ...transcript,
      prompt: rel(transcript.prompt),
      finalText: rel(transcript.finalText),
      tools: transcript.tools.map(rel)
    };
    (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(turnDir, "transcript.md"), renderTranscriptMd(portable, label));
    transcriptSummary = {
      role: transcript.role,
      model: transcript.model,
      toolCount: transcript.tools.length,
      finalTextChars: transcript.finalText.length
    };
  }
  const manifest = {
    ordinal,
    step,
    label,
    kind: String(a.kind ?? "turn"),
    role: a.role,
    mode: a.buildMode ?? a.mode,
    story: a.story,
    ac: a.ac,
    action,
    produced,
    deleted,
    // false = a LIVE record: produced/deleted are an INDEX only; read the files at HEAD, not from a
    // frozen turns/<NNNN>/files/ copy (which was not written). Omitted-as-true keeps recorded corpora
    // byte-identical to before this flag existed.
    ...snapshotContent ? {} : { snapshotted: false },
    ...transcriptSummary ? { transcript: transcriptSummary } : {}
  };
  (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(turnDir, "turn.json"), JSON.stringify(manifest, null, 2) + "\n");
  const index = readIndex(recordDir);
  const entry = {
    ordinal,
    step,
    label,
    kind: manifest.kind,
    role: manifest.role,
    mode: manifest.mode,
    story: manifest.story,
    ac: manifest.ac,
    dir: dirName,
    producedCount: produced.length,
    deletedCount: deleted.length,
    ...transcript ? { hasTranscript: true } : {}
  };
  index.push(entry);
  (0, import_node_fs.mkdirSync)((0, import_node_path3.join)(recordDir, "turns"), { recursive: true });
  (0, import_node_fs.writeFileSync)((0, import_node_path3.join)(recordDir, "turns", "index.json"), JSON.stringify({ turns: index }, null, 2) + "\n");
  writeRecorderState(recordDir, cur);
  try {
    if ((0, import_node_fs.existsSync)((0, import_node_path3.join)(recordDir, "correspondence.jsonl"))) {
      recordCorrespondence(recordDir, {
        seq: -1,
        // progress entries are keyed by ordinal (their FK), not by the HIL seq counter
        direction: "orch-to-hil",
        ordinal,
        iteration: -1,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        ...manifest.step !== void 0 ? { step: String(manifest.step) } : {},
        request: {
          kind: "progress",
          prompt: progressNarration(manifest, produced.length, deleted.length)
        },
        response: { by: "orchestrator" },
        outcome: { validated: true }
      });
    }
  } catch {
  }
  return { ordinal, dir: dirName, produced, deleted };
}
function progressNarration(m, producedCount, deletedCount) {
  const who = m.role ?? m.kind;
  const scope = [m.story, m.ac].filter(Boolean).join(" / ");
  const parts = [
    m.mode ? `${who} ${m.mode}` : who,
    scope ? `(${scope})` : "",
    `, ${producedCount} file(s) produced${deletedCount ? `, ${deletedCount} removed` : ""}`
  ];
  return parts.filter(Boolean).join(" ").replace(" ,", ",");
}

// consort/logging/agent-log.ts
init_cjs_shims();
var import_fs3 = require("fs");
var import_path3 = require("path");

// consort/orchestrator/validators/schema-loader.ts
init_cjs_shims();
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_ajv = __toESM(require_ajv(), 1);
function resolveSchemaDir() {
  const direct = (0, import_path2.join)(__dirname, "..", "..", "config", "schemas");
  if ((0, import_fs2.existsSync)(direct)) return direct;
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const cand = (0, import_path2.join)(dir, "consort", "config", "schemas");
    if ((0, import_fs2.existsSync)(cand)) return cand;
    const parent = (0, import_path2.join)(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return direct;
}
var SCHEMA_DIR = resolveSchemaDir();
var ajv = new import_ajv.default({ allErrors: true, strict: false });
ajv.addFormat("date-time", true);
var validatorCache = /* @__PURE__ */ new Map();
function loadSchema(name) {
  return JSON.parse((0, import_fs2.readFileSync)((0, import_path2.join)(SCHEMA_DIR, name), "utf8"));
}
function getValidator(name) {
  const cached = validatorCache.get(name);
  if (cached) return cached;
  const validate = ajv.compile(loadSchema(name));
  validatorCache.set(name, validate);
  return validate;
}
function formatSchemaErrors(validate) {
  const errors = validate.errors ?? [];
  if (errors.length === 0) return ["schema validation failed"];
  return errors.map((e) => {
    const where = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "(root)";
    return `${where}: ${e.message ?? "invalid"}`;
  });
}

// consort/logging/agent-log-events.ts
init_cjs_shims();
var EVENT_TEMPLATES = {
  // Orchestration lifecycle (code-emitted)
  "handoff": { template: "dispatch {{to_role}} for {{phase}}" },
  "phase.start": { template: "{{role}} START {{phase}}" },
  "phase.end": { template: "{{role}} END {{phase}} ({{outcome}})" },
  "escalation.raised": { template: "RAISED TO HIL [{{source}}]: {{reason}}" },
  // Gates (code surfaces; HIL / Human Proxy decides)
  "gate.surfaced": { template: "GATE {{gate}} awaiting decision \u2013 {{subject}}" },
  "gate.approved": { template: "GATE {{gate}} APPROVED" },
  "gate.rejected": { template: "GATE {{gate}} REJECTED: {{reason}}" },
  "gate.modified": { template: "GATE {{gate}} MODIFIED: {{change}}" },
  // Intake & planning
  "intake.supplied": { template: "INTAKE supplied {{artifact}}" },
  "intake.refused": { template: "INTAKE refused {{artifact}}: {{reason}}" },
  // Artifacts & design (agent-emitted)
  "artifact.written": { template: "{{role}} wrote {{artifact}} \u2013 {{summary}}" },
  "open.question": { template: "OPEN Q [{{scope}}]: {{question}}" },
  "concern.flagged": { template: "CONCERN {{concern}} \u2013 owner {{owner_layer}}" },
  // Build cycle (cycle.* family: RED -> GREEN -> REVIEW -> REFACTOR)
  "cycle.red": { template: "RED {{batch}} test(s) in {{cycle_id}} [{{layer}}], lead {{test_id}} ({{ac}}): {{asserts}}" },
  "cycle.green": { template: "GREEN {{test_id}} [{{ac}}]: {{change}}" },
  "cycle.verified": { template: "VERIFY [{{ac}}] on {{branch}} {{outcome}}: {{summary}}" },
  "cycle.review": { template: "REVIEW [{{ac}}] refactor={{refactor}}: {{rationale}}" },
  "cycle.refactored": { template: "REFACTOR [{{ac}}]: {{change}}" },
  "smell.flagged": { template: "SMELL {{smell}} ({{severity}}): {{detail}}" },
  "runner.missing": { template: "NO RUNNER for layer {{layer}} (test {{test_id}})" },
  // Experiment lifecycle (code-emitted)
  "experiment.cut": { template: "EXPERIMENT cut for {{story}}" },
  "experiment.accepted": { template: "EXPERIMENT accepted (merged) for {{story}}" },
  "experiment.discarded": { template: "EXPERIMENT discarded for {{story}}: {{reason}}" },
  "experiment.revised": { template: "EXPERIMENT revised for {{story}}: {{reason}}" },
  // Deploy / verify (code-emitted from the deploy CLI)
  "deploy.start": { template: "DEPLOY start {{scope}} -> {{target}}" },
  "deploy.reachable": { template: "DEPLOY reachable {{url}} (pid {{pid}})" },
  "deploy.unreachable": { template: "DEPLOY unreachable {{url}}: {{reason}}" },
  "deploy.verified": { template: "DEPLOY verified {{scope}} @ {{url}} \u2013 verify {{verify_status}}" },
  "deploy.failed": { template: "DEPLOY failed {{scope}}: {{reason}}" },
  "verify.passed": { template: "VERIFY passed {{scope}} ({{command}})" },
  "verify.failed": { template: "VERIFY failed {{scope}} ({{command}}): {{summary}}" },
  // UX adherence
  "adherence.passed": { template: "ADHERENCE passed {{scope}}" },
  "adherence.failed": { template: "ADHERENCE failed {{scope}}: {{diffs}}" },
  // Per-turn model usage (code-emitted by the runner from the claude -p result).
  // input_tokens is the turn's CONTEXT SIZE (prompt the model processed); the
  // cache_* + cost_usd ride in metadata (not template slots, so not required).
  "turn.usage": { template: "{{role}} turn used {{input_tokens}} input + {{output_tokens}} output tokens" },
  // Generic (agent-emitted; debug / interim)
  "reasoning": { template: "{{note}}" },
  "progress": { template: "{{note}} \u2013 {{step}}" }
};
var AGENT_LOG_EVENT_NAMES = Object.keys(EVENT_TEMPLATES);
function isKnownEvent(name) {
  return Object.prototype.hasOwnProperty.call(EVENT_TEMPLATES, name);
}
var AgentLogEventError = class extends Error {
};
function renderEventMessage(event, slots = {}) {
  if (!isKnownEvent(event)) {
    throw new AgentLogEventError(
      `unknown agent-log event "${event}" (not in the closed vocabulary). Allowed: ${AGENT_LOG_EVENT_NAMES.join(", ")}`
    );
  }
  const tmpl = EVENT_TEMPLATES[event].template;
  return tmpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, name) => {
    const v = slots[name];
    if (v === void 0 || v === null || v === "") {
      throw new AgentLogEventError(`agent-log event "${event}" is missing required slot "${name}"`);
    }
    return String(v);
  });
}

// consort/logging/agent-log.ts
var LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
function logFilePath(consortDir) {
  return (0, import_path3.join)(consortDir, "agent-log.jsonl");
}
function mirrorToRecordDir(text) {
  const recordDir = consortEnv("RECORD_DIR")?.trim();
  if (!recordDir) return;
  try {
    const dst = (0, import_path3.join)(recordDir, "agent-log.jsonl");
    (0, import_fs3.mkdirSync)((0, import_path3.dirname)(dst), { recursive: true });
    (0, import_fs3.appendFileSync)(dst, text, "utf8");
  } catch {
  }
}
function buildAgentLogEvent(input, now) {
  const slots = input.slots ?? {};
  const renderCtx = {
    role: input.role,
    ...input.feature_id !== void 0 ? { feature_id: input.feature_id } : {},
    ...input.phase !== void 0 ? { phase: input.phase } : {},
    ...input.cycle_id !== void 0 ? { cycle_id: input.cycle_id } : {},
    ...slots
  };
  const message = renderEventMessage(input.event, renderCtx);
  const metadata = {
    ...input.feature_id !== void 0 ? { feature_id: input.feature_id } : {},
    ...input.phase !== void 0 ? { phase: input.phase } : {},
    ...input.cycle_id !== void 0 ? { cycle_id: input.cycle_id } : {},
    ...slots,
    ...input.metadata ?? {}
  };
  const event = {
    timestamp: input.timestamp ?? now().toISOString(),
    level: input.level,
    role: input.role,
    // model + effort sit right after role (the per-turn dispatch events carry them).
    ...input.model ? { model: input.model } : {},
    ...input.effort ? { effort: input.effort } : {},
    event: input.event,
    message,
    ...Object.keys(metadata).length > 0 ? { metadata } : {}
  };
  const validate = getValidator("agent-log-event.schema.json");
  if (!validate(event)) {
    throw new Error(`invalid agent log event: ${formatSchemaErrors(validate).join("; ")}`);
  }
  return event;
}
function emitAgentLogEvent(input, opts = {}) {
  const consortDir = opts.consortDir ?? resolveConsortDir();
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const event = buildAgentLogEvent(input, now);
  const line = `${JSON.stringify(event)}
`;
  (0, import_fs3.appendFileSync)(logFilePath(consortDir), line, "utf8");
  mirrorToRecordDir(line);
  return event;
}
function readAgentLog(opts = {}) {
  const consortDir = opts.consortDir ?? resolveConsortDir();
  const file = logFilePath(consortDir);
  if (!(0, import_fs3.existsSync)(file)) return [];
  const minRank = opts.minLevel !== void 0 ? LEVEL_ORDER[opts.minLevel] : void 0;
  const out = [];
  for (const line of (0, import_fs3.readFileSync)(file, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (opts.role !== void 0 && ev.role !== opts.role) continue;
    if (opts.featureId !== void 0 && ev.metadata?.feature_id !== opts.featureId) continue;
    if (minRank !== void 0 && LEVEL_ORDER[ev.level] < minRank) continue;
    out.push(ev);
  }
  return out;
}

// consort/pipeline/record-build.ts
init_cjs_shims();
var import_fs4 = require("fs");
var import_path4 = require("path");
function nextBuildTurnNumber(recordBuildDir, featureId, story) {
  const dir = storyTurnsDir(recordBuildDir, featureId, story);
  if (!(0, import_fs4.existsSync)(dir)) return 1;
  let max = 0;
  for (const name of (0, import_fs4.readdirSync)(dir)) {
    if (name.startsWith(".")) continue;
    const m = /^(\d+)/.exec(name);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}
function turnSlug(turn, role, ac, mode) {
  const n = String(turn).padStart(3, "0");
  return [n, role, mode, ac].filter(Boolean).join("-");
}
function recordBuildTurn(args) {
  const { recordBuildDir, projectDir, consortDir, featureId, story, turn, role, ac, mode } = args;
  const turnDir = (0, import_path4.join)(
    featuresDir(recordBuildDir),
    featureId,
    "stories",
    story,
    "turns",
    turnSlug(turn, role, ac, mode)
  );
  (0, import_fs4.mkdirSync)(turnDir, { recursive: true });
  (0, import_fs4.cpSync)(projectDir, (0, import_path4.join)(turnDir, "code"), {
    recursive: true,
    force: true,
    filter: codeTreeFilter(projectDir)
  });
  const cyclesSrc = cyclesRootDir(consortDir);
  if ((0, import_fs4.existsSync)(cyclesSrc)) (0, import_fs4.cpSync)(cyclesSrc, (0, import_path4.join)(turnDir, "tdd", "cycles"), { recursive: true, force: true });
  const expSrc = experimentsRootDir(consortDir);
  if ((0, import_fs4.existsSync)(expSrc)) (0, import_fs4.cpSync)(expSrc, (0, import_path4.join)(turnDir, "tdd", "experiments"), { recursive: true, force: true });
  return turnDir;
}

// consort/orchestrator/drive/orchestrator-run.ts
init_cjs_shims();

// consort/orchestrator/drive/orchestrator-drive.ts
init_cjs_shims();

// consort/orchestrator/workflow/workflow-vocabulary.ts
init_cjs_shims();
function escalationPreempt(state) {
  if (!state.escalation) return void 0;
  const e = state.escalation;
  if (e.routable) {
    return {
      kind: "revise-route",
      story: e.routable.story,
      role: e.routable.owning_role,
      gate: e.routable.gate,
      reason: e.reason,
      source: e.source
    };
  }
  return { kind: "raise-to-hil", reason: e.reason, source: e.source, ...e.story_id ? { story: e.story_id } : {} };
}
function pauseBeforeMilestone(m) {
  switch (m) {
    case "navigator":
      return (a) => a.kind === "invoke-role" && a.role === "navigator" && a.buildMode === void 0;
    case "release-engineer":
      return (a) => a.kind === "await-acceptance" || a.kind === "deploy";
  }
}
function actionLane(action) {
  switch (action.kind) {
    case "invoke-role": {
      if ("mode" in action) {
        return action.mode === "breakdown" ? "design" : "planning";
      }
      return action.role === "navigator" || action.role === "driver" ? "build" : "design";
    }
    case "approve-intake-gate":
    case "approve-backlog-gate":
    case "approve-plan-gate":
    case "planning-complete":
      return "planning";
    case "project-architect-notes":
    case "surface-gate":
    case "approve-gate":
    case "design-complete":
      return "design";
    case "dispatch":
    case "cut-experiment":
    case "await-acceptance":
    case "accept":
    case "complete":
      return "build";
    case "feature-complete":
      return "coarse";
    case "deploy":
    case "approve-deploy-gate":
    case "deploy-verify-heal":
      return "deploy";
    case "deploy-complete":
    case "prepare-pr":
    case "wait-ci":
    case "approve-promote-gate":
    case "merge":
      return "promote";
    case "raise-to-hil":
      return "done";
    case "revise-route":
      return "design";
    case "done":
      return "done";
  }
}
function isHitlGateAction(action) {
  return action.kind === "approve-gate" || action.kind === "approve-intake-gate" || action.kind === "approve-backlog-gate" || action.kind === "approve-plan-gate" || action.kind === "approve-deploy-gate" || action.kind === "approve-promote-gate" || action.kind === "accept";
}
function isHumanInputAction(_action) {
  return false;
}

// consort/orchestrator/drive/orchestrator-drive.ts
function uxDesignerPending(s) {
  return !!s.uiTrack && s.breakdownDone && !s.designGuideReady;
}
function nextDesignAction(state) {
  if (!state.breakdownDone) {
    return { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
  }
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
  }
  for (const story of state.storyOrder) {
    const v = state.stories[story];
    if (v?.gateApproved) continue;
    const design = v?.design ?? {
      hasAcs: false,
      architectAnnotated: false,
      architectProjectable: false,
      dbaDesigned: false,
      testListReady: false,
      reflectionPassed: false,
      reflectionVerdictWritten: false
    };
    if (!design.hasAcs) return { kind: "invoke-role", role: "spec-author", story };
    if (!design.architectAnnotated) {
      if (design.architectProjectable) return { kind: "project-architect-notes", story };
      return { kind: "invoke-role", role: "architect-reviewer", story };
    }
    if (!design.dbaDesigned) return { kind: "invoke-role", role: "dba", story };
    if (!design.testListReady) return { kind: "invoke-role", role: "test-strategist", story };
    if (!design.reflectionPassed) return { kind: "invoke-role", role: "navigator", story, buildMode: "reflect" };
    if (!v?.gateSurfaced) return { kind: "surface-gate", story };
    return { kind: "approve-gate", story };
  }
  return { kind: "design-complete" };
}
function nextBuildAction(story, b) {
  if (!b.experimentCut || b.experimentStale) {
    return b.experimentDiscarded || b.experimentStale ? { kind: "cut-experiment", story, resetStaleBranch: true } : { kind: "cut-experiment", story };
  }
  if (b.refactorVerifyAssessEligible) return { kind: "invoke-role", role: "navigator", story, buildMode: "assess-refactor" };
  if (b.refactorVerifyRefactorPending) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor-superseded" };
  if ((b.loop ?? "story") === "story") {
    if (b.reviewStoryPending) return { kind: "invoke-role", role: "navigator", story, buildMode: "review" };
    if (b.refactorStoryPending) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor" };
  } else {
    if (b.reviewAc) return { kind: "invoke-role", role: "navigator", story, buildMode: "review", ac: b.reviewAc };
    if (b.refactorAc) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor", ac: b.refactorAc };
  }
  if (b.assessGreenAc) return { kind: "invoke-role", role: "navigator", story, buildMode: "assess", ac: b.assessGreenAc };
  if (b.repairRegressionAc) return { kind: "invoke-role", role: "driver", story, buildMode: "repair", ac: b.repairRegressionAc };
  if (b.greenSupersededAc) return { kind: "invoke-role", role: "driver", story, buildMode: "green-superseded" };
  if (b.specDefectAc) {
    const scope = b.specDefectFromRole ?? "test-strategist";
    return {
      kind: "raise-to-hil",
      source: "spec-defect",
      reason: `The failing test/NFR for ${b.specDefectAc} is a SPEC-DEFECT (the test is wrong, not the code) \u2014 revise it in the design lane, do NOT repair the code. Recommended: reopen this story from the ${scope} (consort-reopen-story --from ${scope}), re-author, and rebuild.`,
      story
    };
  }
  if (!b.testsWritten) return { kind: "invoke-role", role: "navigator", story };
  if (!b.codeWritten) return { kind: "invoke-role", role: "driver", story };
  if (!b.awaitingAcceptance) return { kind: "await-acceptance", story };
  if (b.deployVerifyAssessEligible) return { kind: "invoke-role", role: "navigator", story, buildMode: "assess-deploy" };
  if (b.deployVerifyRefactorPending) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor-deploy" };
  if (!b.deployVerified) return { kind: "await-acceptance", story };
  if (!b.accepted) return { kind: "accept", story };
  return { kind: "complete", story };
}
function nextTransition(state) {
  const preempt = escalationPreempt(state);
  if (preempt) return preempt;
  if (state.phase === "planning") {
    const p = state.planning ?? { proposed: false, estimated: false, requestsAuthored: false };
    if (p.intakeReady === false) return { kind: "invoke-role", role: "product-owner", mode: "intake" };
    if (p.intakeReady === true && p.intakeApproved === false) return { kind: "approve-intake-gate" };
    if (!p.proposed) return { kind: "invoke-role", role: "spec-author", mode: "propose" };
    if (!p.skipSizing && !p.estimated) return { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" };
    if (p.backlogCommitted === false) return { kind: "approve-backlog-gate" };
    if (!p.requestsAuthored) return { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
    if (!p.skipSizing && p.committedEstimated === false)
      return { kind: "invoke-role", role: "architect-reviewer", mode: "estimate-committed" };
    if (!p.gateApproved) return { kind: "approve-plan-gate" };
    return { kind: "planning-complete" };
  }
  if (state.phase === "deploy") {
    const d = state.deploy ?? { deployed: false, gateApproved: false };
    if (!d.deployed) return { kind: "deploy" };
    if (d.verifyAssessEligible) return { kind: "deploy-verify-heal", role: "navigator", mode: "assess-deploy" };
    if (d.verifyRefactorPending) return { kind: "deploy-verify-heal", role: "driver", mode: "refactor-deploy" };
    if (!d.gateApproved) return { kind: "approve-deploy-gate" };
    return { kind: "deploy-complete" };
  }
  if (state.phase === "promote") {
    const pr = state.promote ?? { prReady: false, ciGreen: false, prApproved: false, merged: false };
    if (!pr.prReady) return { kind: "prepare-pr" };
    if (!pr.ciGreen) return { kind: "wait-ci" };
    if (!pr.prApproved) return { kind: "approve-promote-gate" };
    if (!pr.merged) return { kind: "merge" };
    return { kind: "done" };
  }
  if (state.phase === "done") return { kind: "done" };
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
  }
  if (state.buildActive) {
    return nextBuildAction(state.buildActive, state.stories[state.buildActive].build);
  }
  for (const story of state.storyOrder) {
    const v = state.stories[story];
    if (v?.gateApproved && !v.build.accepted) return { kind: "dispatch", story };
  }
  const design = nextDesignAction(toDesignView(state));
  if (design.kind === "design-complete") return { kind: "feature-complete" };
  return design;
}
function toDesignView(state) {
  return {
    breakdownDone: state.breakdownDone,
    storyOrder: state.storyOrder,
    uiTrack: state.uiTrack,
    designGuideReady: state.designGuideReady,
    stories: Object.fromEntries(
      Object.entries(state.stories).map(([id, v]) => [
        id,
        { gateApproved: v.gateApproved, gateSurfaced: v.gateSurfaced, design: v.design }
      ])
    )
  };
}
function nextDesignOnlyTransition(state) {
  const preempt = escalationPreempt(state);
  if (preempt) return preempt;
  return nextDesignAction(toDesignView(state));
}

// consort/gates/orchestrator-expect.ts
init_cjs_shims();
var ProtocolViolationError = class extends Error {
  constructor(handoff, detail) {
    super(
      `PROTOCOL VIOLATION: expected ${handoff.responder}${handoff.story ? ` (story ${handoff.story}${handoff.ac ? `/${handoff.ac}` : ""})` : ""} to return ${handoff.expected}, but ${detail}. Aborting workflow.`
    );
    this.handoff = handoff;
    this.detail = detail;
    this.name = "ProtocolViolationError";
  }
  handoff;
  detail;
};
var UnexpectedCallbackError = class extends Error {
  constructor(from, scope, expected) {
    const where = scope.story ? ` (story ${scope.story}${scope.ac ? `/${scope.ac}` : ""})` : "";
    super(
      `PROTOCOL VIOLATION: unexpected callback from ${from}${where} \u2013 no outstanding handoff awaits it (awaiting: ${expected.length ? expected.join(", ") : "nothing"}). Aborting workflow.`
    );
    this.from = from;
    this.scope = scope;
    this.expected = expected;
    this.name = "UnexpectedCallbackError";
  }
  from;
  scope;
  expected;
};
function sig(action) {
  return JSON.stringify(action);
}
function storyOf(action) {
  return "story" in action ? action.story : void 0;
}
function expectationFor(action) {
  if (action.kind !== "invoke-role") return null;
  const responder = action.role;
  const story = storyOf(action);
  const signature2 = sig(action);
  const base = { signature: signature2, responder, ...story ? { story } : {} };
  const storyView2 = (s) => story ? s.stories[story] : void 0;
  if (responder === "spec-author" && "mode" in action && action.mode === "breakdown") {
    return {
      ...base,
      expected: "a feature breakdown (\u22651 story)",
      satisfiedBy: (s) => s.breakdownDone === true,
      remediation: "Write feature-spec.json with a NON-EMPTY `stories[]` array and create the story stub dirs under the artifact root's features/<feature>/stories/. The feature dir currently holds only feature-request.md; a prose list of stories in your reply is NOT the breakdown."
    };
  }
  if (responder === "spec-author" && "mode" in action && action.mode === "propose") {
    return { ...base, expected: "feature proposals", satisfiedBy: (s) => s.planning?.proposed === true };
  }
  if (responder === "ux-designer") {
    return { ...base, expected: "a design guide", satisfiedBy: (s) => s.designGuideReady === true };
  }
  if (responder === "spec-author") {
    return { ...base, expected: "drafted acceptance criteria (non-empty)", satisfiedBy: (s) => storyView2(s)?.design.hasAcs === true };
  }
  if (responder === "architect-reviewer" && "mode" in action && (action.mode === "estimate" || action.mode === "estimate-committed")) {
    return { ...base, expected: "a t-shirt size estimate", satisfiedBy: (s) => s.planning?.estimated === true };
  }
  if (responder === "architect-reviewer") {
    return {
      ...base,
      expected: "layer/NFR-annotated ACs",
      satisfiedBy: (s) => storyView2(s)?.design.architectAnnotated === true,
      remediation: "Write a non-empty `architectural_notes` field into EVERY one of this story's acs/<AC>.json files (your per-AC product; the gate checks each AC carries it), AND ensure the feature architecture.json exists. architectural_notes are per-AC: annotate this story's ACs even when the feature-level architecture.json already exists from an earlier story."
    };
  }
  if (responder === "dba") {
    return {
      ...base,
      expected: "a db-design.json realizing every persistence_invariant",
      satisfiedBy: (s) => storyView2(s)?.design.dbaDesigned === true,
      remediation: "Write features/<F>/db-design.json declaring >=1 table[] and a realizes_invariants[] that is a FLAT array of EVERY architecture.json persistence_invariant id STRING (bare ids, not objects). A service_backed feature with no db-design or an unrealized invariant hard-blocks the spec gate."
    };
  }
  if (responder === "test-strategist") {
    return { ...base, expected: "a non-empty per-story test list mapped to the story's ACs", satisfiedBy: (s) => storyView2(s)?.design.testListReady === true };
  }
  const buildMode = "buildMode" in action ? action.buildMode : void 0;
  if (responder === "navigator" && buildMode === "reflect") {
    return {
      ...base,
      expected: "a reflect verdict (reflect-verdict.json, pass or fail)",
      satisfiedBy: (s) => storyView2(s)?.design.reflectionVerdictWritten === true,
      remediation: "Write your verdict to the story's reflect-verdict.json (schema: { version, passed, findings[] }). A failing verdict is valid and expected when you find a defect: set passed:false and list each finding with its owner. Narrating the verdict in your reply is NOT enough; the file must exist."
    };
  }
  const ac = "ac" in action ? action.ac : void 0;
  const withAc = { ...base, ...ac ? { ac } : {} };
  if (responder === "navigator" && buildMode === "review") {
    return { ...withAc, expected: `a REVIEW verdict for ${ac}`, satisfiedBy: (s) => storyView2(s)?.build.reviewAc !== ac };
  }
  if (responder === "driver" && buildMode === "refactor") {
    return { ...withAc, expected: `a completed REFACTOR for ${ac}`, satisfiedBy: (s) => storyView2(s)?.build.refactorAc !== ac };
  }
  return null;
}
function handbackMessage(h, attempt) {
  return [
    `HANDBACK (attempt ${attempt}): your previous turn did not return ${h.expected}${h.story ? ` for story ${h.story}${h.ac ? `/${h.ac}` : ""}` : ""}.`,
    `The expected artifact is absent / null / empty / nonconformant ON DISK (the orchestrator verified it).`,
    `Do NOT claim it "already exists" or that "no further artifacts are needed": prose describing the artifact is NOT the artifact.`,
    `Re-inspect the filesystem yourself, then WRITE the artifact this turn.`,
    ...h.remediation ? [h.remediation] : [],
    `This is a retry; the workflow aborts if it is still missing.`
  ].join(" ");
}
var ExpectationLedger = class {
  constructor(maxRetries = 1) {
    this.maxRetries = maxRetries;
  }
  maxRetries;
  outstanding = [];
  /** Unmet-callback count per outstanding handoff signature. */
  attempts = /* @__PURE__ */ new Map();
  /** Record a new outstanding handoff (the call we are waiting on). */
  push(h) {
    this.outstanding.push(h);
  }
  /** Whether anything is outstanding. */
  get pending() {
    return this.outstanding.length > 0;
  }
  /** The head expectation (next expected callback), or undefined. */
  head() {
    return this.outstanding[0];
  }
  /** The responders currently awaited (for diagnostics / wrong-caller messages). */
  awaiting() {
    return this.outstanding.map((h) => h.responder);
  }
  /**
   * INTAKE PROCESSOR – process a callback from a SPECIFIC responder against the
   * outstanding expectations (the caller-identity half of the protocol; the part
   * that becomes load-bearing once dispatch is concurrent / multi-threaded):
   *   - find the first outstanding handoff whose responder === `from` (and, when
   *     given, whose story/ac match the callback's scope). NO match => the caller
   *     is wrong / unexpected => throw UnexpectedCallbackError (abort).
   *   - matched + contract met -> remove it (the right caller delivered).
   *   - matched + unmet, retry budget remains -> `retry` (hand back + re-dispatch).
   *   - matched + unmet, no budget -> throw ProtocolViolationError (abort).
   * Matching the responder (not blindly the head) lets concurrent stories' build
   * callbacks arrive interleaved while still rejecting a callback from a role we
   * are not awaiting at all.
   */
  processCallback(from, state, scope = {}) {
    const idx = this.outstanding.findIndex(
      (h2) => h2.responder === from && (scope.story === void 0 || h2.story === scope.story) && (scope.ac === void 0 || h2.ac === scope.ac)
    );
    if (idx === -1) {
      throw new UnexpectedCallbackError(from, scope, this.awaiting());
    }
    const h = this.outstanding[idx];
    if (h.satisfiedBy(state)) {
      this.outstanding.splice(idx, 1);
      this.attempts.delete(h.signature);
      return { kind: "met", handoff: h };
    }
    const attempt = (this.attempts.get(h.signature) ?? 0) + 1;
    this.attempts.set(h.signature, attempt);
    if (attempt > this.maxRetries) {
      throw new ProtocolViolationError(
        h,
        `the expected artifact did not satisfy its contract across ${attempt} attempts (it is absent, empty, OR present-but-nonconformant on disk \u2013 the orchestrator re-checked it and it still fails)` + (h.remediation ? `. To satisfy it: ${h.remediation}` : "")
      );
    }
    return { kind: "retry", handoff: h, detail: handbackMessage(h, attempt), attempt };
  }
  /**
   * Reconcile the realized state against the HEAD expectation – the deterministic
   * (single-outstanding, in-order) specialization of processCallback. The
   * single-threaded driver dispatches one role at a time, so the only possible
   * responder IS the head's, and reconcile delegates with that identity:
   *   - met   -> pop it.
   *   - unmet, retry budget remains -> `retry` (hand-back + re-dispatch).
   *   - unmet, no budget -> throw ProtocolViolationError.
   * A no-op (`idle`) when nothing is outstanding.
   */
  reconcile(state) {
    const head = this.outstanding[0];
    if (!head) return { kind: "idle" };
    return this.processCallback(head.responder, state, { ...head.story ? { story: head.story } : {}, ...head.ac ? { ac: head.ac } : {} });
  }
};

// consort/orchestrator/steps/step-contract.ts
init_cjs_shims();
var signature = (a) => JSON.stringify(a);
var raiseToHil = (reason, source, story) => ({
  kind: "raise-to-hil",
  reason,
  source,
  ...story ? { story } : {}
});
function validateAndBound(proposal, completed, state, deps) {
  switch (proposal.outcome) {
    case "escalate":
      return {
        action: raiseToHil(proposal.reason ?? "step requested escalation", stepSource(completed), storyOf2(completed)),
        sanctionedRetry: false
      };
    case "revise": {
      if (proposal.proposedNext.kind !== "revise-route") {
        const allowed = deps.allowed(state);
        return { action: allowed, sanctionedRetry: false, note: "revise proposal was not a revise-route; fell back to allowed transition" };
      }
      if (deps.reviseBudgetAvailable(proposal, state)) {
        return { action: proposal.proposedNext, sanctionedRetry: false };
      }
      return {
        action: raiseToHil(
          proposal.reason ?? "revise budget exhausted",
          stepSource(completed),
          storyOf2(proposal.proposedNext)
        ),
        sanctionedRetry: false,
        note: "revise budget exhausted; converted to raise-to-hil"
      };
    }
    case "blocked": {
      const { sanctioned } = deps.recordRetry(completed, state);
      return { action: completed, sanctionedRetry: sanctioned };
    }
    case "produced":
    default: {
      const allowed = deps.allowed(state);
      if (signature(proposal.proposedNext) === signature(allowed)) {
        return { action: proposal.proposedNext, sanctionedRetry: false };
      }
      return {
        action: allowed,
        sanctionedRetry: false,
        note: `proposal ${signature(proposal.proposedNext)} not the allowed transition; fell back to ${signature(allowed)}`
      };
    }
  }
}
function stepSource(completed) {
  if (completed.kind === "invoke-role") return `step:${completed.role}`;
  return `step:${completed.kind}`;
}
function storyOf2(a) {
  return "story" in a && typeof a.story === "string" ? a.story : void 0;
}

// consort/orchestrator/drive/orchestrator-run.ts
var DriverStalledError = class extends Error {
  constructor(action, iteration) {
    super(
      `driver stalled at iteration ${iteration}: action ${JSON.stringify(action)} repeated without advancing state. The effect for this action did not change what readState() returns.`
    );
    this.action = action;
    this.iteration = iteration;
    this.name = "DriverStalledError";
  }
  action;
  iteration;
};
var MAX_ITERATIONS = 1e4;
function driverBoundOptions(bound) {
  switch (bound) {
    case "plan":
      return { stopWhen: (a) => a.kind === "planning-complete" };
    case "design":
      return { transition: nextDesignOnlyTransition, stopWhen: (a) => a.kind === "design-complete" };
    case "build":
      return { stopWhen: (a) => actionLane(a) !== "build" };
    case "deploy":
      return { stopWhen: (a) => actionLane(a) !== "deploy" && actionLane(a) !== "promote" };
  }
}
async function runDriver(effects, options = {}) {
  let previousSignature;
  let pausedAlready = false;
  const enforceExpectations = options.enforceExpectations !== false;
  const expectations = new ExpectationLedger();
  const transitionFn = options.transition ?? nextTransition;
  let pendingProposal;
  let pendingBounded;
  const routerRetries = /* @__PURE__ */ new Map();
  const routerDeps = {
    allowed: (s) => transitionFn(s),
    // Reuse the EXISTING revise budget: escalationPreempt returns a revise-route only
    // while the budget has room (priorReviseCount / REFLECT_REVISE_CAP), else raise-to-hil.
    reviseBudgetAvailable: (_p, s) => escalationPreempt(s)?.kind === "revise-route",
    recordRetry: (completed) => {
      const key = JSON.stringify(completed);
      const attempt = (routerRetries.get(key) ?? 0) + 1;
      if (attempt > 1) {
        throw new Error(`PROTOCOL VIOLATION: step ${key} emitted "blocked" past its retry budget. Aborting workflow.`);
      }
      routerRetries.set(key, attempt);
      return { sanctioned: true };
    }
  };
  for (let i = 0; ; i++) {
    if (options.maxSteps !== void 0 && i >= options.maxSteps) {
      return { iterations: i, stoppedAtMax: true };
    }
    if (i >= MAX_ITERATIONS) {
      throw new Error(`driver exceeded ${MAX_ITERATIONS} iterations without reaching "done".`);
    }
    const state = await effects.readState();
    let retrying = false;
    if (enforceExpectations) {
      const rec = expectations.reconcile(state);
      if (rec.kind === "retry") {
        retrying = true;
        effects.onHandback?.(rec.handoff, rec.detail);
      }
    }
    let action;
    if (pendingBounded) {
      action = pendingBounded.bounded.action;
      if (pendingBounded.bounded.sanctionedRetry) retrying = true;
      pendingBounded = void 0;
    } else if (options.contract && pendingProposal) {
      const bounded2 = validateAndBound(pendingProposal.proposal, pendingProposal.completed, state, routerDeps);
      action = bounded2.action;
      if (bounded2.sanctionedRetry) retrying = true;
      pendingProposal = void 0;
    } else {
      action = transitionFn(state);
    }
    effects.onRoutingDecision?.(
      action,
      state,
      i,
      pendingBounded !== void 0 ? "bounded" : options.contract && pendingProposal !== void 0 ? "contract" : "nextTransition"
    );
    if (action.kind === "done") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1 };
    }
    if (action.kind === "raise-to-hil") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1, escalated: true, escalation: action };
    }
    if (options.stopWhen?.(action)) {
      return { iterations: i, stoppedAtBound: true, stoppedAt: action };
    }
    if (!pausedAlready && options.pauseBefore?.(action) && options.confirmContinue) {
      pausedAlready = true;
      await options.confirmContinue(action);
    }
    const signature2 = JSON.stringify(action);
    if (!retrying && signature2 === previousSignature) {
      throw new DriverStalledError(action, i);
    }
    previousSignature = signature2;
    if (enforceExpectations && !retrying) {
      const handoff = expectationFor(action);
      if (handoff) expectations.push(handoff);
    }
    effects.assertRouteSatisfiable?.(action, state);
    effects.onAction?.(action, i);
    const bounded = await effects.performViaExecutor?.(action, state, routerDeps);
    if (bounded) {
      pendingBounded = { bounded, completed: action };
    } else {
      await effects.perform(action);
      effects.onCorrespondence?.(action, state, i);
      if (options.contract) {
        const post = await effects.readState();
        pendingProposal = { proposal: options.contract.route(action, { state: post, feature: featureOf(post) }), completed: action };
      }
    }
  }
}
function featureOf(state) {
  return state.featureId ?? "";
}

// consort/gates/escalation.ts
init_cjs_shims();
var fs6 = __toESM(require("fs"), 1);

// consort/smells/smells.ts
init_cjs_shims();
var import_fs5 = require("fs");
var import_crypto = require("crypto");
var import_path5 = require("path");

// consort/pipeline/run-cycle.ts
init_cjs_shims();
var import_lakebase2 = require("@databricks-solutions/lakebase-scm-utils/lakebase");

// consort/experiment/experiment.ts
init_cjs_shims();
var import_node_child_process3 = require("child_process");
var import_lakebase = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var RUNTIME_ARTIFACT_PREFIXES = [
  ...ALL_ARTIFACT_ROOTS.map((r) => `${r}/`),
  ".lakebase/",
  ".claude/agent-memory/"
];

// consort/pipeline/run-cycle.ts
function readAcLayer2(consortDir, featureId, acId) {
  return readAcLayer(consortDir, featureId, acId);
}
function coveredTestIds(c) {
  if (c.test_ids && c.test_ids.length > 0) return c.test_ids;
  return c.test_id ? [c.test_id] : [];
}

// consort/smells/smells.ts
var SMELL_CATALOG = [
  {
    name: "test-list-drift",
    description: "Test list grew by >25% since cycle start without HITL approval.",
    proposed_remediation: "PO refinement on spec.",
    // A drifted/non-orderable test list is a test-strategist decomposition
    // defect: route the remediation back to Gate 3 on `revise`.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list"
  },
  {
    name: "superseded-tests",
    description: "A new AC intentionally supersedes behavior encoded in PRIOR tests (often from earlier features); the Navigator flagged them in a superseded-tests allowlist. NOT a contradiction to block (that is test-list-drift), the latest AC wins and the accumulated tests must follow it.",
    proposed_remediation: "Driver permissively refactors ONLY the flagged tests (and the code) to the new AC, then the honest-GREEN verify re-runs. Bounded to one attempt; an unflagged regression escalates.",
    level: "build"
  },
  {
    name: "cycle-stall",
    description: "N cycles in a row with no GREEN.",
    proposed_remediation: "Re-examine test ordering or spec ambiguity."
  },
  {
    name: "api-coherence-drift",
    description: "Same concept named differently across two consecutive PASS reviews.",
    proposed_remediation: "Rename refactor before next test."
  },
  {
    name: "fragility-ratio",
    description: "One behavior change failed >3 tests.",
    proposed_remediation: "Refactor + flag tests-mirror-implementation anti-pattern."
  },
  {
    name: "test-cost-spiral",
    description: "Each subsequent test takes >2x the lines of the prior one.",
    proposed_remediation: "Reconsider boundary; outer-loop tests probably needed."
  },
  {
    name: "cross-experiment-divergence",
    description: "Two parallel experiments are solving different problems.",
    proposed_remediation: "Was an opinion gap hidden? Re-run design-spec gate."
  },
  {
    name: "dead-requirement-signal",
    description: "An AC has had no scenarios written in N cycles while others mature.",
    proposed_remediation: "Deprecate or clarify via PO refinement."
  },
  {
    name: "test-deletion-attempt",
    description: "Driver or human attempts to remove or weaken an existing test.",
    proposed_remediation: "Hard block. Tests are immutable until the test list itself is renegotiated."
  },
  {
    name: "boundary-violation",
    description: "Test references a private method or internal helper.",
    proposed_remediation: "Refactor to public boundary or move to inner-loop list."
  },
  {
    name: "import-time-build-coupling",
    description: "The app entry module requires an optional build artifact (e.g. client/dist) at module load time, an unconditional StaticFiles mount / asset read at import scope. It greens where the artifact happens to exist and crashes at import everywhere it does not (backend-only test runs, CI before the client build, fresh clones). Caught deterministically by the `consort-imports-clean` gate; the Navigator may also flag it in REVIEW.",
    proposed_remediation: "Guard the coupling: mount the compiled client ONLY when its directory exists, and serve a clear 503 from the SPA route when index.html is absent, so the module imports without the artifact. See the dev/prod-parity rule in software-design-principles."
  },
  {
    name: "scaffold-defect",
    description: "A test cannot run because the project scaffold is missing a piece the kit owns (e.g. tests/e2e/conftest.py + the live_server fixture for an E2E AC, or an absent runner). The role flags it instead of fabricating the missing scaffold itself. Blocking: a fabricated fixture diverges from the shipped one + reintroduces the CI-parity bugs the kit template prevents.",
    proposed_remediation: "Halt + surface to the HIL. Fix the scaffold (re-run the kit's wiring, e.g. --enable-e2e for the project's language), never hand-author the missing piece in the build."
  },
  {
    name: "ac-overlap",
    description: "Two acceptance criteria in a story are not independent: satisfying one's `then` inherently satisfies (or contradicts) another, so the dependent AC's test can never go RED without deleting shipped code. A spec/test-list decomposition defect. Blocking, and flagged at the design gate (Gate 3) so it halts BEFORE a build cycle is wasted, rather than surfacing mid-build as a cycle-stall.",
    proposed_remediation: "Surface to the PO at the gate. Merge the overlapping ACs, differentiate their observable behavior, or (PO decision) accept the dependent AC as already-satisfied. Do not order both as separate cycles.",
    // An AC overlap is a spec-author decomposition defect: route back to Gate 1.
    level: "spec",
    owning_role: "spec-author",
    gate_to_rerun: "spec"
  },
  {
    name: "reflect-spec-defect",
    description: "The pre-build reflection critic (Navigator, reflect mode) found a defect in the story's SPEC before the build lane: an internal contradiction between ACs, a spec-vs-architecture layer conflict, or an untestable/vacuous AC (no observable outcome). Caught on the cheap design artifacts so it is fixed BEFORE any RED/GREEN/REVIEW cycle runs, the reflection gate is a speed play (a spec fix is far cheaper than re-running build cycles).",
    proposed_remediation: "Route back to the Spec Author (Gate 1): resolve the contradiction, make the AC observable, or realign the AC with the architecture. Bounded to one automatic revise per story; if the critic still finds the defect after the re-spec, it escalates to the human.",
    // A spec defect the critic surfaces is a spec-author fix: route back to Gate 1.
    level: "spec",
    owning_role: "spec-author",
    gate_to_rerun: "spec"
  },
  {
    name: "reflect-testlist-defect",
    description: "The pre-build reflection critic (Navigator, reflect mode) found a defect in the story's TEST-LIST before the build lane: a test that contradicts its AC, an AC with no covering test (coverage gap), an NFR with no fitness test, or a test that asserts at a layer the architecture forbids. Caught on the cheap artifacts so it is fixed BEFORE the build lane.",
    proposed_remediation: "Route back to the Test Strategist (Gate 3): align the test with its AC, add the missing coverage, or move the assertion to the correct layer. Bounded to one automatic revise per story; if the critic still finds the defect after the re-scope, it escalates to the human. CROSS-STORY persistence-invariant case: if the uncovered invariant is one whose table is realized by THIS story but a DIFFERENT, already-gated story front-loaded its fitness item (the invariant-coverage-distinct block), the story-scoped auto-revise CANNOT clear it (it only re-runs this story). The fix is to re-anchor the invariant to its REALIZING story (per db-design schema_changes): remove the fitness item from the mis-anchored owner and add it here. That crosses a gated story boundary, so it escalates to the human with the owning story named (reopen it), rather than looping this story to a dead end.",
    // A test-list defect the critic surfaces is a test-strategist fix: route back to Gate 3.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list"
  },
  {
    name: "shared-state-aggregate-assertion",
    description: "A test asserts an ABSOLUTE aggregate over the WHOLE store (an integrity/consistency probe, a global COUNT/SUM \u2013 e.g. 'the probe reports exactly 0/2/1 nonconforming rows') without owning the table state it asserts. It passes in the per-cycle build verify (an ISOLATED ephemeral branch holding only its seeded rows) but the honest-GREEN full-feature deploy-verify FAILS it, because that runs the whole suite against the SHARED feature-branch DB where other stories' rows (same nullable columns) inflate the count. A real probe over a real deployed DB can never assert an exact global total anyway.",
    proposed_remediation: "Route back to the Test Strategist (Gate 3): scope BOTH the seed AND the assertion to the test's own rows (filter the probe/count by the test's SKUs or a marker column, or assert a before-vs-after DELTA), never an absolute whole-table total. Bounded to one automatic revise per story; a second escape escalates to the human.",
    // A contamination-fragile aggregate assertion is a test-strategist fix: route back to Gate 3.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list"
  },
  {
    name: "architect-canon-gap",
    description: "The deterministic architect-notes projection (FEIP-7902) found a story whose AC layers or architecture.json dimensions (a persistence-invariant type or an NFR category) the project canon does not yet cover. Projecting a blind architectural_note would guess at placement the canon cannot justify, so the story is routed to the Architect instead: re-annotate the story AND amend the canon so the next feature inherits the new rule. Spec-level + architect-owned; the projection is the default path and this is its reactive self-heal.",
    proposed_remediation: "Route to the Architect Reviewer (Gate 2 architecture): annotate the uncovered ACs with real architectural_notes and declare the new dimension in architecture.json so reconcile amends the canon. Bounded to one automatic revise per story; a second escape hard-halts to the human.",
    level: "spec",
    owning_role: "architect-reviewer",
    gate_to_rerun: "architecture"
  },
  {
    name: "layering-violation",
    description: "The code breaks the layered-architecture contract the architect declared in architecture.json `layers`: a fat controller (the boundary/routes layer calls the DB session directly \u2013 .query/.add/.commit/.delete \u2013 or holds business logic instead of delegating to a service + repository); a dependency that does NOT point inward (a layer imports another its `may_import` does not permit \u2013 e.g. the boundary reaching around the service into the repository, or a backward import); or leaked persistence (a non-repository layer such as the service touches the ORM session). Distinct from `boundary-violation` (which is a TEST reaching a private method). Caught deterministically by `consort-layering-clean` (boundary session ops, may_import-derived inward-dependency scan, and ORM containment across non-repository layers); the Navigator may also flag it in REVIEW.",
    proposed_remediation: "Extract a service (business logic) + a repository (the ONLY layer that touches the ORM/session); the route handler validates input + delegates. Defended by the layering fitness test (tests/architecture/test_layering.py)."
  },
  {
    name: "ux-adherence",
    description: "The rendered UI defines the design tokens on :root yet does not USE them at the element level: hardcoded hex colors / raw px where a var(--token) belongs, an ia.md data-testid seam that was never rendered, or an action surface (form/submit) with no feedback affordance (no silent failure / unacknowledged success). Token-level adherence (assertDesignAdherence) cannot see this; the element-level checks in design-adherence.ts do, and the UX Designer flags it in REVIEW. Distinct from `layering-violation` (engineering layering): this is the experience-lens gate.",
    proposed_remediation: "Consume tokens via var(--token) (no hardcoded hex/px), render every ia.md screen with its data-testid seams, and give every action a perceivable result. Refactor the UI to the design guide; do not weaken the guide to match the drift."
  },
  {
    name: "ui-style-implementation-test",
    description: "A test for a design-guide-governed styling property asserts the IMPLEMENTATION in the page SOURCE (an inline `style=` attr or raw CSS text, e.g. grepping the HTML for `text-align: right`) instead of the rendered SEAM (the element carries the design-guide class / data-testid) or the design-adherence gate. It greens only while the style stays inline, so the moment the design lane refactors that ad-hoc inline style into a token-driven theme.css class (as the design guide requires), the test breaks and the REFACTOR dead-locks with no valid SUPERSEDED-TESTS path (the test and the design guide cannot both be satisfied). A test-list decomposition defect the pre-build reflection critic flags (routes to the Test Strategist), so it is fixed before a build cycle wastes on it.",
    proposed_remediation: "Test the SEAM, not the implementation: assert the quantity/styled cell carries its design-guide class or data-testid (the stable contract), and leave the visual property (alignment, tabular-nums, color) to the design-adherence gate / a rendered-output check. Never assert an inline `style=` string the design guide will move into a token-driven class.",
    // A styling test asserting implementation is a test-strategist decomposition
    // defect: route back to Gate 3 (test_list) on `revise`.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list"
  },
  {
    name: "e2e-inline-regex-flag",
    description: "An E2E Playwright matcher (to_contain_text/to_have_text/to_have_url/get_by_text) is built from a Python regex carrying INLINE FLAGS \u2013 re.compile(r\"(?i)summary\") and the like. Playwright forwards the pattern's `.pattern` string verbatim to the browser's JavaScript regex engine, which does NOT support inline-flag syntax `(?i)`/`(?s)`/`(?m)`, so the regex is invalid and the assertion can never match the running app. The test is structurally un-greenable: the honest-GREEN verify rejects it and the build raises to HIL. Caught deterministically + cheaply (no browser run) by the e2e-regex-clean static lint, which enriches the GREEN-verify failure with the exact file:line + fix.",
    proposed_remediation: 'Pass the flag as a kwarg, not inline: re.compile("summary", re.IGNORECASE) emits the valid JS regex /summary/i. Or, for a plain case-insensitive substring, use the bare string form Playwright already matches loosely. See the E2E rule in the Navigator role.'
  },
  {
    name: "e2e-row-perma-red",
    description: "An E2E-tagged test row has failed or had zero recorded runs for N or more consecutive cycles.",
    proposed_remediation: "Surface to PO: either fix the runner wiring (BASE_URL, paired-branch endpoint, playwright.config), narrow the failing scenario, or retag the AC to a layer with a working runner."
  },
  {
    name: "contract-incompleteness",
    description: 'A migration DROPPED (or renamed) a column the running code still references \u2013 the ORM model field, a query/repository, a serializer/DTO, or a template/view \u2013 so the app emits SQL for a column the migrated database no longer has and crashes at runtime ("column X does not exist") even though the migration itself succeeded. The contract half of expand/contract (software-design-principles hard rule 9) was left incomplete: the schema shrank but the code did not follow in the SAME change. Caught DETERMINISTICALLY by the `consort-contract-clean` gate (it parses the migration\'s net column drops and greps the code tree for residual references), which enriches the GREEN-verify failure with the exact file:line list \u2013 no model judgment needed to notice OR localize it.',
    proposed_remediation: "Driver REPAIR: remove or replace EVERY residual reference (model field, queries, serializers/DTOs, templates/views) in the same change so the code matches the migrated schema. Never edit the migration or a test to hide it. The green-failure fixDirective carries the precise file:line list, so this self-heals without a Navigator assess."
  },
  {
    name: "migration-app-coupling",
    description: "A migration module imports application code at import scope (e.g. `from app.services... import parse_x`) to reuse app logic in a data migration. A migration is an IMMUTABLE historical artifact; the app is mutable. Coupling the two means a later rename/move/removal of that app symbol breaks replaying the migration from base (the historical revision can no longer import), and every alembic subcommand that builds the revision map (history/heads, not just upgrade) must load the module. It greens under `upgrade` (env.py puts the project root on sys.path) yet fails in CI's `alembic history`/`heads`. Caught DETERMINISTICALLY by the `consort-migration-clean` gate (it scans the migration files for module-scope app imports), which runs proactively at GREEN even when the local verify passes, so it is fixed before the PR; the Navigator may also flag it in REVIEW.",
    proposed_remediation: "Driver REPAIR: make the migration self-contained: inline a frozen copy of the needed logic in the migration file (or express the data change in raw SQL). Do not import from app.* at module scope, so the migration stays stable as the app evolves and loads under every alembic subcommand."
  }
];
function specLevelSmell(name) {
  const def = SMELL_CATALOG.find((s) => s.name === name);
  if (!def || def.level !== "spec" || !def.owning_role || !def.gate_to_rerun) return null;
  return { owning_role: def.owning_role, gate_to_rerun: def.gate_to_rerun };
}
var BUILD_REFACTOR_ROUTABLE = /* @__PURE__ */ new Set([
  "layering-violation",
  "ux-adherence",
  "import-time-build-coupling",
  // A new AC supersedes behavior encoded in PRIOR tests the Navigator flagged
  // (superseded-tests allowlist). The Driver's refactor turn permissively
  // refactors ONLY those flagged tests + the code, then the honest-GREEN verify
  // re-runs. Bounded to one attempt by supersession.refactored; an unflagged
  // regression never reaches here (it escalates), so the backstop stays intact.
  "superseded-tests"
]);
function isBuildRefactorRoutableSmell(name) {
  return BUILD_REFACTOR_ROUTABLE.has(name);
}
function hasOpenBuildRefactorRoutableSmell(consortDir, story_id) {
  return readSmellsLog(consortDir).detected.some(
    (d) => !d.resolution && isBuildRefactorRoutableSmell(d.smell) && (story_id === void 0 || d.story_id === void 0 || d.story_id === story_id)
  );
}
function readSmellsLog(consortDir) {
  const file = (0, import_path5.join)(consortDir, "smells.json");
  if (!(0, import_fs5.existsSync)(file)) return { detected: [] };
  return JSON.parse((0, import_fs5.readFileSync)(file, "utf8"));
}
function smellMatches(entry, smell, story_id) {
  if (entry.smell !== smell) return false;
  if (story_id === void 0) return true;
  return entry.story_id === void 0 || entry.story_id === story_id;
}
function priorReviseCount(consortDir, smell, story_id) {
  return readSmellsLog(consortDir).detected.filter(
    (d) => d.resolution_kind === "revised" && smellMatches(d, smell, story_id)
  ).length;
}
var REFLECT_SMELL_NAMES = /* @__PURE__ */ new Set([
  "reflect-spec-defect",
  "reflect-testlist-defect"
]);
function isReflectSmell(name) {
  return REFLECT_SMELL_NAMES.has(name);
}
var REFLECT_REVISE_CAP = 4;
function priorReflectReviseCount(consortDir, story_id) {
  return readSmellsLog(consortDir).detected.filter(
    (d) => d.resolution_kind === "revised" && isReflectSmell(d.smell) && d.story_id === story_id
  ).length;
}
function storyTestListFingerprint(consortDir, featureId, story_id) {
  const f = storyTestListJson(consortDir, featureId, story_id);
  if (!(0, import_fs5.existsSync)(f)) return "";
  try {
    return (0, import_crypto.createHash)("sha1").update((0, import_fs5.readFileSync)(f)).digest("hex");
  } catch {
    return "";
  }
}
function lastReflectReviseFingerprint(consortDir, story_id) {
  const reflects = readSmellsLog(consortDir).detected.filter(
    (d) => d.resolution_kind === "revised" && isReflectSmell(d.smell) && d.story_id === story_id
  );
  if (reflects.length === 0) return null;
  const last = reflects[reflects.length - 1];
  return typeof last.revised_artifact_sha === "string" ? last.revised_artifact_sha : null;
}

// consort/pipeline/cycle-record.ts
init_cjs_shims();
var import_fs6 = require("fs");
var import_path6 = require("path");

// consort/test-list/test-list.ts
init_cjs_shims();

// consort/deploy/deploy.ts
init_cjs_shims();
var import_node_child_process4 = require("child_process");
var import_node_crypto2 = require("crypto");
var import_node_fs3 = require("fs");
var import_node_path5 = require("path");
var import_lakebase6 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_util2 = require("@databricks-solutions/lakebase-scm-utils/util");

// consort/smells/deploy-verify-assess.ts
init_cjs_shims();
var fs3 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
function scopePath(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return void 0;
  return storyId ? path.join(fdir, "stories", storyId, "deploy-verify-scope.json") : path.join(fdir, "deploy-verify-scope.json");
}
function readDeployVerifyScope(consortDir, featureId, storyId) {
  const file = scopePath(consortDir, featureId, storyId);
  if (!file || !fs3.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs3.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function markerPath(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return void 0;
  return storyId ? path.join(fdir, "stories", storyId, "deploy-verify-assess.json") : path.join(fdir, "deploy-verify-assess.json");
}
function readDeployVerifyAssessMarker(consortDir, featureId, storyId) {
  const file = markerPath(consortDir, featureId, storyId);
  if (!file || !fs3.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs3.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function deployVerifyRefactorPending(consortDir, featureId, storyId) {
  const m = readDeployVerifyAssessMarker(consortDir, featureId, storyId);
  return !!m && m.assessed === true && (m.flagged_tests?.length ?? 0) > 0 && m.refactored !== true;
}
function deployVerifyNeedsAssess(consortDir, featureId, storyId) {
  const m = readDeployVerifyAssessMarker(consortDir, featureId, storyId);
  return !!m && !m.assessed && m.attempts < 1;
}

// consort/architecture/e2e-regex-clean.ts
init_cjs_shims();
var import_node_fs2 = require("fs");
var import_node_path4 = require("path");

// consort/smells/ephemeral-verify.ts
init_cjs_shims();
var import_util = require("@databricks-solutions/lakebase-scm-utils/util");
var import_lakebase3 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase4 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_lakebase5 = require("@databricks-solutions/lakebase-scm-utils/lakebase");

// consort/deploy/deploy.ts
function deployEvidencePasses(e) {
  return e !== void 0 && e.reachable === true && e.verify?.passed === true;
}
function readDeployEvidence(file) {
  if (!(0, import_node_fs3.existsSync)(file)) return void 0;
  try {
    return JSON.parse((0, import_node_fs3.readFileSync)(file, "utf8"));
  } catch {
    return void 0;
  }
}
function storyDeployVerified(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return false;
  return deployEvidencePasses(readDeployEvidence((0, import_node_path5.join)(fdir, "stories", storyId, "deploy-evidence.json")));
}

// consort/architecture/design-adherence.ts
init_cjs_shims();
var import_node_fs4 = require("fs");
var import_node_path6 = require("path");

// consort/smells/supersession.ts
init_cjs_shims();
var fs4 = __toESM(require("fs"), 1);
var import_node_path7 = require("path");
function supersededTestsJson(tdd, feature, story, ac) {
  return (0, import_node_path7.join)(cycleDir(tdd, feature, story, ac), "superseded-tests.json");
}
function readSupersededTests(tdd, feature, story, ac) {
  const parseSuperseded = (raw) => {
    const p = JSON.parse(raw);
    const arr = Array.isArray(p.tests) ? p.tests : Array.isArray(p.superseded_tests) ? p.superseded_tests : void 0;
    return arr && arr.length > 0 && arr.every((t) => typeof t === "string") ? arr : void 0;
  };
  const file = supersededTestsJson(tdd, feature, story, ac);
  if (fs4.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs4.readFileSync(file, "utf8"));
      const tests = parseSuperseded(JSON.stringify(parsed));
      if (tests) return { ...parsed, tests };
    } catch {
    }
  }
  const regFile = regressionAssessmentJson(tdd, feature, story, ac);
  if (fs4.existsSync(regFile)) {
    try {
      const parsed = JSON.parse(fs4.readFileSync(regFile, "utf8"));
      if (parsed.superseded === true) {
        const tests = parseSuperseded(JSON.stringify(parsed));
        if (tests) return { tests, reason: typeof parsed.reason === "string" ? parsed.reason : "superseded (from regression-assessment.json)" };
      }
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function hasPendingSupersession(tdd, feature, story, ac) {
  const s = readSupersededTests(tdd, feature, story, ac);
  return s !== void 0 && s.refactored !== true;
}
function greenFailureJson(tdd, feature, story, ac) {
  return (0, import_node_path7.join)(cycleDir(tdd, feature, story, ac), "green-failure.json");
}
function readGreenFailure(tdd, feature, story, ac) {
  const file = greenFailureJson(tdd, feature, story, ac);
  if (!fs4.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs4.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function needsGreenAssess(tdd, feature, story, ac) {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== void 0 && gf.assessed !== true;
}
function hasPendingRegressionFix(tdd, feature, story, ac) {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== void 0 && gf.assessed === true && typeof gf.fixDirective === "string" && gf.fixDirective.length > 0 && gf.repairAttempted !== true;
}
function hasPendingSpecDefect(tdd, feature, story, ac) {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== void 0 && gf.assessed === true && gf.specDefect !== void 0;
}
function specDefectFromRole(tdd, feature, story, ac) {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf?.specDefect?.fromRole ?? "test-strategist";
}
function regressionAssessmentJson(tdd, feature, story, ac) {
  return (0, import_node_path7.join)(cycleDir(tdd, feature, story, ac), "regression-assessment.json");
}

// consort/architecture/contract-clean.ts
init_cjs_shims();
var import_node_fs5 = require("fs");
var import_node_path8 = require("path");
var ARTIFACT_ROOTS_RE = artifactRootsRegexAlternation();
var EXCLUDE_DIR = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build|tests?|alembic|migrations)(/|$)`
);
var EXCLUDE_DIR_JUNK = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build)(/|$)`
);

// consort/smells/refactor-verify-assess.ts
init_cjs_shims();
var fs5 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
function markerPath2(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return void 0;
  return path2.join(fdir, "stories", storyId, "refactor-verify-assess.json");
}
function readRefactorVerifyAssessMarker(consortDir, featureId, storyId) {
  const file = markerPath2(consortDir, featureId, storyId);
  if (!file || !fs5.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs5.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function refactorVerifyNeedsAssess(consortDir, featureId, storyId) {
  const m = readRefactorVerifyAssessMarker(consortDir, featureId, storyId);
  return !!m && !m.assessed && m.attempts < 1;
}
function refactorVerifyRefactorPending(consortDir, featureId, storyId) {
  const m = readRefactorVerifyAssessMarker(consortDir, featureId, storyId);
  return !!m && m.assessed === true && (m.flagged_tests?.length ?? 0) > 0 && m.refactored !== true;
}

// consort/architecture/migration-app-clean.ts
init_cjs_shims();
var import_node_fs6 = require("fs");
var import_node_path9 = require("path");

// consort/pipeline/cycle-record.ts
var import_git = require("@databricks-solutions/lakebase-scm-utils/git");
var import_lakebase7 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
function readStoryItems(consortDir, featureId, story) {
  const file = storyTestListJson(consortDir, featureId, story);
  if (!(0, import_fs6.existsSync)(file)) {
    throw new Error(`per-story test-list not found for ${featureId}/${story} at ${file}`);
  }
  const data = JSON.parse((0, import_fs6.readFileSync)(file, "utf8"));
  return Array.isArray(data.items) ? data.items : [];
}
function storyCycles(consortDir, featureId, story) {
  const base = (0, import_path6.join)(cyclesRootDir(consortDir), featureId, story);
  if (!(0, import_fs6.existsSync)(base)) return [];
  const out = [];
  for (const acDir of (0, import_fs6.readdirSync)(base)) {
    const dir = (0, import_path6.join)(base, acDir);
    try {
      if (!(0, import_fs6.statSync)(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const f of (0, import_fs6.readdirSync)(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse((0, import_fs6.readFileSync)((0, import_path6.join)(dir, f), "utf8")));
      } catch {
      }
    }
  }
  return out;
}
function storyTestProgress(consortDir, featureId, story) {
  let items = [];
  try {
    items = readStoryItems(consortDir, featureId, story);
  } catch {
    items = [];
  }
  const cycles = storyCycles(consortDir, featureId, story);
  const cycledTestIds = new Set(cycles.flatMap((c) => coveredTestIds(c)));
  const greenTestIds = new Set(cycles.filter((c) => c.green_at).flatMap((c) => coveredTestIds(c)));
  const pending = items.filter((i) => !cycledTestIds.has(i.id));
  const openRed = cycles.filter((c) => c.red_at && !c.green_at);
  const allGreen = items.length > 0 && items.every((i) => greenTestIds.has(i.id));
  return { total: items.length, pending, openRed, allGreen };
}
function pendingItemKind(consortDir, featureId, story) {
  return storyTestProgress(consortDir, featureId, story).pending[0]?.kind;
}
var DEFAULT_BATCH_CAP = 3;
function nextPendingBatch(consortDir, featureId, story, cap = DEFAULT_BATCH_CAP) {
  const effCap = cap > 0 ? cap : DEFAULT_BATCH_CAP;
  const pending = storyTestProgress(consortDir, featureId, story).pending;
  if (pending.length === 0) return [];
  const layerOf = (acId) => readAcLayer2(consortDir, featureId, acId) ?? "_nolayer";
  const headLayer = layerOf(pending[0].ac_id);
  return pending.filter((it) => layerOf(it.ac_id) === headLayer).slice(0, effCap);
}
function readReview(consortDir, featureId, story, acId) {
  const f = acReviewJson(consortDir, featureId, story, acId);
  if (!(0, import_fs6.existsSync)(f)) return {};
  try {
    return JSON.parse((0, import_fs6.readFileSync)(f, "utf8"));
  } catch {
    return {};
  }
}
function acReviewStates(consortDir, featureId, story) {
  let items = [];
  try {
    items = readStoryItems(consortDir, featureId, story);
  } catch {
    items = [];
  }
  const greenTestIds = new Set(
    storyCycles(consortDir, featureId, story).filter((c) => c.green_at).flatMap((c) => coveredTestIds(c))
  );
  const acOrder = [];
  const acTests = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (!acTests.has(it.ac_id)) {
      acTests.set(it.ac_id, []);
      acOrder.push(it.ac_id);
    }
    acTests.get(it.ac_id).push(it.id);
  }
  return acOrder.map((acId) => {
    const tests = acTests.get(acId);
    const r = readReview(consortDir, featureId, story, acId);
    return {
      acId,
      allTestsGreen: tests.length > 0 && tests.every((t) => greenTestIds.has(t)),
      reviewed: Boolean(r.reviewed_at),
      refactorRequested: Boolean(r.refactor_requested),
      refactored: Boolean(r.refactored_at)
    };
  });
}
function firstReviewPendingAc(consortDir, featureId, story) {
  return acReviewStates(consortDir, featureId, story).find((a) => a.allTestsGreen && !a.reviewed)?.acId ?? null;
}
function firstRefactorPendingAc(consortDir, featureId, story) {
  const states = acReviewStates(consortDir, featureId, story);
  const explicit = states.find((a) => a.reviewed && a.refactorRequested && !a.refactored);
  if (explicit) return explicit.acId;
  if (hasOpenBuildRefactorRoutableSmell(consortDir, story)) {
    return states.find((a) => a.reviewed && !a.refactored)?.acId ?? null;
  }
  return null;
}
function readStoryReview(consortDir, featureId, story) {
  const f = storyReviewJson(consortDir, featureId, story);
  if (!(0, import_fs6.existsSync)(f)) return {};
  try {
    return JSON.parse((0, import_fs6.readFileSync)(f, "utf8"));
  } catch {
    return {};
  }
}
function storyAllTestsGreen(consortDir, featureId, story) {
  const p = storyTestProgress(consortDir, featureId, story);
  if (p.total === 0) {
    const reds = storyCycles(consortDir, featureId, story).filter((c) => Boolean(c.red_at));
    return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
  }
  return p.allGreen;
}
function storyReviewState(consortDir, featureId, story) {
  const r = readStoryReview(consortDir, featureId, story);
  return {
    allTestsGreen: storyAllTestsGreen(consortDir, featureId, story),
    reviewed: Boolean(r.reviewed_at),
    refactorRequested: Boolean(r.refactor_requested),
    refactored: Boolean(r.refactored_at)
  };
}
function reviewPending(consortDir, featureId, story) {
  const s = storyReviewState(consortDir, featureId, story);
  return s.allTestsGreen && !s.reviewed;
}
function refactorPending(consortDir, featureId, story) {
  const s = storyReviewState(consortDir, featureId, story);
  if (!s.reviewed || s.refactored) return false;
  if (s.refactorRequested) return true;
  return hasOpenBuildRefactorRoutableSmell(consortDir, story);
}

// consort/gates/escalation.ts
var BLOCKING_SMELLS = /* @__PURE__ */ new Set([
  "test-list-drift",
  "cycle-stall",
  "boundary-violation",
  "test-deletion-attempt",
  // A missing kit-owned scaffold piece (e.g. the E2E conftest/live_server) must
  // halt to the HIL, not let the build fabricate it. The driver-wrote-its-own-
  // conftest defect (2026-06-11 smoke) traced to this not being blocking.
  "scaffold-defect",
  // Non-independent ACs (one AC's `then` implied by another) make a faithful RED
  // impossible. Flagged by the test-strategist at the design gate so it halts
  // BEFORE a build cycle, not mid-build as a cycle-stall (the 2026-06-11 AC2/AC3
  // overlap that stalled S1).
  "ac-overlap",
  // Pre-build reflection gate: the Navigator (reflect mode) found a spec or
  // test-list defect BEFORE the build lane. Blocking + spec-level, so it routes
  // to the owning author (bounded one revise) then HITL, via the revise-route
  // machinery. Halts the build until the design defect is resolved.
  "reflect-spec-defect",
  "reflect-testlist-defect",
  // The boundary/routes layer touching persistence directly (a fat controller),
  // instead of delegating to a service + repository. A build-level structural
  // defect; the Navigator flags it in REVIEW and the layering fitness test
  // defends it. Build-level (not spec-level), so it hard-halts to the HIL rather
  // than routing to a design author.
  "layering-violation",
  // The rendered UI does not USE the design tokens at the element level (hardcoded
  // hex/px, a missing ia.md data-testid seam, or an action with no feedback), even
  // though the :root tokens exist. The UX Designer flags it in REVIEW and the
  // element-level design-adherence checks defend it. Build-level (a UI-quality
  // defect to refactor), so it hard-halts to the HIL rather than routing to an author.
  "ux-adherence",
  // The architect-notes projection found a story the canon does not cover
  // (FEIP-7902). Blocking + spec-level + architect-owned: it routes to the
  // Architect (re-annotate + amend the canon) via revise-routing, bounded one
  // revise then HITL. Halts the design lane until the gap is resolved.
  "architect-canon-gap"
]);
function escalationId(parts) {
  return [parts.source, parts.feature_id, parts.story_id, parts.ac_id].filter(Boolean).join("__").replace(/[^A-Za-z0-9_.-]/g, "-");
}
function writeEscalation(consortDir, esc) {
  const id = esc.id ?? escalationId(esc);
  const file = escalationFile(consortDir, id);
  const existing = readEscalationFile(file);
  if (existing && !existing.resolved_at) return existing;
  const full = {
    id,
    source: esc.source,
    reason: esc.reason,
    ...esc.feature_id ? { feature_id: esc.feature_id } : {},
    ...esc.story_id ? { story_id: esc.story_id } : {},
    ...esc.ac_id ? { ac_id: esc.ac_id } : {},
    raised_at: esc.raised_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    how_to_resolve: `After fixing the ROOT CAUSE, clear this with: consort-resolve-escalation --id ${id} --resolution "<what you fixed>". That clears this escalation (and any blocking smell) and KEEPS the audit trail. Do NOT hand-edit or delete this file, and do NOT edit smells.json, to move the run forward \u2013 that desyncs on-disk state from the drive.`
  };
  fs6.mkdirSync(escalationsDir(consortDir), { recursive: true });
  fs6.writeFileSync(file, JSON.stringify(full, null, 2) + "\n", "utf8");
  return full;
}
function readEscalationFile(file) {
  if (!fs6.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs6.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function readEscalations(consortDir) {
  const dir = escalationsDir(consortDir);
  if (!fs6.existsSync(dir)) return [];
  const out = [];
  for (const f of fs6.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const e = readEscalationFile(`${dir}/${f}`);
    if (e) out.push(e);
  }
  return out;
}
function escalationsFromSmells(consortDir, featureId) {
  const log = readSmellsLog(consortDir);
  return log.detected.filter((d) => !d.resolution && BLOCKING_SMELLS.has(d.smell)).filter((d) => {
    if (d.smell !== "cycle-stall" || !featureId || !d.story_id) {
      return true;
    }
    return pendingItemKind(consortDir, featureId, d.story_id) !== "fitness";
  }).map((d) => ({
    id: escalationId({ source: `smell:${d.smell}`, feature_id: featureId, story_id: d.story_id }),
    source: `smell:${d.smell}`,
    reason: `blocking smell "${d.smell}": ${d.detail}`,
    ...featureId ? { feature_id: featureId } : {},
    ...d.story_id ? { story_id: d.story_id } : {},
    ...d.ac_id ? { ac_id: d.ac_id } : {},
    raised_at: d.detected_at
  }));
}
function firstPendingEscalation(consortDir, featureId) {
  const explicit = readEscalations(consortDir).filter((e) => !e.resolved_at);
  const scoped = featureId ? explicit.filter((e) => !e.feature_id || e.feature_id === featureId) : explicit;
  if (scoped.length > 0) {
    return [...scoped].sort((a, b) => a.raised_at < b.raised_at ? -1 : 1)[0];
  }
  const fromSmells = escalationsFromSmells(consortDir, featureId);
  return fromSmells.length > 0 ? fromSmells.sort((a, b) => a.raised_at < b.raised_at ? -1 : 1)[0] : null;
}

// consort/orchestrator/steps/assert-route-satisfiable.ts
init_cjs_shims();
var import_node_fs7 = require("fs");
var import_node_path10 = require("path");

// consort/orchestrator/steps/turn-events.ts
init_cjs_shims();
var hasAc = (action) => typeof action.ac === "string" && action.ac.length > 0;
var TURN_EVENTS = {
  "green-failure": {
    kind: "green-failure",
    scopeFor: () => "cycle",
    filename: "green-failure.json",
    description: "The failed honest-GREEN verify marker the Navigator ASSESS turn discriminates."
  },
  "superseded-tests": {
    kind: "superseded-tests",
    scopeFor: () => "cycle",
    filename: "superseded-tests.json",
    description: "The prior tests the new AC supersedes, for the Driver's permissive refactor."
  },
  "regression-assessment": {
    kind: "regression-assessment",
    scopeFor: () => "cycle",
    filename: "regression-assessment.json",
    description: "The Navigator's regression diagnosis (+ optional fixDirective) for the Driver repair."
  },
  "review-verdict": {
    kind: "review-verdict",
    // Dual-scoped: per-CYCLE when the loop runs per-AC (the action carries an `ac`), per-STORY
    // otherwise – matching acReviewVerdictJson vs storyReviewVerdictJson (consort-paths.ts:83-94).
    scopeFor: (action) => hasAc(action) ? "cycle" : "story",
    filename: "review-verdict.json",
    description: "The Navigator's REVIEW verdict (refactor yes/no + notes) the Driver refactor consumes."
  }
};

// consort/orchestrator/steps/assert-route-satisfiable.ts
var RouteContractError = class extends Error {
  constructor(action, event, expectedPath) {
    super(
      `route selected turn ${JSON.stringify(action)} but its required process event "${event}" was not produced (expected at ${expectedPath}). A prior turn must RAISE "${event}" before this route may fire \u2013 the router chose this turn on stale/derived state. Fix the route or the producer, not this turn's inputs.`
    );
    this.action = action;
    this.event = event;
    this.expectedPath = expectedPath;
    this.name = "RouteContractError";
  }
  action;
  event;
  expectedPath;
};
function eventArtifactPath(event, action, ctx) {
  const spec = TURN_EVENTS[event];
  const scope = spec.scopeFor(action);
  const story = "story" in action && typeof action.story === "string" ? action.story : void 0;
  const ac = "ac" in action && typeof action.ac === "string" ? action.ac : void 0;
  const f = ctx.featureId;
  switch (scope) {
    case "feature":
      return (0, import_node_path10.join)(featuresDir(ctx.consortDir), f, spec.filename);
    case "story":
      if (!story) return (0, import_node_path10.join)(ctx.consortDir, spec.filename);
      return (0, import_node_path10.join)(cyclesRootDir(ctx.consortDir), f, story, spec.filename);
    case "ac":
    case "cycle":
      if (!story || !ac) return (0, import_node_path10.join)(ctx.consortDir, spec.filename);
      return (0, import_node_path10.join)(cycleDir(ctx.consortDir, f, story, ac), spec.filename);
  }
}
function assertRouteSatisfiable(action, step, ctx, exists = import_node_fs7.existsSync) {
  for (const event of step.requiresEvents(action)) {
    const p = eventArtifactPath(event, action, ctx);
    if (!exists(p)) throw new RouteContractError(action, event, p);
  }
}

// consort/orchestrator/status/next.ts
init_cjs_shims();
var fs19 = __toESM(require("fs"), 1);
var path11 = __toESM(require("path"), 1);

// consort/logging/orchestrator-logging.ts
init_cjs_shims();
var BUILD_TURNS = /* @__PURE__ */ new Set(["red", "green", "review", "refactor"]);
function turnSettings(ctx, role, phase) {
  const turn = BUILD_TURNS.has(phase) ? phase : void 0;
  const model = ctx.modelForRole?.(role);
  const effort = ctx.effortForTurn?.(role, turn);
  return {
    ...model ? { model } : {},
    ...effort && effort !== "default" ? { effort } : {}
  };
}
function storyOf3(action) {
  return "story" in action ? action.story : void 0;
}
function orchestratorLogEvents(action, ctx = {}) {
  const feature_id = ctx.featureId;
  const story = storyOf3(action);
  const base = { role: "orchestrator", level: "info", feature_id };
  const withStory = story ? { story } : {};
  switch (action.kind) {
    case "invoke-role": {
      const role = action.role;
      const mode = "mode" in action ? action.mode : void 0;
      const buildMode = "buildMode" in action ? action.buildMode : void 0;
      const ac = "ac" in action ? action.ac : void 0;
      const phase = mode ?? buildMode ?? (role === "navigator" ? "red" : role === "driver" ? "green" : "design");
      const detail = { ...withStory, ...mode ? { mode } : {}, ...buildMode ? { buildMode } : {}, ...ac ? { ac } : {} };
      return [
        { ...base, event: "handoff", slots: { to_role: role, phase, ...detail } },
        { role, level: "info", feature_id, ...turnSettings(ctx, role, phase), event: "phase.start", slots: { phase, ...detail } }
      ];
    }
    case "surface-gate":
      return [{ ...base, event: "gate.surfaced", slots: { gate: "spec", subject: `story ${story}`, ...withStory } }];
    case "await-acceptance":
      return [
        { role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy", ...withStory } },
        { ...base, event: "gate.surfaced", slots: { gate: "acceptance", subject: `story ${story}`, ...withStory } }
      ];
    case "approve-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "spec", ...withStory } }];
    case "approve-intake-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "intake" } }];
    case "approve-backlog-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "backlog" } }];
    case "approve-plan-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "plan" } }];
    case "approve-deploy-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "deploy" } }];
    case "approve-promote-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "promote" } }];
    case "deploy-complete":
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "promote" } }];
    case "accept":
      return [{ ...base, event: "experiment.accepted", slots: { ...withStory } }];
    case "cut-experiment":
      return [{ ...base, event: "experiment.cut", slots: { ...withStory } }];
    case "dispatch":
      return [{ ...base, event: "phase.start", slots: { phase: "build", ...withStory } }];
    case "deploy":
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy" } }];
    case "complete":
      return [{ ...base, event: "phase.end", slots: { phase: "story", outcome: "complete", ...withStory } }];
    case "planning-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "planning", outcome: "complete" } }];
    case "design-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "design", outcome: "complete" } }];
    case "feature-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "feature", outcome: "complete" } }];
    case "raise-to-hil":
      return [
        {
          ...base,
          level: "error",
          event: "escalation.raised",
          slots: { source: action.source, reason: action.reason, ...withStory }
        }
      ];
    case "done":
      return [{ ...base, event: "phase.end", slots: { phase: "workflow", outcome: "complete" } }];
    default: {
      const k = action.kind;
      return [{ ...base, event: "reasoning", slots: { note: `orchestrator: ${k}` } }];
    }
  }
}
function parkedGateName(gate) {
  switch (gate.kind) {
    case "approve-intake-gate":
      return "intake";
    case "approve-backlog-gate":
      return "backlog";
    case "approve-plan-gate":
      return "plan";
    case "approve-gate":
      return "spec";
    case "approve-deploy-gate":
      return "deploy";
    case "approve-promote-gate":
      return "promote";
    case "accept":
      return "acceptance";
    default:
      return null;
  }
}
function parkedGateSurfacedEvent(gate, ctx = {}) {
  const name = parkedGateName(gate);
  if (!name) return null;
  const story = storyOf3(gate);
  const subject = story ? `story ${story}` : name === "intake" || name === "backlog" || name === "plan" ? `sprint ${ctx.sprint ?? name}` : `feature ${ctx.featureId ?? name}`;
  return {
    role: "orchestrator",
    level: "info",
    feature_id: ctx.featureId,
    event: "gate.surfaced",
    slots: { gate: name, subject, ...story ? { story } : {} }
  };
}
function gateAlreadySurfaced(events, gate) {
  const name = parkedGateName(gate);
  if (!name) return false;
  const story = storyOf3(gate);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.event !== "gate.surfaced" && e.event !== "gate.approved") continue;
    const md = e.metadata ?? {};
    if (md.gate !== name) continue;
    if (story && typeof md.story === "string" && md.story !== story) continue;
    return e.event === "gate.surfaced";
  }
  return false;
}
function describeAction(action, ctx = {}) {
  const ev = orchestratorLogEvents(action, ctx)[0];
  if (!ev) return action.kind;
  const renderCtx = {
    role: ev.role,
    ...ev.feature_id !== void 0 ? { feature_id: ev.feature_id } : {},
    ...ev.phase !== void 0 ? { phase: ev.phase } : {},
    ...ev.slots ?? {}
  };
  try {
    return renderEventMessage(ev.event, renderCtx);
  } catch {
    return ev.event;
  }
}
function makeOnAction(opts) {
  const { featureId, modelForRole, effortForTurn, ...io } = opts;
  return (action) => {
    for (const event of orchestratorLogEvents(action, { featureId, modelForRole, effortForTurn })) {
      try {
        emitAgentLogEvent(event, io);
      } catch {
      }
    }
  };
}
function gateEnactCommand(gate, ctx = {}) {
  const you = ctx.approver ?? "<you>";
  const f = ctx.featureId ?? "<feature-id>";
  switch (gate.kind) {
    case "approve-intake-gate":
      return { bin: "consort-approve-gate", args: ["--sprint", ctx.sprint ?? "<sprint>", "--gate", "intake", "--approver", you] };
    case "approve-backlog-gate":
      return { bin: "consort-approve-gate", args: ["--sprint", ctx.sprint ?? "<sprint>", "--gate", "backlog", "--approver", you] };
    case "approve-plan-gate":
      return { bin: "consort-approve-gate", args: ["--sprint", ctx.sprint ?? "<sprint>", "--approver", you] };
    case "approve-gate":
      return { bin: "consort-approve-gate", args: ["--feature", f, "--story", gate.story, "--approver", you] };
    case "approve-deploy-gate":
      return { bin: "consort-approve-gate", args: ["--feature", f, "--gate", "deploy", "--approver", you] };
    case "approve-promote-gate":
      return {
        bin: "consort-approve-gate",
        args: ["--feature", f, "--gate", "promote", "--promote-ref", ctx.featureBranch ?? f, "--approver", you]
      };
    case "accept":
      return { bin: "consort-pipeline", args: ["accept", "--feature", f, "--story", gate.story, "--approver", you] };
    default:
      return null;
  }
}
function approveHint(gate, ctx = {}) {
  const cmd = gateEnactCommand(gate, ctx);
  if (cmd) return `${cmd.bin} ${cmd.args.join(" ")}`;
  const f = ctx.featureId ?? "<feature-id>";
  return `consort-approve-gate --feature ${f} --approver <you>`;
}

// consort/orchestrator/status/feature-status.ts
init_cjs_shims();

// consort/orchestrator/state/orchestrator-probe.ts
init_cjs_shims();
var fs8 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);

// consort/orchestrator/state/orchestrator-derive.ts
init_cjs_shims();
function isContractStory(storyId) {
  return /(^|[-_])(drop|remove|delete|rename|deprecate|cleanup|retire)([-_]|$)|dropp|remov|delet|renam|deprecat/i.test(
    storyId
  );
}
function effectiveLoopForStory(runLoop, storyId) {
  return isContractStory(storyId) ? "ac" : runLoop;
}
function storyView(id, e, probe, loop) {
  const gateApproved = e.gate?.status === "approved";
  const accepted = e.acceptance?.decision === "accepted" || e.status === "done";
  const exp = e.experiment;
  const experimentStale = exp != null && exp.status === "active" && exp.design_fingerprint !== void 0 && (() => {
    const cur = probe.designFingerprint(id);
    return cur !== void 0 && cur !== exp.design_fingerprint;
  })();
  return {
    gateApproved,
    // The gate record exists once the story has been surfaced for review;
    // awaiting-gate is the pre-record surfaced state.
    gateSurfaced: e.gate != null || e.status === "awaiting-gate",
    design: {
      hasAcs: probe.hasAcs(id),
      architectAnnotated: probe.architectAnnotated(id),
      architectProjectable: probe.architectProjectable(id),
      dbaDesigned: probe.dbaDesigned(id),
      testListReady: probe.testListReady(id),
      reflectionPassed: probe.reflectionPassed(id),
      reflectionVerdictWritten: probe.reflectionVerdictWritten(id)
    },
    build: {
      // An experiment that was discarded is no longer cut (a fresh one is cut
      // on revise); merged/active both count as cut.
      experimentCut: e.experiment != null && e.experiment.status !== "discarded",
      experimentDiscarded: e.experiment != null && e.experiment.status === "discarded",
      experimentStale,
      testsWritten: probe.testsWritten(id),
      codeWritten: probe.codeWritten(id),
      loop,
      reviewAc: probe.reviewPendingAc(id),
      refactorAc: probe.refactorPendingAc(id),
      reviewStoryPending: probe.reviewPending(id),
      refactorStoryPending: probe.refactorPending(id),
      assessGreenAc: probe.assessGreenFailureAc(id),
      repairRegressionAc: probe.repairRegressionFixAc(id),
      greenSupersededAc: probe.greenSupersededFailureAc(id),
      specDefectAc: probe.specDefectAc(id),
      specDefectFromRole: probe.specDefectFromRole(id),
      awaitingAcceptance: e.status === "awaiting-acceptance",
      deployVerified: probe.storyDeployVerified(id),
      deployVerifyAssessEligible: probe.deployVerifyAssessEligible(id),
      deployVerifyRefactorPending: probe.deployVerifyRefactorPending(id),
      refactorVerifyAssessEligible: probe.refactorVerifyAssessEligible(id),
      refactorVerifyRefactorPending: probe.refactorVerifyRefactorPending(id),
      accepted
    }
  };
}
function deriveDriveState(pipeline, probe, ctx) {
  const loop = ctx.loop ?? "story";
  const stories = {};
  for (const [id, entry] of Object.entries(pipeline.stories)) {
    stories[id] = storyView(id, entry, probe, effectiveLoopForStory(loop, id));
  }
  const storyOrder = ctx.storyOrder ?? Object.keys(pipeline.stories);
  const breakdownDone = ctx.breakdownDone || storyOrder.length > 0;
  return {
    phase: ctx.phase,
    planning: ctx.planning,
    deploy: ctx.deploy,
    promote: ctx.promote,
    breakdownDone,
    storyOrder,
    stories,
    buildActive: pipeline.build_active,
    escalation: probe.pendingEscalation()
  };
}
function driverPhaseForTdd(tddPhase) {
  switch (tddPhase) {
    case "planning":
      return "planning";
    case "deploy":
      return "deploy";
    case "promote":
      return "promote";
    case "shipped":
    case "done":
      return "done";
    default:
      return "feature";
  }
}

// consort/pipeline/design-fingerprint.ts
init_cjs_shims();
var import_node_crypto3 = require("crypto");
var import_node_fs8 = require("fs");
function storyDesignFingerprint(consortDir, feature, story) {
  try {
    const raw = (0, import_node_fs8.readFileSync)(storyTestListJson(consortDir, feature, story), "utf8");
    const canonical = JSON.stringify(JSON.parse(raw));
    return (0, import_node_crypto3.createHash)("sha256").update(canonical).digest("hex").slice(0, 16);
  } catch {
    return void 0;
  }
}

// consort/gates/gates.ts
init_cjs_shims();
var import_fs7 = require("fs");
var import_path7 = require("path");
var GATES_SCHEMA_VERSION = 1;
var GATE_STATUSES = ["open", "approved", "superseded", "withdrawn"];
function defaultGatesState(featureId) {
  return {
    feature_id: featureId,
    schema_version: GATES_SCHEMA_VERSION,
    gates: {
      spec: { status: "open", history: [] },
      plan: { status: "open", history: [] },
      test_list: { status: "open", history: [] },
      promote: { status: "open", history: [] },
      deploy: { status: "open", history: [] }
    }
  };
}
function readGates(featureId, opts = {}) {
  const consortDir = opts.consortDir ?? resolveConsortDir();
  const file = gatesFilePath(consortDir, featureId);
  if (!(0, import_fs7.existsSync)(file)) {
    return defaultGatesState(featureId);
  }
  const raw = (0, import_fs7.readFileSync)(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`gates.json at ${file} is not valid JSON: ${cause}`);
  }
  return validateGatesState(parsed, file);
}
function gatesFilePath(consortDir, featureId) {
  return (0, import_path7.join)(requireFeatureDir(consortDir, featureId), "gates.json");
}
function validateGatesState(parsed, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file} is not an object`);
  }
  const obj = parsed;
  if (typeof obj.feature_id !== "string" || obj.feature_id.length === 0) {
    throw new Error(`gates.json at ${file}: missing or invalid feature_id`);
  }
  if (typeof obj.schema_version !== "number") {
    throw new Error(`gates.json at ${file}: missing or invalid schema_version`);
  }
  if (typeof obj.gates !== "object" || obj.gates === null) {
    throw new Error(`gates.json at ${file}: missing or invalid gates`);
  }
  const gates = obj.gates;
  const out = {
    spec: validateGateRecord(gates.spec, "spec", file),
    plan: validateGateRecord(gates.plan, "plan", file),
    test_list: validateGateRecord(gates.test_list, "test_list", file),
    promote: validateGateRecord(gates.promote, "promote", file),
    // The deploy gate (working-software) was added after the original four.
    // A gates.json written before it lacks the key, so backfill a default-open
    // record rather than reject the file (forward-compatible read).
    deploy: gates.deploy !== void 0 ? validateGateRecord(gates.deploy, "deploy", file) : { status: "open", history: [] }
  };
  return {
    feature_id: obj.feature_id,
    schema_version: obj.schema_version,
    gates: out
  };
}
function validateGateRecord(parsed, gateName, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file}: gate ${gateName} is not an object`);
  }
  const obj = parsed;
  const status = obj.status;
  if (typeof status !== "string" || !GATE_STATUSES.includes(status)) {
    throw new Error(
      `gates.json at ${file}: gate ${gateName} has invalid status (${String(status)}); expected one of ${GATE_STATUSES.join(", ")}`
    );
  }
  const history = obj.history;
  if (history !== void 0 && !Array.isArray(history)) {
    throw new Error(`gates.json at ${file}: gate ${gateName} history must be an array`);
  }
  return {
    status,
    approver: typeof obj.approver === "string" ? obj.approver : void 0,
    approved_at: typeof obj.approved_at === "string" ? obj.approved_at : void 0,
    artifact_hashes: obj.artifact_hashes && typeof obj.artifact_hashes === "object" ? obj.artifact_hashes : void 0,
    withdrawal_reason: typeof obj.withdrawal_reason === "string" ? obj.withdrawal_reason : void 0,
    history: history ?? []
  };
}

// consort/gates/workflow-phase.ts
init_cjs_shims();
var fs7 = __toESM(require("fs"), 1);
var TERMINAL_PHASES = /* @__PURE__ */ new Set(["done", "shipped"]);
var PHASE_OWNER_KEY = "phase_feature_id";
function writeWorkflowPhase(consortDir, phase, featureId) {
  const file = workflowStateJson(consortDir);
  let state = {};
  if (fs7.existsSync(file)) {
    try {
      state = JSON.parse(fs7.readFileSync(file, "utf8"));
    } catch {
      state = {};
    }
  }
  state.phase = phase;
  if (featureId) state[PHASE_OWNER_KEY] = featureId;
  fs7.mkdirSync(consortDir, { recursive: true });
  fs7.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}
function resetStaleTerminalPhase(consortDir) {
  const file = workflowStateJson(consortDir);
  if (!fs7.existsSync(file)) return false;
  let state;
  try {
    state = JSON.parse(fs7.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  if (typeof state.phase === "string" && TERMINAL_PHASES.has(state.phase)) {
    delete state.phase;
    fs7.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
    return true;
  }
  return false;
}

// consort/config/consort-config-file.ts
init_cjs_shims();
var import_fs9 = require("fs");
var import_path9 = require("path");

// consort/config/agent-models.ts
init_cjs_shims();
var import_fs8 = require("fs");
var import_path8 = require("path");
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  dba: "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var AGENT_CONFIG_REL = (0, import_path8.join)(".lakebase", "agent-config.json");
function readAgentConfig(projectDir) {
  const p = (0, import_path8.join)(projectDir, AGENT_CONFIG_REL);
  if (!(0, import_fs8.existsSync)(p)) return void 0;
  return JSON.parse((0, import_fs8.readFileSync)(p, "utf8"));
}
function resolveModelForRole(role, projectDir) {
  const spawnable = role;
  const entry = readAgentConfig(projectDir)?.roles?.[spawnable];
  return entry?.override ?? entry?.recommended ?? RECOMMENDED_MODELS[spawnable] ?? "inherit";
}

// consort/config/consort-config-file.ts
var CONSORT_CONFIG_REL = (0, import_path9.join)(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  (0, import_path9.join)(".lakebase", "sftdd-config.json"),
  (0, import_path9.join)(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function loadConsortConfig(projectDir) {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = (0, import_path9.join)(projectDir, rel);
    if (!(0, import_fs9.existsSync)(f)) continue;
    try {
      return JSON.parse((0, import_fs9.readFileSync)(f, "utf8"));
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function resolveProjectSettings(projectDir) {
  const file = loadConsortConfig(projectDir);
  const build = {
    loopGranularity: file?.build?.loopGranularity ?? "story",
    batchCap: file?.build?.batchCap,
    sessionScope: file?.build?.sessionScope ?? "story"
  };
  const project = {
    uiTrack: file?.project?.uiTrack ?? true,
    // HITL-first: the declared project policy defaults to interactive (a human
    // approves each gate). Headless (proxy) is a deliberate opt-in, set in the
    // file or as a RUN-SCOPED --gates override (never persisted by a flag).
    gates: file?.project?.gates ?? "interactive",
    deployTarget: file?.project?.deployTarget ?? "local",
    clientFramework: file?.project?.clientFramework ?? "none",
    // Legacy projects (scaffolded before language was persisted) resolve to "python" – the
    // build lane's historical convention (app/ + .py + alembic), which is what the reference corpus
    // and pre-persistence projects actually are. A NEW scaffold persists its real language, so this
    // default only affects config-less/legacy trees.
    language: file?.project?.language ?? "python"
  };
  const plan = { sizing: file?.plan?.sizing ?? true };
  return { build, plan, project };
}
function productDirForLanguage(language) {
  return language === "nodejs" ? "src" : "app";
}
function projectLanguage(projectDir) {
  return resolveProjectSettings(projectDir).project.language;
}
function defaultConsortConfig() {
  const roles = {};
  for (const role of ALL_AGENT_ROLES) roles[role] = {};
  return {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { uiTrack: true, gates: "interactive", deployTarget: "local", clientFramework: "none", language: "java" }
  };
}
function writeConsortConfig(projectDir, config, opts) {
  const f = (0, import_path9.join)(projectDir, CONSORT_CONFIG_REL);
  if ((0, import_fs9.existsSync)(f) && !opts?.force) return false;
  (0, import_fs9.mkdirSync)((0, import_path9.dirname)(f), { recursive: true });
  (0, import_fs9.writeFileSync)(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}
function applyProjectOverrides(projectDir, over) {
  if (over.deployTarget === void 0 && over.sizing === void 0) return;
  const cfg = loadConsortConfig(projectDir) ?? defaultConsortConfig();
  cfg.project = cfg.project ?? {};
  if (over.deployTarget !== void 0) cfg.project.deployTarget = over.deployTarget;
  cfg.plan = cfg.plan ?? {};
  if (over.sizing !== void 0) cfg.plan.sizing = over.sizing;
  writeConsortConfig(projectDir, cfg, { force: true });
}

// consort/orchestrator/state/orchestrator-probe.ts
var import_lakebase8 = require("@databricks-solutions/lakebase-scm-utils/lakebase");

// consort/smells/reflection.ts
init_cjs_shims();
var import_fs10 = require("fs");
var SMELL_FOR_OWNER = {
  "spec-author": "reflect-spec-defect",
  "test-strategist": "reflect-testlist-defect"
};
function readReflectVerdict(consortDir, feature, story) {
  const p = reflectVerdictJson(consortDir, feature, story);
  if (!(0, import_fs10.existsSync)(p)) return void 0;
  try {
    return JSON.parse((0, import_fs10.readFileSync)(p, "utf8"));
  } catch {
    return void 0;
  }
}
function reflectionPassed(consortDir, feature, story) {
  return readReflectVerdict(consortDir, feature, story)?.passed === true;
}
function reflectionVerdictWritten(consortDir, feature, story) {
  return readReflectVerdict(consortDir, feature, story) !== void 0;
}
var REFLECT_SMELLS = Object.values(SMELL_FOR_OWNER);

// consort/architecture/architecture-canon.ts
init_cjs_shims();
var import_fs11 = require("fs");
function uniq(xs) {
  return [...new Set(xs.filter((x) => typeof x === "string" && x.length > 0))];
}
function readCanon(consortDir) {
  const f = architectureCanonJson(consortDir);
  if (!(0, import_fs11.existsSync)(f)) return void 0;
  try {
    return JSON.parse((0, import_fs11.readFileSync)(f, "utf8"));
  } catch {
    return void 0;
  }
}
function architectNovelty(canon, storyAcs, storyArchitectureJsonContent) {
  const reasons = [];
  const knownLayers = new Set(canon.ac_layers);
  const unknownLayers = uniq(
    storyAcs.map((a) => a.layer).filter((l) => typeof l === "string" && !knownLayers.has(l))
  );
  for (const l of unknownLayers) {
    reasons.push(`AC layer "${l}" is not in the project canon (${canon.ac_layers.join(", ") || "none"})`);
  }
  if (storyArchitectureJsonContent) {
    let doc;
    try {
      doc = JSON.parse(storyArchitectureJsonContent);
    } catch {
      doc = void 0;
    }
    if (doc) {
      const knownInv = new Set(canon.invariant_patterns.map((p) => p.type));
      for (const t of uniq((doc.persistence_invariants ?? []).map((p) => p.type ?? ""))) {
        if (!knownInv.has(t)) reasons.push(`persistence-invariant type "${t}" is not a canon pattern`);
      }
      const knownCat = new Set(canon.nfr_posture.map((n) => n.category));
      for (const c of uniq((doc.nfrs ?? []).map((n) => n.category ?? ""))) {
        if (!knownCat.has(c)) reasons.push(`NFR category "${c}" is not in the canon posture`);
      }
    }
  }
  return { novel: reasons.length > 0, reasons };
}

// consort/orchestrator/validators/conformance/artifact-conformance.ts
init_cjs_shims();
var import_path10 = require("path");
var ARTIFACT_FORMATS = {
  "feature-spec.json": { kind: "json-schema", schema: "feature.schema.json" },
  "story.json": { kind: "json-schema", schema: "story.schema.json" },
  "ac.json": { kind: "json-schema", schema: "ac.schema.json" },
  "test-list.json": { kind: "json-schema", schema: "test-list.schema.json" },
  "plan.json": { kind: "json-schema", schema: "plan.schema.json" },
  "architecture.json": { kind: "json-schema", schema: "architecture.schema.json" },
  // DBA's physical schema (tables/DDL + per-story migration plan) that realizes
  // the architect's persistence_invariants.
  "db-design.json": { kind: "json-schema", schema: "db-design.schema.json" },
  "workflow-state.json": { kind: "json-schema", schema: "workflow-state.schema.json" },
  // Release Engineer's deploy-gate evidence (reachability + feature-verify).
  "deploy-evidence.json": { kind: "json-schema", schema: "deploy-evidence.schema.json" },
  // UX Designer (UI projects only): the machine-checkable design tokens.
  "design-guide.json": { kind: "json-schema", schema: "design-guide.schema.json" },
  // Architect Reviewer's section 6 + Gate 2 adjudication surface.
  "architecture.md": {
    kind: "md-sections",
    sections: [
      { label: "Architectural Concerns Mapping", match: "architectural concerns mapping" },
      { label: "Pattern proposals", match: "pattern proposal" },
      { label: "Risks", match: "risk" },
      { label: "Gate decisions", match: "decision" },
      { label: "Sign-off", match: "sign-off" }
    ]
  },
  // Spec Author's draft-spec narrative.
  "feature-spec.md": {
    kind: "md-sections",
    sections: [
      { label: "Summary", match: "summary" },
      { label: "Stories", match: "stories" },
      { label: "Out of scope", match: "out of scope" },
      { label: "Open questions", match: "open question" }
    ]
  },
  // Feature Requester's original ask: the Spec Author's INPUT. Free-form
  // narrative; only H1 + non-empty body required. Never overwritten.
  "feature-request.md": { kind: "md-narrative" },
  // Spec Author's sprint backlog proposal: the artifact the sprint PLAN gate
  // locks. Free-form narrative; H1 + non-empty body required.
  "feature-proposals.md": { kind: "md-narrative" },
  // Product Owner's project-level overview (replaces the old spec.md).
  "product-overview.md": { kind: "md-narrative" },
  // HIL non-functional-requirements brief (the Architect's intake). The HIL
  // states required NFRs (each with a stable R<n> id), preferences, and
  // out-of-bounds items. The Architect must carry every Required item into
  // architecture.json via a matching brief_ref (see checkNfrCoverage). Project
  // -level (.tdd/nfrs.md) or per-feature (.tdd/features/<F>/nfrs.md).
  "nfrs.md": {
    kind: "md-sections",
    sections: [
      { label: "Required", match: "required" },
      { label: "Preferences", match: "preference" },
      { label: "Out of bounds", match: "out of bounds" }
    ]
  },
  // HIL design brief (UI projects): the human's reference sites + what to take
  // from each. The design analogue of product-overview.md, the source the UX
  // Designer teases the design out of. A brief with no references is
  // meaningless, so a
  // References section is the one hard requirement.
  "design-brief.md": {
    kind: "md-sections",
    sections: [{ label: "References", match: "reference" }]
  },
  // UX Designer narrative artifacts (UI projects only). design-guide.md
  // sections are grounded in a real shipped guide (partner-asset-tracker
  // STYLE_GUIDE.md); design-guide.json carries the machine-checkable tokens.
  "design-guide.md": {
    kind: "md-sections",
    sections: [
      { label: "Design Philosophy", match: "philosophy" },
      { label: "UI Framework", match: "framework" },
      { label: "Typography", match: "typography" },
      { label: "Color Palette", match: "color" },
      { label: "Spacing", match: "spacing" },
      { label: "Components", match: "components" },
      { label: "User Feedback Principles", match: "feedback" }
    ]
  },
  "ia.md": {
    kind: "md-sections",
    sections: [
      { label: "Screens", match: "screens" },
      { label: "Navigation", match: "navigation" },
      { label: "User flows", match: "flow" }
    ]
  },
  // Beck-style ordered list rendered from test-list.json.
  "test-list.md": { kind: "test-list-md" }
};
function checkArtifactConformance(name, content) {
  const spec = ARTIFACT_FORMATS[name];
  if (spec === void 0) return { ok: true };
  switch (spec.kind) {
    case "json-schema":
      return checkJsonSchema(name, content, spec.schema);
    case "md-narrative":
      return finalize(checkMdNarrative(name, content));
    case "md-sections":
      return finalize(checkMdSections(name, content, spec.sections));
    case "test-list-md":
      return finalize(checkTestListMd(content));
  }
}
function finalize(violations) {
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
function checkJsonSchema(name, content, schemaFile) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return { ok: false, violations: [`${name} is not valid JSON: ${cause}`] };
  }
  const validate = getValidator(schemaFile);
  if (validate(parsed)) return { ok: true };
  return { ok: false, violations: formatSchemaErrors(validate).map((e) => `${name} ${e}`) };
}
var HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
function parseHeadings(content) {
  const out = [];
  for (const line of content.split("\n")) {
    const m = HEADING_RE.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}
function hasH1(headings) {
  return headings.some((h) => h.level === 1);
}
function hasBody(content) {
  return content.split("\n").some((line) => {
    const t = line.trim();
    return t.length > 0 && !HEADING_RE.test(line);
  });
}
function checkMdNarrative(name, content) {
  const violations = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push(`${name} has no H1 title`);
  if (!hasBody(content)) violations.push(`${name} has an empty body (title only)`);
  return violations;
}
function checkMdSections(name, content, sections) {
  const violations = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push(`${name} has no H1 title`);
  const headingText = headings.map((h) => h.text.toLowerCase());
  for (const section of sections) {
    if (!headingText.some((t) => t.includes(section.match))) {
      violations.push(`${name} missing required section: ${section.label}`);
    }
  }
  return violations;
}
var TEST_ITEM_RE = /^\s*[-*]\s*\[[ xX]?\]\s*T\d/;
var AC_REF_RE = /\bAC\s*\d/i;
function checkTestListMd(content) {
  const violations = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push("test-list.md has no H1 title");
  if (!/ordered for\s*:/i.test(content)) {
    violations.push('test-list.md missing "Ordered for:" ordering rationale');
  }
  if (!headings.some((h) => h.text.toLowerCase().includes("deferred"))) {
    violations.push("test-list.md missing required section: Deferred / skipped");
  }
  for (const line of content.split("\n")) {
    if (TEST_ITEM_RE.test(line) && !AC_REF_RE.test(line)) {
      violations.push(`test-list.md has a test item with no AC reference (orphan): ${line.trim()}`);
    }
  }
  return violations;
}
function checkDbDesign(dbDesignJson2, architectureJson2) {
  let arch;
  try {
    arch = JSON.parse(architectureJson2);
  } catch {
    return { ok: true };
  }
  if (arch.service_backed !== true) return { ok: true };
  const invariants = (arch.persistence_invariants ?? []).filter((i) => i && typeof i.id === "string" && i.id.length > 0).map((i) => i.id);
  if (invariants.length === 0) return { ok: true };
  if (dbDesignJson2 === void 0) {
    return {
      ok: false,
      violations: [
        `feature declares persistence_invariants but has no db-design.json (the DBA runs after the architect and before the test-strategist to realize the schema; declare >=1 table and realize every persistence_invariant; see db-design.schema.json + agents/dba.md)`
      ]
    };
  }
  let db;
  try {
    db = JSON.parse(dbDesignJson2);
  } catch (err) {
    return { ok: false, violations: [`db-design.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const violations = [];
  if (!Array.isArray(db.tables) || db.tables.length === 0) {
    violations.push(
      `db-design.json declares no tables[] but the feature declares persistence_invariants (it persists data, so it has >=1 table; see agents/dba.md)`
    );
  }
  const realized = new Set((db.realizes_invariants ?? []).filter((x) => typeof x === "string" && x.length > 0));
  const uncovered = invariants.filter((id) => !realized.has(id));
  if (uncovered.length > 0) {
    violations.push(
      `persistence_invariant(s) not realized by db-design.json realizes_invariants[]: ${uncovered.join(", ")} (the DBA must physically realize every invariant the architect declared \u2013 a table/column/constraint/index \u2013 and list its id here; see agents/dba.md)`
    );
  }
  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}
function canonicalArtifactName(path14) {
  const base = (0, import_path10.basename)(path14);
  if ((0, import_path10.basename)((0, import_path10.dirname)(path14)) === "acs" && base.endsWith(".json")) return "ac.json";
  return base;
}

// consort/orchestrator/state/orchestrator-probe.ts
function storyCycles2(consortDir, featureId, story) {
  const base = path3.join(cyclesRootDir(consortDir), featureId, story);
  if (!fs8.existsSync(base)) return [];
  const out = [];
  for (const acDir of fs8.readdirSync(base)) {
    const dir = path3.join(base, acDir);
    let isDir = false;
    try {
      isDir = fs8.statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    for (const f of fs8.readdirSync(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(fs8.readFileSync(path3.join(dir, f), "utf8")));
      } catch {
      }
    }
  }
  return out;
}
function readJson(file) {
  if (!fs8.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs8.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function readDriveContext(consortDir, featureId, projectDir) {
  const ws = readJson(workflowStateJson(consortDir));
  const phaseOwner = typeof ws?.[PHASE_OWNER_KEY] === "string" ? ws[PHASE_OWNER_KEY] : void 0;
  const rawPhase = typeof ws?.phase === "string" ? ws.phase : void 0;
  const honorPhase = rawPhase === "planning" || phaseOwner === featureId;
  const tddPhase = honorPhase && rawPhase ? rawPhase : "feature";
  const spec = readJson(featureSpecJson(consortDir, featureId));
  const proposed = spec !== void 0;
  const intakeReady = intakeReadyOnDisk(consortDir);
  const breakdownDone = Array.isArray(spec?.stories) && spec.stories.length > 0;
  const requestsAuthored = fs8.existsSync(featureRequestMd(consortDir, featureId));
  const backlogCommitted = requestsAuthored;
  const deployed = fs8.existsSync(featureDeployEvidenceJson(consortDir, featureId));
  const gateApproved = readGateApproved(featureId, consortDir, "deploy");
  const verifyAssessEligible = deployVerifyNeedsAssess(consortDir, featureId);
  const verifyRefactorPending = deployVerifyRefactorPending(consortDir, featureId);
  const proj = projectDir ?? path3.dirname(consortDir);
  let scmState;
  try {
    scmState = (0, import_lakebase8.readWorkflowState)(proj)?.state;
  } catch {
    scmState = void 0;
  }
  const atOrPast = (target) => {
    if (!scmState) return false;
    const i = import_lakebase8.SCM_STATES.indexOf(scmState);
    const t = import_lakebase8.SCM_STATES.indexOf(target);
    return i >= 0 && t >= 0 && i >= t;
  };
  const promote = {
    prReady: atOrPast("pr-ready"),
    ciGreen: atOrPast("ci-green"),
    prApproved: readGateApproved(featureId, consortDir, "promote"),
    merged: scmState === "merged"
  };
  const loop = resolveProjectSettings(proj).build.loopGranularity;
  return {
    phase: driverPhaseForTdd(tddPhase),
    breakdownDone,
    loop,
    planning: { intakeReady, intakeApproved: intakeApprovedOnDisk(consortDir), proposed, estimated: hasEstimates(consortDir), backlogCommitted, requestsAuthored },
    deploy: { deployed, gateApproved, verifyAssessEligible, verifyRefactorPending },
    promote
  };
}
function readGateApproved(featureId, consortDir, gate) {
  try {
    return readGates(featureId, { consortDir }).gates[gate].status === "approved";
  } catch {
    return false;
  }
}
function diskArtifactProbe(consortDir, featureId, buildActive) {
  return {
    hasAcs(story) {
      return storyAcIds(consortDir, featureId, story).length > 0;
    },
    architectAnnotated(story) {
      const acs = storyAcIds(consortDir, featureId, story);
      if (acs.length === 0) return false;
      const everyAcNoted = acs.every((ac) => readAcArchitecturalNotes(consortDir, featureId, ac) !== void 0);
      return everyAcNoted && fs8.existsSync(architectureJson(consortDir, featureId));
    },
    dbaDesigned() {
      const archFile = architectureJson(consortDir, featureId);
      if (!fs8.existsSync(archFile)) return false;
      let archContent;
      try {
        archContent = fs8.readFileSync(archFile, "utf8");
      } catch {
        return false;
      }
      const dbFile = dbDesignJson(consortDir, featureId);
      let dbContent;
      if (fs8.existsSync(dbFile)) {
        try {
          dbContent = fs8.readFileSync(dbFile, "utf8");
        } catch {
          dbContent = void 0;
        }
      }
      return checkDbDesign(dbContent, archContent).ok;
    },
    architectProjectable(story) {
      if (!fs8.existsSync(architectureJson(consortDir, featureId))) return false;
      const canon = readCanon(consortDir);
      if (!canon) return false;
      if (canon.established_by === featureId) return false;
      if (priorReviseCount(consortDir, "architect-canon-gap", story) > 0) return false;
      const acs = storyAcIds(consortDir, featureId, story);
      if (acs.length === 0) return false;
      const layers = acs.map((ac) => readAcLayer2(consortDir, featureId, ac));
      if (layers.some((l) => !l)) return false;
      return !architectNovelty(canon, layers.map((l) => ({ layer: l }))).novel;
    },
    testListReady(story) {
      const file = storyTestListJson(consortDir, featureId, story);
      if (!fs8.existsSync(file)) return false;
      try {
        const data = JSON.parse(fs8.readFileSync(file, "utf8"));
        return Array.isArray(data.items) && data.items.length > 0;
      } catch {
        return false;
      }
    },
    designFingerprint(story) {
      return storyDesignFingerprint(consortDir, featureId, story);
    },
    reflectionPassed(story) {
      return reflectionPassed(consortDir, featureId, story);
    },
    reflectionVerdictWritten(story) {
      return reflectionVerdictWritten(consortDir, featureId, story);
    },
    // The build loop is TEST-LIST-DRIVEN: the Navigator/Driver hand off ONE test
    // at a time (write RED -> make GREEN) until EVERY test-list item is green.
    // `testsWritten` = "the Navigator has nothing to write right now" (a RED
    // already awaits the Driver, OR all tests are green); `codeWritten` = "every
    // test-list item has a GREEN cycle". With nextBuildAction's order
    // (!testsWritten -> navigator; !codeWritten -> driver) this yields the
    // interleaved per-test handoff: RED T1 -> GREEN T1 -> RED T2 -> ... Without
    // it the loop advanced after a single test and stalled at await-acceptance
    // with the rest of the list unbuilt (the live stall).
    testsWritten(story) {
      const p = storyTestProgress(consortDir, featureId, story);
      if (p.total === 0) {
        return storyCycles2(consortDir, featureId, story).some((c) => Boolean(c.red_at));
      }
      return p.openRed.length > 0 || p.allGreen;
    },
    codeWritten(story) {
      const p = storyTestProgress(consortDir, featureId, story);
      if (p.total === 0) {
        const reds = storyCycles2(consortDir, featureId, story).filter((c) => Boolean(c.red_at));
        return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
      }
      return p.allGreen;
    },
    reviewPendingAc(story) {
      return firstReviewPendingAc(consortDir, featureId, story);
    },
    refactorPendingAc(story) {
      return firstRefactorPendingAc(consortDir, featureId, story);
    },
    reviewPending(story) {
      return reviewPending(consortDir, featureId, story);
    },
    refactorPending(story) {
      return refactorPending(consortDir, featureId, story);
    },
    assessGreenFailureAc(story) {
      let acId;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = void 0;
      }
      if (!acId) return null;
      return needsGreenAssess(consortDir, featureId, story, acId) ? acId : null;
    },
    repairRegressionFixAc(story) {
      let acId;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = void 0;
      }
      if (!acId) return null;
      return hasPendingRegressionFix(consortDir, featureId, story, acId) ? acId : null;
    },
    greenSupersededFailureAc(story) {
      let acId;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = void 0;
      }
      if (!acId) return null;
      return hasPendingSupersession(consortDir, featureId, story, acId) ? acId : null;
    },
    specDefectAc(story) {
      let acId;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = void 0;
      }
      if (!acId) return null;
      return hasPendingSpecDefect(consortDir, featureId, story, acId) ? acId : null;
    },
    specDefectFromRole(story) {
      let acId;
      try {
        acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = void 0;
      }
      return acId ? specDefectFromRole(consortDir, featureId, story, acId) : "test-strategist";
    },
    storyDeployVerified(story) {
      return storyDeployVerified(consortDir, featureId, story);
    },
    deployVerifyAssessEligible(story) {
      return deployVerifyNeedsAssess(consortDir, featureId, story);
    },
    deployVerifyRefactorPending(story) {
      return deployVerifyRefactorPending(consortDir, featureId, story);
    },
    refactorVerifyAssessEligible(story) {
      return refactorVerifyNeedsAssess(consortDir, featureId, story);
    },
    refactorVerifyRefactorPending(story) {
      return refactorVerifyRefactorPending(consortDir, featureId, story);
    },
    pendingEscalation() {
      const e = firstPendingEscalation(consortDir, featureId);
      if (!e) return null;
      const base = {
        id: e.id,
        source: e.source,
        reason: e.reason,
        ...e.story_id ? { story_id: e.story_id } : {}
      };
      if (e.source.startsWith("smell:")) {
        const name = e.source.slice("smell:".length);
        const story = e.story_id ?? buildActive ?? void 0;
        if (isBuildRefactorRoutableSmell(name) && story && (refactorPending(consortDir, featureId, story) || firstRefactorPendingAc(consortDir, featureId, story))) {
          return null;
        }
        const spec = specLevelSmell(name);
        if (spec && story) {
          let budgetSpent;
          if (isReflectSmell(name)) {
            const revises = priorReflectReviseCount(consortDir, story);
            if (revises >= REFLECT_REVISE_CAP) {
              budgetSpent = true;
            } else if (revises === 0) {
              budgetSpent = false;
            } else {
              const lastSha = lastReflectReviseFingerprint(consortDir, story);
              const curSha = storyTestListFingerprint(consortDir, featureId, story);
              budgetSpent = lastSha !== null && lastSha === curSha;
            }
          } else {
            budgetSpent = priorReviseCount(consortDir, name, story) >= 1;
          }
          if (!budgetSpent) {
            base.routable = { story, owning_role: spec.owning_role, gate: spec.gate_to_rerun };
          }
        }
      }
      return base;
    }
  };
}

// consort/gates/design-spec-gate.ts
init_cjs_shims();

// consort/experiment/spike-carryforward.ts
init_cjs_shims();

// consort/pipeline/story-pipeline.ts
init_cjs_shims();
var import_fs13 = require("fs");

// consort/gates/gate-conformance-guard.ts
init_cjs_shims();
var import_node_fs9 = require("fs");
var import_node_path11 = require("path");

// consort/architecture/architecture-conventions.ts
init_cjs_shims();
var import_fs12 = require("fs");
function readConventions(consortDir) {
  const f = architectureConventionsJson(consortDir);
  if (!(0, import_fs12.existsSync)(f)) return void 0;
  try {
    return JSON.parse((0, import_fs12.readFileSync)(f, "utf8"));
  } catch {
    return void 0;
  }
}

// consort/logging/gate-decision-log.ts
init_cjs_shims();

// consort/pipeline/story-pipeline.ts
function initPipeline(featureId) {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}
function pipelinePath(consortDir, featureId) {
  return pipelineJson(consortDir, featureId);
}
function readPipeline(consortDir, featureId) {
  const p = pipelinePath(consortDir, featureId);
  if (!(0, import_fs13.existsSync)(p)) return initPipeline(featureId);
  return JSON.parse((0, import_fs13.readFileSync)(p, "utf8"));
}

// consort/orchestrator/status/feature-status.ts
function summarizeStories(consortDir, featureId) {
  let pipeline;
  try {
    pipeline = readPipeline(consortDir, featureId);
  } catch {
    return [];
  }
  return Object.entries(pipeline.stories).map(([story_id, e]) => ({
    story_id,
    status: e.status,
    gate_status: e.gate?.status ?? null,
    accepted: e.acceptance?.decision === "accepted" || e.status === "done"
  }));
}
function deriveFeaturePhase(stories) {
  if (stories.length === 0) return null;
  if (stories.every((s) => s.status === "done" && s.accepted)) return "complete";
  const inBuild = (s) => s.status === "ready" || s.status === "building" || s.status === "awaiting-acceptance" || s.status === "done" || s.gate_status === "approved";
  if (stories.some(inBuild)) return "build";
  return "design";
}

// consort/orchestrator/drive/orchestrator-effects.ts
init_cjs_shims();
var fs18 = __toESM(require("fs"), 1);
var import_node_path22 = require("path");

// consort/orchestrator/steps/manifest.ts
init_cjs_shims();
var import_node_fs10 = require("fs");
var import_node_path12 = require("path");

// consort/orchestrator/steps/manifests/product-owner-intake.json
var product_owner_intake_default = {
  id: "product-owner-intake",
  role: "product-owner",
  agent: { kind: "claude", config: { role: "product-owner" } },
  match: { kind: "invoke-role", role: "product-owner", mode: "intake" },
  inputs: [
    { id: "answers", source: "feature:intake/answers.md", optional: true, description: "The human's interview answers, gathered by the coordinating session and written to intake/answers.md. OPTIONAL: the PO drafts from the stated intent + the canon; a fresh project may have thin answers, and never invents beyond them." }
  ],
  outputs: [
    { id: "product-overview", filename: "product-overview.md", channel: "artifact", validator: "productOverviewConformant", description: "The PO's project overview (product-overview.md), drafted from the human's answers + @ui-ux-design-principles framing." },
    { id: "nfrs", filename: "nfrs.md", channel: "artifact", validator: "nfrsConformant", description: "The NFR brief (nfrs.md): ## Required R<n> items across the @software-design-principles categories, plus ## Preferences / ## Out of bounds." },
    { id: "design-brief", filename: "design/design-brief.md", channel: "artifact", optional: true, validator: "designBriefConformant", description: "The UX design brief (design/design-brief.md) , UI track only, so OPTIONAL (a backend-only project produces none)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "fresh",
    resumeKeyFrom: "role"
  }
};

// consort/orchestrator/steps/manifests/product-owner-author-requests.json
var product_owner_author_requests_default = {
  id: "product-owner-author-requests",
  role: "product-owner",
  agent: { kind: "claude", config: { role: "product-owner" } },
  match: { kind: "invoke-role", role: "product-owner", mode: "author-requests" },
  inputs: [
    { id: "product-overview", source: "feature:product-overview.md", optional: true, description: "The PO's product overview , the framing each committed feature-request is drafted from. OPTIONAL so a hermetic dispatch does not fail on its absence." },
    { id: "nfrs", source: "feature:nfrs.md", optional: true, description: "The PO's non-functional requirements each committed feature-request accounts for. OPTIONAL." },
    { id: "feature-proposals", source: "feature:planning/feature-proposals.md", optional: true, description: "The Spec Author's candidate proposals; the committed feature-request draws its scope from the matching section. OPTIONAL." }
  ],
  outputs: [],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "fresh",
    resumeKeyFrom: "role"
  },
  postTurn: [
    { bin: "@sync-backlog", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/spec-author-breakdown.json
var spec_author_breakdown_default = {
  id: "spec-author-breakdown",
  role: "spec-author",
  agent: { kind: "claude", config: { role: "spec-author" } },
  match: { kind: "invoke-role", role: "spec-author", mode: "breakdown" },
  inputs: [
    { id: "product-overview", source: "feature:product-overview.md", description: "The PO's product overview (product-overview.md)." },
    { id: "nfrs", source: "feature:nfrs.md", description: "The PO's non-functional requirements brief (nfrs.md)." },
    { id: "feature-request", source: "feature:features/{feature}/feature-request.md", description: "The PO's feature request for this feature (features/<feature>/feature-request.md; {feature} expands to the run's feature id)." }
  ],
  outputs: [
    { id: "feature-spec", filename: "feature-spec.json", channel: "artifact", validator: "featureSpecNonEmptyStories", description: "The feature breakdown index (feature-spec.json + a story stub per story). A .consort design document , the artifact channel." },
    { id: "agent-log", filename: "agent-log.jsonl", channel: "meta", validator: "agentLogHasRoleEvent", description: "The agent's structured log of what it did + any issue surfaced (meta channel; shared agent-log script; agent-log-event.schema.json)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "sonnet",
    effort: "low",
    session: "fresh",
    resumeKeyFrom: "role"
  },
  postTurn: [
    { bin: "PIPELINE_BIN", args: ["reset-breakdown", "--tdd"], when: "before" },
    { bin: "PIPELINE_BIN", args: ["sync-breakdown", "--tdd"], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/spec-author-propose.json
var spec_author_propose_default = {
  id: "spec-author-propose",
  role: "spec-author",
  agent: { kind: "claude", config: { role: "spec-author" } },
  match: { kind: "invoke-role", role: "spec-author", mode: "propose" },
  inputs: [
    { id: "product-overview", source: "feature:product-overview.md", description: "The PO's product overview , the framing the candidate features are proposed from (product-overview.md)." },
    { id: "nfrs", source: "feature:nfrs.md", description: "The PO's non-functional requirements the proposal accounts for (nfrs.md)." }
  ],
  outputs: [
    { id: "feature-proposals", filename: "planning/feature-proposals.md", channel: "artifact", validator: "nonEmptyFile", description: "The sprint's candidate features, one per section, for the Architect to size + the PO to commit. The post-turn verify-artifact asserts planning/feature-proposals.md exists. Sprint-scoped, so NO reconcile (writes no feature artifact)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "role"
  }
};

// consort/orchestrator/steps/manifests/spec-author-story.json
var spec_author_story_default = {
  id: "spec-author-story",
  role: "spec-author",
  agent: { kind: "claude", config: { role: "spec-author" } },
  match: { kind: "invoke-role", role: "spec-author", mode: null, buildMode: null },
  inputs: [
    { id: "story-stub", source: "story:story.json", description: "The story stub (asA/iWantTo/soThat) the Spec Author drafts ACs for." },
    { id: "product-overview", source: "feature:product-overview.md", description: "The PO's product overview , the feature framing (product-overview.md)." }
  ],
  outputs: [
    { id: "acs", filename: "acs", channel: "artifact", validator: "acsDirConformant", description: "The per-story acceptance criteria , the acs/ DIRECTORY (one acs/<AC>.json per AC, each named after the AC it authors). acsDirConformant asserts the dir is non-empty AND every acs/*.json conforms to ac.json (the deterministic floor the legacy verify-artifact + design gate enforced)." },
    { id: "agent-log", filename: "agent-log.jsonl", channel: "meta", validator: "agentLogHasRoleEvent", description: "The spec-author's structured log of the ACs it authored (shared agent-log script; agent-log-event.schema.json)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "role"
  }
};

// consort/orchestrator/steps/manifests/architect-estimator.json
var architect_estimator_default = {
  id: "architect-estimator",
  role: "architect-reviewer",
  agent: { kind: "claude", config: { role: "architect-reviewer" } },
  match: { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" },
  inputs: [
    { id: "feature-proposals", source: "feature:planning/feature-proposals.md", description: "The Spec Author's candidate features the Architect t-shirt sizes (planning/feature-proposals.md)." }
  ],
  outputs: [
    { id: "estimates", filename: "planning/estimates.json", channel: "artifact", validator: "nonEmptyFile", description: "The per-candidate t-shirt sizes (XS/S/M/L/XL) the PO commits a sprint-fitting backlog from. The post-turn verify-artifact asserts planning/estimates.json exists. Sprint-scoped, so NO reconcile. Matches the plain 'estimate' mode only, NOT 'estimate-committed' (which re-syncs the backlog)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "role"
  }
};

// consort/orchestrator/steps/manifests/architect-reviewer.json
var architect_reviewer_default = {
  id: "architect-reviewer",
  role: "architect-reviewer",
  agent: { kind: "claude", config: { role: "architect-reviewer" } },
  match: { kind: "invoke-role", role: "architect-reviewer", mode: null },
  inputs: [
    { id: "acs", source: "story:acs", description: "The story's acceptance criteria the Architect annotates with per-AC architectural_notes." },
    { id: "nfrs", source: "feature:nfrs.md", description: "The PO's non-functional requirements the architecture must cover (nfrs.md)." }
  ],
  outputs: [
    { id: "architecture", filename: "architecture.json", channel: "artifact", validator: "nonEmptyFile", description: "The feature architecture (service_backed, layers, persistence_invariants). The post-turn verify-artifact asserts architecture.json exists under the resolved root." },
    { id: "agent-log", filename: "agent-log.jsonl", channel: "meta", validator: "architectReviewerLoggedAuthoring", description: "The Architect Reviewer's structured log of the per-AC notes + architecture.json it authored." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "role"
  }
};

// consort/orchestrator/steps/manifests/dba.json
var dba_default = {
  id: "dba",
  role: "dba",
  agent: { kind: "claude", config: { role: "dba" } },
  match: { kind: "invoke-role", role: "dba" },
  inputs: [
    { id: "architecture", source: "feature:features/{feature}/architecture.json", description: "The Architect's logical contract (service_backed, layers, persistence_invariants) the DBA physically realizes , NOT re-authored. Feature-scoped: the {feature} placeholder expands to the run's feature id (the real on-disk location, features/<F>/architecture.json)." }
  ],
  outputs: [
    { id: "db-design", filename: "db-design.json", channel: "artifact", validator: "nonEmptyFile", description: "The physical schema (tables + per-story schema_changes + realizes_invariants). A non-persisting or non-service-backed feature may leave this empty, so there is NO post-turn verify-artifact for the DBA (designArtifactExpectation returns null)." },
    { id: "agent-log", filename: "agent-log.jsonl", channel: "meta", validator: "dbaLoggedAuthoring", description: "The DBA's structured log of the physical schema it realized." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "role"
  }
};

// consort/orchestrator/steps/manifests/test-strategist.json
var test_strategist_default = {
  id: "test-strategist",
  role: "test-strategist",
  agent: { kind: "claude", config: { role: "test-strategist" } },
  match: {
    kind: "invoke-role",
    role: "test-strategist"
  },
  inputs: [
    {
      id: "acs",
      source: "story:acs",
      description: "The story's acceptance criteria , each test's ac_id maps to one of these."
    },
    {
      id: "architecture",
      source: "feature:features/{feature}/architecture.json",
      description: "The architecture (persistence_invariants) each real-branch fitness test must cover. Feature-scoped: {feature} expands to the run's feature id (features/<F>/architecture.json)."
    },
    {
      id: "db-design",
      source: "feature:features/{feature}/db-design.json",
      description: "The DBA's concrete tables/constraints the invariant tests assert against. Feature-scoped: {feature} expands to the run's feature id (features/<F>/db-design.json)."
    }
  ],
  preconditions: [
    {
      id: "test-analyst-roster",
      kind: "test-analyst-roster",
      position: "append",
      description: "The ENABLED per-kind test-analyst roster (behavior/fitness/client; client omitted when the project's uiTrack is off) + each analyst's focus prompt, projected from the TEST_ANALYST_CATALOGUE. The supervisor Task-spawns one subagent per entry, then reconciles + assembles."
    }
  ],
  outputs: [
    {
      id: "test-list",
      filename: "test-list.json",
      channel: "artifact",
      validator: "nonEmptyFile",
      description: "The feature master test list (this story's ordered tests appended). The post-turn verify-artifact asserts test-list.json exists under the resolved root."
    },
    {
      id: "agent-log",
      filename: "agent-log.jsonl",
      channel: "meta",
      validator: "testStrategistLoggedAuthoring",
      description: "The Test Strategist's structured log of the test-list it authored for the story."
    }
  ],
  routing: {
    produced: {
      next: "state-derived"
    }
  },
  agentOptions: {
    model: "sonnet",
    effort: "low",
    session: "resume",
    resumeKeyFrom: "role"
  },
  postTurn: [
    {
      bin: "TEST_LIST_BIN",
      args: [
        "{tddDir}",
        "{feature}",
        "{story}"
      ],
      when: "after"
    }
  ]
};

// consort/orchestrator/steps/manifests/driver-green.json
var driver_green_default = {
  id: "driver-green",
  role: "driver",
  agent: { kind: "claude", config: { role: "driver" } },
  match: { kind: "invoke-role", role: "driver", buildMode: null },
  inputs: [
    { id: "test-list", source: "story:test-list-per-story.json", description: "The story's ordered failing tests the Driver makes GREEN (story-level, or per-AC when the action carries an `ac`)." }
  ],
  outputs: [
    { id: "code", filename: "app", channel: "product", validator: "driverCodePresent", description: "The PRODUCT code the Driver wrote at the project root to make the RED pass (app/ , the primary in-turn produced signal). The real correctness gate is the post-turn @build-cycle honest-GREEN verify (alembic upgrade + the project's tests against a live branch), which flips codeWritten , this floor just proves the driver produced code." },
    { id: "agent-log", filename: "agent-log.jsonl", channel: "meta", validator: "driverLoggedAuthoring", description: "The Driver's authoring log (meta channel; materialized by the post-turn reconcile)." }
  ],
  raises: ["green-failure"],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "medium",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/ux-designer.json
var ux_designer_default = {
  id: "ux-designer",
  role: "ux-designer",
  agent: { kind: "claude", config: { role: "ux-designer" } },
  match: { kind: "invoke-role", role: "ux-designer" },
  inputs: [
    { id: "design-guideline", source: "feature:design/design-brief.md", description: "The HIL design brief the UX Designer extracts the look FROM. Lives under design/ on the real tree (design/design-brief.md, per intake.ts)." },
    { id: "product-overview", source: "feature:product-overview.md", description: "The PO's product overview , which stories produce screens (product-overview.md)." }
  ],
  outputs: [
    { id: "design-guide", filename: "design-guide.json", channel: "artifact", validator: "designGuideConformant", description: "The machine-checkable design tokens + components (design-guide.schema.json). The narrative design-guide.md + ia.md are authored alongside but the JSON is the gated artifact." },
    { id: "agent-log", filename: "agent-log.jsonl", channel: "meta", validator: "uxDesignerLoggedAuthoring", description: "The UX Designer's structured log of what it authored (shared agent-log script; agent-log-event.schema.json)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "low",
    session: "fresh",
    resumeKeyFrom: "role"
  }
};

// consort/orchestrator/steps/manifests/navigator-red.json
var navigator_red_default = {
  id: "navigator-red",
  role: "navigator",
  agent: { kind: "claude", config: { role: "navigator" } },
  match: { kind: "invoke-role", role: "navigator", buildMode: null },
  inputs: [
    { id: "test-list", source: "story:test-list-per-story.json", description: "The story's ordered test list , the Navigator authors ONE batch RED covering it." },
    { id: "acs", source: "story:acs", description: "The story's acceptance criteria the failing tests encode." }
  ],
  outputs: [
    { id: "tests", filename: "tests", channel: "product", validator: "navigatorTestsAuthored", description: "The RED test tree the Navigator authored at the project root (non-empty tests/ , the PRODUCT channel)." },
    { id: "agent-log", filename: "agent-log.jsonl", channel: "meta", validator: "navigatorLoggedAuthoring", description: "The Navigator's authoring log (meta channel; shared agent-log script)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "sonnet",
    effort: "low",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/navigator-review.json
var navigator_review_default = {
  id: "navigator-review",
  role: "navigator",
  agent: { kind: "claude", config: { role: "navigator" } },
  match: { kind: "invoke-role", role: "navigator", buildMode: "review" },
  inputs: [
    { id: "code", source: "story:code", optional: true, description: "The Driver's implementation the Navigator critiques. OPTIONAL: 'code' is the project tree (client/src, app/\u2026) the UNCONTAINED agent reads directly, NOT a `.consort` artifact file \u2014 there is no <storyDir>/code path to presence-check, so a required gate here fails loud on every review turn. The agent reads the real code itself." },
    { id: "acs", source: "story:acs", description: "The acceptance criteria the review holds the code to." }
  ],
  raises: ["review-verdict"],
  outputs: [],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "sonnet",
    effort: "low",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/navigator-reflect.json
var navigator_reflect_default = {
  id: "navigator-reflect",
  role: "navigator",
  agent: { kind: "claude", config: { role: "navigator" } },
  match: { kind: "invoke-role", role: "navigator", buildMode: "reflect" },
  inputs: [
    { id: "acs", source: "story:acs", description: "The story's acceptance criteria (acs/ dir) , the core design artifact the reflect turn critiques for a spec-level blocking smell before build. story:acs resolves to storyResolved/acs, always present by reflect time (spec-author authors it before the architect/dba/test-strategist/reflect sequence); the prior 'story:design' had no writer/resolver and failed loud." }
  ],
  outputs: [],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "sonnet",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/navigator-assess.json
var navigator_assess_default = {
  id: "navigator-assess",
  role: "navigator",
  agent: { kind: "claude", config: { role: "navigator" } },
  match: { kind: "invoke-role", role: "navigator", buildMode: "assess" },
  inputs: [
    { id: "green-failure", source: "cycle:green-failure.json", description: "The failed-GREEN marker (+ pre-localized superseded-test candidates) the Navigator discriminates. Written per-cycle (cycleDir); the assess route carries an `ac`, so it resolves at cycle scope , NOT story (the #735 scope-mismatch fix)." },
    { id: "acs", source: "story:acs", description: "The AC whose intent decides superseded vs genuine regression." }
  ],
  preconditions: [
    { id: "advisory", kind: "green-failure-advisory", position: "prepend", description: "The deterministic PRE-LOCALIZATION (verify failure output + contract-clean refs + superseded-test candidates) projected from green-failure.json , PREPENDED before the ASSESS directive so the Navigator starts from the real failure, not a re-scan." }
  ],
  requiresEvents: ["green-failure"],
  raises: ["superseded-tests", "regression-assessment"],
  outputs: [],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/navigator-assess-deploy.json
var navigator_assess_deploy_default = {
  id: "navigator-assess-deploy",
  role: "navigator",
  agent: { kind: "claude", config: { role: "navigator" } },
  match: { kind: "invoke-role", role: "navigator", buildMode: "assess-deploy" },
  inputs: [
    { id: "deploy-verify-assess", source: "story:deploy-verify-assess.json", description: "The story-level deploy-verify failure marker the Navigator scopes for contamination-fragile tests." }
  ],
  outputs: [
    { id: "scope", filename: "deploy-verify-scope.json", channel: "meta", validator: "deployVerifyScopeConformant", optional: true, description: "The scope directives the Driver's refactor-deploy reads , OPTIONAL: the Navigator writes it when it confirms contamination-fragile tests, and writes NOTHING (its veto -> escalate) when it judges the classifier wrong. Absent = a clean pass (the escalation route); present = validated (a malformed scope is a hard reject)." }
  ],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/navigator-assess-refactor.json
var navigator_assess_refactor_default = {
  id: "navigator-assess-refactor",
  role: "navigator",
  agent: { kind: "claude", config: { role: "navigator" } },
  match: { kind: "invoke-role", role: "navigator", buildMode: "assess-refactor" },
  inputs: [
    { id: "refactor-verify-assess", source: "story:refactor-verify-assess.json", description: "The refactor-verify failure marker (written by refactorStory as refactor-verify-assess.json) the Navigator discriminates for superseded tests vs a genuine regression." }
  ],
  outputs: [],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/driver-refactor.json
var driver_refactor_default = {
  id: "driver-refactor",
  role: "driver",
  agent: {
    kind: "claude",
    config: {
      role: "driver"
    }
  },
  match: {
    kind: "invoke-role",
    role: "driver",
    buildMode: "refactor"
  },
  inputs: [
    {
      id: "code",
      source: "story:code",
      optional: true,
      description: "The GREEN implementation the Driver restructures (behavior-preserving). OPTIONAL: 'code' is the project tree the UNCONTAINED agent reads directly, NOT a `.consort` artifact file \u2014 there is no <storyDir>/code path to presence-check, so a required gate fails loud on every refactor turn. The agent reads the real code itself."
    }
  ],
  preconditions: [
    {
      id: "pack",
      kind: "context-pack",
      position: "append",
      description: "The context pack (rubric + module layout) APPENDED after the refactor directive so the Driver restructures against the known layout without re-reading the design tree."
    }
  ],
  requiresEvents: [
    "review-verdict"
  ],
  outputs: [],
  routing: {
    produced: {
      next: "state-derived"
    }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    {
      bin: "@build-cycle",
      args: [],
      when: "after"
    }
  ]
};

// consort/orchestrator/steps/manifests/driver-refactor-deploy.json
var driver_refactor_deploy_default = {
  id: "driver-refactor-deploy",
  role: "driver",
  agent: {
    kind: "claude",
    config: {
      role: "driver"
    }
  },
  match: {
    kind: "invoke-role",
    role: "driver",
    buildMode: "refactor-deploy"
  },
  inputs: [
    {
      id: "deploy-verify-scope",
      source: "story:deploy-verify-scope.json",
      description: "The contamination-fragile tests the Navigator flagged , the Driver edits ONLY these (no product code)."
    }
  ],
  outputs: [],
  routing: {
    produced: {
      next: "state-derived"
    }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    {
      bin: "@build-cycle",
      args: [],
      when: "after"
    }
  ]
};

// consort/orchestrator/steps/manifests/driver-refactor-superseded.json
var driver_refactor_superseded_default = {
  id: "driver-refactor-superseded",
  role: "driver",
  agent: {
    kind: "claude",
    config: {
      role: "driver"
    }
  },
  match: {
    kind: "invoke-role",
    role: "driver",
    buildMode: "refactor-superseded"
  },
  inputs: [
    {
      id: "superseded-tests",
      source: "story:superseded-tests.json",
      description: "The superseded tests the Navigator flagged during refactor-verify , the Driver edits ONLY these."
    }
  ],
  outputs: [],
  routing: {
    produced: {
      next: "state-derived"
    }
  },
  agentOptions: {
    model: "opus",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    {
      bin: "@build-cycle",
      args: [],
      when: "after"
    }
  ]
};

// consort/orchestrator/steps/manifests/driver-repair.json
var driver_repair_default = {
  id: "driver-repair",
  role: "driver",
  agent: { kind: "claude", config: { role: "driver" } },
  match: { kind: "invoke-role", role: "driver", buildMode: "repair" },
  inputs: [
    { id: "regression-assessment", source: "cycle:regression-assessment.json", description: "The Navigator's genuine-regression diagnosis , the Driver's one bounded repair attempt fixes the product code. Written per-cycle (cycleDir); the repair route carries an `ac`, so it resolves at cycle scope , NOT story (same scope-mismatch class as #735)." }
  ],
  requiresEvents: ["regression-assessment"],
  outputs: [],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "sonnet",
    effort: "default",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifests/driver-green-superseded.json
var driver_green_superseded_default = {
  id: "driver-green-superseded",
  role: "driver",
  agent: { kind: "claude", config: { role: "driver" } },
  match: { kind: "invoke-role", role: "driver", buildMode: "green-superseded" },
  inputs: [
    { id: "test-list", source: "story:test-list-per-story.json", description: "The story's tests the Driver makes GREEN after a superseded-test refactor re-opened the cycle." }
  ],
  outputs: [],
  routing: {
    produced: { next: "state-derived" }
  },
  agentOptions: {
    model: "opus",
    effort: "medium",
    session: "resume",
    resumeKeyFrom: "story"
  },
  postTurn: [
    { bin: "@build-cycle", args: [], when: "after" }
  ]
};

// consort/orchestrator/steps/manifest.ts
var SHIPPED_MANIFESTS = [
  product_owner_intake_default,
  product_owner_author_requests_default,
  spec_author_breakdown_default,
  spec_author_propose_default,
  spec_author_story_default,
  architect_estimator_default,
  architect_reviewer_default,
  dba_default,
  test_strategist_default,
  driver_green_default,
  ux_designer_default,
  navigator_red_default,
  navigator_review_default,
  navigator_reflect_default,
  navigator_assess_default,
  navigator_assess_deploy_default,
  navigator_assess_refactor_default,
  driver_refactor_default,
  driver_refactor_deploy_default,
  driver_refactor_superseded_default,
  driver_repair_default,
  driver_green_superseded_default
];
var STORY_SCOPED_ROLES = /* @__PURE__ */ new Set(["dba", "test-strategist", "driver", "spec-author", "architect-reviewer"]);
function actionFromManifestMatch(match, role) {
  const a = {};
  for (const [k, v] of Object.entries(match)) {
    if (v === null) continue;
    a[k] = v;
  }
  const hasMode = "mode" in match && match.mode !== null;
  const hasBuildMode = "buildMode" in match && match.buildMode !== null;
  if (STORY_SCOPED_ROLES.has(role) && !hasMode && !hasBuildMode && !("story" in a)) {
    a.story = "S1-representative";
  }
  return a;
}
function agentOptionsForStep(role, turnKey, keyForAction, manifests = SHIPPED_MANIFESTS) {
  let hit;
  for (const m of manifests) {
    if (m.role !== role) continue;
    if (keyForAction(actionFromManifestMatch(m.match, m.role)) !== turnKey) continue;
    const cur = { model: m.agentOptions.model, effort: m.agentOptions.effort };
    if (hit && (hit.model !== cur.model || (hit.effort ?? "default") !== (cur.effort ?? "default"))) {
      throw new Error(
        `step-manifest: conflicting agentOptions for (${role}, ${turnKey}) \u2013 two manifests declare different model/effort for the same resolved step. Make them agree (collapsed buildModes share one lever set).`
      );
    }
    hit = cur;
  }
  return hit;
}
function matchesAction(match, action) {
  const act = action;
  for (const [k, v] of Object.entries(match)) {
    if (v === null) {
      if (act[k] !== void 0) return false;
      continue;
    }
    if (!deepEqual(v, act[k])) return false;
  }
  return true;
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a;
  const bo = b;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}
function manifestForAction(action, manifests = SHIPPED_MANIFESTS) {
  const hits = manifests.filter((m) => matchesAction(m.match, action));
  if (hits.length > 1) {
    const ids = hits.map((m) => m.id).join(", ");
    throw new Error(
      `step-manifest: ambiguous match \u2013 ${hits.length} manifests match action ${JSON.stringify(action)}: ${ids}. Each action must map to exactly one manifest; tighten a match.`
    );
  }
  return hits[0];
}

// consort/orchestrator/drive/executor-dispatch.ts
init_cjs_shims();
var fs16 = __toESM(require("fs"), 1);
var import_node_path20 = require("path");

// consort/orchestrator/turns/step-executor.ts
init_cjs_shims();
var import_node_fs11 = require("fs");
var import_node_path13 = require("path");

// consort/orchestrator/provisioning/channels.ts
init_cjs_shims();
function resolveChannelRoot(channel, roots) {
  return channel === "artifact" ? roots.artifactDir ?? roots.workspaceDir : channel === "meta" ? roots.metaDir ?? roots.workspaceDir : roots.workspaceDir;
}

// consort/orchestrator/turns/step-executor.ts
var MissingInputError = class extends Error {
  constructor(inputId, action) {
    super(`missing input "${inputId}" for step ${JSON.stringify(action)} \u2013 the orchestrator did not provide it (fail loud before spawning the agent)`);
    this.inputId = inputId;
    this.name = "MissingInputError";
  }
  inputId;
};
async function execute(step, ctx, deps) {
  const { action, cfg, state, validateBoundDeps } = ctx;
  const resolved = deps.resolveInputs(action, cfg);
  if ("missing" in resolved) {
    throw new MissingInputError(resolved.missing, action);
  }
  const { workspaceDir, artifactDir, metaDir, outputPaths } = deps.provisionWorkspace(action, cfg);
  const instructions = deps.instructionsFor(action, cfg);
  const overridden = action.kind === "invoke-role" && cfg.instructionsOverride?.(action) !== void 0;
  if (deps.prepare && !overridden) {
    const preconditions = step.preconditions(action);
    let prependBlocks = "";
    let appendBlocks = "";
    for (const pre of preconditions) {
      const block = deps.prepare(pre.kind, pre, action, cfg);
      if (block && block.length) {
        if (pre.position === "prepend") prependBlocks += block;
        else appendBlocks += block;
      } else {
        deps.onWarn?.(`declared precondition "${pre.id}" (${pre.kind}) prepared EMPTY \u2013 its source artifact may be absent (${pre.description})`);
      }
    }
    if (prependBlocks) instructions.prompt = prependBlocks + instructions.prompt;
    if (appendBlocks) instructions.prompt = instructions.prompt + appendBlocks;
  }
  await deps.preTurnEffects?.(action, cfg);
  const startedMs = Date.now();
  const runResult = await step.run({ action, workspaceDir, ...artifactDir ? { artifactDir } : {}, ...metaDir ? { metaDir } : {}, inputs: resolved, instructions, outputPaths });
  const outerDurationMs = Date.now() - startedMs;
  const producedPaths = runResult.producedPaths ?? [];
  const agentResult = step.lastAgentResult?.();
  await deps.materializeOutputs?.(workspaceDir, action, cfg);
  const outputSpecs = step.outputs(action);
  const noRequiredPrimary = outputSpecs.length === 0 || outputSpecs[0].optional === true;
  const violations = [];
  if (!runResult.produced) {
    if (runResult.missingInput) {
      violations.push(`missing input "${runResult.missingInput}"`);
    } else if (!noRequiredPrimary) {
      violations.push("the step's primary output was not produced in the workspace");
    }
  }
  for (const spec of outputSpecs) {
    const rel = outputPaths?.[spec.id] ?? spec.filename;
    const root = resolveChannelRoot(spec.channel, { workspaceDir, artifactDir, metaDir });
    const abs = producedPaths.find((p) => p.endsWith(rel)) ?? (0, import_node_path13.join)(root, rel);
    if (!(0, import_node_fs11.existsSync)(abs)) {
      if (!spec.optional && runResult.produced) violations.push(`declared output "${spec.id}" (${spec.filename}) was not produced`);
      continue;
    }
    const res = spec.validate(abs);
    if (!res.ok) violations.push(...res.violations.map((v) => `${spec.id}: ${v}`));
  }
  deps.onRecord?.({ action, producedPaths, violations, outerDurationMs, ...agentResult ? { agentResult } : {} });
  if (violations.length === 0) {
    await deps.postTurnEffects?.(action, cfg);
  }
  const proposal = violations.length === 0 ? step.route(action, { state, feature: cfg.featureId }) : { outcome: "blocked", proposedNext: action, reason: violations.join("; ") };
  const bounded = validateAndBound(proposal, action, state, validateBoundDeps);
  return { bounded, producedPaths, violations };
}

// consort/orchestrator/steps/step.ts
init_cjs_shims();
var import_node_path15 = require("path");
var import_node_fs13 = require("fs");

// consort/orchestrator/validators/conformance/validator-registry.ts
init_cjs_shims();
var import_node_fs12 = require("fs");
var import_node_path14 = require("path");
function featureSpecNonEmptyStories(producedPath) {
  let content;
  try {
    content = (0, import_node_fs12.readFileSync)(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`feature-spec.json not readable at ${producedPath}`] };
  }
  const conf = checkArtifactConformance("feature-spec.json", content);
  if (!conf.ok) return { ok: false, violations: conf.violations };
  try {
    const spec = JSON.parse(content);
    if (!Array.isArray(spec.stories) || spec.stories.length === 0) {
      return { ok: false, violations: ["feature-spec.json has an empty or missing stories[] (the breakdown must enumerate >=1 story)"] };
    }
  } catch (e) {
    return { ok: false, violations: [`feature-spec.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return { ok: true, violations: [] };
}
function agentLogHasRoleEvent(producedPath, role = "spec-author") {
  let raw;
  try {
    raw = (0, import_node_fs12.readFileSync)(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`agent-log.jsonl not readable at ${producedPath} (the agent must log what it did via the shared agent-log script)`] };
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, violations: ["agent-log.jsonl is empty (the agent must log at least one event: what it did / any issue surfaced)"] };
  }
  const validate = getValidator("agent-log-event.schema.json");
  const violations = [];
  let sawRoleEvent = false;
  for (const [i, line] of lines.entries()) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      violations.push(`agent-log.jsonl line ${i + 1} is not valid JSON`);
      continue;
    }
    if (!validate(obj)) {
      violations.push(`agent-log.jsonl line ${i + 1}: ${formatSchemaErrors(validate).join("; ")}`);
      continue;
    }
    if (obj.role === role) sawRoleEvent = true;
  }
  if (!sawRoleEvent && violations.length === 0) {
    violations.push(`agent-log.jsonl has no ${role} event (the role must log what it did)`);
  }
  return { ok: violations.length === 0, violations };
}
function nonEmptyFile(producedPath) {
  let content;
  try {
    content = (0, import_node_fs12.readFileSync)(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`file not readable at ${producedPath}`] };
  }
  if (content.trim().length === 0) {
    return { ok: false, violations: [`file at ${producedPath} is empty (expected authored content)`] };
  }
  return { ok: true, violations: [] };
}
function designGuideConformant(producedPath) {
  let content;
  try {
    content = (0, import_node_fs12.readFileSync)(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`design-guide.json not readable at ${producedPath}`] };
  }
  const conf = checkArtifactConformance("design-guide.json", content);
  return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
}
function conformsTo(artifactName) {
  return (producedPath) => {
    let content;
    try {
      content = (0, import_node_fs12.readFileSync)(producedPath, "utf8");
    } catch {
      return { ok: false, violations: [`${artifactName} not readable at ${producedPath}`] };
    }
    const conf = checkArtifactConformance(artifactName, content);
    return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
  };
}
function navigatorTestsAuthored(producedPath) {
  if (!(0, import_node_fs12.existsSync)(producedPath) || !(0, import_node_fs12.statSync)(producedPath).isDirectory()) {
    return { ok: false, violations: [`navigator RED wrote no tests/ tree at ${producedPath}`] };
  }
  const isTest = (n) => /\.(py|ts|tsx|js|jsx)$/.test(n);
  const walk2 = (dir) => {
    for (const e of (0, import_node_fs12.readdirSync)(dir, { withFileTypes: true })) {
      const abs = (0, import_node_path14.join)(dir, e.name);
      if (e.isDirectory()) {
        if (walk2(abs)) return true;
      } else if (isTest(e.name)) {
        return true;
      }
    }
    return false;
  };
  return walk2(producedPath) ? { ok: true, violations: [] } : { ok: false, violations: [`navigator RED tests/ tree at ${producedPath} has no test file (.py/.ts/.tsx/.js/.jsx)`] };
}
function driverCodePresent(producedPath) {
  if (!(0, import_node_fs12.existsSync)(producedPath) || !(0, import_node_fs12.statSync)(producedPath).isDirectory()) {
    return { ok: false, violations: [`driver GREEN wrote no product tree (app/ or src/) at ${producedPath}`] };
  }
  const isSource = (n) => /\.(py|ts|tsx|js|jsx)$/.test(n);
  const walk2 = (dir) => {
    for (const e of (0, import_node_fs12.readdirSync)(dir, { withFileTypes: true })) {
      const abs = (0, import_node_path14.join)(dir, e.name);
      if (e.isDirectory()) {
        if (walk2(abs)) return true;
      } else if (isSource(e.name)) {
        return true;
      }
    }
    return false;
  };
  return walk2(producedPath) ? { ok: true, violations: [] } : { ok: false, violations: [`driver GREEN product tree at ${producedPath} has no source file (.py/.ts/.tsx/.js/.jsx)`] };
}
function assessMarkerWritten(producedPath) {
  const sup = (0, import_node_path14.join)(producedPath, "superseded-tests.json");
  const reg = (0, import_node_path14.join)(producedPath, "regression-assessment.json");
  const hasSup = (0, import_node_fs12.existsSync)(sup);
  const hasReg = (0, import_node_fs12.existsSync)(reg);
  if (!hasSup && !hasReg) {
    return { ok: false, violations: [`assess wrote no marker (expected superseded-tests.json OR regression-assessment.json) in ${producedPath}`] };
  }
  if (hasSup) {
    try {
      const j = JSON.parse((0, import_node_fs12.readFileSync)(sup, "utf8"));
      if (!Array.isArray(j.tests) || j.tests.length === 0 || typeof j.reason !== "string" || !j.reason.trim()) {
        return { ok: false, violations: [`superseded-tests.json malformed (need non-empty tests[] + a reason) in ${producedPath}`] };
      }
    } catch (e) {
      return { ok: false, violations: [`superseded-tests.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  if (hasReg) {
    try {
      const j = JSON.parse((0, import_node_fs12.readFileSync)(reg, "utf8"));
      if (typeof j.diagnosis !== "string" || !j.diagnosis.trim()) {
        return { ok: false, violations: [`regression-assessment.json malformed (need a non-empty diagnosis) in ${producedPath}`] };
      }
    } catch (e) {
      return { ok: false, violations: [`regression-assessment.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  return { ok: true, violations: [] };
}
function acsDirConformant(producedPath) {
  if (!(0, import_node_fs12.existsSync)(producedPath) || !(0, import_node_fs12.statSync)(producedPath).isDirectory()) {
    return { ok: false, violations: [`spec-author wrote no acs/ dir at ${producedPath} (expected >=1 acs/<AC>.json)`] };
  }
  const acFiles = (0, import_node_fs12.readdirSync)(producedPath).filter((n) => n.endsWith(".json"));
  if (acFiles.length === 0) {
    return { ok: false, violations: [`acs/ dir at ${producedPath} holds no AC file (expected >=1 acs/<AC>.json)`] };
  }
  const violations = [];
  for (const name of acFiles) {
    let content;
    try {
      content = (0, import_node_fs12.readFileSync)((0, import_node_path14.join)(producedPath, name), "utf8");
    } catch {
      violations.push(`acs/${name} not readable`);
      continue;
    }
    const conf = checkArtifactConformance("ac.json", content);
    if (!conf.ok) violations.push(...conf.violations.map((v) => `acs/${name}: ${v}`));
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations };
}
function deployVerifyScopeConformant(producedPath) {
  let content;
  try {
    content = (0, import_node_fs12.readFileSync)(producedPath, "utf8");
  } catch {
    return { ok: false, violations: [`deploy-verify-scope.json not readable at ${producedPath}`] };
  }
  let scope;
  try {
    scope = JSON.parse(content);
  } catch (e) {
    return { ok: false, violations: [`deploy-verify-scope.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const violations = [];
  if (scope.version !== 1) violations.push(`deploy-verify-scope.json version must be 1 (got ${JSON.stringify(scope.version)})`);
  if (!Array.isArray(scope.directives)) {
    violations.push("deploy-verify-scope.json must carry a directives[] array");
  } else {
    scope.directives.forEach((d, i) => {
      const dir = d;
      if (typeof dir?.node_id !== "string" || !dir.node_id) violations.push(`directives[${i}].node_id must be a non-empty string`);
      if (typeof dir?.directive !== "string" || !dir.directive) violations.push(`directives[${i}].directive must be a non-empty string`);
    });
  }
  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations };
}
var acConformant = conformsTo("ac.json");
var architectureConformant = conformsTo("architecture.json");
var dbDesignConformant = conformsTo("db-design.json");
var testListConformant = conformsTo("test-list.json");
var productOverviewConformant = conformsTo("product-overview.md");
var nfrsConformant = conformsTo("nfrs.md");
var designBriefConformant = conformsTo("design-brief.md");
var VALIDATOR_REGISTRY = {
  featureSpecNonEmptyStories,
  agentLogHasRoleEvent: (p) => agentLogHasRoleEvent(p),
  // The PO's structured log event is authored as product-owner; bind that role.
  productOwnerLoggedAuthoring: (p) => agentLogHasRoleEvent(p, "product-owner"),
  // The UX Designer's structured log event is authored as ux-designer; bind that role.
  uxDesignerLoggedAuthoring: (p) => agentLogHasRoleEvent(p, "ux-designer"),
  // The Test Strategist's + Architect Reviewer's + DBA's log events, role-bound (used by the
  // route-scenario manifests that exercise those roles' escalation/produced routes, and by the
  // shipped design-role manifests whose logged-authoring output is the role's agent-log line).
  testStrategistLoggedAuthoring: (p) => agentLogHasRoleEvent(p, "test-strategist"),
  architectReviewerLoggedAuthoring: (p) => agentLogHasRoleEvent(p, "architect-reviewer"),
  dbaLoggedAuthoring: (p) => agentLogHasRoleEvent(p, "dba"),
  // The Navigator's log event (build turns: RED / assess / review), role-bound.
  navigatorLoggedAuthoring: (p) => agentLogHasRoleEvent(p, "navigator"),
  // The Driver's log event (build turns: GREEN / refactor / repair), role-bound.
  driverLoggedAuthoring: (p) => agentLogHasRoleEvent(p, "driver"),
  nonEmptyFile,
  designGuideConformant,
  // BUILD-turn navigator output validators (the lean per-role build chains).
  navigatorTestsAuthored,
  assessMarkerWritten,
  // The navigator assess-deploy turn's OPTIONAL scope marker (Stage F optional-output contract's
  // first shipped consumer): absent = the veto/escalate route (a clean pass), present = validated.
  deployVerifyScopeConformant,
  // BUILD-turn driver output validator (the product-code floor; honest-GREEN is the real gate).
  driverCodePresent,
  // Schema-conformance validators for the design roles' primary artifacts (the integration
  // live chains gate the real agent's output to its canonical schema, not just non-emptiness).
  acConformant,
  // The spec-author per-story primary is the acs/ DIRECTORY (dynamically-named AC files); the
  // executor-dispatched turn resolves its output to that dir, so it needs a dir-aware validator.
  acsDirConformant,
  architectureConformant,
  dbDesignConformant,
  testListConformant,
  // The PO intake turn's deliverables (product-overview.md / nfrs.md required; design-brief.md
  // optional, UI-only).
  productOverviewConformant,
  nfrsConformant,
  designBriefConformant
};
function resolveValidator(name) {
  const fn = VALIDATOR_REGISTRY[name];
  if (!fn) {
    const known = Object.keys(VALIDATOR_REGISTRY).sort().join(", ");
    throw new Error(`validator-registry: unknown validator "${name}" (a manifest referenced a validator not in the registry). Known: ${known}.`);
  }
  return fn;
}

// consort/orchestrator/steps/step.ts
function primaryOutputId(manifest) {
  return manifest.outputs[0]?.id;
}
var Step = class {
  constructor(manifest, agent, exists) {
    this.manifest = manifest;
    this.agent = agent;
    this.exists = exists ?? import_node_fs13.existsSync;
  }
  manifest;
  agent;
  exists;
  /** WHAT this step needs (logical), from the manifest. The orchestrator resolves these. */
  inputs(_action) {
    return this.manifest.inputs.map((i) => ({
      id: i.id,
      description: i.description ?? `${i.id} (from ${i.source})`,
      // Carry `optional` through so run()'s presence re-check honors it (an optional-absent input
      // is skipped by resolveInputs and MUST NOT trip run's `spec.id in inputs` gate).
      ...i.optional ? { optional: true } : {}
    }));
  }
  /** WHAT this step needs PRE-CONDITIONED (logical), from the manifest. The orchestrator's
   *  PREPARE-PRECONDITIONS phase runs the matching preparer + appends the projected block.
   *  Absent on the manifest = an affirmative "nothing" (empty). The preparer `options` ride
   *  along on the spec so a preparer (e.g. context-pack's skipTestLoop) can read them. */
  preconditions(_action) {
    return (this.manifest.preconditions ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      description: p.description ?? p.id,
      ...p.position ? { position: p.position } : {},
      ...p.options ? { options: p.options } : {}
    }));
  }
  /** WHAT this step produces (logical), from the manifest. Each output's in-code validator is
   *  resolved from the registry by NAME (an unknown name throws loud). */
  outputs(_action) {
    return this.manifest.outputs.map((o) => ({
      id: o.id,
      description: o.description ?? o.id,
      filename: o.filename,
      ...o.channel ? { channel: o.channel } : {},
      ...o.optional ? { optional: true } : {},
      validate: resolveValidator(o.validator)
    }));
  }
  /** WHAT deterministic hooks the orchestrator runs AROUND this turn (not the agent), from the
   *  manifest. Absent on the manifest = an affirmative "no hooks" (empty). A hook with no `when`
   *  defaults to "after" (the manifest convention). */
  postTurn(_action) {
    return (this.manifest.postTurn ?? []).map((h) => ({
      bin: h.bin,
      args: h.args,
      when: h.when ?? "after"
    }));
  }
  /** The per-step agent-spawn levers, from the manifest. The orchestrator reads these to
   *  configure the spawn; the optimize sweep patches them per candidate. */
  agentOptions(_action) {
    const o = this.manifest.agentOptions;
    return {
      ...o.model ? { model: o.model } : {},
      ...o.effort ? { effort: o.effort } : {},
      session: o.session,
      ...o.resumeKeyFrom ? { resumeKeyFrom: o.resumeKeyFrom } : {}
    };
  }
  /** The process EVENTS this step may RAISE, from the manifest (`raises`: a list of event kinds).
   *  Each kind resolves to its full spec through TURN_EVENTS (the one scope-truth). Absent on the
   *  manifest = an affirmative "raises nothing" (empty). */
  raises(_action) {
    return (this.manifest.raises ?? []).map((kind) => TURN_EVENTS[kind]);
  }
  /** The process EVENTS a ROUTE to this step depends on, from the manifest (`requiresEvents`: a
   *  list of event kinds). Declared as kinds; the route-satisfiable check resolves scope through
   *  TURN_EVENTS. Absent = an affirmative "requires no event" (the plain RED/GREEN turns). */
  requiresEvents(_action) {
    return this.manifest.requiresEvents ?? [];
  }
  /** The conformance validators EXPOSED TO THE AGENT, so it self-checks its draft in-turn.
   *  Same deterministic fn the orchestrator runs; the docstring names the output + validator. */
  conformanceValidators(_action) {
    return this.manifest.outputs.map((o) => ({
      outputId: o.id,
      docstring: `check ${o.filename} (validator "${o.validator}"): ${o.description ?? o.id}. Returns {ok, violations[]}. Run it on your written ${o.filename} and fix every violation before returning \u2013 no orchestrator round-trip.`,
      fn: resolveValidator(o.validator)
    }));
  }
  /**
   * Run the step within the PROVIDED workspace – identical contract to SpecAuthorBreakdownStep:
   * verify every declared input was provided (fail loud, name the missing one, no agent call),
   * invoke the injected agent contained to the workspace, report the produced artifact path(s)
   * found at the orchestrator-declared output locations (fall back to the bare filename).
   */
  async run(provided) {
    const { action, workspaceDir, inputs, instructions } = provided;
    for (const spec of this.inputs(action)) {
      if (!(spec.id in inputs) && !spec.optional) {
        return { produced: false, missingInput: spec.id };
      }
    }
    await this.agent.invoke({ action, workspaceDir, inputs, instructions });
    const rootFor = (channel) => resolveChannelRoot(channel, { workspaceDir, artifactDir: provided.artifactDir, metaDir: provided.metaDir });
    const specs = this.outputs(action);
    if (specs.length === 0) {
      return { produced: true, producedPaths: [] };
    }
    const primary = primaryOutputId(this.manifest);
    const producedPaths = [];
    let primaryPresent = false;
    for (const spec of specs) {
      const rel = provided.outputPaths?.[spec.id] ?? spec.filename;
      const p = (0, import_node_path15.join)(rootFor(spec.channel), rel);
      if (this.exists(p)) {
        producedPaths.push(p);
        if (spec.id === primary) primaryPresent = true;
      }
    }
    const primarySpec = specs[0];
    if (!primaryPresent && !primarySpec.optional) {
      return { produced: false, producedPaths: producedPaths.length ? producedPaths : void 0 };
    }
    return { produced: true, producedPaths };
  }
  /**
   * The injected agent's result for its most recent turn (usage tokens/cost/num_turns + final
   * text), read duck-typed – a live ClaudeStepAgent sets `lastResult` after each invoke; a
   * mock/replay agent has none (returns undefined). The executor calls this in phase 6 so the
   * turn's telemetry travels on the StepRecord + survives the (thrown-away) workspace. Read-only,
   * never affects routing or validation.
   */
  lastAgentResult() {
    const lr = this.agent.lastResult;
    return lr ? { ...lr.usage ? { usage: lr.usage } : {}, ...lr.finalText ? { finalText: lr.finalText } : {} } : void 0;
  }
  /**
   * Routing: emit the routing proposal the executor's validateAndBound reconciles. The step
   * only reports intent; the orchestrator holds authority (validateAndBound bounds the move).
   *
   * The full route space out of a completed step (matching the legacy nextTransition):
   *   - escalate: an unresolved BLOCKING problem the turn surfaced (a failed run, a
   *     build-level smell, an explicit escalation file, or a spec smell with its revise budget
   *     spent) -> raise-to-hil.
   *   - revise:   a ROUTABLE spec-level smell (revise budget left) -> revise-route back to the
   *     owning author at its gate, re-gate, resume.
   *   - produced: no escalation -> the manifest's mapped `next` (a concrete WorkflowAction),
   *     or "state-derived" to defer entirely to the pure transition.
   *
   * The escalate/revise split is NOT re-derived here – it reuses the real machine's
   * escalationPreempt(state) (the same authority nextTransition uses), so the manifest path
   * and the legacy transition agree by construction. A manifest MAY still declare explicit
   * `routing.revise` / `routing.escalate` targets to override where those outcomes point; when
   * absent the escalationPreempt result is used verbatim.
   */
  route(_completed, ctx) {
    const preempt = escalationPreempt(ctx.state);
    if (preempt) {
      if (preempt.kind === "revise-route") {
        const target2 = this.manifest.routing.revise;
        const next2 = target2?.next ?? preempt;
        return { outcome: "revise", proposedNext: next2, reason: this.escalationReason(ctx) };
      }
      const target = this.manifest.routing.escalate;
      const next = target?.next ?? preempt;
      return { outcome: "escalate", proposedNext: next, reason: this.escalationReason(ctx) };
    }
    const outcome = "produced";
    const producedNext = this.manifest.routing.produced?.next;
    if (producedNext && producedNext !== "state-derived") {
      return { outcome, proposedNext: producedNext };
    }
    return { outcome, proposedNext: { kind: "state-derived" } };
  }
  /** The escalation's own reason, when the state carries one (fed into the revise/hil move). */
  escalationReason(ctx) {
    const e = ctx.state.escalation;
    return e?.reason;
  }
};

// consort/orchestrator/agents/agent-catalogue.ts
init_cjs_shims();
var import_node_path19 = require("path");
var import_node_fs17 = require("fs");

// consort/orchestrator/agents/claude-step-agent.ts
init_cjs_shims();
var import_node_crypto5 = require("crypto");

// consort/orchestrator/drive/claude-runner.ts
init_cjs_shims();
var import_node_child_process7 = require("child_process");

// consort/setup/project-consort-setup.ts
init_cjs_shims();
var fs13 = __toESM(require("fs"), 1);
var path8 = __toESM(require("path"), 1);
var import_node_url2 = require("url");

// consort/lakebase/adopt-consort.ts
init_cjs_shims();
var fs9 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);
var import_node_url = require("url");

// consort/lakebase/update-agents.ts
init_cjs_shims();
var fs10 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);
function findKitAgentsDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path5.join(dir, "skills", "consort", "agents");
    if (fs10.existsSync(candidate)) return candidate;
    const parent = path5.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate skills/consort/agents/ relative to ${start}. Pass explicit kitDir.`
  );
}
function updateAgents(args) {
  const projectAgentsDir = path5.join(args.projectDir, ".claude", "agents");
  const here = path5.dirname(new URL(importMetaUrl).pathname);
  const kitAgentsDir = args.kitDir ? path5.join(args.kitDir, "skills", "consort", "agents") : findKitAgentsDir(here);
  const dryRun = args.dryRun === true;
  const force = args.force !== false;
  const sourceFiles = fs10.existsSync(kitAgentsDir) ? fs10.readdirSync(kitAgentsDir).filter((f) => f.endsWith(".md")) : [];
  if (!dryRun && sourceFiles.length > 0 && !fs10.existsSync(projectAgentsDir)) {
    fs10.mkdirSync(projectAgentsDir, { recursive: true });
  }
  const files = [];
  let changed = false;
  for (const name of sourceFiles) {
    const projectPath = path5.join(projectAgentsDir, name);
    const desired = fs10.readFileSync(path5.join(kitAgentsDir, name), "utf-8");
    if (!fs10.existsSync(projectPath)) {
      files.push({ name, outcome: "added" });
      changed = true;
      if (!dryRun) fs10.writeFileSync(projectPath, desired);
      continue;
    }
    const current = fs10.readFileSync(projectPath, "utf-8");
    if (current === desired) {
      files.push({ name, outcome: "unchanged" });
      continue;
    }
    if (!force) {
      files.push({ name, outcome: "preserved" });
      continue;
    }
    files.push({ name, outcome: "updated" });
    changed = true;
    if (!dryRun) fs10.writeFileSync(projectPath, desired);
  }
  return { files, changed };
}

// consort/lakebase/upgrade.ts
init_cjs_shims();
var fs12 = __toESM(require("fs"), 1);
var path7 = __toESM(require("path"), 1);
var import_node_child_process5 = require("child_process");

// consort/config/kit-ref.ts
init_cjs_shims();
var import_node_fs14 = require("fs");
var import_node_path16 = require("path");
var KIT_REF_FILE = "kit-ref";
var KIT_REF_LOCAL_FILE = "kit-ref.local";
function lakebaseFile(projectDir, name) {
  return (0, import_node_path16.join)(projectDir, ".lakebase", name);
}
function readTrimmed(file) {
  if (!(0, import_node_fs14.existsSync)(file)) return void 0;
  try {
    const v = (0, import_node_fs14.readFileSync)(file, "utf8").trim();
    return v.length > 0 ? v : void 0;
  } catch {
    return void 0;
  }
}
function committedKitRef(projectDir) {
  return readTrimmed(lakebaseFile(projectDir, KIT_REF_FILE));
}
function localKitRef(projectDir) {
  return readTrimmed(lakebaseFile(projectDir, KIT_REF_LOCAL_FILE));
}
function resolveLaunchKitRef(projectDir, env = process.env) {
  if (env.LAKEBASE_KIT_DIR) return void 0;
  const fromEnv = env.LAKEBASE_KIT_REF?.trim();
  if (fromEnv) return fromEnv;
  return localKitRef(projectDir) ?? committedKitRef(projectDir);
}
function pinRunKitRef(projectDir, ref) {
  const file = lakebaseFile(projectDir, KIT_REF_LOCAL_FILE);
  const previous = readTrimmed(file);
  if (previous === ref) return { pinned: false, ref };
  (0, import_node_fs14.mkdirSync)((0, import_node_path16.dirname)(file), { recursive: true });
  (0, import_node_fs14.writeFileSync)(file, ref + "\n", "utf8");
  return { pinned: true, ref, ...previous ? { previous } : {} };
}
function kitRefDriftWarning(projectDir, launchRef) {
  const committed = committedKitRef(projectDir);
  if (!committed || committed === launchRef) return void 0;
  return `kit-ref drift: the committed .lakebase/kit-ref is '${committed}' but this run is pinned to '${launchRef}' (.lakebase/kit-ref.local). A branch checkout restored the committed ref; the run keeps the pinned ref. If '${committed}' is intended, update .lakebase/kit-ref.local or unset the pin.`;
}

// consort/lakebase/update-commands.ts
init_cjs_shims();
var fs11 = __toESM(require("fs"), 1);
var path6 = __toESM(require("path"), 1);

// consort/lakebase/upgrade.ts
var import_lakebase9 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var AGENT_SYNC_MARKER = path7.join(".claude", "agents", ".kit-version");
var KIT_SURFACE_PATHS = [".claude/agents", ".claude/commands", "scripts", ".github/workflows", ".lakebase/kit-ref"];
function commitRefreshedSurface(projectDir, targetVersion, git = (a) => {
  const r = (0, import_node_child_process5.spawnSync)("git", ["-C", projectDir, ...a], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "" };
}) {
  if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) return { committed: false, reason: "not-a-git-repo" };
  const paths = KIT_SURFACE_PATHS.filter((p) => fs12.existsSync(path7.join(projectDir, p)));
  if (!paths.length) return { committed: false, reason: "nothing-to-commit" };
  git(["add", "--", ...paths]);
  if (git(["diff", "--cached", "--quiet", "--", ...paths]).status === 0) {
    return { committed: false, reason: "nothing-to-commit" };
  }
  if (git(["commit", "--no-verify", "-m", `chore(kit): refresh scaffolded surface to ${targetVersion}`]).status !== 0) {
    return { committed: false, reason: "commit-failed" };
  }
  return { committed: true, sha: git(["rev-parse", "--short", "HEAD"]).stdout.trim() };
}

// consort/setup/project-consort-setup.ts
var __dirname2 = path8.dirname((0, import_node_url2.fileURLToPath)(importMetaUrl));
function resolveKitRoot() {
  const candidates = [
    path8.resolve(__dirname2, "../.."),
    path8.resolve(__dirname2, "../../..")
  ];
  for (const c of candidates) {
    if (fs13.existsSync(path8.join(c, "package.json")) && fs13.existsSync(path8.join(c, "skills", "consort", "agents"))) {
      return c;
    }
  }
  throw new Error(
    `could not resolve the kit root (package.json + skills/consort/agents); looked in: ${candidates.join(", ")}`
  );
}
function kitVersion(root) {
  try {
    return JSON.parse(fs13.readFileSync(path8.join(root, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}
var AGENT_SYNC_MARKER2 = path8.join(".claude", "agents", ".kit-version");
function resyncAgentsOnKitDrift(projectDir) {
  try {
    const root = resolveKitRoot();
    const current = kitVersion(root);
    const markerPath3 = path8.join(projectDir, AGENT_SYNC_MARKER2);
    let last = "";
    try {
      last = fs13.readFileSync(markerPath3, "utf8").trim();
    } catch {
    }
    if (last === current) return { refreshed: false };
    updateAgents({ projectDir, kitDir: root, force: true });
    fs13.mkdirSync(path8.dirname(markerPath3), { recursive: true });
    fs13.writeFileSync(markerPath3, current + "\n");
    const commit = commitRefreshedSurface(projectDir, current);
    return { refreshed: true, from: last || void 0, to: current, committed: commit.committed };
  } catch {
    return { refreshed: false };
  }
}

// consort/orchestrator/drive/claude-runner.ts
var import_node_crypto4 = require("crypto");
var fs15 = __toESM(require("fs"), 1);
var path10 = __toESM(require("path"), 1);
var readline = __toESM(require("readline"), 1);

// consort/logging/replay-artifacts.ts
init_cjs_shims();
var import_fs14 = require("fs");
var import_path11 = require("path");
var REPLAYABLE_DESIGN_ROLES = /* @__PURE__ */ new Set([
  "spec-author",
  "architect-reviewer",
  "dba",
  "test-strategist",
  "ux-designer",
  "product-owner"
]);
function cp(src, dst) {
  if (!(0, import_fs14.existsSync)(src)) return false;
  (0, import_fs14.mkdirSync)((0, import_path11.dirname)(dst), { recursive: true });
  (0, import_fs14.copyFileSync)(src, dst);
  return true;
}
function cpDir(srcDir, dstDir) {
  if (!(0, import_fs14.existsSync)(srcDir)) return false;
  let copied = false;
  (0, import_fs14.mkdirSync)(dstDir, { recursive: true });
  for (const name of (0, import_fs14.readdirSync)(srcDir)) {
    const s = (0, import_path11.join)(srcDir, name);
    if (!(0, import_fs14.statSync)(s).isFile()) continue;
    (0, import_fs14.copyFileSync)(s, (0, import_path11.join)(dstDir, name));
    copied = true;
  }
  return copied;
}
function replayDesignTurn(args) {
  const { turn, replayDir, consortDir, featureId } = args;
  const cf = (0, import_path11.join)(featuresDir(replayDir), featureId);
  const tf = (0, import_path11.join)(featuresDir(consortDir), featureId);
  switch (turn.role) {
    case "spec-author": {
      if (turn.mode === "propose") {
        return cp((0, import_path11.join)(replayDir, "planning", "feature-proposals.md"), (0, import_path11.join)(consortDir, "planning", "feature-proposals.md"));
      }
      if (turn.mode === "breakdown") {
        let ok = cp((0, import_path11.join)(cf, "feature-spec.json"), (0, import_path11.join)(tf, "feature-spec.json"));
        cp((0, import_path11.join)(cf, "feature-spec.md"), (0, import_path11.join)(tf, "feature-spec.md"));
        const storiesSrc = (0, import_path11.join)(cf, "stories");
        if ((0, import_fs14.existsSync)(storiesSrc)) {
          for (const s of (0, import_fs14.readdirSync)(storiesSrc)) {
            cp((0, import_path11.join)(storiesSrc, s, "story.json"), (0, import_path11.join)(tf, "stories", s, "story.json"));
            cp((0, import_path11.join)(storiesSrc, s, "story.md"), (0, import_path11.join)(tf, "stories", s, "story.md"));
          }
        }
        return ok;
      }
      if (turn.story) {
        return cpDir((0, import_path11.join)(cf, "stories", turn.story, "acs"), (0, import_path11.join)(tf, "stories", turn.story, "acs"));
      }
      return false;
    }
    case "architect-reviewer": {
      if (turn.mode === "estimate" || turn.mode === "estimate-committed") {
        return cp((0, import_path11.join)(replayDir, "planning", "estimates.json"), (0, import_path11.join)(consortDir, "planning", "estimates.json"));
      }
      let ok = cp((0, import_path11.join)(cf, "architecture.json"), (0, import_path11.join)(tf, "architecture.json"));
      cp((0, import_path11.join)(cf, "architecture.md"), (0, import_path11.join)(tf, "architecture.md"));
      if (turn.story) {
        const acs = cpDir((0, import_path11.join)(cf, "stories", turn.story, "acs"), (0, import_path11.join)(tf, "stories", turn.story, "acs"));
        ok = ok || acs;
      }
      return ok;
    }
    case "dba": {
      let ok = cp((0, import_path11.join)(cf, "db-design.json"), (0, import_path11.join)(tf, "db-design.json"));
      cp((0, import_path11.join)(cf, "db-design.md"), (0, import_path11.join)(tf, "db-design.md"));
      return ok;
    }
    case "test-strategist": {
      let ok = cp((0, import_path11.join)(cf, "test-list.json"), (0, import_path11.join)(tf, "test-list.json"));
      cp((0, import_path11.join)(cf, "test-list.md"), (0, import_path11.join)(tf, "test-list.md"));
      const story = turn.story;
      if (story) {
        cp((0, import_path11.join)(cf, "stories", story, "test-list-per-ac.json"), (0, import_path11.join)(tf, "stories", story, "test-list-per-ac.json"));
      }
      return ok;
    }
    case "ux-designer": {
      let ok = cp((0, import_path11.join)(replayDir, "design", "design-guide.json"), (0, import_path11.join)(consortDir, "design", "design-guide.json"));
      cp((0, import_path11.join)(replayDir, "design", "design-guide.md"), (0, import_path11.join)(consortDir, "design", "design-guide.md"));
      cp((0, import_path11.join)(replayDir, "design", "ia.md"), (0, import_path11.join)(consortDir, "design", "ia.md"));
      return ok;
    }
    default:
      return false;
  }
}
function restoreReflectVerdict(args) {
  const { replayDir, consortDir, featureId, story } = args;
  return cp(
    (0, import_path11.join)(featuresDir(replayDir), featureId, "stories", story, "reflect-verdict.json"),
    (0, import_path11.join)(featuresDir(consortDir), featureId, "stories", story, "reflect-verdict.json")
  );
}

// consort/orchestrator/settings/project-settings.ts
init_cjs_shims();

// consort/orchestrator/drive/turn-key.ts
init_cjs_shims();
function turnKeyForAction(action) {
  if (action.kind !== "invoke-role") return void 0;
  if ("buildMode" in action) {
    switch (action.buildMode) {
      case "reflect":
        return "reflect";
      // design-lane critic, tuned as its own turn (sweep: haiku+low)
      case "review":
        return "review";
      case "refactor":
      case "refactor-deploy":
      case "refactor-superseded":
        return "refactor";
      case "assess":
      case "assess-deploy":
      case "assess-refactor":
        return "assess";
      case "repair":
        return "repair";
      case "green-superseded":
        return "green";
    }
  }
  if ("mode" in action) {
    if (action.role === "spec-author" && action.mode === "breakdown") return "breakdown";
    if (action.role === "spec-author" && action.mode === "propose") return "propose";
    if (action.role === "architect-reviewer" && (action.mode === "estimate" || action.mode === "estimate-committed")) return "estimate";
    return void 0;
  }
  if (action.role === "ux-designer") return "ux";
  if ("story" in action && action.story) {
    if (action.role === "spec-author") return "acs";
    if (action.role === "architect-reviewer") return "architect";
    if (action.role === "dba") return "dba";
    if (action.role === "test-strategist") return "test-list";
  }
  if (action.role === "navigator") return "red";
  if (action.role === "driver") return "green";
  return void 0;
}

// consort/orchestrator/settings/project-settings.ts
function resolveConsortSettings(inputs) {
  const file = loadConsortConfig(inputs.projectDir);
  const legacy = readAgentConfig(inputs.projectDir);
  const models = {};
  const fallbackModels = {};
  const budgets = {};
  const mcpConfigs = {};
  for (const role of ALL_AGENT_ROLES) {
    const rc = file?.roles?.[role];
    const legacyEntry = legacy?.roles?.[role];
    const scalarModel = typeof rc?.model === "string" ? rc.model : void 0;
    models[role] = scalarModel ?? legacyEntry?.override ?? legacyEntry?.recommended ?? RECOMMENDED_MODELS[role] ?? "inherit";
    fallbackModels[role] = rc?.fallbackModel;
    budgets[role] = typeof rc?.maxBudgetUsd === "number" ? rc.maxBudgetUsd : void 0;
    mcpConfigs[role] = rc?.mcpConfig;
  }
  const manifestStep = (role, turn) => turn ? agentOptionsForStep(role, turn, turnKeyForAction) : void 0;
  const modelFor = (role, turn) => {
    const m = file?.roles?.[role]?.model;
    if (m && typeof m !== "string" && turn && m[turn]) return m[turn];
    if (typeof m === "string") return m;
    const declared = manifestStep(role, turn)?.model;
    if (declared) return declared;
    return models[role] ?? "inherit";
  };
  const effortFor = (role, turn) => {
    const rc = file?.roles?.[role];
    const e = rc?.effort;
    if (typeof e === "string") return e;
    if (e && turn && e[turn]) return e[turn];
    return manifestStep(role, turn)?.effort ?? "default";
  };
  const { build, plan, project } = resolveProjectSettings(inputs.projectDir);
  return { models, modelFor, fallbackModels, budgets, mcpConfigs, effortFor, build, plan, project };
}

// consort/session/claude-usage.ts
init_cjs_shims();
function numOr(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function usageFromResultEvent(ev) {
  if (!ev || ev.type !== "result" || !ev.usage) return void 0;
  const u = ev.usage;
  const usage = {
    inputTokens: numOr(u.input_tokens, 0),
    outputTokens: numOr(u.output_tokens, 0)
  };
  if (typeof u.cache_read_input_tokens === "number") usage.cacheReadTokens = u.cache_read_input_tokens;
  if (typeof u.cache_creation_input_tokens === "number") usage.cacheCreationTokens = u.cache_creation_input_tokens;
  if (typeof ev.total_cost_usd === "number") usage.costUsd = ev.total_cost_usd;
  if (typeof ev.num_turns === "number") usage.numTurns = ev.num_turns;
  if (typeof ev.duration_ms === "number") usage.durationMs = ev.duration_ms;
  return usage;
}
function parseTurnUsage(streamJson) {
  const lines = Array.isArray(streamJson) ? streamJson : streamJson.split("\n");
  let last;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const u = usageFromResultEvent(ev);
    if (u) last = u;
  }
  return last;
}
function assistantTextFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "{") return "";
  let ev;
  try {
    ev = JSON.parse(trimmed);
  } catch {
    return "";
  }
  if (ev.type !== "assistant" || !ev.message || !Array.isArray(ev.message.content)) return "";
  const parts = [];
  for (const block of ev.message.content) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("");
}
function assistantEventSummary(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "{") return { text: "", tools: [] };
  let ev;
  try {
    ev = JSON.parse(trimmed);
  } catch {
    return { text: "", tools: [] };
  }
  if (ev.type !== "assistant" || !ev.message || !Array.isArray(ev.message.content)) return { text: "", tools: [] };
  const textParts = [];
  const tools = [];
  for (const block of ev.message.content) {
    if (block?.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
    } else if (block?.type === "tool_use" && typeof block.name === "string") {
      const inp = block.input ?? {};
      let args = "";
      try {
        args = Object.keys(inp).length ? JSON.stringify(inp) : "";
      } catch {
        args = "";
      }
      tools.push(args ? `${block.name} ${args}` : block.name);
    }
  }
  return { text: textParts.join("").trim(), tools };
}

// consort/session/context-budget.ts
init_cjs_shims();
var CONTEXT_FREE_FRACTION_REQUIRED = 0.4;
function requiredFreeFraction(env = process.env) {
  const raw = consortEnv("CONTEXT_FREE_FRACTION", env) ?? env.SFTDD_CONTEXT_FREE_FRACTION;
  if (raw === void 0) return CONTEXT_FREE_FRACTION_REQUIRED;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : CONTEXT_FREE_FRACTION_REQUIRED;
}
var DEFAULT_HEAVY_ROLES = [];
function heavyRoles(env = process.env) {
  const raw = consortEnv("HEAVY_ROLES", env) ?? env.SFTDD_HEAVY_ROLES;
  if (raw === void 0) return new Set(DEFAULT_HEAVY_ROLES);
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}
function startsFreshEachTurn(role, env = process.env) {
  return heavyRoles(env).has(role.toLowerCase());
}
function contextWindowFor(model) {
  return /(^|[^0-9])1m([^0-9]|$)|\[1m\]/i.test(model) ? 1e6 : 2e5;
}
function turnContextTokens(u) {
  return (u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheCreationTokens || 0) + (u.outputTokens || 0);
}
function resumeFitsBudget(priorContextTokens, model, env = process.env) {
  const window = contextWindowFor(model);
  return priorContextTokens <= window * (1 - requiredFreeFraction(env));
}
var PROMPT_TOO_LONG_RE = /prompt is too long|prompt too long|exceeds? the (?:maximum )?context|context (?:window|length) (?:exceeded|too long)/i;
function isPromptTooLongSignal(line) {
  return PROMPT_TOO_LONG_RE.test(line);
}
var TRANSIENT_API_ERROR_RE = /connection closed|connection reset|connection error|overloaded|rate.?limit|too many requests|\b(?:429|500|502|503|504|529)\b|internal server error|service unavailable|gateway time|network error|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|timed? out/i;
function isTransientApiErrorSignal(line) {
  if (/not logged in|please run \/login|authentication|unauthor/i.test(line)) return false;
  return TRANSIENT_API_ERROR_RE.test(line);
}

// consort/config/kit-bin.ts
init_cjs_shims();
var import_node_child_process6 = require("child_process");
var fs14 = __toESM(require("fs"), 1);
var path9 = __toESM(require("path"), 1);
var kitRootCache;
function resolveKitRoot2() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs14.existsSync(path9.join(env, "package.json")) ? env : path9.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
var SUBSTRATE_PKG = "@databricks-solutions/lakebase-scm-utils";
function kitRoot() {
  return resolveKitRoot2();
}
var kitBinMap = null;
var substrateRoot;
var substrateBinMap = null;
function resolveSubstrateRoot() {
  if (substrateRoot !== void 0) return substrateRoot;
  let dir = resolveKitRoot2();
  for (; ; ) {
    const cand = path9.join(dir, "node_modules", SUBSTRATE_PKG);
    if (fs14.existsSync(path9.join(cand, "package.json"))) {
      substrateRoot = cand;
      return cand;
    }
    const parent = path9.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  substrateRoot = null;
  return null;
}
function resolveKitBinJs(bin) {
  if (kitBinMap === null) {
    try {
      const pkg = JSON.parse(fs14.readFileSync(path9.join(resolveKitRoot2(), "package.json"), "utf8"));
      kitBinMap = pkg.bin ?? {};
    } catch {
      kitBinMap = {};
    }
  }
  const rel = kitBinMap[bin];
  if (rel) return path9.join(resolveKitRoot2(), rel);
  const subRoot = resolveSubstrateRoot();
  if (subRoot) {
    if (substrateBinMap === null) {
      try {
        const pkg = JSON.parse(fs14.readFileSync(path9.join(subRoot, "package.json"), "utf8"));
        substrateBinMap = pkg.bin ?? {};
      } catch {
        substrateBinMap = {};
      }
    }
    const subRel = substrateBinMap[bin];
    if (subRel) return path9.join(subRoot, subRel);
  }
  return null;
}
function kitVersion2() {
  try {
    const pkg = JSON.parse(fs14.readFileSync(path9.join(resolveKitRoot2(), "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
function exportConsortVersionEnv(version = kitVersion2()) {
  if (process.env.CONSORT_VERSION) return;
  if (version && version !== "unknown") process.env.CONSORT_VERSION = version;
}

// consort/orchestrator/drive/claude-runner.ts
var import_lakebase10 = require("@databricks-solutions/lakebase-scm-utils/lakebase");

// consort/setup/stray-artifact-recovery.ts
init_cjs_shims();
var import_node_fs15 = require("fs");
var import_node_path17 = require("path");
function malformedSiblingRoot(projectDir) {
  const p = projectDir.replace(/\/+$/, "");
  return `${(0, import_node_path17.dirname)(p)}-${(0, import_node_path17.basename)(p)}`;
}
function listFilesRel(dir) {
  const out = [];
  const walk2 = (abs, rel) => {
    for (const entry of (0, import_node_fs15.readdirSync)(abs)) {
      const childAbs = (0, import_node_path17.join)(abs, entry);
      const childRel = rel ? (0, import_node_path17.join)(rel, entry) : entry;
      if ((0, import_node_fs15.statSync)(childAbs).isDirectory()) walk2(childAbs, childRel);
      else out.push(childRel);
    }
  };
  walk2(dir, "");
  return out;
}
function relocateStrayDesignArtifacts(projectDir) {
  const sibling = malformedSiblingRoot(projectDir);
  if (!(0, import_node_fs15.existsSync)(sibling)) return { relocated: false, moved: [] };
  const moved = [];
  for (const artRoot of ALL_ARTIFACT_ROOTS) {
    const strayRoot = (0, import_node_path17.join)(sibling, artRoot);
    if (!(0, import_node_fs15.existsSync)(strayRoot)) continue;
    for (const rel of listFilesRel(strayRoot)) moved.push((0, import_node_path17.join)(artRoot, rel));
    const realRoot = (0, import_node_path17.join)(projectDir, artRoot);
    (0, import_node_fs15.mkdirSync)(realRoot, { recursive: true });
    (0, import_node_fs15.cpSync)(strayRoot, realRoot, { recursive: true, force: true });
    (0, import_node_fs15.rmSync)(strayRoot, { recursive: true, force: true });
  }
  try {
    if ((0, import_node_fs15.readdirSync)(sibling).length === 0) (0, import_node_fs15.rmSync)(sibling, { recursive: true, force: true });
  } catch {
  }
  return moved.length > 0 ? { relocated: true, from: sibling, moved } : { relocated: false, moved: [] };
}

// consort/orchestrator/turns/turn-monitor.ts
init_cjs_shims();
var realClock = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t)
};
function createMonitorController(monitor, onTimeout, clock = realClock) {
  if (!monitor) {
    return { start() {
    }, progress() {
    }, stop() {
    } };
  }
  let heartbeatTimer;
  let inactivityTimer;
  let timeoutTimer;
  let timedOut = false;
  let stopped = false;
  const emit = (kind, tool) => {
    monitor.onProgress?.({ kind, tool, atMs: clock.now() });
  };
  const fireTimeout = () => {
    if (stopped || timedOut) return;
    timedOut = true;
    clearAll();
    onTimeout();
  };
  const armHeartbeat = () => {
    if (monitor.heartbeatMs === void 0) return;
    if (heartbeatTimer !== void 0) clock.clearTimer(heartbeatTimer);
    heartbeatTimer = clock.setTimer(() => {
      if (stopped || timedOut) return;
      emit("heartbeat");
      armHeartbeat();
    }, monitor.heartbeatMs);
  };
  const armInactivity = () => {
    if (monitor.inactivityTimeoutMs === void 0) return;
    if (inactivityTimer !== void 0) clock.clearTimer(inactivityTimer);
    inactivityTimer = clock.setTimer(fireTimeout, monitor.inactivityTimeoutMs);
  };
  const clearAll = () => {
    if (heartbeatTimer !== void 0) clock.clearTimer(heartbeatTimer);
    if (inactivityTimer !== void 0) clock.clearTimer(inactivityTimer);
    if (timeoutTimer !== void 0) clock.clearTimer(timeoutTimer);
    heartbeatTimer = void 0;
    inactivityTimer = void 0;
    timeoutTimer = void 0;
  };
  return {
    start() {
      emit("start");
      armHeartbeat();
      armInactivity();
      if (monitor.timeoutMs !== void 0) {
        timeoutTimer = clock.setTimer(fireTimeout, monitor.timeoutMs);
      }
    },
    progress(p) {
      if (stopped || timedOut) return;
      emit(p.kind, p.tool);
      armHeartbeat();
      armInactivity();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearAll();
      emit("end");
    }
  };
}

// consort/orchestrator/drive/claude-runner.ts
var MAX_PROMPT_TOO_LONG_RETRIES = 2;
var MAX_TRANSIENT_RETRIES = Number(consortEnv("MAX_TRANSIENT_RETRIES") ?? "5");
var TRANSIENT_BACKOFF_MS = Number(consortEnv("TRANSIENT_BACKOFF_MS") ?? "5000");
var TURN_INACTIVITY_TIMEOUT_MS = Number(consortEnv("TURN_INACTIVITY_TIMEOUT_MS") ?? String(10 * 60 * 1e3));
var TURN_HEARTBEAT_MS = Number(consortEnv("TURN_HEARTBEAT_MS") ?? String(60 * 1e3));
var CliEffectError = class extends Error {
  constructor(bin, code, capturedOutput) {
    super(`${bin} exited ${code}`);
    this.bin = bin;
    this.code = code;
    this.capturedOutput = capturedOutput;
    this.name = "CliEffectError";
  }
  bin;
  code;
  capturedOutput;
};
var CLI_CAPTURE_MAX = 16e3;
function spawnCmd(bin, args, cwd) {
  return new Promise((resolve3, reject) => {
    const child = (0, import_node_child_process7.spawn)(bin, args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const chunks = [];
    child.stdout?.on("data", (d) => {
      process.stdout.write(d);
      chunks.push(d.toString());
    });
    child.stderr?.on("data", (d) => {
      process.stderr.write(d);
      chunks.push(d.toString());
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve3();
      const captured = chunks.join("");
      const tail = captured.length > CLI_CAPTURE_MAX ? captured.slice(-CLI_CAPTURE_MAX) : captured;
      reject(new CliEffectError(bin, code, tail.trim() || void 0));
    });
  });
}
var ClaudeTurnError = class extends Error {
  constructor(message, promptTooLong, transient = false, stalled = false) {
    super(message);
    this.promptTooLong = promptTooLong;
    this.transient = transient;
    this.stalled = stalled;
    this.name = "ClaudeTurnError";
  }
  promptTooLong;
  transient;
  stalled;
};
var ReplayCorpusMissError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReplayCorpusMissError";
  }
};
var ArtifactOutOfRootError = class extends Error {
  constructor(role, label, anyOf, consortDir, checkedSibling) {
    super(
      `role '${role}' produced no ${label} under ${path10.basename(consortDir)}/ (expected one of: ${anyOf.join(", ")}).
        The subagent likely resolved the project root wrong and wrote outside it. ` + (checkedSibling ? `Checked (and tried to relocate from) the malformed sibling ${checkedSibling}; nothing there either. ` : `(check $HOME and other dirs for a stray copy). `) + `Nothing downstream can consume the absent artifact. Re-run to re-dispatch the role.`
    );
    this.role = role;
    this.label = label;
    this.anyOf = anyOf;
    this.consortDir = consortDir;
    this.checkedSibling = checkedSibling;
    this.name = "ArtifactOutOfRootError";
  }
  role;
  label;
  anyOf;
  consortDir;
  checkedSibling;
};
var lastAgentTranscript;
var lastAgentTranscriptByCwd = /* @__PURE__ */ new Map();
function takeLastAgentTranscript(cwd) {
  if (cwd !== void 0) {
    const t2 = lastAgentTranscriptByCwd.get(cwd);
    lastAgentTranscriptByCwd.delete(cwd);
    return t2;
  }
  const t = lastAgentTranscript;
  lastAgentTranscript = void 0;
  return t;
}
function peekLastAgentTranscript(cwd) {
  return cwd !== void 0 ? lastAgentTranscriptByCwd.get(cwd) : lastAgentTranscript;
}
function recordAgentTranscript(cwd, tx) {
  lastAgentTranscript = tx;
  lastAgentTranscriptByCwd.set(cwd, tx);
}
var lastAgentUsage;
var lastAgentUsageByCwd = /* @__PURE__ */ new Map();
function recordAgentUsage(cwd, usage) {
  lastAgentUsage = usage;
  lastAgentUsageByCwd.set(cwd, usage);
}
var lastTurnMeta;
var lastTurnMetaByCwd = /* @__PURE__ */ new Map();
function takeLastTurnMeta(cwd) {
  if (cwd !== void 0) {
    const m2 = lastTurnMetaByCwd.get(cwd);
    lastTurnMetaByCwd.delete(cwd);
    return m2;
  }
  const m = lastTurnMeta;
  lastTurnMeta = void 0;
  return m;
}
function recordTurnMeta(cwd, meta) {
  lastTurnMeta = meta;
  lastTurnMetaByCwd.set(cwd, meta);
}
function defaultTurnMonitor(sink) {
  const heartbeatMs = TURN_HEARTBEAT_MS > 0 ? TURN_HEARTBEAT_MS : void 0;
  const inactivityTimeoutMs = TURN_INACTIVITY_TIMEOUT_MS > 0 ? TURN_INACTIVITY_TIMEOUT_MS : void 0;
  if (heartbeatMs === void 0 && inactivityTimeoutMs === void 0) return void 0;
  return { onProgress: sink, heartbeatMs, inactivityTimeoutMs };
}
function spawnClaudeStreaming(args, cwd, monitorOverride) {
  return new Promise((resolve3, reject) => {
    const child = (0, import_node_child_process7.spawn)("claude", args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const lines = [];
    let sawTooLong = false;
    let sawTransient = false;
    const verboseAgent = !!consortEnv("VERBOSE_AGENT");
    const liveLogDir = consortEnv("RECORD_DIR")?.trim();
    let liveLog;
    if (liveLogDir) {
      try {
        fs15.mkdirSync(liveLogDir, { recursive: true });
        liveLog = fs15.openSync(path10.join(liveLogDir, "agent-live.log"), "a");
        const pIdxL = args.indexOf("-p"), rIdxL = args.indexOf("--agent");
        const role = rIdxL >= 0 ? args[rIdxL + 1] : "agent";
        const task = pIdxL >= 0 ? args[pIdxL + 1] ?? "" : "";
        fs15.writeSync(liveLog, `
=== ${(/* @__PURE__ */ new Date()).toISOString()} TURN START role=${role} :: ${task}
`);
      } catch {
        liveLog = void 0;
      }
    }
    const liveWrite = (s) => {
      if (liveLog === void 0) return;
      try {
        fs15.writeSync(liveLog, s);
      } catch {
      }
    };
    let lastText = "";
    let allText = "";
    const allTools = [];
    let stalled = false;
    const monitor = monitorOverride ?? defaultTurnMonitor((p) => {
      if (p.kind === "heartbeat") {
        liveWrite(`  \u23F3 ${(/* @__PURE__ */ new Date()).toISOString()} no agent output for ~${Math.round((TURN_HEARTBEAT_MS || 0) / 1e3)}s (waiting; kills at ${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1e3)}s of silence)
`);
      }
    });
    const monitorCtl = createMonitorController(monitor, () => {
      stalled = true;
      liveWrite(`  \u2716 ${(/* @__PURE__ */ new Date()).toISOString()} INACTIVITY TIMEOUT (~${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1e3)}s silent) \u2013 tree-killing pid ${child.pid} for a fresh-session retry
`);
      process.stderr.write(`[drive] turn stalled: no agent output for ~${Math.round((TURN_INACTIVITY_TIMEOUT_MS || 0) / 1e3)}s; killing pid ${child.pid} and retrying on a fresh session
`);
      try {
        child.kill("SIGKILL");
      } catch {
      }
    });
    monitorCtl.start();
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      lines.push(line);
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (isTransientApiErrorSignal(line)) sawTransient = true;
      if (verboseAgent) {
        const text2 = assistantTextFromLine(line);
        if (text2) process.stderr.write(text2);
        if (text2) liveWrite(text2);
        if (text2) monitorCtl.progress({ kind: "text" });
        for (const t of assistantEventSummary(line).tools) {
          allTools.push(t);
          liveWrite(`  \xB7 ${t}
`);
          monitorCtl.progress({ kind: "tool", tool: t });
        }
        return;
      }
      const { text, tools } = assistantEventSummary(line);
      for (const t of tools) {
        process.stderr.write(`  \xB7 ${t}
`);
        allTools.push(t);
        liveWrite(`  \xB7 ${t}
`);
        monitorCtl.progress({ kind: "tool", tool: t });
      }
      if (text) {
        lastText = text;
        allText += (allText ? "\n" : "") + text;
        liveWrite(text.endsWith("\n") ? text : `${text}
`);
        monitorCtl.progress({ kind: "text" });
      }
    });
    const erl = readline.createInterface({ input: child.stderr });
    erl.on("line", (line) => {
      monitorCtl.progress({ kind: "text" });
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (isTransientApiErrorSignal(line)) sawTransient = true;
      process.stderr.write(`${line}
`);
    });
    const closeLiveLog = () => {
      if (liveLog === void 0) return;
      try {
        fs15.closeSync(liveLog);
      } catch {
      }
      liveLog = void 0;
    };
    child.on("error", (err) => {
      monitorCtl.stop();
      closeLiveLog();
      reject(err);
    });
    child.on("close", (code) => {
      monitorCtl.stop();
      rl.close();
      erl.close();
      if (!verboseAgent && lastText) process.stderr.write(`${lastText}
`);
      liveWrite(`--- ${(/* @__PURE__ */ new Date()).toISOString()} TURN CLOSE code=${code}${lastText ? ` :: ${lastText}` : ""}
`);
      closeLiveLog();
      if (stalled) {
        return reject(new ClaudeTurnError(`claude turn stalled (inactivity timeout); killed for retry`, false, true, true));
      }
      if (code !== 0) return reject(new ClaudeTurnError(`claude exited ${code}`, sawTooLong, sawTransient));
      const pIdx = args.indexOf("-p");
      const rIdx = args.indexOf("--agent");
      const mIdx = args.indexOf("--model");
      const tx = {
        prompt: pIdx >= 0 ? args[pIdx + 1] ?? "" : "",
        role: rIdx >= 0 ? args[rIdx + 1] : void 0,
        model: mIdx >= 0 ? args[mIdx + 1] : void 0,
        // When the turn emitted a ```agent-report block, use the FULL assistant text as finalText so the
        // record/log phase can extract the (possibly non-final / streamed) block; otherwise keep the last
        // message (unchanged for turns that emit no report block).
        finalText: allText.includes("```agent-report") ? allText : lastText,
        tools: allTools
      };
      recordAgentTranscript(cwd, tx);
      const parsed = parseTurnUsage(lines);
      if (parsed) recordAgentUsage(cwd, parsed);
      resolve3(parsed);
    });
  });
}
function claudeToolArgs(cmd) {
  const out = [];
  if (cmd.allowedTools && cmd.allowedTools.length) out.push("--allowed-tools", cmd.allowedTools.join(","));
  if (cmd.disallowedTools && cmd.disallowedTools.length) out.push("--disallowed-tools", cmd.disallowedTools.join(","));
  return out;
}
var UX_BROWSER_MCP_CONFIG = "skills/consort/config/ux-browser-mcp.json";
function defaultMcpConfigForRole(role) {
  return role === "ux-designer" ? path10.join(kitRoot(), UX_BROWSER_MCP_CONFIG) : void 0;
}
var UX_BROWSER_INSTALL_CMD = { command: "npx", args: ["--yes", "playwright@latest", "install", "chromium"] };
var uxBrowserEnsured = false;
function ensureUxBrowserChromium() {
  if (uxBrowserEnsured) return;
  uxBrowserEnsured = true;
  try {
    process.stderr.write("[drive] ensuring Playwright Chromium for the ux-designer browser (one-time)\u2026\n");
    (0, import_node_child_process7.execFileSync)(UX_BROWSER_INSTALL_CMD.command, [...UX_BROWSER_INSTALL_CMD.args], { stdio: "ignore" });
  } catch {
    process.stderr.write(
      "[drive] could not pre-install Chromium \u2014 the ux-designer will degrade to the brief if the browser can't launch\n"
    );
  }
}
function claudeBaseArgs(cmd) {
  return [
    "-p",
    cmd.task,
    "--agent",
    cmd.role,
    "--model",
    cmd.model,
    "--permission-mode",
    "acceptEdits",
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    "--output-format",
    "stream-json",
    "--verbose"
  ];
}
function execRunner(cfg) {
  const sessions = /* @__PURE__ */ new Map();
  const sessionContext = /* @__PURE__ */ new Map();
  const buildTurns = /* @__PURE__ */ new Map();
  return {
    async run(cmd) {
      if (cmd.kind === "set-phase") {
        writeWorkflowPhase(cfg.consortDir, cmd.phase, cfg.featureId || void 0);
        return;
      }
      if (cmd.kind === "sync-backlog") {
        syncBacklog(cfg.consortDir, cmd.sprint);
        return;
      }
      if (cmd.kind === "claude") {
        const replayBuildDir = consortEnv("REPLAY_BUILD_DIR");
        const story = cmd.replay?.story;
        if (replayBuildDir && story && (cmd.role === "navigator" || cmd.role === "driver")) {
          if (cmd.replay?.buildMode === "reflect") {
            const rd = consortEnv("REPLAY_DIR");
            if (rd) {
              const restored = restoreReflectVerdict({ replayDir: rd, consortDir: cfg.consortDir, featureId: cfg.featureId, story });
              if (!restored) {
                throw new ReplayCorpusMissError(
                  `[drive] REPLAY CORPUS MISS: reflect verdict for ${story} is not in the corpus (expected features/${cfg.featureId}/stories/${story}/reflect-verdict.json under ${rd}). Replay will NOT run the Navigator live \u2013 put the recorded verdict in the corpus (check .gitignore is not dropping it).`
                );
              }
            }
            process.stderr.write(`[drive] replayed reflect (navigator ${story}) from corpus \u2013 verdict only (no code, not counted)
`);
            return;
          }
          const turnIndex = (buildTurns.get(story) ?? 0) + 1;
          buildTurns.set(story, turnIndex);
          const replayed = replayBuildTurn({
            replayBuildDir,
            projectDir: cfg.projectDir,
            consortDir: cfg.consortDir,
            featureId: cfg.featureId,
            story,
            turnIndex
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed build turn ${turnIndex} (${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""} ${story}) from corpus (no model spawn)
`
            );
            return;
          }
          throw new ReplayCorpusMissError(
            `[drive] REPLAY CORPUS MISS: build turn ${turnIndex} for ${story} (${cmd.role}) has no recorded turn dir under ${replayBuildDir} (features/${cfg.featureId}/stories/${story}/turns). The live orchestrator dispatched more build turns than the corpus recorded, or the corpus is incomplete. Replay will NOT run the agent live \u2013 re-record or fix the corpus so it covers every dispatched turn.`
          );
        }
        const replayDir = consortEnv("REPLAY_DIR");
        if (replayDir && REPLAYABLE_DESIGN_ROLES.has(cmd.role)) {
          const replayed = replayDesignTurn({
            turn: { role: cmd.role, mode: cmd.replay?.mode, story: cmd.replay?.story },
            replayDir,
            consortDir: cfg.consortDir,
            featureId: cfg.featureId
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed ${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""} from corpus (no model spawn)
`
            );
            return;
          }
          const where = `${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""}`;
          throw new ReplayCorpusMissError(
            `[drive] REPLAY CORPUS MISS: no recorded artifact for design turn '${where}' under ${replayDir} (features/${cfg.featureId}/...). The deterministic pipeline dispatched this turn but the corpus lacks its output. Replay will NOT run the agent live \u2013 put the recorded artifact in the corpus (check .gitignore is not dropping it).`
          );
        }
        const baseArgs = claudeBaseArgs(cmd);
        if (cmd.effort) baseArgs.push("--effort", cmd.effort);
        if (cmd.fallbackModel) baseArgs.push("--fallback-model", cmd.fallbackModel);
        if (typeof cmd.maxBudgetUsd === "number") baseArgs.push("--max-budget-usd", String(cmd.maxBudgetUsd));
        if (cmd.mcpConfig) {
          if (cmd.role === "ux-designer") ensureUxBrowserChromium();
          baseArgs.push("--mcp-config", cmd.mcpConfig);
        }
        baseArgs.push(...claudeToolArgs(cmd));
        const sessionArgsFor = (forceFresh) => {
          if (!cmd.resumeKey) return [];
          if (startsFreshEachTurn(cmd.role)) {
            const id2 = (0, import_node_crypto4.randomUUID)();
            sessions.set(cmd.resumeKey, id2);
            sessionContext.delete(cmd.resumeKey);
            return ["--session-id", id2];
          }
          const existing = sessions.get(cmd.resumeKey);
          const priorCtx = sessionContext.get(cmd.resumeKey) ?? 0;
          const wouldFit = !forceFresh && resumeFitsBudget(priorCtx, cmd.model);
          if (existing && wouldFit) return ["--resume", existing];
          if (existing && !forceFresh && !wouldFit) {
            process.stderr.write(
              `[drive] context guard: fresh ${cmd.role} session (warm ~${priorCtx.toLocaleString()} tok < ${Math.round(CONTEXT_FREE_FRACTION_REQUIRED * 100)}% of ${cmd.model} window free)
`
            );
          }
          const id = (0, import_node_crypto4.randomUUID)();
          sessions.set(cmd.resumeKey, id);
          sessionContext.delete(cmd.resumeKey);
          return ["--session-id", id];
        };
        let usage;
        const turnStart = Date.now();
        let overflowRetries = 0;
        let transientRetries = 0;
        let forceFreshAfterStall = false;
        for (; ; ) {
          const args = [...baseArgs, ...sessionArgsFor(overflowRetries > 0 || forceFreshAfterStall)];
          forceFreshAfterStall = false;
          try {
            usage = await spawnClaudeStreaming(args, cfg.projectDir);
            break;
          } catch (e) {
            if (e instanceof ClaudeTurnError && e.promptTooLong && overflowRetries < MAX_PROMPT_TOO_LONG_RETRIES) {
              overflowRetries++;
              process.stderr.write(
                `[drive] context guard (mid-turn): ${cmd.role} overflowed ${cmd.model}; fresh-session retry ${overflowRetries}/${MAX_PROMPT_TOO_LONG_RETRIES}
`
              );
              continue;
            }
            if (e instanceof ClaudeTurnError && e.transient && transientRetries < MAX_TRANSIENT_RETRIES) {
              transientRetries++;
              const backoff = TRANSIENT_BACKOFF_MS * transientRetries;
              const kind = e.stalled ? "stalled turn (inactivity timeout)" : "transient API error";
              if (e.stalled) forceFreshAfterStall = true;
              process.stderr.write(
                `[drive] ${kind} on ${cmd.role} (${cmd.model}); retry ${transientRetries}/${MAX_TRANSIENT_RETRIES} after ${(backoff / 1e3).toFixed(0)}s${e.stalled ? " on a FRESH session" : ""}
`
              );
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            throw e;
          }
        }
        recordTurnMeta(cfg.projectDir, {
          role: cmd.role,
          model: cmd.model,
          effort: cmd.effort,
          retryCount: overflowRetries + transientRetries,
          usage
        });
        const turnMs = Date.now() - turnStart;
        if (usage) {
          if (cmd.resumeKey) sessionContext.set(cmd.resumeKey, turnContextTokens(usage));
          process.stderr.write(`[drive] ${cmd.role} turn ${(turnMs / 1e3).toFixed(1)}s (${cmd.model})
`);
          try {
            emitAgentLogEvent(
              {
                role: cmd.role,
                level: "info",
                event: "turn.usage",
                model: cmd.model,
                ...cmd.effort ? { effort: cmd.effort } : {},
                feature_id: cfg.featureId,
                slots: {
                  duration_ms: turnMs,
                  input_tokens: usage.inputTokens,
                  output_tokens: usage.outputTokens,
                  ...usage.cacheReadTokens !== void 0 ? { cache_read_tokens: usage.cacheReadTokens } : {},
                  ...usage.cacheCreationTokens !== void 0 ? { cache_creation_tokens: usage.cacheCreationTokens } : {},
                  ...usage.costUsd !== void 0 ? { cost_usd: usage.costUsd } : {},
                  ...cmd.replay?.story ? { story: cmd.replay.story } : {},
                  ...cmd.replay?.mode ? { phase: cmd.replay.mode } : {}
                }
              },
              { consortDir: cfg.consortDir }
            );
          } catch {
          }
        }
        return;
      }
      if (cmd.kind === "verify-artifact") {
        const isPresent = () => cmd.anyOf.some((p) => {
          try {
            const st = fs15.statSync(p);
            return st.isDirectory() ? fs15.readdirSync(p).length > 0 : true;
          } catch {
            return false;
          }
        });
        if (!isPresent()) {
          const strayFix = relocateStrayDesignArtifacts(cfg.projectDir);
          if (strayFix.relocated) {
            process.stderr.write(
              `[drive] recovered ${strayFix.moved.length} stray artifact(s) from a malformed root (${strayFix.from}) into the project root (FEIP-8038)
`
            );
          }
          if (!isPresent()) {
            throw new ArtifactOutOfRootError(
              cmd.role,
              cmd.label,
              cmd.anyOf,
              cfg.consortDir,
              malformedSiblingRoot(cfg.projectDir)
            );
          }
        }
        return;
      }
      const js = resolveKitBinJs(cmd.bin);
      try {
        if (js) {
          await spawnCmd("node", [js, ...cmd.args], cfg.projectDir);
        } else {
          await spawnCmd(cmd.bin, cmd.args, cfg.projectDir);
        }
      } catch (e) {
        if (e instanceof CliEffectError) throw new CliEffectError(cmd.bin, e.code);
        throw e;
      }
    }
  };
}
var agentResyncDone = false;
function maybeResyncAgents(projectDir) {
  if (agentResyncDone) return;
  agentResyncDone = true;
  const recordingOrReplaying = !!consortEnv("REPLAY_DIR") || !!consortEnv("REPLAY_BUILD_DIR") || !!consortEnv("RECORD_BUILD_DIR") || !!consortEnv("RECORD_DIR");
  if (recordingOrReplaying) return;
  const r = resyncAgentsOnKitDrift(projectDir);
  if (r.refreshed) {
    process.stderr.write(`[drive] kit moved (${r.from ?? "unknown"} -> ${r.to}); refreshed .claude/agents/ from the kit
`);
  }
}
function buildCfg(args, featureId) {
  const projectDir = args.projectDir ?? process.cwd();
  const consortDir = args.consortDir ?? resolveConsortDir(projectDir);
  maybeResyncAgents(projectDir);
  const scm = (0, import_lakebase10.readWorkflowState)(projectDir);
  const settings = resolveConsortSettings({ projectDir });
  return {
    projectDir,
    consortDir,
    featureId,
    sprintName: args.sprint,
    // Recorded feature-requests present (capture/replay) => the planning PROPOSE
    // step is deterministic (project feature-proposals.md from them) instead of an
    // LLM spawn. Unset (interactive) keeps the live Spec Author propose turn.
    recordedRequests: !!consortEnv("SPRINT_REQUESTS")?.trim(),
    // Force a LIVE propose even with recorded requests (capture exercising the
    // full plan lane): the Spec Author proposes from product-overview + nfrs,
    // the proxy still commits the recorded request at author-requests.
    livePropose: !!consortEnv("LIVE_PROPOSE")?.trim(),
    // Agent turns dispatch THROUGH the StepExecutor (the unified path) – now the DEFAULT (J1). Every
    // executor-allowlisted action has a shipped manifest (guarded by executor-dispatch-coverage.test),
    // so the executor is the sole agent path. LAKEBASE_CONSORT_USE_MANIFEST_STEPS is a one-cycle escape
    // hatch: set it to 0/false/off/no to force the legacy commandsForAction dispatch (retired in J5).
    useManifestSteps: !/^(0|false|off|no)$/i.test(consortEnv("USE_MANIFEST_STEPS")?.trim() ?? ""),
    // Hand the executor's ReplayRecorderWrapper the just-completed live turn's transcript, so an
    // executor-dispatched turn records prompt + reasoning + tools alongside its delta – the SAME
    // source the effects-level withTurnRecording uses. Colocated with takeLastAgentTranscript (this
    // module) so there's no runtime edge from the executor onto the runner. Read whenever the turn is
    // recorded: a CAPTURE (RECORD_DIR) OR the always-on LIVE index into `.consort` (every live build).
    takeTranscript: takeLastAgentTranscript,
    instance: args.instance ?? scm?.project_id,
    featureBranch: scm?.branch,
    parentBranch: scm?.parent_branch,
    // Deploy target from the config (the --deploy-target flag wrote through to it).
    deployTarget: settings.project.deployTarget,
    approver: args.approver ?? "human-proxy",
    // UI track: the config (project.uiTrack, the single source) decides whether the
    // Spec Author frames user-facing capabilities as E2E (browser/screen) stories vs API-only.
    uiTrack: settings.project.uiTrack,
    // P5: Navigator/Driver session scope (story warm-resume vs cycle cold-spawn).
    buildSessionScope: settings.build.sessionScope,
    // P6 (back-compat): the navigator REVIEW turn's effort, still surfaced for
    // run-config + any caller without effortForTurn. effortForTurn (below) is the
    // primary, per-role/turn resolver and supersedes this.
    reviewEffort: (() => {
      const e = settings.effortFor("navigator", "review");
      return e === "default" ? "" : e;
    })(),
    // P8b: build loop granularity + batch cap (config / env).
    loopGranularity: settings.build.loopGranularity,
    batchCap: settings.build.batchCap,
    // Unified per-role/turn model-side resolvers ("" => omit --effort).
    effortForTurn: (role, turn) => {
      const e = settings.effortFor(role, turn);
      return e === "default" ? "" : e;
    },
    fallbackModelForRole: (role) => settings.fallbackModels[role],
    maxBudgetUsdForRole: (role) => settings.budgets[role],
    // Per-role MCP config: an explicit consort-config.json override wins; otherwise
    // ux-designer defaults ON to the kit-shipped headless-browser MCP so "make it look
    // like <these sites>" is honored out of the box (the agent navigates each named
    // reference and reads its real fonts/colors/spacing) with zero operator setup. The
    // path is absolute via kitRoot() so it resolves in dev-clone AND installed layouts,
    // independent of workspace provisioning. Every other role resolves undefined.
    mcpConfigForRole: (role) => settings.mcpConfigs[role] ?? defaultMcpConfigForRole(role),
    modelForRole: (role) => settings.models[role] ?? resolveModelForRole(role, projectDir),
    // Model tiering: per-turn model (driver GREEN/REFACTOR on a cheaper model than
    // its RED). Falls through to the role's base model when no per-turn map applies.
    modelForTurn: (role, turn) => settings.modelFor(role, turn),
    runner: { async run() {
    } },
    onAction: composeOnAction(
      // Narrate each routing decision in plain language (DRY: the same message
      // the structured log uses). The machine-readable form is already written to
      // the structured agent-log by makeOnAction below, so the raw action JSON is
      // console noise on every line – append it only under LAKEBASE_CONSORT_TRACE.
      (action, i) => {
        if (consortEnv("QUIET")) return;
        const trace = consortEnv("TRACE") ? `  ${JSON.stringify(action)}` : "";
        process.stderr.write(`[drive] ${String(i).padStart(3, "0")} ${describeAction(action, { featureId })}${trace}
`);
      },
      // Code-emit the orchestrator's lifecycle (handoff / phase.start /
      // gate.surfaced / experiment.* / phase.end) through the ONE common logger,
      // so the structured trail is written every run with no LLM in the loop.
      // The resolvers stamp each per-turn phase.start with the model + effort it
      // ran with (right after `role`).
      makeOnAction({
        consortDir,
        featureId,
        modelForRole: (role) => settings.models[role],
        effortForTurn: (role, turn) => {
          const e = settings.effortFor(role, turn);
          return e === "default" ? "" : e;
        }
      })
    )
  };
}
function composeOnAction(...hooks) {
  return (action, i) => {
    for (const h of hooks) h(action, i);
  };
}

// consort/orchestrator/agents/claude-step-agent.ts
var ClaudeStepAgent = class {
  constructor(levers, spawn5, liveDispatch) {
    this.levers = levers;
    this.spawn = spawn5 ?? spawnClaudeStreaming;
    this.liveDispatch = liveDispatch;
    this.sessionId = levers.resumeSessionId;
  }
  levers;
  spawn;
  liveDispatch;
  sessionId;
  lastResult;
  /**
   * The `claude` DriveCommand this agent will spawn for an invocation. Pure + exported
   * for guarding: the task is the orchestrator's passed-through prompt + guidelines + the
   * PROVIDED input contents (embedded so the agent needs no .consort access), and every
   * model-side lever is threaded onto the command (which claudeBaseArgs/claudeToolArgs
   * then translate to flags). CONTAINED: the task references only provided inputs + the
   * workspace it will be spawned in; it never points the agent at .consort.
   */
  buildCommand(invocation) {
    const { instructions, action, inputs } = invocation;
    const inputBlock = Object.keys(inputs).length ? `

Provided inputs (read these; do NOT look elsewhere):
${Object.entries(inputs).map(([id, content]) => `<<INPUT id="${id}">>
${content}
<<END INPUT ${id}>>`).join("\n\n")}` : "";
    const guidelines = instructions.guidelines?.length ? `

Guidelines (follow all):
${instructions.guidelines.map((g) => `- ${g}`).join("\n")}` : "";
    return {
      kind: "claude",
      role: this.levers.role,
      model: this.levers.model ?? "sonnet",
      task: instructions.prompt + inputBlock + guidelines,
      ...this.levers.effort ? { effort: this.levers.effort } : {},
      ...this.levers.fallbackModel ? { fallbackModel: this.levers.fallbackModel } : {},
      ...typeof this.levers.maxBudgetUsd === "number" ? { maxBudgetUsd: this.levers.maxBudgetUsd } : {},
      ...this.levers.allowedTools?.length ? { allowedTools: this.levers.allowedTools } : {},
      ...this.levers.disallowedTools?.length ? { disallowedTools: this.levers.disallowedTools } : {},
      replay: { mode: "mode" in action ? action.mode : void 0 }
    };
  }
  /** Session flags: resume a warm session (context kept) or start fresh (context cleared). */
  sessionArgs() {
    if (this.levers.session === "resume") {
      const id = this.sessionId ?? this.levers.resumeKey;
      if (id) return ["--resume", id];
      this.sessionId = (0, import_node_crypto5.randomUUID)();
      return ["--session-id", this.sessionId];
    }
    this.sessionId = (0, import_node_crypto5.randomUUID)();
    return ["--session-id", this.sessionId];
  }
  /** The full spawn arg vector for an invocation (exported for guarding via buildCommand). */
  spawnArgs(invocation) {
    const cmd = this.buildCommand(invocation);
    const args = claudeBaseArgs(cmd);
    if (cmd.effort) args.push("--effort", cmd.effort);
    if (cmd.fallbackModel) args.push("--fallback-model", cmd.fallbackModel);
    if (typeof cmd.maxBudgetUsd === "number") args.push("--max-budget-usd", String(cmd.maxBudgetUsd));
    args.push(...claudeToolArgs(cmd));
    args.push(...this.sessionArgs());
    return args;
  }
  async invoke(invocation) {
    if (this.liveDispatch) {
      await this.liveDispatch(invocation);
      const finalText2 = peekLastAgentTranscript()?.finalText;
      this.lastResult = finalText2 ? { finalText: finalText2 } : {};
      return;
    }
    const args = this.spawnArgs(invocation);
    const usage = await this.spawn(args, invocation.workspaceDir);
    const finalText = peekLastAgentTranscript()?.finalText;
    this.lastResult = { usage, finalText };
  }
};

// consort/orchestrator/agents/mock-replay-agent.ts
init_cjs_shims();
var import_node_fs16 = require("fs");
var import_node_path18 = require("path");
function makeMockReplayAgent(opts) {
  const role = opts.role ?? "product-owner";
  return {
    async invoke(invocation) {
      const materialized = [];
      for (const seed of opts.seeds) {
        const src = (0, import_node_path18.join)(opts.corpusRoot, seed.from);
        if (!(0, import_node_fs16.existsSync)(src)) {
          throw new Error(
            `ReplayPoMockAgent: recorded seed for "${seed.outputId}" not found at ${src} \u2013 a replay cannot fabricate it. Check the corpus root + recorded path.`
          );
        }
        const dst = (0, import_node_path18.join)(invocation.workspaceDir, seed.to);
        if (seed.kind === "tree") {
          (0, import_node_fs16.mkdirSync)(dst, { recursive: true });
          (0, import_node_fs16.cpSync)(src, dst, { recursive: true, force: true, filter: codeTreeFilter(src) });
        } else {
          (0, import_node_fs16.mkdirSync)((0, import_node_path18.dirname)(dst), { recursive: true });
          (0, import_node_fs16.writeFileSync)(dst, (0, import_node_fs16.readFileSync)(src, "utf8"));
        }
        materialized.push(seed.to);
      }
      const event = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        role,
        event: "artifact.written",
        message: `replayed PO authoring: ${materialized.join(", ")}`
      };
      const logPath = (0, import_node_path18.join)(invocation.workspaceDir, "agent-log.jsonl");
      const prior = (0, import_node_fs16.existsSync)(logPath) ? (0, import_node_fs16.readFileSync)(logPath, "utf8") : "";
      (0, import_node_fs16.writeFileSync)(logPath, prior + JSON.stringify(event) + "\n");
    }
  };
}
var CORPUS_CURSORS = /* @__PURE__ */ new Map();
var BUILD_TURN_CURSORS = /* @__PURE__ */ new Map();
function actionSignature(a) {
  return JSON.stringify(a);
}
function resolveTurnsDir(corpusRoot) {
  const here = (0, import_node_path18.join)(corpusRoot, "turns");
  if ((0, import_node_fs16.existsSync)(here)) return here;
  const parent = (0, import_node_path18.join)((0, import_node_path18.dirname)(corpusRoot), "turns");
  if ((0, import_node_fs16.existsSync)(parent)) return parent;
  return void 0;
}
function loadCursor(corpusRoot) {
  const existing = CORPUS_CURSORS.get(corpusRoot);
  if (existing) return existing;
  const turnsDir = resolveTurnsDir(corpusRoot);
  if (!turnsDir) {
    throw new Error(
      `makeStepReplayAgent: no turns/ timeline under corpus root ${corpusRoot} (nor its parent) \u2013 a step-aware replay needs the recorded turns/ dir (each turns/NNNN-<label>/turn.json + files/).`
    );
  }
  const turns = [];
  for (const name of (0, import_node_fs16.readdirSync)(turnsDir).sort()) {
    const dir = (0, import_node_path18.join)(turnsDir, name);
    const tj = (0, import_node_path18.join)(dir, "turn.json");
    if (!(0, import_node_fs16.existsSync)(tj) || !(0, import_node_fs16.statSync)(dir).isDirectory()) continue;
    try {
      const parsed = JSON.parse((0, import_node_fs16.readFileSync)(tj, "utf8"));
      if (parsed.action) turns.push({ dir, action: parsed.action });
    } catch {
    }
  }
  const cursor = { turns, consumed: /* @__PURE__ */ new Map() };
  CORPUS_CURSORS.set(corpusRoot, cursor);
  return cursor;
}
function lastSyncedBuildTurnIndex(corpusRoot, story) {
  return BUILD_TURN_CURSORS.get(`${corpusRoot}::${story}`) ?? 0;
}
function isBuildTurn(a) {
  return a.kind === "invoke-role" && (a.role === "navigator" || a.role === "driver") && "story" in a && typeof a.story === "string" && !!a.story && !("buildMode" in a && a.buildMode === "reflect");
}
function remapArtifactRoot(rel) {
  const parts = rel.split(import_node_path18.sep);
  if (parts.length > 0 && LEGACY_ARTIFACT_ROOTS.includes(parts[0])) {
    parts[0] = ARTIFACT_ROOT;
    return parts.join(import_node_path18.sep);
  }
  return rel;
}
function materializeFiles(filesDir, workspaceDir) {
  const out = [];
  const walk2 = (abs) => {
    for (const name of (0, import_node_fs16.readdirSync)(abs)) {
      const src = (0, import_node_path18.join)(abs, name);
      if ((0, import_node_fs16.statSync)(src).isDirectory()) {
        walk2(src);
        continue;
      }
      const rel = remapArtifactRoot((0, import_node_path18.relative)(filesDir, src));
      const dst = (0, import_node_path18.join)(workspaceDir, rel);
      (0, import_node_fs16.mkdirSync)((0, import_node_path18.dirname)(dst), { recursive: true });
      (0, import_node_fs16.writeFileSync)(dst, (0, import_node_fs16.readFileSync)(src));
      out.push(rel);
    }
  };
  walk2(filesDir);
  return out;
}
function makeStepReplayAgent(opts) {
  return {
    async invoke(invocation) {
      if (isBuildTurn(invocation.action) && opts.buildCorpusRoot && opts.featureId && opts.consortDir) {
        const story = invocation.action.story;
        const key = `${opts.corpusRoot}::${story}`;
        const turnIndex = (BUILD_TURN_CURSORS.get(key) ?? 0) + 1;
        BUILD_TURN_CURSORS.set(key, turnIndex);
        const synced = replayBuildTurn({
          replayBuildDir: opts.buildCorpusRoot,
          projectDir: invocation.workspaceDir,
          consortDir: opts.consortDir,
          featureId: opts.featureId,
          story,
          turnIndex
        });
        if (!synced) {
          throw new Error(
            `makeStepReplayAgent: no recorded-build turn ${turnIndex} for ${opts.featureId}/${story} under ${opts.buildCorpusRoot} \u2013 a replay cannot fabricate it (the drive dispatched more build turns than the corpus recorded).`
          );
        }
        return;
      }
      const cursor = loadCursor(opts.corpusRoot);
      const sig2 = actionSignature(invocation.action);
      const already = cursor.consumed.get(sig2) ?? 0;
      const matches = cursor.turns.filter((t) => actionSignature(t.action) === sig2);
      const turn = matches[already];
      if (!turn) {
        throw new Error(
          `makeStepReplayAgent: no recorded turn for action ${sig2} (occurrence #${already + 1}) under ${opts.corpusRoot}/turns \u2013 a replay cannot fabricate it. Recorded ${matches.length} occurrence(s) of this action.`
        );
      }
      cursor.consumed.set(sig2, already + 1);
      const filesDir = (0, import_node_path18.join)(turn.dir, "files");
      const materialized = (0, import_node_fs16.existsSync)(filesDir) ? materializeFiles(filesDir, invocation.workspaceDir) : [];
      const role = invocation.action.kind === "invoke-role" ? invocation.action.role : "orchestrator";
      const event = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        role,
        event: "artifact.written",
        message: `replayed ${role} turn ${turn.dir.split(import_node_path18.sep).pop()}: ${materialized.join(", ") || "(no files delta)"}`
      };
      const logPath = (0, import_node_path18.join)(invocation.workspaceDir, "agent-log.jsonl");
      const prior = (0, import_node_fs16.existsSync)(logPath) ? (0, import_node_fs16.readFileSync)(logPath, "utf8") : "";
      (0, import_node_fs16.writeFileSync)(logPath, prior + JSON.stringify(event) + "\n");
    }
  };
}

// consort/orchestrator/agents/agent-catalogue.ts
function buildClaude(config, context) {
  const c = config;
  if (!c.role) throw new Error(`agent-catalogue: kind "claude" requires config.role.`);
  return new ClaudeStepAgent(c, void 0, context.liveDispatch);
}
function buildReplay(config, context) {
  const c = config;
  if (!context.corpusRoot) {
    throw new Error(`agent-catalogue: kind "replay" requires context.corpusRoot (the runner supplies it).`);
  }
  if (Array.isArray(c.seeds) && c.seeds.length > 0) {
    return makeMockReplayAgent({ corpusRoot: context.corpusRoot, role: c.role, seeds: c.seeds });
  }
  return makeStepReplayAgent({
    corpusRoot: context.corpusRoot,
    ...context.buildCorpusRoot ? { buildCorpusRoot: context.buildCorpusRoot } : {},
    ...context.buildFeatureId ? { featureId: context.buildFeatureId } : {},
    ...context.buildConsortDir ? { consortDir: context.buildConsortDir } : {}
  });
}
function buildMock(config, _context) {
  const outputs = config.outputs ?? {};
  const role = config.role ?? "mock";
  return {
    async invoke(invocation) {
      for (const [filename, contents] of Object.entries(outputs)) {
        (0, import_node_fs17.writeFileSync)((0, import_node_path19.join)(invocation.workspaceDir, filename), contents);
      }
      const logPath = (0, import_node_path19.join)(invocation.workspaceDir, "agent-log.jsonl");
      const prior = (0, import_node_fs17.existsSync)(logPath) ? (0, import_node_fs17.readFileSync)(logPath, "utf8") : "";
      const event = { timestamp: (/* @__PURE__ */ new Date()).toISOString(), level: "info", role, event: "artifact.written", message: `mock wrote ${Object.keys(outputs).join(", ") || "(nothing)"}` };
      (0, import_node_fs17.writeFileSync)(logPath, prior + JSON.stringify(event) + "\n");
    }
  };
}
var AGENT_CATALOGUE = {
  claude: {
    description: "The REAL agent: spawns `claude -p --agent <role>` and lets the model produce the step's artifact. Pick for a live run.",
    configSummary: "{ role (required), model?, effort?, session?('fresh'|'resume'), resumeKey?, allowedTools?, disallowedTools?, fallbackModel?, maxBudgetUsd? }",
    build: buildClaude
  },
  replay: {
    description: "Emits RECORDED artifacts by copying configured seed files from the corpus (context.corpusRoot). Offline/headless \u2013 no model, no cloud.",
    configSummary: "{ role?, seeds: [{ outputId, from (corpus-relative), to (workspace-relative) }] }",
    build: buildReplay
  },
  mock: {
    description: "A test double that writes configured fixture outputs into the workspace. For unit tests / hermetic runs.",
    configSummary: "{ role?, outputs: { <filename>: <contents> } }",
    build: buildMock
  }
};
function resolveAgentKind(kind) {
  const entry = AGENT_CATALOGUE[kind];
  if (!entry) {
    const known = Object.keys(AGENT_CATALOGUE).sort().join(", ");
    throw new Error(`agent-catalogue: unknown agent kind "${kind}" (a manifest referenced a kind not in the catalogue). Known: ${known}.`);
  }
  return entry;
}
function buildAgent(spec, context) {
  return resolveAgentKind(spec.kind).build(spec.config ?? {}, context);
}

// consort/orchestrator/agents/replay-recorder-wrapper.ts
init_cjs_shims();
function wrapWithRecorder(inner, ctx) {
  let seeded = false;
  const recordingInvoke = async (invocation) => {
    if (!seeded) {
      seedRecorderBaseline({ recordDir: ctx.recordDir, projectDir: ctx.projectDir, consortDir: ctx.consortDir });
      seeded = true;
    }
    const turnDir = turnDirFor(ctx.recordDir, invocation.action);
    if (!ctx.liveIndex) {
      recordReplaySet({
        turnDir,
        projectDir: ctx.projectDir,
        consortDir: ctx.consortDir,
        inputs: invocation.inputs,
        prompt: invocation.instructions.prompt,
        ...invocation.instructions.guidelines ? { guidelines: invocation.instructions.guidelines } : {},
        ...ctx.resolveLevers ? { levers: ctx.resolveLevers(invocation) } : {}
      });
    }
    await inner.invoke(invocation);
    const action = invocation.action;
    const transcript = ctx.takeTranscript?.();
    recordTurn({
      recordDir: ctx.recordDir,
      projectDir: ctx.projectDir,
      consortDir: ctx.consortDir,
      action,
      step: 0,
      ...transcript ? { transcript } : {},
      ...ctx.liveIndex ? { snapshotContent: false } : {}
    });
    if (!ctx.liveIndex && ctx.recordBuildDir && action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver") && "story" in action && typeof action.story === "string") {
      const turn = nextBuildTurnNumber(ctx.recordBuildDir, ctx.featureId, action.story);
      recordBuildTurn({
        recordBuildDir: ctx.recordBuildDir,
        projectDir: ctx.projectDir,
        consortDir: ctx.consortDir,
        featureId: ctx.featureId,
        story: action.story,
        turn,
        role: action.role,
        ..."ac" in action && typeof action.ac === "string" ? { ac: action.ac } : {},
        ..."buildMode" in action && typeof action.buildMode === "string" ? { mode: action.buildMode } : {}
      });
    }
    assertTurnComplete(turnDir, action, ctx.liveIndex ? { liveIndex: true } : { liveCapture: ctx.takeTranscript !== void 0 });
  };
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "invoke") return recordingInvoke;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

// consort/orchestrator/drive/executor-dispatch.ts
function executorDispatched(action) {
  if (action.kind !== "invoke-role") return false;
  if ("mode" in action) {
    if (action.role === "spec-author" && (action.mode === "breakdown" || action.mode === "propose")) return true;
    if (action.role === "architect-reviewer" && action.mode === "estimate") return true;
    if (action.role === "product-owner" && action.mode === "intake") return true;
    if (action.role === "product-owner" && action.mode === "author-requests") return true;
    return false;
  }
  if (!("buildMode" in action)) {
    if ((action.role === "spec-author" || action.role === "architect-reviewer" || action.role === "test-strategist") && "story" in action && !!action.story) {
      return true;
    }
    if (action.role === "dba" && "story" in action && !!action.story) return true;
    if (action.role === "ux-designer") return true;
    if ((action.role === "navigator" || action.role === "driver") && "story" in action && !!action.story) {
      return true;
    }
    return false;
  }
  if ("story" in action && !!action.story && "buildMode" in action) {
    if (action.role === "navigator" && (action.buildMode === "assess" || action.buildMode === "assess-deploy" || action.buildMode === "assess-refactor")) {
      return true;
    }
    if (action.role === "navigator" && action.buildMode === "review") return true;
    if (action.role === "driver" && (action.buildMode === "refactor" || action.buildMode === "repair")) return true;
    if (action.role === "navigator" && action.buildMode === "reflect") return true;
    if (action.role === "driver" && (action.buildMode === "refactor-deploy" || action.buildMode === "refactor-superseded" || action.buildMode === "green-superseded")) return true;
  }
  return false;
}
function deterministicAgentless(action) {
  if (action.kind !== "invoke-role" || !("mode" in action)) return false;
  if (action.role === "architect-reviewer" && action.mode === "estimate-committed") return true;
  return false;
}
function isPlanningMode(action) {
  return action.kind === "invoke-role" && "mode" in action && (action.mode === "propose" || action.mode === "estimate" || action.mode === "estimate-committed" || action.mode === "intake" || action.mode === "author-requests");
}
function assertNotStrandedAgentTurn(action) {
  if (action.kind !== "invoke-role") return;
  if (executorDispatched(action) || deterministicAgentless(action)) return;
  throw new Error(
    `LEGACY AGENT-PATH GUARD: invoke-role action ${JSON.stringify(action)} is neither executor-dispatched nor a sanctioned deterministic-agentless action (estimate-committed). A real agent turn must NEVER run on the legacy commandsForAction path \u2013 it would skip the executor's recording, output validation, and routing contract (silent corruption). Fix: add it to the executor allowlist (executorDispatched) with a shipped manifest, or \u2013 if it is genuinely agent-less \u2013 to deterministicAgentless. Do NOT run it on legacy. (Likely cause: a coverage gap, or LAKEBASE_CONSORT_USE_MANIFEST_STEPS forcing the legacy path.)`
  );
}
function manifestPostTurnCommands(manifest, when, action, cfg, deps) {
  const tdd = ["--feature", cfg.featureId, "--tdd-dir", cfg.consortDir];
  const resolveBin = (t) => deps.binTokens[t] ?? t;
  const story = "story" in action && typeof action.story === "string" ? action.story : void 0;
  const expand = (args) => args.flatMap(
    (a) => a === "--tdd" ? tdd : a === "{feature}" ? [cfg.featureId] : a === "{tddDir}" ? [cfg.consortDir] : a === "{story}" ? story ? [story] : [] : [a]
  );
  const out = [];
  for (const p of manifest.postTurn ?? []) {
    if ((p.when ?? "after") !== when) continue;
    if (p.bin === "@build-cycle") {
      if (action.kind === "invoke-role") {
        const cycle = deps.buildCycleCommand(action, cfg);
        if (cycle) out.push(cycle);
      }
      continue;
    }
    if (p.bin === "@sync-backlog") {
      if (cfg.sprintName) out.push({ kind: "sync-backlog", sprint: cfg.sprintName });
      continue;
    }
    out.push({ kind: "cli", bin: resolveBin(p.bin), args: expand(p.args) });
  }
  return out;
}
function declaredPreconditionKinds(manifest) {
  return new Set((manifest.preconditions ?? []).map((p) => p.kind));
}
function outputPathsForAction(action, consortDir, featureId, projectDir) {
  if (action.kind !== "invoke-role") return {};
  const f = featureId;
  const story = "story" in action && typeof action.story === "string" ? action.story : void 0;
  const rel = (abs) => (0, import_node_path20.relative)(consortDir, abs);
  const META = { "agent-log": "agent-log.jsonl" };
  if ("mode" in action) {
    if (action.role === "spec-author" && action.mode === "breakdown") {
      return { "feature-spec": rel(featureSpecJson(consortDir, f)), ...META };
    }
    if (action.role === "spec-author" && action.mode === "propose") {
      return { "feature-proposals": rel(featureProposalsMd(consortDir)) };
    }
    if (action.role === "architect-reviewer" && action.mode === "estimate") {
      return { estimates: rel(planningEstimatesJson(consortDir)) };
    }
    if (action.role === "product-owner" && action.mode === "intake") {
      return { "product-overview": "product-overview.md", nfrs: "nfrs.md", "design-brief": "design/design-brief.md" };
    }
    return {};
  }
  if (!("buildMode" in action)) {
    if (action.role === "spec-author" && story) {
      return { acs: rel(acsDir(consortDir, f, story)), ...META };
    }
    if (action.role === "architect-reviewer" && story) {
      return { architecture: rel(architectureJson(consortDir, f)), ...META };
    }
    if (action.role === "dba" && story) {
      return { "db-design": rel(dbDesignJson(consortDir, f)), ...META };
    }
    if (action.role === "test-strategist" && story) {
      return { "test-list": rel(featureTestListJson(consortDir, f)), ...META };
    }
    if (action.role === "ux-designer") {
      return { "design-guide": rel(designGuideJson(consortDir)), ...META };
    }
    if (action.role === "navigator" && story) {
      return { tests: "tests", ...META };
    }
    if (action.role === "driver" && story) {
      const productSubdir = projectDir ? productDirForLanguage(projectLanguage(projectDir)) : "app";
      return { code: productSubdir, ...META };
    }
    return {};
  }
  if (action.role === "navigator" && story && "buildMode" in action && action.buildMode === "assess-deploy") {
    return { scope: rel((0, import_node_path20.join)(storyResolved(consortDir, f, story), "deploy-verify-scope.json")) };
  }
  return {};
}
function liveDispatchSeam(cfg, deps) {
  return async (invocation) => {
    const a = invocation.action;
    if (a.kind !== "invoke-role") {
      throw new Error(`live dispatch only handles invoke-role actions; got ${JSON.stringify(a)}`);
    }
    const body = invocation.instructions?.prompt ?? deps.buildTaskBody(a, cfg);
    await cfg.runner.run(deps.buildClaudeCommandWithBody(a, cfg, body));
  };
}
async function performTurnViaExecutor(action, state, routerDeps, cfg, deps) {
  if (!cfg.useManifestSteps || !executorDispatched(action)) return void 0;
  const manifest = manifestForAction(action);
  if (!manifest) return void 0;
  {
    const mode = "mode" in action && typeof action.mode === "string" ? `/${action.mode}` : "";
    const role = "role" in action && typeof action.role === "string" ? action.role : action.kind;
    const lane = consortEnv("REPLAY_DIR")?.trim() ? "replay" : consortEnv("RECORD_DIR")?.trim() ? "record" : "live";
    process.stderr.write(`[executor] dispatch ${manifest.id} (${role}${mode}, ${lane})
`);
  }
  const replayDir = consortEnv("REPLAY_DIR")?.trim();
  const replayBuildDir = consortEnv("REPLAY_BUILD_DIR")?.trim();
  const recordDir = consortEnv("RECORD_DIR")?.trim();
  const spec = replayDir ? { ...manifest.agent, kind: "replay", config: {} } : manifest.agent;
  let agent = buildAgent(spec, {
    workspaceDir: cfg.projectDir,
    liveDispatch: liveDispatchSeam(cfg, deps),
    ...replayDir ? { corpusRoot: replayDir } : {},
    // Build-lane replay: a navigator/driver turn SYNCS its cumulative recorded-build snapshot
    // (replayBuildTurn) instead of a delta, so the tree matches record-time + the live verify is honest.
    ...replayDir && replayBuildDir ? { buildCorpusRoot: replayBuildDir, buildFeatureId: cfg.featureId, buildConsortDir: cfg.consortDir } : {}
  });
  const liveIndex = !recordDir && !replayDir && cfg.takeTranscript !== void 0;
  const turnRecordDir = recordDir || (liveIndex ? cfg.consortDir : void 0);
  if (turnRecordDir) {
    agent = wrapWithRecorder(agent, {
      recordDir: turnRecordDir,
      ...consortEnv("RECORD_BUILD_DIR")?.trim() ? { recordBuildDir: consortEnv("RECORD_BUILD_DIR").trim() } : {},
      projectDir: cfg.projectDir,
      consortDir: cfg.consortDir,
      featureId: cfg.featureId,
      ...cfg.takeTranscript ? { takeTranscript: cfg.takeTranscript } : {},
      // The RESOLVED agent levers for the replay set's levers.json: the manifest's agent config IS
      // the AgentLevers the claude kind is built from (agent-catalogue buildClaude: config as
      // Partial<AgentLevers>), so this is the authoritative lever set (role/model/effort/toolScope),
      // captured with no duplication of the resolution. Merged with the manifest's agentOptions
      // (model/effort/session), the documented per-step lever home the optimize sweep varies.
      resolveLevers: () => ({ ...manifest.agentOptions ?? {}, ...manifest.agent?.config ?? {} }),
      ...liveIndex ? { liveIndex: true } : {}
    });
  }
  const step = new Step(manifest, agent);
  const f = cfg.featureId;
  const story = "story" in action && typeof action.story === "string" ? action.story : void 0;
  const ac = "ac" in action && typeof action.ac === "string" ? action.ac : void 0;
  const expandRel = (rel) => rel.replace(/\{feature\}/g, f).replace(/\{story\}/g, story ?? "");
  const inputPath = (source) => {
    if (source.startsWith("cycle:") || source.startsWith("ac:")) {
      const rel = expandRel(source.slice(source.indexOf(":") + 1));
      if (!story || !ac) return (0, import_node_path20.join)(cfg.consortDir, rel);
      return (0, import_node_path20.join)(cycleDir(cfg.consortDir, f, story, ac), rel);
    }
    if (source.startsWith("story:")) {
      const rel = expandRel(source.slice("story:".length));
      if (!story) return (0, import_node_path20.join)(cfg.consortDir, rel);
      return (0, import_node_path20.join)(storyResolved(cfg.consortDir, f, story), rel);
    }
    return (0, import_node_path20.join)(cfg.consortDir, expandRel(source.replace(/^feature:/, "")));
  };
  const executorDeps = {
    // Uncontained: the agent reads the tree itself, but Step still gates on the presence of
    // each declared input, so presence-check them on the live tree. A FILE input's content is read
    // (some checkers want it); a DIRECTORY input (e.g. acs/) is presence-only (empty sentinel) ,
    // its content isn't injected, the agent reads the dir. Fail loud (return {missing}) if absent.
    resolveInputs: () => {
      const out = {};
      for (const input of manifest.inputs) {
        const p = inputPath(input.source);
        if (!fs16.existsSync(p)) {
          if (input.optional) continue;
          if (replayDir) {
            out[input.id] = "";
            continue;
          }
          return { missing: input.id };
        }
        out[input.id] = fs16.statSync(p).isDirectory() ? "" : fs16.readFileSync(p, "utf8");
      }
      return out;
    },
    // The workspace IS the real project (the live seam's runner spawns in cfg.projectDir).
    // product-channel outputs (tests/, app/) land at the project root; artifact + meta channels
    // resolve under the real .consort (artifactDir = metaDir = cfg.consortDir), so the orchestrator
    // places the design docs + the reconciled agent-log there – the manifest filename stays bare.
    provisionWorkspace: () => ({ workspaceDir: cfg.projectDir, artifactDir: cfg.consortDir, metaDir: cfg.consortDir, outputPaths: outputPathsForAction(action, cfg.consortDir, f, cfg.projectDir) }),
    // The BASE instruction prompt = the role's task body with the manifest's DECLARED precondition
    // kinds OMITTED (phase 2.5 re-injects those in position via deps.prepare). A turn that declares
    // NO preconditions gets the full inline body (omit=∅) – byte-identical to the pre-A-full spawn.
    // A migrated turn (e.g. assess declaring green-failure-advisory) gets the body MINUS that inline
    // block; phase 2.5 prepends it back, so the assembled prompt matches the legacy inline order.
    instructionsFor: () => action.kind === "invoke-role" ? { prompt: deps.buildTaskBody(action, cfg, declaredPreconditionKinds(manifest)) } : { prompt: "" },
    // Phase 2.5: PROJECT each declared precondition via the injected preparer registry. The block
    // is the SAME pure projection roleTaskBody used inline; phase 2.5 places it by the precondition's
    // `position` (prepend for the green-failure advisory, append for the context-pack).
    prepare: (kind, pre, _action) => deps.preparerFor(kind)({ consortDir: cfg.consortDir, featureId: f, story: story ?? "", ac: "ac" in action && typeof action.ac === "string" ? action.ac : "", ...cfg.projectDir ? { projectDir: cfg.projectDir } : {}, ...pre.options ? { options: pre.options } : {} }),
    // Phase 2.7: the manifest's `before` CLIs (e.g. breakdown's reset-breakdown), run through the runner.
    preTurnEffects: async () => {
      for (const cmd of manifestPostTurnCommands(manifest, "before", action, cfg, deps)) await cfg.runner.run(cmd);
    },
    // Phase 4.5: reconcile MATERIALIZES the agent-log (the legacy path's LOG_BIN --reconcile), so
    // validate-outputs sees the conformant agent-log.jsonl the agent never wrote itself. SKIPPED for
    // the sprint-scoped PLANNING modes (propose / estimate / estimate-committed) – they write no
    // feature agent-log to reconcile + declare no agent-log output, and the legacy path guards
    // reconcile with the SAME `!isPlanningMode` condition (commandsForAction / commandsFromManifest),
    // so skipping here keeps the executor byte-parallel to the legacy stream ([claude] only).
    materializeOutputs: async () => {
      if (isPlanningMode(action)) return;
      await cfg.runner.run({ kind: "cli", bin: deps.logBin, args: ["--reconcile", "--feature", f, "--tdd-dir", cfg.consortDir] });
    },
    // Phase 6.5: the manifest's `after` CLIs – gated on clean validation by the executor. For
    // breakdown that is sync-breakdown; for navigator RED it is the `@build-cycle` RED stamp (the
    // cycle `begin`), which flips testsWritten so the loop advances to the Driver.
    postTurnEffects: async () => {
      for (const cmd of manifestPostTurnCommands(manifest, "after", action, cfg, deps)) await cfg.runner.run(cmd);
    }
  };
  const readFresh = () => cfg.readFreshDriveState?.() ?? deps.readDriveStateFromDisk(cfg.consortDir, cfg.featureId, cfg.projectDir, { uiTrack: cfg.uiTrack });
  const freshRouterDeps = {
    ...routerDeps,
    allowed: () => routerDeps.allowed(readFresh())
  };
  const ctx = { action, cfg, state, validateBoundDeps: freshRouterDeps };
  const turnStart = Date.now();
  const result = await execute(step, ctx, executorDeps);
  if (action.kind === "invoke-role") {
    const doneModel = manifest.agentOptions?.model ?? "live";
    process.stderr.write(`[drive] ${action.role} turn ${((Date.now() - turnStart) / 1e3).toFixed(1)}s (${doneModel})
`);
  }
  if (replayDir && replayBuildDir && isBuildTurn(action)) {
    assertReplayBuildVerdictMatch({
      replayBuildDir,
      consortDir: cfg.consortDir,
      featureId: cfg.featureId,
      story: action.story,
      turnIndex: lastSyncedBuildTurnIndex(replayDir, action.story),
      role: action.role
    });
  }
  return result.bounded;
}

// consort/session/response-formatter.ts
init_cjs_shims();
var import_node_fs18 = require("fs");
function designGuideConformance(consortDir) {
  const file = designGuideJson(consortDir);
  if (!(0, import_node_fs18.existsSync)(file)) {
    return { ok: false, problem: "design-guide.json not written (the machine-checkable token source of truth)" };
  }
  let content;
  try {
    content = (0, import_node_fs18.readFileSync)(file, "utf8");
  } catch (e) {
    return { ok: false, problem: `unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = checkArtifactConformance(canonicalArtifactName(file), content);
  return r.ok ? { ok: true } : { ok: false, problem: r.violations.join("; ") };
}

// consort/orchestrator/build/build-context.ts
init_cjs_shims();
var import_node_child_process8 = require("child_process");
var fs17 = __toESM(require("fs"), 1);
var import_node_path21 = require("path");
function artifactRoot(consortDir) {
  return consortDir;
}
function contextRubric(consortDir, featureId, story, ac) {
  const parts = [];
  const layers = /* @__PURE__ */ new Set();
  const acIds = ac ? [ac] : storyAcIds(consortDir, featureId, story);
  for (const id of acIds) {
    const l = readAcLayer(consortDir, featureId, id);
    if (l) layers.add(l);
  }
  if (layers.size) parts.push(`layer${layers.size > 1 ? "s" : ""}=${[...layers].join(", ")}`);
  try {
    const arch = JSON.parse(fs17.readFileSync(architectureJson(consortDir, featureId), "utf8"));
    const nfrs = (arch.nfrs ?? []).filter(
      (n) => n && typeof n.id === "string" && (n.applies_to === story || n.applies_to === featureId)
    );
    if (nfrs.length) {
      parts.push(`required NFRs, ${nfrs.map((n) => `${n.id}${n.brief ? ` (${n.brief})` : ""}`).join("; ")}`);
    }
  } catch {
  }
  if (layers.has("E2E")) {
    try {
      const dg = JSON.parse(fs17.readFileSync(designGuideJson(consortDir), "utf8"));
      const groups = Object.keys(dg.tokens ?? dg);
      if (groups.length) parts.push(`design-token groups, ${groups.join(", ")}`);
    } catch {
    }
  }
  return parts.length ? ` RUBRIC (pre-extracted; judge against THIS) :: ${parts.join(" | ")}.` : "";
}
function rubricSourcesNote(rubric, featureId, root) {
  if (!rubric) return "";
  return ` The rubric above is pre-extracted from ${root}/features/${featureId}/architecture.md, ${root}/nfrs.md, and ${root}/design/design-guide.md, open those full files ONLY if you need more detail than it carries (do not re-read them by default).`;
}
var defaultDbStateReader = (projectDir) => {
  const one = (args) => {
    try {
      return (0, import_node_child_process8.execSync)(`uv run --env-file .env alembic ${args}`, { cwd: projectDir, stdio: ["ignore", "pipe", "ignore"], timeout: 6e4 }).toString().trim() || void 0;
    } catch {
      return void 0;
    }
  };
  const current = one("current");
  const heads = one("heads");
  return current || heads ? { current, heads } : void 0;
};
var defaultFailingTestReader = (projectDir, story) => {
  if (projectLanguage(projectDir) === "nodejs") return void 0;
  const file = (0, import_node_path21.join)(projectDir, "tests", "step_defs", `test_${story.replace(/-/g, "_")}.py`);
  try {
    const body = fs17.readFileSync(file, "utf8");
    return body.length > 4e3 ? body.slice(0, 4e3) + "\n\u2026 (truncated; read the full file if needed)" : body;
  } catch {
    return void 0;
  }
};
function readCtxLeverMarker(consortDir) {
  try {
    return JSON.parse(fs17.readFileSync((0, import_node_path21.join)(consortDir, "ctx-levers.json"), "utf8"));
  } catch {
    return {};
  }
}
function failingTestBlock(consortDir, story, reader = defaultFailingTestReader) {
  const body = reader((0, import_node_path21.dirname)(consortDir), story);
  return body ? ` FAILING TEST (make THIS pass; do NOT search for it) ::
\`\`\`python
${body}
\`\`\`` : "";
}
function scopeNoteBlock() {
  return ` SCOPE :: Make ONLY the single failing test green with the SIMPLEST honest code at ITS OWN layer. Iterate on that one test (\`uv run --env-file .env pytest <its path> -x -q\`). Do NOT investigate, build, or run OTHER layers' surfaces this turn (e.g. if the failing test is backend, do not touch, grep, or run the client/SPA \u2013 StockView*, vite, npx vitest; a later refactor turn owns that). The post-turn honest-GREEN verify is authoritative; stop once the single test passes.`;
}
function buildContextPack(consortDir, featureId, story, ac, opts = {}) {
  const root = artifactRoot(consortDir);
  const rubric = contextRubric(consortDir, featureId, story, ac);
  const parts = [];
  if (rubric) parts.push(rubric + rubricSourcesNote(rubric, featureId, root));
  const conventions = readConventions(consortDir);
  if (conventions?.layers?.length) {
    const layout = conventions.layers.map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`).join(" | ");
    parts.push(` LAYOUT (place/judge code at THESE paths, do not scan for them) :: ${layout}.`);
  }
  {
    const language = projectLanguage((0, import_node_path21.dirname)(consortDir));
    const runHint = language === "nodejs" ? ` RUN/REACHABILITY :: node project \u2013 source under src/ (there is NO app/). To confirm the app boots or is reachable, run the project's OWN start (the package.json start/dev script, e.g. \`node src/index.js\`) and GET the health path over HTTP \u2013 do NOT assume Python or run \`python -c "import app.main"\` (it will false-fail here).` : language === "java" || language === "kotlin" ? ` RUN/REACHABILITY :: ${language} project. To confirm the app boots or is reachable, run \`./mvnw spring-boot:run\` and GET the health path over HTTP \u2013 do NOT assume Python (\`python -c "import app.main"\` false-fails here).` : ` RUN/REACHABILITY :: python project \u2013 source under app/. To confirm the app boots or is reachable, run \`uv run uvicorn app.main:app\` and GET the health path over HTTP. Reachability is an HTTP response, never just an import succeeding.`;
    parts.push(runHint);
  }
  if (!opts.skipTestLoop) {
    parts.push(
      ` TESTS :: this story's tests are under tests/step_defs/ (behavior, one file per story) and tests/architecture/ (fitness: layering, persistence invariants, migration reversibility). Read those named paths directly; do NOT find/grep/ls to locate them. Iterate against the single failing test while fixing; the honest-GREEN verify is the authoritative full run.`
    );
  }
  const marker = readCtxLeverMarker(consortDir);
  const dbOn = opts.dbState ?? marker.dbState ?? consortEnv("CTX_DBSTATE") === "1";
  if (dbOn) {
    const st = (opts.dbStateReader ?? defaultDbStateReader)((0, import_node_path21.dirname)(consortDir));
    if (st && (st.current || st.heads)) {
      parts.push(
        ` DB STATE (already probed, do NOT re-run alembic current/heads) ::${st.current ? ` current=${st.current.replace(/\s+/g, " ")}` : ""}${st.heads ? ` head=${st.heads.replace(/\s+/g, " ")}` : ""}. The branch is migrated to head; iterate with \`uv run --env-file .env pytest <path>\` (no re-migrate).`
      );
    }
  }
  const testOn = opts.failingTest ?? marker.failingTest ?? consortEnv("CTX_FAILINGTEST") === "1";
  if (testOn) {
    const block = failingTestBlock(consortDir, story, opts.failingTestReader ?? defaultFailingTestReader);
    if (block) parts.push(block);
  }
  const scopeOn = opts.scopeNote ?? marker.scopeNote ?? consortEnv("CTX_SCOPENOTE") === "1";
  if (scopeOn) parts.push(scopeNoteBlock());
  const migrationOn = opts.migration ?? marker.migration ?? consortEnv("CTX_MIGRATION") === "1";
  if (migrationOn) {
    const language = projectLanguage((0, import_node_path21.dirname)(consortDir));
    const migrationGuide = language === "nodejs" ? ` MIGRATION :: knex migrations live in migrations/. Create one with \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author it or grep scripts/lk). Source/models live under src/; apply with \`npm run migrate\`.` : language === "java" || language === "kotlin" ? ` MIGRATION :: flyway migrations live in src/main/resources/db/migration/. Create one with \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author it or grep scripts/lk). Apply with \`./mvnw -q flyway:migrate\`.` : ` MIGRATION :: alembic migrations live in alembic/versions/. Create one with \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author the revision file or grep scripts/lk to find the command). ORM models are in app/models.py; apply with \`uv run --env-file .env alembic upgrade head\`.`;
    parts.push(migrationGuide);
  }
  return parts.join("");
}

// consort/orchestrator/build/preconditions.ts
init_cjs_shims();

// consort/test-list/test-analyst-roster.ts
init_cjs_shims();

// consort/test-list/test-analyst-catalogue.ts
init_cjs_shims();
var SLICE_CONTRACT = 'Return an UNORDERED JSON array of test-list items as the LAST thing in your reply, fenced as ```json ... ```. Each item is { "id": "<kind-local id, e.g. bhv-1>", "description": "<one observable behavior, no \'and\'>", "ac_id": "<EXACT id of an existing story AC file>", "status": "pending", "kind": "<your kind>" }. Do NOT order the items and do NOT set ordered_for \u2013 the supervisor orders the merged master and assigns the final T-ids. Map every item to a real story AC id (copy it verbatim, never re-slug).';
var TEST_ANALYST_CATALOGUE = {
  behavior: {
    kind: "behavior",
    description: "Backend behavior/API scenarios: one observable behavior per AC through the API boundary.",
    configSummary: "Per AC: >=1 behavior item through the API boundary (pytest-bdd .feature).",
    model: "sonnet",
    effort: "default",
    toolScope: ["Read"],
    inputs: ["story-acs", "architecture-invariants"],
    focusPrompt: "You are the BEHAVIOR test analyst. Cover every BACKEND-layer AC (API / service / data / INFRA) whose outcome is observable through the API boundary with at least one `kind:\"behavior\"` item \u2013 one observable behavior verified through the API boundary (for Python, a pytest-bdd scenario; set `scenario_file` to `tests/features/<story>.feature`). An `Infra`-layer AC (e.g. 'distinct (sku,location) coexist', 'refile updates in place') still has an observable API behavior \u2013 it is YOURS, do not skip it as 'DB-only'. ASSERT THE AC'S CORE PROMISED OUTCOME \u2013 the actual result the AC guarantees (a refile leaves the stored quantity == the NEW value AND exactly ONE row for the pair; filing the same SKU at two DIFFERENT locations yields TWO independently-retrievable coexisting rows), NOT merely a peripheral aspect (a preserved timestamp, atomicity). For a uniqueness / multi-key invariant, cover BOTH sides: the COLLISION (same key -> rejected / stays one row) AND the DISTINCT-keys-COEXIST positive (different keys -> independent rows). A test that checks only the peripheral aspect or only the collision lets a Driver go green without the real behavior \u2013 the recurring reflect-testlist-defect. **DO NOT author a behavior item for an E2E / UI-presentation AC** (e.g. a \"filing form\" / \"home screen\" AC whose `layer` is `E2E`): those are the CLIENT analyst's Playwright job, NOT a backend pytest-bdd test. Set each item's `ac_id` ONLY to an AC whose layer permits a backend test; anchoring a 2xx / response-shape check to a UI AC (instead of the API-layer AC) is the recurring mis-route the reflect gate rejects \u2013 if an AC's observable outcome is an HTTP response shape, it belongs on the API-layer AC, never the form/screen AC. Test at the OUTERMOST public boundary matching the AC's layer. One test per scenario, never an \"and\". EVERY write-bearing test (POST/insert/seed) MUST own its state \u2013 use a per-run-unique key suffixed with the platform's BUILT-IN UUID (Python `uuid.uuid4()` from the stdlib; JS/TS `crypto.randomUUID()`; Java `java.util.UUID`) OR delete/upsert the fixed key before writing, never assume an empty table. NEVER add a UUID dependency: in JS/TS do NOT `import ... from \"uuid\"` \u2013 the `uuid` npm package is not a scaffolded dependency and fails CI with \"Cannot find package 'uuid'\". Do NOT emit fitness or client items, and do NOT set `invariant_id` (the fitness analyst owns persistence invariants). COVER THE NEGATIVE/BOUNDARY-VALIDATION PATH a constraint implies on your ACs: you are given architecture.json (NFRs + persistence_invariants), so when an AC's field is required / NOT NULL (a `not_null` invariant or a field-named-validation NFR names it), emit a behavior item that OMITS (or sends invalid) that field through the API boundary and asserts a field-named rejection \u2013 this is the boundary guard, DISTINCT from the DB constraint the fitness analyst tests. A required-field/CHECK/overcommit rejection with only a happy-path test is the recurring reflect-testlist-defect. " + SLICE_CONTRACT
  },
  fitness: {
    kind: "fitness",
    description: "Architectural fitness tests + a real-branch test per declared persistence invariant.",
    configSummary: "Per architectural constraint + per persistence_invariant: a fitness item (invariant_id).",
    model: "sonnet",
    effort: "high",
    toolScope: ["Read"],
    inputs: ["architecture-invariants", "db-design"],
    focusPrompt: "You are the FITNESS test analyst \u2013 the SOLE owner of `invariant_id`. Two duties: (1) Walk the architecture (layers, service_backed, ORM-only, config-in-env, each accepted NFR budget) and emit >=1 `kind:\"fitness\"` item per architectural constraint the story touches: the layering contract (boundary must not import the DB session; persistence only in the repository), the ORM-only contract (ONLY the repository touches the ORM/session \u2013 the service AND boundary contain no ORM imports; this is DISTINCT from the routes-vs-session check), config-from-env, and any service-layer guard an NFR demands (e.g. a write-time rejection of an overcommitting / negative-quantity write at the SERVICE layer \u2013 distinct from a DB CHECK constraint). A CLIENT-render NFR fitness function (SPA rendering of null/optional/empty/loading/error states) is NOT yours \u2013 the CLIENT analyst owns those; emit NO fitness item for a client-render NFR. A COMPOUND defense (an `and`/`+`/comma joining two checkable claims) needs ONE item PER conjunct, never one for the pair. (2) Walk architecture.json `persistence_invariants[]` and emit AT LEAST ONE `kind:\"fitness\"` item per invariant with `invariant_id` set to that invariant's id, verified DIRECTLY against the real branch database (never a mock, never a generic ORM round-trip). COVER EVERY LEG the invariant NAMES: when one invariant names MULTIPLE columns/constraints (e.g. two NOT NULL audit columns `filed_by`+`filed_at`, a multi-column CHECK, or an FK set), cover EACH named leg \u2013 a parametrised sub-case per column/constraint (or a sibling item), all sharing that `invariant_id`. A single item exercising only ONE of the named columns leaves the others uncovered (the reflect gate rejects the un-covered leg). E.g. a NOT-NULL invariant over {filed_by, filed_at} needs a direct INSERT with EACH column NULL asserting its own constraint violation, not just one. ANCHOR BY REALIZING STORY, NOT KEYWORD PROXIMITY: emit an invariant's item ONLY when THIS story realizes that invariant's table \u2013 i.e. db-design.json `schema_changes[]` has an entry for THIS story_id (create_table, else the earliest add_column/alter/constraint) on the invariant's `table` (architecture.json `persistence_invariants[].table`). If the invariant's table is created by a LATER story, DO NOT emit its fitness item on this story \u2013 it belongs to that write story, and its test is un-buildable here (the table does not exist yet). A display/read-only story whose migrations create NO table an invariant names emits NO invariant fitness items, even if its ACs mention a related record (e.g. an AC 'shows the record' does NOT own the record's not-null/FK/reversibility invariants \u2013 the story that MIGRATES the table does). A migration reversibility is ALWAYS one item: reversibility (single-step downgrade/upgrade, @pytest.mark.migration, NEVER downgrade base) asserting the SCHEMA is recreated \u2013 the table + its columns/constraints are present again after downgrade-then-upgrade (NOT that data survives). Data-preservation (seed rows, migrate, assert they survive with expected values) is a SEPARATE item that applies ONLY to an ADDITIVE migration on a PRE-EXISTING table (a later story adding a column/constraint, where single-step downgrade removes only that addition and prior rows persist). NEVER author a data-preservation item for an INITIAL create-table migration: single-step downgrade drops the whole table, so 'rows survive' is UNSATISFIABLE and no code can make it pass (it dead-locks the assess/repair loop). If the story's migration is the table's FIRST (create-table), emit ONLY the schema-recreation reversibility item, not data-preservation. The created_at/audit immutability on an in-place upsert is its OWN item. Whole-table aggregate assertions must scope to the test's own rows (a delta), never an absolute total. Fitness items MUST NOT carry a `.feature` `scenario_file`. Seed idempotently with a per-run-unique key. " + SLICE_CONTRACT + " Set `invariant_id` on each item that covers a declared persistence invariant."
  },
  client: {
    kind: "client",
    description: "SPA client-harness tests for UI-presentation ACs (React component / Playwright e2e).",
    configSummary: "Per UI-presentation AC: a client item under client/tests/ (only when uiTrack).",
    model: "sonnet",
    effort: "default",
    toolScope: ["Read"],
    inputs: ["story-acs", "architecture-invariants", "design-guide"],
    enabledWhen: (ctx) => ctx.uiTrack === true,
    focusPrompt: "You are the CLIENT test analyst (this project HAS a frontend). For every UI-presentation AC the architecture routes to the SPA's own client harness, emit a `kind:\"client\"` item with `scenario_file` under `client/tests/` (e.g. `client/tests/pages/<Screen>.test.tsx`). Do NOT fold a presentation AC into the backend pytest-bdd suite \u2013 that mechanism mismatch is a defect. For an AC that OWNS a page/route, at least one client item MUST exercise the page THROUGH THE REAL `<App>` at the AC's route (a Playwright e2e that navigates the route, OR a component test rendering `<App>` in `<MemoryRouter initialEntries={[\"<the path>\"]}>`) \u2013 a bare `render(<ThePage/>)` does NOT prove the page is routed; name the route in the description. Test the design-guide SEAM (assert the element carries its design-guide class / `data-testid`), NEVER an inline `style=` or raw CSS in the source. Do NOT set `invariant_id`. MATCH THE TEST TO THE AC's `layer`: an AC whose `layer` is **`E2E`** is verified END-TO-END against the REAL paired-branch DB \u2013 it REQUIRES a real Playwright e2e (scenario_file under `client/tests/e2e/\u2026`) that drives the DEPLOYED app in a browser against the live DB, with NO mocked/stubbed fetch and NO in-memory data. A mocked/stubbed COMPONENT test (rendering `<App>`/`<Page>` with fake data) is ONLY for a pure presentation/rendering AC, NEVER for an `E2E`-layer AC \u2013 drafting an E2E-layer AC as a mocked component test is the recurring reflect-testlist-defect (it cannot hit the DB the layer demands). One real e2e per E2E-layer AC. ALSO cover NFR CLIENT-RENDER fitness functions: for every `architecture.json` NFR whose `fitness_function` describes a CLIENT render (e.g. rendering a row with null/optional fields and asserting a 'not tracked' indicator, or an empty/loading/error state), emit a `kind:\"client\"` item that performs that render and asserts the stated outcome. These NFR-render fitness functions are YOURS, never the fitness analyst's (it owns service/DB guards, not the SPA); a stated client-render NFR with no client item is the recurring reflect-testlist-defect. " + SLICE_CONTRACT
  }
};
function enabledAnalysts(ctx) {
  return Object.values(TEST_ANALYST_CATALOGUE).filter((e) => e.enabledWhen ? e.enabledWhen(ctx) : true);
}

// consort/test-list/test-analyst-roster.ts
function renderTestAnalystRoster(ctx, opts = {}) {
  const overrides = opts.overrides ?? {};
  const analysts = enabledAnalysts(ctx).map((e) => {
    const ov = overrides[e.kind] ?? {};
    const model = ov.model ?? e.model;
    const effort = ov.effort ?? e.effort;
    const toolScope = ov.toolScope ?? e.toolScope;
    return {
      kind: e.kind,
      model,
      // ADVISORY levers: the Task tool has no effort/allowedTools parameter, so the supervisor RESTATES
      // these in each spawn prompt and the subagent self-paces/self-limits. model (above) IS enforced
      // (a real Task param). Omitted when neither the entry nor the override sets one.
      ...effort ? { effort } : {},
      ...toolScope ? { tool_scope: toolScope } : {},
      inputs: e.inputs,
      focus_prompt: e.focusPrompt
    };
  });
  if (analysts.length === 0) return "";
  const payload = JSON.stringify({ analysts }, null, 2);
  return `<<TEST-ANALYST ROSTER \u2013 spawn ONE Task subagent (subagent_type general-purpose) per entry below, passing its focus_prompt VERBATIM + the story inputs it declares. You MUST set the Task's model to the entry's "model" EXACTLY \u2013 never substitute your own model choice. When an entry gives "effort" or "tool_scope", you MUST RESTATE them VERBATIM at the top of that spawn's prompt \u2013 "Think at <effort> effort." and "Confine your work to these tools: <tool_scope>." \u2013 since the Task tool takes no effort/tool parameters (the analyst self-paces/self-limits on your instruction); do not paraphrase or omit them. For EACH analyst you spawn, first log a one-line reasoning event naming the analyst + the model/effort/tool_scope you applied (so the levers in effect are auditable). These are the ENABLED analysts for THIS project (a no-frontend project omits "client"). Collect each analyst's returned UNORDERED slice, then RECONCILE (discrepancies / overlaps / omissions), ASSEMBLE + ORDER the feature master, and assign the final feature-flat T-ids \u2013 see your role prompt for the reconciliation contract.>>
\`\`\`json
` + payload + `
\`\`\`
<<END TEST-ANALYST ROSTER>>
`;
}

// consort/orchestrator/build/preconditions.ts
function buildGreenFailureAdvisory(consortDir, featureId, story, ac) {
  const gfAssess = ac ? readGreenFailure(consortDir, featureId, story, ac) : void 0;
  const failureAdvisory = gfAssess?.failureOutput ? `THE VERIFY'S OWN FAILURE OUTPUT (start HERE \u2013 it names the failing test(s) + the root error; do NOT re-run or re-scan the tree to rediscover this). Read the referenced file(s) directly to confirm the cause:
\`\`\`
${gfAssess.failureOutput}
\`\`\`

` : "";
  const contractAdvisory = gfAssess?.contractRefs ? `DETERMINISTIC contract-clean has ALREADY localized the production-code references to the migration-dropped column(s) below \u2013 you do NOT need to re-find them. Record EXACTLY these as a driver-fixable regression via assess-regression --fix (path (b)), AND SEPARATELY flag any prior tests that assert the dropped column as superseded (path (a)) \u2013 a column drop needs BOTH the code fix and the test refactor in the same repair turn:
${gfAssess.contractRefs}

` : "";
  const supersededAdvisory = gfAssess?.supersededTestRefs ? `${gfAssess.supersededTestRefs}

` : "";
  return failureAdvisory + contractAdvisory + supersededAdvisory;
}
var PRECONDITION_PREPARERS = {
  "context-pack": (ctx) => buildContextPack(ctx.consortDir, ctx.featureId, ctx.story, ctx.ac, {
    skipTestLoop: !!(ctx.options && ctx.options.skipTestLoop)
  }),
  "green-failure-advisory": (ctx) => buildGreenFailureAdvisory(ctx.consortDir, ctx.featureId, ctx.story, ctx.ac),
  // The test-analyst roster: project the ENABLED test-analyst catalogue (client gated on the
  // project's uiTrack) into the test-strategist supervisor's turn so it Task-spawns one analyst
  // subagent per enabled kind. Reads project.uiTrack from projectDir; absent => true.
  "test-analyst-roster": (ctx) => {
    const projectDir = ctx.projectDir ?? "";
    const uiTrack = projectDir ? resolveProjectSettings(projectDir).project.uiTrack : true;
    const overrides = ctx.options?.analystOverrides;
    return renderTestAnalystRoster({ projectDir, uiTrack }, overrides ? { overrides } : {});
  }
};
function resolvePreparer(kind) {
  const p = PRECONDITION_PREPARERS[kind];
  if (!p) {
    const known = Object.keys(PRECONDITION_PREPARERS).join(", ");
    throw new Error(`preconditions: unknown preparer kind "${kind}" \u2013 register it in PRECONDITION_PREPARERS (known: ${known}).`);
  }
  return p;
}

// consort/orchestrator/drive/orchestrator-effects.ts
var import_util3 = require("@databricks-solutions/lakebase-scm-utils/util");
var UI_TRACK_PROPOSE = ` UI track is ON: this product has a user-facing UI (a design-brief.md is part of intake), so every user-facing capability must be deliverable end to end as an E2E story, a real browser/screen interaction a user performs, not merely an API. Frame each candidate as a user-facing increment and note which need an E2E (UI) story.`;
var UI_TRACK_BREAKDOWN = ` UI track is ON: decompose into stories that include the E2E (UI) story for each user-facing capability (a screen the user interacts with), not API-only stories.`;
function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function artifactRoot2(consortDir) {
  return consortDir;
}
function uiTrackBuild(root) {
  return ` UI track is ON: the UI must adhere to the project design guide at ${root}/design/design-guide.md (+ the design-guide.json tokens). Build to it.`;
}
var AGENT_TERSE_SUFFIX = ` Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.`;
function storyStubScope(consortDir, featureId, storyId) {
  try {
    const stub = JSON.parse(fs18.readFileSync(storyJson(consortDir, featureId, storyId), "utf8"));
    const parts = [
      stub.asA ? `As a ${stub.asA}` : "",
      stub.iWantTo ? `I want to ${stub.iWantTo}` : "",
      stub.soThat ? `so that ${stub.soThat}` : ""
    ].filter(Boolean);
    return parts.length ? ` The story: ${parts.join(", ")}.` : "";
  } catch {
    return "";
  }
}
var STATE_OWNERSHIP_CANON = ` TEST STATE OWNERSHIP (mandatory): each test OWNS the state it asserts on \u2013 the acceptance DB is a shared branch reused across the story's cycles and already holds rows other stories committed. For any COLLECTION or AGGREGATE assertion (an empty list/table, "returns all", a count), NEVER assume ambient state and NEVER assert absolute whole-table state (e.g. len(all) == 0): SCOPE to per-run-unique keys \u2013 assert only your own seeded rows, or query a per-run-unique slice that is genuinely empty \u2013 or explicitly clear the aggregate you claim empty. Also revert/roll back rows a test writes so it never leaks state into another test.`;
function nextPendingTestDirective(consortDir, featureId, story, loop, cap) {
  return nextPendingTestDirectiveBody(consortDir, featureId, story, loop, cap) + STATE_OWNERSHIP_CANON;
}
function nextPendingTestDirectiveBody(consortDir, featureId, story, loop, cap) {
  if ((loop ?? "story") === "story") {
    let batch = [];
    try {
      batch = nextPendingBatch(consortDir, featureId, story, Number.MAX_SAFE_INTEGER);
    } catch {
      batch = [];
    }
    if (batch.length === 0) {
      return `Write the failing tests (RED) for story ${story}: every test-list item for the story that has no cycle yet.`;
    }
    const list = batch.map((b) => `${b.id} [ac ${b.ac_id}]: "${b.description}"`).join("; ");
    return `Write the failing tests (RED) for the WHOLE story ${story} in this one turn, EXACTLY these ${batch.length} item(s) across all its ACs, in order: ${list}. Write ALL of them now and ONLY these; do NOT add or drop items, the orchestration stamps ONE whole-story batch RED cycle for exactly these ids, and any mismatch is a defect.`;
  }
  if (loop === "hybrid-a") {
    let batch = [];
    try {
      batch = nextPendingBatch(consortDir, featureId, story, cap ?? DEFAULT_BATCH_CAP);
    } catch {
      batch = [];
    }
    if (batch.length === 0) {
      return `Write the next failing tests (RED) for story ${story}: the next un-cycled layer-batch in the test list.`;
    }
    const list = batch.map((b) => `${b.id} [ac ${b.ac_id}]: "${b.description}"`).join("; ");
    return `Write the failing tests (RED) for story ${story}'s next layer-batch, EXACTLY these ${batch.length} item(s), in order: ${list}. Write ALL of them this turn and ONLY these (they share one layer/runner); do NOT skip ahead to another layer, do NOT add or drop items, the orchestration stamps ONE batch RED cycle for exactly these ids, and any mismatch is a defect.`;
  }
  let next;
  try {
    next = storyTestProgress(consortDir, featureId, story).pending[0];
  } catch {
    next = void 0;
  }
  if (!next) {
    return `Write the next failing test (RED) for story ${story}: the next un-cycled item in the test list.`;
  }
  return `Write EXACTLY ONE failing test (RED) for story ${story}: the next test in order, ${next.id} [ac ${next.ac_id}]: "${next.description}". Write ONLY this test. Do NOT skip ahead, do NOT combine tests, do NOT pick a different item, the orchestration stamps the RED cycle for ${next.id}, and a mismatch between the test you write and ${next.id} is a defect.`;
}
function supersededTestsDirective(consortDir, featureId, story) {
  let acId;
  try {
    const prog = storyTestProgress(consortDir, featureId, story);
    acId = (prog.openRed[0] ?? prog.pending[0])?.ac_id;
  } catch {
    acId = void 0;
  }
  if (!acId) return "";
  const sup = readSupersededTests(consortDir, featureId, story, acId);
  if (!sup) return "";
  const list = sup.tests.map((t) => `  - ${t}`).join("\n");
  return `

SUPERSEDED TESTS: this AC (${acId}) supersedes behavior encoded in PRIOR tests the Navigator flagged (${sup.reason}). The latest AC wins. You MAY refactor ONLY these flagged tests to the new behavior (alongside the production code) so the honest-GREEN verify holds:
${list}
Do NOT touch any other test; an UNflagged failing test is a genuine regression that must stay red and escalate.`;
}
function regressionRepairDirective(consortDir, featureId, story) {
  let acId;
  try {
    acId = storyTestProgress(consortDir, featureId, story).openRed[0]?.ac_id;
  } catch {
    acId = void 0;
  }
  if (!acId) return "";
  const gf = readGreenFailure(consortDir, featureId, story, acId);
  if (!gf?.fixDirective) return "";
  return `REPAIR a driver-fixable regression in AC ${acId} (story ${story}). The honest-GREEN verify against the running app FAILED and it was diagnosed (by the Navigator, or deterministically by a gate such as contract-clean) as a genuine regression in the code, NOT a superseded test:
  DIAGNOSIS: ${gf.diagnosis ?? gf.summary}
  FIX: ${gf.fixDirective}
Apply that fix to the PRODUCTION code. Do NOT edit prior tests to force this regression green, fix the code. (EXCEPTION: if a SUPERSEDED TESTS directive follows below, the Navigator flagged those specific prior tests as encoding obsolete behavior, refactor ONLY those alongside this fix \u2013 often the regression is collateral from a superseded test erroring on a shared session, so both must land in this one turn.) Keep the AC's own tests green. This is your ONE repair attempt: if the verify still fails after it, the orchestration escalates to a human with the diagnosis.`;
}
function consumeHandback(action, featureId, consortDir) {
  const story = "story" in action ? action.story : void 0;
  const file = handbackFile(consortDir, featureId, action.role, story);
  if (!fs18.existsSync(file)) return "";
  let note = "";
  try {
    note = fs18.readFileSync(file, "utf8").trim();
    fs18.rmSync(file, { force: true });
  } catch {
    return "";
  }
  return note ? `${note}

` : "";
}
function architectConventionsDirective(consortDir) {
  const conventions = readConventions(consortDir);
  if (!conventions) {
    return ` This is the first feature: the layered layout you declare in architecture.json (the role -> module paths) becomes the PROJECT-WIDE convention every later feature inherits, so choose the canonical layout deliberately.`;
  }
  const layout = conventions.layers.map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`).join(", ");
  return ` REUSE the established project architecture conventions (set by ${conventions.established_by}): ${layout}. Declare the SAME role -> module paths in architecture.json, do NOT remap or rename an established layer; a divergent layout hard-blocks the spec gate and mismatches the inherited code.`;
}
function designRootNote(root, featureId, s) {
  return ` Write every artifact under the ABSOLUTE artifact root ${root} (this feature: ${root}/features/${featureId}/; this story: ${root}/features/${featureId}/stories/${s}/); use that absolute path and never resolve or guess the project root yourself.`;
}
function roleTaskBody(action, featureId, uiTrack, consortDir, build, omit) {
  const root = artifactRoot2(consortDir);
  if ("mode" in action) {
    switch (action.mode) {
      case "propose":
        return `Propose the sprint's candidate features for planning. WRITE the proposal to ${root}/planning/feature-proposals.md \u2013 author it FRESH from ${root}/product-overview.md + ${root}/nfrs.md (do NOT assume one already exists), one candidate feature per section, so the Architect can size them and the Product Owner can commit the backlog.${uiTrack ? UI_TRACK_PROPOSE : ""}`;
      case "estimate":
        return `Estimate each proposed candidate feature with a t-shirt size (XS/S/M/L/XL) and write planning/estimates.json, so the Product Owner can commit a backlog that fits sprint capacity.`;
      case "estimate-committed":
        return `Estimate the sprint's COMMITTED feature(s) with a t-shirt size (XS/S/M/L/XL). Read each committed feature's request at ${root}/features/<F>/feature-request.md, then ADD one entry per committed feature to ${root}/planning/estimates.json keyed by its REAL feature id (e.g. "F1-stock-visibility", not a "FP" candidate id), each {"feature_id":"<F>","size":"<XS|S|M|L|XL>","rationale":"<why>"}. KEEP every existing estimate already in the file (merge, do not overwrite the candidate sizes). This is the size sync-backlog stamps into the per-sprint backlog, so the committed backlog shows real sizing.`;
      case "intake":
        return `Author the project intake for the Product Owner, DRAFTING each artifact FRESH from the human's answers at ${root}/intake/answers.md (the interview responses; if absent or thin, draft only what the stated intent supports \u2013 never invent). WRITE:
  - ${root}/product-overview.md \u2013 who it's for, its purpose, how it grows, what to see after each sprint (H1 + body, no implementation detail).
  - ${root}/nfrs.md \u2013 apply @software-design-principles + @architectural-design-principles: walk architecture layering / performance / scalability / security / observability / operability / resilience; record each as a '## Required' item with a stable R<n> id, plus '## Preferences' and '## Out of bounds'.
  - ${root}/design/design-brief.md (UI track only) \u2013 apply @ui-ux-design-principles: 1-3 reference sites + what to take from each, brand / interaction / accessibility constraints, and a required '## References' section.
Ground the shape in the canon above and the StockFlow worked example under the kit's examples/first-project/stockflow-seed/intake/ (learn the format + level of detail; never copy it verbatim). The human reviews + approves these before the Spec Author proposes the sprint from them.`;
      case "author-requests":
        return `Author the sprint's feature requests as the Product Owner. For EACH committed feature (the folder ids in ${root}/sprints/*/requested.json \u2014 the features the human selected at the backlog gate), WRITE ${root}/features/<F>/feature-request.md: a one-line ask (a '# ' heading) + the rationale + the user-facing outcome, drafted FROM ${root}/product-overview.md + ${root}/nfrs.md and the matching section of ${root}/planning/feature-proposals.md. Draft in the PO's voice; do NOT invent scope beyond what the proposals + intake support. SKIP any feature-request.md that already exists AND conforms (a recorded seed already placed at the gate) \u2014 do not re-author it. Author ONLY the absent ones.`;
      case "breakdown":
        return `Break feature ${featureId} down into its stories. WRITE the breakdown to ${root}: first ${root}/features/${featureId}/feature-spec.json (id, name, status "draft", tdd_mode, and a NON-EMPTY stories[] array of the story ids), then a stub dir per story under ${root}/features/${featureId}/stories/<S>/ (story.md + story.json, id + one-line scope; NO acceptance criteria here). ON EVERY STORY AFTER THE FIRST, its story.json MUST include "independence": { "distinct_from_prior": true, "rationale": "<the distinct behavior this story adds beyond the prior stories>" } \u2013 apply the story-independence test (could you build the earlier story fully and have this one still genuinely unbuilt?); if not, fold or re-scope it. A later story that omits independence hard-blocks its spec gate, so set it now. Then run the breakdown self-check (./scripts/lk consort-response-formatter --role spec-author --feature ${featureId}, NO --story) and fix anything it flags before returning. feature-spec.json is REQUIRED \u2013 a prose list of stories in your reply is NOT the breakdown, and do NOT claim it "already exists".${uiTrack ? UI_TRACK_BREAKDOWN : ""}`;
    }
  }
  if (action.role === "ux-designer") {
    return `Translate the HIL design brief (${root}/design/design-brief.md) into the project design system: write design-guide.md (visual + interaction standards), design-guide.json (the machine-checkable tokens + components), and ia.md (the information architecture: screens, navigation, flows). This is the project-level style guide the Navigator and Driver build the UI against; author it once from the brief + product-overview.md. COVER THE BRIEF EXHAUSTIVELY \u2013 read design-brief.md + product-overview.md and enumerate, then realize, EVERY named element. In particular: (a) EVERY status/state variant the brief lists (e.g. each badge/pill state) \u2013 include ALL of them, not a representative subset; (b) EVERY asset the brief names (app icon, favicon/browser-tab icon, logos) as an explicit entry; (c) EVERY level of each scalar token the brief enumerates (if it says shadows sm/md/lg, define all three; likewise every spacing/radius/type step); and (d) a design-guide.json "components" block with an entry for EACH reusable UI component the brief describes (navbar, page, card, button, form field, table, status badge, empty state, toast, app icon, and any others the brief names), each with its class + notes. Before finishing, re-read the brief and confirm nothing it names is missing from the design-guide \u2013 a missing status state, asset, token level, or component is a defect.`;
  }
  const s = action.story;
  switch (action.role) {
    case "spec-author":
      return `Draft the acceptance criteria for story ${s} and NOTHING else.${storyStubScope(consortDir, featureId, s)} Write ONE file per AC as acs/<AC>.json (+ optional acs/<AC>.md), and put NOTHING else in acs/ (no test lists, no -tests.json / -test-list.json, no scratch files, the spec gate validates every acs/*.json against the AC schema and rejects non-AC files). The AC id MUST match AC<n>-<slug>: AC1-create-form, AC2-form-accepts-input, ... (an "AC" prefix + a number, then a kebab slug). A bare slug id like "create-form-displays" FAILS the schema and hard-blocks the spec gate. The file's "id" field MUST equal its basename (acs/AC1-foo.json has {"id":"AC1-foo"}). Write only under story ${s}'s acs/ directory. Do not create, draft, or modify acceptance criteria for any other story in this feature, each other story is drafted in its own separate step that you are not performing now, and you will be invoked again, once per story, for the rest. Authoring more than ${s} here delays ${s} reaching its spec gate and build, and is rejected at the gate.` + designRootNote(root, featureId, s);
    case "architect-reviewer": {
      const arAcIds = storyAcIds(consortDir, featureId, s);
      const arAcScope = arAcIds.length ? ` Story ${s}'s ACs are: ${arAcIds.join(", ")}.` : "";
      return `Annotate story ${s}'s acceptance criteria + nfrs.md coverage.${arAcScope} For EVERY one of this story's ACs, write a non-empty "architectural_notes" field into its acs/<AC>.json (the layer it lives in + how it realizes the design). This is your distinctive per-AC product; the design gate verifies every AC carries it and the spec-author's "layer" field does NOT count. architectural_notes are per-AC, so annotate this story's ACs even when the feature-level architecture.json already exists from an earlier story. In architecture.json, make an EXPLICIT service_backed call (required): set service_backed:true if the feature persists data (a DB table/migration) or carries business logic, and then you MUST declare boundary, service, and repository layers (plus a "models" PACKAGE app/models/, one module per domain object, NOT a flat app/models.py, when it persists entities); set false ONLY for a trivial static/read-through endpoint. An Infra-layer AC or a migration/schema/storage NFR while service_backed is false hard-blocks the gate. When service_backed:true you MUST also declare architecture.json persistence_invariants[]: the DB-level guarantees the schema enforces (each with id, type one of unique|foreign_key|cascade|not_null|check|transactional|migration_reversible, table, and a one-line brief), covering unique/composite keys, foreign keys + cascade rules, NOT NULL / CHECK constraints, any transactional-atomicity boundary, and migration reversibility. The test-strategist must cover each with a real-branch test; a service_backed feature with no persistence_invariants hard-blocks the gate.${architectConventionsDirective(consortDir)}` + designRootNote(root, featureId, s);
    }
    case "dba": {
      const dbaAcIds = storyAcIds(consortDir, featureId, s);
      const dbaAcScope = dbaAcIds.length ? ` Story ${s}'s ACs are: ${dbaAcIds.join(", ")}.` : "";
      let contract = "";
      try {
        const arch = JSON.parse(fs18.readFileSync(architectureJson(consortDir, featureId), "utf8"));
        if (arch.service_backed === true) {
          const inv = (arch.persistence_invariants ?? []).filter((i) => i && typeof i.id === "string");
          const invList = inv.length ? ` Realize EVERY declared persistence_invariant and list its id in realizes_invariants[]: ${inv.map((i) => `${i.id}${i.type ? ` [${i.type}${i.table ? ` on ${i.table}` : ""}]` : ""}${i.brief ? ` (${i.brief})` : ""}`).join("; ")}.` : "";
          const models = (arch.layers ?? []).find((l) => l.role === "models");
          const modelsNote = models?.module ? ` Mirror the architect's models package (${models.module}), one table per domain object.` : "";
          const nonPersistingNote = inv.length ? "" : ` This service declares NO persistence_invariants (a non-persisting service \u2013 compute/proxy/aggregator); an empty or absent db-design.json is acceptable, do not invent tables.`;
          contract = ` This feature is service_backed.${modelsNote}${invList}${nonPersistingNote}`;
        } else if (arch.service_backed === false) {
          contract = ` This feature is not service_backed (a trivial static/read-through endpoint); an empty or absent db-design.json is acceptable.`;
        }
      } catch {
      }
      return `Realize the physical database schema for story ${s} into ${root}/features/${featureId}/db-design.json (+ a short db-design.md narrative).${dbaAcScope} Read architecture.json (service_backed, layers, persistence_invariants) \u2013 the architect owns that logical contract; you produce the PHYSICAL realization and do NOT re-author the invariants. Declare tables[] (columns with explicit type/nullable/default, primary_key, unique_constraints, foreign_keys, checks, indexes) and this story's schema_changes[] (the per-story migration plan the build lane authors the Alembic migration from; keep an expand/contract column split or drop reversible). Populate realizes_invariants[] as a flat array of the architecture.json persistence_invariant id STRINGS (bare ids, not objects) \u2013 an uncovered invariant hard-blocks the spec gate.${contract}` + designRootNote(root, featureId, s);
    }
    case "test-strategist": {
      const acIds = storyAcIds(consortDir, featureId, s);
      const acScope = acIds.length ? ` The story's ACs are: ${acIds.join(", ")}. Map every test's ac_id to one of these EXACT ids (verbatim, never a bare slug or an invented id), and cover each AC at least once.` : "";
      let dbScope = "";
      try {
        const arch = JSON.parse(fs18.readFileSync(architectureJson(consortDir, featureId), "utf8"));
        if (arch.service_backed === true) {
          const inv = (arch.persistence_invariants ?? []).filter((i) => i && typeof i.id === "string");
          const list = inv.length ? ` The declared persistence invariants are: ${inv.map((i) => `${i.id}${i.brief ? ` (${i.brief})` : ""}`).join("; ")}.` : "";
          dbScope = ` This feature is service-backed. Cover EVERY architecture.json persistence_invariant with >=1 test that sets "invariant_id" to that invariant's id and exercises it DIRECTLY against the branch database (a real DB session, never a mock): verify the MIGRATION actually realized the guarantee (e.g. inserting a duplicate raises an IntegrityError, a NOT NULL/CHECK rejects a bad row, a down-then-up migration round-trips) and that the repository honors it. Do NOT write a test of the ORM's generic add/commit/query round-trip \u2013 that tests the library, not your schema.${list} The DBA's db-design.json (features/${featureId}/db-design.json) has the concrete table/column/constraint definitions realizing these invariants \u2013 read it for precise schema assertions. EVERY test that WRITES to the DB (a create/POST test, a content-type or validation test that sends a real body, a retrieve test that seeds a fixture) MUST own its state: use a per-run-UNIQUE key (a uuid-suffixed sku/location, e.g. f"SKU-{uuid.uuid4().hex[:8]}"), OR delete/upsert the fixed key before the write AND clean up after. A test that writes a FIXED key with no cleanup passes alone + on its own isolated build branch but COLLIDES in the full-suite deploy-verify against the shared feature-branch DB (a duplicate-key error surfacing as a non-JSON/500), halting the feature ship \u2013 the shared-state-write defect. Do NOT assume an empty table or an untouched fixed key.`;
        }
      } catch {
      }
      return `Produce story ${s}'s ordered tests and APPEND them to the feature master test list ${root}/features/${featureId}/test-list.json, keep every item already there for the other stories and add this story's. Do NOT author any test-list-per-story.json (the orchestration generates the per-story + per-AC views from the master).${acScope}${dbScope}`;
    }
    case "navigator":
      if (action.buildMode === "reflect") {
        return `REFLECT on story ${s} BEFORE the build lane: independently critique its spec slice (${root}/features/${featureId}/stories/${s}/story.json + acs/*.json) and its test-list (${root}/features/${featureId}/stories/${s}/test-list-per-story.json) against the architecture (${root}/features/${featureId}/architecture.md/.json) + NFRs.` + contextRubric(consortDir, featureId, s, "") + ` Look ONLY for design-time defects that would waste a build cycle: (1) ACs that contradict each other; (2) an AC with no covering test, or a test that contradicts its AC; (3) an NFR with no fitness test; (4) a test asserting at a layer the architecture forbids; (5) an AC whose declared layer conflicts with the architecture; (6) an untestable/vacuous AC (no observable outcome); (7) a UI-styling test that asserts inline HTML style or raw CSS in the page SOURCE (e.g. a text-align/color/font check inside a style= attr) for a property the design-guide + design-adherence gate govern, instead of the rendered SEAM (the element carries the design-guide class / data-testid): such a test hard-codes the very inline style the design lane then refactors into a token-driven class, so it blocks that refactor (the ui-style-implementation-test smell). Do NOT critique implementation, style, or scope, only buildability + internal consistency of THIS story's artifacts. BE EXHAUSTIVE in this ONE pass: findings[] is multi-valued \u2014 run EVERY check against EVERY AC, test-list item, and NFR, and emit a SEPARATE finding for EACH distinct defect (decompose a multi-part NFR fitness_function into its sub-guarantees and flag every uncovered clause). Do NOT return one finding at a time: the reflect\u2194revise loop is bounded and escalates after a few laps, so a piecemeal reflect burns that budget on repeated revise\u2192re-test\u2192reflect laps and can hand the human a still-defective design. Write your verdict to ${root}/features/${featureId}/stories/${s}/reflect-verdict.json as {"version":1,"passed":<bool>,"findings":[{"owner":"spec-author"|"test-strategist","detail":"<the defect>"}]}. passed:true with findings:[] when the spec + test-list are consistent + buildable (the common case, do NOT invent defects). Attribute each finding to spec-author (an AC/spec defect) or test-strategist (a test-list/coverage defect). Write ONLY that file; the orchestrator routes any fix deterministically.`;
      }
      if (action.buildMode === "assess") {
        const gfAssess = action.ac ? readGreenFailure(consortDir, featureId, s, action.ac) : void 0;
        const advisory = omit?.has("green-failure-advisory") ? "" : buildGreenFailureAdvisory(consortDir, featureId, s, action.ac ?? "");
        const hasSupersededAdvisory = !!gfAssess?.supersededTestRefs;
        const scanDirective = hasSupersededAdvisory ? `(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode, FLAG them so the Driver may permissively refactor ONLY those. The DETERMINISTIC gate has ALREADY pre-localized the COMPLETE superseded set (the SUPERSEDED-TEST CANDIDATES above \u2013 a grep of the migration's dropped symbol across every test, including FITNESS / architecture / migration reversibility tests). TRUST it: flag EXACTLY those file(s) in ONE flag-superseded call and do NOT re-read each candidate to re-verify (that re-verification never converges on a large drop set \u2013 it is the assess-spin failure). Only search beyond the list if you have concrete reason to believe it MISSED a failing test; otherwise flag the list as-is:
` : `Inspect EVERY failing test (the COMPLETE set, not a sample) and decide per test:
(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode (the latest AC wins; e.g. a prior feature's test asserts an outcome this AC deliberately changes), FLAG them so the Driver may permissively refactor ONLY those. Scan COMPREHENSIVELY: when this AC drops, removes, or renames a column / field / table / endpoint, the superseded set is NOT only the tests that NAME it in a query/INSERT/assertion \u2013 it ALSO includes FITNESS / architecture / migration tests that assert a PROPERTY of the now-gone shape (migration reversibility like "after up() then down(), <col> is reconstructed", schema-shape checks like "<col> exists", invariants over the old column). Those are superseded too \u2013 a reversibility/fitness test for an obsoleted column encodes abandoned behavior. Miss one and the verify stays red and escalates, so list ALL of them in ONE flag-superseded call:
`;
        return advisory + `ASSESS a failed honest-GREEN verify for AC ${action.ac} in story ${s}. The Driver made the current test pass, but the full-suite verify against the running app FAILED, some OTHER test(s) now fail.
` + scanDirective + `   ./scripts/lk consort-cycle flag-superseded --feature ${featureId} --story ${s} --ac ${action.ac} --reason "<new AC + what changed>" --test <path_or_nodeid> [--test ...] --tdd-dir ${consortDir}
   The flag-superseded command writes ${(0, import_node_path22.join)(cycleDir(consortDir, featureId, s, action.ac ?? ""), "superseded-tests.json")}. If for any reason the command will not run, FALL BACK to writing THAT EXACT file directly with the Write tool: {"tests":["<path_or_nodeid>", ...],"reason":"<why superseded>"} \u2013 do NOT search the cache / scripts / logs for the mechanism or invent a different filename. The orchestration honors that file too.
(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior; the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a bounded Driver repair turn):
   ./scripts/lk consort-cycle assess-regression --feature ${featureId} --story ${s} --ac ${action.ac} --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"] --tdd-dir ${consortDir}
   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration then escalates carrying your diagnosis).
CRITICAL \u2013 recording the verdict is the ONLY output of this turn. The orchestration reads your verdict from ${(0, import_node_path22.join)(cycleDir(consortDir, featureId, s, action.ac ?? ""), "regression-assessment.json")} (the assess-regression command writes it). Writing green-failure.json or just explaining the fix in prose is NOT the verdict \u2013 without that file a DRIVER-FIXABLE regression wrongly escalates to a human and the sprint halts. Run the ONE command above as a SINGLE line (do not split across lines, do not wrap in bash -c). If for any reason the command will not run, FALL BACK to writing the file directly with the Write tool: {"diagnosis":"<why>","fix":"<what to change>"} at that exact path \u2013 the orchestration honors that too.
Flag ONLY tests the new AC truly supersedes; never flag a test just to make a red go away. For a regression, always record a diagnosis (+ fix when driver-fixable) \u2013 never nothing.`;
      }
      if (action.buildMode === "assess-deploy") {
        const marker = readDeployVerifyAssessMarker(consortDir, featureId, s);
        const failing = marker?.failing_node_ids ?? [];
        return `ASSESS a failed full-feature DEPLOY-VERIFY for story ${s}. The story's own tests are green, but the full-feature verify against the running app FAILED on the tests below. A deterministic classifier RE-RAN each in ISOLATION (a fresh clean DB) and they ALL PASSED alone \u2013 so this is shared-state CONTAMINATION, not broken software: a test that does not OWN its DB state (typically a WHOLE-TABLE AGGREGATE \u2013 a COUNT/SUM integrity probe \u2013 asserting an ABSOLUTE total that holds on the isolated per-cycle branch but breaks once other stories' rows share the table).
Failing tests:
${failing.map((n) => `  ${n}`).join("\n")}

For EACH test, prescribe HOW to make it own its state: scope BOTH the seed AND the assertion to the test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA, NEVER an absolute whole-table total. Do NOT weaken the assertion's intent \u2013 keep the invariant, just scope it.
Write your scope directives to ${root}/features/${featureId}/stories/${s}/deploy-verify-scope.json as {"version":1,"story_id":"${s}","directives":[{"node_id":"<path::test>","directive":"<how to scope it>"}]} \u2013 one entry per test you confirm is contamination-fragile. If (rarely) you judge the classifier wrong and a failure is a GENUINE regression, OMIT it from directives (write no file, or an empty directives array); the orchestration then raises it to a human instead of scoping. Write ONLY that file.`;
      }
      if (action.buildMode === "assess-refactor") {
        const marker = readRefactorVerifyAssessMarker(consortDir, featureId, s);
        return `ASSESS a failed REFACTOR-verify for story ${s}. The story's own tests are green and the requested refactor was applied, but the full suite then FAILED:
${marker?.summary ?? "(see the refactor verify output)"}
` + (marker?.superseded_advisory ? `
Deterministic supersession advisory (prior tests referencing a symbol the refactor removed):
${marker.superseded_advisory}
` : "") + `
Decide, per failing test: is it a PRIOR test this story legitimately SUPERSEDES (it asserts old behavior/fields this story deliberately retired), or a GENUINE regression the refactor introduced?
Flag ONLY the genuinely superseded prior tests via \`./scripts/lk consort-cycle flag-superseded --feature ${featureId} --story ${s} --ac <ac> --test <path::test> [--test ...] --reason "<why superseded>"\` \u2013 the Driver will then permissively refactor ONLY those. That command writes superseded-tests.json in the <ac>'s cycle dir; if it will not run, FALL BACK to writing THAT file directly with the Write tool ({"tests":[...],"reason":"<why>"}) \u2013 do NOT search the cache / scripts / logs for the mechanism or invent a different filename. If instead the refactor broke CURRENT behavior (a real regression), flag NOTHING; the orchestration raises it to a human. Never flag a test just to make a red go away. Do NOT edit product code or tests in this turn.`;
      }
      if (action.buildMode === "review") {
        if ((build?.loop ?? "story") === "story") {
          return `REVIEW the implementation of story ${s} now that ALL its tests are green, the whole story in one pass. Judge the story's diff against the context pack: layer boundaries, naming, cross-cutting concerns, the required NFRs, and (for UI) design-token + IA adherence.` + buildContextPack(consortDir, featureId, s, "", { skipTestLoop: true }) + ` Write ONE verdict for the whole story to ${root}/cycles/${featureId}/${s}/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests.`;
        }
        return `REVIEW the implementation of AC ${action.ac} in story ${s} now that its tests are green. Judge the diff against the context pack: layer boundaries, naming, cross-cutting concerns, the required NFRs, and (for UI) design-token + IA adherence.` + buildContextPack(consortDir, featureId, s, action.ac ?? "", { skipTestLoop: true }) + ` Write your verdict to ${root}/cycles/${featureId}/${s}/${action.ac}/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests.`;
      }
      {
        return `${nextPendingTestDirective(consortDir, featureId, s, build?.loop, build?.cap)}${uiTrack ? uiTrackBuild(root) : ""}` + buildContextPack(consortDir, featureId, s, action.ac ?? "", { skipTestLoop: true });
      }
    case "driver":
      if (action.buildMode === "refactor-deploy") {
        const scope = readDeployVerifyScope(consortDir, featureId, s);
        const directives = scope?.directives ?? [];
        return `SCOPE the contamination-fragile tests the Navigator flagged for story ${s}. Each FAILED the full-feature deploy-verify but PASSES in isolation \u2013 it asserts an ABSOLUTE whole-table aggregate (or otherwise does not own its DB state), which breaks once other stories' rows share the table. Refactor EACH per its directive so it OWNS its state: scope BOTH the seed AND the assertion to the test's own rows (filter by the test's SKUs / a marker column), or assert a DELTA \u2013 NEVER an absolute whole-table total. Keep the invariant; do NOT weaken it, and do NOT change product code.
` + directives.map((d) => `  ${d.node_id}
    -> ${d.directive}`).join("\n") + `
Edit ONLY those test files. The orchestrator re-deploys + re-verifies after your turn.`;
      }
      if (action.buildMode === "refactor-superseded") {
        return `The Navigator flagged prior tests that story ${s}'s refactor SUPERSEDED. Permissively refactor ONLY the flagged superseded tests below so they reflect the retired behavior (update or drop the superseded assertion); do NOT change product code and do NOT weaken any CURRENT (non-superseded) test.
` + supersededTestsDirective(consortDir, featureId, s) + `
Edit ONLY the flagged test files. The orchestrator re-verifies the full suite after your turn.`;
      }
      if (action.buildMode === "repair") {
        return regressionRepairDirective(consortDir, featureId, s) + supersededTestsDirective(consortDir, featureId, s);
      }
      if (action.buildMode === "refactor") {
        const pack = (ac) => omit?.has("context-pack") ? "" : buildContextPack(consortDir, featureId, s, ac);
        if ((build?.loop ?? "story") === "story") {
          return `REFACTOR story ${s} per the Navigator's review (${root}/cycles/${featureId}/${s}/review.json -> refactor_notes), guided by the architecture (${root}/features/${featureId}/architecture.md), the NFRs (${root}/nfrs.md), + design guide (${root}/design/design-guide.md). If review.json has no refactor_notes, this refactor was queued by a BLOCKING build-quality gate (a layering / design-adherence / import-coupling smell in ${root}/smells.json): run that gate to see the violation (e.g. \`consort-layering-clean --project-dir .\`) and fix exactly what it flags \u2013 typically extract the duplicated/misplaced code into one shared helper in its correct layer. Keep ALL the story's tests green and do not change what the outer-boundary tests check, refactor only.` + pack("");
        }
        return `REFACTOR AC ${action.ac} in story ${s} per the Navigator's review (${root}/cycles/${featureId}/${s}/${action.ac}/review.json -> refactor_notes), guided by the architecture (${root}/features/${featureId}/architecture.md), the NFRs (${root}/nfrs.md), + design guide (${root}/design/design-guide.md). If review.json has no refactor_notes, this refactor was queued by a BLOCKING build-quality gate (a layering / design-adherence / import-coupling smell in ${root}/smells.json): run that gate to see the violation (e.g. \`consort-layering-clean --project-dir .\`) and fix exactly what it flags \u2013 typically extract the duplicated/misplaced code into one shared helper in its correct layer. Keep ALL tests green and do not change what the outer-boundary tests check, refactor only.` + pack(action.ac ?? "");
      }
      {
        return ((build?.loop ?? "story") === "story" ? `Make ALL of story ${s}'s failing tests GREEN in one pass (simplest honest code); implement until every one of the story's tests passes, then run the story's tests once.` : build?.loop === "hybrid-a" ? `Make the failing tests for story ${s}'s current layer-batch ALL GREEN in one pass (simplest honest code); implement until every test in the open batch passes, then run that layer's runner once.` : `Make the failing test for story ${s} GREEN (simplest honest code).`) + (uiTrack ? uiTrackBuild(root) : "") + // ctx-test ON by default for GREEN: inject the failing RED test body so the Driver does not
        // Read/cat-discover it. Promoted from the driver-green tuning study (opus + medium effort +
        // ctx-test was the faster-while-holding winner; other context levers were latency-neutral/harmful
        // on opus, so ONLY failing-test is baked in). See consort/optimize/DRIVER-GREEN-LEVERS.md.
        buildContextPack(consortDir, featureId, s, action.ac ?? "", { failingTest: true }) + supersededTestsDirective(consortDir, featureId, s);
      }
    default:
      return `Work story ${s}.`;
  }
}
var PIPELINE_BIN = "consort-pipeline";
var EXPERIMENT_BIN = "consort-experiment";
var CYCLE_BIN = "consort-cycle";
var HUMAN_PROXY_BIN = "consort-human-proxy";
var LOG_BIN = "consort-log";
var TEST_LIST_BIN = "consort-test-list";
var DEPLOY_BIN = "consort-deploy";
var GATE_CONFORMANCE_BIN = "consort-gate-conformance";
var CANON_NOTES_BIN = "consort-canon-notes";
var SCM_PREPARE_PR_BIN = "lakebase-scm-prepare-pr";
var SCM_WAIT_CI_BIN = "lakebase-scm-wait-ci";
var SCM_MERGE_BIN = "lakebase-scm-merge";
var EXPERIMENT_SLUG = "exp1";
var experimentBranchName = (storyId) => (0, import_util3.sanitizeBranchName)(`experiment/${storyId}-${EXPERIMENT_SLUG}`);
function designArtifactExpectation(action, consortDir, featureId) {
  if ("mode" in action) {
    if (action.role === "spec-author" && action.mode === "propose") return { anyOf: [featureProposalsMd(consortDir)], label: "planning/feature-proposals.md" };
    if (action.role === "architect-reviewer" && (action.mode === "estimate" || action.mode === "estimate-committed")) return { anyOf: [planningEstimatesJson(consortDir)], label: "planning/estimates.json" };
    if (action.role === "spec-author" && action.mode === "breakdown") return { anyOf: [featureSpecJson(consortDir, featureId)], label: "feature-spec.json" };
    return null;
  }
  if (action.role === "ux-designer") return { anyOf: [designGuideJson(consortDir)], label: "design/design-guide.json" };
  const s = action.story;
  if (!s) return null;
  if (action.role === "spec-author") return { anyOf: [acsDir(consortDir, featureId, s)], label: `stories/${s}/acs/*.json` };
  if (action.role === "architect-reviewer") return { anyOf: [architectureJson(consortDir, featureId)], label: "architecture.json" };
  if (action.role === "test-strategist") return { anyOf: [featureTestListJson(consortDir, featureId)], label: "test-list.json" };
  return null;
}
function buildTaskBody(action, cfg, omit) {
  const override = cfg.instructionsOverride?.(action);
  if (override !== void 0) return override;
  const storyLoop = "story" in action ? effectiveLoopForStory(cfg.loopGranularity ?? "story", action.story) : cfg.loopGranularity;
  return roleTaskBody(action, cfg.featureId, cfg.uiTrack ?? true, cfg.consortDir, { loop: storyLoop, cap: cfg.batchCap }, omit);
}
function buildClaudeCommandWithBody(action, cfg, body) {
  const f = cfg.featureId;
  const BUILD_ROLES = /* @__PURE__ */ new Set(["navigator", "driver"]);
  const buildScope = cfg.buildSessionScope ?? "story";
  let resumeKey;
  if (BUILD_ROLES.has(action.role)) {
    if (buildScope === "story" && "story" in action && action.story) {
      resumeKey = `${action.role}:${action.story}`;
    }
  } else {
    resumeKey = action.role;
  }
  const turnKey = turnKeyForAction(action);
  const buildTurn = turnKey;
  const isReviewTurn = action.role === "navigator" && turnKey === "review";
  const effort = cfg.effortForTurn ? cfg.effortForTurn(action.role, turnKey) : isReviewTurn ? cfg.reviewEffort ?? "low" : "";
  const fallbackModel = cfg.fallbackModelForRole?.(action.role);
  const maxBudgetUsd = cfg.maxBudgetUsdForRole?.(action.role);
  const mcpConfig = cfg.mcpConfigForRole?.(action.role);
  return {
    kind: "claude",
    role: action.role,
    model: cfg.modelForTurn ? cfg.modelForTurn(action.role, buildTurn) : cfg.modelForRole(action.role),
    ...resumeKey !== void 0 ? { resumeKey } : {},
    ...effort && effort !== "default" ? { effort } : {},
    ...fallbackModel ? { fallbackModel } : {},
    ...typeof maxBudgetUsd === "number" ? { maxBudgetUsd } : {},
    ...mcpConfig ? { mcpConfig } : {},
    // Optimize harness content/scope levers (all default-off): extra context
    // is injected BEFORE the terse suffix (reads as context), the task suffix
    // AFTER it (reads as a trailing directive), and the tool scope is carried
    // on the command for the runner to translate to spawn flags. When the cfg
    // sets none, this is byte-identical to `body + AGENT_TERSE_SUFFIX`.
    ...(() => {
      const allowed = cfg.allowedToolsForRole?.(action.role);
      const disallowed = cfg.disallowedToolsForRole?.(action.role);
      return {
        ...allowed && allowed.length ? { allowedTools: allowed } : {},
        ...disallowed && disallowed.length ? { disallowedTools: disallowed } : {}
      };
    })(),
    // The ENVELOPE: the handback prefix (informed-retry feedback, consumed here so a
    // prepend precondition the executor re-adds to `body` still lands AFTER it – the legacy
    // order) + the given task body + the context/terse/task suffixes. On the legacy path
    // `body` is the full inline task (buildTaskBody with omit=∅); on the A-full executor path
    // `body` is the executor-assembled prompt (declared preconditions re-injected in position).
    task: consumeHandback(action, f, cfg.consortDir) + body + (cfg.contextPackSuffix?.(action.role, buildTurn) ?? "") + AGENT_TERSE_SUFFIX + (cfg.taskSuffix?.(action.role, buildTurn) ?? ""),
    replay: {
      mode: "mode" in action ? action.mode : void 0,
      // The build turn's mode (reflect / review / refactor / assess / repair),
      // distinct from the design-lane `mode` above. The replay path needs it to
      // recognise the reflect turn (whose recorded output is a .consort design
      // artifact the code-only build restore filters out).
      buildMode: "buildMode" in action ? action.buildMode : void 0,
      story: "story" in action ? action.story : void 0
    }
  };
}
function buildClaudeCommand(action, cfg) {
  return buildClaudeCommandWithBody(action, cfg, buildTaskBody(action, cfg));
}
function buildCycleCommand(action, cfg) {
  const f = cfg.featureId;
  const storyLoop = "story" in action ? effectiveLoopForStory(cfg.loopGranularity ?? "story", action.story) : cfg.loopGranularity;
  if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "reflect") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["reflect-gate", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess") {
    const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
    return { kind: "cli", bin: CYCLE_BIN, args: ["assess-green", "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess-deploy") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["assess-deploy-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess-refactor") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["assess-refactor-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "navigator") {
    const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
    const verb = "buildMode" in action && action.buildMode === "review" ? "review" : "begin";
    const loop = storyLoop ?? "story";
    const loopFlag = loop === "story" ? ["--loop", "story"] : verb === "begin" && loop === "hybrid-a" ? ["--loop", "hybrid-a", ...cfg.batchCap ? ["--batch-cap", String(cfg.batchCap)] : []] : [];
    return { kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.consortDir, ...loopFlag] };
  }
  if (!("mode" in action) && action.role === "driver" && "buildMode" in action && action.buildMode === "refactor-deploy") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["refactor-deploy-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "driver" && "buildMode" in action && action.buildMode === "refactor-superseded") {
    return { kind: "cli", bin: CYCLE_BIN, args: ["refactor-superseded-verify", "--feature", f, "--story", action.story, "--tdd-dir", cfg.consortDir] };
  } else if (!("mode" in action) && action.role === "driver") {
    const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
    const isRepair = "buildMode" in action && action.buildMode === "repair";
    const verb = "buildMode" in action && action.buildMode === "refactor" ? "refactor" : "green";
    const repairFlag = isRepair ? ["--repair"] : [];
    const loopFlag = verb === "refactor" && (storyLoop ?? "story") === "story" ? ["--loop", "story"] : [];
    return { kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.consortDir, ...repairFlag, ...loopFlag] };
  }
  return void 0;
}
function commandsForActionResolved(action, cfg) {
  return (cfg.useManifestSteps ? commandsFromManifest(action, cfg) : void 0) ?? commandsForAction(action, cfg);
}
function commandsFromManifest(action, cfg) {
  if (action.kind !== "invoke-role") return void 0;
  const manifest = manifestForAction(action);
  if (!manifest) return void 0;
  const f = cfg.featureId;
  const tdd = ["--feature", f, "--tdd-dir", cfg.consortDir];
  const BIN_TOKENS = {
    PIPELINE_BIN,
    CYCLE_BIN,
    HUMAN_PROXY_BIN,
    LOG_BIN,
    TEST_LIST_BIN
  };
  const resolveBin = (token) => BIN_TOKENS[token] ?? token;
  const story = "story" in action && typeof action.story === "string" ? action.story : void 0;
  const expandArgs = (args) => args.flatMap((a) => {
    if (a === "--tdd") return tdd;
    if (a === "{feature}") return [f];
    if (a === "{tddDir}") return [cfg.consortDir];
    if (a === "{story}") return story ? [story] : [];
    return [a];
  });
  const CYCLE_MARKER = "@build-cycle";
  const toCmd = (p) => p.bin === CYCLE_MARKER ? buildCycleCommand(action, cfg) : { kind: "cli", bin: resolveBin(p.bin), args: expandArgs(p.args) };
  const before = (manifest.postTurn ?? []).filter((p) => p.when === "before").map(toCmd).filter((c) => c !== void 0);
  const after = (manifest.postTurn ?? []).filter((p) => p.when === "after").map(toCmd).filter((c) => c !== void 0);
  const cmds = [...before, buildClaudeCommand(action, cfg)];
  const expectArtifact = designArtifactExpectation(action, cfg.consortDir, f);
  if (expectArtifact) {
    cmds.push({ kind: "verify-artifact", role: action.role, anyOf: expectArtifact.anyOf, label: expectArtifact.label });
  }
  cmds.push(...after);
  if (f && !isPlanningMode(action)) cmds.push({ kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] });
  return cmds;
}
function commandsForAction(action, cfg) {
  const f = cfg.featureId;
  const tdd = ["--feature", f, "--tdd-dir", cfg.consortDir];
  const approver = cfg.approver ?? "human-proxy";
  const deployTarget = cfg.deployTarget ?? "local";
  switch (action.kind) {
    case "invoke-role": {
      if (cfg.recordedRequests && !cfg.livePropose && "mode" in action && action.role === "spec-author" && action.mode === "propose") {
        return [
          {
            kind: "cli",
            bin: HUMAN_PROXY_BIN,
            args: ["supply-proposals", "--tdd-dir", cfg.consortDir, ...cfg.uiTrack ? ["--ui"] : []]
          }
        ];
      }
      const claude = buildClaudeCommand(action, cfg);
      const cmds = [claude];
      const expectArtifact = designArtifactExpectation(action, cfg.consortDir, f);
      if (expectArtifact) {
        cmds.push({ kind: "verify-artifact", role: action.role, anyOf: expectArtifact.anyOf, label: expectArtifact.label });
      }
      if ("mode" in action && action.role === "spec-author" && action.mode === "breakdown") {
        cmds.unshift({ kind: "cli", bin: PIPELINE_BIN, args: ["reset-breakdown", ...tdd] });
        cmds.push({ kind: "cli", bin: PIPELINE_BIN, args: ["sync-breakdown", ...tdd] });
      }
      if (!("mode" in action) && action.role === "test-strategist") {
        cmds.push({ kind: "cli", bin: TEST_LIST_BIN, args: [cfg.consortDir, f, action.story] });
      }
      const cycleCmd = buildCycleCommand(action, cfg);
      if (cycleCmd) cmds.push(cycleCmd);
      if ("mode" in action && action.mode === "estimate-committed" && cfg.sprintName) {
        cmds.push({ kind: "sync-backlog", sprint: cfg.sprintName });
      }
      if ("mode" in action && action.mode === "author-requests" && cfg.sprintName) {
        cmds.push({ kind: "sync-backlog", sprint: cfg.sprintName });
      }
      if (f && !isPlanningMode(action)) cmds.push({ kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] });
      return cmds;
    }
    case "deploy-verify-heal": {
      const consortDir = cfg.consortDir;
      const featureId = f;
      const root = artifactRoot2(consortDir);
      const marker = readDeployVerifyAssessMarker(consortDir, featureId);
      const claude = {
        kind: "claude",
        role: action.role,
        model: cfg.modelForRole(action.role),
        ...cfg.fallbackModelForRole?.(action.role) ? { fallbackModel: cfg.fallbackModelForRole(action.role) } : {},
        task: (action.mode === "assess-deploy" ? `ASSESS a failed full-feature DEPLOY-VERIFY for the FEATURE SHIP of ${featureId} (all stories are accepted; this is the merged-increment verify against the running app, no single story). A deterministic classifier RE-RAN each failing test in ISOLATION (a fresh clean DB) and they ALL PASSED alone \u2013 shared-state CONTAMINATION, not broken software: a test that does not OWN its DB state (it writes a fixed-key row with no cleanup, or asserts an absolute whole-table total) and so collides with sibling tests' rows on the shared feature-branch DB.
Failing tests:
${(marker?.failing_node_ids ?? []).map((n) => `  ${n}`).join("\n")}

For EACH test, prescribe HOW to make it own its state: use a per-run-unique key (a uuid-suffixed sku/location), or delete/upsert the fixed key before the write AND clean up after, or scope a whole-table aggregate to the test's own rows / a delta \u2013 NEVER an absolute total. Keep the assertion's intent; just make it self-owning.
Write your scope directives to ${root}/features/${featureId}/deploy-verify-scope.json as {"version":1,"directives":[{"node_id":"<path::test>","directive":"<how to scope it>"}]} \u2013 one entry per test you confirm is contamination-fragile. If (rarely) you judge a failure a GENUINE regression, OMIT it (write no file, or an empty directives array); the orchestration then raises it to a human. Write ONLY that file.` : `SCOPE the contamination-fragile tests the Navigator flagged for the FEATURE SHIP of ${featureId}. Refactor EXACTLY these test files to own their DB state, per the directives \u2013 do NOT touch product code, do NOT weaken the assertions' intent:
` + (readDeployVerifyScope(consortDir, featureId)?.directives ?? []).map((d) => `  ${d.node_id}
    -> ${d.directive}`).join("\n") + `
Edit ONLY those test files. The orchestrator re-deploys + re-verifies the whole feature after your turn.`) + AGENT_TERSE_SUFFIX,
        replay: { buildMode: action.mode }
      };
      const finalizeVerb = action.mode === "assess-deploy" ? "assess-deploy-verify" : "refactor-deploy-verify";
      return [
        claude,
        { kind: "cli", bin: CYCLE_BIN, args: [finalizeVerb, "--feature", f, "--tdd-dir", cfg.consortDir] },
        { kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] }
      ];
    }
    case "project-architect-notes":
      return [
        { kind: "cli", bin: CANON_NOTES_BIN, args: ["--story", action.story, ...tdd] },
        { kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] }
      ];
    case "surface-gate":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["surface", "--story", action.story, ...tdd] }];
    case "approve-gate":
      return [
        { kind: "cli", bin: PIPELINE_BIN, args: ["approve-gate", "--story", action.story, "--approver", approver, ...tdd] }
      ];
    case "dispatch":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["dispatch", ...tdd] }];
    case "cut-experiment":
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "cut",
            "--feature",
            f,
            "--story",
            action.story,
            "--slug",
            EXPERIMENT_SLUG,
            "--branch",
            experimentBranchName(action.story),
            "--parent",
            cfg.featureBranch ?? "",
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.consortDir,
            // A re-cut after a discarded experiment re-forks the stale paired branch
            // clean (Finding 27); a first cut omits it (nothing to reset).
            ...action.resetStaleBranch ? ["--reset-stale-branch"] : []
          ]
        }
      ];
    case "await-acceptance": {
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "cli",
          bin: DEPLOY_BIN,
          args: [
            "--target",
            deployTarget,
            "--feature",
            f,
            "--story",
            action.story,
            "--lakebase-branch",
            experimentBranchName(action.story),
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.consortDir,
            "--gate"
          ]
        },
        { kind: "cli", bin: PIPELINE_BIN, args: ["await-acceptance", "--story", action.story, ...tdd] }
      ];
    }
    case "accept":
      return [
        {
          kind: "cli",
          bin: PIPELINE_BIN,
          args: [
            "accept",
            "--story",
            action.story,
            "--approver",
            approver,
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            ...tdd
          ]
        }
      ];
    case "complete":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["complete", ...tdd] }];
    case "approve-intake-gate":
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "intake", "--approver", approver, "--tdd-dir", cfg.consortDir]
        }
      ];
    case "approve-backlog-gate":
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "backlog", "--approver", approver, "--tdd-dir", cfg.consortDir]
        },
        { kind: "sync-backlog", sprint: cfg.sprintName ?? "sprint" }
      ];
    case "approve-plan-gate":
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "plan", "--approver", approver, "--tdd-dir", cfg.consortDir]
        }
      ];
    case "planning-complete":
      return [{ kind: "set-phase", phase: "discovery" }];
    case "feature-complete":
      return [
        { kind: "cli", bin: GATE_CONFORMANCE_BIN, args: ["--feature", f, "--tdd-dir", cfg.consortDir] },
        { kind: "set-phase", phase: "deploy" }
      ];
    case "deploy":
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "cli",
          bin: DEPLOY_BIN,
          args: [
            "--target",
            deployTarget,
            "--feature",
            f,
            ...cfg.featureBranch ? ["--lakebase-branch", cfg.featureBranch] : [],
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.consortDir,
            "--gate"
          ]
        }
      ];
    case "approve-deploy-gate":
      return [
        { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["--feature", f, "--gate", "deploy", "--approver", approver, "--tdd-dir", cfg.consortDir] }
      ];
    case "deploy-complete":
      return [{ kind: "set-phase", phase: "promote" }];
    case "prepare-pr":
      return [{ kind: "cli", bin: SCM_PREPARE_PR_BIN, args: ["--project-dir", cfg.projectDir, "--force"] }];
    case "wait-ci":
      return [{ kind: "cli", bin: SCM_WAIT_CI_BIN, args: ["--project-dir", cfg.projectDir] }];
    case "approve-promote-gate": {
      const promoteRef = cfg.featureBranch ?? f;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--feature", f, "--gate", "promote", "--approver", approver, "--tdd-dir", cfg.consortDir, "--promote-ref", promoteRef]
        }
      ];
    }
    case "merge":
      return [
        {
          kind: "cli",
          bin: SCM_MERGE_BIN,
          args: [
            "--project-dir",
            cfg.projectDir,
            "--wait-migrate",
            "--migrate-timeout-nonfatal",
            "--migrate-timeout-sec",
            "600"
          ]
        }
      ];
    case "done":
      return [
        // Force the checkout: at `done` the feature has merged and its code is
        // committed, but the per-run .tdd/.lakebase metadata (workflow-state.json,
        // selection-log.md) is dirty + tracked, so a plain `git checkout` aborts
        // ("local changes would be overwritten"). That churn is disposable here
        // (the feature is shipped), and landing on the parent is the whole point,
        // so -f discards it and switches. Mirrors the fork-guard ignoring the same
        // metadata. (scm-merge attempts this switch too but non-fatally; this is
        // the deterministic guarantee.)
        ...cfg.parentBranch ? [
          { kind: "cli", bin: "git", args: ["checkout", "-f", cfg.parentBranch] },
          // Delete the merged local feature branch so the process never leaves
          // us on (or able to fall back to) a branch that should have been
          // removed. Guarded to the feature branch, and only when it differs
          // from the parent we just landed on (never delete the tier we are on).
          // `-D` (force) because the branch merged via PR squash/merge-commit is
          // not a literal ancestor of the local parent tip, so `-d` would refuse
          // it as "not fully merged" even though it IS shipped. scm-merge already
          // removed the REMOTE + Lakebase branches; this completes the local side.
          // Best-effort via a shell guard: a missing/absent branch must not fail
          // the terminal step (idempotent on a resume where it is already gone).
          ...cfg.featureBranch && cfg.featureBranch !== cfg.parentBranch ? [
            {
              kind: "cli",
              bin: "sh",
              args: [
                "-c",
                `git branch -D ${shellQuote(cfg.featureBranch)} 2>/dev/null || true`
              ]
            }
          ] : []
        ] : [],
        { kind: "set-phase", phase: "shipped" }
      ];
    case "revise-route": {
      const smellName = action.source.startsWith("smell:") ? action.source.slice("smell:".length) : action.source;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: [
            "decide-escalation",
            "--feature",
            f,
            "--story",
            action.story,
            "--smell",
            smellName,
            "--routed-to",
            action.role,
            "--gate",
            action.gate,
            "--reason",
            action.reason,
            "--approver",
            approver,
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.consortDir
          ]
        }
      ];
    }
    case "raise-to-hil":
      return [];
    case "design-complete":
      return [];
  }
}
async function planNextAction(cfg, transition = nextTransition) {
  const state = await buildDriveEffects(cfg).readState();
  const action = transition(state);
  const commands = commandsForActionResolved(action, cfg);
  return { action, commands };
}
function readDriveStateFromDisk(consortDir, featureId, projectDir, opts = {}) {
  const pipeline = readPipeline(consortDir, featureId);
  const probe = diskArtifactProbe(consortDir, featureId, pipeline.build_active);
  const ctx = readDriveContext(consortDir, featureId, projectDir);
  const state = deriveDriveState(pipeline, probe, ctx);
  state.uiTrack = opts.uiTrack ?? true;
  state.designGuideReady = designGuideConformance(consortDir).ok;
  return state;
}
var POST_TURN_BIN_TOKENS = { PIPELINE_BIN, CYCLE_BIN, HUMAN_PROXY_BIN, LOG_BIN, TEST_LIST_BIN };
function buildDriveEffects(cfg) {
  return {
    async readState() {
      return readDriveStateFromDisk(cfg.consortDir, cfg.featureId, cfg.projectDir, { uiTrack: cfg.uiTrack });
    },
    async perform(action) {
      assertNotStrandedAgentTurn(action);
      const cmds = commandsForActionResolved(action, cfg);
      for (const cmd of cmds) {
        await cfg.runner.run(cmd);
      }
    },
    // Stage 2 (#578) executor dispatch: for the small allowlist of migrated agent turns (currently
    // spec-author breakdown) under useManifestSteps, run the turn THROUGH the StepExecutor and hand
    // runDriver the BoundedRoute it produced. Returns undefined otherwise => the loop falls to perform.
    performViaExecutor(action, state, routerDeps) {
      return performTurnViaExecutor(action, state, routerDeps, cfg, {
        buildCycleCommand,
        buildClaudeCommandWithBody,
        buildTaskBody,
        preparerFor: resolvePreparer,
        readDriveStateFromDisk,
        binTokens: POST_TURN_BIN_TOKENS,
        logBin: LOG_BIN
      });
    },
    // Pre-dispatch route-contract check (route→event→consumer): resolve the routed action's manifest
    // and assert its REQUIRED process events exist before dispatch, so a mis-fired route fails loud
    // naming the route (RouteContractError) instead of the executor's later bare "missing input". Only
    // active under useManifestSteps (same gate as the executor path); a non-agent action or a turn
    // requiring no event is a no-op. The manifest's requiresEvents is the single contract source.
    ...cfg.useManifestSteps ? {
      assertRouteSatisfiable(action) {
        const manifest = manifestForAction(action);
        if (!manifest || !manifest.requiresEvents?.length) return;
        assertRouteSatisfiable(
          action,
          { requiresEvents: () => manifest.requiresEvents ?? [] },
          { consortDir: cfg.consortDir, featureId: cfg.featureId }
        );
      }
    } : {},
    onAction: cfg.onAction,
    onRoutingDecision: cfg.onRoutingDecision,
    // Hand-back delivery: when a role's prior turn failed its expectation
    // contract, write the violation detail where THAT role's next prompt will
    // consume it (consumeHandback in roleTask), so the retry is informed.
    onHandback(handoff, detail) {
      const file = handbackFile(cfg.consortDir, cfg.featureId, handoff.responder, handoff.story);
      try {
        fs18.mkdirSync((0, import_node_path22.dirname)(file), { recursive: true });
        fs18.writeFileSync(file, `${detail}
`, "utf8");
      } catch {
      }
    }
  };
}

// consort/orchestrator/status/next.ts
function resumeCommand(ctx) {
  return ctx.sprint && !ctx.featureId ? { bin: "consort-drive", args: ["--sprint", ctx.sprint] } : { bin: "consort-drive", args: ["--feature", ctx.featureId ?? "<feature-id>"] };
}
function holdOption() {
  return {
    id: "hold",
    title: "Stop here (checkpoint)",
    hil_prompt: "Checkpoint and resume later?",
    kind: "noop",
    enact: null
  };
}
function storyOf4(action) {
  return "story" in action ? action.story : void 0;
}
function buildNextOptions(action, ctx) {
  const f = ctx.featureId ?? "<feature-id>";
  const you = ctx.approver ?? "<you>";
  const gateEnact = gateEnactCommand(action, {
    featureId: ctx.featureId,
    sprint: ctx.sprint,
    approver: ctx.approver,
    featureBranch: ctx.featureBranch
  });
  switch (action.kind) {
    case "accept": {
      const story = storyOf4(action) ?? "<story>";
      return [
        {
          id: "acceptance.accept",
          title: `Accept story ${story}`,
          hil_prompt: `Accept story ${story}? I will merge its experiment into the feature branch, run its migrations, and tear the experiment down. First OFFER the human to SEE it working: the story's experiment branch is checked out + deployed, so \`./scripts/run-dev.sh\` serves the real app on its paired Lakebase branch \u2013 for a UI product point them at the client URL to click through this story; for a backend/service, give them the endpoint(s) + a curl/Postman example that exercises this story's ACs. Only then take the accept/discard/revise decision.`,
          kind: "gate",
          enact: gateEnact,
          // consort-pipeline accept ... (owns the merge)
          note: "Before deciding, offer a working-software review \u2013 run `./scripts/run-dev.sh` (serves the checked-out experiment branch against its Lakebase branch) and hand the human the client URL (UI) or the API endpoint + a curl/Postman example for this story's ACs; stop the server when they're done. Also offer to GENERATE SEED DATA so it isn't an empty app: run-dev.sh auto-runs `scripts/seed_dev.py` on start (SEED=0 skips; idempotent); if none exists, generate one that inserts representative rows for this story's tables."
        },
        {
          id: "acceptance.discard",
          title: `Discard story ${story}`,
          hil_prompt: `Discard story ${story}? Its experiment is torn down and it leaves the sprint; its code is NOT merged.`,
          kind: "action",
          enact: { bin: "consort-pipeline", args: ["discard", "--feature", f, "--story", story, "--approver", you, "--reason", "<reason>"] }
        },
        {
          id: "acceptance.revise",
          title: `Revise story ${story}`,
          hil_prompt: `Send story ${story} back to designing? Its experiment is torn down and it re-enters the design lane; its code is NOT merged.`,
          kind: "action",
          enact: { bin: "consort-pipeline", args: ["revise", "--feature", f, "--story", story, "--approver", you, "--reason", "<reason>"] }
        },
        holdOption()
      ];
    }
    case "approve-intake-gate":
      return [
        {
          id: "intake.approve",
          title: "Approve the project intake",
          hil_prompt: "The Product Owner drafted product-overview.md / nfrs.md / design-brief.md from your answers. REVIEW them (open + read), EDIT anything that's off, or ask for changes (edit .consort/intake/answers.md and re-run to redraft). Approve to hand the intake to the Spec Author, who proposes the sprint from it?",
          kind: "gate",
          enact: gateEnact,
          note: "To request changes instead of approving: edit the drafted docs directly, or edit .consort/intake/answers.md and resume so the PO redrafts. Approve only once they reflect your intent."
        },
        holdOption()
      ];
    case "approve-backlog-gate":
      return [
        {
          id: "backlog.commit",
          title: "Commit the sprint backlog",
          hil_prompt: "Which proposed features are in this sprint? Commit them (by folder id) to lock the backlog; the drive then dispatches the Product Owner to author each request and advances to the plan gate.",
          kind: "gate",
          enact: { bin: "consort-sync-backlog", args: ["--sprint", ctx.sprint ?? "<sprint>", "--features", "<id[,id...]>"] },
          note: "Pick the features from .consort/planning/feature-proposals.md and pass their FOLDER ids (e.g. F1-stock-visibility,F2-stock-adjustment) \u2013 NOT the proposal's `## F1` heading labels. A pure UI/shell story is not a feature; commit only the features this sprint delivers."
        },
        holdOption()
      ];
    case "approve-plan-gate":
      return [
        {
          id: "plan.approve",
          title: "Approve the sprint plan",
          hil_prompt: "Approve the sprint plan and lock the backlog so execution can begin?",
          kind: "gate",
          enact: gateEnact
        },
        holdOption()
      ];
    case "approve-gate":
      return [
        {
          id: "spec.approve",
          title: `Approve story ${storyOf4(action) ?? "<story>"}'s spec`,
          hil_prompt: `Approve story ${storyOf4(action) ?? "<story>"}'s spec so its build can start? (To send it back, edit the spec and re-run the design lane.)`,
          kind: "gate",
          enact: gateEnact
        },
        holdOption()
      ];
    case "approve-deploy-gate":
      return [
        {
          id: "deploy.approve",
          title: "Approve the deploy gate",
          hil_prompt: "The feature deployed + verified locally. Approve the deploy gate to enter promotion?",
          kind: "gate",
          enact: gateEnact
        },
        holdOption()
      ];
    case "approve-promote-gate":
      return [
        {
          id: "promote.approve",
          title: "Approve the promote gate",
          hil_prompt: "CI is green on the promotion PR. Approve it so the feature can merge up to the parent tier?",
          kind: "gate",
          enact: gateEnact,
          outward_facing: true
        },
        holdOption()
      ];
    case "raise-to-hil":
      return [
        {
          id: "resume",
          title: "Resume the drive (after resolving the blocker below)",
          hil_prompt: "Once the blocker under `blockers` is resolved, resume the drive?",
          kind: "action",
          enact: resumeCommand(ctx),
          note: "Clear the escalation (and any blocking smell) named in blockers first; the drive will re-derive and retry."
        },
        holdOption()
      ];
    case "prepare-pr":
    case "wait-ci":
    case "merge":
      return [
        {
          id: "resume",
          title: "Resume the drive (promotion)",
          hil_prompt: `Continue promotion (${describeAction(action, { featureId: ctx.featureId })})?`,
          kind: "action",
          enact: resumeCommand(ctx),
          outward_facing: true
        },
        holdOption()
      ];
    case "done":
      return [
        {
          id: "done",
          title: "Nothing to do (workflow complete)",
          hil_prompt: "This feature is fully shipped. Start a new feature or sprint?",
          kind: "noop",
          enact: null
        }
      ];
    case "feature-complete":
      return [
        {
          id: "resume",
          title: "Deploy the feature",
          hil_prompt: "Every story is built + accepted. Deploy the feature (local working-software check) and enter promotion?",
          kind: "action",
          enact: resumeCommand(ctx)
        },
        holdOption()
      ];
    default:
      return [
        {
          id: "resume",
          title: "Resume the drive",
          hil_prompt: `Resume the drive to carry out: ${describeAction(action, { featureId: ctx.featureId })}?`,
          kind: "action",
          enact: resumeCommand(ctx)
        },
        holdOption()
      ];
  }
}
function openGatesOf(action) {
  switch (action.kind) {
    case "approve-backlog-gate":
      return ["backlog"];
    case "approve-plan-gate":
      return ["plan"];
    case "approve-gate":
      return ["spec"];
    case "accept":
      return ["acceptance"];
    case "approve-deploy-gate":
      return ["deploy"];
    case "approve-promote-gate":
      return ["promote"];
    default:
      return [];
  }
}
function blockersOf(state) {
  if (!state.escalation) return [];
  const e = state.escalation;
  return [
    {
      source: e.source,
      reason: e.reason,
      ...e.story_id ? { story: e.story_id } : {},
      // The deterministic clear is the resolve verb – NOT hand-editing state. `consort-resolve-escalation`
      // clears BOTH the escalation file AND any blocking smell in one shot and KEEPS the audit trail. Emitting
      // the exact command here (and NOT telling the operator to rm/edit the files) is what stops a session
      // improvising a hand-edit of .consort/escalations/ or smells.json to move the run forward.
      resolver: { bin: "consort-resolve-escalation", args: ["--id", e.id, "--resolution", "<what you fixed>"] },
      resolver_hint: `Fix the root cause, then run: consort-resolve-escalation --id ${e.id} --resolution "<what you fixed>" (clears this escalation AND any blocking smell, keeps the audit trail), then resume the drive. Do NOT hand-edit or delete the escalation file or smells.json to move forward \u2013 that desyncs on-disk state.`
    }
  ];
}
function summarize(scope, action, state, ctx) {
  const who = scope === "sprint" ? `sprint ${ctx.sprint}` : `feature ${ctx.featureId}`;
  if (action.kind === "done") {
    return `${who} is complete: every story was built, accepted, and deployed per story, and the feature is merged. Nothing left to do.`;
  }
  if (action.kind === "feature-complete") {
    return `${who}: every story is built + accepted. Next step is to deploy the feature (local working-software check) and enter promotion.`;
  }
  if (action.kind === "raise-to-hil") {
    return `${who} is BLOCKED and needs a human: ${state.blockers[0]?.reason ?? "an escalation was raised"}. See blockers; resolve it, then resume.`;
  }
  if (state.open_gates.length > 0) {
    return `${who} is at the ${state.open_gates[0]} gate, awaiting a human decision. See options for the choices and how to enact each.`;
  }
  return `${who} is mid-flight (${state.derived_phase ?? state.coarse_phase}). The next step is: ${describeAction(action, { featureId: ctx.featureId })}.`;
}
function buildNextSnapshot(scope, state, ctx, transition = nextTransition) {
  const action = transition(state);
  const stories = {};
  for (const s of ctx.stories ?? []) stories[s.story_id] = s.status;
  const nextState = {
    coarse_phase: state.phase,
    derived_phase: scope === "feature" ? deriveFeaturePhase(ctx.stories ?? []) : null,
    stories,
    open_gates: openGatesOf(action),
    blockers: blockersOf(state)
  };
  const primary = { kind: action.kind, describe: describeAction(action, { featureId: ctx.featureId }) };
  const options = buildNextOptions(action, ctx);
  const awaiting_human = options.some((o) => o.kind === "gate" || o.kind === "action" && o.id !== "resume");
  return {
    scope,
    ...ctx.featureId ? { feature: ctx.featureId } : {},
    ...ctx.sprint ? { sprint: ctx.sprint } : {},
    state: nextState,
    primary_action: primary,
    options,
    awaiting_human,
    summary: summarize(scope, action, nextState, ctx),
    authoritative_playbook_version: ctx.version ?? "unknown",
    generated_at: ctx.now ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function readFeatureNextSnapshot(consortDir, featureId, projectDir, ctx = {}) {
  const state = readDriveStateFromDisk(consortDir, featureId, projectDir, { uiTrack: ctx.uiTrack });
  return buildNextSnapshot("feature", state, {
    ...ctx,
    featureId,
    stories: summarizeStories(consortDir, featureId)
  });
}
function emitNextJson(consortDir, featureId, projectDir, ctx = {}) {
  try {
    const snap = readFeatureNextSnapshot(consortDir, featureId, projectDir, ctx);
    fs19.mkdirSync(consortDir, { recursive: true });
    fs19.writeFileSync(path11.join(consortDir, "next.json"), JSON.stringify(snap, null, 2) + "\n", "utf8");
  } catch {
  }
}

// consort/intake/orchestrator-sprint.ts
init_cjs_shims();

// consort/gates/sprint-gates.ts
init_cjs_shims();
var import_node_fs19 = require("fs");

// consort/gates/gate-hash.ts
init_cjs_shims();

// consort/gates/sprint-gates.ts
var SPRINT_GATES_SCHEMA_VERSION = 1;
function defaultSprintGatesState(sprint) {
  return {
    sprint,
    schema_version: SPRINT_GATES_SCHEMA_VERSION,
    gates: { plan: { status: "open", history: [] } }
  };
}
function sprintGatesFile(consortDir, sprint) {
  return sprintGatesJson(consortDir, sprint);
}
function readSprintGates(sprint, opts = {}) {
  const consortDir = opts.consortDir ?? resolveConsortDir();
  const file = sprintGatesFile(consortDir, sprint);
  if (!(0, import_node_fs19.existsSync)(file)) return defaultSprintGatesState(sprint);
  let parsed;
  try {
    parsed = JSON.parse((0, import_node_fs19.readFileSync)(file, "utf8"));
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`sprint gates.json at ${file} is not valid JSON: ${cause}`);
  }
  const plan = parsed.gates?.plan ?? { status: "open", history: [] };
  return {
    sprint,
    schema_version: parsed.schema_version ?? SPRINT_GATES_SCHEMA_VERSION,
    gates: { plan: { status: plan.status, approver: plan.approver, approved_at: plan.approved_at, artifact_hashes: plan.artifact_hashes, history: plan.history ?? [] } }
  };
}

// consort/intake/orchestrator-sprint.ts
var fs20 = __toESM(require("fs"), 1);
function deriveSprintPlanningState(consortDir, sprint, opts = {}) {
  const proposed = fs20.existsSync(featureProposalsMd(consortDir));
  const estimated = hasEstimates(consortDir);
  const backlog = readBacklog(consortDir, sprint).features;
  const requested = readRequested(consortDir, sprint);
  const backlogCommitted = requested !== void 0 && requested.length > 0 || backlog.length > 0;
  const requestsAuthored = backlog.length > 0 && backlog.every((f) => hasFeatureRequest(consortDir, f.id));
  const estimatedIds = new Set(readEstimates(consortDir).map((e) => e.feature_id));
  const committedEstimated = backlog.length > 0 && backlog.every((f) => estimatedIds.has(f.id));
  let gateApproved = false;
  try {
    gateApproved = readSprintGates(sprint, { consortDir }).gates.plan.status === "approved";
  } catch {
    gateApproved = false;
  }
  return {
    phase: "planning",
    planning: { intakeReady: intakeReadyOnDisk(consortDir), intakeApproved: intakeApprovedOnDisk(consortDir), proposed, estimated, backlogCommitted, requestsAuthored, committedEstimated, gateApproved, skipSizing: opts.skipSizing ?? false },
    breakdownDone: false,
    storyOrder: [],
    stories: {},
    buildActive: null
  };
}
function shippedBecauseLaterFeatureClaimed(featureId, claimedFeatureId, backlogIds) {
  const norm = (s) => s.trim().toLowerCase();
  if (!claimedFeatureId || !featureId) return false;
  if (norm(claimedFeatureId) === norm(featureId)) return false;
  const idx = backlogIds.findIndex((id) => norm(id) === norm(featureId));
  const claimedIdx = backlogIds.findIndex((id) => norm(id) === norm(claimedFeatureId));
  if (idx < 0 || claimedIdx < 0) return false;
  return claimedIdx > idx;
}
function shippedByClearedClaim(claimedFeatureId, featurePhase) {
  const cleared = !claimedFeatureId || claimedFeatureId.trim().length === 0;
  return cleared && featurePhase === "complete";
}
async function runSprint(effects) {
  const planning = await effects.drivePlanning();
  if (planning.escalated) return { features: [], escalated: true, escalation: planning.escalation };
  if (planning.pendingGate) return { features: [], pendingGate: planning.pendingGate };
  if (planning.pendingInput) return { features: [], pendingInput: planning.pendingInput };
  await effects.commitAndPushRequests?.();
  const features = await effects.readBacklog();
  const skipped = [];
  for (let i = 0; i < features.length; i++) {
    const featureId = features[i];
    if (await effects.isFeatureShipped?.(featureId)) {
      skipped.push(featureId);
      effects.onSkip?.(featureId, i);
      continue;
    }
    effects.onFeature?.(featureId, i);
    await effects.claimFeature(featureId);
    const driven = await effects.driveFeature(featureId);
    if (driven.escalated) {
      return { features, skipped, escalated: true, escalation: driven.escalation, pendingFeature: featureId };
    }
    if (driven.pendingGate) {
      return { features, skipped, pendingGate: driven.pendingGate, pendingFeature: featureId };
    }
    if (driven.pendingInput) {
      return { features, skipped, pendingInput: driven.pendingInput, pendingFeature: featureId };
    }
  }
  return { features, skipped };
}

// bin/consort/drive.cli.ts
var import_lakebase12 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
var import_util4 = require("@databricks-solutions/lakebase-scm-utils/util");

// consort/orchestrator/provisioning/credentials.ts
init_cjs_shims();
var import_node_child_process9 = require("child_process");
var import_lakebase11 = require("@databricks-solutions/lakebase-scm-utils/lakebase");
async function driveAuthPreflight(host, check = import_lakebase11.checkDatabricksAuth) {
  const res = await check(host);
  if (res.ok) return { ok: true };
  return { ok: false, message: (0, import_lakebase11.databricksAuthPrereqMessage)(host, res.reason) };
}

// consort/session/run-config.ts
init_cjs_shims();
var import_fs15 = require("fs");
var import_path12 = require("path");
var RUN_CONFIG_REL = (0, import_path12.join)(ARTIFACT_ROOT, "run-config.json");
function buildRunConfig(inputs) {
  const env = inputs.env ?? process.env;
  const models = {};
  for (const role of ALL_AGENT_ROLES) models[role] = inputs.modelForRole(role);
  const cfg = {
    version: 1,
    started_at: inputs.startedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    bound: inputs.bound ?? "full",
    gates: inputs.gates ?? "proxy",
    ui_track: Boolean(inputs.uiTrack),
    build_session_scope: inputs.buildSessionScope ?? "story",
    review_effort: inputs.reviewEffort ?? "",
    // loop + batchCap come from the RESOLVED settings (the caller passes the file
    // values); never re-read from env here, or the snapshot would record a value
    // the drive did not actually use (the resolver is now file-only).
    loop_granularity: inputs.loopGranularity ?? "story",
    deploy_target: inputs.deployTarget ?? "local",
    models
  };
  if (inputs.batchCap !== void 0) cfg.batch_cap = inputs.batchCap;
  const label = consortEnv("RUN_LABEL", env);
  if (label) cfg.run_label = label;
  const kitRef = resolveLaunchKitRef(inputs.projectDir, env);
  if (kitRef) cfg.kit_ref = kitRef;
  return cfg;
}
function writeRunConfig(inputs) {
  const cfg = buildRunConfig(inputs);
  const body = JSON.stringify(cfg, null, 2) + "\n";
  try {
    (0, import_fs15.mkdirSync)(inputs.consortDir, { recursive: true });
    (0, import_fs15.writeFileSync)((0, import_path12.join)(inputs.consortDir, "run-config.json"), body);
    const recordDir = consortEnv("RECORD_DIR", inputs.env ?? process.env)?.trim();
    if (recordDir) {
      (0, import_fs15.mkdirSync)(recordDir, { recursive: true });
      (0, import_fs15.writeFileSync)((0, import_path12.join)(recordDir, "run-config.json"), body);
    }
  } catch {
  }
  return cfg;
}

// consort/telemetry/with-telemetry.ts
init_cjs_shims();

// consort/telemetry/allowlist.ts
init_cjs_shims();
var TELEMETRY_SCHEMA = "consort/v1";
var RESOURCE_ATTR_KEYS = [
  "schema",
  "install_id",
  "consort_version",
  "node_version",
  "os",
  "arch",
  "shell",
  "ci",
  "tty",
  "level"
];
var RUN_SPAN_FIELDS_L1 = [
  "trace_id",
  "span_id",
  "name",
  "start_ts",
  "end_ts",
  "duration_ms",
  "command",
  "outcome",
  "exit_code",
  "gates_total",
  // Repair & loop dynamics – PROMOTED to L1: "is the ensemble thrashing" is a HEALTH
  // signal (L1's job), and these are aggregate run-level COUNTS – no per-turn detail, no
  // content. Tallied on every run now, not just at level 2.
  "red_green_cycles",
  "refactor_iterations",
  "revise_rounds",
  "selfheal_attempts",
  "hil_escalations"
];
var RUN_SPAN_FIELDS_L2 = [
  // Project shape (counts, not content), each suffixed `_count` so it reads as a
  // count and never collides with a `.consort` layout path segment. The gate COUNT
  // is already carried by the L1 `gates_total`, so it is not duplicated here.
  "feature_count",
  "story_count",
  "ac_count",
  "test_count",
  // Config/levers: whether the UX-adherence track is engaged (boolean).
  "ui_track"
];
var RUN_SPAN_FIELDS = [...RUN_SPAN_FIELDS_L1, ...RUN_SPAN_FIELDS_L2];
var GATE_SPAN_FIELDS_L1 = [
  "trace_id",
  "parent_span_id",
  "span_id",
  "name",
  "gate",
  "role",
  "phase",
  "ordinal",
  "start_ts",
  "end_ts",
  "duration_ms",
  "outcome",
  // WHY, at the DEFAULT level (both closed CATEGORY enums, never free text): `fail_class` is
  // the categorized signature of a failed/aborted gate (the failure taxonomy); `revise_class`
  // is why a `revise-route` re-routed (turns the L1 `revise_rounds` count into a reason). These
  // are adoption-health signals ("why are runs failing / re-routing"), so they belong at L1.
  "fail_class",
  "revise_class"
];
var GATE_SPAN_FIELDS_L2 = [];
var GATE_SPAN_FIELDS = [...GATE_SPAN_FIELDS_L1, ...GATE_SPAN_FIELDS_L2];
var TURN_SPAN_FIELDS = [
  "trace_id",
  "parent_span_id",
  "span_id",
  "name",
  "role",
  // Phase (same closed PHASE_VALUES enum as the gate span): lets the L2 turn view be a clean
  // GROUP BY phase, role, model – build roles multiplex phases that model/effort alone can't tell.
  "phase",
  "model",
  "effort",
  "duration_ms",
  "retry_count",
  "token_bucket",
  // Cost split (each a coarse TOKEN_BUCKET_VALUES band): input = context read, output =
  // generation, cache_read = reuse – WHY a turn is expensive (read-heavy vs write-heavy).
  "token_bucket_input",
  "token_bucket_output",
  "token_bucket_cache_read"
];
var OS_VALUES = ["darwin", "linux", "win32", "other"];
var ARCH_VALUES = ["arm64", "x64", "other"];
function outcomeForExit(code) {
  if (code === 0) return "completed";
  if (code === 3) return "aborted";
  return "error";
}
function commandForFeaturePhase(phase) {
  switch (phase) {
    case "design":
      return "design";
    case "build":
      return "build";
    case "complete":
      return "deploy";
    default:
      return "build";
  }
}
var ROLE_VALUES = [
  "spec-author",
  "architect-reviewer",
  "dba",
  "ux-designer",
  "test-strategist",
  "navigator",
  "driver",
  "product-owner"
];
var PHASE_VALUES = [
  "breakdown",
  "spec",
  "architecture",
  "db-design",
  "test-strategy",
  "ux-design",
  "reflect",
  "red",
  "green",
  "review",
  "refactor",
  "refactor-superseded",
  "assess",
  "assess-refactor",
  "repair",
  "other"
];
var EFFORT_VALUES = ["low", "medium", "high", "unknown"];
var RUN_SPAN_NAME = "consort.run";
var GATE_SPAN_NAME = "consort.gate";
var TURN_SPAN_NAME = "consort.turn";
var GATE_KINDS = [
  "invoke-role",
  "project-architect-notes",
  "surface-gate",
  "approve-gate",
  "design-complete",
  "approve-intake-gate",
  "approve-backlog-gate",
  "approve-plan-gate",
  "planning-complete",
  "dispatch",
  "cut-experiment",
  "deploy-verify-heal",
  "await-acceptance",
  "accept",
  "complete",
  "feature-complete",
  "deploy",
  "approve-deploy-gate",
  "deploy-complete",
  "prepare-pr",
  "wait-ci",
  "approve-promote-gate",
  "merge",
  "raise-to-hil",
  "revise-route",
  "done"
];
var RESOURCE_KEY_SET = new Set(RESOURCE_ATTR_KEYS);
var GATE_KIND_SET = new Set(GATE_KINDS);
var isKnownGateKind = (k) => GATE_KIND_SET.has(k);
var ROLE_VALUE_SET = new Set(ROLE_VALUES);
var isKnownRole = (r) => ROLE_VALUE_SET.has(r);
var PHASE_VALUE_SET = new Set(PHASE_VALUES);
var isKnownPhase = (p) => PHASE_VALUE_SET.has(p);
function pickAllowed(obj, allowed) {
  const set = new Set(allowed);
  const src = obj;
  const out = {};
  for (const k of Object.keys(src)) {
    if (set.has(k)) out[k] = src[k];
  }
  return out;
}

// consort/telemetry/consent.ts
init_cjs_shims();
var inCi = (env) => {
  const v = (env.CI ?? "").trim();
  if (v === "") return false;
  return !/^(0|false)$/i.test(v);
};
var killed = (env) => (env.CONSORT_TELEMETRY ?? "").trim() === "0";
function shouldEmitTelemetry(inp) {
  if (killed(inp.env)) return false;
  if (inCi(inp.env)) return false;
  if (!inp.telemetryEnabled) return false;
  return true;
}

// consort/telemetry/emitter.ts
init_cjs_shims();
var import_node_child_process10 = require("child_process");
var import_node_fs20 = require("fs");
var import_node_os = require("os");
var import_node_path23 = require("path");
var import_node_crypto7 = require("crypto");

// consort/telemetry/spans.ts
init_cjs_shims();
var import_node_crypto6 = require("crypto");
var newTraceId = () => (0, import_node_crypto6.randomBytes)(16).toString("hex");
var newSpanId = () => (0, import_node_crypto6.randomBytes)(8).toString("hex");
var sanitizeRunSpan = (s) => pickAllowed(s, RUN_SPAN_FIELDS);
var sanitizeGateSpan = (s) => pickAllowed(s, GATE_SPAN_FIELDS);
var sanitizeTurnSpan = (s) => pickAllowed(s, TURN_SPAN_FIELDS);
var isRunSpan = (s) => s.name === RUN_SPAN_NAME;
var isTurnSpan = (s) => s.name === TURN_SPAN_NAME;
var sanitizeSpan = (s) => isRunSpan(s) ? sanitizeRunSpan(s) : isTurnSpan(s) ? sanitizeTurnSpan(s) : sanitizeGateSpan(s);

// consort/telemetry/emitter.ts
var DEFAULT_QUEUE_CAP = 200;
var DEFAULT_TIMEOUT_MS = 500;
var noopSink = { deliver() {
} };
function httpSink(opts) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    deliver(payload) {
      try {
        const body = payload.spans.map((s) => JSON.stringify(wireLine(s, payload))).join("\n") + "\n";
        const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : void 0;
        const headers = { "content-type": "application/x-ndjson" };
        if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
        return Promise.resolve(
          doFetch(`${opts.endpoint.replace(/\/$/, "")}/v1/traces`, {
            method: "POST",
            headers,
            body,
            ...signal ? { signal } : {}
          })
        ).then(
          () => {
          },
          (err) => opts.onError?.(err)
        );
      } catch (err) {
        opts.onError?.(err);
      }
    }
  };
}
function wireLine(span, payload) {
  const clean = sanitizeSpan(span);
  return isRunSpan(span) ? { schema: payload.schema, ...clean, resource: payload.resource } : { schema: payload.schema, ...clean };
}
var DEFAULT_ENDPOINT = "https://consort-telemetry-ingest-v2.azurewebsites.net";
function endpointMode(env) {
  const endpoint = env.CONSORT_TELEMETRY_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  const raw = (env.CONSORT_TELEMETRY_SIGNOFF ?? "").trim();
  const signedOff = raw === "" ? true : /^(1|true)$/i.test(raw);
  return { endpoint, signedOff, willPost: !!endpoint && signedOff };
}
function detachedHttpSink(opts) {
  const spawnImpl = opts.spawnFn ?? import_node_child_process10.spawn;
  const dir = opts.tmpDir ?? (0, import_node_os.tmpdir)();
  const url = `${opts.endpoint.replace(/\/$/, "")}/v1/traces`;
  return {
    deliver(payload) {
      try {
        const body = payload.spans.map((s) => JSON.stringify(wireLine(s, payload))).join("\n") + "\n";
        const file = (0, import_node_path23.join)(dir, `consort-telemetry-${(0, import_node_crypto7.randomUUID)()}.ndjson`);
        (0, import_node_fs20.writeFileSync)(file, body);
        const child = spawnImpl(process.execPath, [opts.senderJs, file, url, opts.token ?? ""], {
          detached: true,
          stdio: "ignore"
        });
        child.unref();
      } catch {
      }
    }
  };
}
function resolveSink(env) {
  const mode = endpointMode(env);
  if (!mode.willPost) return noopSink;
  const token = env.CONSORT_TELEMETRY_TOKEN?.trim() || void 0;
  try {
    const senderJs = resolveKitBinJs("consort-telemetry-send");
    if (senderJs) return detachedHttpSink({ endpoint: mode.endpoint, token, senderJs });
  } catch {
  }
  return httpSink({ endpoint: mode.endpoint, token });
}
var TelemetryEmitter = class {
  queue = [];
  sink;
  resource;
  cap;
  /** Promises for deliveries kicked off by flush(), so flushAndWait() can bound-await
   *  them at shutdown (the fix for the drive-exit race that dropped every POST). */
  inflight = [];
  constructor(opts) {
    this.sink = opts.sink;
    this.resource = opts.resource;
    this.cap = opts.queueCap ?? DEFAULT_QUEUE_CAP;
  }
  /** Number of spans currently queued (diagnostic; tests assert the cap). */
  get queued() {
    return this.queue.length;
  }
  /** Append a span, dropping the OLDEST if the queue is at cap. Sanitizes first,
   *  so a non-allowlisted field never reaches the queue. Never throws. */
  enqueue(span) {
    try {
      const clean = sanitizeSpan(span);
      if (this.queue.length >= this.cap) this.queue.shift();
      this.queue.push(clean);
    } catch {
    }
  }
  /** Drain the queue into one payload and deliver it fire-and-forget. Swallows
   *  all errors. A no-op / empty queue returns immediately. */
  flush() {
    if (this.queue.length === 0) return;
    const spans = this.queue.splice(0);
    try {
      const p = this.sink.deliver({ schema: this.resource.schema, resource: this.resource, spans });
      if (p && typeof p.then === "function") {
        this.inflight.push(p.then(() => {
        }, () => {
        }));
      }
    } catch {
    }
  }
  /** Drain the queue AND bound-await the in-flight deliveries, up to `timeoutMs`.
   *  Call this ONCE at process shutdown (after finish()) so the final POST is not
   *  abandoned when the CLI calls process.exit() – the drive-exit race that silently
   *  dropped every run's telemetry. Never throws, never waits longer than the bound;
   *  a slow/cold endpoint is capped, not blocking. A no-op sink resolves at once. */
  async flushAndWait(timeoutMs) {
    try {
      this.flush();
      if (this.inflight.length === 0) return;
      const pending = Promise.allSettled(this.inflight.splice(0));
      let timer;
      const capped = new Promise((resolve3) => {
        timer = setTimeout(resolve3, Math.max(0, timeoutMs));
      });
      await Promise.race([pending.then(() => void 0), capped]);
      if (timer) clearTimeout(timer);
    } catch {
    }
  }
};

// consort/telemetry/home-config.ts
init_cjs_shims();
var fs21 = __toESM(require("fs"), 1);
var os = __toESM(require("os"), 1);
var path12 = __toESM(require("path"), 1);
var import_node_crypto8 = require("crypto");
var DEFAULT_TELEMETRY_ENABLED = true;
var DEFAULT_TELEMETRY_LEVEL = 1;
var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var isUuidV4 = (s) => typeof s === "string" && UUID_V4.test(s);
function telemetryDebug(msg, err) {
  if (!process.env.CONSORT_TELEMETRY_DEBUG) return;
  const detail = err instanceof Error ? err.message : err !== void 0 ? String(err) : "";
  process.stderr.write(`[consort-telemetry] ${msg}${detail ? `: ${detail}` : ""}
`);
}
function telemetryConfigDir(deps = {}) {
  const env = deps.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : path12.join(deps.homedir ?? os.homedir(), ".config");
  return path12.join(base, "consort");
}
function telemetryConfigFile(deps = {}) {
  return path12.join(telemetryConfigDir(deps), "telemetry.json");
}
function readStoredConfig(deps = {}) {
  let raw;
  try {
    raw = fs21.readFileSync(telemetryConfigFile(deps), "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!isUuidV4(data.install_id)) return null;
    const telemetry_enabled = typeof data.telemetry_enabled === "boolean" ? data.telemetry_enabled : DEFAULT_TELEMETRY_ENABLED;
    const telemetry_level = data.telemetry_level === 2 ? 2 : DEFAULT_TELEMETRY_LEVEL;
    const l2_opt_in_notified = data.l2_opt_in_notified === true;
    const acknowledged = data.acknowledged === true;
    const beacon_sent = data.beacon_sent === true;
    return { install_id: data.install_id, telemetry_enabled, telemetry_level, l2_opt_in_notified, acknowledged, beacon_sent };
  } catch {
    return null;
  }
}
function writeStoredConfig(cfg, deps = {}) {
  try {
    const dir = telemetryConfigDir(deps);
    fs21.mkdirSync(dir, { recursive: true });
    fs21.writeFileSync(telemetryConfigFile(deps), JSON.stringify(cfg, null, 2) + "\n", "utf8");
    return { cfg, persisted: true };
  } catch (err) {
    telemetryDebug("could not persist telemetry config (degrading to an ephemeral id for this run)", err);
    return { cfg, persisted: false };
  }
}
function ensureInstallId(deps = {}) {
  try {
    const existing = readStoredConfig(deps);
    if (existing) return existing.install_id;
    return writeStoredConfig({ install_id: (0, import_node_crypto8.randomUUID)(), telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }, deps).cfg.install_id;
  } catch (err) {
    telemetryDebug("ensureInstallId failed (using an ephemeral id for this run)", err);
    return (0, import_node_crypto8.randomUUID)();
  }
}
function isTelemetryEnabled(deps = {}) {
  return (readStoredConfig(deps) ?? { telemetry_enabled: DEFAULT_TELEMETRY_ENABLED }).telemetry_enabled;
}
function isFirstRun(deps = {}) {
  return readStoredConfig(deps) === null;
}
function updateStoredConfig(patch, deps = {}) {
  const existing = readStoredConfig(deps);
  const base = existing ?? {
    install_id: (0, import_node_crypto8.randomUUID)(),
    telemetry_enabled: DEFAULT_TELEMETRY_ENABLED,
    telemetry_level: DEFAULT_TELEMETRY_LEVEL
  };
  return writeStoredConfig({ ...base, ...patch }, deps).cfg;
}
function resolveTelemetryLevel(deps = {}) {
  const env = deps.env ?? process.env;
  const raw = (env.CONSORT_TELEMETRY_LEVEL ?? "").trim();
  if (raw === "2") return 2;
  if (raw === "1") return 1;
  return readStoredConfig(deps)?.telemetry_level === 2 ? 2 : DEFAULT_TELEMETRY_LEVEL;
}
function isL2NoticeSeen(deps = {}) {
  return readStoredConfig(deps)?.l2_opt_in_notified === true;
}
function markL2NoticeSeen(deps = {}) {
  updateStoredConfig({ l2_opt_in_notified: true }, deps);
}

// consort/telemetry/resource.ts
init_cjs_shims();
function normalizeOs(platform) {
  return OS_VALUES.includes(platform) ? platform : "other";
}
function normalizeArch(arch) {
  return ARCH_VALUES.includes(arch) ? arch : "other";
}
function normalizeShell(env) {
  const shellPath = (env.SHELL ?? "").trim();
  const base = shellPath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base === "zsh" || base === "bash" || base === "fish") return base;
  if (base === "pwsh" || base === "powershell") return "powershell";
  if (env.PSModulePath && !env.SHELL) return "powershell";
  return "unknown";
}
function ciBool(env) {
  const v = (env.CI ?? "").trim();
  return v !== "" && !/^(0|false)$/i.test(v);
}
function buildResourceAttrs(deps = {}) {
  const env = deps.env ?? process.env;
  return {
    schema: TELEMETRY_SCHEMA,
    install_id: ensureInstallId(deps),
    consort_version: deps.version ?? kitVersion2(),
    node_version: process.versions.node,
    os: normalizeOs(deps.platform ?? process.platform),
    arch: normalizeArch(deps.arch ?? process.arch),
    shell: normalizeShell(env),
    ci: ciBool(env),
    tty: deps.isTTY ?? !!process.stdout.isTTY,
    level: deps.level ?? resolveTelemetryLevel(deps)
  };
}

// consort/telemetry/turn-meta.ts
init_cjs_shims();
function bucketModel(modelId) {
  if (!modelId || !modelId.trim()) return void 0;
  const m = modelId.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  if (m.includes("fable")) return "fable";
  return "other";
}
function normalizeEffort(effort) {
  if (!effort || !effort.trim()) return void 0;
  const e = effort.trim().toLowerCase();
  return EFFORT_VALUES.includes(e) ? e : "unknown";
}
var TOKEN_BUCKET_THRESHOLDS = [
  { bucket: "xs", maxExclusive: 25e3 },
  { bucket: "s", maxExclusive: 75e3 },
  { bucket: "m", maxExclusive: 2e5 },
  { bucket: "l", maxExclusive: 5e5 },
  { bucket: "xl", maxExclusive: Infinity }
];
function bucketCount(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return void 0;
  for (const t of TOKEN_BUCKET_THRESHOLDS) {
    if (n < t.maxExclusive) return t.bucket;
  }
  return "xl";
}
function bucketTokens(usage) {
  if (!usage) return void 0;
  return bucketCount((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
}
function turnSpanFieldsFromMeta(meta) {
  if (!meta) return {};
  const out = {};
  const model = bucketModel(meta.model);
  if (model) out.model = model;
  const effort = normalizeEffort(meta.effort);
  if (effort) out.effort = effort;
  const tokenBucket = bucketTokens(meta.usage);
  if (tokenBucket) out.token_bucket = tokenBucket;
  if (meta.usage) {
    const bi = bucketCount(meta.usage.inputTokens);
    if (bi) out.token_bucket_input = bi;
    const bo = bucketCount(meta.usage.outputTokens);
    if (bo) out.token_bucket_output = bo;
    const bc = bucketCount(meta.usage.cacheReadTokens);
    if (bc) out.token_bucket_cache_read = bc;
  }
  if (typeof meta.retryCount === "number" && Number.isFinite(meta.retryCount) && meta.retryCount >= 0) {
    out.retry_count = meta.retryCount;
  }
  return out;
}

// consort/telemetry/with-telemetry.ts
function phaseForAction(action) {
  if (action.kind !== "invoke-role") return void 0;
  const raw = ("buildMode" in action && typeof action.buildMode === "string" ? action.buildMode : void 0) ?? ("mode" in action && typeof action.mode === "string" ? action.mode : void 0);
  if (raw) return isKnownPhase(raw) ? raw : "other";
  switch (action.role) {
    case "spec-author":
      return "spec";
    case "architect-reviewer":
      return "architecture";
    case "dba":
      return "db-design";
    case "test-strategist":
      return "test-strategy";
    case "ux-designer":
      return "ux-design";
    case "driver":
      return "green";
    // base build turn = the GREEN attempt
    case "navigator":
      return "red";
    // base build turn = the RED test
    default:
      return "other";
  }
}
function reasonText(action) {
  const reason = "reason" in action && typeof action.reason === "string" ? action.reason : "";
  const source = "source" in action && typeof action.source === "string" ? action.source : "";
  return `${reason} ${source}`.toLowerCase();
}
function classifyFailClass(action) {
  const t = reasonText(action);
  if (/etimedout/.test(t) || /merge/.test(t) && /timeout/.test(t)) return "merge-etimedout";
  if (/npm|proxy|registry/.test(t) && /hang|timeout|etimedout|econnreset/.test(t)) return "npm-proxy-hang";
  if (/alembic|multi.?head|multiple heads/.test(t)) return "alembic-multi-head";
  if (/review/.test(t) && /block|protocol|admin|bypass/.test(t)) return "review-blocked-protocol";
  if (/deploy.?verify|working.?software|verify.*(halt|fail)/.test(t)) return "deploy-verify-halt";
  if (/ux.?adherence|design.?guide|inline.?style/.test(t)) return "ux-adherence-hil";
  return "other";
}
function classifyReviseClass(action) {
  const t = reasonText(action);
  if (/nfr/.test(t) && /coverage|gap|uncovered/.test(t)) return "nfr-coverage-gap";
  if (/e2e|end.?to.?end/.test(t) && /layer|mock|boundary|component/.test(t)) return "e2e-layer-misroute";
  if (/invariant/.test(t) && /leg|column|missing|uncovered/.test(t)) return "invariant-leg-missing";
  if (/independence|subset|overlap/.test(t)) return "ac-independence";
  if (/test.?list/.test(t)) return "test-list-drift";
  if (/reversib|downgrade|migration/.test(t)) return "migration-reversibility";
  return "other";
}
var FIRST_RUN_NOTICE = "[consort] Anonymous* usage telemetry is on (*pseudonymous: a random per-install id, no PII).\n          Each run of Consort reports to the maintainers' endpoint; only allowlisted,\n          non-sensitive fields are sent (no paths, code, error text, or names).\n          Help the maintainers more \u2013 opt in to Level 2: `consort-telemetry enable --level 2`\n          adds per-role timings + coarse failure classes (still no code/paths/names), so they\n          can find and fix what makes runs slow or fail. It's off by default; this is the ask.\n          Turn telemetry off any time: `consort-telemetry disable` (or CONSORT_TELEMETRY=0).\n          Details: TELEMETRY.md.\n";
var L2_OPT_IN_NOTICE = "[consort] Level-2 usage telemetry is ON (you opted in).\n          On top of Level 1, it reports per-role turn timings and coarse\n          repair/loop counts \u2013 still only allowlisted enums, counts, and\n          durations (no prompts, code, paths, error text, or names).\n          Back to Level 1 any time: `consort-telemetry enable --level 1`.\n          Details: TELEMETRY.md.\n";
var NOOP_RUN = {
  enabled: false,
  traceId: void 0,
  wrap: (inner) => inner,
  finish: () => {
  }
};
function gateOutcome(action, threw) {
  if (action.kind === "raise-to-hil") return "abort";
  return threw ? "fail" : "pass";
}
function beginTelemetryRun(deps) {
  try {
    return beginTelemetryRunUnsafe(deps);
  } catch (err) {
    telemetryDebug("beginTelemetryRun failed; telemetry disabled for this run", err);
    return NOOP_RUN;
  }
}
function beginTelemetryRunUnsafe(deps) {
  const env = deps.env ?? process.env;
  const isTTY = deps.isTTY ?? !!process.stdout.isTTY;
  const enabledFlag = deps.telemetryEnabled ?? isTelemetryEnabled(deps);
  if (!shouldEmitTelemetry({ telemetryEnabled: enabledFlag, env })) return NOOP_RUN;
  const now = deps.now ?? Date.now;
  const level = deps.level ?? resolveTelemetryLevel(deps);
  const l2 = level === 2;
  if (deps.onNotice && isFirstRun(deps)) deps.onNotice(FIRST_RUN_NOTICE);
  if (deps.onNotice && l2 && !isL2NoticeSeen(deps)) {
    deps.onNotice(L2_OPT_IN_NOTICE);
    markL2NoticeSeen(deps);
  }
  const resource = buildResourceAttrs({ ...deps, isTTY, level });
  const sink = deps.sink ?? resolveSink(env);
  const emitter = new TelemetryEmitter({ sink, resource });
  const traceId = newTraceId();
  const rootSpanId = newSpanId();
  const rootStart = now();
  let gates = 0;
  let finished = false;
  const l2Counts = {
    red_green_cycles: 0,
    refactor_iterations: 0,
    revise_rounds: 0,
    selfheal_attempts: 0,
    hil_escalations: 0
  };
  let lastState;
  const tallyL2 = (action) => {
    switch (action.kind) {
      case "raise-to-hil":
        l2Counts.hil_escalations += 1;
        break;
      case "revise-route":
        l2Counts.revise_rounds += 1;
        break;
      case "invoke-role": {
        const bm = "buildMode" in action ? action.buildMode : void 0;
        if (bm && bm.startsWith("refactor")) l2Counts.refactor_iterations += 1;
        else if (bm && (bm.startsWith("assess") || bm === "repair")) l2Counts.selfheal_attempts += 1;
        else if (action.role === "driver" && bm === void 0) l2Counts.red_green_cycles += 1;
        break;
      }
      case "deploy-verify-heal":
        if (action.mode.startsWith("refactor")) l2Counts.refactor_iterations += 1;
        else l2Counts.selfheal_attempts += 1;
        break;
    }
  };
  const recordChild = (action, ordinal, start, threw) => {
    if (action.kind === "done") return;
    if (!isKnownGateKind(action.kind)) return;
    const end = now();
    const span = {
      trace_id: traceId,
      parent_span_id: rootSpanId,
      span_id: newSpanId(),
      name: GATE_SPAN_NAME,
      gate: action.kind,
      ordinal,
      start_ts: start,
      end_ts: end,
      duration_ms: end - start,
      outcome: gateOutcome(action, threw)
    };
    if (action.kind === "invoke-role" && isKnownRole(action.role)) {
      span.role = action.role;
      const phase = phaseForAction(action);
      if (phase) span.phase = phase;
    }
    if (span.outcome === "fail" || span.outcome === "abort") span.fail_class = classifyFailClass(action);
    if (action.kind === "revise-route") span.revise_class = classifyReviseClass(action);
    emitter.enqueue(span);
    gates += 1;
    tallyL2(action);
    if (l2) {
      if (action.kind === "invoke-role" && isKnownRole(action.role)) {
        const turnPhase = phaseForAction(action);
        const turn = {
          trace_id: traceId,
          parent_span_id: rootSpanId,
          span_id: newSpanId(),
          name: TURN_SPAN_NAME,
          role: action.role,
          ...turnPhase ? { phase: turnPhase } : {},
          duration_ms: end - start,
          ...turnSpanFieldsFromMeta(takeLastTurnMeta())
        };
        emitter.enqueue(turn);
      }
    }
  };
  const wrap = (inner) => {
    let pendingOrdinal = 0;
    return {
      // Tap the readState seam to capture the last state the driver observed, so
      // finish() can record coarse L2 project shape without its own async read.
      readState: async () => {
        const s = await inner.readState();
        lastState = s;
        return s;
      },
      onAction: (action, i) => {
        pendingOrdinal = i;
        inner.onAction?.(action, i);
      },
      // Forward every optional seam UNCHANGED (mirrors the recording decorators),
      // so telemetry composition never disables routing / correspondence / etc.
      onRoutingDecision: inner.onRoutingDecision ? (a, s, i, src) => inner.onRoutingDecision(a, s, i, src) : void 0,
      onCorrespondence: inner.onCorrespondence ? (a, s, i) => inner.onCorrespondence(a, s, i) : void 0,
      onHandback: inner.onHandback ? (h, d) => inner.onHandback(h, d) : void 0,
      assertRouteSatisfiable: inner.assertRouteSatisfiable ? (a, s) => inner.assertRouteSatisfiable(a, s) : void 0,
      // Executor-dispatched agent turns run THROUGH performViaExecutor (the driver
      // does NOT then call perform), so a child span is timed here – but ONLY when
      // the inner returns a DEFINED bounded route, i.e. the action was actually
      // handled by the executor. When it returns `undefined` the action was NOT
      // executor-dispatched: the driver falls through to `perform`, whose wrapper
      // records the span, so recording here too would DOUBLE-COUNT every non-
      // executor action (the common case: gates, cut-experiment, deploy, merge, ...).
      // On a throw we still record (fail), since no fall-through perform will run.
      performViaExecutor: inner.performViaExecutor ? async (action, state, routerDeps) => {
        const start = now();
        try {
          const r = await inner.performViaExecutor(action, state, routerDeps);
          if (r !== void 0) recordChild(action, pendingOrdinal, start, false);
          return r;
        } catch (err) {
          recordChild(action, pendingOrdinal, start, true);
          throw err;
        }
      } : void 0,
      async perform(action) {
        const start = now();
        try {
          await inner.perform(action);
          recordChild(action, pendingOrdinal, start, false);
        } catch (err) {
          recordChild(action, pendingOrdinal, start, true);
          throw err;
        }
      }
    };
  };
  const finish = (info) => {
    if (finished) return;
    finished = true;
    const end = now();
    const root = {
      trace_id: traceId,
      span_id: rootSpanId,
      name: RUN_SPAN_NAME,
      start_ts: rootStart,
      end_ts: end,
      duration_ms: end - rootStart,
      command: deps.command,
      outcome: info.outcome,
      exit_code: info.exit_code,
      gates_total: gates
    };
    root.red_green_cycles = l2Counts.red_green_cycles;
    root.refactor_iterations = l2Counts.refactor_iterations;
    root.revise_rounds = l2Counts.revise_rounds;
    root.selfheal_attempts = l2Counts.selfheal_attempts;
    root.hil_escalations = l2Counts.hil_escalations;
    if (l2 && lastState) {
      if (typeof lastState.uiTrack === "boolean") root.ui_track = lastState.uiTrack;
      if (Array.isArray(lastState.storyOrder)) root.story_count = lastState.storyOrder.length;
    }
    emitter.enqueue(root);
    emitter.flush();
  };
  if (deps.registerExitFlush !== false) {
    process.once("beforeExit", () => {
      if (!finished) emitter.flush();
    });
  }
  return { enabled: true, traceId, wrap, finish };
}
function withTelemetry(inner, run) {
  return run.wrap(inner);
}

// bin/consort/drive.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--sprint":
        out.sprint = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
        out.consortDir = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--deploy-target":
        out.deployTarget = argv[++i];
        break;
      case "--approver":
        out.approver = argv[++i];
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--max-steps":
        out.maxSteps = Number(argv[++i]);
        break;
      case "--plan-only":
        out.planOnly = true;
        break;
      case "--only":
        out.only = argv[++i];
        break;
      case "--pause-before":
        out.pauseBefore = argv[++i];
        break;
      case "--gates":
        out.gates = argv[++i];
        break;
      // Sizing (the Architect's t-shirt-sizing / planning-poker step) is ON by
      // default. --no-sizing opts OUT: planning goes propose -> author-requests
      // with no estimate, for a backlog small enough not to need capacity sizing.
      case "--no-sizing":
      case "--no-planning-poker":
      case "--no-t-shirt-sizing":
        out.noSizing = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
function help() {
  return `consort-drive (deterministic orchestrator driver)

Usage:
  consort-drive --feature <id> [flags]

Flags:
  --feature <id>       Feature to drive (required)
  --project-dir <dir>  Project root (default: cwd)
  --tdd-dir <dir>      artifact root (default: <project-dir>/${ARTIFACT_ROOT}, honors legacy roots)
  --instance <id>      Lakebase instance id (threaded to experiment branch ops)
  --deploy-target <t>  Deploy target for the deploy phase (default: local)
  --approver <name>    Headless gate approver (default: human-proxy)
  --detach             Re-launch in a NEW session (setsid) and return at once, so the
                       run survives this shell/turn ending. Use this INSTEAD of
                       nohup/& (which the harness reaps on turn-end). Prints the child
                       pid + the consort-watch command; follow the run via that.
  --dry-run            Print the single next action + its commands, then exit
  --max-steps <n>      Stop after n actions (incremental/live testing + safety)
  --plan-only          Tier-2: run the sprint planning sub-machine only (/plan)
  --only <phase>       Tier-2 bound: design | build | deploy (one phase, then stop)
  --pause-before <m>   PAUSE (not stop) just before a handoff: navigator (the
                       build kickoff) | release-engineer (the deploy/verify). The
                       driver blocks for a human [Y/n], then RESUMES the same run
                       on Y \u2013 it never leaves the state machine. n re-asks. Set
                       LAKEBASE_CONSORT_AUTO_CONTINUE=1 to auto-confirm (non-interactive).
  --gates <mode>       interactive (default: stop AT each HITL gate so the human
                       answers, then re-run) | proxy (headless: Human Proxy
                       approves; requires LAKEBASE_CONSORT_AUTO_CONTINUE=1 or CI).
                       Run-scoped: overrides project.gates for THIS run only,
                       never rewrites sftdd-config.json.
  --no-sizing          Skip the Architect's t-shirt-sizing (planning-poker) step:
                       planning goes propose -> author-requests, no estimate.
                       Sizing is ON by default. Aliases: --no-planning-poker,
                       --no-t-shirt-sizing.
`;
}
function makeConfirmContinue() {
  const auto = consortEnv("AUTO_CONTINUE") === "1";
  const answerFile = consortEnv("GATE_ANSWER_FILE")?.trim();
  const isYes = (a) => a === "" || a === "y" || a === "yes";
  return (action) => new Promise((resolve3, reject) => {
    const label = describeAction(action);
    const prompt = `
[drive] PAUSED \u2013 continue past the ${label} handoff? [Y/n] `;
    if (auto) {
      process.stderr.write(`[drive] PAUSE gate (auto-continue): proceeding past ${label}
`);
      return resolve3();
    }
    if (answerFile) {
      process.stderr.write(`${prompt}
[drive] (awaiting answer in ${answerFile})
`);
      const poll = setInterval(() => {
        let raw;
        try {
          raw = fs22.readFileSync(answerFile, "utf8");
        } catch {
          return;
        }
        const a = raw.trim().toLowerCase();
        if (a === "") return;
        try {
          fs22.rmSync(answerFile, { force: true });
        } catch {
        }
        if (a === "y" || a === "yes") {
          clearInterval(poll);
          process.stderr.write(`[drive] resuming.
`);
          resolve3();
        } else process.stderr.write(`[drive] holding \u2013 write Y to ${answerFile} when ready.
`);
      }, 1e3);
      return;
    }
    if (process.stdin.isTTY) {
      const ask = () => {
        const rl = readline2.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
        rl.question(prompt, (answer) => {
          rl.close();
          if (isYes(answer.trim().toLowerCase())) {
            process.stderr.write(`[drive] resuming.
`);
            resolve3();
          } else {
            process.stderr.write(`[drive] holding \u2013 answer Y when ready.
`);
            ask();
          }
        });
      };
      return ask();
    }
    reject(
      new Error(
        `[drive] PAUSED at the ${label} handoff with no human channel \u2013 refusing to continue. Set LAKEBASE_CONSORT_AUTO_CONTINUE=1 (deliberate headless), provide LAKEBASE_CONSORT_GATE_ANSWER_FILE, or run in an interactive terminal.`
      )
    );
  });
}
function withBuildRecording(inner, cfg) {
  const recordBuildDir = consortEnv("RECORD_BUILD_DIR")?.trim();
  if (!recordBuildDir) return inner;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction(a, i) : void 0,
    // Forward the routing-decision seam UNCHANGED (withTurnRecording records it; this build-only
    // wrapper just preserves it so composition never drops it).
    onRoutingDecision: inner.onRoutingDecision ? (a, s, i, src) => inner.onRoutingDecision(a, s, i, src) : void 0,
    onHandback: inner.onHandback ? (h, d) => inner.onHandback(h, d) : void 0,
    // Forward the executor-dispatch seam UNCHANGED (see withTurnRecording): an executor-dispatched
    // build turn records via the executor's wrapper, not here, so this only fires for a non-dispatched
    // navigator/driver perform turn. Preserved so recording doesn't disable executor dispatch.
    performViaExecutor: inner.performViaExecutor ? (a, s, r) => inner.performViaExecutor(a, s, r) : void 0,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver")) {
        const turn = nextBuildTurnNumber(recordBuildDir, cfg.featureId, action.story);
        const dir = recordBuildTurn({
          recordBuildDir,
          projectDir: cfg.projectDir,
          consortDir: cfg.consortDir,
          featureId: cfg.featureId,
          story: action.story,
          turn,
          role: action.role,
          ac: "ac" in action ? action.ac : void 0,
          mode: action.buildMode
        });
        process.stderr.write(
          `[record] turn ${turn}: ${action.role}${action.buildMode ? ` (${action.buildMode})` : ""}${"ac" in action && action.ac ? ` ${action.ac}` : ""} -> ${dir}
`
        );
      }
    }
  };
}
function projectCorrespondence(seq, iteration, action, state, fresh, isGate, recordDir) {
  const phase = state.phase;
  const kind = isGate ? "gate" : "author-requests";
  const supplied = fresh.filter((e) => e.event === "intake.supplied");
  const gateEv = fresh.find((e) => e.event === "gate.approved" || e.event === "gate.rejected");
  const anyRefused = fresh.some((e) => e.event === "intake.refused" || e.event === "gate.rejected");
  const violations = fresh.flatMap((e) => {
    const v = e.metadata?.violations;
    return Array.isArray(v) ? v : [];
  });
  const submitted = supplied.map((e) => {
    const md = e.metadata ?? {};
    return { artifact: md.artifact ?? "artifact", ...md.from ? { from: md.from } : {}, ...md.to ? { contentRef: md.to } : {} };
  });
  const approved = isGate ? gateEv?.event === "gate.approved" : void 0;
  const ordinal = lastRecordedOrdinal(recordDir);
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const askPrompt = isGate ? `orchestrator presents ${describeAction(action)} for HIL approval` : `orchestrator asks the PO to author the sprint's feature-requests (${describeAction(action)})`;
  const askRendered = isGate ? `**HIL approval requested** \u2013 ${describeAction(action)}` : `**PO input requested** \u2013 author the sprint's feature-requests (${describeAction(action)})`;
  const ask = {
    seq,
    direction: "orch-to-hil",
    ordinal,
    iteration,
    at,
    ...phase ? { phase } : {},
    request: { kind, prompt: askPrompt, presentation: { format: "markdown", rendered: askRendered } },
    response: { by: "orchestrator" },
    outcome: { validated: true }
  };
  const answer = {
    seq: seq + 1,
    direction: "hil-to-orch",
    ordinal,
    iteration,
    at,
    ...phase ? { phase } : {},
    request: { kind, prompt: askPrompt, presentation: { format: "markdown", rendered: askRendered } },
    response: {
      by: "human-proxy",
      ...submitted.length ? { submitted } : {},
      ...isGate ? { decision: approved ? "approved" : "rejected" } : {},
      // Presentation: the proxy's decision/submission as shown – the agent-log message lines it wrote,
      // preserved so the recorded transcript reads like the interactive exchange.
      presentation: {
        format: "markdown",
        rendered: fresh.map((e) => `- ${e.message}`).join("\n")
      }
    },
    outcome: {
      validated: !anyRefused,
      ...isGate ? { approved: !!approved } : {},
      ...violations.length ? { violations } : {}
    }
  };
  return [ask, answer];
}
function withTurnRecording(inner, cfg) {
  const external = consortEnv("RECORD_DIR")?.trim();
  const isReplay = !!consortEnv("REPLAY_DIR")?.trim() || !!consortEnv("REPLAY_BUILD_DIR")?.trim();
  if (!external && isReplay) return inner;
  const recordDir = external || cfg.consortDir;
  const snapshotContent = !!external;
  seedRecorderBaseline({ recordDir, projectDir: cfg.projectDir, consortDir: cfg.consortDir });
  let corrSeq = 3;
  let logLenBeforePerform = readAgentLog({ consortDir: cfg.consortDir }).length;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction(a, i) : void 0,
    // Routing-decision observability (diagnostic stream the turn recorder lacks): append the
    // action + the state bag that CHOSE it to routing-decisions.jsonl. Fires for EVERY iteration
    // (agent + non-agent + terminal), so "why did this turn route here" is answerable from the
    // corpus. Chains any inner hook first, then records. Gated on the same recordDir as recordTurn.
    onRoutingDecision: (a, s, i, source) => {
      inner.onRoutingDecision?.(a, s, i, source);
      recordRoutingDecision(recordDir, a, s, i, source);
    },
    onHandback: inner.onHandback ? (h, d) => inner.onHandback(h, d) : void 0,
    // Correspondence: a HIL touchpoint (author-requests / a gate) just ran on the perform path; the
    // proxy has appended its response to agent-log. Pair the orchestrator's REQUEST with the proxy's
    // fresh ANSWER/SUBMISSION + outcome, and record it as a run-level transcript entry. Non-HIL
    // actions record nothing. Delegates the inner hook first (routing observability stays intact).
    onCorrespondence(action, state, iteration) {
      inner.onCorrespondence?.(action, state, iteration);
      const isGate = isHitlGateAction(action);
      const isInput = isHumanInputAction(action);
      if (!isGate && !isInput) return;
      const after = readAgentLog({ consortDir: cfg.consortDir });
      const fresh = after.slice(logLenBeforePerform);
      const beats = projectCorrespondence(corrSeq, iteration, action, state, fresh, isGate, recordDir);
      for (const beat of beats) recordCorrespondence(recordDir, beat);
      corrSeq += beats.length;
    },
    // Forward the executor-dispatch seam UNCHANGED: an executor-dispatched turn runs THROUGH the
    // executor (whose ReplayRecorderWrapper records it, from cfg.takeTranscript) and NEVER reaches
    // perform, so this effects-level recorder only fires for the NON-dispatched (perform) turns ,
    // gates/deploy/human-proxy. Disjoint writers by construction (orchestrator-run.ts:326-330).
    // Dropping this property silently disabled the executor path under recording – the bug this fixes.
    performViaExecutor: inner.performViaExecutor ? (a, s, r) => inner.performViaExecutor(a, s, r) : void 0,
    async perform(action) {
      logLenBeforePerform = readAgentLog({ consortDir: cfg.consortDir }).length;
      await inner.perform(action);
      const transcript = takeLastAgentTranscript();
      const rec = recordTurn({ recordDir, projectDir: cfg.projectDir, consortDir: cfg.consortDir, action, step: 0, transcript, snapshotContent });
      process.stderr.write(
        `[record] turn ${rec.ordinal} (${rec.dir}): ${rec.produced.length} produced${rec.deleted.length ? `, ${rec.deleted.length} deleted` : ""}
`
      );
    }
  };
}
function gatedStopWhen(base, interactive) {
  if (!interactive) return base;
  return (a) => (base?.(a) ?? false) || isHitlGateAction(a) || isHumanInputAction(a);
}
function pendingGateOf(r) {
  return r.stoppedAtBound && r.stoppedAt && isHitlGateAction(r.stoppedAt) ? r.stoppedAt : void 0;
}
function pendingInputOf(r) {
  return r.stoppedAtBound && r.stoppedAt && isHumanInputAction(r.stoppedAt) ? r.stoppedAt : void 0;
}
function stepResultOf(r) {
  return { pendingGate: pendingGateOf(r), pendingInput: pendingInputOf(r), escalated: r.escalated, escalation: r.escalation };
}
function reportGate(gate, ctx = {}) {
  if (ctx.consortDir) {
    const surfaced = parkedGateSurfacedEvent(gate, { featureId: ctx.featureId, sprint: ctx.sprint });
    if (surfaced && !gateAlreadySurfaced(readAgentLog({ consortDir: ctx.consortDir }), gate)) {
      try {
        emitAgentLogEvent(surfaced, { consortDir: ctx.consortDir });
      } catch {
      }
    }
  }
  const trace = consortEnv("TRACE") ? `  ${JSON.stringify(gate)}` : "";
  process.stderr.write(
    `[drive] GATE awaiting human approval: ${describeAction(gate)}.${trace}
        Record your decision with:
          ${approveHint(gate, ctx)}
        then re-run to continue.
`
  );
}
function featuresWithAuthoredRequest(consortDir) {
  try {
    return fs22.readdirSync(featuresDir(consortDir), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).filter((id) => hasFeatureRequest(consortDir, id)).sort();
  } catch {
    return [];
  }
}
function proposedFeatureIds(consortDir) {
  try {
    const md = fs22.readFileSync(featureProposalsMd(consortDir), "utf8");
    return [...md.matchAll(/^##\s+(F\S+)/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}
function composeInputPause(action, sprint, consortDir) {
  const s = sprint ?? "<sprint>";
  const existing = consortDir ? featuresWithAuthoredRequest(consortDir) : [];
  const proposed = consortDir ? proposedFeatureIds(consortDir) : [];
  if (existing.length > 0) {
    const authored = new Set(existing);
    const proposedValid = proposed.filter((id) => authored.has(id));
    const mismatched = proposed.filter((id) => !authored.has(id));
    const pick = proposedValid.length ? proposedValid.join(",") : "<id[,id...]>";
    const proposedLine = proposedValid.length ? `        Planning proposed for this sprint: ${proposedValid.join(", ")} (see ${ARTIFACT_ROOT}/planning/feature-proposals.md).
` : "";
    const mismatchLine = mismatched.length ? `        NOTE: the proposal labels its items ${mismatched.join(", ")} \u2013 the Spec Author's own numbering, NOT the authored
        folder ids above. Commit by the FOLDER ids (map from the proposal's titles); do not pass the proposal's labels.
` : "";
    return `[drive] PAUSED \u2013 awaiting the Product Owner's sprint backlog. This is a DECISION, not an authoring task:
        ${existing.length} feature-request(s) are already authored (${existing.join(", ")}) \u2013 none need writing.
` + proposedLine + mismatchLine + `        COMMIT which features are in sprint "${s}" (by folder id):
          consort-sync-backlog --sprint ${s} --features ${pick}
        then re-run the drive \u2013 it advances to the (interactive) plan gate.
`;
  }
  return `[drive] PAUSED \u2013 awaiting human input (${describeAction(action)}). Nothing was approved or produced yet.
        No feature-request.md exists yet, so the Product Owner must:
          1. author the sprint's feature-request(s) at ${ARTIFACT_ROOT}/features/<id>/feature-request.md, then
          2. commit the backlog: consort-sync-backlog --sprint ${s} --features <id[,id...]>
        then re-run the drive \u2013 it will advance to the (interactive) plan gate.
`;
}
function reportInput(action, sprint, consortDir) {
  process.stderr.write(composeInputPause(action, sprint, consortDir));
}
async function runSprintMode(args) {
  const sprint = args.sprint;
  const projectDir = args.projectDir ?? process.cwd();
  const consortDir = args.consortDir ?? resolveConsortDir(projectDir);
  const lkShim = path13.join(projectDir, "scripts", "lk");
  const settings = resolveConsortSettings({ projectDir });
  const gates = effectiveGates(args, projectDir);
  const interactive = gates === "interactive";
  const skipSizing = !settings.plan.sizing;
  const recordDirForKickoff = consortEnv("RECORD_DIR")?.trim();
  if (recordDirForKickoff) {
    const cmd = `/sprint ${sprint} --gates ${gates}`;
    const by = interactive ? "human" : "human-proxy";
    const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
    const intakeCandidates = [
      { artifact: "product-overview.md", rel: "product-overview.md", ask: "a product overview \u2013 the framing + goals the features are proposed from" },
      { artifact: "nfrs.md", rel: "nfrs.md", ask: "the non-functional requirements (NFRs) the work must satisfy" },
      { artifact: "design-brief.md", rel: path13.join("design", "design-brief.md"), ask: "a design brief \u2013 the UX/visual direction for the SPA" },
      { artifact: "warehouse.png", rel: path13.join("design", "assets", "warehouse.png"), binary: true, ask: "any brand asset(s) (logo/icon) to carry into the design" }
    ];
    const resolved = intakeCandidates.map((c) => ({ ...c, abs: path13.join(consortDir, c.rel) }));
    recordCorrespondence(recordDirForKickoff, {
      seq: 0,
      direction: "hil-to-orch",
      ordinal: null,
      iteration: -1,
      at: nowIso(),
      phase: "planning",
      request: { kind: "kickoff", prompt: cmd, presentation: { format: "markdown", rendered: `\`${cmd}\`` } },
      response: { by, presentation: { format: "markdown", rendered: `Starting sprint \`${sprint}\`.` } },
      outcome: { validated: true }
    });
    const questions = resolved.map((c, i) => `${i + 1}. ${c.ask} (\`${c.rel}\`)`).join("\n");
    const askPrompt = `To plan this sprint I need the project intake. Please provide:
${questions}

Place each under the project's \`.consort/\`; I will read them as the proposal + design inputs.`;
    recordCorrespondence(recordDirForKickoff, {
      seq: 1,
      direction: "orch-to-hil",
      ordinal: null,
      iteration: -1,
      at: nowIso(),
      phase: "planning",
      request: { kind: "intake", prompt: askPrompt, presentation: { format: "markdown", rendered: askPrompt } },
      response: { by: "orchestrator" },
      outcome: { validated: true }
    });
    const intakeCopyDir = path13.join(recordDirForKickoff, "intake");
    const submitted = resolved.filter((c) => fs22.existsSync(c.abs)).map((c) => {
      const dest = path13.join(intakeCopyDir, c.rel);
      try {
        fs22.mkdirSync(path13.dirname(dest), { recursive: true });
        fs22.copyFileSync(c.abs, dest);
      } catch {
      }
      return { artifact: c.artifact, contentRef: path13.join("intake", c.rel), ...c.binary ? { binary: true } : {} };
    });
    recordCorrespondence(recordDirForKickoff, {
      seq: 2,
      direction: "hil-to-orch",
      ordinal: null,
      iteration: -1,
      at: nowIso(),
      phase: "planning",
      request: { kind: "intake", prompt: "Intake for the sprint.", presentation: { format: "markdown", rendered: "Submitting project intake." } },
      response: {
        by,
        ...submitted.length ? { submitted } : {},
        presentation: {
          format: "markdown",
          rendered: submitted.length ? submitted.map((s) => `- INTAKE supplied ${s.artifact}`).join("\n") : "(no intake artifacts on disk)"
        }
      },
      outcome: { validated: submitted.length > 0 }
    });
  }
  const telemetry = beginTelemetryRun({
    command: args.planOnly ? "plan" : "sprint",
    onNotice: (m) => process.stderr.write(m)
  });
  const effects = {
    async drivePlanning() {
      const cfg = buildCfg(args, "");
      cfg.runner = execRunner(cfg);
      cfg.sprintName = sprint;
      snapshotRunConfig(cfg, "plan", gates);
      cfg.readFreshDriveState = () => deriveSprintPlanningState(consortDir, sprint, { skipSizing });
      const planning = {
        ...buildDriveEffects(cfg),
        // Sizing is ON by default; --no-sizing (or config plan.sizing:false) opts out.
        readState: async () => deriveSprintPlanningState(consortDir, sprint, { skipSizing })
      };
      const base = driverBoundOptions("plan");
      const r = await runDriver(withTelemetry(withTurnRecording(planning, cfg), telemetry), {
        ...base,
        stopWhen: gatedStopWhen(base.stopWhen, interactive)
      });
      return stepResultOf(r);
    },
    async readBacklog() {
      return backlogFeatureIds(readBacklog(consortDir, sprint));
    },
    async commitAndPushRequests() {
      const root = path13.basename(consortDir);
      for (const id of backlogFeatureIds(readBacklog(consortDir, sprint))) {
        await spawnCmd("git", ["add", "--", `${root}/features/${id}/feature-request.md`], projectDir).catch(() => void 0);
      }
      await spawnCmd("git", ["commit", "-m", `plan: ${sprint} feature-requests`], projectDir).catch(() => void 0);
      await spawnCmd("git", ["push", "origin", "HEAD"], projectDir);
    },
    async isFeatureShipped(featureId) {
      try {
        const { action } = await planNextAction(buildCfg(args, featureId));
        if (action.kind === "done") return true;
        const scm = (0, import_lakebase12.readWorkflowState)(projectDir);
        const backlog = backlogFeatureIds(readBacklog(consortDir, sprint));
        if (shippedBecauseLaterFeatureClaimed(featureId, scm?.feature_id, backlog)) return true;
        return shippedByClearedClaim(scm?.feature_id, deriveFeaturePhase(summarizeStories(consortDir, featureId)));
      } catch {
        return false;
      }
    },
    async claimFeature(featureId) {
      await spawnCmd(lkShim, ["lakebase-scm-claim-feature-branch", featureId, "--project-dir", projectDir, "--json"], projectDir);
    },
    async driveFeature(featureId) {
      const cfg = buildCfg(args, featureId);
      resetStaleTerminalPhase(cfg.consortDir);
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, "full", gates);
      const r = await runDriver(withTelemetry(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), telemetry), {
        stopWhen: gatedStopWhen(void 0, interactive)
      });
      return stepResultOf(r);
    },
    onFeature: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f}
`),
    onSkip: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f} \u2013 already shipped, skipping
`)
  };
  const runBody = async () => {
    if (args.planOnly) {
      try {
        const planning = await effects.drivePlanning();
        if (planning.pendingGate) {
          reportGate(planning.pendingGate, { sprint, consortDir });
          return 0;
        }
        if (planning.pendingInput) {
          reportInput(planning.pendingInput, sprint, consortDir);
          return 2;
        }
        process.stderr.write(`[plan] ${sprint} planning complete (plan gate approved)
`);
        return 0;
      } catch (err) {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
        return 1;
      }
    }
    try {
      const result = await runSprint(effects);
      if (result.escalated) {
        const e = result.escalation;
        const on = result.pendingFeature ? ` on ${result.pendingFeature}` : "";
        process.stderr.write(
          `[sprint] RAISED TO HIL${on} \u2013 halting sprint ${sprint}.
` + (e?.source ? `        source: ${e.source}
` : "") + (e?.reason ? `        reason: ${e.reason}
` : "") + `        recorded under ${path13.basename(consortDir)}/escalations/ ; once the root cause is fixed, clear it with \`consort-resolve-escalation\` (keeps the record \u2013 do NOT rm it), then re-run to resume.
        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose
`
        );
        return 3;
      }
      if (result.pendingGate) {
        if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}
`);
        reportGate(result.pendingGate, { sprint, featureId: result.pendingFeature, consortDir });
        return 0;
      }
      if (result.pendingInput) {
        if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}
`);
        reportInput(result.pendingInput, sprint, consortDir);
        return 2;
      }
      process.stderr.write(`[sprint] ${sprint} complete: ${result.features.length} feature(s)
`);
      return 0;
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
      return 1;
    }
  };
  let code = 1;
  try {
    code = await runBody();
  } finally {
    const outcome = outcomeForExit(code);
    try {
      telemetry.finish({ outcome, exit_code: code });
    } catch {
    }
    const recordingOrReplaying = !!consortEnv("REPLAY_DIR") || !!consortEnv("REPLAY_BUILD_DIR") || !!consortEnv("RECORD_BUILD_DIR") || !!consortEnv("RECORD_DIR");
    if (!recordingOrReplaying) {
      try {
        const claimed = (0, import_lakebase12.readWorkflowState)(projectDir)?.feature_id?.trim();
        if (claimed) {
          emitNextJson(consortDir, claimed, projectDir, { version: kitVersion2() });
        } else {
          const snap = buildNextSnapshot(
            "sprint",
            deriveSprintPlanningState(consortDir, sprint, { skipSizing }),
            { sprint, version: kitVersion2() }
          );
          fs22.mkdirSync(consortDir, { recursive: true });
          fs22.writeFileSync(path13.join(consortDir, "next.json"), JSON.stringify(snap, null, 2) + "\n", "utf8");
        }
      } catch {
      }
    }
  }
  return code;
}
function effectiveGates(args, projectDir) {
  const flag = args.gates;
  return flag ?? resolveConsortSettings({ projectDir }).project.gates;
}
function hasNonInteractiveSignal() {
  return consortEnv("AUTO_CONTINUE") === "1" || /^(1|true)$/i.test(process.env.CI ?? "");
}
function snapshotRunConfig(cfg, bound, gates) {
  writeRunConfig({
    projectDir: cfg.projectDir,
    consortDir: cfg.consortDir,
    bound,
    // Run-scoped effective gate mode (--gates override else project policy),
    // recorded here so the snapshot is where the run-scoped choice lives – the
    // flag never persists into consort-config.json.
    gates,
    uiTrack: cfg.uiTrack,
    buildSessionScope: cfg.buildSessionScope,
    reviewEffort: cfg.reviewEffort,
    deployTarget: cfg.deployTarget,
    // loop + batchCap from the resolved settings (single source), so the snapshot
    // records what the drive actually used, never a stale env value.
    loopGranularity: cfg.loopGranularity,
    batchCap: cfg.batchCap,
    modelForRole: cfg.modelForRole ?? (() => "inherit")
  });
}
function relaunchDetached2(rawArgv, consortDir) {
  const pid = relaunchDetached(
    rawArgv.filter((a) => a !== "--detach"),
    { stdio: "ignore" }
  );
  if (pid === null) return null;
  const logPath = path13.join(consortDir, "drive-live.log");
  process.stdout.write(
    `consort-drive: detached into its own session as pid ${pid} (survives this turn/shell).
  live log: ${logPath}
  relay it:  ./scripts/lk consort-watch --since 0 --pid ${pid}   (then re-poll with the printed cursor)
`
  );
  return pid;
}
function teeStderrToDriveLog(consortDir) {
  try {
    fs22.mkdirSync(consortDir, { recursive: true });
    const fd = fs22.openSync(path13.join(consortDir, "drive-live.log"), "w");
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk, enc, cb) => {
      try {
        fs22.writeSync(fd, chunk);
      } catch {
      }
      return orig(chunk, enc, cb);
    });
  } catch {
  }
}
async function main() {
  exportConsortVersionEnv();
  const rawArgv = process.argv.slice(2);
  const args = parseArgs(rawArgv);
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  if (rawArgv.includes("--detach")) {
    const cdir = args.consortDir ?? resolveConsortDir(args.projectDir ?? process.cwd());
    const pid = relaunchDetached2(rawArgv, cdir);
    if (pid !== null) return 0;
    process.stderr.write("consort-drive: detach re-spawn failed \u2013 running in-process instead.\n");
  }
  if (!args.consortDir) {
    const projectDir = args.projectDir ?? process.cwd();
    const m = migrateLegacyArtifactDir(projectDir);
    if (m.migrated) {
      process.stderr.write(
        `consort-drive: migrated legacy ${LEGACY_ARTIFACT_ROOT}/ to ${ARTIFACT_ROOT}/ (via ${m.via}).
`
      );
    }
  }
  teeStderrToDriveLog(args.consortDir ?? resolveConsortDir(args.projectDir ?? process.cwd()));
  applyProjectOverrides(args.projectDir ?? process.cwd(), {
    deployTarget: args.deployTarget,
    sizing: args.noSizing === true ? false : void 0
  });
  {
    const pd = args.projectDir ?? process.cwd();
    const launchRef = resolveLaunchKitRef(pd, process.env);
    if (launchRef) {
      const drift = kitRefDriftWarning(pd, launchRef);
      if (drift) process.stderr.write(`consort-drive: ${drift}
`);
      const r = pinRunKitRef(pd, launchRef);
      if (r.pinned) {
        process.stderr.write(
          `consort-drive: pinned kit-ref '${launchRef}' to .lakebase/kit-ref.local for this run` + (r.previous ? ` (was '${r.previous}')` : "") + `.
`
        );
      }
    }
  }
  if (effectiveGates(args, args.projectDir ?? process.cwd()) === "proxy" && !hasNonInteractiveSignal()) {
    process.stderr.write(
      `consort-drive: gate mode 'proxy' (Human Proxy approves headlessly) requires an explicit
non-interactive signal (LAKEBASE_CONSORT_AUTO_CONTINUE=1 or CI). Refusing to bypass HITL in an
interactive/dev context. Unset LAKEBASE_CONSORT_HUMAN_PROXY, or pass --gates interactive.
`
    );
    return 2;
  }
  const inReplayLane = !!(consortEnv("REPLAY_DIR") || consortEnv("REPLAY_BUILD_DIR"));
  if (!inReplayLane && consortEnv("SKIP_AUTH_PREFLIGHT") !== "1") {
    const auth = await driveAuthPreflight();
    if (!auth.ok) {
      process.stderr.write(
        `consort-drive: Databricks auth preflight FAILED \u2013 halting before any agent spawn.
${auth.message}
`
      );
      return 2;
    }
  }
  if (args.sprint && !args.feature) {
    return runSprintMode(args);
  }
  if (!args.feature) {
    process.stderr.write(`consort-drive: --feature is required.

${help()}`);
    return 2;
  }
  let bound;
  if (args.planOnly) bound = "plan";
  if (args.only) {
    if (!["design", "build", "deploy"].includes(args.only)) {
      process.stderr.write(`consort-drive: --only must be design|build|deploy (got "${args.only}").
`);
      return 2;
    }
    bound = args.only;
  }
  const boundOpts = bound ? driverBoundOptions(bound) : {};
  let pauseMilestone;
  if (args.pauseBefore) {
    if (!["navigator", "release-engineer"].includes(args.pauseBefore)) {
      process.stderr.write(
        `consort-drive: --pause-before must be navigator|release-engineer (got "${args.pauseBefore}").
`
      );
      return 2;
    }
    pauseMilestone = args.pauseBefore;
  }
  const pauseBefore = pauseMilestone ? pauseBeforeMilestone(pauseMilestone) : void 0;
  const confirmContinue = pauseMilestone ? makeConfirmContinue() : void 0;
  const cfg = buildCfg(args, args.feature);
  {
    const scm = (0, import_lakebase12.readWorkflowState)(cfg.projectDir);
    if ((0, import_lakebase12.isForeignFeatureClaim)(scm, cfg.featureId)) {
      process.stderr.write(
        `consort-drive: refusing to drive "${cfg.featureId}" \u2013 the SCM workflow state records a
DIFFERENT feature "${scm?.feature_id}" (branch ${scm?.branch ?? "?"}). Driving now would fork the
experiment from the wrong branch and commit build output onto it. Claim this feature first
(lakebase-scm-claim-feature-branch ${cfg.featureId}), or reconcile the prior out-of-band feature,
then re-run.
`
      );
      return 2;
    }
  }
  resetStaleTerminalPhase(cfg.consortDir);
  if (args.dryRun) {
    const plan = await planNextAction(cfg, boundOpts.transition);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }
  cfg.runner = execRunner(cfg);
  const gates = effectiveGates(args, cfg.projectDir);
  snapshotRunConfig(cfg, bound ?? "full", gates);
  const interactive = gates === "interactive";
  const featureDriveCommand = () => {
    try {
      return commandForFeaturePhase(deriveFeaturePhase(summarizeStories(cfg.consortDir, cfg.featureId)));
    } catch {
      return "build";
    }
  };
  const telemetry = beginTelemetryRun({
    command: bound ?? featureDriveCommand(),
    onNotice: (m) => process.stderr.write(m)
  });
  let result;
  const exitCode = await (async () => {
    try {
      result = await runDriver(
        withTelemetry(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), telemetry),
        {
          maxSteps: args.maxSteps,
          transition: boundOpts.transition,
          stopWhen: gatedStopWhen(boundOpts.stopWhen, interactive),
          pauseBefore,
          confirmContinue
        }
      );
      const pendingGate = pendingGateOf(result);
      const pendingInput = pendingInputOf(result);
      if (result.escalated) {
        const e = result.escalation;
        process.stderr.write(
          `[drive] RAISED TO HIL after ${result.iterations} actions \u2013 awaiting HIL decision.
        source: ${e?.source}
        reason: ${e?.reason}
        recorded under ${path13.basename(cfg.consortDir)}/escalations/ ; once the root cause is fixed, clear it with \`consort-resolve-escalation\` (keeps the record \u2013 do NOT rm it), then re-run to resume.
        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose
`
        );
        return 3;
      } else if (result.stoppedAtMax) {
        process.stderr.write(`[drive] stopped at --max-steps ${args.maxSteps} (${result.iterations} actions)
`);
      } else if (pendingGate) {
        reportGate(pendingGate, { featureId: cfg.featureId, featureBranch: cfg.featureBranch, consortDir: cfg.consortDir });
      } else if (pendingInput) {
        reportInput(pendingInput, cfg.sprintName, cfg.consortDir);
        return 2;
      } else if (result.stoppedAtBound) {
        const label = bound ?? "phase";
        process.stderr.write(
          result.iterations === 0 ? `[drive] ${label} already complete (0 actions, nothing to do; the per-story pipeline already carried it out)
` : `[drive] ${label} complete in ${result.iterations} actions (bounded)
`
        );
      } else {
        process.stderr.write(`[drive] done in ${result.iterations} actions
`);
      }
      return 0;
    } catch (err) {
      if (err instanceof ProtocolViolationError) {
        const h = err.handoff;
        try {
          writeEscalation(cfg.consortDir, {
            source: `protocol:${h.responder}`,
            reason: err.message,
            feature_id: cfg.featureId,
            ...h.story ? { story_id: h.story } : {}
          });
          emitAgentLogEvent(
            {
              role: "orchestrator",
              level: "error",
              event: "escalation.raised",
              feature_id: cfg.featureId,
              slots: { source: `protocol:${h.responder}`, reason: err.message, ...h.story ? { story: h.story } : {} }
            },
            { consortDir: cfg.consortDir }
          );
        } catch {
        }
        process.stderr.write(`[drive] ${err.message}
        recorded under ${path13.basename(cfg.consortDir)}/escalations/ ; fix the responder, then re-run.
`);
        return 3;
      }
      if (err instanceof UnexpectedCallbackError) {
        try {
          writeEscalation(cfg.consortDir, {
            source: `protocol:unexpected-caller:${err.from}`,
            reason: err.message,
            feature_id: cfg.featureId,
            ...err.scope.story ? { story_id: err.scope.story } : {}
          });
          emitAgentLogEvent(
            {
              role: "orchestrator",
              level: "error",
              event: "escalation.raised",
              feature_id: cfg.featureId,
              slots: { source: `protocol:unexpected-caller:${err.from}`, reason: err.message, ...err.scope.story ? { story: err.scope.story } : {} }
            },
            { consortDir: cfg.consortDir }
          );
        } catch {
        }
        process.stderr.write(`[drive] ${err.message}
        recorded under ${path13.basename(cfg.consortDir)}/escalations/ ; resolve it, then re-run.
`);
        return 3;
      }
      if (err instanceof CliEffectError) {
        const reason = `${err.bin} exited ${err.code}. See the drive log above for the failing checks / cause; fix them (push to the branch) and re-run.`;
        const captured_output = err.capturedOutput;
        try {
          writeEscalation(cfg.consortDir, { source: `cli:${err.bin}`, reason, feature_id: cfg.featureId, captured_output });
          emitAgentLogEvent(
            {
              role: "orchestrator",
              level: "error",
              event: "escalation.raised",
              feature_id: cfg.featureId,
              slots: { source: `cli:${err.bin}`, reason }
            },
            { consortDir: cfg.consortDir }
          );
        } catch {
        }
        process.stderr.write(
          `[drive] RAISED TO HIL \u2013 ${err.bin} failed.
        reason: ${reason}
` + (captured_output ? `        failing output (tail):
${captured_output.split("\n").map((l) => "        | " + l).join("\n")}
` : "") + `        recorded under ${path13.basename(cfg.consortDir)}/escalations/ ; once the root cause is fixed, clear it with \`consort-resolve-escalation\` (keeps the record \u2013 do NOT rm it), then re-run to resume.
        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose
`
        );
        return 3;
      }
      if (err instanceof RouteContractError) {
        const story = "story" in err.action && typeof err.action.story === "string" ? err.action.story : void 0;
        const source = `route-contract:${err.event}`;
        try {
          writeEscalation(cfg.consortDir, {
            source,
            reason: err.message,
            feature_id: cfg.featureId,
            ...story ? { story_id: story } : {}
          });
          emitAgentLogEvent(
            {
              role: "orchestrator",
              level: "error",
              event: "escalation.raised",
              feature_id: cfg.featureId,
              slots: { source, reason: err.message, ...story ? { story } : {} }
            },
            { consortDir: cfg.consortDir }
          );
        } catch {
        }
        process.stderr.write(
          `[drive] RAISED TO HIL \u2013 route-contract check refused a mis-fired turn before dispatch.
        reason: ${err.message}
        recorded under ${path13.basename(cfg.consortDir)}/escalations/ ; fix the route or the producer, then clear it with \`consort-resolve-escalation\` (keeps the record \u2013 do NOT rm it) and re-run to resume.
        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose
`
        );
        return 3;
      }
      if (err instanceof ReplayCorpusMissError) {
        process.stderr.write(`${err.message}
`);
        return 2;
      }
      if (err instanceof ArtifactOutOfRootError) {
        process.stderr.write(`[drive] ${err.message}
`);
        return 3;
      }
      process.stderr.write(
        `[drive] ABORTED \u2013 unexpected error: ${err instanceof Error ? err.message : String(err)}
        To troubleshoot or share the failure, bundle the local forensics: consort-diagnose
`
      );
      return 1;
    }
  })();
  try {
    telemetry.finish({ outcome: outcomeForExit(exitCode), exit_code: exitCode });
  } catch {
  }
  const recordingOrReplaying = !!consortEnv("REPLAY_DIR") || !!consortEnv("REPLAY_BUILD_DIR") || !!consortEnv("RECORD_BUILD_DIR") || !!consortEnv("RECORD_DIR");
  if (cfg.featureId && !recordingOrReplaying) {
    emitNextJson(cfg.consortDir, cfg.featureId, cfg.projectDir, {
      uiTrack: cfg.uiTrack,
      version: kitVersion2(),
      ...cfg.featureBranch ? { featureBranch: cfg.featureBranch } : {}
    });
  }
  return exitCode;
}
if ((0, import_util4.isCliEntry)(importMetaUrl)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
      process.exit(1);
    }
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  composeInputPause
});
