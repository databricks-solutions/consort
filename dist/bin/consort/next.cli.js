#!/usr/bin/env node
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

// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var getFilename, getDirname, __dirname;
var init_esm_shims = __esm({
  "node_modules/tsup/assets/esm_shims.js"() {
    "use strict";
    getFilename = () => fileURLToPath(import.meta.url);
    getDirname = () => path.dirname(getFilename());
    __dirname = /* @__PURE__ */ getDirname();
  }
});

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
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
    exports.Name = Name;
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
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
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
    exports.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
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
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
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
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
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
    exports.Scope = Scope;
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
    exports.ValueScopeName = ValueScopeName;
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
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
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
    exports.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
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
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
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
    exports.CodeGen = CodeGen;
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
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
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
  "node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
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
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
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
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
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
    exports.extendErrors = extendErrors;
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
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
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
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
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
  "node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
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
    exports.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
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
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
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
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
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
    exports.checkDataType = checkDataType;
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
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
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
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
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
    exports.assignDefaults = assignDefaults;
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
  "node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
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
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
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
    exports.callValidateCode = callValidateCode;
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
    exports.usePattern = usePattern;
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
    exports.validateArray = validateArray;
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
    exports.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
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
    exports.macroKeywordCode = macroKeywordCode;
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
    exports.funcKeywordCode = funcKeywordCode;
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
    exports.validSchemaType = validSchemaType;
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
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
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
    exports.getSubschema = getSubschema;
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
    exports.extendSubschemaData = extendSubschemaData;
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
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    init_esm_shims();
    module.exports = function equal(a, b) {
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
  "node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    init_esm_shims();
    var traverse = module.exports = function(schema, opts, cb) {
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
  "node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
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
    exports.inlineRef = inlineRef;
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
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
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
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
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
    exports.validateFunctionCode = validateFunctionCode;
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
    exports.KeywordCxt = KeywordCxt;
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
    exports.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
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
    exports.SchemaEnv = SchemaEnv;
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
    exports.compileSchema = compileSchema;
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
    exports.resolveRef = resolveRef;
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
    exports.getCompilingSchema = getCompilingSchema;
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
    exports.resolveSchema = resolveSchema;
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
  "node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
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
  "node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    init_esm_shims();
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
    function removeDotSegments(path13) {
      let input = path13;
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
    module.exports = {
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
  "node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    init_esm_shims();
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
        const [path13, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path13 && path13 !== "/" ? path13 : void 0;
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
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    init_esm_shims();
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
    function resolveComponent(base, relative6, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative6 = parse(serialize(relative6, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative6.scheme) {
        target.scheme = relative6.scheme;
        target.userinfo = relative6.userinfo;
        target.host = relative6.host;
        target.port = relative6.port;
        target.path = removeDotSegments(relative6.path || "");
        target.query = relative6.query;
      } else {
        if (relative6.userinfo !== void 0 || relative6.host !== void 0 || relative6.port !== void 0) {
          target.userinfo = relative6.userinfo;
          target.host = relative6.host;
          target.port = relative6.port;
          target.path = removeDotSegments(relative6.path || "");
          target.query = relative6.query;
        } else {
          if (!relative6.path) {
            target.path = base.path;
            if (relative6.query !== void 0) {
              target.query = relative6.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative6.path[0] === "/") {
              target.path = removeDotSegments(relative6.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative6.path;
              } else if (!base.path) {
                target.path = relative6.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative6.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative6.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative6.fragment;
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
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
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
    exports.default = Ajv2;
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
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
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
    exports.getValidate = getValidate;
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
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
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
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
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
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
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
      error: exports.error,
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
    exports.validatePropertyDeps = validatePropertyDeps;
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
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft7.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = draft7Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
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
    exports.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports, module) {
    module.exports = {
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
  "node_modules/ajv/dist/ajv.js"(exports, module) {
    "use strict";
    init_esm_shims();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
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
    exports.Ajv = Ajv2;
    module.exports = exports = Ajv2;
    module.exports.Ajv = Ajv2;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv2;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// bin/consort/next.cli.ts
init_esm_shims();

// consort/config/consort-paths.ts
init_esm_shims();
import * as fs from "fs";
import { join } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
var artifactRootsRegexAlternation = () => ALL_ARTIFACT_ROOTS.map((r) => r.replace(/[.]/g, "\\.")).join("|");
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join(tdd, "features");
var planningDir = (tdd) => join(tdd, "planning");
var sprintsDir = (tdd) => join(tdd, "sprints");
var cyclesRootDir = (tdd) => join(tdd, "cycles");
var escalationsDir = (tdd) => join(tdd, "escalations");
var acReviewJson = (tdd, f, s, ac) => join(cyclesRootDir(tdd), f, s, ac, "review.json");
var storyReviewJson = (tdd, f, s) => join(cyclesRootDir(tdd), f, s, "review.json");
var workflowStateJson = (tdd) => join(tdd, "workflow-state.json");
var productOverviewMd = (tdd) => join(tdd, "product-overview.md");
var nfrsMd = (tdd) => join(tdd, "nfrs.md");
var intakeReadyOnDisk = (tdd) => fs.existsSync(productOverviewMd(tdd)) && fs.existsSync(nfrsMd(tdd));
var intakeApprovedMarker = (tdd) => join(tdd, "intake", "approved");
var intakeApprovedOnDisk = (tdd) => fs.existsSync(intakeApprovedMarker(tdd));
var designDir = (tdd) => join(tdd, "design");
var designGuideJson = (tdd) => join(designDir(tdd), "design-guide.json");
var architectureDir = (tdd) => join(tdd, "architecture");
var architectureCanonJson = (tdd) => join(architectureDir(tdd), "canon.json");
var featureProposalsMd = (tdd) => join(planningDir(tdd), "feature-proposals.md");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => join(featureResolved(tdd, f), "feature-spec.json");
var featureRequestMd = (tdd, f) => join(featureResolved(tdd, f), "feature-request.md");
var architectureJson = (tdd, f) => join(featureResolved(tdd, f), "architecture.json");
var dbDesignJson = (tdd, f) => join(featureResolved(tdd, f), "db-design.json");
var pipelineJson = (tdd, f) => join(featureResolved(tdd, f), "pipeline.json");
var featureDeployEvidenceJson = (tdd, f) => join(featureResolved(tdd, f), "deploy-evidence.json");
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => join(storyResolved(tdd, f, s), "acs");
var acJson = (tdd, f, s, ac) => join(acsDir(tdd, f, s), `${ac}.json`);
var storyTestListJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "test-list-per-story.json");
var reflectVerdictJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "reflect-verdict.json");
var cycleDir = (tdd, f, s, ac) => join(cyclesRootDir(tdd), f, s, ac);
var sprintDir = (tdd, sprint) => join(sprintsDir(tdd), sprint);
var sprintGatesJson = (tdd, sprint) => join(sprintDir(tdd, sprint), "gates.json");
var backlogJson = (tdd, sprint) => join(sprintDir(tdd, sprint), "backlog.json");
var sprintRequestedJson = (tdd, sprint) => join(sprintDir(tdd, sprint), "requested.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
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
          const obj = JSON.parse(fs.readFileSync(join(dir, file), "utf8"));
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
var planningEstimatesJson = (tdd) => join(planningDir(tdd), "estimates.json");
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

// consort/orchestrator/settings/project-settings.ts
init_esm_shims();

// consort/config/consort-config-file.ts
init_esm_shims();
import { existsSync as existsSync3, readFileSync as readFileSync3, mkdirSync as mkdirSync3, writeFileSync as writeFileSync3 } from "fs";
import { dirname as dirname2, join as join3 } from "path";

// consort/config/agent-models.ts
init_esm_shims();
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "fs";
import { dirname, join as join2 } from "path";
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
var AGENT_CONFIG_REL = join2(".lakebase", "agent-config.json");
function readAgentConfig(projectDir) {
  const p = join2(projectDir, AGENT_CONFIG_REL);
  if (!existsSync2(p)) return void 0;
  return JSON.parse(readFileSync2(p, "utf8"));
}

// consort/config/consort-config-file.ts
var CONSORT_CONFIG_REL = join3(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  join3(".lakebase", "sftdd-config.json"),
  join3(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function loadConsortConfig(projectDir) {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = join3(projectDir, rel);
    if (!existsSync3(f)) continue;
    try {
      return JSON.parse(readFileSync3(f, "utf8"));
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

// consort/orchestrator/steps/manifest.ts
init_esm_shims();
import { readFileSync as readFileSync5, readdirSync as readdirSync2, existsSync as existsSync5 } from "fs";
import { join as join5 } from "path";

// consort/orchestrator/validators/schema-loader.ts
init_esm_shims();
var import_ajv = __toESM(require_ajv(), 1);
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "fs";
import { join as join4 } from "path";
function resolveSchemaDir() {
  const direct = join4(__dirname, "..", "..", "config", "schemas");
  if (existsSync4(direct)) return direct;
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const cand = join4(dir, "consort", "config", "schemas");
    if (existsSync4(cand)) return cand;
    const parent = join4(dir, "..");
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
  return JSON.parse(readFileSync4(join4(SCHEMA_DIR, name), "utf8"));
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

// consort/orchestrator/drive/turn-key.ts
init_esm_shims();
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

// consort/orchestrator/drive/orchestrator-effects.ts
init_esm_shims();
import * as fs17 from "fs";
import { dirname as dirname21, join as join38 } from "path";

// consort/orchestrator/drive/orchestrator-drive.ts
init_esm_shims();

// consort/orchestrator/workflow/workflow-vocabulary.ts
init_esm_shims();
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

// consort/orchestrator/drive/executor-dispatch.ts
init_esm_shims();
import * as fs10 from "fs";
import { join as join22, relative as relative3 } from "path";

// consort/orchestrator/turns/step-executor.ts
init_esm_shims();
import { existsSync as existsSync6 } from "fs";
import { join as join6 } from "path";

// consort/orchestrator/steps/step-contract.ts
init_esm_shims();

// consort/orchestrator/provisioning/channels.ts
init_esm_shims();

// consort/orchestrator/steps/step.ts
init_esm_shims();
import { join as join9 } from "path";
import { existsSync as existsSync8 } from "fs";

// consort/orchestrator/validators/conformance/validator-registry.ts
init_esm_shims();
import { readFileSync as readFileSync6, existsSync as existsSync7, statSync as statSync2, readdirSync as readdirSync3 } from "fs";
import { join as join8 } from "path";

// consort/orchestrator/validators/conformance/artifact-conformance.ts
init_esm_shims();
import { join as join7, basename, dirname as dirname3 } from "path";
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
function canonicalArtifactName(path13) {
  const base = basename(path13);
  if (basename(dirname3(path13)) === "acs" && base.endsWith(".json")) return "ac.json";
  return base;
}

// consort/orchestrator/validators/conformance/validator-registry.ts
function conformsTo(artifactName) {
  return (producedPath) => {
    let content;
    try {
      content = readFileSync6(producedPath, "utf8");
    } catch {
      return { ok: false, violations: [`${artifactName} not readable at ${producedPath}`] };
    }
    const conf = checkArtifactConformance(artifactName, content);
    return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
  };
}
var acConformant = conformsTo("ac.json");
var architectureConformant = conformsTo("architecture.json");
var dbDesignConformant = conformsTo("db-design.json");
var testListConformant = conformsTo("test-list.json");
var productOverviewConformant = conformsTo("product-overview.md");
var nfrsConformant = conformsTo("nfrs.md");
var designBriefConformant = conformsTo("design-brief.md");

// consort/orchestrator/steps/turn-events.ts
init_esm_shims();

// consort/orchestrator/agents/agent-catalogue.ts
init_esm_shims();
import { join as join20 } from "path";
import { readFileSync as readFileSync16, writeFileSync as writeFileSync11, existsSync as existsSync19 } from "fs";

// consort/orchestrator/agents/claude-step-agent.ts
init_esm_shims();
import { randomUUID as randomUUID2 } from "crypto";

// consort/orchestrator/drive/claude-runner.ts
init_esm_shims();
import { spawn, execFileSync } from "child_process";

// consort/config/consort-env.ts
init_esm_shims();
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

// consort/setup/project-consort-setup.ts
init_esm_shims();
import * as fs6 from "fs";
import * as path6 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// consort/lakebase/adopt-consort.ts
init_esm_shims();
import * as fs2 from "fs";
import * as path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// consort/lakebase/update-agents.ts
init_esm_shims();
import * as fs3 from "fs";
import * as path3 from "path";

// consort/lakebase/upgrade.ts
init_esm_shims();
import * as fs5 from "fs";
import * as path5 from "path";
import { spawnSync } from "child_process";

// consort/config/kit-ref.ts
init_esm_shims();
import { existsSync as existsSync11, readFileSync as readFileSync9, writeFileSync as writeFileSync5, mkdirSync as mkdirSync6 } from "fs";
import { dirname as dirname6, join as join12 } from "path";

// consort/lakebase/update-commands.ts
init_esm_shims();
import * as fs4 from "fs";
import * as path4 from "path";

// consort/lakebase/upgrade.ts
import { enableE2eForProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
var AGENT_SYNC_MARKER = path5.join(".claude", "agents", ".kit-version");

// consort/setup/project-consort-setup.ts
var __dirname2 = path6.dirname(fileURLToPath3(import.meta.url));
var AGENT_SYNC_MARKER2 = path6.join(".claude", "agents", ".kit-version");

// consort/orchestrator/drive/claude-runner.ts
import { randomUUID } from "crypto";
import * as fs9 from "fs";
import * as path8 from "path";
import * as readline from "readline";

// consort/logging/replay-artifacts.ts
init_esm_shims();

// consort/logging/replay-build.ts
init_esm_shims();
var SCAFFOLD_OWNED = /* @__PURE__ */ new Set([
  ".git",
  ...ALL_ARTIFACT_ROOTS,
  ".lakebase",
  "scripts",
  ".claude",
  ".github",
  "node_modules"
]);

// consort/logging/agent-log.ts
init_esm_shims();

// consort/logging/agent-log-events.ts
init_esm_shims();
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

// consort/gates/workflow-phase.ts
init_esm_shims();
import * as fs7 from "fs";
var PHASE_OWNER_KEY = "phase_feature_id";

// consort/session/claude-usage.ts
init_esm_shims();

// consort/session/context-budget.ts
init_esm_shims();

// consort/logging/orchestrator-logging.ts
init_esm_shims();
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
function storyOf(action) {
  return "story" in action ? action.story : void 0;
}
function orchestratorLogEvents(action, ctx = {}) {
  const feature_id = ctx.featureId;
  const story = storyOf(action);
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

// consort/config/kit-bin.ts
init_esm_shims();
import { spawnSync as spawnSync2 } from "child_process";
import * as fs8 from "fs";
import * as path7 from "path";
var kitRootCache;
function resolveKitRoot() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs8.existsSync(path7.join(env, "package.json")) ? env : path7.resolve(__dirname, "..", "..", "..");
  return kitRootCache;
}
function kitVersion() {
  try {
    const pkg = JSON.parse(fs8.readFileSync(path7.join(resolveKitRoot(), "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

// consort/orchestrator/drive/claude-runner.ts
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/setup/stray-artifact-recovery.ts
init_esm_shims();
import { existsSync as existsSync17, mkdirSync as mkdirSync11, cpSync as cpSync3, rmSync as rmSync2, readdirSync as readdirSync9, statSync as statSync4 } from "fs";
import { join as join17, dirname as dirname11, basename as basename2 } from "path";

// consort/orchestrator/turns/turn-monitor.ts
init_esm_shims();

// consort/orchestrator/drive/claude-runner.ts
var MAX_TRANSIENT_RETRIES = Number(consortEnv("MAX_TRANSIENT_RETRIES") ?? "5");
var TRANSIENT_BACKOFF_MS = Number(consortEnv("TRANSIENT_BACKOFF_MS") ?? "5000");
var TURN_INACTIVITY_TIMEOUT_MS = Number(consortEnv("TURN_INACTIVITY_TIMEOUT_MS") ?? String(10 * 60 * 1e3));
var TURN_HEARTBEAT_MS = Number(consortEnv("TURN_HEARTBEAT_MS") ?? String(60 * 1e3));

// consort/orchestrator/agents/mock-replay-agent.ts
init_esm_shims();
import { readFileSync as readFileSync15, writeFileSync as writeFileSync10, existsSync as existsSync18, mkdirSync as mkdirSync13, cpSync as cpSync4, readdirSync as readdirSync11, statSync as statSync6 } from "fs";
import { join as join19, dirname as dirname12, relative, sep } from "path";

// consort/orchestrator/agents/replay-recorder-wrapper.ts
init_esm_shims();

// consort/logging/turn-recorder.ts
init_esm_shims();
import { createHash } from "crypto";
import {
  appendFileSync,
  cpSync as cpSync5,
  existsSync as existsSync20,
  mkdirSync as mkdirSync14,
  readFileSync as readFileSync17,
  readdirSync as readdirSync12,
  rmSync as rmSync3,
  statSync as statSync7,
  writeFileSync as writeFileSync12
} from "fs";
import { dirname as dirname13, join as join21, relative as relative2 } from "path";

// consort/pipeline/record-build.ts
init_esm_shims();

// consort/orchestrator/steps/assert-route-satisfiable.ts
init_esm_shims();
import { existsSync as existsSync22 } from "fs";
import { join as join23 } from "path";

// consort/orchestrator/state/orchestrator-derive.ts
init_esm_shims();
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

// consort/orchestrator/state/orchestrator-probe.ts
init_esm_shims();
import * as fs15 from "fs";
import * as path11 from "path";

// consort/pipeline/run-cycle.ts
init_esm_shims();
import { getConnection } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/experiment/experiment.ts
init_esm_shims();
import { execFileSync as execFileSync2 } from "child_process";
import { createPairedBranch, deletePairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
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

// consort/pipeline/cycle-record.ts
init_esm_shims();
import { existsSync as existsSync32, readFileSync as readFileSync29, readdirSync as readdirSync19, statSync as statSync12, writeFileSync as writeFileSync19, mkdirSync as mkdirSync20, rmSync as rmSync8, copyFileSync as copyFileSync3 } from "fs";
import { join as join33, dirname as dirname17, basename as basename4 } from "path";

// consort/test-list/test-list.ts
init_esm_shims();

// consort/deploy/deploy.ts
init_esm_shims();
import { execSync, spawn as spawn2 } from "child_process";
import { randomBytes } from "crypto";
import { existsSync as existsSync26, mkdirSync as mkdirSync17, readFileSync as readFileSync23, rmSync as rmSync5, writeFileSync as writeFileSync16 } from "fs";
import { dirname as dirname15, join as join27 } from "path";
import { readTargets } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { pollUntil } from "@databricks-solutions/lakebase-scm-utils/util";

// consort/gates/escalation.ts
init_esm_shims();
import * as fs11 from "fs";

// consort/smells/smells.ts
init_esm_shims();
import { existsSync as existsSync23, readFileSync as readFileSync19, writeFileSync as writeFileSync13 } from "fs";
import { createHash as createHash2 } from "crypto";
import { join as join24 } from "path";
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
  const file = join24(consortDir, "smells.json");
  if (!existsSync23(file)) return { detected: [] };
  return JSON.parse(readFileSync19(file, "utf8"));
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
  if (!existsSync23(f)) return "";
  try {
    return createHash2("sha1").update(readFileSync19(f)).digest("hex");
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
function readEscalationFile(file) {
  if (!fs11.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs11.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function readEscalations(consortDir) {
  const dir = escalationsDir(consortDir);
  if (!fs11.existsSync(dir)) return [];
  const out = [];
  for (const f of fs11.readdirSync(dir)) {
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

// consort/smells/deploy-verify-assess.ts
init_esm_shims();
import * as fs12 from "fs";
import * as path9 from "path";
function markerPath(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return void 0;
  return storyId ? path9.join(fdir, "stories", storyId, "deploy-verify-assess.json") : path9.join(fdir, "deploy-verify-assess.json");
}
function readDeployVerifyAssessMarker(consortDir, featureId, storyId) {
  const file = markerPath(consortDir, featureId, storyId);
  if (!file || !fs12.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs12.readFileSync(file, "utf8"));
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
init_esm_shims();
import { readdirSync as readdirSync14, readFileSync as readFileSync22, statSync as statSync9 } from "fs";
import { join as join26 } from "path";

// consort/smells/ephemeral-verify.ts
init_esm_shims();
import { LAKEBASE_BRANCH_NAME_MAX } from "@databricks-solutions/lakebase-scm-utils/util";
import { createBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { deleteBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { getConnection as getConnection2, waitForBranchAuthReady } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/deploy/deploy.ts
function deployEvidencePasses(e) {
  return e !== void 0 && e.reachable === true && e.verify?.passed === true;
}
function readDeployEvidence(file) {
  if (!existsSync26(file)) return void 0;
  try {
    return JSON.parse(readFileSync23(file, "utf8"));
  } catch {
    return void 0;
  }
}
function storyDeployVerified(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return false;
  return deployEvidencePasses(readDeployEvidence(join27(fdir, "stories", storyId, "deploy-evidence.json")));
}

// consort/architecture/design-adherence.ts
init_esm_shims();
import { existsSync as existsSync27, readFileSync as readFileSync24, readdirSync as readdirSync16 } from "fs";
import { join as join28 } from "path";

// consort/smells/supersession.ts
init_esm_shims();
import * as fs13 from "fs";
import { join as join29 } from "path";
function supersededTestsJson(tdd, feature, story, ac) {
  return join29(cycleDir(tdd, feature, story, ac), "superseded-tests.json");
}
function readSupersededTests(tdd, feature, story, ac) {
  const parseSuperseded = (raw) => {
    const p = JSON.parse(raw);
    const arr = Array.isArray(p.tests) ? p.tests : Array.isArray(p.superseded_tests) ? p.superseded_tests : void 0;
    return arr && arr.length > 0 && arr.every((t) => typeof t === "string") ? arr : void 0;
  };
  const file = supersededTestsJson(tdd, feature, story, ac);
  if (fs13.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs13.readFileSync(file, "utf8"));
      const tests = parseSuperseded(JSON.stringify(parsed));
      if (tests) return { ...parsed, tests };
    } catch {
    }
  }
  const regFile = regressionAssessmentJson(tdd, feature, story, ac);
  if (fs13.existsSync(regFile)) {
    try {
      const parsed = JSON.parse(fs13.readFileSync(regFile, "utf8"));
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
  return join29(cycleDir(tdd, feature, story, ac), "green-failure.json");
}
function readGreenFailure(tdd, feature, story, ac) {
  const file = greenFailureJson(tdd, feature, story, ac);
  if (!fs13.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs13.readFileSync(file, "utf8"));
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
  return join29(cycleDir(tdd, feature, story, ac), "regression-assessment.json");
}

// consort/architecture/contract-clean.ts
init_esm_shims();
import { existsSync as existsSync29, readFileSync as readFileSync26, readdirSync as readdirSync17, statSync as statSync10 } from "fs";
import { join as join30, relative as relative4, extname } from "path";
var ARTIFACT_ROOTS_RE = artifactRootsRegexAlternation();
var EXCLUDE_DIR = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build|tests?|alembic|migrations)(/|$)`
);
var EXCLUDE_DIR_JUNK = new RegExp(
  `(^|/)(node_modules|\\.git|\\.venv|venv|__pycache__|${ARTIFACT_ROOTS_RE}|\\.lakebase|dist|build)(/|$)`
);

// consort/smells/refactor-verify-assess.ts
init_esm_shims();
import * as fs14 from "fs";
import * as path10 from "path";
function markerPath2(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return void 0;
  return path10.join(fdir, "stories", storyId, "refactor-verify-assess.json");
}
function readRefactorVerifyAssessMarker(consortDir, featureId, storyId) {
  const file = markerPath2(consortDir, featureId, storyId);
  if (!file || !fs14.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs14.readFileSync(file, "utf8"));
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
init_esm_shims();
import { existsSync as existsSync31, readFileSync as readFileSync28, readdirSync as readdirSync18, statSync as statSync11 } from "fs";
import { join as join32, relative as relative5, extname as extname2 } from "path";

// consort/pipeline/cycle-record.ts
import { commitAllIfChanged } from "@databricks-solutions/lakebase-scm-utils/git";
import { assertCommitTargetNotProtected, ProtectedBranchCommitError } from "@databricks-solutions/lakebase-scm-utils/lakebase";
function readStoryItems(consortDir, featureId, story) {
  const file = storyTestListJson(consortDir, featureId, story);
  if (!existsSync32(file)) {
    throw new Error(`per-story test-list not found for ${featureId}/${story} at ${file}`);
  }
  const data = JSON.parse(readFileSync29(file, "utf8"));
  return Array.isArray(data.items) ? data.items : [];
}
function storyCycles(consortDir, featureId, story) {
  const base = join33(cyclesRootDir(consortDir), featureId, story);
  if (!existsSync32(base)) return [];
  const out = [];
  for (const acDir of readdirSync19(base)) {
    const dir = join33(base, acDir);
    try {
      if (!statSync12(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const f of readdirSync19(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(readFileSync29(join33(dir, f), "utf8")));
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
function readReview(consortDir, featureId, story, acId) {
  const f = acReviewJson(consortDir, featureId, story, acId);
  if (!existsSync32(f)) return {};
  try {
    return JSON.parse(readFileSync29(f, "utf8"));
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
  if (!existsSync32(f)) return {};
  try {
    return JSON.parse(readFileSync29(f, "utf8"));
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

// consort/pipeline/design-fingerprint.ts
init_esm_shims();
import { createHash as createHash3 } from "crypto";
import { readFileSync as readFileSync30 } from "fs";
function storyDesignFingerprint(consortDir, feature, story) {
  try {
    const raw = readFileSync30(storyTestListJson(consortDir, feature, story), "utf8");
    const canonical = JSON.stringify(JSON.parse(raw));
    return createHash3("sha256").update(canonical).digest("hex").slice(0, 16);
  } catch {
    return void 0;
  }
}

// consort/gates/gates.ts
init_esm_shims();
import { existsSync as existsSync33, readFileSync as readFileSync31, renameSync, unlinkSync, writeFileSync as writeFileSync20 } from "fs";
import { join as join34 } from "path";
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
  if (!existsSync33(file)) {
    return defaultGatesState(featureId);
  }
  const raw = readFileSync31(file, "utf8");
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
  return join34(requireFeatureDir(consortDir, featureId), "gates.json");
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

// consort/orchestrator/state/orchestrator-probe.ts
import { readWorkflowState as readWorkflowState2, SCM_STATES } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/smells/reflection.ts
init_esm_shims();
import { existsSync as existsSync34, readFileSync as readFileSync32, writeFileSync as writeFileSync21, mkdirSync as mkdirSync21, rmSync as rmSync9 } from "fs";
var SMELL_FOR_OWNER = {
  "spec-author": "reflect-spec-defect",
  "test-strategist": "reflect-testlist-defect"
};
function readReflectVerdict(consortDir, feature, story) {
  const p = reflectVerdictJson(consortDir, feature, story);
  if (!existsSync34(p)) return void 0;
  try {
    return JSON.parse(readFileSync32(p, "utf8"));
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
init_esm_shims();
import { existsSync as existsSync35, readFileSync as readFileSync33, writeFileSync as writeFileSync22, mkdirSync as mkdirSync22, readdirSync as readdirSync21 } from "fs";
function uniq(xs) {
  return [...new Set(xs.filter((x) => typeof x === "string" && x.length > 0))];
}
function readCanon(consortDir) {
  const f = architectureCanonJson(consortDir);
  if (!existsSync35(f)) return void 0;
  try {
    return JSON.parse(readFileSync33(f, "utf8"));
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

// consort/orchestrator/state/orchestrator-probe.ts
function storyCycles2(consortDir, featureId, story) {
  const base = path11.join(cyclesRootDir(consortDir), featureId, story);
  if (!fs15.existsSync(base)) return [];
  const out = [];
  for (const acDir of fs15.readdirSync(base)) {
    const dir = path11.join(base, acDir);
    let isDir = false;
    try {
      isDir = fs15.statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    for (const f of fs15.readdirSync(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(fs15.readFileSync(path11.join(dir, f), "utf8")));
      } catch {
      }
    }
  }
  return out;
}
function readJson(file) {
  if (!fs15.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs15.readFileSync(file, "utf8"));
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
  const requestsAuthored = fs15.existsSync(featureRequestMd(consortDir, featureId));
  const backlogCommitted = requestsAuthored;
  const deployed = fs15.existsSync(featureDeployEvidenceJson(consortDir, featureId));
  const gateApproved = readGateApproved(featureId, consortDir, "deploy");
  const verifyAssessEligible = deployVerifyNeedsAssess(consortDir, featureId);
  const verifyRefactorPending = deployVerifyRefactorPending(consortDir, featureId);
  const proj = projectDir ?? path11.dirname(consortDir);
  let scmState;
  try {
    scmState = readWorkflowState2(proj)?.state;
  } catch {
    scmState = void 0;
  }
  const atOrPast = (target) => {
    if (!scmState) return false;
    const i = SCM_STATES.indexOf(scmState);
    const t = SCM_STATES.indexOf(target);
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
      return everyAcNoted && fs15.existsSync(architectureJson(consortDir, featureId));
    },
    dbaDesigned() {
      const archFile = architectureJson(consortDir, featureId);
      if (!fs15.existsSync(archFile)) return false;
      let archContent;
      try {
        archContent = fs15.readFileSync(archFile, "utf8");
      } catch {
        return false;
      }
      const dbFile = dbDesignJson(consortDir, featureId);
      let dbContent;
      if (fs15.existsSync(dbFile)) {
        try {
          dbContent = fs15.readFileSync(dbFile, "utf8");
        } catch {
          dbContent = void 0;
        }
      }
      return checkDbDesign(dbContent, archContent).ok;
    },
    architectProjectable(story) {
      if (!fs15.existsSync(architectureJson(consortDir, featureId))) return false;
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
      if (!fs15.existsSync(file)) return false;
      try {
        const data = JSON.parse(fs15.readFileSync(file, "utf8"));
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

// consort/pipeline/story-pipeline.ts
init_esm_shims();
import { existsSync as existsSync38, readFileSync as readFileSync36, writeFileSync as writeFileSync23, mkdirSync as mkdirSync23, readdirSync as readdirSync24, statSync as statSync15, rmSync as rmSync10 } from "fs";

// consort/gates/gate-conformance-guard.ts
init_esm_shims();
import { existsSync as existsSync37, readFileSync as readFileSync35, readdirSync as readdirSync23, statSync as statSync14 } from "fs";
import { join as join36, dirname as dirname19 } from "path";

// consort/architecture/architecture-conventions.ts
init_esm_shims();

// consort/logging/gate-decision-log.ts
init_esm_shims();

// consort/pipeline/story-pipeline.ts
function initPipeline(featureId) {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}
function pipelinePath(consortDir, featureId) {
  return pipelineJson(consortDir, featureId);
}
function readPipeline(consortDir, featureId) {
  const p = pipelinePath(consortDir, featureId);
  if (!existsSync38(p)) return initPipeline(featureId);
  return JSON.parse(readFileSync36(p, "utf8"));
}

// consort/session/response-formatter.ts
init_esm_shims();
import { existsSync as existsSync39, readFileSync as readFileSync37, readdirSync as readdirSync25 } from "fs";
function designGuideConformance(consortDir) {
  const file = designGuideJson(consortDir);
  if (!existsSync39(file)) {
    return { ok: false, problem: "design-guide.json not written (the machine-checkable token source of truth)" };
  }
  let content;
  try {
    content = readFileSync37(file, "utf8");
  } catch (e) {
    return { ok: false, problem: `unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = checkArtifactConformance(canonicalArtifactName(file), content);
  return r.ok ? { ok: true } : { ok: false, problem: r.violations.join("; ") };
}

// consort/orchestrator/build/build-context.ts
init_esm_shims();
import { execSync as execSync2 } from "child_process";
import * as fs16 from "fs";
import { dirname as dirname20, join as join37 } from "path";

// consort/orchestrator/build/preconditions.ts
init_esm_shims();

// consort/test-list/test-analyst-roster.ts
init_esm_shims();

// consort/test-list/test-analyst-catalogue.ts
init_esm_shims();
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
    focusPrompt: "You are the FITNESS test analyst \u2013 the SOLE owner of `invariant_id`. Two duties: (1) Walk the architecture (layers, service_backed, ORM-only, config-in-env, each accepted NFR budget) and emit >=1 `kind:\"fitness\"` item per architectural constraint the story touches THAT IS NOT ALREADY DEFENDED DETERMINISTICALLY. The INWARD-DEPENDENCY layering (boundary -> service -> repository -> models, per layers[].may_import) and the ORM-CONTAINMENT contract (ONLY the repository/infrastructure touches the ORM/session) are defended DETERMINISTICALLY by the `consort-layering-clean` gate (a source scan at REVIEW) \u2013 do NOT author import-scan fitness items for them. A hand-authored 'no module under app/ imports the session' / 'no layer imports a layer its may_import forbids' test is redundant with the gate AND error-prone: it routinely forgets to exclude the infrastructure session-factory module (app/database.py), is then unsatisfiable on a correctly-layered tree, and the reflect gate bounces it lap after lap. DO emit fitness items for constraints the gate does NOT cover: config-from-env, and any service-layer guard an NFR demands (e.g. a write-time rejection of an overcommitting / negative-quantity write at the SERVICE layer \u2013 distinct from a DB CHECK constraint). A CLIENT-render NFR fitness function (SPA rendering of null/optional/empty/loading/error states) is NOT yours \u2013 the CLIENT analyst owns those; emit NO fitness item for a client-render NFR. When an NFR declares the ATOMIC `fitness_functions` ARRAY (one obligation per entry), emit ONE `kind:\"fitness\"` item PER ARRAY ENTRY, each with `nfr_id` set to that NFR's `id` (checkFitnessClauseCoverage hard-blocks the test_list gate unless every clause is covered) \u2013 never one item for the whole array. A COMPOUND singular `fitness_function` (an `and`/`+`/comma joining two checkable claims) likewise needs ONE item PER conjunct, never one for the pair. (2) Walk architecture.json `persistence_invariants[]` and emit AT LEAST ONE `kind:\"fitness\"` item per invariant with `invariant_id` set to that invariant's id, verified DIRECTLY against the real branch database (never a mock, never a generic ORM round-trip). COVER EVERY LEG the invariant NAMES: when one invariant names MULTIPLE columns/constraints (e.g. two NOT NULL audit columns `filed_by`+`filed_at`, a multi-column CHECK, or an FK set), cover EACH named leg \u2013 a parametrised sub-case per column/constraint (or a sibling item), all sharing that `invariant_id`. A single item exercising only ONE of the named columns leaves the others uncovered (the reflect gate rejects the un-covered leg). E.g. a NOT-NULL invariant over {filed_by, filed_at} needs a direct INSERT with EACH column NULL asserting its own constraint violation, not just one. ANCHOR BY REALIZING STORY, NOT KEYWORD PROXIMITY: emit an invariant's item ONLY when THIS story realizes that invariant's table \u2013 i.e. db-design.json `schema_changes[]` has an entry for THIS story_id (create_table, else the earliest add_column/alter/constraint) on the invariant's `table` (architecture.json `persistence_invariants[].table`). If the invariant's table is created by a LATER story, DO NOT emit its fitness item on this story \u2013 it belongs to that write story, and its test is un-buildable here (the table does not exist yet). A display/read-only story whose migrations create NO table an invariant names emits NO invariant fitness items, even if its ACs mention a related record (e.g. an AC 'shows the record' does NOT own the record's not-null/FK/reversibility invariants \u2013 the story that MIGRATES the table does). A migration reversibility is ALWAYS one item: reversibility (single-step downgrade/upgrade, @pytest.mark.migration, NEVER downgrade base) asserting the SCHEMA is recreated \u2013 the table + its columns/constraints are present again after downgrade-then-upgrade (NOT that data survives). Data-preservation (seed rows, migrate, assert they survive with expected values) is a SEPARATE item that applies ONLY to an ADDITIVE migration on a PRE-EXISTING table (a later story adding a column/constraint, where single-step downgrade removes only that addition and prior rows persist). NEVER author a data-preservation item for an INITIAL create-table migration: single-step downgrade drops the whole table, so 'rows survive' is UNSATISFIABLE and no code can make it pass (it dead-locks the assess/repair loop). If the story's migration is the table's FIRST (create-table), emit ONLY the schema-recreation reversibility item, not data-preservation. The created_at/audit immutability on an in-place upsert is its OWN item. Whole-table aggregate assertions must scope to the test's own rows (a delta), never an absolute total. Fitness items MUST NOT carry a `.feature` `scenario_file`. Seed idempotently with a per-run-unique key. " + SLICE_CONTRACT + " Set `invariant_id` on each item that covers a declared persistence invariant."
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

// consort/orchestrator/drive/orchestrator-effects.ts
import { sanitizeBranchName } from "@databricks-solutions/lakebase-scm-utils/util";
function readDriveStateFromDisk(consortDir, featureId, projectDir, opts = {}) {
  const pipeline = readPipeline(consortDir, featureId);
  const probe = diskArtifactProbe(consortDir, featureId, pipeline.build_active);
  const ctx = readDriveContext(consortDir, featureId, projectDir);
  const state = deriveDriveState(pipeline, probe, ctx);
  state.uiTrack = opts.uiTrack ?? true;
  state.designGuideReady = designGuideConformance(consortDir).ok;
  return state;
}

// bin/consort/next.cli.ts
import { readWorkflowState as readWorkflowState3 } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/intake/orchestrator-sprint.ts
init_esm_shims();

// consort/gates/sprint-gates.ts
init_esm_shims();
import { existsSync as existsSync41, mkdirSync as mkdirSync25, readFileSync as readFileSync40, renameSync as renameSync2, unlinkSync as unlinkSync2, writeFileSync as writeFileSync25 } from "fs";

// consort/gates/gate-hash.ts
init_esm_shims();

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
  if (!existsSync41(file)) return defaultSprintGatesState(sprint);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync40(file, "utf8"));
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
import * as fs18 from "fs";
function deriveSprintPlanningState(consortDir, sprint, opts = {}) {
  const proposed = fs18.existsSync(featureProposalsMd(consortDir));
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

// consort/orchestrator/status/feature-status.ts
init_esm_shims();

// consort/gates/design-spec-gate.ts
init_esm_shims();

// consort/experiment/spike-carryforward.ts
init_esm_shims();

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

// consort/orchestrator/status/next.ts
init_esm_shims();
import * as fs19 from "fs";
import * as path12 from "path";
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
function storyOf2(action) {
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
      const story = storyOf2(action) ?? "<story>";
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
          title: `Approve story ${storyOf2(action) ?? "<story>"}'s spec`,
          hil_prompt: `Approve story ${storyOf2(action) ?? "<story>"}'s spec so its build can start? (To send it back, edit the spec and re-run the design lane.)`,
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
function renderNextSnapshot(snap) {
  const lines = [];
  const who = snap.scope === "sprint" ? `sprint ${snap.sprint}` : `feature ${snap.feature}`;
  lines.push(`Next for ${who}`);
  const phase = snap.state.derived_phase ?? snap.state.coarse_phase;
  const coarseLag = snap.state.derived_phase && snap.state.coarse_phase !== snap.state.derived_phase ? ` [coarse: ${snap.state.coarse_phase}]` : "";
  lines.push(`  Phase: ${phase}${coarseLag}`);
  if (Object.keys(snap.state.stories).length > 0) {
    const rows = Object.entries(snap.state.stories).map(([id, st]) => `${id}=${st}`);
    lines.push(`  Stories: ${rows.join(", ")}`);
  }
  if (snap.state.open_gates.length > 0) lines.push(`  Open gate: ${snap.state.open_gates.join(", ")}`);
  lines.push(``);
  lines.push(snap.summary);
  if (snap.state.blockers.length > 0) {
    lines.push(``);
    lines.push(`Blockers:`);
    for (const b of snap.state.blockers) {
      lines.push(`  - [${b.source}] ${b.reason}${b.story ? ` (story ${b.story})` : ""}`);
      if (b.resolver) lines.push(`      resolve: ${b.resolver.bin} ${b.resolver.args.join(" ")}`);
      else if (b.resolver_hint) lines.push(`      resolve: ${b.resolver_hint}`);
    }
  }
  lines.push(``);
  lines.push(`Options:`);
  for (const o of snap.options) {
    const tag = o.outward_facing ? " (outward-facing: confirm first)" : "";
    lines.push(`  - ${o.title}${tag}`);
    lines.push(`      ${o.hil_prompt}`);
    if (o.enact) lines.push(`      enact: ${o.enact.bin} ${o.enact.args.join(" ")}`);
    if (o.note) lines.push(`      note: ${o.note}`);
  }
  return lines.join("\n");
}

// bin/consort/next.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--sprint":
        out.sprint = argv[++i];
        break;
      case "--consort-dir":
      case "--sftdd-dir":
      case "--tdd":
        out.consortDir = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--approver":
        out.approver = argv[++i];
        break;
      case "--no-sizing":
        out.noSizing = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (!a.startsWith("--") && !out.feature && !out.sprint) out.feature = a;
        break;
    }
  }
  return out;
}
var HELP = `consort-next \u2013 the authoritative, read-only "what do I do next?" surface

Answers, from the SAME engine the drive uses: where am I, what are my valid next
options, how do I enact each, and how do I frame the decision for the human. It is
strictly read-only (no model, no writes, no actions). The drive also auto-emits
this snapshot to ${ARTIFACT_ROOT}/next.json on every stop.

Usage:
  consort-next --feature <F> [--json]
  consort-next --sprint <S> [--json]

Flags:
  --feature <F>    Feature/story scope (or pass the id as a bare argument)
  --sprint <S>     Sprint scope (planning)
  --json           Print the snapshot as JSON (the machine contract) instead of text
  --approver <n>   Fill this approver into the enact commands (default: <you> placeholder)
  --project-dir <d>  Project root (default: cwd)
  --consort-dir <d>  Artifact root (default: ./${ARTIFACT_ROOT}, honors legacy roots; aliases: --sftdd-dir, --tdd)
  --no-sizing      Sprint scope: the plan skips the architect sizing step
  --help, -h       Show this help

Examples:
  consort-next --feature F1-checkout
  consort-next --feature F1-checkout --json | jq '.options[].enact'
  consort-next --sprint stockflow-s1 --json
`;
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.feature && !args.sprint) {
    process.stderr.write(`Error: one of --feature <F> or --sprint <S> is required.

${HELP}`);
    return 2;
  }
  if (args.feature && args.sprint) {
    process.stderr.write(`Error: pass only one of --feature or --sprint.
`);
    return 2;
  }
  const projectDir = args.projectDir ?? process.cwd();
  const consortDir = args.consortDir ?? resolveConsortDir(projectDir);
  const ctx = {
    ...args.feature ? { featureId: args.feature } : {},
    ...args.sprint ? { sprint: args.sprint } : {},
    ...args.approver ? { approver: args.approver } : {},
    version: kitVersion()
  };
  const snapshot = args.sprint ? buildNextSnapshot("sprint", deriveSprintPlanningState(consortDir, args.sprint, { skipSizing: !!args.noSizing }), ctx) : buildNextSnapshot(
    "feature",
    readDriveStateFromDisk(consortDir, args.feature, projectDir, {
      uiTrack: resolveConsortSettings({ projectDir }).project.uiTrack
    }),
    {
      ...ctx,
      stories: summarizeStories(consortDir, args.feature),
      // The promote gate's required --promote-ref is the feature's canonical
      // branch, recorded in the SCM workflow state at claim (FEIP-8019).
      ...readWorkflowState3(projectDir)?.branch ? { featureBranch: readWorkflowState3(projectDir).branch } : {}
    }
  );
  if (args.json) process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
  else process.stdout.write(renderNextSnapshot(snapshot) + "\n");
  return 0;
}
try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
}
