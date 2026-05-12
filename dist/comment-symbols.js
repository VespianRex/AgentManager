import { isPlainObject } from "./types.js";
// Maximum recursion depth to prevent stack overflow from maliciously deep nesting
const MAX_RECURSION_DEPTH = 256;
/**
 * Copies comment-json Symbol metadata from a source object tree onto a target tree.
 * This preserves comments across validation steps that clone objects.
 */
export const copyCommentSymbols = (target, source, depth = 0) => {
    // Stop recursing if maximum depth is exceeded to prevent stack overflow
    if (depth > MAX_RECURSION_DEPTH) {
        return;
    }
    if (!isPlainObject(target) || !isPlainObject(source)) {
        return;
    }
    const sourceObj = source;
    const targetObj = target;
    for (const sym of Object.getOwnPropertySymbols(sourceObj)) {
        const symKey = Symbol.keyFor(sym);
        if (symKey?.startsWith("before:")) {
            Object.defineProperty(targetObj, Symbol.for(symKey), {
                value: sourceObj[sym],
                enumerable: false,
                configurable: true,
                writable: true,
            });
        }
    }
    for (const key of Object.keys(sourceObj)) {
        const sourceChild = sourceObj[key];
        const targetChild = targetObj[key];
        if (isPlainObject(sourceChild) && isPlainObject(targetChild)) {
            copyCommentSymbols(targetChild, sourceChild, depth + 1);
        }
    }
};
//# sourceMappingURL=comment-symbols.js.map