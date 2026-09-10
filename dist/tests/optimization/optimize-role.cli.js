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
    function str2(strs, ...args) {
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
    exports.str = str2;
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
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str2`${c1}${c2}`;
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
    function alwaysValidSchema(it, schema2) {
      if (typeof schema2 == "boolean")
        return schema2;
      if (Object.keys(schema2).length === 0)
        return true;
      checkUnknownRules(it, schema2);
      return !schemaHasRules(schema2, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema2 = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema2 === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema2) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema2, rules) {
      if (typeof schema2 == "boolean")
        return !schema2;
      for (const key in schema2)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema2, RULES) {
      if (typeof schema2 == "boolean")
        return !schema2;
      for (const key in schema2)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema2, keyword, $data) {
      if (!$data) {
        if (typeof schema2 == "number" || typeof schema2 == "boolean")
          return schema2;
        if (typeof schema2 == "string")
          return (0, codegen_1._)`${schema2}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str2) {
      return unescapeJsonPointer(decodeURIComponent(str2));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str2) {
      return encodeURIComponent(escapeJsonPointer(str2));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str2) {
      if (typeof str2 == "number")
        return `${str2}`;
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str2) {
      return str2.replace(/~1/g, "/").replace(/~0/g, "~");
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
      const { gen, schema: schema2, validateName } = it;
      if (schema2 === false) {
        falseSchemaError(it, false);
      } else if (typeof schema2 == "object" && schema2.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema: schema2 } = it;
      if (schema2 === false) {
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
    function schemaHasRulesForType({ schema: schema2, self }, type2) {
      const group = self.RULES.types[type2];
      return group && group !== true && shouldUseGroup(schema2, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema2, group) {
      return group.rules.some((rule) => shouldUseRule(schema2, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema2, rule) {
      var _a;
      return schema2[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema2[kwd] !== void 0));
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
    function getSchemaTypes(schema2) {
      const types = getJSONTypes(schema2.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema2.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema2.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema2.nullable === true)
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
      message: ({ schema: schema2 }) => `must be ${schema2}`,
      params: ({ schema: schema2, schemaValue }) => typeof schema2 == "string" ? (0, codegen_1._)`{type: ${schema2}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema: schema2 } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema2, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema2.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema2,
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
      const { gen, schema: schema2, keyword, it } = cxt;
      if (!Array.isArray(schema2))
        throw new Error("ajv implementation error");
      const alwaysValid = schema2.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema2.forEach((_sch, i) => {
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
      const { gen, keyword, schema: schema2, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema2, parentSchema, it);
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
      const { gen, keyword, schema: schema2, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema2, parentSchema, it) : def.validate;
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
    function validSchemaType(schema2, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema2) : st === "object" ? schema2 && typeof schema2 == "object" && !Array.isArray(schema2) : typeof schema2 == st || allowUndefined && typeof schema2 == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema: schema2, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema2, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema2[keyword]);
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
    function getSubschema(it, { keyword, schemaProp, schema: schema2, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema2 !== void 0) {
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
      if (schema2 !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema: schema2,
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
    var traverse = module.exports = function(schema2, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema2, "", schema2);
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
    function _traverse(opts, pre, post, schema2, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema2 && typeof schema2 == "object" && !Array.isArray(schema2)) {
        pre(schema2, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema2) {
          var sch = schema2[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema2, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema2, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema2);
          }
        }
        post(schema2, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str2) {
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
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
    function inlineRef(schema2, limit = true) {
      if (typeof schema2 == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema2);
      if (!limit)
        return false;
      return countKeys(schema2) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema2) {
      for (const key in schema2) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema2[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema2) {
      let count = 0;
      for (const key in schema2) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema2[key] == "object") {
          (0, util_1.eachItem)(schema2[key], (sch) => count += countKeys(sch));
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
    function getSchemaRefs(schema2, baseId) {
      if (typeof schema2 == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema2[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema2, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
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
    function validateFunction({ gen, validateName, schema: schema2, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema2, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema2, opts)).code(body));
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
      const { schema: schema2, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema2.$comment)
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
    function funcSourceUrl(schema2, opts) {
      const schId = typeof schema2 == "object" && schema2[opts.schemaId];
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
    function schemaCxtHasRules({ schema: schema2, self }) {
      if (typeof schema2 == "boolean")
        return !schema2;
      for (const key in schema2)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema: schema2, gen, opts } = it;
      if (opts.$comment && schema2.$comment)
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
      const { schema: schema2, errSchemaPath, opts, self } = it;
      if (schema2.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema2, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema: schema2, opts } = it;
      if (schema2.default !== void 0 && opts.useDefaults && opts.strictSchema) {
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
    function commentKeyword({ gen, schemaEnv, schema: schema2, errSchemaPath, opts }) {
      const msg = schema2.$comment;
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
      const { gen, schema: schema2, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema2.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema2, RULES))) {
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
        if (!(0, applicability_1.shouldUseGroup)(schema2, group))
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
      const { gen, schema: schema2, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema2, rule)) {
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
          const { type: type2 } = rule.definition;
          if (type2.length && !type2.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type2.join(",")}" for keyword "${keyword}"`);
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
        let schema2;
        if (typeof env.schema == "object")
          schema2 = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema2 === null || schema2 === void 0 ? void 0 : schema2[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema2 === null || schema2 === void 0 ? void 0 : schema2.$async;
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
        const schema2 = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema2)
          _sch = new SchemaEnv({ schema: schema2, schemaId, root, baseId });
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
        const { schema: schema2 } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema2[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema: schema2, schemaId, root, baseId });
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
    function getJsonPointer(parsedRef, { baseId, schema: schema2, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema2 === "boolean")
          return;
        const partSchema = schema2[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema2 = partSchema;
        const schId = typeof schema2 === "object" && schema2[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema2 != "boolean" && schema2.$ref && !(0, util_1.schemaHasRulesButRef)(schema2, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema2.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema: schema2, schemaId, root, baseId });
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
    function findToken(str2, token) {
      let ind = 0;
      for (let i = 0; i < str2.length; i++) {
        if (str2[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path12) {
      let input = path12;
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
        const [path12, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path12 && path12 !== "/" ? path12 : void 0;
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
    function resolveComponent(base, relative10, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative10 = parse(serialize(relative10, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative10.scheme) {
        target.scheme = relative10.scheme;
        target.userinfo = relative10.userinfo;
        target.host = relative10.host;
        target.port = relative10.port;
        target.path = removeDotSegments(relative10.path || "");
        target.query = relative10.query;
      } else {
        if (relative10.userinfo !== void 0 || relative10.host !== void 0 || relative10.port !== void 0) {
          target.userinfo = relative10.userinfo;
          target.host = relative10.host;
          target.port = relative10.port;
          target.path = removeDotSegments(relative10.path || "");
          target.query = relative10.query;
        } else {
          if (!relative10.path) {
            target.path = base.path;
            if (relative10.query !== void 0) {
              target.query = relative10.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative10.path[0] === "/") {
              target.path = removeDotSegments(relative10.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative10.path;
              } else if (!base.path) {
                target.path = relative10.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative10.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative10.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative10.fragment;
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
    var defaultRegExp = (str2, flags) => new RegExp(str2, flags);
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
      compile(schema2, _meta) {
        const sch = this._addSchema(schema2, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema2, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema: loadSchema2 } = this.opts;
        return runCompileAsync.call(this, schema2, meta);
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
      addSchema(schema2, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema2)) {
          for (const sch of schema2)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema2 === "object") {
          const { schemaId } = this.opts;
          id = schema2[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema2, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema2, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema2, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema2, throwOrLogError) {
        if (typeof schema2 == "boolean")
          return true;
        let $schema;
        $schema = schema2.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema2);
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
            const schema2 = keywords[key];
            if ($data && schema2)
              keywords[key] = schemaOrData(schema2);
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
      _addSchema(schema2, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema2 == "object") {
          id = schema2[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema2 != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema2);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema2, baseId);
        sch = new compile_1.SchemaEnv({ schema: schema2, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema2, true);
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
    function schemaOrData(schema2) {
      return { anyOf: [schema2, $dataRef] };
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
    var core2 = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core2;
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
    function ucs2length(str2) {
      const len = str2.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str2.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str2.charCodeAt(pos);
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
        const { gen, data, $data, schema: schema2, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema2);
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
        const { gen, schema: schema2, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema2.length === 0)
          return;
        const useLoop = schema2.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema2) {
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
            for (const prop of schema2) {
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
            gen.if((0, code_1.checkMissingProp)(cxt, schema2, missing));
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
        const { gen, data, $data, schema: schema2, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema2)
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
        const { gen, data, $data, schemaCode, schema: schema2 } = cxt;
        if ($data || schema2 && typeof schema2 == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema2} !== ${data}`);
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
        const { gen, data, $data, schema: schema2, schemaCode, it } = cxt;
        if (!$data && schema2.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema2.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema2))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema2.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema2[i];
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
      const { gen, schema: schema2, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema2 === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema2 == "object" && !(0, util_1.alwaysValidSchema)(it, schema2)) {
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
        const { schema: schema2, it } = cxt;
        if (Array.isArray(schema2))
          return validateTuple(cxt, "additionalItems", schema2);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema2))
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
        const { schema: schema2, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema2))
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
        const { gen, schema: schema2, parentSchema, data, it } = cxt;
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
        if ((0, util_1.alwaysValidSchema)(it, schema2)) {
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
    function splitDependencies({ schema: schema2 }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema2) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema2[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema2[key];
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
        const { gen, schema: schema2, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema2))
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
        const { gen, schema: schema2, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema2))
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
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema2 === false) {
            deleteAdditional(key);
            return;
          }
          if (schema2 === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema2 == "object" && !(0, util_1.alwaysValidSchema)(it, schema2)) {
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
        const { gen, schema: schema2, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema2);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema2[p]));
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
          return it.opts.useDefaults && !it.compositeRule && schema2[prop].default !== void 0;
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
        const { gen, schema: schema2, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema2);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema2[p]));
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
        const { gen, schema: schema2, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema2)) {
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
        const { gen, schema: schema2, parentSchema, it } = cxt;
        if (!Array.isArray(schema2))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema2;
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
        const { gen, schema: schema2, it } = cxt;
        if (!Array.isArray(schema2))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema2.forEach((sch, i) => {
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
      const schema2 = it.schema[keyword];
      return schema2 !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema2);
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
        const { gen, data, $data, schema: schema2, schemaCode, it } = cxt;
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
          const formatDef = self.formats[schema2];
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
              return `unknown format "${schema2}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema2)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema2, ref: fmtDef, code });
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
        const { gen, data, schema: schema2, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema2.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema2.mapping)
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

// tests/optimization/optimize-role.cli.ts
init_esm_shims();
import { isCliEntry } from "@databricks-solutions/lakebase-scm-utils/util";
import { mkdirSync as mkdirSync38, writeFileSync as writeFileSync34, readFileSync as readFileSync56, existsSync as existsSync60, readdirSync as readdirSync36, mkdtempSync as mkdtempSync3, rmSync as rmSync19 } from "fs";
import { tmpdir as tmpdir3 } from "os";
import { join as join62, dirname as dirname29, relative as relative9 } from "path";

// consort/optimize/role-chains.ts
init_esm_shims();
import { join as join43 } from "path";

// consort/orchestrator/scenarios/integration-chain.ts
init_esm_shims();
import { mkdtempSync, mkdirSync as mkdirSync29, rmSync as rmSync10, existsSync as existsSync43, readFileSync as readFileSync41, readdirSync as readdirSync26 } from "fs";
import { tmpdir } from "os";
import { join as join42, relative as relative5 } from "path";

// consort/orchestrator/runners/manifest-runner.ts
init_esm_shims();
import { readFileSync as readFileSync40, existsSync as existsSync41 } from "fs";
import { join as join40 } from "path";

// consort/orchestrator/steps/manifest.ts
init_esm_shims();
import { readFileSync as readFileSync2, readdirSync, existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";

// consort/orchestrator/validators/schema-loader.ts
init_esm_shims();
var import_ajv = __toESM(require_ajv(), 1);
import { existsSync, readFileSync } from "fs";
import { join } from "path";
function resolveSchemaDir() {
  const direct = join(__dirname, "..", "..", "config", "schemas");
  if (existsSync(direct)) return direct;
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const cand = join(dir, "consort", "config", "schemas");
    if (existsSync(cand)) return cand;
    const parent = join(dir, "..");
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
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8"));
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
function loadStepManifests(dir) {
  if (!existsSync2(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync2(join2(dir, f), "utf8")));
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

// consort/orchestrator/steps/step.ts
init_esm_shims();
import { join as join6 } from "path";
import { existsSync as existsSync5 } from "fs";

// consort/orchestrator/validators/conformance/validator-registry.ts
init_esm_shims();
import { readFileSync as readFileSync4, existsSync as existsSync4, statSync as statSync2, readdirSync as readdirSync3 } from "fs";
import { join as join5 } from "path";

// consort/orchestrator/validators/conformance/artifact-conformance.ts
init_esm_shims();
import { join as join4, basename, dirname } from "path";

// consort/config/consort-paths.ts
init_esm_shims();
import * as fs from "fs";
import { join as join3 } from "path";
var ARTIFACT_ROOT = ".consort";
var LEGACY_ARTIFACT_ROOTS = [".sftdd", ".tdd"];
var ALL_ARTIFACT_ROOTS = [ARTIFACT_ROOT, ...LEGACY_ARTIFACT_ROOTS];
var artifactRootsRegexAlternation = () => ALL_ARTIFACT_ROOTS.map((r) => r.replace(/[.]/g, "\\.")).join("|");
function resolveConsortDir(projectDir = process.cwd()) {
  const next = join3(projectDir, ARTIFACT_ROOT);
  if (fs.existsSync(next)) return next;
  for (const legacyName of LEGACY_ARTIFACT_ROOTS) {
    const legacy = join3(projectDir, legacyName);
    if (fs.existsSync(legacy)) return legacy;
  }
  return next;
}
var featuresDir = (tdd) => join3(tdd, "features");
var planningDir = (tdd) => join3(tdd, "planning");
var sprintsDir = (tdd) => join3(tdd, "sprints");
var cyclesRootDir = (tdd) => join3(tdd, "cycles");
var experimentsRootDir = (tdd) => join3(tdd, "experiments");
var escalationsDir = (tdd) => join3(tdd, "escalations");
var escalationFile = (tdd, id) => join3(escalationsDir(tdd), `${id}.json`);
var acReviewJson = (tdd, f, s, ac) => join3(cyclesRootDir(tdd), f, s, ac, "review.json");
var acReviewVerdictJson = (tdd, f, s, ac) => join3(cyclesRootDir(tdd), f, s, ac, "review-verdict.json");
var storyReviewJson = (tdd, f, s) => join3(cyclesRootDir(tdd), f, s, "review.json");
var workflowStateJson = (tdd) => join3(tdd, "workflow-state.json");
var productOverviewMd = (tdd) => join3(tdd, "product-overview.md");
var nfrsMd = (tdd) => join3(tdd, "nfrs.md");
var intakeReadyOnDisk = (tdd) => fs.existsSync(productOverviewMd(tdd)) && fs.existsSync(nfrsMd(tdd));
var intakeApprovedMarker = (tdd) => join3(tdd, "intake", "approved");
var intakeApprovedOnDisk = (tdd) => fs.existsSync(intakeApprovedMarker(tdd));
var designDir = (tdd) => join3(tdd, "design");
var designGuideJson = (tdd) => join3(designDir(tdd), "design-guide.json");
var architectureDir = (tdd) => join3(tdd, "architecture");
var architectureConventionsJson = (tdd) => join3(architectureDir(tdd), "conventions.json");
var architectureCanonJson = (tdd) => join3(architectureDir(tdd), "canon.json");
var featureProposalsMd = (tdd) => join3(planningDir(tdd), "feature-proposals.md");
var featureDir = (tdd, featureId) => join3(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => join3(featureResolved(tdd, f), "feature-spec.json");
var featureRequestMd = (tdd, f) => join3(featureResolved(tdd, f), "feature-request.md");
var architectureJson = (tdd, f) => join3(featureResolved(tdd, f), "architecture.json");
var dbDesignJson = (tdd, f) => join3(featureResolved(tdd, f), "db-design.json");
var featureTestListJson = (tdd, f) => join3(featureResolved(tdd, f), "test-list.json");
var pipelineJson = (tdd, f) => join3(featureResolved(tdd, f), "pipeline.json");
var featureDeployEvidenceJson = (tdd, f) => join3(featureResolved(tdd, f), "deploy-evidence.json");
var storiesDir = (tdd, f) => join3(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join3(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join3(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join3(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => join3(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => join3(storyResolved(tdd, f, s), "acs");
var acJson = (tdd, f, s, ac) => join3(acsDir(tdd, f, s), `${ac}.json`);
var storyTestListJson = (tdd, f, s) => join3(storyResolved(tdd, f, s), "test-list-per-story.json");
var reflectVerdictJson = (tdd, f, s) => join3(storyResolved(tdd, f, s), "reflect-verdict.json");
var handbackFile = (tdd, f, role, story) => join3(featureDir(tdd, f), ".handback", `${role}${story ? `.${story}` : ""}.md`);
var cycleDir = (tdd, f, s, ac) => join3(cyclesRootDir(tdd), f, s, ac);
var sprintDir = (tdd, sprint) => join3(sprintsDir(tdd), sprint);
var backlogJson = (tdd, sprint) => join3(sprintDir(tdd, sprint), "backlog.json");
var sprintRequestedJson = (tdd, sprint) => join3(sprintDir(tdd, sprint), "requested.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join3(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join3(root, matches[0]) : void 0;
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
          const obj = JSON.parse(fs.readFileSync(join3(dir, file), "utf8"));
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
var TSHIRT_SIZES = /* @__PURE__ */ new Set(["XS", "S", "M", "L", "XL"]);
var isTshirtSize = (x) => typeof x === "string" && TSHIRT_SIZES.has(x);
var planningEstimatesJson = (tdd) => join3(planningDir(tdd), "estimates.json");
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
      if (!fs.statSync(join3(root, d)).isDirectory()) return false;
      if (!fs.existsSync(join3(root, d, "feature-request.md"))) return false;
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

// consort/orchestrator/validators/conformance/artifact-conformance.ts
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
function canonicalArtifactName(path12) {
  const base = basename(path12);
  if (basename(dirname(path12)) === "acs" && base.endsWith(".json")) return "ac.json";
  return base;
}

// consort/orchestrator/validators/conformance/validator-registry.ts
function featureSpecNonEmptyStories(producedPath) {
  let content;
  try {
    content = readFileSync4(producedPath, "utf8");
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
    raw = readFileSync4(producedPath, "utf8");
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
    content = readFileSync4(producedPath, "utf8");
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
    content = readFileSync4(producedPath, "utf8");
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
      content = readFileSync4(producedPath, "utf8");
    } catch {
      return { ok: false, violations: [`${artifactName} not readable at ${producedPath}`] };
    }
    const conf = checkArtifactConformance(artifactName, content);
    return conf.ok ? { ok: true, violations: [] } : { ok: false, violations: conf.violations };
  };
}
function navigatorTestsAuthored(producedPath) {
  if (!existsSync4(producedPath) || !statSync2(producedPath).isDirectory()) {
    return { ok: false, violations: [`navigator RED wrote no tests/ tree at ${producedPath}`] };
  }
  const isTest = (n) => /\.(py|ts|tsx|js|jsx)$/.test(n);
  const walk2 = (dir) => {
    for (const e of readdirSync3(dir, { withFileTypes: true })) {
      const abs = join5(dir, e.name);
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
  if (!existsSync4(producedPath) || !statSync2(producedPath).isDirectory()) {
    return { ok: false, violations: [`driver GREEN wrote no product tree (app/ or src/) at ${producedPath}`] };
  }
  const isSource = (n) => /\.(py|ts|tsx|js|jsx)$/.test(n);
  const walk2 = (dir) => {
    for (const e of readdirSync3(dir, { withFileTypes: true })) {
      const abs = join5(dir, e.name);
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
  const sup = join5(producedPath, "superseded-tests.json");
  const reg = join5(producedPath, "regression-assessment.json");
  const hasSup = existsSync4(sup);
  const hasReg = existsSync4(reg);
  if (!hasSup && !hasReg) {
    return { ok: false, violations: [`assess wrote no marker (expected superseded-tests.json OR regression-assessment.json) in ${producedPath}`] };
  }
  if (hasSup) {
    try {
      const j = JSON.parse(readFileSync4(sup, "utf8"));
      if (!Array.isArray(j.tests) || j.tests.length === 0 || typeof j.reason !== "string" || !j.reason.trim()) {
        return { ok: false, violations: [`superseded-tests.json malformed (need non-empty tests[] + a reason) in ${producedPath}`] };
      }
    } catch (e) {
      return { ok: false, violations: [`superseded-tests.json invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  if (hasReg) {
    try {
      const j = JSON.parse(readFileSync4(reg, "utf8"));
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
  if (!existsSync4(producedPath) || !statSync2(producedPath).isDirectory()) {
    return { ok: false, violations: [`spec-author wrote no acs/ dir at ${producedPath} (expected >=1 acs/<AC>.json)`] };
  }
  const acFiles = readdirSync3(producedPath).filter((n) => n.endsWith(".json"));
  if (acFiles.length === 0) {
    return { ok: false, violations: [`acs/ dir at ${producedPath} holds no AC file (expected >=1 acs/<AC>.json)`] };
  }
  const violations = [];
  for (const name of acFiles) {
    let content;
    try {
      content = readFileSync4(join5(producedPath, name), "utf8");
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
    content = readFileSync4(producedPath, "utf8");
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

// consort/orchestrator/provisioning/channels.ts
init_esm_shims();
function resolveChannelRoot(channel, roots) {
  return channel === "artifact" ? roots.artifactDir ?? roots.workspaceDir : channel === "meta" ? roots.metaDir ?? roots.workspaceDir : roots.workspaceDir;
}

// consort/orchestrator/steps/turn-events.ts
init_esm_shims();
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

// consort/orchestrator/steps/step.ts
function primaryOutputId(manifest) {
  return manifest.outputs[0]?.id;
}
var Step = class {
  constructor(manifest, agent, exists) {
    this.manifest = manifest;
    this.agent = agent;
    this.exists = exists ?? existsSync5;
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
      const p = join6(rootFor(spec.channel), rel);
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

// consort/orchestrator/build/preconditions.ts
init_esm_shims();

// consort/orchestrator/build/build-context.ts
init_esm_shims();
import { execSync } from "child_process";
import * as fs2 from "fs";
import { dirname as dirname4, join as join9 } from "path";

// consort/architecture/architecture-conventions.ts
init_esm_shims();
import { existsSync as existsSync6, readFileSync as readFileSync5, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "fs";
function readConventions(consortDir) {
  const f = architectureConventionsJson(consortDir);
  if (!existsSync6(f)) return void 0;
  try {
    return JSON.parse(readFileSync5(f, "utf8"));
  } catch {
    return void 0;
  }
}

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

// consort/config/consort-config-file.ts
init_esm_shims();
import { existsSync as existsSync8, readFileSync as readFileSync7, mkdirSync as mkdirSync4, writeFileSync as writeFileSync4 } from "fs";
import { dirname as dirname3, join as join8 } from "path";

// consort/config/agent-models.ts
init_esm_shims();
import { existsSync as existsSync7, readFileSync as readFileSync6, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3 } from "fs";
import { dirname as dirname2, join as join7 } from "path";
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
var AGENT_CONFIG_REL = join7(".lakebase", "agent-config.json");
function readAgentConfig(projectDir) {
  const p = join7(projectDir, AGENT_CONFIG_REL);
  if (!existsSync7(p)) return void 0;
  return JSON.parse(readFileSync6(p, "utf8"));
}

// consort/config/consort-config-file.ts
var CONSORT_CONFIG_REL = join8(".lakebase", "consort-config.json");
var LEGACY_CONFIG_RELS = [
  join8(".lakebase", "sftdd-config.json"),
  join8(".lakebase", "tdd-config.json")
];
var LEGACY_TDD_CONFIG_REL = LEGACY_CONFIG_RELS[0];
function loadConsortConfig(projectDir) {
  for (const rel of [CONSORT_CONFIG_REL, ...LEGACY_CONFIG_RELS]) {
    const f = join8(projectDir, rel);
    if (!existsSync8(f)) continue;
    try {
      return JSON.parse(readFileSync7(f, "utf8"));
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
  const f = join8(projectDir, CONSORT_CONFIG_REL);
  if (existsSync8(f) && !opts?.force) return false;
  mkdirSync4(dirname3(f), { recursive: true });
  writeFileSync4(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

// consort/orchestrator/build/build-context.ts
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
    const arch = JSON.parse(fs2.readFileSync(architectureJson(consortDir, featureId), "utf8"));
    const nfrs = (arch.nfrs ?? []).filter(
      (n) => n && typeof n.id === "string" && n.tier !== "platform" && (n.applies_to === story || n.applies_to === featureId)
    );
    if (nfrs.length) {
      parts.push(`required NFRs, ${nfrs.map((n) => `${n.id}${n.brief ? ` (${n.brief})` : ""}`).join("; ")}`);
    }
  } catch {
  }
  if (layers.has("E2E")) {
    try {
      const dg = JSON.parse(fs2.readFileSync(designGuideJson(consortDir), "utf8"));
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
      return execSync(`uv run --env-file .env alembic ${args}`, { cwd: projectDir, stdio: ["ignore", "pipe", "ignore"], timeout: 6e4 }).toString().trim() || void 0;
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
  const file = join9(projectDir, "tests", "step_defs", `test_${story.replace(/-/g, "_")}.py`);
  try {
    const body = fs2.readFileSync(file, "utf8");
    return body.length > 4e3 ? body.slice(0, 4e3) + "\n\u2026 (truncated; read the full file if needed)" : body;
  } catch {
    return void 0;
  }
};
function readCtxLeverMarker(consortDir) {
  try {
    return JSON.parse(fs2.readFileSync(join9(consortDir, "ctx-levers.json"), "utf8"));
  } catch {
    return {};
  }
}
function failingTestBlock(consortDir, story, reader = defaultFailingTestReader) {
  const body = reader(dirname4(consortDir), story);
  return body ? ` FAILING TEST (make THIS pass; do NOT search for it) ::
\`\`\`python
${body}
\`\`\`` : "";
}
function scopeNoteBlock() {
  return ` SCOPE :: Make ONLY the single failing test green with the SIMPLEST honest code at ITS OWN layer. Iterate on that one test (\`uv run --env-file .env pytest <its path> -x -q\`). Do NOT investigate, build, or run OTHER layers' surfaces this turn (e.g. if the failing test is backend, do not touch, grep, or run the client/SPA \u2013 StockView*, vite, npx vitest; a later refactor turn owns that). The post-turn honest-GREEN verify is authoritative; stop once the single test passes.`;
}
function contextAppendBlocks(consortDir, story, blocks) {
  const out = [];
  for (const b of blocks) {
    if (b === "failing-test") {
      const block = failingTestBlock(consortDir, story);
      if (block) out.push(block);
    } else if (b === "scope-note") {
      out.push(scopeNoteBlock());
    }
  }
  return out.join("");
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
    const language = projectLanguage(dirname4(consortDir));
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
    const st = (opts.dbStateReader ?? defaultDbStateReader)(dirname4(consortDir));
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
    const language = projectLanguage(dirname4(consortDir));
    const migrationGuide = language === "nodejs" ? ` MIGRATION :: knex migrations live in migrations/. Create one with \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author it or grep scripts/lk). Source/models live under src/; apply with \`npm run migrate\`.` : language === "java" || language === "kotlin" ? ` MIGRATION :: flyway migrations live in src/main/resources/db/migration/. Create one with \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author it or grep scripts/lk). Apply with \`./mvnw -q flyway:migrate\`.` : ` MIGRATION :: alembic migrations live in alembic/versions/. Create one with \`./scripts/lk lakebase-new-migration --name "<short desc>"\` (do NOT hand-author the revision file or grep scripts/lk to find the command). ORM models are in app/models.py; apply with \`uv run --env-file .env alembic upgrade head\`.`;
    parts.push(migrationGuide);
  }
  return parts.join("");
}

// consort/smells/supersession.ts
init_esm_shims();
import * as fs3 from "fs";
import { join as join10 } from "path";
function supersededTestsJson(tdd, feature, story, ac) {
  return join10(cycleDir(tdd, feature, story, ac), "superseded-tests.json");
}
function readSupersededTests(tdd, feature, story, ac) {
  const parseSuperseded = (raw) => {
    const p = JSON.parse(raw);
    const arr = Array.isArray(p.tests) ? p.tests : Array.isArray(p.superseded_tests) ? p.superseded_tests : void 0;
    return arr && arr.length > 0 && arr.every((t) => typeof t === "string") ? arr : void 0;
  };
  const file = supersededTestsJson(tdd, feature, story, ac);
  if (fs3.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs3.readFileSync(file, "utf8"));
      const tests = parseSuperseded(JSON.stringify(parsed));
      if (tests) return { ...parsed, tests };
    } catch {
    }
  }
  const regFile = regressionAssessmentJson(tdd, feature, story, ac);
  if (fs3.existsSync(regFile)) {
    try {
      const parsed = JSON.parse(fs3.readFileSync(regFile, "utf8"));
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
  return join10(cycleDir(tdd, feature, story, ac), "green-failure.json");
}
function readGreenFailure(tdd, feature, story, ac) {
  const file = greenFailureJson(tdd, feature, story, ac);
  if (!fs3.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs3.readFileSync(file, "utf8"));
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
  return join10(cycleDir(tdd, feature, story, ac), "regression-assessment.json");
}

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
    focusPrompt: "You are the BEHAVIOR test analyst. Cover every BACKEND-layer AC (API / service / data / INFRA) whose outcome is observable through the API boundary with at least one `kind:\"behavior\"` item \u2013 one observable behavior verified through the API boundary (for Python, a pytest-bdd scenario; set `scenario_file` to `tests/features/<story>.feature`). An `Infra`-layer AC (e.g. 'distinct (sku,location) coexist', 'refile updates in place') still has an observable API behavior \u2013 it is YOURS, do not skip it as 'DB-only'. ASSERT THE AC'S CORE PROMISED OUTCOME \u2013 the actual result the AC guarantees (a refile leaves the stored quantity == the NEW value AND exactly ONE row for the pair; filing the same SKU at two DIFFERENT locations yields TWO independently-retrievable coexisting rows), NOT merely a peripheral aspect (a preserved timestamp, atomicity). For a uniqueness / multi-key invariant, cover BOTH sides: the COLLISION (same key -> rejected / stays one row) AND the DISTINCT-keys-COEXIST positive (different keys -> independent rows). A test that checks only the peripheral aspect or only the collision lets a Driver go green without the real behavior \u2013 the recurring reflect-testlist-defect. **DO NOT author a behavior item for an E2E / UI-presentation AC** (e.g. a \"filing form\" / \"home screen\" AC whose `layer` is `E2E`): those are the CLIENT analyst's Playwright job, NOT a backend pytest-bdd test. Set each item's `ac_id` ONLY to an AC whose layer permits a backend test; anchoring a 2xx / response-shape check to a UI AC (instead of the API-layer AC) is the recurring mis-route the reflect gate rejects \u2013 if an AC's observable outcome is an HTTP response shape, it belongs on the API-layer AC, never the form/screen AC. Test at the OUTERMOST public boundary matching the AC's layer. One test per scenario, never an \"and\". EVERY write-bearing test (POST/insert/seed) MUST own its state \u2013 use a per-run-unique key suffixed with the platform's BUILT-IN UUID (Python `uuid.uuid4()` from the stdlib; JS/TS `crypto.randomUUID()`; Java `java.util.UUID`) OR delete/upsert the fixed key before writing, never assume an empty table. NEVER add a UUID dependency: in JS/TS do NOT `import ... from \"uuid\"` \u2013 the `uuid` npm package is not a scaffolded dependency and fails CI with \"Cannot find package 'uuid'\". Do NOT emit fitness or client items, and do NOT set `invariant_id` (the fitness analyst owns persistence invariants). COVER THE NEGATIVE/BOUNDARY-VALIDATION PATH a constraint implies on your ACs: you are given architecture.json (NFRs + persistence_invariants), so when an AC's field is required / NOT NULL (a `not_null` invariant or a field-named-validation NFR names it), emit a behavior item that OMITS (or sends invalid) that field through the API boundary and asserts a field-named rejection \u2013 this is the boundary guard, DISTINCT from the DB constraint the fitness analyst tests. Your `behavior` item asserts ONLY an API-OBSERVABLE outcome (an HTTP status + response body through the boundary). A SERVICE-INTERNAL assertion \u2014 the service raises/rejects BEFORE the DB, the repository is never reached, the guard fires 'at the service layer' \u2014 is NOT API-observable and is NOT a behavior/.feature scenario: authored as one it gets no bindable step def and STALLS the build lane (an unbound pytest-bdd scenario). That service-layer guard is the FITNESS analyst's (a direct service-level test), so cover the negative case here ONLY in its API-observable form (POST the invalid value \u2192 4xx naming the field), and leave the 'rejects-before-the-DB / repository-not-reached' assertion to fitness. A required-field/CHECK/overcommit rejection with only a happy-path test is the recurring reflect-testlist-defect. " + SLICE_CONTRACT
  },
  fitness: {
    kind: "fitness",
    description: "Architectural fitness tests + a real-branch test per declared persistence invariant.",
    configSummary: "Per architectural constraint + per persistence_invariant: a fitness item (invariant_id).",
    model: "sonnet",
    effort: "high",
    toolScope: ["Read"],
    inputs: ["architecture-invariants", "db-design"],
    focusPrompt: "You are the FITNESS test analyst \u2013 the SOLE owner of `invariant_id`. Two duties: (1) Walk the architecture (layers, service_backed, ORM-only, config-in-env, each accepted NFR budget) and emit >=1 `kind:\"fitness\"` item per architectural constraint the story touches THAT IS NOT ALREADY DEFENDED DETERMINISTICALLY. The INWARD-DEPENDENCY layering (boundary -> service -> repository -> models, per layers[].may_import) and the ORM-CONTAINMENT contract (ONLY the repository/infrastructure touches the ORM/session) are defended DETERMINISTICALLY by the `consort-layering-clean` gate (a source scan at REVIEW) \u2013 do NOT author import-scan fitness items for them. A hand-authored 'no module under app/ imports the session' / 'no layer imports a layer its may_import forbids' test is redundant with the gate AND error-prone: it routinely forgets to exclude the infrastructure session-factory module (app/database.py), is then unsatisfiable on a correctly-layered tree, and the reflect gate bounces it lap after lap. DO emit fitness items for constraints the gate does NOT cover: config-from-env, and any service-layer guard an NFR demands (e.g. a write-time rejection of an overcommitting / negative-quantity write at the SERVICE layer \u2013 distinct from a DB CHECK constraint). Describe such a guard so it survives the layering refactor: the service is called WITH its required injected session (the layering contract makes the session a required param, no service-owned fallback) and the guard is proven by asserting the REPOSITORY WRITE is never reached (patch it, assert-not-called) \u2014 NOT by omitting the session (that raises TypeError once the session becomes required and masks the guard, the recurring driver-refactor regression). A CLIENT-render NFR fitness function (SPA rendering of null/optional/empty/loading/error states) is NOT yours \u2013 the CLIENT analyst owns those; emit NO fitness item for a client-render NFR. When an NFR declares the ATOMIC `fitness_functions` ARRAY (one obligation per entry), emit ONE `kind:\"fitness\"` item PER ARRAY ENTRY, each with `nfr_id` set to that NFR's `id` (checkFitnessClauseCoverage hard-blocks the test_list gate unless every clause is covered) \u2013 never one item for the whole array. A COMPOUND singular `fitness_function` (an `and`/`+`/comma joining two checkable claims) likewise needs ONE item PER conjunct, never one for the pair. (2) Walk architecture.json `persistence_invariants[]` and emit AT LEAST ONE `kind:\"fitness\"` item per invariant with `invariant_id` set to that invariant's id, verified DIRECTLY against the real branch database (never a mock, never a generic ORM round-trip). COVER EVERY LEG the invariant NAMES: when one invariant names MULTIPLE columns/constraints (e.g. two NOT NULL audit columns `filed_by`+`filed_at`, a multi-column CHECK, or an FK set), cover EACH named leg \u2013 a parametrised sub-case per column/constraint (or a sibling item), all sharing that `invariant_id`. A single item exercising only ONE of the named columns leaves the others uncovered (the reflect gate rejects the un-covered leg). E.g. a NOT-NULL invariant over {filed_by, filed_at} needs a direct INSERT with EACH column NULL asserting its own constraint violation, not just one. ANCHOR BY REALIZING STORY, NOT KEYWORD PROXIMITY: emit an invariant's item ONLY when THIS story realizes that invariant's table \u2013 i.e. db-design.json `schema_changes[]` has an entry for THIS story_id (create_table, else the earliest add_column/alter/constraint) on the invariant's `table` (architecture.json `persistence_invariants[].table`). If the invariant's table is created by a LATER story, DO NOT emit its fitness item on this story \u2013 it belongs to that write story, and its test is un-buildable here (the table does not exist yet). A display/read-only story whose migrations create NO table an invariant names emits NO invariant fitness items, even if its ACs mention a related record (e.g. an AC 'shows the record' does NOT own the record's not-null/FK/reversibility invariants \u2013 the story that MIGRATES the table does). A migration reversibility is ALWAYS one item: reversibility (single-step downgrade/upgrade, @pytest.mark.migration, NEVER downgrade base) asserting the SCHEMA is recreated \u2013 the table + its columns/constraints are present again after downgrade-then-upgrade (NOT that data survives). Data-preservation (seed rows, migrate, assert they survive with expected values) is a SEPARATE item that applies ONLY to an ADDITIVE migration on a PRE-EXISTING table (a later story adding a column/constraint, where single-step downgrade removes only that addition and prior rows persist). NEVER author a data-preservation item for an INITIAL create-table migration: single-step downgrade drops the whole table, so 'rows survive' is UNSATISFIABLE and no code can make it pass (it dead-locks the assess/repair loop). If the story's migration is the table's FIRST (create-table), emit ONLY the schema-recreation reversibility item, not data-preservation. The created_at/audit immutability on an in-place upsert is its OWN item. Whole-table aggregate assertions must scope to the test's own rows (a delta), never an absolute total. Fitness items MUST NOT carry a `.feature` `scenario_file`. Seed idempotently with a per-run-unique key. " + SLICE_CONTRACT + " Set `invariant_id` on each item that covers a declared persistence invariant."
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

// consort/orchestrator/agents/agent-catalogue.ts
init_esm_shims();
import { join as join24 } from "path";
import { readFileSync as readFileSync21, writeFileSync as writeFileSync13, existsSync as existsSync23 } from "fs";

// consort/orchestrator/agents/claude-step-agent.ts
init_esm_shims();
import { randomUUID as randomUUID2 } from "crypto";

// consort/orchestrator/drive/claude-runner.ts
init_esm_shims();
import { spawn, execFileSync } from "child_process";

// consort/setup/project-consort-setup.ts
init_esm_shims();
import * as fs8 from "fs";
import * as path6 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// consort/lakebase/adopt-consort.ts
init_esm_shims();
import * as fs4 from "fs";
import * as path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// consort/lakebase/update-agents.ts
init_esm_shims();
import * as fs5 from "fs";
import * as path3 from "path";

// consort/lakebase/upgrade.ts
init_esm_shims();
import * as fs7 from "fs";
import * as path5 from "path";
import { spawnSync } from "child_process";

// consort/config/kit-ref.ts
init_esm_shims();
import { existsSync as existsSync12, readFileSync as readFileSync12, writeFileSync as writeFileSync7, mkdirSync as mkdirSync8 } from "fs";
import { dirname as dirname7, join as join13 } from "path";

// consort/lakebase/update-commands.ts
init_esm_shims();
import * as fs6 from "fs";
import * as path4 from "path";

// consort/lakebase/upgrade.ts
import { enableE2eForProject } from "@databricks-solutions/lakebase-scm-utils/lakebase";
var AGENT_SYNC_MARKER = path5.join(".claude", "agents", ".kit-version");

// consort/setup/project-consort-setup.ts
var __dirname2 = path6.dirname(fileURLToPath3(import.meta.url));
function kitPackageName() {
  const candidates = [
    path6.resolve(__dirname2, "../../package.json"),
    path6.resolve(__dirname2, "../../../package.json")
  ];
  for (const c of candidates) {
    try {
      const name = JSON.parse(fs8.readFileSync(c, "utf8")).name;
      if (typeof name === "string" && name) return name;
    } catch {
    }
  }
  throw new Error(`could not resolve the kit package name; looked in: ${candidates.join(", ")}`);
}
function layDownTddScaffold(targetDir) {
  const kitPkgFile = path6.join(targetDir, ".lakebase", "kit-package");
  if (!fs8.existsSync(kitPkgFile)) {
    fs8.mkdirSync(path6.dirname(kitPkgFile), { recursive: true });
    fs8.writeFileSync(kitPkgFile, `${kitPackageName()}
`);
  }
  layDownKitClaudeAssets(targetDir);
  const candidates = [
    path6.resolve(__dirname2, `../../templates/consort-bootstrap/${ARTIFACT_ROOT}`),
    path6.resolve(__dirname2, `../../../templates/consort-bootstrap/${ARTIFACT_ROOT}`)
  ];
  const source = candidates.find((c) => fs8.existsSync(c));
  if (!source) {
    throw new Error(`consort-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path6.join(targetDir, ARTIFACT_ROOT);
  if (fs8.existsSync(dest)) {
    return;
  }
  fs8.cpSync(source, dest, { recursive: true });
}
function resolveKitRoot() {
  const candidates = [
    path6.resolve(__dirname2, "../.."),
    path6.resolve(__dirname2, "../../..")
  ];
  for (const c of candidates) {
    if (fs8.existsSync(path6.join(c, "package.json")) && fs8.existsSync(path6.join(c, "skills", "consort", "agents"))) {
      return c;
    }
  }
  throw new Error(
    `could not resolve the kit root (package.json + skills/consort/agents); looked in: ${candidates.join(", ")}`
  );
}
function kitVersion(root) {
  try {
    return JSON.parse(fs8.readFileSync(path6.join(root, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}
function copyMissingMd(src, dest) {
  if (!fs8.existsSync(src)) return;
  fs8.mkdirSync(dest, { recursive: true });
  for (const entry of fs8.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const d = path6.join(dest, entry);
    if (fs8.existsSync(d)) continue;
    fs8.copyFileSync(path6.join(src, entry), d);
  }
}
function layDownKitClaudeAssets(targetDir) {
  const root = resolveKitRoot();
  const claudeDir = path6.join(targetDir, ".claude");
  copyMissingMd(
    path6.join(root, "skills", "consort", "agents"),
    path6.join(claudeDir, "agents")
  );
  const skillsSrc = path6.join(root, "skills");
  if (fs8.existsSync(skillsSrc)) {
    for (const skill of fs8.readdirSync(skillsSrc).sort()) {
      if (!fs8.existsSync(path6.join(skillsSrc, skill, "SKILL.md"))) continue;
      const dest = path6.join(claudeDir, "skills", skill);
      if (fs8.existsSync(dest)) continue;
      fs8.mkdirSync(path6.dirname(dest), { recursive: true });
      fs8.cpSync(path6.join(skillsSrc, skill), dest, { recursive: true });
    }
  }
  const cmdSrc = path6.join(root, "templates", "project", "common", ".claude", "commands");
  if (fs8.existsSync(cmdSrc)) {
    const version = kitVersion(root);
    const cmdDest = path6.join(claudeDir, "commands");
    fs8.mkdirSync(cmdDest, { recursive: true });
    for (const entry of fs8.readdirSync(cmdSrc)) {
      if (!entry.endsWith(".md")) continue;
      const dest = path6.join(cmdDest, entry);
      if (fs8.existsSync(dest)) continue;
      const body = fs8.readFileSync(path6.join(cmdSrc, entry), "utf8").replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
      fs8.writeFileSync(dest, body);
    }
  }
}
var AGENT_SYNC_MARKER2 = path6.join(".claude", "agents", ".kit-version");
function seedConsortConfig(projectDir, opts) {
  const consortConfig = defaultConsortConfig();
  for (const [role, model] of Object.entries(opts.agentModels ?? {})) {
    if (model && consortConfig.roles?.[role]) {
      consortConfig.roles[role].model = model;
    }
  }
  if (consortConfig.project) {
    consortConfig.project.uiTrack = opts.uiTrack ?? true;
    consortConfig.project.clientFramework = opts.clientFramework;
    consortConfig.project.language = opts.language ?? "java";
  }
  writeConsortConfig(projectDir, consortConfig);
}
var kitConsortHooks = {
  layDownScaffold: layDownTddScaffold,
  seedConfig: seedConsortConfig
};

// consort/orchestrator/drive/claude-runner.ts
import { randomUUID } from "crypto";
import * as fs11 from "fs";
import * as path8 from "path";
import * as readline from "readline";

// consort/logging/replay-artifacts.ts
init_esm_shims();
import { existsSync as existsSync16, mkdirSync as mkdirSync12, readdirSync as readdirSync9, copyFileSync as copyFileSync3, statSync as statSync4 } from "fs";
import { join as join17, dirname as dirname11 } from "path";
var REPLAYABLE_DESIGN_ROLES = /* @__PURE__ */ new Set([
  "spec-author",
  "architect-reviewer",
  "dba",
  "test-strategist",
  "ux-designer",
  "product-owner"
]);
function cp(src, dst) {
  if (!existsSync16(src)) return false;
  mkdirSync12(dirname11(dst), { recursive: true });
  copyFileSync3(src, dst);
  return true;
}
function cpDir(srcDir, dstDir) {
  if (!existsSync16(srcDir)) return false;
  let copied = false;
  mkdirSync12(dstDir, { recursive: true });
  for (const name of readdirSync9(srcDir)) {
    const s = join17(srcDir, name);
    if (!statSync4(s).isFile()) continue;
    copyFileSync3(s, join17(dstDir, name));
    copied = true;
  }
  return copied;
}
function replayDesignTurn(args) {
  const { turn, replayDir, consortDir, featureId } = args;
  const cf = join17(featuresDir(replayDir), featureId);
  const tf = join17(featuresDir(consortDir), featureId);
  switch (turn.role) {
    case "spec-author": {
      if (turn.mode === "propose") {
        return cp(join17(replayDir, "planning", "feature-proposals.md"), join17(consortDir, "planning", "feature-proposals.md"));
      }
      if (turn.mode === "breakdown") {
        let ok = cp(join17(cf, "feature-spec.json"), join17(tf, "feature-spec.json"));
        cp(join17(cf, "feature-spec.md"), join17(tf, "feature-spec.md"));
        const storiesSrc = join17(cf, "stories");
        if (existsSync16(storiesSrc)) {
          for (const s of readdirSync9(storiesSrc)) {
            cp(join17(storiesSrc, s, "story.json"), join17(tf, "stories", s, "story.json"));
            cp(join17(storiesSrc, s, "story.md"), join17(tf, "stories", s, "story.md"));
          }
        }
        return ok;
      }
      if (turn.story) {
        return cpDir(join17(cf, "stories", turn.story, "acs"), join17(tf, "stories", turn.story, "acs"));
      }
      return false;
    }
    case "architect-reviewer": {
      if (turn.mode === "estimate" || turn.mode === "estimate-committed") {
        return cp(join17(replayDir, "planning", "estimates.json"), join17(consortDir, "planning", "estimates.json"));
      }
      let ok = cp(join17(cf, "architecture.json"), join17(tf, "architecture.json"));
      cp(join17(cf, "architecture.md"), join17(tf, "architecture.md"));
      if (turn.story) {
        const acs = cpDir(join17(cf, "stories", turn.story, "acs"), join17(tf, "stories", turn.story, "acs"));
        ok = ok || acs;
      }
      return ok;
    }
    case "dba": {
      let ok = cp(join17(cf, "db-design.json"), join17(tf, "db-design.json"));
      cp(join17(cf, "db-design.md"), join17(tf, "db-design.md"));
      return ok;
    }
    case "test-strategist": {
      let ok = cp(join17(cf, "test-list.json"), join17(tf, "test-list.json"));
      cp(join17(cf, "test-list.md"), join17(tf, "test-list.md"));
      const story = turn.story;
      if (story) {
        cp(join17(cf, "stories", story, "test-list-per-ac.json"), join17(tf, "stories", story, "test-list-per-ac.json"));
      }
      return ok;
    }
    case "ux-designer": {
      let ok = cp(join17(replayDir, "design", "design-guide.json"), join17(consortDir, "design", "design-guide.json"));
      cp(join17(replayDir, "design", "design-guide.md"), join17(consortDir, "design", "design-guide.md"));
      cp(join17(replayDir, "design", "ia.md"), join17(consortDir, "design", "ia.md"));
      return ok;
    }
    default:
      return false;
  }
}
function restoreReflectVerdict(args) {
  const { replayDir, consortDir, featureId, story } = args;
  return cp(
    join17(featuresDir(replayDir), featureId, "stories", story, "reflect-verdict.json"),
    join17(featuresDir(consortDir), featureId, "stories", story, "reflect-verdict.json")
  );
}

// consort/logging/replay-build.ts
init_esm_shims();
import { existsSync as existsSync17, cpSync as cpSync3, readdirSync as readdirSync10, statSync as statSync5, rmSync as rmSync3, readFileSync as readFileSync16 } from "fs";
import { join as join18, relative } from "path";
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
    for (const name of readdirSync10(abs)) {
      const p = join18(abs, name);
      if (!keep(p)) continue;
      if (statSync5(p).isDirectory()) walk2(p);
      else out.add(relative(root, p));
    }
  };
  if (existsSync17(root)) walk2(root);
  return out;
}
function syncTreeFromSnapshot(codeSrc, projectDir) {
  const snapshot = inScopeFiles(codeSrc);
  for (const rel of inScopeFiles(projectDir)) {
    if (!snapshot.has(rel)) rmSync3(join18(projectDir, rel), { force: true });
  }
  cpSync3(codeSrc, projectDir, { recursive: true, force: true, filter: codeTreeFilter(codeSrc) });
}
function storyTurnsDir(replayBuildDir, featureId, story) {
  return join18(featuresDir(replayBuildDir), featureId, "stories", story, "turns");
}
function listBuildTurns(replayBuildDir, featureId, story) {
  const dir = storyTurnsDir(replayBuildDir, featureId, story);
  if (!existsSync17(dir)) return [];
  return readdirSync10(dir).filter((n) => !n.startsWith(".")).sort();
}
function replayBuildTurn(args) {
  const { replayBuildDir, projectDir, consortDir, featureId, story, turnIndex } = args;
  const turns = listBuildTurns(replayBuildDir, featureId, story).filter((n) => !/reflect/i.test(n));
  if (turnIndex < 1 || turnIndex > turns.length) return false;
  const turnDir = join18(storyTurnsDir(replayBuildDir, featureId, story), turns[turnIndex - 1]);
  const codeSrc = join18(turnDir, "code");
  if (!existsSync17(codeSrc)) return false;
  syncTreeFromSnapshot(codeSrc, projectDir);
  const REPLAYED_VERDICTS = ["review-verdict.json", "regression-assessment.json", "superseded-tests.json"];
  const cyclesSrc = join18(turnDir, "tdd", "cycles");
  if (existsSync17(cyclesSrc)) {
    cpSync3(cyclesSrc, cyclesRootDir(consortDir), {
      recursive: true,
      force: true,
      filter: (src) => statSync5(src).isDirectory() || REPLAYED_VERDICTS.some((v) => src.endsWith(v))
    });
  }
  return true;
}
function verdictFromStoryCyclesDir(storyCyclesDir) {
  if (!existsSync17(storyCyclesDir)) return void 0;
  let sawPass = false;
  for (const ac of readdirSync10(storyCyclesDir)) {
    const acDir = join18(storyCyclesDir, ac);
    if (!statSync5(acDir).isDirectory()) continue;
    const gf = join18(acDir, "green-failure.json");
    if (existsSync17(gf)) {
      try {
        if (JSON.parse(readFileSync16(gf, "utf8")).assessed === false) return "fail";
      } catch {
      }
    }
    for (const f of readdirSync10(acDir)) {
      if (!/^cycle-.*\.json$/.test(f)) continue;
      try {
        if (JSON.parse(readFileSync16(join18(acDir, f), "utf8")).green_at) sawPass = true;
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
    join18(storyTurnsDir(replayBuildDir, featureId, story), turns[turnIndex - 1], "tdd", "cycles", featureId, story)
  );
}
function liveBuildVerdict(consortDir, featureId, story) {
  return verdictFromStoryCyclesDir(join18(cyclesRootDir(consortDir), featureId, story));
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

// consort/logging/agent-log.ts
init_esm_shims();
import { appendFileSync, existsSync as existsSync18, mkdirSync as mkdirSync13, readFileSync as readFileSync17 } from "fs";
import { dirname as dirname12, join as join19 } from "path";

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

// consort/logging/agent-log.ts
function logFilePath(consortDir) {
  return join19(consortDir, "agent-log.jsonl");
}
function mirrorToRecordDir(text) {
  const recordDir = consortEnv("RECORD_DIR")?.trim();
  if (!recordDir) return;
  try {
    const dst = join19(recordDir, "agent-log.jsonl");
    mkdirSync13(dirname12(dst), { recursive: true });
    appendFileSync(dst, text, "utf8");
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
  appendFileSync(logFilePath(consortDir), line, "utf8");
  mirrorToRecordDir(line);
  return event;
}

// consort/gates/workflow-phase.ts
init_esm_shims();
import * as fs9 from "fs";
var PHASE_OWNER_KEY = "phase_feature_id";
function writeWorkflowPhase(consortDir, phase, featureId) {
  const file = workflowStateJson(consortDir);
  let state = {};
  if (fs9.existsSync(file)) {
    try {
      state = JSON.parse(fs9.readFileSync(file, "utf8"));
    } catch {
      state = {};
    }
  }
  state.phase = phase;
  if (featureId) state[PHASE_OWNER_KEY] = featureId;
  fs9.mkdirSync(consortDir, { recursive: true });
  fs9.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

// consort/orchestrator/settings/project-settings.ts
init_esm_shims();

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

// consort/session/claude-usage.ts
init_esm_shims();
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
init_esm_shims();
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

// consort/logging/orchestrator-logging.ts
init_esm_shims();

// consort/config/kit-bin.ts
init_esm_shims();
import { spawnSync as spawnSync2 } from "child_process";
import * as fs10 from "fs";
import * as path7 from "path";
var kitRootCache;
function resolveKitRoot2() {
  if (kitRootCache !== void 0) return kitRootCache;
  const env = process.env.LAKEBASE_KIT_DIR?.trim();
  kitRootCache = env && fs10.existsSync(path7.join(env, "package.json")) ? env : path7.resolve(__dirname, "..", "..", "..");
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
    const cand = path7.join(dir, "node_modules", SUBSTRATE_PKG);
    if (fs10.existsSync(path7.join(cand, "package.json"))) {
      substrateRoot = cand;
      return cand;
    }
    const parent = path7.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  substrateRoot = null;
  return null;
}
function resolveKitBinJs(bin) {
  if (kitBinMap === null) {
    try {
      const pkg = JSON.parse(fs10.readFileSync(path7.join(resolveKitRoot2(), "package.json"), "utf8"));
      kitBinMap = pkg.bin ?? {};
    } catch {
      kitBinMap = {};
    }
  }
  const rel = kitBinMap[bin];
  if (rel) return path7.join(resolveKitRoot2(), rel);
  const subRoot = resolveSubstrateRoot();
  if (subRoot) {
    if (substrateBinMap === null) {
      try {
        const pkg = JSON.parse(fs10.readFileSync(path7.join(subRoot, "package.json"), "utf8"));
        substrateBinMap = pkg.bin ?? {};
      } catch {
        substrateBinMap = {};
      }
    }
    const subRel = substrateBinMap[bin];
    if (subRel) return path7.join(subRoot, subRel);
  }
  return null;
}

// consort/orchestrator/drive/claude-runner.ts
import { readWorkflowState } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/setup/stray-artifact-recovery.ts
init_esm_shims();
import { existsSync as existsSync21, mkdirSync as mkdirSync15, cpSync as cpSync4, rmSync as rmSync4, readdirSync as readdirSync11, statSync as statSync6 } from "fs";
import { join as join21, dirname as dirname14, basename as basename2 } from "path";
function malformedSiblingRoot(projectDir) {
  const p = projectDir.replace(/\/+$/, "");
  return `${dirname14(p)}-${basename2(p)}`;
}
function listFilesRel(dir) {
  const out = [];
  const walk2 = (abs, rel) => {
    for (const entry of readdirSync11(abs)) {
      const childAbs = join21(abs, entry);
      const childRel = rel ? join21(rel, entry) : entry;
      if (statSync6(childAbs).isDirectory()) walk2(childAbs, childRel);
      else out.push(childRel);
    }
  };
  walk2(dir, "");
  return out;
}
function relocateStrayDesignArtifacts(projectDir) {
  const sibling = malformedSiblingRoot(projectDir);
  if (!existsSync21(sibling)) return { relocated: false, moved: [] };
  const moved = [];
  for (const artRoot of ALL_ARTIFACT_ROOTS) {
    const strayRoot = join21(sibling, artRoot);
    if (!existsSync21(strayRoot)) continue;
    for (const rel of listFilesRel(strayRoot)) moved.push(join21(artRoot, rel));
    const realRoot = join21(projectDir, artRoot);
    mkdirSync15(realRoot, { recursive: true });
    cpSync4(strayRoot, realRoot, { recursive: true, force: true });
    rmSync4(strayRoot, { recursive: true, force: true });
  }
  try {
    if (readdirSync11(sibling).length === 0) rmSync4(sibling, { recursive: true, force: true });
  } catch {
  }
  return moved.length > 0 ? { relocated: true, from: sibling, moved } : { relocated: false, moved: [] };
}

// consort/orchestrator/turns/turn-monitor.ts
init_esm_shims();
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
    const child = spawn(bin, args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
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
      `role '${role}' produced no ${label} under ${path8.basename(consortDir)}/ (expected one of: ${anyOf.join(", ")}).
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
function peekLastAgentTranscript(cwd) {
  return cwd !== void 0 ? lastAgentTranscriptByCwd.get(cwd) : lastAgentTranscript;
}
function recordAgentTranscript(cwd, tx) {
  lastAgentTranscript = tx;
  lastAgentTranscriptByCwd.set(cwd, tx);
}
var lastAgentUsage;
var lastAgentUsageByCwd = /* @__PURE__ */ new Map();
function peekLastAgentUsage(cwd) {
  return cwd !== void 0 ? lastAgentUsageByCwd.get(cwd) : lastAgentUsage;
}
function recordAgentUsage(cwd, usage) {
  lastAgentUsage = usage;
  lastAgentUsageByCwd.set(cwd, usage);
}
var lastTurnMeta;
var lastTurnMetaByCwd = /* @__PURE__ */ new Map();
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
    const child = spawn("claude", args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const lines = [];
    let sawTooLong = false;
    let sawTransient = false;
    const verboseAgent = !!consortEnv("VERBOSE_AGENT");
    const liveLogDir = consortEnv("RECORD_DIR")?.trim();
    let liveLog;
    if (liveLogDir) {
      try {
        fs11.mkdirSync(liveLogDir, { recursive: true });
        liveLog = fs11.openSync(path8.join(liveLogDir, "agent-live.log"), "a");
        const pIdxL = args.indexOf("-p"), rIdxL = args.indexOf("--agent");
        const role = rIdxL >= 0 ? args[rIdxL + 1] : "agent";
        const task = pIdxL >= 0 ? args[pIdxL + 1] ?? "" : "";
        fs11.writeSync(liveLog, `
=== ${(/* @__PURE__ */ new Date()).toISOString()} TURN START role=${role} :: ${task}
`);
      } catch {
        liveLog = void 0;
      }
    }
    const liveWrite = (s) => {
      if (liveLog === void 0) return;
      try {
        fs11.writeSync(liveLog, s);
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
        fs11.closeSync(liveLog);
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
  const allowed = [.../* @__PURE__ */ new Set([...cmd.allowedTools ?? [], ...browserAllowedToolsForRole(cmd.role)])];
  if (allowed.length) out.push("--allowed-tools", allowed.join(","));
  if (cmd.disallowedTools && cmd.disallowedTools.length) out.push("--disallowed-tools", cmd.disallowedTools.join(","));
  return out;
}
var UX_BROWSER_ALLOWED_TOOLS = ["mcp__playwright", "WebFetch", "WebSearch"];
function browserAllowedToolsForRole(role) {
  return role === "ux-designer" ? [...UX_BROWSER_ALLOWED_TOOLS] : [];
}
var UX_BROWSER_INSTALL_CMD = { command: "npx", args: ["--yes", "playwright@latest", "install", "chromium"] };
var uxBrowserEnsured = false;
function ensureUxBrowserChromium() {
  if (uxBrowserEnsured) return;
  uxBrowserEnsured = true;
  try {
    process.stderr.write("[drive] ensuring Playwright Chromium for the ux-designer browser (one-time)\u2026\n");
    execFileSync(UX_BROWSER_INSTALL_CMD.command, [...UX_BROWSER_INSTALL_CMD.args], { stdio: "ignore" });
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
            const id2 = randomUUID();
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
          const id = randomUUID();
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
            const st = fs11.statSync(p);
            return st.isDirectory() ? fs11.readdirSync(p).length > 0 : true;
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

// consort/orchestrator/agents/claude-step-agent.ts
var ClaudeStepAgent = class {
  constructor(levers, spawn3, liveDispatch) {
    this.levers = levers;
    this.spawn = spawn3 ?? spawnClaudeStreaming;
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
      this.sessionId = randomUUID2();
      return ["--session-id", this.sessionId];
    }
    this.sessionId = randomUUID2();
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
init_esm_shims();
import { readFileSync as readFileSync20, writeFileSync as writeFileSync12, existsSync as existsSync22, mkdirSync as mkdirSync17, cpSync as cpSync5, readdirSync as readdirSync13, statSync as statSync8 } from "fs";
import { join as join23, dirname as dirname15, relative as relative2, sep } from "path";
function makeMockReplayAgent(opts) {
  const role = opts.role ?? "product-owner";
  return {
    async invoke(invocation) {
      const materialized = [];
      for (const seed of opts.seeds) {
        const src = join23(opts.corpusRoot, seed.from);
        if (!existsSync22(src)) {
          throw new Error(
            `ReplayPoMockAgent: recorded seed for "${seed.outputId}" not found at ${src} \u2013 a replay cannot fabricate it. Check the corpus root + recorded path.`
          );
        }
        const dst = join23(invocation.workspaceDir, seed.to);
        if (seed.kind === "tree") {
          mkdirSync17(dst, { recursive: true });
          cpSync5(src, dst, { recursive: true, force: true, filter: codeTreeFilter(src) });
        } else {
          mkdirSync17(dirname15(dst), { recursive: true });
          writeFileSync12(dst, readFileSync20(src, "utf8"));
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
      const logPath = join23(invocation.workspaceDir, "agent-log.jsonl");
      const prior = existsSync22(logPath) ? readFileSync20(logPath, "utf8") : "";
      writeFileSync12(logPath, prior + JSON.stringify(event) + "\n");
    }
  };
}
var CORPUS_CURSORS = /* @__PURE__ */ new Map();
var BUILD_TURN_CURSORS = /* @__PURE__ */ new Map();
function actionSignature(a) {
  return JSON.stringify(a);
}
function resolveTurnsDir(corpusRoot) {
  const here = join23(corpusRoot, "turns");
  if (existsSync22(here)) return here;
  const parent = join23(dirname15(corpusRoot), "turns");
  if (existsSync22(parent)) return parent;
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
  for (const name of readdirSync13(turnsDir).sort()) {
    const dir = join23(turnsDir, name);
    const tj = join23(dir, "turn.json");
    if (!existsSync22(tj) || !statSync8(dir).isDirectory()) continue;
    try {
      const parsed = JSON.parse(readFileSync20(tj, "utf8"));
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
  const parts = rel.split(sep);
  if (parts.length > 0 && LEGACY_ARTIFACT_ROOTS.includes(parts[0])) {
    parts[0] = ARTIFACT_ROOT;
    return parts.join(sep);
  }
  return rel;
}
function materializeFiles(filesDir, workspaceDir) {
  const out = [];
  const walk2 = (abs) => {
    for (const name of readdirSync13(abs)) {
      const src = join23(abs, name);
      if (statSync8(src).isDirectory()) {
        walk2(src);
        continue;
      }
      const rel = remapArtifactRoot(relative2(filesDir, src));
      const dst = join23(workspaceDir, rel);
      mkdirSync17(dirname15(dst), { recursive: true });
      writeFileSync12(dst, readFileSync20(src));
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
      const filesDir = join23(turn.dir, "files");
      const materialized = existsSync22(filesDir) ? materializeFiles(filesDir, invocation.workspaceDir) : [];
      const role = invocation.action.kind === "invoke-role" ? invocation.action.role : "orchestrator";
      const event = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        role,
        event: "artifact.written",
        message: `replayed ${role} turn ${turn.dir.split(sep).pop()}: ${materialized.join(", ") || "(no files delta)"}`
      };
      const logPath = join23(invocation.workspaceDir, "agent-log.jsonl");
      const prior = existsSync22(logPath) ? readFileSync20(logPath, "utf8") : "";
      writeFileSync12(logPath, prior + JSON.stringify(event) + "\n");
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
        writeFileSync13(join24(invocation.workspaceDir, filename), contents);
      }
      const logPath = join24(invocation.workspaceDir, "agent-log.jsonl");
      const prior = existsSync23(logPath) ? readFileSync21(logPath, "utf8") : "";
      const event = { timestamp: (/* @__PURE__ */ new Date()).toISOString(), level: "info", role, event: "artifact.written", message: `mock wrote ${Object.keys(outputs).join(", ") || "(nothing)"}` };
      writeFileSync13(logPath, prior + JSON.stringify(event) + "\n");
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

// consort/orchestrator/state/escalation-probe.ts
init_esm_shims();

// consort/orchestrator/state/orchestrator-probe.ts
init_esm_shims();
import * as fs15 from "fs";
import * as path11 from "path";

// consort/pipeline/run-cycle.ts
init_esm_shims();
import { existsSync as existsSync25, mkdirSync as mkdirSync19, readdirSync as readdirSync15, readFileSync as readFileSync23, writeFileSync as writeFileSync15 } from "fs";
import { join as join26 } from "path";
import { getConnection } from "@databricks-solutions/lakebase-scm-utils/lakebase";

// consort/experiment/experiment.ts
init_esm_shims();
import { existsSync as existsSync24, mkdirSync as mkdirSync18, readdirSync as readdirSync14, readFileSync as readFileSync22, statSync as statSync9, writeFileSync as writeFileSync14 } from "fs";
import { join as join25 } from "path";
import { execFileSync as execFileSync2 } from "child_process";
import { createPairedBranch, deletePairedBranch } from "@databricks-solutions/lakebase-scm-utils/lakebase";
var RUNTIME_ARTIFACT_PREFIXES = [
  ...ALL_ARTIFACT_ROOTS.map((r) => `${r}/`),
  ".lakebase/",
  ".claude/agent-memory/"
];
function branchIdOf(info) {
  const leaf = info.name.split("/").pop();
  if (!leaf) throw new Error(`could not derive branch_id from ${info.name}`);
  return leaf;
}
function gitIsAncestor(cwd, ancestor, descendant) {
  try {
    execFileSync2("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"]
    });
    return true;
  } catch (err) {
    const code = err.status;
    if (code === 1) return false;
    throw err;
  }
}
function gitRevParse(cwd, ref) {
  try {
    return execFileSync2("git", ["rev-parse", "--verify", "--quiet", ref], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return "";
  }
}
function experimentsRoot(consortDir, featureId, storyId) {
  return join25(consortDir, "experiments", featureId, storyId);
}
function experimentDir(consortDir, featureId, storyId, slug) {
  return join25(experimentsRoot(consortDir, featureId, storyId), slug);
}
async function cutExperiment(args, deps = {}) {
  const { consortDir, projectDir, featureId, storyId, experimentSlug, branch, parentBranch, ttl, notes, resetStaleBranch, ...lookup } = args;
  const create = deps.createPairedBranch ?? createPairedBranch;
  const dropBranch = deps.deletePairedBranch ?? deletePairedBranch;
  try {
    const corpusPaths = [
      featuresDir(consortDir),
      planningDir(consortDir),
      sprintsDir(consortDir),
      workflowStateJson(consortDir),
      productOverviewMd(consortDir),
      nfrsMd(consortDir),
      designDir(consortDir),
      architectureDir(consortDir),
      // The UX Designer's MATERIALIZED design system: theme.css (:root tokens generated
      // from the guide) + global.css (its component classes). These are design-lane output
      // like the design corpus, but they live in client/src/ as TRACKED code — so left
      // uncommitted they trip the fail-closed tracked-source guard below and refuse the fork
      // ("experiment cut needs a clean tree"). Commit them here, pre-fork, so the build lane
      // inherits the design system and the tree is clean. Absent on a non-UI project (filtered).
      join25(projectDir, "client", "src", "styles", "theme.css"),
      join25(projectDir, "client", "src", "styles", "global.css")
    ].filter((p) => existsSync24(p));
    if (corpusPaths.length > 0) {
      execFileSync2("git", ["add", "--", ...corpusPaths], { cwd: projectDir });
      const staged = execFileSync2("git", ["diff", "--cached", "--name-only", "--", ...corpusPaths], { cwd: projectDir, encoding: "utf8" }).trim();
      if (staged) {
        execFileSync2("git", ["commit", "--no-verify", "-m", `design corpus: ${featureId}/${storyId} (pre-experiment persist)`, "--", ...corpusPaths], { cwd: projectDir });
      }
    }
  } catch {
  }
  let dirtyTracked = "";
  try {
    dirtyTracked = execFileSync2("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: projectDir, encoding: "utf8" }).split("\n").filter((l) => l.trim().length > 0 && !RUNTIME_ARTIFACT_PREFIXES.some((pfx) => l.slice(3).startsWith(pfx))).join("\n").trim();
  } catch {
    dirtyTracked = "";
  }
  if (dirtyTracked) {
    throw new Error(
      `cannot cut experiment "${experimentSlug}" for ${storyId}: there are uncommitted changes to tracked source files, which would silently ride onto the experiment fork and leave it building on the feature branch's uncommitted state. Commit or stash them first. Changed paths:
${dirtyTracked}`
    );
  }
  if (resetStaleBranch) {
    try {
      await dropBranch({ instance: lookup.instance, branch, cwd: projectDir });
    } catch {
    }
  }
  const paired = await create({
    instance: lookup.instance,
    branch,
    parentBranch,
    cwd: projectDir,
    createGitBranch: true,
    syncEnv: true,
    ...ttl ? { ttl } : { noExpiry: true }
  });
  if (!paired.envSynced) {
    throw new Error(
      `Experiment cut for "${branch}" did not populate .env with the branch's database connection` + (paired.warnings.length ? ` (${paired.warnings.join("; ")})` : "") + `. The build's honest-GREEN verify needs DATABASE_URL; aborting the cut so this is caught now, not at verify time.`
    );
  }
  if (parentBranch) {
    const localParentTip = gitRevParse(projectDir, parentBranch);
    if (localParentTip && !gitIsAncestor(projectDir, localParentTip, "HEAD")) {
      const head = gitRevParse(projectDir, "HEAD");
      throw new Error(
        `Experiment cut for "${branch}" forked the git branch from a commit that does NOT descend from the local "${parentBranch}" tip (${localParentTip.slice(0, 8)}); HEAD is ${head.slice(0, 8)}. The Lakebase branch was forked from "${parentBranch}"'s tier, so git and the database now disagree on the parent state (typically a stale origin/${parentBranch} used as the git fork start-point). Every DB-touching test would fail against a schema the committed code does not match. Push "${parentBranch}" (or fetch) so origin matches the local tip, then re-cut; aborting now so this is caught at the cut, not ~3 self-heal rounds later at HIL.`
      );
    }
  }
  const branchId = branchIdOf(paired.branch);
  const dir = experimentDir(consortDir, featureId, storyId, experimentSlug);
  mkdirSync18(dir, { recursive: true });
  writeFileSync14(join25(dir, "branch.txt"), branchId);
  writeFileSync14(
    join25(dir, "notes.md"),
    notes ?? `# ${experimentSlug}

Experiment cut from \`${parentBranch ?? "staging"}\`. Strategy + learning notes go here.
`
  );
  const outcomes = { status: "running" };
  writeFileSync14(join25(dir, "outcomes.json"), JSON.stringify(outcomes, null, 2) + "\n");
  writeFileSync14(
    join25(dir, "timeline.json"),
    JSON.stringify(
      { entries: [{ ts: (/* @__PURE__ */ new Date()).toISOString(), kind: "cut", branch: branchId }] },
      null,
      2
    ) + "\n"
  );
  return {
    feature_id: featureId,
    story_id: storyId,
    experiment_slug: experimentSlug,
    branch_id: branchId,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    dir
  };
}
function listExperiments(consortDir, featureId, storyId) {
  const root = experimentsRoot(consortDir, featureId, storyId);
  if (!existsSync24(root)) return [];
  const out = [];
  for (const slug of readdirSync14(root)) {
    const dir = join25(root, slug);
    if (!statSync9(dir).isDirectory()) continue;
    const branchFile = join25(dir, "branch.txt");
    if (!existsSync24(branchFile)) continue;
    out.push({
      feature_id: featureId,
      story_id: storyId,
      experiment_slug: slug,
      branch_id: readFileSync22(branchFile, "utf8").trim(),
      created_at: statSync9(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}
async function deleteExperiment(args) {
  const { consortDir, projectDir, featureId, storyId, experimentSlug, deleteBranchToo, ...lookup } = args;
  const dir = experimentDir(consortDir, featureId, storyId, experimentSlug);
  if (!existsSync24(dir)) {
    throw new Error(`experiment ${featureId}/${storyId}/${experimentSlug} not found at ${dir}`);
  }
  if (deleteBranchToo) {
    const branchId = readFileSync22(join25(dir, "branch.txt"), "utf8").trim();
    await deletePairedBranch({ instance: lookup.instance, branch: branchId, cwd: projectDir });
  }
}

// consort/pipeline/run-cycle.ts
function logCycleEvent(consortDir, event) {
  try {
    emitAgentLogEvent(event, { consortDir });
  } catch {
  }
}
function readAcLayer2(consortDir, featureId, acId) {
  return readAcLayer(consortDir, featureId, acId);
}
function coveredTestIds(c) {
  if (c.test_ids && c.test_ids.length > 0) return c.test_ids;
  return c.test_id ? [c.test_id] : [];
}
function cyclesDir(scope) {
  return join26(scope.consortDir, "cycles", scope.feature_id, scope.story_id, scope.ac_id);
}
function nextCycleId(scope) {
  const dir = cyclesDir(scope);
  if (!existsSync25(dir)) return "cycle-001";
  const ids = readdirSync15(dir).filter((f) => /^cycle-\d+\.json$/.test(f)).map((f) => parseInt(f.match(/cycle-(\d+)/)[1], 10)).sort((a, b) => a - b);
  const next = (ids.at(-1) ?? 0) + 1;
  return `cycle-${String(next).padStart(3, "0")}`;
}
function writeCycleArtifact(scope, artifact) {
  const dir = cyclesDir(scope);
  mkdirSync19(dir, { recursive: true });
  const file = join26(dir, `${artifact.cycle_id}.json`);
  writeFileSync15(file, JSON.stringify(artifact, null, 2) + "\n");
  return file;
}
function beginCycle(args) {
  const cycle_id = nextCycleId(args);
  const layer = args.layer ?? readAcLayer2(args.consortDir, args.feature_id, args.ac_id);
  const artifact = {
    cycle_id,
    feature_id: args.feature_id,
    story_id: args.story_id,
    ac_id: args.ac_id,
    test_id: args.test_id,
    test_description: args.test_description,
    experiment_slug: args.experiment_slug,
    branch_id: args.branch_id,
    navigator_plan: args.navigator_plan,
    red_at: (/* @__PURE__ */ new Date()).toISOString(),
    layer,
    ...args.test_ids && args.test_ids.length > 0 ? { test_ids: args.test_ids } : {},
    ...args.chunk ? { chunk: args.chunk } : {}
  };
  writeCycleArtifact(args, artifact);
  logCycleEvent(args.consortDir, {
    role: "navigator",
    level: "info",
    event: "cycle.red",
    feature_id: args.feature_id,
    cycle_id,
    slots: {
      test_id: args.test_id,
      ac: args.ac_id,
      asserts: args.test_description,
      layer,
      // Always carry the batch size (1 for a per-AC cycle, N for a story batch),
      // so a story-level RED reads as "N test(s)" instead of looking like a single
      // T1 cycle. Keep the full list in metadata for traceability.
      batch: args.test_ids && args.test_ids.length > 0 ? args.test_ids.length : 1
    }
  });
  return artifact;
}

// consort/pipeline/cycle-record.ts
init_esm_shims();
import { existsSync as existsSync34, readFileSync as readFileSync33, readdirSync as readdirSync22, statSync as statSync14, writeFileSync as writeFileSync21, mkdirSync as mkdirSync24, rmSync as rmSync8, copyFileSync as copyFileSync4 } from "fs";
import { join as join35, dirname as dirname19, basename as basename4 } from "path";

// consort/test-list/test-list.ts
init_esm_shims();

// consort/deploy/deploy.ts
init_esm_shims();
import { execSync as execSync2, spawn as spawn2 } from "child_process";
import { randomBytes } from "crypto";
import { existsSync as existsSync29, mkdirSync as mkdirSync22, readFileSync as readFileSync28, rmSync as rmSync6, writeFileSync as writeFileSync19 } from "fs";
import { dirname as dirname17, join as join30 } from "path";
import { readTargets } from "@databricks-solutions/lakebase-scm-utils/lakebase";
import { pollUntil } from "@databricks-solutions/lakebase-scm-utils/util";

// consort/gates/escalation.ts
init_esm_shims();
import * as fs12 from "fs";

// consort/smells/smells.ts
init_esm_shims();
import { existsSync as existsSync26, readFileSync as readFileSync24, writeFileSync as writeFileSync16 } from "fs";
import { createHash } from "crypto";
import { join as join27 } from "path";
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
  const file = join27(consortDir, "smells.json");
  if (!existsSync26(file)) return { detected: [] };
  return JSON.parse(readFileSync24(file, "utf8"));
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
  if (!existsSync26(f)) return "";
  try {
    return createHash("sha1").update(readFileSync24(f)).digest("hex");
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
  fs12.mkdirSync(escalationsDir(consortDir), { recursive: true });
  fs12.writeFileSync(file, JSON.stringify(full, null, 2) + "\n", "utf8");
  return full;
}
function readEscalationFile(file) {
  if (!fs12.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs12.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function readEscalations(consortDir) {
  const dir = escalationsDir(consortDir);
  if (!fs12.existsSync(dir)) return [];
  const out = [];
  for (const f of fs12.readdirSync(dir)) {
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
import * as fs13 from "fs";
import * as path9 from "path";
function scopePath(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return void 0;
  return storyId ? path9.join(fdir, "stories", storyId, "deploy-verify-scope.json") : path9.join(fdir, "deploy-verify-scope.json");
}
function readDeployVerifyScope(consortDir, featureId, storyId) {
  const file = scopePath(consortDir, featureId, storyId);
  if (!file || !fs13.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs13.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function markerPath(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return void 0;
  return storyId ? path9.join(fdir, "stories", storyId, "deploy-verify-assess.json") : path9.join(fdir, "deploy-verify-assess.json");
}
function readDeployVerifyAssessMarker(consortDir, featureId, storyId) {
  const file = markerPath(consortDir, featureId, storyId);
  if (!file || !fs13.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs13.readFileSync(file, "utf8"));
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
import { readdirSync as readdirSync17, readFileSync as readFileSync27, statSync as statSync11 } from "fs";
import { join as join29 } from "path";

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
  if (!existsSync29(file)) return void 0;
  try {
    return JSON.parse(readFileSync28(file, "utf8"));
  } catch {
    return void 0;
  }
}
function storyDeployVerified(consortDir, featureId, storyId) {
  const fdir = findFeatureDir(consortDir, featureId);
  if (!fdir) return false;
  return deployEvidencePasses(readDeployEvidence(join30(fdir, "stories", storyId, "deploy-evidence.json")));
}

// consort/architecture/design-adherence.ts
init_esm_shims();
import { existsSync as existsSync30, readFileSync as readFileSync29, readdirSync as readdirSync19 } from "fs";
import { join as join31 } from "path";

// consort/architecture/contract-clean.ts
init_esm_shims();
import { existsSync as existsSync31, readFileSync as readFileSync30, readdirSync as readdirSync20, statSync as statSync12 } from "fs";
import { join as join32, relative as relative3, extname } from "path";
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
import { existsSync as existsSync33, readFileSync as readFileSync32, readdirSync as readdirSync21, statSync as statSync13 } from "fs";
import { join as join34, relative as relative4, extname as extname2 } from "path";

// consort/pipeline/cycle-record.ts
import { commitAllIfChanged } from "@databricks-solutions/lakebase-scm-utils/git";
import { assertCommitTargetNotProtected, ProtectedBranchCommitError } from "@databricks-solutions/lakebase-scm-utils/lakebase";
function readStoryItems(consortDir, featureId, story) {
  const file = storyTestListJson(consortDir, featureId, story);
  if (!existsSync34(file)) {
    throw new Error(`per-story test-list not found for ${featureId}/${story} at ${file}`);
  }
  const data = JSON.parse(readFileSync33(file, "utf8"));
  return Array.isArray(data.items) ? data.items : [];
}
function storyExperiment(consortDir, featureId, story) {
  const exps = listExperiments(consortDir, featureId, story);
  const e = exps[0];
  return { slug: e?.experiment_slug, branch: e?.branch_id };
}
function storyCycles(consortDir, featureId, story) {
  const base = join35(cyclesRootDir(consortDir), featureId, story);
  if (!existsSync34(base)) return [];
  const out = [];
  for (const acDir of readdirSync22(base)) {
    const dir = join35(base, acDir);
    try {
      if (!statSync14(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const f of readdirSync22(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(readFileSync33(join35(dir, f), "utf8")));
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
function beginNextPendingBatch(args, opts) {
  const { consortDir, featureId, story } = args;
  const cap = opts?.cap && opts.cap > 0 ? opts.cap : DEFAULT_BATCH_CAP;
  const batch = nextPendingBatch(consortDir, featureId, story, cap);
  if (batch.length === 0) return { recorded: false };
  const headLayer = readAcLayer2(consortDir, featureId, batch[0].ac_id) ?? "_nolayer";
  const head = batch[0];
  const exp = storyExperiment(consortDir, featureId, story);
  const priorForLayer = storyCycles(consortDir, featureId, story).filter(
    (c) => (c.layer ?? "_nolayer") === headLayer
  ).length;
  const explicitLayer = headLayer === "_nolayer" ? void 0 : headLayer;
  const art = beginCycle({
    consortDir,
    feature_id: featureId,
    story_id: story,
    ac_id: head.ac_id,
    test_id: head.id,
    test_description: head.description,
    experiment_slug: exp.slug,
    branch_id: exp.branch,
    layer: explicitLayer,
    test_ids: batch.map((b) => b.id),
    chunk: `${headLayer}-${priorForLayer + 1}`
  });
  return { recorded: true, cycleId: art.cycle_id, testId: head.id, acId: head.ac_id };
}
function readReview(consortDir, featureId, story, acId) {
  const f = acReviewJson(consortDir, featureId, story, acId);
  if (!existsSync34(f)) return {};
  try {
    return JSON.parse(readFileSync33(f, "utf8"));
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
  if (!existsSync34(f)) return {};
  try {
    return JSON.parse(readFileSync33(f, "utf8"));
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

// consort/pipeline/design-fingerprint.ts
init_esm_shims();
import { createHash as createHash2 } from "crypto";
import { readFileSync as readFileSync34 } from "fs";
function storyDesignFingerprint(consortDir, feature, story) {
  try {
    const raw = readFileSync34(storyTestListJson(consortDir, feature, story), "utf8");
    const canonical = JSON.stringify(JSON.parse(raw));
    return createHash2("sha256").update(canonical).digest("hex").slice(0, 16);
  } catch {
    return void 0;
  }
}

// consort/gates/gates.ts
init_esm_shims();
import { existsSync as existsSync35, readFileSync as readFileSync35, renameSync, unlinkSync, writeFileSync as writeFileSync22 } from "fs";
import { join as join36 } from "path";
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
  if (!existsSync35(file)) {
    return defaultGatesState(featureId);
  }
  const raw = readFileSync35(file, "utf8");
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
  return join36(requireFeatureDir(consortDir, featureId), "gates.json");
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
import { existsSync as existsSync36, readFileSync as readFileSync36, writeFileSync as writeFileSync23, mkdirSync as mkdirSync25, rmSync as rmSync9 } from "fs";
var SMELL_FOR_OWNER = {
  "spec-author": "reflect-spec-defect",
  "test-strategist": "reflect-testlist-defect"
};
function readReflectVerdict(consortDir, feature, story) {
  const p = reflectVerdictJson(consortDir, feature, story);
  if (!existsSync36(p)) return void 0;
  try {
    return JSON.parse(readFileSync36(p, "utf8"));
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
import { existsSync as existsSync37, readFileSync as readFileSync37, writeFileSync as writeFileSync24, mkdirSync as mkdirSync26, readdirSync as readdirSync24 } from "fs";
function uniq(xs) {
  return [...new Set(xs.filter((x) => typeof x === "string" && x.length > 0))];
}
function readCanon(consortDir) {
  const f = architectureCanonJson(consortDir);
  if (!existsSync37(f)) return void 0;
  try {
    return JSON.parse(readFileSync37(f, "utf8"));
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

// consort/orchestrator/state/escalation-probe.ts
function deriveEscalation(consortDir, featureId, buildActive = null) {
  return diskArtifactProbe(consortDir, featureId, buildActive).pendingEscalation();
}
function probeDriveState(consortDir, featureId, buildActive = null) {
  return {
    phase: "feature",
    breakdownDone: true,
    storyOrder: [],
    stories: {},
    buildActive,
    escalation: deriveEscalation(consortDir, featureId, buildActive)
  };
}

// consort/orchestrator/turns/step-executor.ts
init_esm_shims();
import { existsSync as existsSync39 } from "fs";
import { join as join38 } from "path";

// consort/orchestrator/steps/step-contract.ts
init_esm_shims();
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
        action: raiseToHil(proposal.reason ?? "step requested escalation", stepSource(completed), storyOf(completed)),
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
          storyOf(proposal.proposedNext)
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
function storyOf(a) {
  return "story" in a && typeof a.story === "string" ? a.story : void 0;
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
    const abs = producedPaths.find((p) => p.endsWith(rel)) ?? join38(root, rel);
    if (!existsSync39(abs)) {
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

// consort/orchestrator/turns/agent-report-formatter.ts
init_esm_shims();
import { readFileSync as readFileSync39, writeFileSync as writeFileSync25, existsSync as existsSync40, appendFileSync as appendFileSync2, mkdirSync as mkdirSync27 } from "fs";
import { join as join39, dirname as dirname21 } from "path";
function extractReportBlock(text) {
  const labeled = text.match(/```agent-report\s*\n([\s\S]*?)```/);
  if (labeled) return labeled[1].trim();
  const anyFence = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (anyFence && /[[{]/.test(anyFence[1])) return anyFence[1].trim();
  return void 0;
}
function formatAgentReport(args) {
  const logPath = join39(args.workspaceDir, args.logFile ?? "agent-log.jsonl");
  let reportJson;
  let source;
  if (args.reportText !== void 0) {
    reportJson = extractReportBlock(args.reportText);
    source = "agent final message";
    if (reportJson === void 0) {
      return { ok: false, entries: 0, error: `no \`\`\`agent-report block in the agent's final message \u2013 it surfaced nothing about what it did.` };
    }
  } else {
    const reportPath = join39(args.workspaceDir, args.reportFile ?? ".agent-report.json");
    source = reportPath;
    if (!existsSync40(reportPath)) {
      return { ok: false, entries: 0, error: `agent report absent at ${reportPath} \u2013 the agent surfaced nothing about what it did.` };
    }
    reportJson = readFileSync39(reportPath, "utf8");
  }
  let raw;
  try {
    raw = JSON.parse(reportJson);
  } catch {
    raw = { message: reportJson.trim() };
  }
  const rawEntries = Array.isArray(raw) ? raw : [raw];
  if (rawEntries.length === 0) {
    return { ok: false, entries: 0, error: "agent report is empty (no entries)." };
  }
  const validate = getValidator("agent-log-event.schema.json");
  const formatted = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const [i, entry] of rawEntries.entries()) {
    const e = entry ?? {};
    if (typeof e.message !== "string" || e.message.trim().length === 0) {
      return { ok: false, entries: 0, error: `agent report entry ${i + 1} has an empty/missing message \u2013 the agent must author what it did.` };
    }
    const obj = {
      timestamp: now,
      level: e.level ?? "info",
      role: args.role,
      event: e.event ?? "artifact.written",
      message: e.message,
      ...e.metadata ? { metadata: e.metadata } : {}
    };
    if (!validate(obj)) {
      return { ok: false, entries: 0, error: `agent report entry ${i + 1} is nonconformant: ${formatSchemaErrors(validate).join("; ")}` };
    }
    formatted.push(JSON.stringify(obj));
  }
  const payload = formatted.join("\n") + "\n";
  if (existsSync40(logPath)) {
    appendFileSync2(logPath, payload);
  } else {
    mkdirSync27(dirname21(logPath), { recursive: true });
    writeFileSync25(logPath, payload);
  }
  return { ok: true, entries: formatted.length };
}

// consort/orchestrator/runners/manifest-runner.ts
function resolveInputsFromWorkspace(manifest, workspaceDir, featureId, action) {
  const story = "story" in action && typeof action.story === "string" ? action.story : "";
  const expand = (rel) => rel.replace(/\{feature\}/g, featureId).replace(/\{story\}/g, story);
  const out = {};
  for (const input of manifest.inputs) {
    const file = expand(input.source.replace(/^feature:/, ""));
    const p = join40(workspaceDir, file);
    if (!existsSync41(p)) {
      if (input.optional) continue;
      return { missing: input.id };
    }
    out[input.id] = readFileSync40(p, "utf8");
  }
  return out;
}
function defaultInstructions(manifest) {
  const outs = manifest.outputs.map((o) => o.filename).join(", ") || "(no static artifact)";
  return {
    prompt: `Run the ${manifest.role} step "${manifest.id}". Produce: ${outs}. Read only the provided inputs.`,
    guidelines: manifest.outputs.map((o) => `${o.filename}: ${o.description ?? o.id}`)
  };
}
function resolveAgent(manifest, deps) {
  if (deps.agentFor) return deps.agentFor(manifest);
  if (!manifest.agent) {
    throw new Error(
      `manifest-runner: manifest "${manifest.id}" declares no \`agent\` and no agentFor override was provided \u2013 cannot build a StepAgent.`
    );
  }
  return buildAgent(manifest.agent, { workspaceDir: deps.workspaceDir, ...deps.agentContext ?? {} });
}
function agentFinalText(agent) {
  const lr = agent.lastResult;
  return lr?.finalText;
}
var MAX_STEP_RETRIES = 1;
function executorWiring(manifest, action, deps, retries) {
  const agent = resolveAgent(manifest, deps);
  const step = new Step(manifest, agent);
  const captured = {};
  const validateBoundDeps = {
    allowed: (s) => {
      const proposal = step.route(action, { state: s, feature: deps.cfg.featureId });
      return proposal.proposedNext;
    },
    reviseBudgetAvailable: () => true,
    // Bound the blocked retry across the whole chain (retries persists per action signature):
    // one sanctioned re-issue, then THROW – no infinite re-spawn on a persistently-failing step.
    recordRetry: (completed) => {
      const key = JSON.stringify(completed);
      const n = (retries.get(key) ?? 0) + 1;
      if (n > MAX_STEP_RETRIES) {
        throw new Error(
          `manifest-runner: step ${key} emitted "blocked" past its retry budget (${MAX_STEP_RETRIES}) \u2013 aborting instead of re-spawning forever.`
        );
      }
      retries.set(key, n);
      return { sanctioned: true };
    }
  };
  const state = deps.state ?? (deps.probeEscalation ? probeDriveState(deps.cfg.consortDir, deps.cfg.featureId) : { phase: "feature" });
  const ctx = {
    action,
    cfg: deps.cfg,
    state,
    validateBoundDeps
  };
  const execDeps = {
    resolveInputs: () => resolveInputsFromWorkspace(manifest, deps.workspaceDir, deps.cfg.featureId, action),
    provisionWorkspace: () => deps.provisionWorkspace ? deps.provisionWorkspace(manifest, action) : { workspaceDir: deps.workspaceDir },
    instructionsFor: () => deps.instructionsFor ? deps.instructionsFor(manifest, action, deps.workspaceDir) : defaultInstructions(manifest),
    // Phase 2.5: PREPARE-PRECONDITIONS. A step that DECLARES preconditions (manifest.preconditions)
    // has each projected here by the registry preparer – from the SHARED workspace's `.consort` +
    // the action's story/ac – and appended to the prompt by the executor. This is the SAME
    // projection the real drive's roleTaskBody uses (one source of truth), so a manifest-driven
    // build turn is pre-conditioned identically to a dispatched one. A step declaring none never
    // calls this.
    prepare: (kind, pre, a) => {
      const story = "story" in a && typeof a.story === "string" ? a.story : "";
      const ac = "ac" in a && typeof a.ac === "string" ? a.ac : "";
      const mergedOptions = { ...pre.options ?? {}, ...deps.preconditionOptions?.[kind] ?? {} };
      return resolvePreparer(kind)({
        consortDir: deps.cfg.consortDir,
        featureId: deps.cfg.featureId,
        story,
        ac,
        // Thread the project root so a preparer can read project-level config (the test-analyst
        // roster preparer resolves project.uiTrack to gate the client analyst).
        ...deps.cfg.projectDir ? { projectDir: deps.cfg.projectDir } : {},
        ...Object.keys(mergedOptions).length > 0 ? { options: mergedOptions } : {}
      });
    },
    // When enabled, format the agent's report into a conformant agent-log.jsonl
    // (orchestrator-side) before validate-outputs – so a sandboxed agent that cannot run the
    // shared log subprocess still satisfies the agent-log requirement. The report travels as
    // the agent's FINAL MESSAGE (a ```agent-report block) – containment-proof, no file path
    // to misplace – with the .agent-report.json file as a fallback for agents that write one.
    // CRUCIAL: write the log at the SAME relative path validate-outputs will check – the
    // manifest's agent-log output filename, remapped by any provisionWorkspace outputPaths (a
    // real turn nests it under .consort/). Otherwise the formatter writes agent-log.jsonl at the
    // workspace root while validation looks under .consort/ and the turn wrongly blocks.
    ...deps.formatAgentReports ? {
      materializeOutputs: (workspaceDir) => {
        const provisioned = deps.provisionWorkspace ? deps.provisionWorkspace(manifest, action) : { outputPaths: void 0 };
        const logSpec = manifest.outputs.find((o) => o.id === "agent-log");
        const logFile = logSpec ? provisioned.outputPaths?.[logSpec.id] ?? logSpec.filename : void 0;
        const ft = agentFinalText(agent);
        const reportText = ft && ft.includes("```agent-report") ? ft : void 0;
        formatAgentReport({ workspaceDir, role: manifest.role, ...reportText !== void 0 ? { reportText } : {}, ...logFile ? { logFile } : {} });
      }
    } : {},
    // Capture the phase-6 record (telemetry: outer wall-clock + the agent's usage/finalText)
    // into the holder so the run functions can attach it to the turn, then forward to any
    // caller-supplied onRecord.
    onRecord: (record) => {
      captured.record = record;
      deps.onRecord?.(record);
    }
  };
  return { step, ctx, execDeps, captured };
}
function turnTelemetry(manifest, captured) {
  const r = captured.record;
  if (!r) return void 0;
  return {
    role: manifest.role,
    ...r.outerDurationMs !== void 0 ? { outerDurationMs: r.outerDurationMs } : {},
    ...r.agentResult ? { agentResult: r.agentResult } : {}
  };
}
async function runManifestChain(start, manifests, deps, options = {}) {
  const maxTurns = options.maxTurns ?? 20;
  const turns = [];
  const retries = /* @__PURE__ */ new Map();
  let action = start;
  while (action && turns.length < maxTurns) {
    const manifest = manifestForAction(action, manifests);
    if (!manifest) break;
    const { step, ctx, execDeps, captured } = executorWiring(manifest, action, deps, retries);
    const result = await execute(step, ctx, execDeps);
    turns.push({ manifestId: manifest.id, action, result, telemetry: turnTelemetry(manifest, captured) });
    action = result.bounded.action;
  }
  return turns;
}

// consort/orchestrator/provisioning/bundle.ts
init_esm_shims();
import { mkdirSync as mkdirSync28, cpSync as cpSync6, existsSync as existsSync42 } from "fs";
import { join as join41, dirname as dirname22 } from "path";
function layDownKitAgents(workspaceDir, kitDir = process.cwd()) {
  const src = join41(kitDir, "skills", "consort", "agents");
  if (!existsSync42(src)) throw new Error(`layDownKitAgents: kit agents dir not found at ${src}`);
  const dest = join41(workspaceDir, ".claude", "agents");
  mkdirSync28(dest, { recursive: true });
  cpSync6(src, dest, { recursive: true });
}
function overlayBundle(destRoot, overlay) {
  for (const t of overlay.trees ?? []) {
    cpSync6(t.from, join41(destRoot, t.to), { recursive: true });
  }
  for (const f of overlay.files ?? []) {
    const dst = join41(destRoot, f.to);
    mkdirSync28(dirname22(dst), { recursive: true });
    cpSync6(f.from, dst);
  }
}

// consort/orchestrator/scenarios/integration-chain.ts
async function runIntegrationChain(config) {
  const manifests = loadStepManifests(config.manifestDir);
  const workspaceDir = mkdtempSync(join42(tmpdir(), "integration-chain-"));
  mkdirSync29(join42(workspaceDir, ARTIFACT_ROOT), { recursive: true });
  layDownKitAgents(workspaceDir);
  config.seedWorkspace?.(workspaceDir);
  const agentContext = {
    corpusRoot: config.intakeDir,
    kitDir: process.cwd()
  };
  const recordedPrompt = config.recordedPromptFor?.(workspaceDir);
  const runnerDeps = {
    workspaceDir,
    cfg: {
      projectDir: workspaceDir,
      consortDir: join42(workspaceDir, ARTIFACT_ROOT),
      featureId: config.feature,
      ...recordedPrompt !== void 0 ? { instructionsOverride: () => recordedPrompt } : {}
    },
    agentContext,
    formatAgentReports: true,
    ...recordedPrompt !== void 0 ? {
      // The recorded prompt is the base body; the agent-report guideline is REQUIRED so the turn ends
      // with the structured report the orchestrator formats into agent-log.jsonl (the manifest's
      // navigatorLoggedAuthoring / *LoggedAuthoring output validator). Without it the turn produces its
      // artifact but the log-authoring output fails to validate and the step emits "blocked".
      instructionsFor: (_m, _a, _ws) => ({
        prompt: recordedPrompt,
        // NO added guideline: the recorded prompt is the turn's real instruction – it already tells the
        // agent how to log (via `scripts/lk consort-log`), which the lean workspace now provides
        // (scripts/lk shim + Bash restored). Adding a guideline that forbids commands or prescribes a
        // different channel would contradict the recording; the whole point is to replay it faithfully.
        // (formatAgentReports stays on as a harmless fallback if the agent also emits a report block.)
        guidelines: []
      })
    } : config.instructionsFor ? { instructionsFor: (m, _a, ws) => config.instructionsFor(m, ws) } : {},
    // Lever-injection seam: when a config.agentFor returns an override for a manifest, use it;
    // otherwise fall back to the catalogue (manifest.agent) so the seed/other steps are unchanged.
    // Only wired when config.agentFor is set, so the default run is byte-identical.
    ...config.agentFor ? {
      agentFor: (m) => {
        const override = config.agentFor(m);
        return override ?? buildAgent(m.agent, { workspaceDir, ...agentContext });
      }
    } : {},
    provisionWorkspace: (m) => {
      const outputPaths = config.outputPathsByRole?.[m.role];
      return outputPaths ? { workspaceDir, outputPaths } : { workspaceDir };
    },
    // Surface a turn's output-VALIDATION violations (the reason a step emits "blocked" + re-issues).
    // Previously computed but never shown, so a blocked lean turn aborted with only "blocked" and no
    // cause. Log them so the failing validator is visible (observability, not load-bearing).
    onRecord: (rec) => {
      if (rec.violations.length) {
        process.stderr.write(`[integration-chain] step ${JSON.stringify(rec.action)} VIOLATIONS: ${rec.violations.join(" ; ")}
`);
      }
    },
    ...config.preconditionOptions ? { preconditionOptions: config.preconditionOptions } : {}
  };
  process.env.LAKEBASE_KIT_DIR = process.cwd();
  try {
    const turns = await runManifestChain(config.start, manifests, runnerDeps);
    const producedArtifacts = snapshotTree(join42(workspaceDir, ARTIFACT_ROOT), workspaceDir);
    for (const root of config.extraSnapshotRoots ?? []) {
      Object.assign(producedArtifacts, snapshotTree(join42(workspaceDir, root), workspaceDir));
    }
    return { turns, workspaceDir, producedArtifacts };
  } finally {
    rmSync10(workspaceDir, { recursive: true, force: true });
  }
}
function snapshotTree(root, relTo) {
  const out = {};
  if (!existsSync43(root)) return out;
  const walk2 = (dir) => {
    for (const entry of readdirSync26(dir, { withFileTypes: true })) {
      const abs = join42(dir, entry.name);
      if (entry.isDirectory()) walk2(abs);
      else if (entry.isFile()) out[relative5(relTo, abs)] = readFileSync41(abs, "utf8");
    }
  };
  walk2(root);
  return out;
}

// consort/optimize/role-chains.ts
var MANIFESTS_REL = "tests/integration/manifests";
var INTAKE_REL = "tests/integration/intake";
var FEATURE = "F1-stock-visibility";
var STORY = "S1-file-stock";
var SNAPSHOT_ROOTS = ["features", "planning", "design"];
var PO_SEED = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
var REPORT_BLOCK = `As the LAST thing in your reply, emit a fenced report block:
\`\`\`agent-report
[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]
\`\`\`
`;
var NO_SHELL = ` Then STOP \u2013 do NOT run any shell command, do NOT run npx or ./scripts/lk, do NOT self-verify (the orchestrator validates your work). `;
var ROLE_CHAINS = {
  "spec-author-story": {
    name: "spec-author per-story ACs",
    dir: "spec-author-story-chain",
    outputFile: `features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json`,
    prompt: `You are the Spec Author. From the provided inputs (the product overview + the story stub, in this prompt \u2013 do NOT search the filesystem), draft the acceptance criteria for story ${STORY}. WRITE at least this file, relative to your current working directory:
  - features/${FEATURE}/stories/${STORY}/acs/AC1-file-stock-record.json
Each AC file is a JSON object whose "id" equals its basename (AC1-file-stock-record), with given/when/then and a status. Author real, testable criteria from the story stub.` + NO_SHELL + REPORT_BLOCK
  },
  "architect-reviewer": {
    name: "architect-reviewer per-story",
    dir: "architect-reviewer-chain",
    outputFile: `features/${FEATURE}/architecture.json`,
    prompt: `You are the Architect Reviewer. From the provided inputs (the NFR brief + the story AC, in this prompt), author the feature architecture. WRITE exactly this file, relative to your current working directory:
  - features/${FEATURE}/architecture.json
It MUST declare feature_id, an explicit service_backed boolean, layers[] (each role + module), and \u2013 when service_backed \u2013 persistence_invariants[] (each id/type/table/brief). This feature persists stock records, so it is service_backed with a real schema.` + NO_SHELL + REPORT_BLOCK
  },
  dba: {
    name: "dba per-story schema",
    dir: "dba-chain",
    outputFile: `features/${FEATURE}/db-design.json`,
    prompt: `You are the DBA. From the provided architecture.json (in this prompt \u2013 the architect owns the logical contract: service_backed, layers, persistence_invariants), produce the PHYSICAL schema. WRITE exactly this file, relative to your current working directory:
  - features/${FEATURE}/db-design.json
Declare feature_id, tables[] (columns with type/nullable, primary_key, unique_constraints, foreign_keys, checks, indexes), this story's schema_changes[], and realizes_invariants[] as a FLAT array of the architecture.json persistence_invariant id STRINGS (bare ids, not objects). Do NOT re-author the invariants; physically realize them.` + NO_SHELL + REPORT_BLOCK
  },
  "test-strategist": {
    name: "test-strategist per-story",
    dir: "test-strategist-chain",
    outputFile: `features/${FEATURE}/test-list.json`,
    // Judged against the RECORDED PER-TURN OUTPUT – the test-list turn 0018-driver-repair actually
    // wrote (extracted verbatim into the camp). NOT a hand-carved slice: the recorded turn's own
    // output is the honest reference, matching this isolated turn's scope by construction (same
    // inputs -> same scope). See feedback_judge_against_recorded_turn_output.
    referenceFile: `recorded-turns/0018-driver-repair/test-list.json`,
    prompt: `You are the Test Strategist, invoked for story ${STORY}. From the provided inputs (ALL of story ${STORY}'s ACs + architecture.json + db-design.json, in this prompt \u2013 do NOT search the filesystem), produce the feature master test list covering EVERY provided AC. WRITE exactly this file, relative to your current working directory:
  - features/${FEATURE}/test-list.json
Order the story's tests; map each test's ac_id to one of the provided ACs' EXACT ids, and cover each provided AC at least once. Cover EVERY architecture.json persistence_invariant with a real-branch fitness test that sets "invariant_id". Every DB-writing test must own its state (a per-run-unique key). Conform to test-list.schema.json.` + NO_SHELL + REPORT_BLOCK
  },
  "spec-author-propose": {
    name: "spec-author propose (sprint plan lane)",
    dir: "spec-author-propose-chain",
    outputFile: `planning/feature-proposals.md`,
    prompt: `You are the Spec Author in the sprint plan lane. From the provided product overview + NFR brief (in this prompt), propose the sprint's candidate features. WRITE exactly this file, relative to your current working directory:
  - planning/feature-proposals.md
One candidate feature per section (a heading + a short scope), so the Architect can size them and the PO can commit a backlog.` + NO_SHELL + REPORT_BLOCK
  },
  "architect-estimator": {
    name: "architect-estimator (estimate)",
    dir: "architect-estimator-chain",
    outputFile: `planning/estimates.json`,
    // The isolated estimate turn is seeded ONLY the sprint proposals (feature-proposals.md), so it can
    // produce ONLY the sprint-candidate (FP) estimates. The accreted estimates.json ALSO carries the
    // F1/F6 committed-feature sizes that sync-backlog added LATER (not this turn). Judge against the
    // RECORDED PER-TURN OUTPUT – the estimate turn 0001-architect-reviewer-estimate actually wrote
    // (extracted verbatim into the camp), whose scope matches this isolated turn by construction. NOT
    // a hand-carved slice. See feedback_judge_against_recorded_turn_output.
    referenceFile: `recorded-turns/0001-architect-reviewer-estimate/planning/estimates.json`,
    prompt: `You are the Architect estimating the sprint's candidate features. From the provided feature-proposals.md (in this prompt), t-shirt size each candidate. WRITE exactly this file, relative to your current working directory:
  - planning/estimates.json
A JSON array (or object) of per-candidate {feature_id/name, size (one of XS/S/M/L/XL), rationale}. Size every candidate the proposals name.` + NO_SHELL + REPORT_BLOCK
  },
  "ux-designer": {
    name: "ux-designer (design system)",
    dir: "ux-designer-chain",
    outputFile: `design/design-guide.json`,
    prompt: `You are the UX Designer. From the provided inputs (the HIL design brief + the product overview, in this prompt \u2013 do NOT search the filesystem), translate the brief into the project's machine-checkable design system. WRITE exactly this file, relative to your current working directory:
  - design/design-guide.json
Realize EVERY element the brief names: all token scales (typography, colors, spacing, radius, shadows, breakpoints) at every level the brief enumerates, and a "components" block with an entry for EACH reusable UI component the brief describes (navbar, page, card, button, form input, table, status badge, empty state, and any others named), each with its class + notes. Conform to design-guide.schema.json. Cover the brief exhaustively \u2013 a missing token level, asset, or component is a defect.` + NO_SHELL + REPORT_BLOCK
  }
};
async function runRoleChainLive(chain, opts = {}) {
  const kit = opts.kitDir ?? process.cwd();
  const { turns, producedArtifacts } = await runIntegrationChain({
    manifestDir: join43(kit, MANIFESTS_REL, chain.dir),
    intakeDir: join43(kit, INTAKE_REL),
    feature: FEATURE,
    start: PO_SEED,
    // A design role writes its output at the WORKSPACE ROOT (features/... or planning/...), NOT
    // under .consort/. The default snapshot is .consort-only, so without this the produced artifact is
    // never captured in producedArtifacts – which means the QUALITY GATE (which keys on
    // producedArtifacts[chain.outputFile]) SILENTLY SKIPS and the artifact is not preserved (the
    // exact scoreless-sweep defect #556 exists to prevent). Snapshot the design output roots so the
    // produced file lands under its workspace-relative path (== chain.outputFile).
    extraSnapshotRoots: [...SNAPSHOT_ROOTS],
    // The live-role manifest declares agent.kind "claude" (unchanged even when the sweep
    // overrides the built agent via agentFor); the seed declares "replay". Prompt only the live role.
    instructionsFor: (m) => m.agent?.kind === "claude" ? { prompt: chain.prompt, guidelines: [`Write ONLY ${chain.outputFile}; end with the agent-report block; run no command.`] } : { prompt: `Replay-seed for ${chain.name}.`, guidelines: [] },
    ...opts.agentFor ? { agentFor: opts.agentFor } : {},
    // TEST-STRATEGIST sweep: thread per-analyst overrides into the roster preparer's options so the
    // supervisor spawns each analyst Task with the swept levers (the sub-agent optimization target).
    ...opts.analystOverrides ? { preconditionOptions: { "test-analyst-roster": { analystOverrides: opts.analystOverrides } } } : {}
  });
  return { turns, producedArtifacts };
}

// consort/optimize/build-role-chains.ts
init_esm_shims();
import { join as join44 } from "path";
var BUILD_MANIFESTS_REL = "tests/integration/manifests";
var BUILD_CORPUS_REL = "consort/evaluation/reference-assets/stockflow";
var BUILD_FEATURE = "F6-split-tracking-code";
var BUILD_STORY = "S3-stock-shows-split-fields";
var ASSESS_STORY = "S1-split-columns-migration";
var ASSESS_AC = "AC1-batch-serial-columns-added";
var BUILD_PO_SEED = { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
var REPORT_BLOCK2 = `As the LAST thing in your reply, emit a fenced report block:
\`\`\`agent-report
[{ "level": "info", "event": "artifact.written", "message": "<one line: what you wrote>" }]
\`\`\`
`;
var NO_SHELL2 = ` Then STOP \u2013 do NOT run any shell command, do NOT run npx or ./scripts/lk, do NOT self-verify (the orchestrator validates your work). `;
var AC_CYCLE_DIR = cycleDir(ARTIFACT_ROOT, BUILD_FEATURE, ASSESS_STORY, ASSESS_AC);
var REVIEW_VERDICT_PATH = acReviewVerdictJson(ARTIFACT_ROOT, BUILD_FEATURE, ASSESS_STORY, ASSESS_AC);
var REFLECT_VERDICT_PATH = `features/${BUILD_FEATURE}/stories/${BUILD_STORY}/reflect-verdict.json`;
var BUILD_ROLE_CHAINS = {
  "navigator-red": {
    name: "navigator RED (author the story's failing tests)",
    dir: "navigator-red-chain",
    start: { kind: "invoke-role", role: "navigator", story: BUILD_STORY },
    assertKind: "red",
    outputFile: "tests",
    extraSnapshotRoots: ["tests"],
    prompt: `You are the Navigator authoring the FAILING (RED) tests for story ${BUILD_STORY}. From the provided design (the test list + the story's acceptance criteria + architecture + db-design, in this prompt), WRITE the story's tests under tests/ (relative to your current working directory). Cover EVERY test-list item for this story; each test must FAITHFULLY assert its item's requirement (the right behavior/invariant), and any DB-writing test must own its own state (a per-run-unique key), never an absolute whole-table assertion. Write real, runnable test code (pytest under tests/, Vitest under client/tests where the item is a UI test).` + NO_SHELL2 + REPORT_BLOCK2
  },
  "navigator-assess": {
    name: "navigator ASSESS (discriminate a failed GREEN)",
    dir: "navigator-assess-chain",
    start: { kind: "invoke-role", role: "navigator", story: ASSESS_STORY, buildMode: "assess", ac: ASSESS_AC },
    assertKind: "assess",
    outputFile: AC_CYCLE_DIR,
    extraSnapshotRoots: ["tests", "app", "client"],
    prompt: `You are the Navigator ASSESSING a failed honest-GREEN verify for AC ${ASSESS_AC} in story ${ASSESS_STORY}. The Driver made the current test pass, but the full-suite verify FAILED \u2013 some test(s) now fail. START from green-failure.json in your AC cycle dir (${AC_CYCLE_DIR}/) \u2013 its summary localizes WHICH suite failed, and if it carries a supersededTestRefs / contractRefs advisory, TRUST that pre-localized set (flag EXACTLY those; do NOT re-search the test tree). Otherwise use Grep/Glob to jump to the named failing test + the symbol it imports (the LAYOUT below names the paths) \u2013 do NOT Read every file. In a few targeted lookups confirm the root cause, then DECIDE, writing EXACTLY ONE marker file (relative to your current working directory), into ${AC_CYCLE_DIR}/:
  (a) SUPERSEDED \u2013 if this AC intentionally supersedes behavior the failing PRIOR tests encode (the latest AC wins), write superseded-tests.json = {"tests":["<path>", ...], "reason":"<new AC + what changed>"}.
  (b) REGRESSION \u2013 if the failure is a genuine bug in the Driver's code (this AC does NOT intend to change that behavior), write regression-assessment.json = {"diagnosis":"<root cause: which behavior broke + why>", "fixDirective":"<what the Driver should change>"}. OMIT fixDirective ONLY when it needs a human / a design change.
Write ONLY the ONE correct marker. Do NOT edit product code or tests in this turn.` + NO_SHELL2 + REPORT_BLOCK2
  },
  "navigator-review": {
    name: "navigator REVIEW (evaluate the driver's code against design NFRs)",
    dir: "navigator-review-chain",
    start: { kind: "invoke-role", role: "navigator", story: ASSESS_STORY, buildMode: "review", ac: ASSESS_AC },
    assertKind: "review",
    outputFile: REVIEW_VERDICT_PATH,
    extraSnapshotRoots: ["tests", "app", "client"],
    verdictFile: REVIEW_VERDICT_PATH,
    prompt: `You are the Navigator REVIEWING the Driver's code after a successful honest-GREEN for AC ${ASSESS_AC} in story ${ASSESS_STORY}. The Driver's implementation passed all tests. Your task: evaluate whether the Driver's code respects the DESIGN NFRs (layer boundaries, naming conventions, cohesion, testability). From the provided architecture contract + design conventions, INSPECT the code tree (app/, tests/, client/) and determine if refactoring is warranted (design debt / cleanups / minor improvements) or if the code already adheres cleanly to the design.
Write a single verdict file into ${REVIEW_VERDICT_PATH} (relative to your current working directory):
  review-verdict.json = {"refactor": <bool>, "notes": "<analysis of NFR compliance + concrete improvement suggestions if refactor=true, or 'no improvement' if false>"}.
Do NOT edit product code or tests. Run no command.` + NO_SHELL2 + REPORT_BLOCK2
  },
  "navigator-reflect": {
    name: "navigator REFLECT (evaluate design completeness at story end)",
    dir: "navigator-reflect-chain",
    start: { kind: "invoke-role", role: "navigator", story: BUILD_STORY, buildMode: "reflect" },
    assertKind: "reflect",
    outputFile: REFLECT_VERDICT_PATH,
    extraSnapshotRoots: ["tests", "app", "client"],
    verdictFile: REFLECT_VERDICT_PATH,
    prompt: `You are the Navigator REFLECTING at the end of story ${BUILD_STORY}. The feature has passed all test-list items, all acceptance criteria, and design review. Your task: evaluate whether the design is COMPLETE + CONSISTENT: have all design decisions been faithfully implemented? Are there unresolved design gaps or inconsistencies between the spec (test-list, ACs, architecture) and the produced code?
Inspect the produced tree (app/, tests/, client/) against the design (test-list, ACs, architecture, db-design, conventions). Evaluate the following dimensions:
  - Test coverage completeness (every test-list item + AC covered)
  - Architecture compliance (layers, boundaries, responsibilities)
  - DB schema alignment (migrations, constraints, schema)
  - Design token delivery (if visual)
  - Naming + conventions (module layout, symbol names, file structure)
Write a single verdict file into ${REFLECT_VERDICT_PATH} (relative to your current working directory):
  reflect-verdict.json = {"version": 1, "passed": <bool>, "findings": ["<gap or inconsistency if passed=false>", ...]}.
Do NOT edit product code or specs. Run no command.` + NO_SHELL2 + REPORT_BLOCK2
  }
};
async function runBuildRoleChainLive(chain, opts = {}) {
  const kit = opts.kitDir ?? process.cwd();
  const { turns, producedArtifacts } = await runIntegrationChain({
    manifestDir: join44(kit, BUILD_MANIFESTS_REL, chain.dir),
    intakeDir: join44(kit, BUILD_CORPUS_REL),
    feature: BUILD_FEATURE,
    start: BUILD_PO_SEED,
    extraSnapshotRoots: chain.extraSnapshotRoots,
    instructionsFor: (m, _ws) => m.agent?.kind === "claude" ? {
      // Just the base directive – the pre-conditioning (RED's context-pack; ASSESS's
      // green-failure advisory) is now DECLARED on the manifest's `preconditions` and
      // PREPARED + appended by the executor's PREPARE-PRECONDITIONS phase, against the
      // SEEDED workspace .consort. So the isolated turn is pre-conditioned by the SAME
      // mechanism as a dispatched one, with no per-chain prompt assembly (and the assess
      // chain now gets the green-failure advisory the real assess uses, not a context-pack).
      prompt: chain.prompt,
      guidelines: [`Author your output as instructed; end with the agent-report block; run no command.`]
    } : { prompt: `Replay-seed the pre-turn state for ${chain.name}.`, guidelines: [] },
    ...opts.agentFor ? { agentFor: opts.agentFor } : {}
  });
  return { turns, producedArtifacts };
}

// tests/optimization/role-levers.ts
init_esm_shims();
var BASELINE_ID = "baseline";
var MODEL_TIERS = ["haiku", "sonnet", "opus"];
function otherModels(base) {
  return MODEL_TIERS.filter((m) => m !== base);
}
var CHEAPER_EFFORTS = ["low", "medium"];
function scanTightPatch() {
  return { disallowedTools: ["Grep", "Glob"] };
}
function roleCandidates(baseModel, caps = {}) {
  const others = otherModels(baseModel);
  const out = [{ id: BASELINE_ID, levers: {} }];
  for (const m of others) out.push({ id: `m-${m}`, levers: { model: m } });
  for (const e of CHEAPER_EFFORTS) out.push({ id: `e-${e}`, levers: { effort: e } });
  for (const m of others) out.push({ id: `m-${m}-e-low`, levers: { model: m, effort: "low" } });
  out.push({ id: "scan-tight", levers: scanTightPatch() });
  if (caps.multiTurn) out.push({ id: "session-warm", levers: { session: "resume" } });
  return out;
}
function testStrategistCandidates(enabledKinds) {
  const has = (k) => enabledKinds.includes(k);
  const pick = (ov) => {
    const out2 = {};
    for (const [k, v] of Object.entries(ov)) if (has(k)) out2[k] = v;
    return out2;
  };
  const out = [{ id: BASELINE_ID, levers: {} }];
  if (has("fitness")) out.push({ id: "a-fitness-opus", levers: { analystOverrides: pick({ fitness: { model: "opus" } }) } });
  if (has("behavior")) out.push({ id: "a-behavior-haiku", levers: { analystOverrides: pick({ behavior: { model: "haiku" } }) } });
  out.push({
    id: "a-all-low",
    levers: { analystOverrides: pick({ behavior: { effort: "low" }, fitness: { effort: "low" }, client: { effort: "low" } }) }
  });
  out.push({
    id: "a-cheap-hold-fit",
    levers: {
      analystOverrides: pick({ behavior: { model: "haiku", effort: "low" }, client: { model: "haiku", effort: "low" }, fitness: { model: "sonnet", effort: "high" } })
    }
  });
  if (has("fitness")) out.push({ id: "a-fitness-low", levers: { analystOverrides: pick({ fitness: { effort: "low" } }) } });
  const analystsLow = pick({ behavior: { effort: "low" }, fitness: { effort: "low" }, client: { effort: "low" } });
  out.push({ id: "s-low", levers: { effort: "low" } });
  out.push({ id: "s-haiku", levers: { model: "haiku" } });
  out.push({ id: "s-low+a-all-low", levers: { effort: "low", analystOverrides: analystsLow } });
  out.push({ id: "s-haiku+a-all-low", levers: { model: "haiku", effort: "low", analystOverrides: analystsLow } });
  return out;
}
function driverGreenCandidates() {
  return [
    { id: "ctx-test", levers: { ctxPack: ["failing-test"] } },
    { id: "scope-note", levers: { ctxPack: ["scope-note"] } },
    { id: "ctx-test-scope", levers: { ctxPack: ["failing-test", "scope-note"] } },
    { id: "single-test-guard", levers: { guardSuite: true } },
    // CROSS-AXIS comparison point (NOT scoping): the effort lever. Kept scored so the scoping levers
    // can be read against a pure model-inference-param change (does thinking-less alone go faster, and
    // does the one-turn green still hold?). Effort/model tiers are otherwise a separate study.
    { id: "e-low", levers: { effort: "low" } },
    // COMBINED: the fastest scoping lever (ctx-test) crossed with think-less (e-low) – does handing the
    // failing test AND lowering effort keep the speed win while holding the determination aligned?
    { id: "ctx-test-elow", levers: { ctxPack: ["failing-test"], effort: "low" } },
    // COMBINED + MODEL TIER: ctx-test-elow on OPUS – the one deliberate model-tier point (does a more
    // capable model + scoping + think-less hold the determination aligned where sonnet ctx-test diverged?).
    { id: "opus-ctx-test-elow", levers: { model: "opus", ctxPack: ["failing-test"], effort: "low" } },
    // MODEL TIER (normal effort): ctx-test on OPUS without think-less – isolates the model-tier effect
    // from the effort lever (does opus at default effort converge tighter / align better than opus-elow?).
    { id: "opus-ctx-test", levers: { model: "opus", ctxPack: ["failing-test"] } },
    // ctx-test x MEDIUM effort on opus – the untested KNEE of the ctx-test effort ladder (low=fast but
    // 1/3 milestone; default/high=377s 3/3). Does medium keep opus fast AND reliably at the milestone?
    { id: "opus-ctx-test-emedium", levers: { model: "opus", ctxPack: ["failing-test"], effort: "medium" } },
    // ctx-test x HIGH effort on opus – the top of the repair effort ladder (repair is harder than green;
    // medium gave PARITY (regression) on driver-repair, so more effort may be what RESOLVES it to equivalent).
    { id: "opus-ctx-test-ehigh", levers: { model: "opus", ctxPack: ["failing-test"], effort: "high" } },
    // The 237s winner + ctx-migration: hand the driver the migration mechanism (path + create command +
    // models loc) so it skips the opening discovery (it grepped scripts/lk to find lakebase-new-migration).
    { id: "opus-ctx-test-emedium-migration", levers: { model: "opus", ctxPack: ["failing-test", "migration"], effort: "medium" } },
    // OPUS-NORMAL x the OTHER levers – explore which scoping/enforcement lever best reaches the clean-code
    // + superseded-shift MILESTONE on opus at default effort (opus-ctx-test already hits it 3/3).
    { id: "opus", levers: { model: "opus" } },
    // bare control: does opus reach the milestone WITHOUT scoping context?
    { id: "opus-scope-note", levers: { model: "opus", ctxPack: ["scope-note"] } },
    { id: "opus-ctx-test-scope", levers: { model: "opus", ctxPack: ["failing-test", "scope-note"] } },
    { id: "opus-single-test-guard", levers: { model: "opus", guardSuite: true } },
    // BARE OPUS x EFFORT – the FULL ladder, to LOCATE where the manifest "default" effort (what bare
    // `opus` runs) actually sits, then take the LOWEST rungs BELOW default that still hit the milestone
    // (clean code + superseded-shift) for the n=3 faster-while-holding confirmation. Ladder:
    // low < medium < high < xhigh < max (default = the model's own default, measured via bare `opus`).
    { id: "opus-e-low", levers: { model: "opus", effort: "low" } },
    { id: "opus-e-medium", levers: { model: "opus", effort: "medium" } },
    { id: "opus-e-high", levers: { model: "opus", effort: "high" } },
    { id: "opus-e-xhigh", levers: { model: "opus", effort: "xhigh" } },
    { id: "opus-e-max", levers: { model: "opus", effort: "max" } }
  ];
}

// tests/optimization/driver-green-enforcement.ts
init_esm_shims();
import { mkdirSync as mkdirSync30, readFileSync as readFileSync42, writeFileSync as writeFileSync26, existsSync as existsSync44, chmodSync } from "fs";
import { dirname as dirname23, join as join45 } from "path";

// node_modules/js-yaml/dist/js-yaml.mjs
init_esm_shims();
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// tests/optimization/driver-green-enforcement.ts
var BASE_DEPLOY_PORT = 8100;
function deployPortForIndex(index) {
  return BASE_DEPLOY_PORT + Math.max(0, index);
}
function assignWorktreePort(projectDir, port) {
  const file = join45(projectDir, "deploy-targets.yaml");
  const doc = load(readFileSync42(file, "utf8")) ?? {};
  const local = doc.targets?.local;
  if (!local) throw new Error(`assignWorktreePort: no 'local' target in ${file}`);
  const baseUrl = `http://localhost:${port}`;
  local.base_url = baseUrl;
  local.run = `uv run --env-file .env uvicorn app.main:app --host 127.0.0.1 --port ${port}`;
  writeFileSync26(file, dump(doc), "utf8");
  return baseUrl;
}
function guardHookScript(opts) {
  return `#!/usr/bin/env python3
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # unparseable -> do not block
cmd = ((data.get("tool_input") or {}).get("command") or "")
SUITE = ${opts.suite ? "True" : "False"}
SCAN = ${opts.scan ? "True" : "False"}
def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}}))
    sys.exit(0)
# Split into &&/||/;/| segments so a verb anywhere in a compound/pipeline is seen.
segs, buf, i = [], "", 0
while i < len(cmd):
    if cmd[i:i+2] in ("&&", "||"):
        segs.append(buf); buf = ""; i += 2; continue
    if cmd[i] in ";|":
        segs.append(buf); buf = ""; i += 1; continue
    buf += cmd[i]; i += 1
segs.append(buf)
SCAN_VERBS = {"ls", "find", "grep", "rg", "egrep", "fgrep", "tree"}
def is_path(a):
    return a.endswith(".py") or a.endswith(".tsx") or a.endswith(".ts") or "::" in a or a.startswith("tests") or a.startswith("client/")
for seg in segs:
    toks = seg.split()
    while toks and ("=" in toks[0]) and toks[0].split("=")[0].isidentifier():
        toks = toks[1:]  # drop leading VAR=val env assignments
    if not toks:
        continue
    verb = toks[0].split("/")[-1]
    args = toks[1:]
    if SCAN and verb in SCAN_VERBS:
        deny("Directory scanning blocked (guard-scan): use the injected LAYOUT + named paths; do NOT ls/find/grep/tree to locate files.")
    if SUITE:
        rt = [t for t in toks if t.split("/")[-1] == "run-tests.sh"]
        if rt and not any(is_path(a) for a in toks[toks.index(rt[0])+1:]):
            deny("Full test suite blocked (single-test-guard): run only the failing test, e.g. 'uv run --env-file .env pytest <path>'. The orchestrator runs the authoritative full suite post-turn.")
        if verb == "make" and args[:1] == ["test"]:
            deny("Full test suite blocked (single-test-guard): 'make test' runs everything; run 'uv run --env-file .env pytest <path>' for the single failing test.")
        if verb == "npm" and "test" in toks:
            deny("Full client suite blocked (single-test-guard): run one vitest file, e.g. 'npx vitest run <path>'.")
        if "pytest" in toks:
            rest = toks[toks.index("pytest")+1:]
            if not any(is_path(a) for a in rest) and not any(a in ("-k", "-m") for a in rest):
                deny("Full test suite blocked (single-test-guard): 'pytest' with no path runs everything; pass the single failing test path.")
sys.exit(0)
`;
}
var SINGLE_TEST_GUARD_HOOK = guardHookScript({ suite: true, scan: false });
var GUARD_HOOK_REL = ".claude/hooks/driver-guard.py";
function readSettings(file) {
  if (!existsSync44(file)) return {};
  try {
    return JSON.parse(readFileSync42(file, "utf8"));
  } catch {
    return {};
  }
}
function ctxPackEnv(ctxPack) {
  const env = {};
  for (const s of ctxPack ?? []) {
    if (s === "db-state") env.LAKEBASE_CONSORT_CTX_DBSTATE = "1";
    if (s === "failing-test") env.LAKEBASE_CONSORT_CTX_FAILINGTEST = "1";
    if (s === "scope-note") env.LAKEBASE_CONSORT_CTX_SCOPENOTE = "1";
    if (s === "migration") env.LAKEBASE_CONSORT_CTX_MIGRATION = "1";
  }
  return env;
}
function applyDriverLevers(workspaceDir, levers, consortDir) {
  const env = ctxPackEnv(levers.ctxPack);
  const result = { env };
  if ((levers.ctxPack?.length ?? 0) > 0 && consortDir) {
    const markerPath3 = join45(consortDir, "ctx-levers.json");
    mkdirSync30(consortDir, { recursive: true });
    writeFileSync26(
      markerPath3,
      JSON.stringify(
        {
          dbState: levers.ctxPack.includes("db-state"),
          failingTest: levers.ctxPack.includes("failing-test"),
          scopeNote: levers.ctxPack.includes("scope-note"),
          migration: levers.ctxPack.includes("migration")
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    result.markerPath = markerPath3;
  }
  const needsHook = levers.guardSuite === true || levers.guardScan === true;
  const needsSettings = needsHook || (levers.denyBash?.length ?? 0) > 0;
  if (!needsSettings) return result;
  const settingsPath = join45(workspaceDir, ".claude", "settings.json");
  const settings = readSettings(settingsPath);
  if (levers.denyBash?.length) {
    const perms = settings.permissions ??= {};
    const deny = new Set(perms.deny ?? []);
    for (const p of levers.denyBash) deny.add(p);
    perms.deny = [...deny];
  }
  if (needsHook) {
    const hookPath = join45(workspaceDir, GUARD_HOOK_REL);
    mkdirSync30(dirname23(hookPath), { recursive: true });
    writeFileSync26(hookPath, guardHookScript({ suite: levers.guardSuite === true, scan: levers.guardScan === true }), "utf8");
    chmodSync(hookPath, 493);
    const hooks = settings.hooks ??= {};
    const pre = hooks.PreToolUse ??= [];
    const already = pre.some((m) => m.hooks?.some((h) => h.command === hookPath));
    if (!already) pre.push({ matcher: "Bash", hooks: [{ type: "command", command: hookPath }] });
    result.hookPath = hookPath;
  }
  mkdirSync30(dirname23(settingsPath), { recursive: true });
  writeFileSync26(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  result.settingsPath = settingsPath;
  return result;
}

// tests/optimization/role-sweep.ts
init_esm_shims();

// consort/experiment/parallel-runner.ts
init_esm_shims();
async function runExperimentsInParallel(args) {
  if (args.concurrency < 1) {
    throw new Error(`runExperimentsInParallel: concurrency must be >= 1 (got ${args.concurrency})`);
  }
  const start = Date.now();
  const queue = [...args.experiments];
  const results = [];
  let inFlight = 0;
  let peakInFlight = 0;
  async function worker() {
    while (true) {
      const exp = queue.shift();
      if (!exp) return;
      inFlight++;
      if (inFlight > peakInFlight) peakInFlight = inFlight;
      const expStart = Date.now();
      try {
        const value = await args.runner(exp);
        results.push({
          slug: exp.slug,
          status: "succeeded",
          value,
          duration_ms: Date.now() - expStart
        });
      } catch (err) {
        results.push({
          slug: exp.slug,
          status: "failed",
          error: {
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : void 0
          },
          duration_ms: Date.now() - expStart
        });
      } finally {
        inFlight--;
      }
    }
  }
  const workerCount = Math.min(args.concurrency, args.experiments.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return {
    results,
    total_duration_ms: Date.now() - start,
    peak_in_flight: peakInFlight
  };
}

// tests/optimization/role-sweep.ts
function agentForCandidate(chain, patch) {
  const liveId = `${chain.dir}-live`;
  return (m) => {
    if (m.id !== liveId) return void 0;
    const base = m.agent?.config ?? {};
    const levers = {
      role: base.role ?? m.role,
      ...base.model !== void 0 ? { model: base.model } : {},
      ...base.effort !== void 0 ? { effort: base.effort } : {},
      ...base.session !== void 0 ? { session: base.session } : {},
      ...base.allowedTools !== void 0 ? { allowedTools: base.allowedTools } : {},
      ...base.disallowedTools !== void 0 ? { disallowedTools: base.disallowedTools } : {},
      // the candidate patch WINS over the base for the swept axes
      ...patch.model !== void 0 ? { model: patch.model } : {},
      ...patch.effort !== void 0 ? { effort: patch.effort } : {},
      ...patch.session !== void 0 ? { session: patch.session } : {},
      ...patch.allowedTools !== void 0 ? { allowedTools: patch.allowedTools } : {},
      ...patch.disallowedTools !== void 0 ? { disallowedTools: patch.disallowedTools } : {}
    };
    return new ClaudeStepAgent(levers);
  };
}
function trialTelemetry(chain, candidate, turns) {
  const liveTurn = turns[turns.length - 1];
  const t = liveTurn?.telemetry;
  const usage = t?.agentResult?.usage;
  const producedOk = !!liveTurn && liveTurn.result.producedPaths.some((p) => p.endsWith(chain.outputFile));
  const cleanViolations = !!liveTurn && liveTurn.result.violations.length === 0;
  const terminated = liveTurn?.result.bounded.action.kind === "design-complete";
  const gatePassed = producedOk && cleanViolations && terminated;
  const telemetry = {
    role: t?.role ?? chain.dir.replace(/-chain$/, ""),
    chain: `${chain.dir}#${candidate.id}`,
    // The candidate's model (when it patches one) is the meaningful "model this trial ran on";
    // absent patch => baseline model, which the report reads from the baseline trial.
    ...candidate.levers.model ? { model: candidate.levers.model } : {},
    levers: { ...candidate.levers },
    outerDurationMs: t?.outerDurationMs ?? 0,
    ...usage ? {
      agent: {
        ...usage.numTurns !== void 0 ? { numTurns: usage.numTurns } : {},
        ...usage.durationMs !== void 0 ? { durationMs: usage.durationMs } : {},
        ...usage.costUsd !== void 0 ? { costUsd: usage.costUsd } : {},
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...usage.cacheReadTokens !== void 0 ? { cacheReadTokens: usage.cacheReadTokens } : {},
        ...usage.cacheCreationTokens !== void 0 ? { cacheCreationTokens: usage.cacheCreationTokens } : {}
      }
    } : {},
    outcome: gatePassed ? "produced" : liveTurn?.result.bounded.action.kind ?? "no-live-turn",
    producedFile: chain.outputFile,
    ...t?.agentResult?.finalText ? { transcript: { prompt: chain.prompt, finalText: t.agentResult.finalText, tools: [] } } : {}
  };
  return { gatePassed, telemetry };
}
async function runOneCandidate(chain, candidate, runChain, quality) {
  try {
    const { turns, producedArtifacts, gate, durationMs, usage, toolCalls } = await runChain(chain, agentForCandidate(chain, candidate.levers), candidate.id, candidate.levers);
    const derived = trialTelemetry(chain, candidate, turns);
    const gatePassed = gate ? gate.passed : derived.gatePassed;
    const telemetry = derived.telemetry;
    if (durationMs !== void 0) telemetry.outerDurationMs = durationMs;
    if (usage || toolCalls !== void 0) {
      telemetry.agent = { ...telemetry.agent ?? {}, ...usage ?? {}, ...toolCalls !== void 0 ? { toolCalls } : {} };
    }
    const trial = { candidateId: candidate.id, levers: candidate.levers, gatePassed, telemetry, producedArtifacts };
    if (gatePassed) {
      const primary = producedArtifacts[chain.outputFile];
      if (!quality) {
        trial.disqualified = true;
        trial.reason = "no judge configured \u2013 an LLM judge is required for every evaluation";
        return trial;
      }
      let verdict;
      try {
        verdict = await quality.judgeCandidate({ candidateId: candidate.id, primary, producedArtifacts });
      } catch (e) {
        trial.disqualified = true;
        trial.reason = `judge threw: ${e instanceof Error ? e.message : String(e)}`;
        return trial;
      }
      trial.qualityPassed = verdict.passed;
      if (trial.telemetry) {
        if (verdict.score !== void 0) trial.telemetry.semanticScore = verdict.score;
        if (verdict.classification) trial.telemetry.classification = verdict.classification;
        if (verdict.nextStep) trial.telemetry.nextStep = verdict.nextStep;
      }
    }
    return trial;
  } catch (e) {
    return {
      candidateId: candidate.id,
      levers: candidate.levers,
      gatePassed: false,
      disqualified: true,
      reason: e instanceof Error ? e.message : String(e)
    };
  }
}
async function runRoleSweep(chain, candidates, runChain, options = {}) {
  const hooks = options;
  const quality = options.quality;
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const total = candidates.length;
  if (concurrency === 1) {
    const trials = [];
    let index = 0;
    for (const candidate of candidates) {
      index += 1;
      hooks.onStart?.(candidate, index, total);
      const trial = await runOneCandidate(chain, candidate, runChain, quality);
      trials.push(trial);
      hooks.onDone?.(trial, index, total);
    }
    return trials;
  }
  const trialByIndex = /* @__PURE__ */ new Map();
  await runExperimentsInParallel({
    concurrency,
    experiments: candidates.map((_, i) => ({ slug: String(i + 1) })),
    runner: async ({ slug }) => {
      const index = Number(slug);
      const candidate = candidates[index - 1];
      hooks.onStart?.(candidate, index, total);
      const trial = await runOneCandidate(chain, candidate, runChain, quality);
      trialByIndex.set(index, trial);
      hooks.onDone?.(trial, index, total);
      return trial;
    }
  });
  return candidates.map((_, i) => trialByIndex.get(i + 1));
}

// tests/optimization/role-sweep-report.ts
init_esm_shims();

// consort/optimize/role-telemetry.ts
init_esm_shims();
import { writeFileSync as writeFileSync27 } from "fs";
import { join as join46 } from "path";

// tests/optimization/role-sweep-report.ts
function classificationNote(classification) {
  switch (classification) {
    case "equivalent":
      return "  [converged clean \u2013 no self-heal needed]";
    case "superseded-shift":
      return "  [superseded-shift \u2013 permissive refactor (viable)]";
    case "regression":
      return "  [driver-fixable regression (viable)]";
    default:
      return "";
  }
}
function rowFrom(t, baselineMs, baselineCost) {
  const speedupPct = baselineMs > 0 ? (baselineMs - t.outerDurationMs) / baselineMs * 100 : 0;
  const cost = t.agent?.costUsd;
  return {
    candidateId: t.chain.split("#")[1] ?? t.chain,
    levers: t.levers,
    outerDurationMs: t.outerDurationMs,
    ...cost !== void 0 ? { costUsd: cost } : {},
    speedupPct,
    ...cost !== void 0 && baselineCost !== void 0 ? { costDeltaUsd: cost - baselineCost } : {},
    ...t.classification ? { classification: t.classification } : {}
  };
}
function reportRoleSweep(trials, baselineMsOverride) {
  const baseline = trials.find((t) => t.candidateId === "baseline");
  const baselineMs = baselineMsOverride ?? baseline?.telemetry?.outerDurationMs ?? 0;
  const baselineCost = baseline?.telemetry?.agent?.costUsd;
  const role = baseline?.telemetry?.role ?? trials.find((t) => t.telemetry)?.telemetry?.role ?? "unknown";
  const eligible = trials.filter((t) => t.gatePassed && t.telemetry && t.qualityPassed !== false);
  const ranked = eligible.map((t) => rowFrom(t.telemetry, baselineMs, baselineCost)).sort((a, b) => a.outerDurationMs - b.outerDurationMs);
  const winner = ranked.find((r) => r.candidateId !== "baseline" && r.outerDurationMs < baselineMs);
  const rejected = trials.filter((t) => !t.gatePassed || t.qualityPassed === false).map((t) => ({
    candidateId: t.candidateId,
    reason: t.disqualified ? `disqualified: ${t.reason ?? "crashed"}` : !t.gatePassed ? `gate failed (${t.telemetry?.outcome ?? "no live turn"})` : `quality below baseline (score ${t.telemetry?.semanticScore?.toFixed(2) ?? "?"})`
  }));
  return {
    role,
    baselineMs,
    ...baselineCost !== void 0 ? { baselineCostUsd: baselineCost } : {},
    ranked,
    ...winner ? { winner } : {},
    rejected
  };
}
function formatRoleSweepReport(r) {
  const secs = (ms) => `${(ms / 1e3).toFixed(1)}s`;
  const lines = [];
  lines.push(`=== per-role sweep: ${r.role} ===`);
  lines.push(`baseline: ${secs(r.baselineMs)}${r.baselineCostUsd !== void 0 ? ` | $${r.baselineCostUsd.toFixed(2)}` : ""}`);
  lines.push(`gate-passers (fastest first):`);
  for (const row of r.ranked) {
    const lever = Object.keys(row.levers).length ? JSON.stringify(row.levers) : "(baseline levers)";
    const cost = row.costUsd !== void 0 ? ` | $${row.costUsd.toFixed(2)}` : "";
    const delta = row.candidateId === "baseline" ? "" : ` | ${row.speedupPct >= 0 ? "-" : "+"}${Math.abs(row.speedupPct).toFixed(0)}% wall`;
    lines.push(`  ${row.candidateId}: ${secs(row.outerDurationMs)}${cost}${delta} \u2013 ${lever}${classificationNote(row.classification)}`);
  }
  if (r.winner) {
    const cd = r.winner.costDeltaUsd;
    lines.push(
      `WINNER: ${r.winner.candidateId} \u2013 ${r.winner.speedupPct.toFixed(0)}% faster (${secs(r.winner.outerDurationMs)} vs ${secs(r.baselineMs)})` + (cd !== void 0 ? `, ${cd <= 0 ? "cheaper" : "pricier"} by $${Math.abs(cd).toFixed(2)}` : "") + ` \u2013 levers ${JSON.stringify(r.winner.levers)}`
    );
  } else {
    lines.push(`WINNER: none \u2013 no candidate beat the baseline (the role's default levers stand).`);
  }
  if (r.rejected.length) {
    lines.push(`rejected:`);
    for (const rj of r.rejected) lines.push(`  ${rj.candidateId}: ${rj.reason}`);
  }
  return lines.join("\n");
}

// tests/integration/live/driver-build-support.ts
init_esm_shims();
import { readFileSync as readFileSync53, writeFileSync as writeFileSync33, existsSync as existsSync58, statSync as statSync21, readdirSync as readdirSync34, mkdtempSync as mkdtempSync2, mkdirSync as mkdirSync37, chmodSync as chmodSync2, rmSync as rmSync18, cpSync as cpSync10 } from "fs";
import { execFileSync as execFileSync6 } from "child_process";
import { tmpdir as tmpdir2 } from "os";
import { join as join60, relative as relative8 } from "path";

// consort/optimize/optimize-build-trial.ts
init_esm_shims();
var NON_VIABLE_ERRORS = /* @__PURE__ */ new Set(["DriverStalledError", "ProtocolViolationError", "UnexpectedCallbackError"]);
function classifyBuildTrial(sig2) {
  if (sig2.error) {
    const name = sig2.error.name ?? "";
    const msg = sig2.error.message ?? name ?? "error";
    if (NON_VIABLE_ERRORS.has(name)) {
      return { outcome: "not-viable", reason: `did not converge: ${msg}` };
    }
    return { outcome: "systemic", reason: `infra fault: ${msg}` };
  }
  const r = sig2.result;
  if (!r) return { outcome: "systemic", reason: "no runDriver result and no error (unknown state)" };
  if (r.escalated) {
    const e = r.escalation;
    return { outcome: "not-viable", reason: `raised-to-HIL (not self-healed): ${e?.reason ?? "unresolved"}${e?.source ? ` [${e.source}]` : ""}` };
  }
  if (sig2.honestGreen && !sig2.honestGreen.passed) {
    return { outcome: "not-viable", reason: sig2.honestGreen.reason ?? "honest-GREEN not reached" };
  }
  return { outcome: "self-healed" };
}

// consort/orchestrator/runners/run-config-loader.ts
init_esm_shims();
import { readFileSync as readFileSync43 } from "fs";
function resolveEnvTemplate(value) {
  const withDefault = value.match(/^\$\{([A-Z0-9_]+):-(.*)\}$/s);
  if (withDefault) {
    const [, name, def] = withDefault;
    return process.env[name] ?? def;
  }
  const required = value.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (required) {
    const [, name] = required;
    const v = process.env[name];
    if (v === void 0) {
      throw new Error(`run-config: required env var ${name} is unset (marker "${value}" has no default).`);
    }
    return v;
  }
  return value;
}
function compactTimestamp() {
  const [date, time] = (/* @__PURE__ */ new Date()).toISOString().split("T");
  return `${date.replace(/-/g, "")}-${time.slice(0, 8).replace(/:/g, "")}`;
}
function expandTokens(s) {
  return s.includes("{{TS}}") ? s.replaceAll("{{TS}}", compactTimestamp()) : s;
}
function coerceLeaf(s) {
  const t = expandTokens(s);
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
}
function resolveDeep(node) {
  if (typeof node === "string") return coerceLeaf(resolveEnvTemplate(node));
  if (Array.isArray(node)) return node.map(resolveDeep);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = resolveDeep(v);
    return out;
  }
  return node;
}
function loadRunConfig(path12) {
  const raw = JSON.parse(readFileSync43(path12, "utf8"));
  return resolveDeep(raw);
}

// consort/orchestrator/provisioning/test-env.ts
init_esm_shims();

// consort/orchestrator/provisioning/credentials.ts
init_esm_shims();
import { execFileSync as execFileSync3 } from "child_process";
import { checkDatabricksAuth, databricksAuthPrereqMessage } from "@databricks-solutions/lakebase-scm-utils/lakebase";
function resolveHostFromProfile(profile, timeoutMs = 15e3) {
  try {
    const raw = execFileSync3("databricks", ["auth", "describe", "--profile", profile, "-o", "json"], {
      encoding: "utf-8",
      timeout: timeoutMs
    });
    const start = raw.indexOf("{");
    if (start < 0) return void 0;
    const parsed = JSON.parse(raw.slice(start));
    const host = parsed.details?.host;
    return typeof host === "string" && host ? host.replace(/\/+$/, "") : void 0;
  } catch {
    return void 0;
  }
}

// consort/orchestrator/provisioning/test-env.ts
function resolveTestEnv() {
  const profile = process.env.DATABRICKS_CONFIG_PROFILE || void 0;
  const explicitHost = process.env.LAKEBASE_TEST_HOST?.replace(/\/+$/, "") || void 0;
  const host = explicitHost ?? (profile ? resolveHostFromProfile(profile) : void 0);
  return {
    ...host ? { host } : {},
    ...profile ? { profile } : {},
    ...process.env.LAKEBASE_TEST_INSTANCE ? { instance: process.env.LAKEBASE_TEST_INSTANCE } : {},
    ...process.env.LAKEBASE_TEST_GITHUB_OWNER ? { githubOwner: process.env.LAKEBASE_TEST_GITHUB_OWNER } : {},
    e2e: process.env.LAKEBASE_TEST_E2E === "1"
  };
}

// tests/integration/live/kit-resolution.ts
init_esm_shims();
import { existsSync as existsSync45, mkdirSync as mkdirSync31, writeFileSync as writeFileSync28, rmSync as rmSync11, symlinkSync, realpathSync } from "fs";
import { join as join47, dirname as dirname24 } from "path";
import { homedir } from "os";
var LOCAL_KIT_REF_DEFAULT = "sftdd-livetest-local";
function localKitCacheLink(ref = LOCAL_KIT_REF_DEFAULT) {
  const cacheRoot = join47(process.env.XDG_CACHE_HOME ?? join47(homedir(), ".cache"), "consort");
  return join47(cacheRoot, ref, "node_modules", "@databricks-solutions", "consort");
}
function pinLocalKitCache(kitRoot2, ref = LOCAL_KIT_REF_DEFAULT) {
  if (!existsSync45(join47(kitRoot2, "dist"))) {
    throw new Error(`kit-resolution: kit dist missing at ${kitRoot2}/dist \u2013 run 'npm run build' in the kit first.`);
  }
  const link = localKitCacheLink(ref);
  mkdirSync31(dirname24(link), { recursive: true });
  rmSync11(link, { recursive: true, force: true });
  symlinkSync(kitRoot2, link);
}
function recordLocalKitHint(projectDir, kitRoot2, ref = LOCAL_KIT_REF_DEFAULT) {
  const dir = join47(projectDir, ".lakebase");
  mkdirSync31(dir, { recursive: true });
  writeFileSync28(join47(dir, "kit-ref"), `${ref}
`);
  writeFileSync28(join47(dir, "kit-local-dir"), `${realpathSync(kitRoot2)}
`);
}
function resolveKitSingleSource(kitRoot2, ref = LOCAL_KIT_REF_DEFAULT) {
  if (process.env.LAKEBASE_KIT_DIR) {
    throw new Error(
      `kit-resolution: LAKEBASE_KIT_DIR is set \u2013 it redirects ONLY the orchestrator and leaves the claude -p agents on the ref cache (split-brain). Unset it; this pins ref '${ref}' for everyone.`
    );
  }
  pinLocalKitCache(kitRoot2, ref);
  process.env.LAKEBASE_KIT_REF = ref;
  return ref;
}
function assertKitSingleSource(projectDir, kitRoot2, ref = LOCAL_KIT_REF_DEFAULT) {
  recordLocalKitHint(projectDir, kitRoot2, ref);
  const link = localKitCacheLink(ref);
  if (!existsSync45(link)) return;
  const want = realpathSync(kitRoot2);
  const got = realpathSync(link);
  if (got !== want) {
    throw new Error(
      `kit-resolution: kit resolution drift \u2013 ref '${ref}' resolves to '${got}', expected '${want}'. Aborting so the run cannot use a stale/other kit.`
    );
  }
}
function clearKitSingleSource() {
  delete process.env.LAKEBASE_KIT_REF;
}

// consort/orchestrator/provisioning/lifecycle-catalogue.ts
init_esm_shims();
import { rmSync as rmSync12 } from "fs";
import { join as join48 } from "path";
import { execFileSync as execFileSync4 } from "child_process";

// consort/lakebase/create-project.ts
init_esm_shims();
import {
  createProject as baseCreateProject
} from "@databricks-solutions/lakebase-scm-utils/lakebase";
function resolveEnableE2e(input) {
  return input.clientFramework === "react" ? true : input.enableE2e;
}
function createProject(input, progress) {
  return baseCreateProject(
    { ...input, enableE2e: resolveEnableE2e(input), consortHooks: input.consortHooks ?? kitConsortHooks },
    progress
  );
}

// consort/orchestrator/provisioning/lifecycle-catalogue.ts
async function scaffoldProject(config, context) {
  const c = config;
  if (!c.projectName) return { ok: false, error: "scaffold-project requires config.projectName" };
  if (!c.databricksHost) return { ok: false, error: "scaffold-project requires config.databricksHost" };
  const parentDir = c.parentDir ?? context.workspaceDir;
  try {
    const res = await createProject({
      projectName: c.projectName,
      parentDir,
      databricksHost: c.databricksHost,
      githubOwner: c.githubOwner,
      createGithubRepo: c.createGithubRepo,
      runnerType: c.runnerType,
      tiers: c.tiers,
      uiTrack: c.uiTrack,
      language: c.language
    });
    const repoFullName = (res.githubRepoUrl ? res.githubRepoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") : void 0) ?? (c.githubOwner && c.createGithubRepo !== false ? `${c.githubOwner}/${c.projectName}` : void 0);
    const runnerRegistered = !!repoFullName && (c.runnerType ?? "self-hosted") === "self-hosted";
    return {
      ok: true,
      handle: {
        projectDir: res.projectDir,
        projectName: c.projectName,
        lakebaseProjectId: res.lakebaseProjectId,
        lakebaseDefaultBranch: res.lakebaseDefaultBranch,
        githubRepoUrl: res.githubRepoUrl ?? null,
        githubRepoFullName: repoFullName ?? null,
        runnerRegistered,
        databricksHost: c.databricksHost
      }
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function realRemoveProjectEffects() {
  const scm = await import("@databricks-solutions/lakebase-scm-utils/lakebase");
  return {
    stopRunner: (name) => scm.stopRunner(name),
    removeRunner: (a) => scm.removeRunner(a),
    deleteGithubRepo: (repo) => {
      execFileSync4("gh", ["repo", "delete", repo, "--yes"], { stdio: "ignore", timeout: 3e4 });
    },
    deleteLakebaseProject: (a) => scm.deleteLakebaseProject({ projectId: a.projectId, host: a.host })
  };
}
async function removeProject(config, context, effectsOverride) {
  const handle = context.setupHandle;
  if (!handle) return { ok: false, error: "remove-project: no setup handle (nothing to tear down)" };
  void config;
  const needsCloud = !!(handle.runnerRegistered || handle.githubRepoFullName || handle.lakebaseProjectId && handle.databricksHost);
  const fx = effectsOverride ?? (needsCloud ? await realRemoveProjectEffects() : void 0);
  const errors = [];
  if (fx && handle.runnerRegistered && handle.githubRepoFullName && handle.projectName) {
    try {
      fx.stopRunner(handle.projectName);
    } catch (e) {
      errors.push(`stopRunner: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      await fx.removeRunner({ fullRepoName: handle.githubRepoFullName, projectName: handle.projectName });
    } catch (e) {
      errors.push(`removeRunner: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (fx && handle.githubRepoFullName) {
    try {
      fx.deleteGithubRepo(handle.githubRepoFullName);
    } catch (e) {
      errors.push(`gh repo delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  let lakebaseDeleted = true;
  if (fx && handle.lakebaseProjectId && handle.databricksHost) {
    lakebaseDeleted = false;
    try {
      await fx.deleteLakebaseProject({ projectId: handle.lakebaseProjectId, host: handle.databricksHost });
      lakebaseDeleted = true;
    } catch (e) {
      errors.push(`Lakebase delete: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (handle.projectDir) {
    if (lakebaseDeleted) {
      try {
        rmSync12(handle.projectDir, { recursive: true, force: true });
      } catch (e) {
        errors.push(`dir remove: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      errors.push(`dir KEPT (${handle.projectDir}) \u2013 Lakebase delete failed; left for the orphan sweep to retry`);
    }
  }
  return errors.length ? { ok: false, error: errors.join("; ") } : { ok: true };
}
async function injectEscalation(config, context) {
  const c = config;
  if (!c.source) return { ok: false, error: 'inject-escalation requires config.source (e.g. "smell:reflect-spec-defect")' };
  if (!c.reason) return { ok: false, error: "inject-escalation requires config.reason" };
  try {
    const esc = writeEscalation(join48(context.workspaceDir, ARTIFACT_ROOT), {
      source: c.source,
      reason: c.reason,
      ...c.feature_id ? { feature_id: c.feature_id } : {},
      ...c.story_id ? { story_id: c.story_id } : {}
    });
    return { ok: true, handle: { escalationId: esc.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
var LIFECYCLE_CATALOGUE = {
  "scaffold-project": {
    description: "Create a REAL project via the kit createProject (Databricks + GitHub + Lakebase). Cloud-bound; returns a teardown handle.",
    configSummary: "{ projectName (required), databricksHost (required), parentDir?, githubOwner?, createGithubRepo?, tiers?, uiTrack?, language? }",
    run: scaffoldProject
  },
  "remove-project": {
    description: "Delete what scaffold-project created (Lakebase project + local dir), reading the setup handle. Best-effort.",
    configSummary: "{ } (consumes the scaffold-project handle from the run context)",
    run: removeProject
  },
  "inject-escalation": {
    description: "Plant a REAL escalation into the workspace .consort/escalations/ (via writeEscalation) so a scenario deterministically drives the revise/escalate route space. Pure filesystem.",
    configSummary: '{ source (required, e.g. "smell:reflect-spec-defect"), reason (required), story_id?, feature_id? }',
    run: injectEscalation
  }
};
function resolveLifecycleKind(kind) {
  const entry = LIFECYCLE_CATALOGUE[kind];
  if (!entry) {
    const known = Object.keys(LIFECYCLE_CATALOGUE).sort().join(", ");
    throw new Error(`lifecycle-catalogue: unknown lifecycle kind "${kind}". Known: ${known}.`);
  }
  return entry;
}
var catalogueLifecycleDeps = {
  run: (op, context) => resolveLifecycleKind(op.kind).run(op.config ?? {}, context)
};

// tests/integration/live/shared-scaffold-support.ts
init_esm_shims();
import { cpSync as cpSync7, existsSync as existsSync46, rmSync as rmSync13 } from "fs";
import { join as join49 } from "path";
import { execFileSync as execFileSync5 } from "child_process";
import { createWorktree } from "@databricks-solutions/lakebase-scm-utils/git";
function forceRemoveWorktree(projectDir, wtDir) {
  try {
    execFileSync5("git", ["worktree", "remove", "--force", wtDir], { cwd: projectDir, stdio: "ignore", timeout: 3e4 });
    return;
  } catch {
  }
  try {
    rmSync13(wtDir, { recursive: true, force: true });
  } catch {
  }
  try {
    execFileSync5("git", ["worktree", "prune"], { cwd: projectDir, stdio: "ignore", timeout: 3e4 });
  } catch {
  }
}
var worktreeSeq = 0;
async function cutWorktree(args) {
  const { projectDir, worktreesRoot, label, branchPrefix, kitDir } = args;
  const unique = `${label}-${Date.now().toString(36)}-${worktreeSeq++}`;
  const wtDir = join49(worktreesRoot, unique);
  const branch = `${branchPrefix}/${unique}`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await createWorktree({ cwd: projectDir, path: wtDir, branch });
      lastErr = void 0;
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  if (lastErr) throw new Error(`git worktree add for ${label} failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  const baseEnv = join49(projectDir, ".env");
  if (existsSync46(baseEnv)) cpSync7(baseEnv, join49(wtDir, ".env"));
  layDownKitAgents(wtDir, kitDir);
  return { wtDir, consortDir: join49(wtDir, ARTIFACT_ROOT) };
}

// consort/setup/orphan-project-sweep.ts
init_esm_shims();
import { existsSync as existsSync47, readdirSync as readdirSync27, readFileSync as readFileSync44, rmSync as rmSync14, statSync as statSync16 } from "fs";
import { join as join50 } from "path";
var DEFAULT_TEST_PROJECT_PREFIXES = ["de-live-", "dg-live-"];
function readEnvValue(envText, key) {
  for (const line of envText.split("\n")) {
    const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.+?)\\s*$`));
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  }
  return void 0;
}
function readScaffoldProjectMeta(dir) {
  const envPath = join50(dir, ".env");
  const lakebaseDir = join50(dir, ".lakebase");
  if (!existsSync47(envPath) || !existsSync47(lakebaseDir)) return null;
  const envText = readFileSync44(envPath, "utf8");
  const projectId = readEnvValue(envText, "LAKEBASE_PROJECT_ID");
  const host = readEnvValue(envText, "DATABRICKS_HOST");
  if (!projectId || !host) return null;
  const wsPath = join50(lakebaseDir, "workflow-state.json");
  if (existsSync47(wsPath)) {
    try {
      const ws = JSON.parse(readFileSync44(wsPath, "utf8"));
      if (typeof ws.project_id === "string" && ws.project_id && ws.project_id !== projectId) return null;
    } catch {
    }
  }
  return { projectId, host };
}
function findOrphanProjects(parentDir, prefixes = DEFAULT_TEST_PROJECT_PREFIXES) {
  if (!existsSync47(parentDir)) return [];
  const out = [];
  for (const name of readdirSync27(parentDir)) {
    if (!prefixes.some((p) => name.startsWith(p))) continue;
    const dir = join50(parentDir, name);
    if (!statSync16(dir).isDirectory()) continue;
    const meta = readScaffoldProjectMeta(dir);
    if (meta) out.push({ dir, ...meta });
  }
  return out;
}
async function sweepOrphanProjects(args) {
  const orphans = findOrphanProjects(args.parentDir, args.prefixes);
  const report = [];
  for (const o of orphans) {
    let deleted = false;
    let dirRemoved = false;
    let error;
    try {
      await args.deleteLakebaseProject({ projectId: o.projectId, host: o.host });
      deleted = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (deleted) {
      try {
        rmSync14(o.dir, { recursive: true, force: true });
        dirRemoved = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    report.push({ ...o, deleted, dirRemoved, ...error ? { error } : {} });
  }
  return report;
}

// consort/orchestrator/drive/orchestrator-run.ts
init_esm_shims();

// consort/orchestrator/drive/orchestrator-drive.ts
init_esm_shims();
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

// consort/gates/orchestrator-expect.ts
init_esm_shims();
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
function storyOf2(action) {
  return "story" in action ? action.story : void 0;
}
function expectationFor(action) {
  if (action.kind !== "invoke-role") return null;
  const responder = action.role;
  const story = storyOf2(action);
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

// consort/orchestrator/drive/orchestrator-effects.ts
init_esm_shims();
import * as fs17 from "fs";
import { dirname as dirname28, join as join57 } from "path";

// consort/orchestrator/drive/executor-dispatch.ts
init_esm_shims();
import * as fs16 from "fs";
import { join as join53, relative as relative7 } from "path";

// consort/orchestrator/agents/replay-recorder-wrapper.ts
init_esm_shims();

// consort/logging/turn-recorder.ts
init_esm_shims();
import { createHash as createHash3 } from "crypto";
import {
  appendFileSync as appendFileSync3,
  cpSync as cpSync8,
  existsSync as existsSync48,
  mkdirSync as mkdirSync32,
  readFileSync as readFileSync45,
  readdirSync as readdirSync28,
  rmSync as rmSync15,
  statSync as statSync17,
  writeFileSync as writeFileSync29
} from "fs";
import { dirname as dirname25, join as join51, relative as relative6 } from "path";
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
function recordCorrespondence(recordDir, entry) {
  mkdirSync32(recordDir, { recursive: true });
  appendFileSync3(join51(recordDir, "correspondence.jsonl"), JSON.stringify(entry) + "\n");
}
function recordReplaySet(args) {
  const { turnDir, projectDir, consortDir, inputs, prompt, guidelines, levers } = args;
  const setDir = join51(turnDir, "replay-set");
  mkdirSync32(setDir, { recursive: true });
  const keep = codeTreeFilter(projectDir);
  const preDir = join51(setDir, "pre-project");
  for (const abs of walk(projectDir, keep)) {
    const rel = relative6(projectDir, abs);
    const dst = join51(preDir, rel);
    mkdirSync32(dirname25(dst), { recursive: true });
    cpSync8(abs, dst);
  }
  const preConsortDir = join51(setDir, "pre-consort");
  for (const abs of walk(consortDir, preConsortKeep)) {
    const rel = relative6(consortDir, abs);
    const dst = join51(preConsortDir, rel);
    mkdirSync32(dirname25(dst), { recursive: true });
    cpSync8(abs, dst);
  }
  const inDir = join51(setDir, "inputs");
  mkdirSync32(inDir, { recursive: true });
  for (const [id, content] of Object.entries(inputs)) {
    writeFileSync29(join51(inDir, id.replace(/[/\\]/g, "_")), content);
  }
  writeFileSync29(join51(setDir, "prompt.txt"), relativizeProjectPaths(prompt, projectDir));
  writeFileSync29(join51(setDir, "guidelines.json"), JSON.stringify(guidelines ?? [], null, 2) + "\n");
  writeFileSync29(join51(setDir, "levers.json"), JSON.stringify(levers ?? {}, null, 2) + "\n");
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
  const missing = expectedTurnFiles(action, opts).filter((rel) => !existsSync48(join51(turnDir, rel)));
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
  return createHash3("sha1").update(readFileSync45(abs)).digest("hex");
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
  if (!existsSync48(dir)) return [];
  const out = [];
  for (const entry of readdirSync28(dir)) {
    const abs = join51(dir, entry);
    if (keep && !keep(abs)) continue;
    let st;
    try {
      st = statSync17(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs, keep));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}
function scan(projectDir, consortDir) {
  const map2 = /* @__PURE__ */ new Map();
  for (const abs of walk(consortDir)) {
    const rel = relative6(projectDir, abs);
    const relConsort = relative6(consortDir, abs);
    if (NON_ARTIFACT_CONSORT.has(relConsort)) continue;
    if (isRecorderOwned(relConsort)) continue;
    map2.set(rel, { abs, rel, underConsort: true, sha: sha1(abs) });
  }
  const keep = codeTreeFilter(projectDir);
  for (const abs of walk(projectDir, keep)) {
    const rel = relative6(projectDir, abs);
    if (map2.has(rel)) continue;
    map2.set(rel, { abs, rel, underConsort: false, sha: sha1(abs) });
  }
  return map2;
}
function writeRecorderState(recordDir, cur) {
  const files = {};
  for (const [rel, f] of cur) files[rel] = f.sha;
  mkdirSync32(recordDir, { recursive: true });
  writeFileSync29(join51(recordDir, ".recorder-state.json"), JSON.stringify({ files }, null, 2) + "\n");
}
function seedRecorderBaseline(args) {
  if (existsSync48(join51(args.recordDir, ".recorder-state.json"))) return false;
  writeRecorderState(args.recordDir, scan(args.projectDir, args.consortDir));
  return true;
}
function readState(recordDir) {
  const f = join51(recordDir, ".recorder-state.json");
  if (!existsSync48(f)) return { files: {} };
  try {
    return JSON.parse(readFileSync45(f, "utf8"));
  } catch {
    return { files: {} };
  }
}
function readIndex(recordDir) {
  const f = join51(recordDir, "turns", "index.json");
  if (!existsSync48(f)) return [];
  try {
    const data = JSON.parse(readFileSync45(f, "utf8"));
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}
function pad(n) {
  return String(n).padStart(4, "0");
}
function turnDirFor(recordDir, action) {
  return join51(recordDir, "turns", `${pad(readIndex(recordDir).length)}-${labelForAction(action)}`);
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
  const turnDir = join51(recordDir, "turns", dirName);
  mkdirSync32(turnDir, { recursive: true });
  if (snapshotContent) {
    mkdirSync32(join51(turnDir, "files"), { recursive: true });
    const artifactsDir = join51(recordDir, "recorded-artifacts");
    for (const rel of produced) {
      const f = cur.get(rel);
      const dst = join51(turnDir, "files", rel);
      mkdirSync32(dirname25(dst), { recursive: true });
      cpSync8(f.abs, dst);
      if (f.underConsort) {
        const mirror = join51(artifactsDir, relative6(consortDir, f.abs));
        mkdirSync32(dirname25(mirror), { recursive: true });
        cpSync8(f.abs, mirror);
      }
    }
    for (const rel of deleted) {
      const abs = join51(projectDir, rel);
      if (abs.startsWith(consortDir)) {
        const mirror = join51(artifactsDir, relative6(consortDir, abs));
        if (existsSync48(mirror)) rmSync15(mirror, { force: true });
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
    writeFileSync29(join51(turnDir, "transcript.md"), renderTranscriptMd(portable, label));
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
  writeFileSync29(join51(turnDir, "turn.json"), JSON.stringify(manifest, null, 2) + "\n");
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
  mkdirSync32(join51(recordDir, "turns"), { recursive: true });
  writeFileSync29(join51(recordDir, "turns", "index.json"), JSON.stringify({ turns: index }, null, 2) + "\n");
  writeRecorderState(recordDir, cur);
  try {
    if (existsSync48(join51(recordDir, "correspondence.jsonl"))) {
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

// consort/pipeline/record-build.ts
init_esm_shims();
import { existsSync as existsSync49, cpSync as cpSync9, mkdirSync as mkdirSync33, readdirSync as readdirSync29 } from "fs";
import { join as join52 } from "path";
function nextBuildTurnNumber(recordBuildDir, featureId, story) {
  const dir = storyTurnsDir(recordBuildDir, featureId, story);
  if (!existsSync49(dir)) return 1;
  let max = 0;
  for (const name of readdirSync29(dir)) {
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
  const turnDir = join52(
    featuresDir(recordBuildDir),
    featureId,
    "stories",
    story,
    "turns",
    turnSlug(turn, role, ac, mode)
  );
  mkdirSync33(turnDir, { recursive: true });
  cpSync9(projectDir, join52(turnDir, "code"), {
    recursive: true,
    force: true,
    filter: codeTreeFilter(projectDir)
  });
  const cyclesSrc = cyclesRootDir(consortDir);
  if (existsSync49(cyclesSrc)) cpSync9(cyclesSrc, join52(turnDir, "tdd", "cycles"), { recursive: true, force: true });
  const expSrc = experimentsRootDir(consortDir);
  if (existsSync49(expSrc)) cpSync9(expSrc, join52(turnDir, "tdd", "experiments"), { recursive: true, force: true });
  return turnDir;
}

// consort/orchestrator/agents/replay-recorder-wrapper.ts
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
  const rel = (abs) => relative7(consortDir, abs);
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
    return { scope: rel(join53(storyResolved(consortDir, f, story), "deploy-verify-scope.json")) };
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
      if (!story || !ac) return join53(cfg.consortDir, rel);
      return join53(cycleDir(cfg.consortDir, f, story, ac), rel);
    }
    if (source.startsWith("story:")) {
      const rel = expandRel(source.slice("story:".length));
      if (!story) return join53(cfg.consortDir, rel);
      return join53(storyResolved(cfg.consortDir, f, story), rel);
    }
    return join53(cfg.consortDir, expandRel(source.replace(/^feature:/, "")));
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

// consort/orchestrator/steps/assert-route-satisfiable.ts
init_esm_shims();
import { existsSync as existsSync51 } from "fs";
import { join as join54 } from "path";
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
      return join54(featuresDir(ctx.consortDir), f, spec.filename);
    case "story":
      if (!story) return join54(ctx.consortDir, spec.filename);
      return join54(cyclesRootDir(ctx.consortDir), f, story, spec.filename);
    case "ac":
    case "cycle":
      if (!story || !ac) return join54(ctx.consortDir, spec.filename);
      return join54(cycleDir(ctx.consortDir, f, story, ac), spec.filename);
  }
}
function assertRouteSatisfiable(action, step, ctx, exists = existsSync51) {
  for (const event of step.requiresEvents(action)) {
    const p = eventArtifactPath(event, action, ctx);
    if (!exists(p)) throw new RouteContractError(action, event, p);
  }
}

// consort/pipeline/story-pipeline.ts
init_esm_shims();
import { existsSync as existsSync53, readFileSync as readFileSync48, writeFileSync as writeFileSync30, mkdirSync as mkdirSync34, readdirSync as readdirSync31, statSync as statSync20, rmSync as rmSync16 } from "fs";
import { dirname as dirname27, join as join56 } from "path";

// consort/gates/gate-conformance-guard.ts
init_esm_shims();
import { existsSync as existsSync52, readFileSync as readFileSync47, readdirSync as readdirSync30, statSync as statSync19 } from "fs";
import { join as join55, dirname as dirname26 } from "path";

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
  if (!existsSync53(p)) return initPipeline(featureId);
  return JSON.parse(readFileSync48(p, "utf8"));
}
function writePipeline(consortDir, pipeline) {
  const p = pipelinePath(consortDir, pipeline.feature_id);
  mkdirSync34(dirname27(p), { recursive: true });
  writeFileSync30(p, JSON.stringify(pipeline, null, 2) + "\n");
}

// consort/session/response-formatter.ts
init_esm_shims();
import { existsSync as existsSync54, readFileSync as readFileSync49, readdirSync as readdirSync32 } from "fs";
function designGuideConformance(consortDir) {
  const file = designGuideJson(consortDir);
  if (!existsSync54(file)) {
    return { ok: false, problem: "design-guide.json not written (the machine-checkable token source of truth)" };
  }
  let content;
  try {
    content = readFileSync49(file, "utf8");
  } catch (e) {
    return { ok: false, problem: `unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = checkArtifactConformance(canonicalArtifactName(file), content);
  return r.ok ? { ok: true } : { ok: false, problem: r.violations.join("; ") };
}

// consort/orchestrator/drive/orchestrator-effects.ts
import { sanitizeBranchName } from "@databricks-solutions/lakebase-scm-utils/util";
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
    const stub = JSON.parse(fs17.readFileSync(storyJson(consortDir, featureId, storyId), "utf8"));
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
  if (!fs17.existsSync(file)) return "";
  let note = "";
  try {
    note = fs17.readFileSync(file, "utf8").trim();
    fs17.rmSync(file, { force: true });
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
      case "intake": {
        const seedIntakeDir = join57(kitRoot(), "examples", "first-project", "stockflow-seed", "intake");
        const groundingClause = fs17.existsSync(seedIntakeDir) ? `Ground the shape in the canon above and the StockFlow worked example at ${seedIntakeDir} (READ the files there to learn the format + level of detail; never copy it verbatim).` : `Ground the shape in the canon above (the StockFlow worked example under the kit's examples/first-project/stockflow-seed/intake/ is unavailable here \u2013 rely on the canon).`;
        return `Author the project intake for the Product Owner, DRAFTING each artifact FRESH from the human's answers at ${root}/intake/answers.md (the interview responses; if absent or thin, draft only what the stated intent supports \u2013 never invent). WRITE:
  - ${root}/product-overview.md \u2013 who it's for, its purpose, how it grows, what to see after each sprint (H1 + body, no implementation detail).
  - ${root}/nfrs.md \u2013 apply @software-design-principles + @architectural-design-principles: walk architecture layering / performance / scalability / security / observability / operability / resilience; record each as a '## Required' item with a stable R<n> id, plus '## Preferences' and '## Out of bounds'.
  - ${root}/design/design-brief.md (UI track only) \u2013 apply @ui-ux-design-principles: 1-3 reference sites + what to take from each, brand / interaction / accessibility constraints, and a required '## References' section.
${groundingClause} The human reviews + approves these before the Spec Author proposes the sprint from them.`;
      }
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
        const arch = JSON.parse(fs17.readFileSync(architectureJson(consortDir, featureId), "utf8"));
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
        const arch = JSON.parse(fs17.readFileSync(architectureJson(consortDir, featureId), "utf8"));
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
        return `REFLECT on story ${s} BEFORE the build lane: independently critique its spec slice (${root}/features/${featureId}/stories/${s}/story.json + acs/*.json) and its test-list (${root}/features/${featureId}/stories/${s}/test-list-per-story.json) against the architecture (${root}/features/${featureId}/architecture.md/.json) + NFRs.` + contextRubric(consortDir, featureId, s, "") + ` Look ONLY for design-time defects that would waste a build cycle: (1) ACs that contradict each other; (2) an AC with no covering test, or a test that contradicts its AC; (3) an NFR with no fitness test; (4) a test asserting at a layer the architecture forbids; (5) an AC whose declared layer conflicts with the architecture; (6) an untestable/vacuous AC (no observable outcome); (7) a UI-styling test that asserts inline HTML style or raw CSS in the page SOURCE (e.g. a text-align/color/font check inside a style= attr) for a property the design-guide + design-adherence gate govern, instead of the rendered SEAM (the element carries the design-guide class / data-testid): such a test hard-codes the very inline style the design lane then refactors into a token-driven class, so it blocks that refactor (the ui-style-implementation-test smell). Do NOT critique implementation, style, or scope, only buildability + internal consistency of THIS story's artifacts. BE EXHAUSTIVE in this ONE pass: findings[] is multi-valued \u2014 run EVERY check against EVERY AC, test-list item, and NFR, and emit a SEPARATE finding for EACH distinct defect (decompose a LEGACY multi-part singular NFR fitness_function into its sub-guarantees and flag every uncovered clause \u2014 but an NFR that already declares the ATOMIC fitness_functions ARRAY is coverage-checked DETERMINISTICALLY by checkFitnessClauseCoverage at the test_list gate, so do NOT re-decompose it). Do NOT return one finding at a time: the reflect\u2194revise loop is bounded and escalates after a few laps, so a piecemeal reflect burns that budget on repeated revise\u2192re-test\u2192reflect laps and can hand the human a still-defective design. Write your verdict to ${root}/features/${featureId}/stories/${s}/reflect-verdict.json as {"version":1,"passed":<bool>,"findings":[{"owner":"spec-author"|"test-strategist","detail":"<the defect>"}]}. passed:true with findings:[] when the spec + test-list are consistent + buildable (the common case, do NOT invent defects). Attribute each finding to spec-author (an AC/spec defect) or test-strategist (a test-list/coverage defect). Write ONLY that file; the orchestrator routes any fix deterministically.`;
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
   The flag-superseded command writes ${join57(cycleDir(consortDir, featureId, s, action.ac ?? ""), "superseded-tests.json")}. If for any reason the command will not run, FALL BACK to writing THAT EXACT file directly with the Write tool: {"tests":["<path_or_nodeid>", ...],"reason":"<why superseded>"} \u2013 do NOT search the cache / scripts / logs for the mechanism or invent a different filename. The orchestration honors that file too.
(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior; the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a bounded Driver repair turn):
   ./scripts/lk consort-cycle assess-regression --feature ${featureId} --story ${s} --ac ${action.ac} --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"] --tdd-dir ${consortDir}
   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration then escalates carrying your diagnosis).
CRITICAL \u2013 recording the verdict is the ONLY output of this turn. The orchestration reads your verdict from ${join57(cycleDir(consortDir, featureId, s, action.ac ?? ""), "regression-assessment.json")} (the assess-regression command writes it). Writing green-failure.json or just explaining the fix in prose is NOT the verdict \u2013 without that file a DRIVER-FIXABLE regression wrongly escalates to a human and the sprint halts. Run the ONE command above as a SINGLE line (do not split across lines, do not wrap in bash -c). If for any reason the command will not run, FALL BACK to writing the file directly with the Write tool: {"diagnosis":"<why>","fix":"<what to change>"} at that exact path \u2013 the orchestration honors that too.
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
var experimentBranchName = (storyId) => sanitizeBranchName(`experiment/${storyId}-${EXPERIMENT_SLUG}`);
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
        fs17.mkdirSync(dirname28(file), { recursive: true });
        fs17.writeFileSync(file, `${detail}
`, "utf8");
      } catch {
      }
    }
  };
}

// consort/session/run-config.ts
init_esm_shims();
import { existsSync as existsSync56, mkdirSync as mkdirSync36, readFileSync as readFileSync51, writeFileSync as writeFileSync32 } from "fs";
import { join as join58 } from "path";
var RUN_CONFIG_REL = join58(ARTIFACT_ROOT, "run-config.json");
function readRunConfig(consortDir) {
  const f = join58(consortDir, "run-config.json");
  if (!existsSync56(f)) return void 0;
  try {
    return JSON.parse(readFileSync51(f, "utf8"));
  } catch {
    return void 0;
  }
}

// tests/optimization/replay-turn.ts
init_esm_shims();
import { readFileSync as readFileSync52, existsSync as existsSync57, readdirSync as readdirSync33 } from "fs";
import { join as join59 } from "path";
function rehydrate(text, projectDir) {
  const root = projectDir.replace(/\/+$/, "");
  if (!text || !root) return text;
  return text.split(PROJECT_ROOT_TOKEN).join(root);
}
function readReplaySet(turnDir) {
  const setDir = join59(turnDir, "replay-set");
  const promptPath = join59(setDir, "prompt.txt");
  if (!existsSync57(promptPath)) throw new Error(`replay-set incomplete: no prompt.txt under ${setDir}`);
  const turn = JSON.parse(readFileSync52(join59(turnDir, "turn.json"), "utf8"));
  const leversPath = join59(setDir, "levers.json");
  const levers = existsSync57(leversPath) ? JSON.parse(readFileSync52(leversPath, "utf8")) : {};
  const inDir = join59(setDir, "inputs");
  const inputs = {};
  if (existsSync57(inDir)) {
    for (const e of readdirSync33(inDir, { withFileTypes: true })) {
      if (e.isFile()) inputs[e.name] = readFileSync52(join59(inDir, e.name), "utf8");
    }
  }
  return {
    turnDir,
    ordinal: turn.ordinal ?? -1,
    role: turn.role ?? levers.role ?? "",
    story: turn.story,
    action: turn.action ?? {},
    promptRaw: readFileSync52(promptPath, "utf8"),
    levers,
    inputs,
    preProjectDir: join59(setDir, "pre-project")
  };
}

// tests/integration/live/driver-build-support.ts
var KIT = process.cwd();
var DriverGreenAssertionError = class extends Error {
};
function assert(cond, message) {
  if (!cond) throw new DriverGreenAssertionError(message);
}
function assertGt(actual, floor, message) {
  assert(actual > floor, `${message} (expected > ${floor}, got ${actual})`);
}
function assertEq(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${String(expected)}, got ${String(actual)})`);
}
var SETUP_DIR = join60(KIT, "tests/integration/live/driver-green-setup");
var RUN_CONFIG_PATH = join60(SETUP_DIR, "driver-green.run.json");
function corpusRunConfig() {
  const rc = readRunConfig(SETUP_DIR);
  if (!rc) throw new Error(`driver-green bundle is missing its recorded run-config.json under ${SETUP_DIR}`);
  return rc;
}
function bundleFromDir(dir, feature, story, ac) {
  return {
    feature,
    story,
    ac,
    preRedCodeDir: join60(dir, "code-assets"),
    recordedArtifactsFeatureDir: join60(dir, "design"),
    conventionsJson: join60(dir, "design", "architecture", "conventions.json"),
    designDir: join60(dir, "design-assets")
  };
}
var CORPUS_DIR = process.env.LAKEBASE_SFTDD_CORPUS_DIR ? process.env.LAKEBASE_SFTDD_CORPUS_DIR.startsWith("/") ? process.env.LAKEBASE_SFTDD_CORPUS_DIR : join60(KIT, process.env.LAKEBASE_SFTDD_CORPUS_DIR) : join60(KIT, "examples/replay/corpora/stockflow-full");
var CORPUS_TURNS = join60(CORPUS_DIR, "turns");
var CORPUS_RA = join60(CORPUS_DIR, "recorded-artifacts");
var BUILD_FEATURE_TEMPLATE = "F6-split-tracking-code";
function replayBundleFromTurn(turnLabel, ac) {
  const rs = readReplaySet(join60(CORPUS_TURNS, turnLabel));
  const feature = String(rs.action.feature ?? deriveFeatureForStory(rs.story ?? ""));
  const story = rs.story ?? "";
  return {
    feature,
    story,
    ac,
    preRedCodeDir: rs.preProjectDir,
    recordedArtifactsFeatureDir: join60(CORPUS_RA, "features", feature),
    conventionsJson: join60(CORPUS_RA, "architecture", "conventions.json"),
    designDir: join60(CORPUS_RA, "design"),
    replay: rs
  };
}
function replayBundleForTurn(driverTurn) {
  switch (driverTurn) {
    case "green":
      return replayBundleFromTurn("0156-driver", "AC1-detail-view-shows-batch-and-serial");
    // REPAIR / REFACTOR default to stockflow-optimization-study turns (they carry replay-set/pre-consort ,
    // the handroll is retired). Run with LAKEBASE_SFTDD_CORPUS_DIR=examples/replay/corpora/stockflow-optimization-study
    // so these turn numbers resolve (they do NOT exist in the default stockflow-full corpus).
    case "repair":
      return replayBundleFromTurn("0065-driver-repair", "AC1-detail-lists-locations");
    case "refactor":
      return replayBundleFromTurn("0067-driver-refactor", "");
  }
}
function deriveFeatureForStory(story) {
  for (const f of readdirSync34(join60(CORPUS_RA, "features"), { withFileTypes: true })) {
    if (f.isDirectory() && existsSync58(join60(CORPUS_RA, "features", f.name, "stories", story))) return f.name;
  }
  throw new Error(`no corpus feature owns story "${story}" under ${CORPUS_RA}/features`);
}
var DRIVER_GREEN_BUNDLE = bundleFromDir(
  SETUP_DIR,
  "F6-split-tracking-code",
  "S3-stock-shows-split-fields",
  "AC1-split-fields-shown"
);
var DRIVER_GREEN_BUNDLE_S2 = bundleFromDir(
  join60(KIT, "tests/integration/live/driver-green-setup-s2"),
  "F6-split-tracking-code",
  "S2-drop-combined-code",
  "AC1-column-dropped"
);
function hasSourceFile(dir) {
  if (!existsSync58(dir)) return false;
  for (const e of readdirSync34(dir, { withFileTypes: true })) {
    const abs = join60(dir, e.name);
    if (e.isDirectory()) {
      if (hasSourceFile(abs)) return true;
    } else if (/\.(py|ts|tsx)$/.test(e.name)) {
      return true;
    }
  }
  return false;
}
function layReplayPreconditions(projectDir, consortDir, spec) {
  const artifactRel = relative8(projectDir, consortDir);
  const featureRel = join60(artifactRel, "features", spec.feature);
  const storyRel = join60(featureRel, "stories", spec.story);
  overlayBundle(projectDir, { trees: [{ from: spec.designDir, to: join60(artifactRel, "design") }] });
  const raStoryDir = join60(spec.recordedArtifactsFeatureDir, "stories", spec.story);
  const acFiles = readdirSync34(join60(raStoryDir, "acs")).filter((f) => f.endsWith(".json"));
  overlayBundle(projectDir, {
    trees: [{ from: spec.preProjectDir, to: "." }],
    files: [
      { from: join60(spec.recordedArtifactsFeatureDir, "architecture.json"), to: join60(featureRel, "architecture.json") },
      { from: join60(spec.recordedArtifactsFeatureDir, "db-design.json"), to: join60(featureRel, "db-design.json") },
      { from: spec.conventionsJson, to: join60(artifactRel, "architecture", "conventions.json") },
      { from: join60(raStoryDir, "story.json"), to: join60(storyRel, "story.json") },
      { from: join60(raStoryDir, "test-list-per-story.json"), to: join60(storyRel, "test-list-per-story.json") },
      ...acFiles.map((f) => ({ from: join60(raStoryDir, "acs", f), to: join60(storyRel, "acs", f) }))
    ]
  });
  for (const [src, dst] of [
    [join60(spec.recordedArtifactsFeatureDir, "architecture.md"), join60(featureRel, "architecture.md")],
    [join60(spec.recordedArtifactsFeatureDir, "db-design.md"), join60(featureRel, "db-design.md")],
    [join60(CORPUS_RA, "nfrs.md"), join60(artifactRel, "nfrs.md")]
  ]) {
    if (existsSync58(src)) overlayBundle(projectDir, { files: [{ from: src, to: dst }] });
  }
}
function generateLeanReplayManifest(chainManifestDir, feature, story, ac) {
  const files = readdirSync34(chainManifestDir).filter((f) => f.endsWith(".json"));
  let liveRaw;
  for (const f of files) {
    const raw = readFileSync53(join60(chainManifestDir, f), "utf8");
    const m = JSON.parse(raw);
    if (m.agent?.kind === "claude") {
      let out = raw;
      if (m.match?.story) out = out.split(m.match.story).join(story);
      if (m.match?.ac) out = out.split(m.match.ac).join(ac);
      out = out.split(BUILD_FEATURE_TEMPLATE).join(feature);
      liveRaw = out;
    }
  }
  if (!liveRaw) throw new Error(`no live (claude) manifest found in ${chainManifestDir} to template for replay`);
  const mf = JSON.parse(liveRaw);
  if (mf.agent?.config) {
    const cfg = mf.agent.config;
    cfg.disallowedTools = (cfg.disallowedTools ?? []).filter((t) => t !== "Bash");
    cfg.allowedTools = Array.from(/* @__PURE__ */ new Set([...cfg.allowedTools ?? [], "Bash"]));
  }
  if (mf.match?.role === "navigator" && mf.match.story && !mf.match.buildMode && !mf.match.ac) {
    mf.inputs = [
      { id: "test-list", source: "feature:.consort/features/{feature}/stories/{story}/test-list-per-story.json", description: "The story's ordered test list \u2013 every item must be covered + faithfully asserted." }
    ];
  }
  if (Array.isArray(mf.outputs)) mf.outputs = mf.outputs.filter((o) => o.id !== "agent-log");
  liveRaw = JSON.stringify(mf, null, 2);
  const dir = mkdtempSync2(join60(tmpdir2(), "replay-manifest-"));
  writeFileSync33(join60(dir, "live.json"), liveRaw);
  return dir;
}
async function runLeanReplayTurn(bundle, agentFor, manifestDir) {
  const rs = bundle.replay;
  if (!rs) throw new Error("runLeanReplayTurn requires a replay bundle (bundle.replay is unset)");
  const replayManifestDir = generateLeanReplayManifest(manifestDir, bundle.feature, bundle.story, bundle.ac);
  const { turns, producedArtifacts } = await runIntegrationChain({
    manifestDir: replayManifestDir,
    intakeDir: CORPUS_DIR,
    feature: bundle.feature,
    start: rs.action,
    // Seed the recorded pre-turn state (the SAME primitive the cloud lane uses), then drive from the
    // recorded prompt. Cloud-only routing (pipeline/branch) is NOT needed: a lean single-turn replay
    // starts directly at the recorded action and runs just that turn (its next action has no lean manifest).
    seedWorkspace: (ws) => {
      layReplayPreconditions(ws, join60(ws, ARTIFACT_ROOT), {
        feature: bundle.feature,
        story: bundle.story,
        preProjectDir: bundle.preRedCodeDir,
        recordedArtifactsFeatureDir: bundle.recordedArtifactsFeatureDir,
        conventionsJson: bundle.conventionsJson,
        designDir: bundle.designDir
      });
      const recCycleDir = join60(bundle.replay.turnDir, "files", ARTIFACT_ROOT, "cycles", bundle.feature, bundle.story, bundle.ac);
      const gf = join60(recCycleDir, "green-failure.json");
      if (existsSync58(gf)) {
        const dstDir = join60(ws, ARTIFACT_ROOT, "cycles", bundle.feature, bundle.story, bundle.ac);
        mkdirSync37(dstDir, { recursive: true });
        writeFileSync33(join60(dstDir, "green-failure.json"), readFileSync53(gf, "utf8"));
      }
      const lkSrc = join60(KIT, "examples/replay/lk");
      if (existsSync58(lkSrc)) {
        const lkDst = join60(ws, "scripts", "lk");
        mkdirSync37(join60(ws, "scripts"), { recursive: true });
        writeFileSync33(lkDst, readFileSync53(lkSrc, "utf8"));
        chmodSync2(lkDst, 493);
      }
    },
    recordedPromptFor: (ws) => rehydrate(rs.promptRaw, ws),
    agentFor,
    // A navigator/design turn writes its output under .consort (default snapshot); include code roots too
    // so a turn that touches app/tests/client (rare on the lean lane) is still preserved.
    extraSnapshotRoots: ["app", "tests", "client"]
  });
  return { turns, producedArtifacts };
}
function layBundle(projectDir, consortDir, driverTurn = "green", bundle = DRIVER_GREEN_BUNDLE) {
  const b = bundle;
  const artifactRel = relative8(projectDir, consortDir);
  const featureRel = join60(artifactRel, "features", b.feature);
  const storyRel = join60(featureRel, "stories", b.story);
  if (b.replay) {
    layReplayPreconditions(projectDir, consortDir, {
      feature: b.feature,
      story: b.story,
      preProjectDir: b.preRedCodeDir,
      recordedArtifactsFeatureDir: b.recordedArtifactsFeatureDir,
      conventionsJson: b.conventionsJson,
      designDir: b.designDir
    });
    const preConsortDir = b.replay.turnDir ? join60(b.replay.turnDir, "replay-set", "pre-consort") : "";
    if (existsSync58(preConsortDir)) {
      cpSync10(preConsortDir, consortDir, { recursive: true });
      console.log(`[layBundle] laid recorded pre-turn .consort verbatim from ${preConsortDir}`);
    } else if (driverTurn === "repair" || driverTurn === "refactor") {
      throw new Error(
        `${driverTurn} replay requires replay-set/pre-consort/ (the recorder snapshot), absent at ${preConsortDir || "(no turnDir)"}. This turn's corpus predates the recorder change \u2013 replay a pre-consort corpus, e.g. LAKEBASE_SFTDD_CORPUS_DIR=examples/replay/corpora/stockflow-optimization-study.`
      );
    }
    return;
  }
  if (driverTurn !== "green") {
    throw new Error(`non-replay ${driverTurn} bundles are retired \u2013 use a replay bundle whose replay-set carries pre-consort/`);
  }
  overlayBundle(projectDir, { trees: [{ from: b.designDir, to: join60(artifactRel, "design") }] });
  overlayBundle(projectDir, {
    trees: [{ from: b.preRedCodeDir, to: "." }],
    files: [
      { from: join60(b.recordedArtifactsFeatureDir, "architecture.json"), to: join60(featureRel, "architecture.json") },
      { from: join60(b.recordedArtifactsFeatureDir, "db-design.json"), to: join60(featureRel, "db-design.json") },
      { from: join60(b.recordedArtifactsFeatureDir, "stories", b.story, "acs", `${b.ac}.json`), to: join60(storyRel, "acs", `${b.ac}.json`) },
      { from: b.conventionsJson, to: join60(artifactRel, "architecture", "conventions.json") }
    ]
  });
  const master = JSON.parse(readFileSync53(join60(b.recordedArtifactsFeatureDir, "test-list.json"), "utf8"));
  const items = master.items.filter((i) => i.ac_id === b.ac);
  assertGt(items.length, 0, "bundle: S3 has test-list items");
  writeFileSync33(join60(projectDir, storyRel, "test-list-per-story.json"), JSON.stringify({ feature_id: b.feature, story_id: b.story, items }, null, 2) + "\n");
}
function resolveDriverGreenRunConfig() {
  const host = resolveTestEnv().host ?? "";
  if (host && !process.env.DATABRICKS_HOST) process.env.DATABRICKS_HOST = host;
  if (!host) return { host: "", scaffoldConfig: {} };
  const cfg = loadRunConfig(RUN_CONFIG_PATH);
  const scaffoldConfig = cfg.setup?.config ?? {};
  return { host: String(scaffoldConfig.databricksHost ?? host), scaffoldConfig };
}
async function sweepDriverGreenOrphans() {
  try {
    const scm = await import("@databricks-solutions/lakebase-scm-utils/lakebase");
    const report = await sweepOrphanProjects({
      parentDir: KIT,
      deleteLakebaseProject: (a) => scm.deleteLakebaseProject({ projectId: a.projectId, host: a.host }),
      prefixes: [...DEFAULT_TEST_PROJECT_PREFIXES, "dg-live-"]
    });
    if (report.length) {
      console.log(`[driver-green] orphan sweep: ${report.map((r) => `${r.projectId}=${r.deleted ? "deleted" : `LEFT (${r.error ?? "?"})`}`).join(", ")}`);
    }
  } catch (e) {
    console.log(`[driver-green] orphan sweep skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}
async function scaffoldDriverGreenProject() {
  await sweepDriverGreenOrphans();
  const { scaffoldConfig } = resolveDriverGreenRunConfig();
  scaffoldConfig.uiTrack = corpusRunConfig().ui_track;
  const setupCtx = { workspaceDir: KIT };
  const setup = await catalogueLifecycleDeps.run({ kind: "scaffold-project", config: scaffoldConfig }, setupCtx);
  if (!setup.ok || !setup.handle) throw new Error(`scaffold-project failed: ${setup.error ?? "no handle"}`);
  const handle = setup.handle;
  const projectDir = handle.projectDir;
  layDownKitAgents(projectDir, KIT);
  const worktreesRoot = mkdtempSync2(join60(tmpdir2(), "dg-worktrees-"));
  process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
  resolveKitSingleSource(KIT);
  assertKitSingleSource(projectDir, KIT);
  return {
    projectDir,
    lakebaseProjectId: handle.lakebaseProjectId,
    host: handle.databricksHost,
    parentBranch: handle.lakebaseDefaultBranch ?? "production",
    worktreesRoot,
    teardownCtx: { workspaceDir: KIT, setupHandle: setup.handle }
  };
}
async function teardownDriverGreenProject(project) {
  try {
    const res = await catalogueLifecycleDeps.run({ kind: "remove-project", config: {} }, project.teardownCtx);
    if (!res.ok) {
      console.log(`[driver-green] \u26A0\uFE0F remove-project reported failures for ${project.lakebaseProjectId}: ${res.error ?? "unknown"} \u2013 confirming below.`);
    }
  } catch (e) {
    console.log(`[driver-green] \u26A0\uFE0F remove-project THREW for ${project.lakebaseProjectId}: ${e instanceof Error ? e.message : String(e)} \u2013 confirming below.`);
  } finally {
    await confirmLakebaseProjectDeleted(project.lakebaseProjectId, project.host);
    delete process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS;
    clearKitSingleSource();
    rmSync18(project.worktreesRoot, { recursive: true, force: true });
    await sweepDriverGreenOrphans();
  }
}
async function confirmLakebaseProjectDeleted(projectId, host, attempts = 5) {
  if (!projectId || !host) return;
  try {
    const scm = await import("@databricks-solutions/lakebase-scm-utils/lakebase");
    for (let i = 1; i <= attempts; i++) {
      let stillThere;
      try {
        stillThere = await scm.getProjectInfo({ projectId, host }) !== void 0;
      } catch {
        stillThere = false;
      }
      if (!stillThere) {
        if (i > 1) {
          console.log(`[driver-green] confirmed ${projectId} deleted after ${i} check(s).`);
        }
        return;
      }
      console.log(`[driver-green] \u26A0\uFE0F ${projectId} still present after delete (attempt ${i}/${attempts}); re-deleting.`);
      try {
        await scm.deleteLakebaseProject({ projectId, host });
      } catch {
      }
      await new Promise((r) => setTimeout(r, 3e3));
    }
    console.log(`[driver-green] \u26A0\uFE0F ${projectId} STILL present after ${attempts} delete attempts \u2013 run the orphan sweep / delete by hand.`);
  } catch (e) {
    console.log(`[driver-green] confirm-deleted skipped for ${projectId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
async function runDriverGreenOnScaffold(project, opts = {}) {
  const driverTurn = opts.driverTurn ?? "green";
  const b = opts.bundle ?? replayBundleForTurn(driverTurn);
  const experimentSlug = opts.experimentSlug ?? `s3-driver-${driverTurn}`;
  const branchName = opts.branch ?? `experiment/${b.story}`;
  const { lakebaseProjectId, host, parentBranch } = project;
  const { wtDir, consortDir } = await cutWorktree({
    projectDir: project.projectDir,
    worktreesRoot: project.worktreesRoot,
    label: experimentSlug,
    branchPrefix: "dg",
    kitDir: KIT
  });
  const projectDir = wtDir;
  try {
    layBundle(projectDir, consortDir, driverTurn, b);
    execFileSync6("git", ["add", "-A"], { cwd: projectDir, stdio: "pipe" });
    execFileSync6("git", ["commit", "-m", `seed: pre-turn F6/S3 snapshot for driver ${driverTurn} (live)`, "--no-verify"], { cwd: projectDir, stdio: "pipe" });
    await cutExperiment({
      instance: lakebaseProjectId,
      consortDir,
      projectDir,
      featureId: b.feature,
      storyId: b.story,
      experimentSlug,
      branch: branchName,
      parentBranch,
      resetStaleBranch: true
    });
    if (driverTurn !== "green") {
      const cutBranchId = readFileSync53(join60(consortDir, "experiments", b.feature, b.story, experimentSlug, "branch.txt"), "utf8").trim();
      const storyCyclesDir = join60(consortDir, "cycles", b.feature, b.story);
      for (const acDir of readdirSync34(storyCyclesDir)) {
        const acPath = join60(storyCyclesDir, acDir);
        if (!statSync21(acPath).isDirectory()) continue;
        for (const f of readdirSync34(acPath)) {
          if (!/^cycle-.*\.json$/.test(f)) continue;
          const p = join60(acPath, f);
          const c = JSON.parse(readFileSync53(p, "utf8"));
          if (c.experiment_slug !== void 0) c.experiment_slug = experimentSlug;
          if (c.branch_id !== void 0) c.branch_id = cutBranchId;
          writeFileSync33(p, JSON.stringify(c, null, 2) + "\n");
        }
      }
    }
    writePipeline(consortDir, {
      version: 1,
      feature_id: b.feature,
      stories: {
        [b.story]: {
          status: "ready",
          gate: { status: "approved", approver: "human-proxy", approved_at: "2026-08-05T00:00:00Z", history: [] },
          experiment: { slug: experimentSlug, branch: branchName, parent: parentBranch, n: 1, status: "active", cut_at: "2026-08-05T00:00:00Z" }
        }
      },
      build_queue: [b.story],
      build_active: b.story
    });
    writeFileSync33(join60(consortDir, "workflow-state.json"), JSON.stringify({ phase: "implementation", phase_feature_id: b.feature }));
    if (driverTurn === "green") {
      beginNextPendingBatch({ consortDir, featureId: b.feature, story: b.story }, { cap: Number.MAX_SAFE_INTEGER });
      assertGt(storyTestProgress(consortDir, b.feature, b.story).openRed.length, 0, "setup: an open RED cycle exists");
    }
    layDownKitAgents(projectDir, KIT);
    if (opts.leverOverride) applyDriverLevers(projectDir, opts.leverOverride, consortDir);
    if (opts.port) assignWorktreePort(projectDir, opts.port);
    process.env.LAKEBASE_SFTDD_USE_MANIFEST_STEPS = "1";
    const rc = corpusRunConfig();
    const lever = opts.leverOverride;
    const driverModel = lever?.model;
    const driverEffort = lever?.effort;
    const driverAllowedTools = lever?.allowedTools;
    const driverDisallowedTools = lever?.disallowedTools;
    if (rc.gates && rc.gates !== "proxy") throw new Error(`recorded gates=${rc.gates}: only "proxy" gates are headless-viable for the sweep`);
    const cfg = {
      projectDir,
      consortDir,
      featureId: b.feature,
      runner: { async run() {
      } },
      useManifestSteps: true,
      // Recorded corpus value, lever-overridable. uiTrack was recorded full-stack (true); a client story
      // (e.g. the S3 StockViewPage repair) is unresolvable when it is forced off.
      uiTrack: lever?.uiTrack ?? rc.ui_track,
      approver: "human-proxy",
      deployTarget: lever?.deployTarget ?? rc.deploy_target,
      loopGranularity: lever?.loopGranularity ?? rc.loop_granularity,
      buildSessionScope: lever?.buildSessionScope ?? rc.build_session_scope,
      batchCap: lever?.batchCap ?? rc.batch_cap,
      // Per-role MODEL from the recording (rc.models[role]); the DRIVER role is perturbed by the lever.
      // The corpus records one model per role (not per-turn), so every turn of a role uses that model ,
      // faithful to the recording.
      modelForRole: (role) => role === "driver" && driverModel ? driverModel : rc.models[role] ?? "sonnet",
      modelForTurn: (role) => role === "driver" && driverModel ? driverModel : rc.models[role] ?? "sonnet",
      // EFFORT: the corpus recorded no per-driver effort, so the driver turn's baseline is the model
      // default (""); the lever perturbs it. (The one recorded effort, review_effort, is for the review
      // turn, which the navigator EVAL below pins to opus/high explicitly.)
      effortForTurn: (role) => role === "driver" && driverEffort ? driverEffort === "default" ? "" : driverEffort : "",
      // REPLAY: drive the TARGET driver turn from the corpus turn's recorded prompt.txt verbatim (the exact
      // context the agent saw), rehydrated to this worktree – so the recorded context is held constant and
      // the lever is the only perturbation. The navigator EVAL turn that follows returns undefined here, so
      // it derives its determination normally (the discriminator). Context levers append via contextPackSuffix.
      ...b.replay ? {
        instructionsOverride: (action) => {
          if (action.role !== "driver" || !("story" in action) || action.story !== b.story) return void 0;
          const bm = action.buildMode;
          const isTarget = driverTurn === "green" ? bm === void 0 : bm === driverTurn;
          return isTarget ? rehydrate(b.replay.promptRaw, projectDir) : void 0;
        }
      } : {},
      // CONTEXT-APPEND lever: a candidate's ctxPack (e.g. ["failing-test"]) APPENDS those context blocks
      // AFTER the (recorded) base body – leverage-what-was-there, never a substitute. Only for the target
      // driver turn; the eval turn gets none. This is how ctx-test's marginal effect is measured on top of
      // the recorded prompt (the recorded green prompt carries NO test body, so this adds exactly it).
      ...lever?.ctxPack && lever.ctxPack.length ? {
        contextPackSuffix: (role) => {
          if (role !== "driver") return "";
          return contextAppendBlocks(consortDir, b.story, lever.ctxPack);
        }
      } : {},
      allowedToolsForRole: (role) => {
        if (role === "driver") {
          if (driverAllowedTools) return driverAllowedTools;
          return ["Write", "Read", "Edit", "Bash"];
        }
        return void 0;
      },
      disallowedToolsForRole: (role) => {
        if (role === "driver" && driverDisallowedTools) return driverDisallowedTools;
        return void 0;
      }
    };
    cfg.runner = execRunner(cfg);
    const startTime = Date.now();
    const isTargetDriverTurn = (a) => {
      if (a.kind !== "invoke-role" || a.role !== "driver" || !("story" in a) || a.story !== b.story) return false;
      const bm = a.buildMode;
      if (driverTurn === "green") return !("mode" in a) && bm === void 0;
      return bm === driverTurn;
    };
    const result = await runDriver(buildDriveEffects(cfg), { stopWhen: (a) => !isTargetDriverTurn(a), maxSteps: 4 });
    const durationMs = Date.now() - startTime;
    const driverTx = peekLastAgentTranscript(projectDir);
    const driverUsage = peekLastAgentUsage(projectDir);
    const driverToolCalls = driverTx?.tools.length;
    const productCodeExists = hasSourceFile(join60(projectDir, "app"));
    const storyProgress = storyTestProgress(consortDir, b.feature, b.story);
    const allGreen = storyProgress.allGreen;
    assert(productCodeExists, "driver wrote product code under app/");
    assert(result.stoppedAtBound || result.stoppedAtMax || result.iterations >= 1, "driver ran at least one bounded iteration");
    assertEq(readPipeline(consortDir, b.feature).build_active, b.story, "the pipeline's build_active is the swept story");
    void host;
    const classify = classifyBuildTrial({
      result: {
        escalated: result.escalated ?? false,
        stoppedAtBound: result.stoppedAtBound ?? false,
        escalation: result.escalation
      },
      honestGreen: { passed: allGreen }
    });
    const producedArtifactsRaw = {
      ...snapshotTree(join60(projectDir, "app"), projectDir),
      ...snapshotTree(join60(projectDir, "tests"), projectDir),
      // CLIENT surface: on a UI story (uiTrack on – e.g. the S3 read-UI repair), the repair work lands
      // under client/, so the judge MUST see it – without this the client story was scored blind to its
      // own code (the confounder that made the driver-repair ladder plateau). Scope to client/src +
      // client/tests ONLY: snapshotTree does not filter, and the whole client/ tree includes
      // node_modules/.vite/dist (thousands of files) which would swamp the produced artifacts + judge.
      ...cfg.uiTrack ? snapshotTree(join60(projectDir, "client", "src"), projectDir) : {},
      ...cfg.uiTrack ? snapshotTree(join60(projectDir, "client", "tests"), projectDir) : {}
    };
    const producedArtifacts = Object.fromEntries(
      Object.entries(producedArtifactsRaw).filter(([p]) => !p.includes("__pycache__") && !p.endsWith(".pyc"))
    );
    const isDriverTurn = (a) => a.kind === "invoke-role" && a.role === "driver";
    const isNavigatorEval = (a) => a.kind === "invoke-role" && a.role === "navigator" && typeof a.buildMode === "string" && ["assess", "review", "assess-refactor", "reflect"].includes(String(a.buildMode));
    if (driverTurn === "refactor") {
      const storyCyc = join60(consortDir, "cycles", b.feature, b.story);
      rmSync18(join60(storyCyc, "review.json"), { force: true });
      rmSync18(join60(storyCyc, "review-verdict.json"), { force: true });
    }
    const evalSettings = resolveConsortSettings({ projectDir });
    const evalCfg = {
      ...cfg,
      modelForRole: (role) => role === "navigator" ? evalSettings.modelFor("navigator") : cfg.modelForRole(role),
      modelForTurn: (role, turn) => role === "navigator" ? evalSettings.modelFor("navigator", turn) : cfg.modelForTurn(role, turn),
      effortForTurn: (role, turn) => role === "navigator" ? evalSettings.effortFor("navigator", turn) : cfg.effortForTurn(role, turn)
    };
    evalCfg.runner = execRunner(evalCfg);
    let evalTurnRan = false;
    const stopAfterEval = (a) => {
      if (isNavigatorEval(a)) {
        evalTurnRan = true;
        return false;
      }
      return evalTurnRan || isDriverTurn(a);
    };
    await runDriver(buildDriveEffects(evalCfg), { stopWhen: stopAfterEval, maxSteps: 3 });
    const markerDirAbs = cycleDir(consortDir, b.feature, b.story, b.ac);
    const nextStepMarker = snapshotTree(markerDirAbs, markerDirAbs);
    const storyCycleDir = join60(consortDir, "cycles", b.feature, b.story);
    const rv = join60(storyCycleDir, "review-verdict.json");
    if (existsSync58(rv)) nextStepMarker["review-verdict.json"] = readFileSync53(rv, "utf8");
    const evalTx = peekLastAgentTranscript(projectDir);
    if (driverTx) {
      producedArtifacts["transcripts/driver-prompt.txt"] = driverTx.prompt;
      producedArtifacts["transcripts/driver-reasoning.txt"] = driverTx.finalText;
      producedArtifacts["transcripts/driver-tools.txt"] = driverTx.tools.join("\n");
    }
    if (evalTx) {
      producedArtifacts["transcripts/navigator-eval-prompt.txt"] = evalTx.prompt;
      producedArtifacts["transcripts/navigator-eval-reasoning.txt"] = evalTx.finalText;
      producedArtifacts["transcripts/navigator-eval-tools.txt"] = evalTx.tools.join("\n");
    }
    if (opts.afterGreen) await opts.afterGreen({ projectDir, featureId: b.feature, storyIndex: 1 });
    if (opts.experimentSlug || opts.branch || opts.leverOverride) {
      return {
        honestGreen: allGreen,
        durationMs,
        producedCodeDir: projectDir,
        escalated: result.escalated,
        classify,
        producedArtifacts,
        nextStepMarker,
        ...driverUsage ? { usage: driverUsage } : {},
        ...driverToolCalls !== void 0 ? { toolCalls: driverToolCalls } : {}
      };
    }
  } finally {
    try {
      await deleteExperiment({
        instance: lakebaseProjectId,
        consortDir,
        projectDir,
        featureId: b.feature,
        storyId: b.story,
        experimentSlug,
        deleteBranchToo: true
      });
    } catch {
    }
    forceRemoveWorktree(project.projectDir, wtDir);
    void host;
  }
}

// tests/optimization/experiment-config.ts
init_esm_shims();
import { readFileSync as readFileSync54 } from "fs";
var KNOWN_ROLES = [
  "architect-reviewer",
  "test-strategist",
  "spec-author",
  "ux-designer",
  "product-owner",
  "navigator",
  "driver",
  "dba"
];
function roleFromLabel(turn) {
  const afterOrdinal = turn.replace(/^\d+-/, "");
  const role = KNOWN_ROLES.find((r) => afterOrdinal === r || afterOrdinal.startsWith(r + "-"));
  if (!role) throw new Error(`turn label "${turn}": no known role (roles: ${KNOWN_ROLES.join(", ")})`);
  return role;
}
function substrateForRole(role) {
  return role === "driver" ? "cloud" : "lean";
}
function driverTurnFromLabel(turn) {
  if (/-repair\b/.test(turn) || turn.endsWith("-repair")) return "repair";
  if (/-refactor\b/.test(turn) || turn.endsWith("-refactor")) return "refactor";
  return "green";
}
function discriminatorFromLabel(turn) {
  if (/-refactor\b|-refactor$|-review\b|-review$/.test(turn)) return "review";
  if (/-navigator$/.test(turn)) return "red";
  return "assess";
}
function toLeverPatch(spec, candidateId) {
  const patch = {};
  if (spec.model !== void 0) patch.model = spec.model;
  if (spec.effort !== void 0) patch.effort = spec.effort;
  if (spec.uiTrack !== void 0) patch.uiTrack = spec.uiTrack;
  if (spec.loopGranularity !== void 0) patch.loopGranularity = spec.loopGranularity;
  if (spec.deployTarget !== void 0) patch.deployTarget = spec.deployTarget;
  if (spec.buildSessionScope !== void 0) patch.buildSessionScope = spec.buildSessionScope;
  if (spec.batchCap !== void 0) patch.batchCap = spec.batchCap;
  if (spec.allowedTools !== void 0) patch.allowedTools = spec.allowedTools;
  if (spec.disallowedTools !== void 0) patch.disallowedTools = spec.disallowedTools;
  if (spec.guardSuite !== void 0) patch.guardSuite = spec.guardSuite;
  if (spec.guardScan !== void 0) patch.guardScan = spec.guardScan;
  if (spec.context) {
    if (spec.context.mode === "append") {
      patch.ctxPack = spec.context.include ?? ["failing-test"];
    } else if (spec.context.mode === "replace") {
      throw new Error(`candidate "${candidateId}": context.mode "replace" is not yet dispatchable (append only for now)`);
    } else {
      throw new Error(`candidate "${candidateId}": context.mode must be "append" or "replace"`);
    }
  }
  return patch;
}
function loadExperimentConfig(path12) {
  const raw = JSON.parse(readFileSync54(path12, "utf8"));
  if (!raw.name || typeof raw.name !== "string") throw new Error(`experiment config ${path12}: missing "name"`);
  if (!raw.turn || typeof raw.turn !== "string") throw new Error(`experiment config ${path12}: missing "turn" (the corpus turn label)`);
  const discriminator = raw.discriminator ?? discriminatorFromLabel(raw.turn);
  const driverTurn = raw.driverTurn ?? driverTurnFromLabel(raw.turn);
  const storyScoped = discriminator === "red" || driverTurn === "refactor";
  if (!storyScoped && (!raw.ac || typeof raw.ac !== "string")) throw new Error(`experiment config ${path12}: missing "ac" (required for a "${discriminator}" turn)`);
  if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) throw new Error(`experiment config ${path12}: "candidates" must be a non-empty array`);
  const seen = /* @__PURE__ */ new Set();
  const roleCandidates2 = raw.candidates.map((c) => {
    if (!c.id || typeof c.id !== "string") throw new Error(`experiment config ${path12}: a candidate is missing "id"`);
    if (seen.has(c.id)) throw new Error(`experiment config ${path12}: duplicate candidate id "${c.id}"`);
    seen.add(c.id);
    return { id: c.id, levers: toLeverPatch(c.levers ?? {}, c.id) };
  });
  return {
    name: raw.name,
    turn: raw.turn,
    ac: raw.ac ?? "",
    driverTurn,
    discriminator,
    ...raw.concurrency !== void 0 ? { concurrency: raw.concurrency } : {},
    ...raw.replicas !== void 0 ? { replicas: raw.replicas } : {},
    candidates: raw.candidates,
    roleCandidates: roleCandidates2,
    role: roleFromLabel(raw.turn),
    substrate: substrateForRole(roleFromLabel(raw.turn))
  };
}

// consort/evaluation/semantic-gate.ts
init_esm_shims();
import { execFile } from "child_process";
import { existsSync as existsSync59, readFileSync as readFileSync55, readdirSync as readdirSync35, statSync as statSync22 } from "fs";
import { join as join61 } from "path";
var SEMANTIC_THRESHOLD = 0.85;
var FUNCTIONAL_THRESHOLD = 0.75;
function parseNavigatorAssessMarker(markerDir) {
  const sup = ["superseded.json", "superseded-tests.json"].map((n) => join61(markerDir, n)).find((p) => existsSync59(p));
  const reg = join61(markerDir, "regression-assessment.json");
  if (sup) {
    try {
      const j = JSON.parse(readFileSync55(sup, "utf8"));
      const raw = Array.isArray(j.tests) ? j.tests : Array.isArray(j.supersededTests) ? j.supersededTests : [];
      const tests = raw.map(String);
      return { score: 1, classification: "superseded-shift", nextStep: "permissive-refactor-superseded", supersededTests: tests };
    } catch {
    }
  }
  if (existsSync59(reg)) {
    try {
      const j = JSON.parse(readFileSync55(reg, "utf8"));
      const diagnosis = typeof j.diagnosis === "string" ? j.diagnosis : void 0;
      const fixDirective = (typeof j.fixDirective === "string" && j.fixDirective ? j.fixDirective : void 0) ?? (typeof j.fix === "string" && j.fix ? j.fix : void 0);
      return fixDirective ? { score: 1, classification: "regression", nextStep: "driver-repair-with-directive", ...diagnosis ? { diagnosis } : {}, fixDirective } : { score: 1, classification: "insufficient", nextStep: "escalate", ...diagnosis ? { diagnosis } : {} };
    } catch {
    }
  }
  const gf = join61(markerDir, "green-failure.json");
  if (existsSync59(gf)) {
    try {
      const g = JSON.parse(readFileSync55(gf, "utf8"));
      const summary = typeof g.summary === "string" ? g.summary : "";
      if (g.assessed === true || /fail/i.test(summary)) {
        return { score: 0, classification: "insufficient", nextStep: "escalate" };
      }
    } catch {
    }
  }
  return { score: 1, classification: "equivalent", nextStep: "accept" };
}
async function evaluateNavigatorAssessAlignment(args) {
  const nav = parseNavigatorAssessMarker(args.navigatorMarkerDir);
  const recorded = args.recordedVerdict;
  const classificationMatch = nav.classification === recorded.classification;
  if (!classificationMatch) {
    return {
      passed: false,
      classificationMatch: false,
      reason: `misclassification: navigator said "${nav.classification}" (${nav.nextStep}), ground truth is "${recorded.classification}" (${recorded.nextStep})`
    };
  }
  if (nav.classification === "superseded-shift") {
    const navSet = [...nav.supersededTests ?? []].sort();
    const recSet = [...recorded.supersededTests ?? []].sort();
    const identical = navSet.length === recSet.length && navSet.every((t, i) => t === recSet[i]);
    if (identical) {
      return { passed: true, classificationMatch: true, setEquivalent: true, reason: `aligned: navigator's superseded set is identical to the recorded ground truth (${navSet.length} tests)` };
    }
    const verdict = await args.deltaJudge({ navigatorSet: navSet, recordedSet: recSet, reason: nav.reason });
    return {
      passed: verdict.equivalent,
      classificationMatch: true,
      setEquivalent: verdict.equivalent,
      reason: verdict.equivalent ? `aligned: navigator's superseded set is coverage-equivalent to the recorded ground truth (delta-judged)` : `material difference vs the recorded ground truth: ${(verdict.materialDifferences ?? []).join("; ") || "sets not coverage-equivalent"}`
    };
  }
  return { passed: true, classificationMatch: true, reason: `aligned: both "${nav.classification}"` };
}
function buildSupersessionDeltaPrompt(navigatorSet, recordedSet, reason) {
  return [
    `You are a strict senior engineer comparing two SUPERSESSION answers for the same failed build turn \u2013 a Navigator's flagged set of prior tests it judged superseded by an intentional change (e.g. a dropped column), and the RECORDED GROUND-TRUTH set the canonical navigator produced for the same turn.`,
    reason ? `The supersession reason (why these tests are retired): ${reason}` : ``,
    `Decide whether the two sets are COVERAGE-EQUIVALENT: do they supersede the SAME behaviors / cover the SAME dropped-symbol references? Two correct assessors legitimately differ at the margin (a fitness test that only INDIRECTLY references the dropped symbol may reasonably be flagged or not) \u2013 such a difference is BENIGN. A MATERIAL difference is: the navigator MISSED a test the ground truth flags for the ACTUAL dropped symbol (an under-flag that would leave the verify red), or OVER-FLAGGED a still-valid test the ground truth keeps (which would wrongly retire live coverage).`,
    `Return ONLY a JSON object on a single line: {"equivalent": <bool>, "materialDifferences": ["<a real miss or over-flag, empty when none>", ...]}. equivalent:true when the difference is only benign/borderline; equivalent:false with the specific material difference(s) named otherwise.`,
    ``,
    `NAVIGATOR set (${navigatorSet.length}):`,
    ...navigatorSet.map((t) => `  ${t}`),
    ``,
    `RECORDED GROUND-TRUTH set (${recordedSet.length}):`,
    ...recordedSet.map((t) => `  ${t}`)
  ].join("\n");
}
function parseSupersessionDeltaReply(reply) {
  const m = reply.match(/\{[\s\S]*"equivalent"[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const equivalent = obj.equivalent === true;
      const materialDifferences = Array.isArray(obj.materialDifferences) ? obj.materialDifferences.map(String) : void 0;
      return { equivalent, ...materialDifferences ? { materialDifferences } : {} };
    } catch {
    }
  }
  return { equivalent: false, materialDifferences: ["delta-judge reply not parseable"] };
}
function makeSupersessionDeltaJudge(opts) {
  return ({ navigatorSet, recordedSet, reason }) => spawnOpusJudge(
    opts.cwd,
    buildSupersessionDeltaPrompt(navigatorSet, recordedSet, reason),
    parseSupersessionDeltaReply,
    (msg) => ({ equivalent: false, materialDifferences: [msg] })
  );
}
function buildRegressionFidelityPrompt(candidate, recorded, failureSummary) {
  return [
    `You are a strict senior engineer comparing two REGRESSION assessments for the SAME failed build-verify \u2013 a Navigator's diagnosis + fix directive, and the RECORDED GROUND-TRUTH assessment the canonical navigator produced for the same failure.`,
    failureSummary ? `The failure being diagnosed: ${failureSummary}` : ``,
    `Both assessments already agree it is a genuine, driver-fixable regression. Decide whether the CANDIDATE reaches the SAME ROOT CAUSE and prescribes a fix that would ACTUALLY RESOLVE that failure \u2013 the way the ground truth does.`,
    `Benign (aligned:true): the candidate names the same underlying root cause and a fix that would resolve the same failure, even with different wording, a different level of detail, or a different-but-equivalent way to express the same change.`,
    `MATERIAL (aligned:false): the candidate blames a DIFFERENT or WRONG root cause, or its fix targets the WRONG layer / would NOT resolve the actual failure \u2013 anything that would MISDIRECT the driver into the wrong change.`,
    `Return ONLY a JSON object on a single line: {"aligned": <bool>, "materialDifferences": ["<the wrong root cause or misdirected fix, empty when none>", ...]}. aligned:true when the difference is only benign/wording; aligned:false with the specific material divergence(s) named otherwise.`,
    ``,
    `RECORDED GROUND-TRUTH diagnosis:`,
    recorded.diagnosis ?? "(none)",
    ``,
    `RECORDED GROUND-TRUTH fixDirective:`,
    recorded.fixDirective ?? "(none)",
    ``,
    `CANDIDATE diagnosis:`,
    candidate.diagnosis ?? "(none)",
    ``,
    `CANDIDATE fixDirective:`,
    candidate.fixDirective ?? "(none)"
  ].join("\n");
}
function parseRegressionFidelityReply(reply) {
  const m = reply.match(/\{[\s\S]*"aligned"[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const aligned = obj.aligned === true;
      const materialDifferences = Array.isArray(obj.materialDifferences) ? obj.materialDifferences.map(String) : void 0;
      return { aligned, ...materialDifferences ? { materialDifferences } : {} };
    } catch {
    }
  }
  return { aligned: false, materialDifferences: ["regression-fidelity judge reply not parseable"] };
}
function makeRegressionFidelityJudge(opts) {
  return ({ candidate, recorded, failureSummary }) => spawnOpusJudge(
    opts.cwd,
    buildRegressionFidelityPrompt(candidate, recorded, failureSummary),
    parseRegressionFidelityReply,
    (msg) => ({ aligned: false, materialDifferences: [msg] })
  );
}
function buildJudgePrompt(step, reference, candidate) {
  return [
    `You are a strict design reviewer scoring SEMANTIC similarity for a "${step}" design-step artifact.`,
    `The REFERENCE is a known-good artifact recorded at this step. The CANDIDATE is a newly produced artifact for the same step.`,
    `Judge whether the CANDIDATE conveys the SAME design intent and behavioral coverage as the REFERENCE.`,
    `Judge MEANING, not wording: different phrasing, different ids/slugs, or a different split of the same content across sections is FINE.`,
    `What matters: every material behavior, entity, component, decision, or constraint the REFERENCE expresses is present (equivalently) in the CANDIDATE. Extra content in the CANDIDATE is fine and not penalized.`,
    `Return ONLY a JSON object on a single line: {"score": <0..1 float>, "missing": ["<material intent the CANDIDATE dropped>", ...]}. score 1.0 = full semantic coverage; lower as material intent is missing. missing lists ONLY dropped items (empty array when none).`,
    ``,
    `REFERENCE:`,
    "```json",
    reference,
    "```",
    ``,
    `CANDIDATE:`,
    "```json",
    candidate,
    "```"
  ].join("\n");
}
function buildFunctionalJudgePrompt(kind, reference, candidate) {
  const what = kind === "tests" ? `These are TEST files. Judge whether the CANDIDATE tests assert the SAME behaviors / acceptance criteria as the REFERENCE tests \u2013 the same things are verified (endpoints, validations, persistence invariants, edge/empty cases, migration reversibility).` : `These are CODE files. Judge whether the CANDIDATE code implements the SAME functionality as the REFERENCE \u2013 the same operations/endpoints, the same layer responsibilities (boundary/route, service, repository, model), the same persistence behavior.`;
  return [
    `You are a strict senior engineer scoring FUNCTIONAL similarity of ${kind} produced for one build turn.`,
    `The REFERENCE is the known-good ${kind} recorded for this story in a prior build. The CANDIDATE is newly produced ${kind} for the same story.`,
    what,
    `Judge FUNCTION, not form: different file names, symbol names, ordering, formatting, or a different structural split of the SAME behavior/functionality is FINE and must NOT lower the score. Only MISSING or CHANGED behavior/functionality lowers it. Extra behavior in the CANDIDATE is fine and not penalized.`,
    `Return ONLY a JSON object on a single line: {"score": <0..1 float>, "missing": ["<behavior/functionality the CANDIDATE dropped or changed>", ...]}. score 1.0 = full functional coverage; lower as material behavior/functionality is missing or altered. missing lists ONLY dropped/changed items (empty array when none).`,
    ``,
    `REFERENCE ${kind}:`,
    "```",
    reference,
    "```",
    ``,
    `CANDIDATE ${kind}:`,
    "```",
    candidate,
    "```"
  ].join("\n");
}
function parseJudgeReply(reply) {
  const m = reply.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const score = typeof obj.score === "number" ? Math.max(0, Math.min(1, obj.score)) : 0;
      const missing = Array.isArray(obj.missing) ? obj.missing.map(String) : void 0;
      return { score, missing, raw: reply };
    } catch {
    }
  }
  return { score: 0, missing: ["judge reply not parseable as a score"], raw: reply };
}
function makeOpusJudge(opts) {
  const model = opts.model ?? "opus";
  return ({ step, reference, candidate, functional }) => new Promise((resolve3) => {
    const prompt = functional ? buildFunctionalJudgePrompt(functional, reference, candidate) : buildJudgePrompt(step, reference, candidate);
    execFile(
      "claude",
      ["-p", prompt, "--model", model, "--permission-mode", "acceptEdits", "--strict-mcp-config", "--output-format", "json"],
      { cwd: opts.cwd, maxBuffer: 32 * 1024 * 1024, timeout: 5 * 6e4 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve3({ score: 0, missing: [`judge spawn failed: ${err.message}`] });
          return;
        }
        let text = stdout;
        try {
          const parsed = JSON.parse(stdout);
          if (typeof parsed.result === "string") text = parsed.result;
        } catch {
        }
        resolve3(parseJudgeReply(text));
      }
    );
  });
}
function spawnOpusJudge(cwd, prompt, parse, onFail) {
  return new Promise((resolve3) => {
    execFile(
      "claude",
      ["-p", prompt, "--model", "opus", "--permission-mode", "acceptEdits", "--strict-mcp-config", "--output-format", "json"],
      { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 5 * 6e4 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve3(onFail(`judge spawn failed: ${err.message}`));
          return;
        }
        let text = stdout;
        try {
          const parsed = JSON.parse(stdout);
          if (typeof parsed.result === "string") text = parsed.result;
        } catch {
        }
        resolve3(parse(text));
      }
    );
  });
}
function parseVerdictFile(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
function buildVerdictAlignmentJudgePrompt(recordedVerdict, candidateVerdict, kind) {
  const recordedJson = JSON.stringify(recordedVerdict, null, 2);
  const candidateJson = JSON.stringify(candidateVerdict, null, 2);
  if (kind === "review") {
    return [
      `You are a strict senior engineer comparing two REVIEW verdicts for the same driver turn.`,
      `The RECORDED GROUND-TRUTH verdict is the canonical navigator's review for this turn. The CANDIDATE is a newly produced review verdict.`,
      ``,
      `Judge two things:`,
      `  (1) DECISION: does the candidate's refactor decision match the recorded decision (both true, or both false)? This is a HARD gate: mismatched decisions always fail.`,
      `  (2) SUBSTANCE: if decisions match, are the candidate's notes substantive and consistent with the recorded critique? Substantive means: specific NFR analysis + concrete observations. Consistency means: the candidate's notes support the same decision (e.g. if refactor=false, the notes say "no improvement warranted" or similar; if refactor=true, the notes cite specific NFR gaps).`,
      ``,
      `Return ONLY a JSON object on a single line: {"decisionMatch": <bool>, "substantive": <bool>, "reason": "<brief explanation>"}. decisionMatch is hard-required; substantive is only checked when decisionMatch=true.`,
      ``,
      `RECORDED verdict:`,
      "```json",
      recordedJson,
      "```",
      ``,
      `CANDIDATE verdict:`,
      "```json",
      candidateJson,
      "```"
    ].join("\n");
  } else {
    return [
      `You are a strict senior engineer comparing two REFLECT verdicts for the same story end.`,
      `The RECORDED GROUND-TRUTH verdict is the canonical navigator's reflect for this story. The CANDIDATE is a newly produced reflect verdict.`,
      ``,
      `Judge two things:`,
      `  (1) DECISION: does the candidate's passed decision match the recorded decision (both true, or both false)? This is a HARD gate: mismatched decisions always fail.`,
      `  (2) SUBSTANCE: if decisions match, are the candidate's findings substantive and consistent with the recorded findings? Substantive means: specific design gaps / inconsistencies identified (e.g. "test coverage missing <item>", "layer boundary violation in <file>"). Consistency means: the candidate identifies real gaps that align with the recorded findings (or correctly finds none when passed=true).`,
      ``,
      `Return ONLY a JSON object on a single line: {"decisionMatch": <bool>, "substantive": <bool>, "reason": "<brief explanation>"}. decisionMatch is hard-required; substantive is only checked when decisionMatch=true.`,
      ``,
      `RECORDED verdict:`,
      "```json",
      recordedJson,
      "```",
      ``,
      `CANDIDATE verdict:`,
      "```json",
      candidateJson,
      "```"
    ].join("\n");
  }
}
function parseVerdictAlignmentReply(reply) {
  const m = reply.match(/\{[\s\S]*"decisionMatch"[\s\S]*\}/);
  if (!m) {
    return { passed: false, decisionMatch: false, reason: "verdict-alignment judge reply not parseable" };
  }
  try {
    const obj = JSON.parse(m[0]);
    const decisionMatch = obj.decisionMatch === true;
    const substantive = obj.substantive === true;
    const reason = typeof obj.reason === "string" ? obj.reason : "no reason provided";
    const passed = decisionMatch && (obj.substantive === void 0 ? true : substantive);
    return { passed, decisionMatch, ...obj.substantive !== void 0 ? { substantive } : {}, reason };
  } catch {
    return { passed: false, decisionMatch: false, reason: "verdict-alignment judge reply not parseable" };
  }
}
function makeVerdictAlignmentJudge(opts) {
  return ({ recordedVerdict, candidateVerdict, kind }) => spawnOpusJudge(
    opts.cwd,
    buildVerdictAlignmentJudgePrompt(recordedVerdict, candidateVerdict, kind),
    parseVerdictAlignmentReply,
    (msg) => ({ passed: false, decisionMatch: false, reason: msg })
  );
}
async function evaluateAssessNextStep(args) {
  const recorded = parseNavigatorAssessMarker(args.recordedMarkerDir);
  const candidate = parseNavigatorAssessMarker(args.candidateMarkerDir);
  const rc = recorded.classification;
  const cc = candidate.classification;
  const base = { recordedClass: rc, candidateClass: cc };
  if (rc === "superseded-shift" && cc === "superseded-shift") {
    const recSet = [...recorded.supersededTests ?? []].sort();
    const navSet = [...candidate.supersededTests ?? []].sort();
    const recIn = new Set(recSet);
    const navIn = new Set(navSet);
    const identical = navSet.length === recSet.length && navSet.every((t, i) => t === recSet[i]);
    if (identical) {
      return { ...base, verdict: "pass", reason: `candidate's superseded set is identical to the recorded ground truth (${navSet.length} tests)` };
    }
    const candidateSubset = navSet.every((t) => recIn.has(t)) && navSet.length < recSet.length;
    const candidateSuperset = recSet.every((t) => navIn.has(t)) && navSet.length > recSet.length;
    const verdict = await args.deltaJudge({ navigatorSet: navSet, recordedSet: recSet, reason: candidate.reason });
    if (verdict.equivalent) {
      return { ...base, verdict: "pass", reason: `candidate's superseded set is coverage-equivalent to the recorded ground truth (delta-judged)` };
    }
    if (candidateSubset) {
      return { ...base, verdict: "pass-with-honors", betterThanRecorded: true, reason: `candidate flagged a strict subset of the recorded superseded set (${navSet.length} of ${recSet.length}) \u2013 fewer issues: ${(verdict.materialDifferences ?? []).join("; ")}` };
    }
    return { ...base, verdict: "fail", reason: `candidate's superseded set differs materially from the recorded ground truth${candidateSuperset ? " (over-flagged more tests)" : ""}: ${(verdict.materialDifferences ?? []).join("; ") || "sets not coverage-equivalent"}` };
  }
  if (rc === "regression" && cc === "regression" && args.regressionJudge) {
    const verdict = await args.regressionJudge({
      candidate: { diagnosis: candidate.diagnosis, fixDirective: candidate.fixDirective },
      recorded: { diagnosis: recorded.diagnosis, fixDirective: recorded.fixDirective },
      ...args.failureSummary ? { failureSummary: args.failureSummary } : {}
    });
    if (verdict.aligned) {
      return { ...base, verdict: "pass", reason: `candidate's regression assessment reaches the same root cause + a resolving fix as the recorded ground truth (fidelity-judged)` };
    }
    return { ...base, verdict: "fail", reason: `candidate's regression assessment diverges materially from the recorded ground truth: ${(verdict.materialDifferences ?? []).join("; ") || "different root cause / misdirected fix"}` };
  }
  const RANK = { equivalent: 3, "superseded-shift": 2, regression: 1, insufficient: 0 };
  const rr = RANK[rc] ?? 1;
  const cr = RANK[cc] ?? 1;
  if (cr > rr) {
    return { ...base, verdict: "pass-with-honors", betterThanRecorded: true, reason: `candidate's next-turn navigator reached a MORE-RESOLVED determination "${cc}" than the recorded "${rc}" (resolution ladder: ${rc} -> ${cc})` };
  }
  if (cr < rr) {
    return { ...base, verdict: "fail", reason: `candidate's next-turn navigator determination "${cc}" is LESS resolved than the recorded "${rc}" (resolution ladder)` };
  }
  return { ...base, verdict: "pass", reason: `candidate's next-turn navigator reached an equally-resolved determination ("${cc}", same as recorded)` };
}
async function evaluateReviewResolution(args) {
  const base = { recordedClass: "review:refactor-requested", candidateClass: args.candidateReview.refactor ? "review:refactor-requested" : "review:clean" };
  if (args.candidateReview.refactor === false) {
    return { ...base, verdict: "pass", reason: `candidate's post-refactor review is clean (refactor=false) \u2013 the recorded directive's issue was resolved` };
  }
  const align = await args.verdictJudge({ recordedVerdict: args.recordedDirective, candidateVerdict: args.candidateReview, kind: "review" });
  return {
    ...base,
    verdict: "fail",
    reason: align.decisionMatch ? `candidate's post-refactor review STILL requests refactor for the same issue (unresolved): ${align.reason}` : `candidate's post-refactor review requests refactor for a DIFFERENT issue than the recorded directive (introduced/left a new problem): ${align.reason}`
  };
}
async function evaluateNextStepDetermination(args) {
  if (args.evaluatorKind === "assess") {
    if (args.recordedMarkerDir === void 0 || args.candidateMarkerDir === void 0) {
      throw new Error("evaluateNextStepDetermination(assess) requires recordedMarkerDir + candidateMarkerDir");
    }
    return evaluateAssessNextStep({
      recordedMarkerDir: args.recordedMarkerDir,
      candidateMarkerDir: args.candidateMarkerDir,
      deltaJudge: args.deltaJudge,
      ...args.regressionJudge ? { regressionJudge: args.regressionJudge } : {},
      ...args.failureSummary ? { failureSummary: args.failureSummary } : {}
    });
  }
  if (args.recordedReviewDirective === void 0 || args.candidateReview === void 0) {
    throw new Error("evaluateNextStepDetermination(review) requires recordedReviewDirective + candidateReview");
  }
  return evaluateReviewResolution({ recordedDirective: args.recordedReviewDirective, candidateReview: args.candidateReview, verdictJudge: args.verdictJudge });
}

// tests/optimization/optimize-role.cli.ts
var DRIVER_TURN_SPECS = {
  "driver-green": { driverTurn: "green", evaluatorKind: "assess", refRel: "next-step/driver-green" },
  // The S2-drop-combined MIGRATION thrasher pin (the turn where the full-suite waste is large enough to
  // exceed the S3 variance; see DRIVER-GREEN-LEVERS.md). Same green turn, its OWN bundle + judge reference.
  // recordedBaselineMs = the recorded original 002-driver green wall-clock (stockflow-full agent-log,
  // S2-drop-combined-code, first `green` phase = 667.2s) – the fixed time baseline for same/better/worse.
  "driver-green-s2": { driverTurn: "green", evaluatorKind: "assess", refRel: "next-step/driver-green-s2", recordedBaselineMs: 667200 },
  "driver-repair": { driverTurn: "repair", evaluatorKind: "assess", refRel: "next-step/driver-repair" },
  "driver-refactor": { driverTurn: "refactor", evaluatorKind: "review", refRel: "next-step/driver-refactor" }
};
var CHAIN_SETS = {
  design: Object.keys(ROLE_CHAINS),
  navigator: Object.keys(BUILD_ROLE_CHAINS),
  driver: Object.keys(DRIVER_TURN_SPECS)
  // driver-green, driver-repair, driver-refactor
};
function allChains() {
  const driver = Object.fromEntries(Object.keys(DRIVER_TURN_SPECS).map((h) => [h, { id: h }]));
  return { ...ROLE_CHAINS, ...BUILD_ROLE_CHAINS, ...driver };
}
function expandChains(spec, chains = allChains()) {
  const raw = CHAIN_SETS[spec] ?? spec.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const h of raw) {
    if (!chains[h]) {
      throw new Error(`optimize-role: unknown chain "${h}". Sets: ${Object.keys(CHAIN_SETS).join(", ")}. Handles: ${Object.keys(chains).join(", ")}`);
    }
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  if (out.length === 0) throw new Error(`optimize-role: --chains "${spec}" expanded to nothing`);
  return out;
}
function parseArgs(argv, chains = allChains()) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : void 0;
  };
  const chainsSpec = get("--chains");
  const role = get("--role");
  if (!chainsSpec && !role) {
    throw new Error(`optimize-role: --chains <set|list> (or --role <handle>) is required. Sets: ${Object.keys(CHAIN_SETS).join(", ")}. Handles: ${Object.keys(chains).join(", ")}`);
  }
  const resolved = chainsSpec ? expandChains(chainsSpec, chains) : expandChains(role, chains);
  const conc = get("--concurrency");
  const cands = get("--candidates");
  const reps = get("--replicas");
  return {
    chains: resolved,
    ...get("--base-model") ? { baseModel: get("--base-model") } : {},
    ...get("--telemetry-dir") ? { telemetryDir: get("--telemetry-dir") } : {},
    ...conc !== void 0 ? { concurrency: Math.max(1, Number(conc) || 1) } : {},
    ...cands ? { candidates: cands.split(",").map((s) => s.trim()).filter(Boolean) } : {},
    ...reps !== void 0 ? { replicas: Math.max(1, Number(reps) || 1) } : {},
    ...get("--experiment") ? { experiment: get("--experiment") } : {}
  };
}
function expandReplicas(cands, replicas) {
  const n = Math.max(1, replicas ?? 1);
  if (n === 1) return cands;
  return cands.flatMap((c) => Array.from({ length: n }, (_, k) => ({ ...c, id: `${c.id}-r${k + 1}` })));
}
function baseModelFor(role, override) {
  if (override) return override;
  const spawnable = {
    "spec-author-story": "spec-author",
    "spec-author-propose": "spec-author",
    "architect-reviewer": "architect-reviewer",
    "architect-estimator": "architect-reviewer",
    dba: "dba",
    "test-strategist": "test-strategist"
  };
  const r = spawnable[role];
  return r && RECOMMENDED_MODELS[r] || "sonnet";
}
function selectDriverCandidates(all, subset) {
  if (!subset?.length) return all;
  const missing = subset.filter((id) => !all.some((c) => c.id === id));
  if (missing.length) {
    throw new Error(`optimize-role: unknown driver-green candidate(s): ${missing.join(", ")}. Known: ${all.map((c) => c.id).join(", ")}`);
  }
  return all.filter((c) => subset.includes(c.id));
}
async function runReplayCandidate(args) {
  if (args.substrate === "lean") {
    if (!args.bundle) throw new Error("lean replay requires a bundle (the corpus turn to replay)");
    if (!args.manifestDir) throw new Error("lean replay requires a manifestDir (the chain's manifest subdir)");
    const { turns, producedArtifacts: producedArtifacts2 } = await runLeanReplayTurn(args.bundle, args.agentFor, args.manifestDir);
    return { turns, producedArtifacts: producedArtifacts2, gate: { passed: true } };
  }
  const result = await runDriverGreenOnScaffold(args.project, {
    experimentSlug: `${args.pfx}-${args.driverTurn}-${args.candidateId}`,
    branch: `experiment/${args.pfx.toUpperCase()}-${args.driverTurn}-${args.candidateId}`,
    driverTurn: args.driverTurn,
    port: deployPortForIndex(args.idx),
    ...args.bundle ? { bundle: args.bundle } : {},
    ...Object.keys(args.levers).length ? { leverOverride: args.levers } : {}
  });
  if (!result) throw new Error(`runDriverGreenOnScaffold returned void (expected RunDriverGreenResult)`);
  const producedArtifacts = { ...result.producedArtifacts };
  for (const [k, v] of Object.entries(result.nextStepMarker)) producedArtifacts[`${NEXT_STEP_MARKER_PREFIX}${k.split("/").pop()}`] = v;
  producedArtifacts["repair-honest-green.json"] = JSON.stringify({ passed: result.honestGreen });
  return {
    turns: [],
    producedArtifacts,
    gate: { passed: true },
    durationMs: result.durationMs,
    ...result.usage ? { usage: result.usage } : {},
    ...result.toolCalls !== void 0 ? { toolCalls: result.toolCalls } : {}
  };
}
function buildReplayTurnJudge(turnLabel, feature, story, ac, discriminator) {
  const cwd = process.cwd();
  if (discriminator === "red") {
    const judge = makeOpusJudge({ cwd });
    const RED_EXTS = [".py", ".ts", ".tsx", ".feature"];
    const recMap = snapshotTree(join62(CORPUS_TURNS, turnLabel, "files"), join62(CORPUS_TURNS, turnLabel, "files"));
    const reference = concatTreeFiles(recMap, "tests/", RED_EXTS) + "\n" + concatTreeFiles(recMap, "client/tests/", RED_EXTS);
    if (!reference.trim()) {
      throw new Error(`buildReplayTurnJudge(red): recorded turn ${turnLabel} has no test tree under files/tests|client/tests \u2013 cannot judge.`);
    }
    return {
      judgeCandidate: async ({ producedArtifacts }) => {
        const candidate = concatTreeFiles(producedArtifacts, "tests/", RED_EXTS) + "\n" + concatTreeFiles(producedArtifacts, "client/tests/", RED_EXTS);
        if (!candidate.trim()) return { passed: false, reason: "no tests produced to judge" };
        const v = await judge({ step: "test-list", reference, candidate, functional: "tests" });
        return { passed: v.score >= FUNCTIONAL_THRESHOLD, score: v.score };
      }
    };
  }
  if (discriminator === "review") {
    throw new Error(`buildReplayTurnJudge: discriminator "${discriminator}" not yet wired (assess + red only)`);
  }
  const deltaJudge = makeSupersessionDeltaJudge({ cwd });
  const verdictJudge = makeVerdictAlignmentJudge({ cwd });
  const regressionJudge = makeRegressionFidelityJudge({ cwd });
  const recSrc = join62(CORPUS_TURNS, turnLabel, "files", ARTIFACT_ROOT, "cycles", feature, story, ac);
  const MARKER_FILES = ["regression-assessment.json", "superseded-tests.json"];
  const failureSummary = (() => {
    const p = join62(recSrc, "green-failure.json");
    if (!existsSync60(p)) return void 0;
    try {
      const g = JSON.parse(readFileSync56(p, "utf8"));
      return typeof g.summary === "string" ? g.summary : void 0;
    } catch {
      return void 0;
    }
  })();
  return {
    judgeCandidate: async ({ producedArtifacts }) => {
      const recDir = mkdtempSync3(join62(tmpdir3(), "rec-assess-"));
      const candDir = mkdtempSync3(join62(tmpdir3(), "cand-assess-"));
      try {
        for (const f of MARKER_FILES) {
          const p = join62(recSrc, f);
          if (existsSync60(p)) writeFileSync34(join62(recDir, f), readFileSync56(p, "utf8"));
        }
        const cyclePrefix = join62(ARTIFACT_ROOT, "cycles", feature, story, ac) + "/";
        for (const [k, v] of Object.entries(producedArtifacts)) {
          const base = k.startsWith(cyclePrefix) ? k.slice(cyclePrefix.length) : void 0;
          if (base && MARKER_FILES.includes(base)) writeFileSync34(join62(candDir, base), v);
        }
        const outcome = await evaluateNextStepDetermination({
          evaluatorKind: "assess",
          deltaJudge,
          verdictJudge,
          regressionJudge,
          ...failureSummary ? { failureSummary } : {},
          recordedMarkerDir: recDir,
          candidateMarkerDir: candDir
        });
        const passed = outcome.verdict !== "fail";
        const classification = outcome.verdict === "pass-with-honors" ? "pass-with-honors" : outcome.candidateClass;
        return { passed, classification, nextStep: outcome.verdict, reason: outcome.reason };
      } finally {
        rmSync19(recDir, { recursive: true, force: true });
        rmSync19(candDir, { recursive: true, force: true });
      }
    }
  };
}
function readRecordedNextReview(turnLabel, feature, story) {
  const ord = Number(turnLabel.split("-")[0]);
  const next = readdirSync36(CORPUS_TURNS).filter((d) => Number(d.split("-")[0]) === ord + 1).sort()[0];
  if (!next) throw new Error(`readRecordedNextReview: no turn after ${turnLabel} (ordinal ${ord + 1}) in ${CORPUS_TURNS}`);
  const rv = join62(CORPUS_TURNS, next, "files", ARTIFACT_ROOT, "cycles", feature, story, "review-verdict.json");
  if (!existsSync60(rv)) throw new Error(`readRecordedNextReview: turn-after ${next} has no story-level review-verdict at ${rv} (the repair's recorded next step is not a review)`);
  return parseVerdictFile(readFileSync56(rv, "utf8"));
}
function readRecordedRefactorDirective(feature, story) {
  const rv = join62(CORPUS_RA, "cycles", feature, story, "review-verdict.json");
  if (!existsSync60(rv)) throw new Error(`readRecordedRefactorDirective: no story-level review-verdict at ${rv} (the refactor's recorded directive)`);
  return parseVerdictFile(readFileSync56(rv, "utf8"));
}
function buildReviewResolutionJudge(recordedReviewDirective) {
  const cwd = process.cwd();
  const deltaJudge = makeSupersessionDeltaJudge({ cwd });
  const verdictJudge = makeVerdictAlignmentJudge({ cwd });
  return {
    judgeCandidate: async ({ producedArtifacts }) => {
      let resolved;
      const hg = producedArtifacts["repair-honest-green.json"];
      if (hg !== void 0) {
        try {
          resolved = JSON.parse(hg).passed === true;
        } catch {
          resolved = false;
        }
      } else {
        resolved = producedArtifacts[`${NEXT_STEP_MARKER_PREFIX}review-verdict.json`] !== void 0;
      }
      if (!resolved) return { passed: false, reason: "driver turn did not hold honest-GREEN \u2013 not the same quality as the recorded resolved turn" };
      const candRaw = producedArtifacts[`${NEXT_STEP_MARKER_PREFIX}review-verdict.json`];
      if (candRaw === void 0) return { passed: false, reason: "no next-step review-verdict captured \u2013 the navigator's next review did not run/produce a verdict" };
      const candidateReview = parseVerdictFile(candRaw);
      const outcome = await evaluateNextStepDetermination({ evaluatorKind: "review", deltaJudge, verdictJudge, recordedReviewDirective, candidateReview });
      const passed = outcome.verdict !== "fail";
      const classification = outcome.verdict === "pass-with-honors" ? "pass-with-honors" : outcome.candidateClass;
      return { passed, classification, nextStep: outcome.verdict, reason: outcome.reason };
    }
  };
}
function buildDriverRepairNextStepJudge(turnLabel, feature, story) {
  return buildReviewResolutionJudge(readRecordedNextReview(turnLabel, feature, story));
}
function buildDriverRefactorNextStepJudge(feature, story) {
  return buildReviewResolutionJudge(readRecordedRefactorDirective(feature, story));
}
async function sweepDriverGreen(handle, runRoot, opts = {}) {
  if (!process.env.RUN_LIVE_STEP || !process.env.LAKEBASE_TEST_E2E) {
    throw new Error(
      `optimize-role: driver sweep requires RUN_LIVE_STEP=1 LAKEBASE_TEST_E2E=1 (live cloud gate). This is a LIVE driver harness, not a lean chain run. Use the driver-build-support harness directly or set the gates.`
    );
  }
  const spec = DRIVER_TURN_SPECS[handle];
  if (!spec) throw new Error(`optimize-role: unknown driver handle "${handle}" (known: ${Object.keys(DRIVER_TURN_SPECS).join(", ")})`);
  const runDir = join62(runRoot, handle);
  mkdirSync38(runDir, { recursive: true });
  const experiment = opts.experiment ? loadExperimentConfig(opts.experiment) : void 0;
  if (experiment && experiment.driverTurn !== spec.driverTurn) {
    throw new Error(`experiment "${experiment.name}" driverTurn=${experiment.driverTurn} does not match handle ${handle} (driverTurn=${spec.driverTurn})`);
  }
  const experimentBundle = experiment ? replayBundleFromTurn(experiment.turn, experiment.ac) : void 0;
  const all = experiment ? experiment.roleCandidates : driverGreenCandidates();
  const replicas = experiment?.replicas ?? opts.replicas;
  const candidates = expandReplicas(selectDriverCandidates(all, opts.candidates), replicas);
  const concurrency = experiment?.concurrency ?? opts.concurrency;
  console.log(`[optimize-role] ${handle}: CLOUD LIVE driver-GREEN sweep${experiment ? ` [experiment: ${experiment.name} @ turn ${experiment.turn}]` : ""}, ${candidates.length} candidate(s)${opts.candidates?.length ? ` (subset: ${opts.candidates.join(",")})` : ""}${(replicas ?? 1) > 1 ? ` x${replicas} replicas` : ""}, concurrency=${concurrency ?? 1}. run dir: ${runDir}`);
  const quality = experiment && experimentBundle && spec.driverTurn === "repair" ? buildDriverRepairNextStepJudge(experiment.turn, experimentBundle.feature, experimentBundle.story) : experiment && experimentBundle && spec.driverTurn === "refactor" ? buildDriverRefactorNextStepJudge(experimentBundle.feature, experimentBundle.story) : buildDriverNextStepJudge(handle);
  const project = await scaffoldDriverGreenProject();
  const driverChain = { dir: handle, outputFile: "app", prompt: `driver ${spec.driverTurn} (live, shared scaffold)` };
  const pinnedBundle = experimentBundle ?? (handle === "driver-green-s2" ? DRIVER_GREEN_BUNDLE_S2 : void 0);
  const pfx = (pinnedBundle?.story ?? "S3-stock-shows-split-fields").split("-")[0].toLowerCase();
  const runChain = async (_c, agentFor, candidateId, levers) => {
    const idx = Math.max(0, candidates.findIndex((c) => c.id === candidateId));
    return runReplayCandidate({
      substrate: "cloud",
      bundle: pinnedBundle,
      project,
      candidateId,
      levers,
      agentFor,
      idx,
      driverTurn: spec.driverTurn,
      pfx
    });
  };
  let trials;
  try {
    trials = await runRoleSweep(driverChain, candidates, runChain, {
      ...concurrency ? { concurrency } : {},
      quality,
      onStart: (candidate, i, total) => {
        console.log(`[optimize-role] ${handle} (${i}/${total}) running ${candidate.id} ...`);
      },
      onDone: (trial, i, total) => {
        persistTrial(runDir, driverChain, "sonnet", trial);
        const q = trial.qualityPassed === void 0 ? "" : trial.qualityPassed ? ` judge PASSED (${trial.telemetry?.classification ?? "?"})` : ` judge FAILED (${trial.telemetry?.classification ?? "?"})`;
        const status = trial.disqualified ? `DISQUALIFIED (${trial.reason})` : trial.gatePassed ? "honest-GREEN" : "not-green";
        console.log(`[optimize-role] ${handle} (${i}/${total}) ${trial.candidateId}: ${status}${q}${trial.telemetry?.outerDurationMs ? ` \u2013 ${(trial.telemetry.outerDurationMs / 1e3).toFixed(1)}s` : ""}`);
      }
    });
  } finally {
    await teardownDriverGreenProject(project);
    await sweepDriverGreenOrphans();
  }
  const report = reportRoleSweep(trials, spec.recordedBaselineMs);
  writeFileSync34(join62(runDir, "report.txt"), formatRoleSweepReport(report) + "\n");
  const summary = buildChainSummary(handle, "sonnet", trials, report);
  writeFileSync34(join62(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`
[${handle}]
` + formatRoleSweepReport(report));
  return { summary };
}
function readCampReference(relFromCorpusRoot, what) {
  const p = join62(process.cwd(), BUILD_CORPUS_REL, relFromCorpusRoot);
  if (!existsSync60(p)) {
    throw new Error(`optimize-role: MISSING recorded reference for ${what} at ${p} \u2013 the LLM judge is mandatory and cannot run without it. Extract it from the corpus into the camp first.`);
  }
  return readFileSync56(p, "utf8");
}
var DRIVER_GREEN_CODE_PIN_REL = "recorded-build/features/F6-split-tracking-code/stories/S1-split-columns-migration/turns/003-driver/code/app";
var NEXT_STEP_MARKER_PREFIX = "navigator-eval/";
function concatTreeFiles(producedArtifacts, prefix, exts) {
  return Object.entries(producedArtifacts).filter(([k]) => k.startsWith(prefix) && exts.some((e) => k.endsWith(e))).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).join("\n");
}
function readCampAppDir(relFromCorpusRoot, what) {
  const dir = join62(process.cwd(), BUILD_CORPUS_REL, relFromCorpusRoot);
  if (!existsSync60(dir)) {
    throw new Error(`optimize-role: MISSING recorded reference for ${what} at ${dir} \u2013 the LLM judge is mandatory and cannot run without it. Extract it from the corpus into the camp first.`);
  }
  const tree = snapshotTree(dir, dir);
  const text = Object.entries(tree).filter(([k]) => k.endsWith(".py")).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).join("\n");
  if (!text.trim()) {
    throw new Error(`optimize-role: recorded reference for ${what} at ${dir} has no .py files \u2013 cannot judge produced code against an empty reference.`);
  }
  return text;
}
function buildChainJudge(chain, handle, isBuildChain) {
  const cwd = process.cwd();
  if (!isBuildChain) {
    const reference = readReference(chain, handle);
    if (reference === void 0) {
      throw new Error(`optimize-role: MISSING recorded reference for design chain '${handle}' \u2013 the LLM judge is mandatory. Point the chain's referenceFile at a committed recorded per-turn output.`);
    }
    const judge = makeOpusJudge({ cwd });
    return {
      judgeCandidate: async ({ primary }) => {
        if (primary === void 0) return { passed: false, reason: "no primary artifact to judge" };
        const v = await judge({ step: "acs", reference, candidate: primary });
        return { passed: v.score >= SEMANTIC_THRESHOLD, score: v.score };
      }
    };
  }
  const b = chain;
  if (b.assertKind === "red") {
    const reference = readCampReference("recorded-artifacts/features/F6-split-tracking-code/test-list.json", "navigator-red test-list");
    const judge = makeOpusJudge({ cwd });
    return {
      judgeCandidate: async ({ primary, producedArtifacts }) => {
        const testsText = primary ?? concatTreeFiles(producedArtifacts, "tests/", [".py", ".ts", ".tsx"]);
        if (!testsText.trim()) return { passed: false, reason: "no tests produced to judge" };
        const v = await judge({ step: "test-list", reference, candidate: testsText, functional: "tests" });
        return { passed: v.score >= FUNCTIONAL_THRESHOLD, score: v.score };
      }
    };
  }
  if (b.assertKind === "assess") {
    const recordedVerdict2 = parseNavigatorAssessMarker(
      join62(cwd, BUILD_CORPUS_REL, "recorded-build/features/F6-split-tracking-code/stories/S1-split-columns-migration/turns/004-navigator-assess-AC1-batch-serial-columns-added/tdd/cycles/F6-split-tracking-code/S1-split-columns-migration/AC1-batch-serial-columns-added")
    );
    const deltaJudge = makeSupersessionDeltaJudge({ cwd });
    return {
      judgeCandidate: async ({ candidateId, producedArtifacts }) => {
        const markerDir = mkdtempSync3(join62(tmpdir3(), `assess-marker-${candidateId}-`));
        try {
          let wroteMarker = false;
          for (const name of ["superseded-tests.json", "regression-assessment.json"]) {
            const key = Object.keys(producedArtifacts).find((k) => k.endsWith(name));
            if (key !== void 0) {
              writeFileSync34(join62(markerDir, name), producedArtifacts[key]);
              wroteMarker = true;
            }
          }
          void wroteMarker;
          const outcome = await evaluateNavigatorAssessAlignment({ recordedVerdict: recordedVerdict2, navigatorMarkerDir: markerDir, deltaJudge });
          return { passed: outcome.passed, classification: outcome.classificationMatch ? recordedVerdict2.classification : "insufficient", reason: outcome.reason };
        } finally {
          rmSync19(markerDir, { recursive: true, force: true });
        }
      }
    };
  }
  const isReview = b.assertKind === "review";
  const refRel = isReview ? "recorded-build/features/F6-split-tracking-code/stories/S3-stock-shows-split-fields/turns/001-navigator-reflect/tdd/cycles/F6-split-tracking-code/S1-split-columns-migration/AC1-batch-serial-columns-added/review-verdict.json" : "recorded-artifacts/features/F6-split-tracking-code/stories/S3-stock-shows-split-fields/reflect-verdict.json";
  const recordedVerdict = parseVerdictFile(readCampReference(refRel, `navigator-${b.assertKind} verdict`));
  const alignJudge = makeVerdictAlignmentJudge({ cwd });
  return {
    judgeCandidate: async ({ producedArtifacts }) => {
      const key = b.verdictFile && producedArtifacts[b.verdictFile] !== void 0 ? b.verdictFile : Object.keys(producedArtifacts).find((k) => k.endsWith(isReview ? "review-verdict.json" : "reflect-verdict.json"));
      if (!key) return { passed: false, reason: `no ${b.assertKind}-verdict produced to judge` };
      const candidateVerdict = parseVerdictFile(producedArtifacts[key]);
      const v = await alignJudge({ recordedVerdict, candidateVerdict, kind: isReview ? "review" : "reflect" });
      return { passed: v.passed, reason: v.reason };
    }
  };
}
function buildDriverNextStepJudge(handle) {
  const spec = DRIVER_TURN_SPECS[handle];
  if (!spec) throw new Error(`optimize-role: buildDriverNextStepJudge \u2013 unknown driver handle "${handle}"`);
  const cwd = process.cwd();
  const deltaJudge = makeSupersessionDeltaJudge({ cwd });
  const verdictJudge = makeVerdictAlignmentJudge({ cwd });
  const regressionJudge = makeRegressionFidelityJudge({ cwd });
  const recordedRefDir = join62(cwd, BUILD_CORPUS_REL, spec.refRel);
  if (!existsSync60(recordedRefDir)) {
    throw new Error(`optimize-role: MISSING contained next-step reference for ${handle} at ${recordedRefDir} \u2013 the LLM judge is mandatory and cannot run without it.`);
  }
  const driverFailureSummary = (() => {
    const p = join62(recordedRefDir, "green-failure.json");
    if (!existsSync60(p)) return void 0;
    try {
      const g = JSON.parse(readFileSync56(p, "utf8"));
      return typeof g.summary === "string" ? g.summary : void 0;
    } catch {
      return void 0;
    }
  })();
  const recordedReviewDirective = spec.evaluatorKind === "review" ? parseVerdictFile(readCampReference(join62(spec.refRel, "review-verdict.json"), `${handle} recorded review directive`)) : void 0;
  return {
    judgeCandidate: async ({ candidateId, producedArtifacts }) => {
      const markerDir = mkdtempSync3(join62(tmpdir3(), `nextstep-${candidateId}-`));
      try {
        for (const [k, v] of Object.entries(producedArtifacts)) {
          if (k.startsWith(NEXT_STEP_MARKER_PREFIX)) writeFileSync34(join62(markerDir, k.slice(NEXT_STEP_MARKER_PREFIX.length)), v);
        }
        const outcome = await evaluateNextStepDetermination({
          evaluatorKind: spec.evaluatorKind,
          deltaJudge,
          verdictJudge,
          regressionJudge,
          ...driverFailureSummary ? { failureSummary: driverFailureSummary } : {},
          ...spec.evaluatorKind === "assess" ? { recordedMarkerDir: recordedRefDir, candidateMarkerDir: markerDir } : {
            recordedReviewDirective,
            candidateReview: parseVerdictFile(producedArtifacts[`${NEXT_STEP_MARKER_PREFIX}review-verdict.json`] ?? "{}")
          }
        });
        const passed = outcome.verdict !== "fail";
        const classification = outcome.verdict === "pass-with-honors" ? "pass-with-honors" : outcome.candidateClass;
        return { passed, classification, nextStep: outcome.verdict, reason: outcome.reason };
      } finally {
        rmSync19(markerDir, { recursive: true, force: true });
      }
    }
  };
}
async function sweepOneChain(handle, runRoot, opts = {}) {
  const isBuildChain = handle in BUILD_ROLE_CHAINS;
  const chain = isBuildChain ? BUILD_ROLE_CHAINS[handle] : ROLE_CHAINS[handle];
  if (!chain) {
    throw new Error(`optimize-role: unknown chain "${handle}"`);
  }
  const baseModel = baseModelFor(handle, opts.baseModel);
  const experiment = opts.experiment ? loadExperimentConfig(opts.experiment) : void 0;
  if (experiment && experiment.substrate !== "lean") {
    throw new Error(`experiment "${experiment.name}" (role ${experiment.role}) is substrate=${experiment.substrate}; a lean chain sweep needs a lean turn (use the driver-green handle for a cloud turn)`);
  }
  const experimentBundle = experiment ? replayBundleFromTurn(experiment.turn, experiment.ac) : void 0;
  const candidates = experiment ? experiment.roleCandidates : handle === "test-strategist" ? testStrategistCandidates(enabledAnalysts({ projectDir: "", uiTrack: true }).map((a) => a.kind)) : roleCandidates(baseModel);
  const runDir = join62(runRoot, handle);
  mkdirSync38(runDir, { recursive: true });
  const quality = experiment && experimentBundle ? buildReplayTurnJudge(experiment.turn, experimentBundle.feature, experimentBundle.story, experimentBundle.ac, experiment.discriminator ?? "assess") : buildChainJudge(chain, handle, isBuildChain);
  console.log(
    `[optimize-role] ${handle}: ${isBuildChain ? "BUILD" : "DESIGN"} chain, baseline model=${baseModel}, ${candidates.length} candidates, concurrency=${opts.concurrency ?? 1}. quality judge: MANDATORY (per-chain discriminator). run dir: ${runDir}`
  );
  const runChain = experiment ? (
    // LEAN REPLAY: the ONE dispatcher, replaying the corpus turn's recorded state + prompt (no cloud).
    async (_c, agentFor, candidateId, levers) => runReplayCandidate({
      substrate: "lean",
      bundle: experimentBundle,
      project: void 0,
      candidateId,
      levers,
      agentFor,
      idx: 0,
      driverTurn: "green",
      pfx: "",
      // The per-chain manifest subdir (e.g. navigator-assess-chain) – the lean turn's manifests.
      manifestDir: join62(process.cwd(), BUILD_MANIFESTS_REL, chain.dir)
    })
  ) : isBuildChain ? async (c, agentFor, _id, levers) => runBuildRoleChainLive(c, {
    agentFor
  }) : async (c, agentFor, _id, levers) => runRoleChainLive(c, {
    agentFor,
    // TEST-STRATEGIST: forward the candidate's per-analyst overrides into the roster preparer.
    ...levers.analystOverrides ? { analystOverrides: levers.analystOverrides } : {}
  });
  const trials = await runRoleSweep(chain, candidates, runChain, {
    ...quality ? { quality } : {},
    ...experiment?.concurrency ?? opts.concurrency ? { concurrency: experiment?.concurrency ?? opts.concurrency } : {},
    onStart: (candidate, i, total) => {
      console.log(`[optimize-role] ${handle} (${i}/${total}) running ${candidate.id} \u2013 levers ${JSON.stringify(candidate.levers)} ...`);
    },
    // PRESERVE each candidate's full result AS IT COMPLETES (not batched at the end): its
    // telemetry, its produced artifacts (the actual files), and a replay.json (levers + seed
    // corpus ref) – so the experiment is reproducible + re-judgeable, and an interrupted sweep
    // still leaves every finished candidate's evidence on disk.
    onDone: (trial, i, total) => {
      persistTrial(runDir, chain, baseModel, trial);
      const q = trial.qualityPassed === void 0 ? "" : trial.qualityPassed ? " quality PASSED" : ` quality FAILED (${trial.telemetry?.semanticScore?.toFixed(2)})`;
      const status = trial.disqualified ? `DISQUALIFIED (${trial.reason})` : trial.gatePassed ? "gate PASSED" : "gate failed";
      console.log(`[optimize-role] ${handle} (${i}/${total}) ${trial.candidateId}: ${status}${q}${trial.telemetry?.outerDurationMs ? ` \u2013 ${(trial.telemetry.outerDurationMs / 1e3).toFixed(1)}s` : ""}`);
    }
  });
  const report = reportRoleSweep(trials);
  writeFileSync34(join62(runDir, "report.txt"), formatRoleSweepReport(report) + "\n");
  const summary = buildChainSummary(handle, baseModel, trials, report);
  const prior = opts.baselineDir ? readPriorSummary(opts.baselineDir, handle) : void 0;
  writeFileSync34(join62(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(`
[${handle}]
` + formatRoleSweepReport(report));
  if (prior) {
    console.log(formatBaselineDelta(handle, prior, summary));
  }
  return report;
}
function buildChainSummary(handle, baseModel, trials, report) {
  return {
    chain: handle,
    baseModel,
    winner: report.winner?.candidateId ?? null,
    baselineMs: report.baselineMs ?? null,
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    candidates: trials.map((t) => ({
      candidate: t.candidateId,
      gatePassed: t.gatePassed,
      ...t.qualityPassed !== void 0 ? { qualityPassed: t.qualityPassed } : {},
      medianMs: t.telemetry?.outerDurationMs ?? null,
      ...t.disqualified ? { disqualified: true } : {}
    }))
  };
}
function readPriorSummary(baselineDir, handle) {
  const p = join62(baselineDir, handle, "summary.json");
  if (!existsSync60(p)) return void 0;
  try {
    return JSON.parse(readFileSync56(p, "utf8"));
  } catch {
    return void 0;
  }
}
function formatBaselineDelta(handle, prior, now) {
  const winnerChange = prior.winner === now.winner ? `winner unchanged (${now.winner ?? "none"})` : `winner CHANGED: ${prior.winner ?? "none"} -> ${now.winner ?? "none"}`;
  const ms = (v) => v == null ? "?" : `${(v / 1e3).toFixed(1)}s`;
  const drift = prior.baselineMs != null && now.baselineMs != null ? ` \u2013 baseline ${ms(prior.baselineMs)} -> ${ms(now.baselineMs)} (${((now.baselineMs - prior.baselineMs) / prior.baselineMs * 100).toFixed(0)}%)` : "";
  return `[compare] ${handle}: ${winnerChange}${drift} \u2013 prior run ${prior.capturedAt}`;
}
async function runOptimizeRole(args) {
  const resultsHome = join62(process.cwd(), "examples/replay/optimize-results");
  const runsDir = join62(resultsHome, "runs");
  const baselineDir = latestRunDir(runsDir);
  const runRoot = args.telemetryDir ?? join62(runsDir, runStamp());
  mkdirSync38(runRoot, { recursive: true });
  console.log(`[optimize-role] sweeping ${args.chains.length} chain(s): ${args.chains.join(", ")} \u2013 run root ${runRoot}${baselineDir ? ` (baseline: ${baselineDir})` : " (no prior run \u2013 this is the baseline)"}`);
  const reports = {};
  for (const handle of args.chains) {
    if (handle in DRIVER_TURN_SPECS) {
      reports[handle] = await sweepDriverGreen(handle, runRoot, {
        ...args.concurrency ? { concurrency: args.concurrency } : {},
        ...args.candidates?.length ? { candidates: args.candidates } : {},
        ...args.replicas ? { replicas: args.replicas } : {},
        ...args.experiment ? { experiment: args.experiment } : {}
      });
    } else {
      reports[handle] = await sweepOneChain(handle, runRoot, {
        ...args.baseModel ? { baseModel: args.baseModel } : {},
        ...args.concurrency ? { concurrency: args.concurrency } : {},
        ...baselineDir ? { baselineDir } : {},
        ...args.experiment ? { experiment: args.experiment } : {}
      });
    }
  }
  const rollupChains = args.chains.filter((h) => !(h in DRIVER_TURN_SPECS));
  const rollup = rollupChains.map((h) => {
    const rep = reports[h];
    if (!rep) return `${h}: (no report)`;
    const w = rep.winner;
    return w ? `${h}: winner ${w.candidateId} (${(w.outerDurationMs / 1e3).toFixed(1)}s vs baseline ${(rep.baselineMs / 1e3).toFixed(1)}s, saved ${w.speedupPct.toFixed(0)}%)` : `${h}: no winner (no quality-holding candidate beat the baseline)`;
  }).join("\n");
  for (const h of args.chains.filter((c) => c in DRIVER_TURN_SPECS)) {
    const driverResult = reports[h];
    if (driverResult && "summary" in driverResult) {
      const s = driverResult.summary ?? {};
      const w = s.winner;
      console.log(`
[${h}]
${w ? `${h}: winner ${w}` : `${h}: no winner`}`);
    }
  }
  if (rollup) {
    writeFileSync34(join62(runRoot, "rollup.txt"), rollup + "\n");
    console.log(`
=== ROLL-UP ===
${rollup}

(full evidence per chain -> ${runRoot}/<handle>/)`);
  }
  return reports;
}
function runStamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[-:T]/g, "").replace(/\..*$/, "");
}
function latestRunDir(runsDir) {
  if (!existsSync60(runsDir)) return void 0;
  const dirs = readdirSync36(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const newest = dirs[dirs.length - 1];
  return newest ? join62(runsDir, newest) : void 0;
}
function readReference(chain, _role) {
  if (chain.referenceFile) {
    const camp = join62(process.cwd(), BUILD_CORPUS_REL, chain.referenceFile);
    if (existsSync60(camp)) return readFileSync56(camp, "utf8");
  }
  const p = join62(process.cwd(), INTAKE_REL, chain.referenceFile ?? chain.outputFile);
  return existsSync60(p) ? readFileSync56(p, "utf8") : void 0;
}
function persistTrial(runDir, chain, baseModel, trial) {
  const dir = join62(runDir, trial.candidateId);
  mkdirSync38(dir, { recursive: true });
  if (trial.telemetry) writeFileSync34(join62(dir, "telemetry.json"), JSON.stringify(trial.telemetry, null, 2) + "\n");
  for (const [rel, contents] of Object.entries(trial.producedArtifacts ?? {})) {
    const dest = join62(dir, "artifacts", rel);
    mkdirSync38(dirname29(dest), { recursive: true });
    writeFileSync34(dest, contents);
  }
  const navigatorEvalFiles = Object.keys(trial.producedArtifacts ?? {}).filter((k) => k.startsWith("navigator-eval/")).map((k) => k.slice("navigator-eval/".length));
  const replay = {
    role: chain.dir,
    candidateId: trial.candidateId,
    baseModel,
    levers: trial.levers,
    seedCorpus: `${INTAKE_REL} (recorded intake replayed into the chain)`,
    gatePassed: trial.gatePassed,
    ...trial.qualityPassed !== void 0 ? { qualityPassed: trial.qualityPassed } : {},
    ...trial.telemetry?.classification ? { classification: trial.telemetry.classification } : {},
    ...navigatorEvalFiles.length ? { navigatorEval: { dir: "artifacts/navigator-eval", files: navigatorEvalFiles } } : {},
    ...trial.disqualified ? { disqualified: true, reason: trial.reason } : {}
  };
  writeFileSync34(join62(dir, "replay.json"), JSON.stringify(replay, null, 2) + "\n");
}
function loadPreservedArtifacts(candidateDir) {
  const root = join62(candidateDir, "artifacts");
  if (!existsSync60(root)) return {};
  const out = {};
  const walk2 = (dir) => {
    for (const e of readdirSync36(dir, { withFileTypes: true })) {
      const abs = join62(dir, e.name);
      if (e.isDirectory()) walk2(abs);
      else if (e.isFile()) out[relative9(root, abs)] = readFileSync56(abs, "utf8");
    }
  };
  walk2(root);
  return out;
}
function isMissingJudgeTarget(reason) {
  if (!reason) return false;
  return /no primary artifact to judge|no tests produced to judge|-verdict produced to judge|no app\/ code produced to judge|no .*code produced to judge/i.test(reason);
}
function classifyReproduce(stored, fresh, tol = 0.1) {
  const hasStoredVerdict = stored.storedClass !== void 0 || stored.storedScore !== void 0;
  if (!hasStoredVerdict) return "first-verdict (never judged before)";
  if (stored.storedClass !== void 0 || fresh.classification !== void 0) {
    return stored.storedClass === fresh.classification ? "REPRODUCED" : `DIVERGED (stored=${stored.storedClass ?? "?"} fresh=${fresh.classification ?? "?"})`;
  }
  const delta = Math.abs((stored.storedScore ?? 0) - (fresh.score ?? 0));
  return delta <= tol ? `REPRODUCED (\u0394score=${delta.toFixed(2)})` : `DIVERGED (stored=${stored.storedScore} fresh=${fresh.score}, \u0394=${delta.toFixed(2)})`;
}
async function runRejudge(runRoot, experimentPath) {
  if (!existsSync60(runRoot)) throw new Error(`optimize-role --rejudge: run dir not found: ${runRoot}`);
  console.log(`[rejudge] re-judging preserved outputs under ${runRoot}${experimentPath ? ` [experiment: ${experimentPath}]` : ""}`);
  const experiment = experimentPath ? loadExperimentConfig(experimentPath) : void 0;
  const experimentBundle = experiment ? replayBundleFromTurn(experiment.turn, experiment.ac) : void 0;
  const chainDirs = readdirSync36(runRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const handle of chainDirs) {
    const chainDir = join62(runRoot, handle);
    const isDriver = handle in DRIVER_TURN_SPECS;
    const isBuildChain = handle in BUILD_ROLE_CHAINS;
    const chain = isDriver ? void 0 : isBuildChain ? BUILD_ROLE_CHAINS[handle] : ROLE_CHAINS[handle];
    const driverSpec = DRIVER_TURN_SPECS[handle];
    const isRepairExperiment = !!(experiment && experimentBundle && driverSpec?.driverTurn === "repair");
    const isRefactorExperiment = !!(experiment && experimentBundle && driverSpec?.driverTurn === "refactor");
    const isExperimentChain = !!(experiment && experimentBundle && !isDriver && experiment.turn.endsWith(handle));
    if (!isDriver && !chain && !isExperimentChain) {
      console.log(`[rejudge] ${handle}: not a known chain, skipping`);
      continue;
    }
    let quality;
    try {
      quality = isRepairExperiment ? buildDriverRepairNextStepJudge(experiment.turn, experimentBundle.feature, experimentBundle.story) : isRefactorExperiment ? buildDriverRefactorNextStepJudge(experimentBundle.feature, experimentBundle.story) : isExperimentChain ? buildReplayTurnJudge(experiment.turn, experimentBundle.feature, experimentBundle.story, experimentBundle.ac, experiment.discriminator ?? "assess") : isDriver ? buildDriverNextStepJudge(handle) : buildChainJudge(chain, handle, isBuildChain);
    } catch (e) {
      console.log(`[rejudge] ${handle}: cannot resolve discriminator (${e instanceof Error ? e.message : String(e)}); skipping`);
      continue;
    }
    const outputFile = isDriver ? "app" : chain.outputFile;
    const candDirs = readdirSync36(chainDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const candidateId of candDirs) {
      const candDir = join62(chainDir, candidateId);
      const producedArtifacts = loadPreservedArtifacts(candDir);
      if (Object.keys(producedArtifacts).length === 0) {
        console.log(`[rejudge] ${handle}/${candidateId}: NO preserved artifacts \u2013 cannot re-judge (output not preserved)`);
        writeFileSync34(join62(candDir, "rejudge.json"), JSON.stringify({ handle, candidateId, rejudgeable: false, reason: "no preserved artifacts" }, null, 2) + "\n");
        continue;
      }
      const stored = existsSync60(join62(candDir, "telemetry.json")) ? JSON.parse(readFileSync56(join62(candDir, "telemetry.json"), "utf8")) : void 0;
      const primary = producedArtifacts[outputFile];
      let verdict;
      try {
        verdict = await quality.judgeCandidate({ candidateId, primary, producedArtifacts });
      } catch (e) {
        console.log(`[rejudge] ${handle}/${candidateId}: judge threw: ${e instanceof Error ? e.message : String(e)}`);
        writeFileSync34(join62(candDir, "rejudge.json"), JSON.stringify({ handle, candidateId, rejudgeable: true, error: e instanceof Error ? e.message : String(e) }, null, 2) + "\n");
        continue;
      }
      if (!verdict.passed && isMissingJudgeTarget(verdict.reason)) {
        console.log(`[rejudge] ${handle}/${candidateId}: NOT rejudgeable \u2013 judge target not preserved (${verdict.reason})`);
        writeFileSync34(join62(candDir, "rejudge.json"), JSON.stringify({ handle, candidateId, rejudgeable: false, reason: `judge target not preserved: ${verdict.reason}` }, null, 2) + "\n");
        continue;
      }
      const storedClass = stored?.classification;
      const storedScore = stored?.semanticScore;
      const reproduce = classifyReproduce({ storedClass, storedScore }, { classification: verdict.classification, score: verdict.score });
      const hasStoredVerdict = storedClass !== void 0 || storedScore !== void 0;
      const report = { handle, candidateId, rejudgeable: true, fresh: { passed: verdict.passed, score: verdict.score, classification: verdict.classification, reason: verdict.reason }, stored: hasStoredVerdict ? { score: storedScore, classification: storedClass } : null, reproduce };
      writeFileSync34(join62(candDir, "rejudge.json"), JSON.stringify(report, null, 2) + "\n");
      console.log(`[rejudge] ${handle}/${candidateId}: fresh=${verdict.passed ? "PASS" : "FAIL"}${verdict.classification ? ` (${verdict.classification})` : ""}${verdict.score !== void 0 ? ` score=${verdict.score.toFixed(2)}` : ""} \u2013 ${reproduce}`);
    }
  }
  console.log(`[rejudge] done. Per-candidate rejudge.json written under ${runRoot}.`);
}
if (isCliEntry(import.meta.url)) {
  const rejudgeIdx = process.argv.indexOf("--rejudge");
  const expIdx = process.argv.indexOf("--experiment");
  const experimentArg = expIdx >= 0 && expIdx + 1 < process.argv.length ? process.argv[expIdx + 1] : void 0;
  const entry = rejudgeIdx >= 0 && rejudgeIdx + 1 < process.argv.length ? runRejudge(process.argv[rejudgeIdx + 1], experimentArg) : runOptimizeRole(parseArgs(process.argv.slice(2)));
  entry.then(() => process.exit(0)).catch((e) => {
    console.error(`[optimize-role] FAILED: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
export {
  DRIVER_GREEN_CODE_PIN_REL,
  DRIVER_TURN_SPECS,
  buildChainJudge,
  buildDriverNextStepJudge,
  classifyReproduce,
  concatTreeFiles,
  expandChains,
  expandReplicas,
  isMissingJudgeTarget,
  loadPreservedArtifacts,
  parseArgs,
  readCampAppDir,
  runOptimizeRole,
  runRejudge,
  selectDriverCandidates,
  sweepDriverGreen,
  sweepOneChain
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
