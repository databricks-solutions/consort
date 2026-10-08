"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
0 && (module.exports = {
    getTypeScriptPackageSpec: null,
    requiredNodeTypesVersion: null,
    requiredTypeScriptVersion: null
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    getTypeScriptPackageSpec: function() {
        return getTypeScriptPackageSpec;
    },
    requiredNodeTypesVersion: function() {
        return requiredNodeTypesVersion;
    },
    requiredTypeScriptVersion: function() {
        return requiredTypeScriptVersion;
    }
});
const requiredTypeScriptVersion = '5.8.2';
const requiredNodeTypesVersion = '20.17.6';
function getTypeScriptPackageSpec(pkg) {
    switch(pkg){
        case 'typescript':
            return `${pkg}@${requiredTypeScriptVersion}`;
        case '@types/node':
            return `${pkg}@${requiredNodeTypesVersion}`;
        default:
            return pkg;
    }
}

//# sourceMappingURL=required-packages.js.map