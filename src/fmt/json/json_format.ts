// src/fmt/json/json_format.ts
//
// Made with ❤️ by Maysara.
/* eslint-disable @typescript-eslint/no-explicit-any */



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { FormatIssue } from '../../common';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    // ── Key ordering templates ──────────────────────────────────
    const PACKAGE_JSON_ORDER                              = [
        'name',
        'version',
        'description',
        'keywords',
        'license',
        'homepage',
        'bugs',
        'author',
        'repository',
        'type',
        'main',
        'types',
        'bin',
        'files',
        'exports',
        'engines',
        'pkg', // Custom pkg field for @langpkg/pkg projects
        'peerDependencies',
        'dependencies',
        'devDependencies',
        'scripts',
    ];

    const TSCONFIG_JSON_ORDER                             = [
        'extends',
        'compilerOptions',
        'include',
        'exclude',
        'files',
        'references',
    ];

    // Key ordering for compilerOptions inside tsconfig.json
    const TSCONFIG_COMPILER_OPTIONS_ORDER                 = [
        // Project
        'incremental',
        'composite',
        'tsBuildInfoFile',
        'disableSourceOfProjectReferenceRedirect',
        'disableSolutionSearching',
        'disableReferencedProjectLoad',
        // Language and Environment
        'target',
        'lib',
        'jsx',
        'jsxFactory',
        'jsxFragmentFactory',
        'jsxImportSource',
        'reactNamespace',
        'noLib',
        'useDefineForClassFields',
        'moduleDetection',
        // Modules
        'module',
        'rootDir',
        'moduleResolution',
        'baseUrl',
        'paths',
        'rootDirs',
        'typeRoots',
        'types',
        'allowUmdGlobalAccess',
        'moduleSuffixes',
        'allowImportingTsExtensions',
        'resolvePackageJsonExports',
        'resolvePackageJsonImports',
        'customConditions',
        'resolveJsonModule',
        'allowArbitraryExtensions',
        'noResolve',
        // JavaScript Support
        'allowJs',
        'checkJs',
        'maxNodeModuleJsDepth',
        // Emit
        'declaration',
        'declarationMap',
        'emitDeclarationOnly',
        'sourceMap',
        'inlineSourceMap',
        'outFile',
        'outDir',
        'removeComments',
        'noEmit',
        'importHelpers',
        'importsNotUsedAsValues',
        'downlevelIteration',
        'sourceRoot',
        'mapRoot',
        'inlineSources',
        'emitBOM',
        'newLine',
        'stripInternal',
        'noEmitHelpers',
        'noEmitOnError',
        'preserveConstEnums',
        'declarationDir',
        'verbatimModuleSyntax',
        // Interop Constraints
        'isolatedModules',
        'allowSyntheticDefaultImports',
        'esModuleInterop',
        'preserveSymlinks',
        'forceConsistentCasingInFileNames',
        // Type Checking
        'strict',
        'noImplicitAny',
        'strictNullChecks',
        'strictFunctionTypes',
        'strictBindCallApply',
        'strictPropertyInitialization',
        'noImplicitThis',
        'useUnknownInCatchVariables',
        'alwaysStrict',
        'noUnusedLocals',
        'noUnusedParameters',
        'exactOptionalPropertyTypes',
        'noImplicitReturns',
        'noFallthroughCasesInSwitch',
        'noUncheckedIndexedAccess',
        'noImplicitOverride',
        'noPropertyAccessFromIndexSignature',
        'allowUnusedLabels',
        'allowUnreachableCode',
        // Completeness
        'skipDefaultLibCheck',
        'skipLibCheck',
    ];

    // ── Group boundaries (blank-line separators between logical sections) ─
    //
    // Rules:
    //   - Every JSON object always gets a blank line after "{" and before "}".
    //   - When groups are defined, an additional blank line is placed between each group.
    //   - Files with no template use an empty group array → no intra-group separators,
    //     but still get the open/close blank lines and alphabetical key ordering.

    const PACKAGE_JSON_GROUPS: string[][]                 = [
        [ 'name', 'version', 'description', 'keywords', 'license', 'type', 'author' ],
        [ 'homepage', 'bugs', 'repository' ],
        [ 'main', 'types', 'module', 'exports', 'bin', 'files', 'engines' ],
        [ 'pkg' ],
        [ 'scripts' ],
        [ 'peerDependencies', 'dependencies', 'devDependencies' ],
    ];

    const TSCONFIG_JSON_GROUPS: string[][]                = [
        ['extends'],
        ['compilerOptions'],
        ['include', 'exclude', 'files', 'references'],
    ];

    // compilerOptions groups mirror the canonical TSConfig category comments
    const TSCONFIG_COMPILER_OPTIONS_GROUPS: string[][]    = [
        ['incremental', 'composite', 'tsBuildInfoFile',
            'disableSourceOfProjectReferenceRedirect', 'disableSolutionSearching',
        'disableReferencedProjectLoad'],
        ['target', 'lib', 'jsx', 'jsxFactory', 'jsxFragmentFactory', 'jsxImportSource',
            'reactNamespace', 'noLib', 'useDefineForClassFields', 'moduleDetection'],
        ['module', 'rootDir', 'moduleResolution', 'baseUrl', 'paths', 'rootDirs',
            'typeRoots', 'types', 'allowUmdGlobalAccess', 'moduleSuffixes',
            'allowImportingTsExtensions', 'resolvePackageJsonExports',
            'resolvePackageJsonImports', 'customConditions', 'resolveJsonModule',
            'allowArbitraryExtensions', 'noResolve'],
        ['allowJs', 'checkJs', 'maxNodeModuleJsDepth'],
        ['declaration', 'declarationMap', 'emitDeclarationOnly', 'sourceMap',
            'inlineSourceMap', 'outFile', 'outDir', 'removeComments', 'noEmit',
            'importHelpers', 'importsNotUsedAsValues', 'downlevelIteration', 'sourceRoot',
            'mapRoot', 'inlineSources', 'emitBOM', 'newLine', 'stripInternal',
            'noEmitHelpers', 'noEmitOnError', 'preserveConstEnums', 'declarationDir',
        'verbatimModuleSyntax'],
        ['isolatedModules', 'allowSyntheticDefaultImports', 'esModuleInterop',
            'preserveSymlinks', 'forceConsistentCasingInFileNames'],
        ['strict', 'noImplicitAny', 'strictNullChecks', 'strictFunctionTypes',
            'strictBindCallApply', 'strictPropertyInitialization', 'noImplicitThis',
            'useUnknownInCatchVariables', 'alwaysStrict', 'noUnusedLocals',
            'noUnusedParameters', 'exactOptionalPropertyTypes', 'noImplicitReturns',
            'noFallthroughCasesInSwitch', 'noUncheckedIndexedAccess', 'noImplicitOverride',
            'noPropertyAccessFromIndexSignature', 'allowUnusedLabels', 'allowUnreachableCode'],
        ['skipDefaultLibCheck', 'skipLibCheck'],
    ];

    // Sentinel: every JSON file gets at least open/close blank lines.
    // Pass GENERIC_GROUPS (empty array) for files with no specific template.
    const GENERIC_GROUPS: string[][]                      = [];

    // ── Per-file template registry ──────────────────────────────
    //
    // Maps basename → { order, groups, nestedGroups? }
    // nestedGroups maps a key name → { order, groups } applied when formatting that
    // key's value as a nested object.

    interface NestedTemplate {
        order                                             : string[];
        groups                                            : string[][];
    }

    interface FileTemplate {
        order                                             : string[];
        groups                                            : string[][];
        nested?      : Record<string, NestedTemplate>;
    }

    const FILE_TEMPLATES: Record<string, FileTemplate>    = {
        'package.json'                                    : {
            order                                         : PACKAGE_JSON_ORDER,
            groups                                        : PACKAGE_JSON_GROUPS,
        },
        'tsconfig.json'                                   : {
            order                                         : TSCONFIG_JSON_ORDER,
            groups                                        : TSCONFIG_JSON_GROUPS,
            nested                                        : {
                compilerOptions                           : {
                    order                                 : TSCONFIG_COMPILER_OPTIONS_ORDER,
                    groups                                : TSCONFIG_COMPILER_OPTIONS_GROUPS,
                },
            },
        },
    };

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    export function validateJson(filepath: string, content: string): FormatIssue[] {
        const issues: FormatIssue[] = [];

        try {
            const obj = JSON.parse(content);

            // eslint-disable-next-line no-useless-escape
            const basename = filepath.split(/[\\\/]/).pop() || '';
            const template = FILE_TEMPLATES[basename] ?? null;

            // Reorder keys if a template is defined; otherwise sort alphabetically
            let reorderedObj = obj;
            if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                if (template) {
                    reorderedObj = reorderObject(obj, template.order, template.nested ?? null);
                } else {
                    reorderedObj = reorderObject(obj, null, null);
                }
            }

            // Format with alignment, open/close blank lines, and optional groups
            const groups  = template?.groups ?? GENERIC_GROUPS;
            const nested  = template?.nested ?? null;
            const formatted = alignJson(reorderedObj, '', 2, undefined, groups, nested);

            if (content.trim() !== formatted.trim()) {
                issues.push({
                    file        : filepath,
                    line        : 1,
                    code        : 'JSON_FORMAT',
                    message     : 'JSON formatting is incorrect (alignment/indentation)',
                    severity    : 'warning',
                    fixable     : true,
                    fix         : {
                        type    : 'reformat',
                        content : formatted,
                    },
                });
            }
        } catch (err) {
            issues.push({
                file            : filepath,
                line            : 1,
                code            : 'JSON_PARSE_ERROR',
                message         : `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
                severity        : 'error',
                fixable         : false,
            });
        }

        return issues;
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ HELP ════════════════════════════════════════╗

    // ── Key helpers ─────────────────────────────────────────────

    // Merge template-known keys (in order) with any extra keys (alphabetically appended)
    function reorderKeys(actualKeys: string[], expectedOrder: string[]): string[] {
        const ordered   : string[] = [];
        const unordered : string[] = [];

        actualKeys.forEach((key) => {
            if (expectedOrder.includes(key)) {
                ordered.push(key);
            } else {
                unordered.push(key);
            }
        });

        ordered.sort((a, b) => expectedOrder.indexOf(a) - expectedOrder.indexOf(b));
        unordered.sort();

        return [...ordered, ...unordered];
    }

    // Reorder object properties.
    // keyOrder = null  →  sort alphabetically (generic files).
    // nestedTemplates  →  per-key templates applied one level deep.
    function reorderObject(
    obj            : any,
    keyOrder       : string[] | null,
    nestedTemplates: Record<string, NestedTemplate> | null,
    ): any {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            return obj;
        }

        const result: any = {};
        const orderedKeys = keyOrder !== null
        ? reorderKeys(Object.keys(obj), keyOrder)
        : [...Object.keys(obj)].sort();

        orderedKeys.forEach((key) => {
            const value = obj[key];
            const nested = nestedTemplates?.[key] ?? null;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                if (nested) {
                    // Apply nested template's key order; nested templates don't recurse further
                    result[key] = reorderObject(value, nested.order, null);
                } else {
                    // Sort nested object keys alphabetically (no template)
                    result[key] = reorderObject(value, null, null);
                }
            } else if (Array.isArray(value)) {
                result[key] = value.map((item) =>
                typeof item === 'object' && item !== null
                ? reorderObject(item, null, null)
                : item
                );
            } else {
                result[key] = value;
            }
        });

        return result;
    }

    // ── Formatting helpers ──────────────────────────────────────

    // Find maximum key length across ALL nesting levels
    function findGlobalMaxKeyLength(obj: any): number {
        if (typeof obj !== 'object' || obj === null) return 0;

        let maxLen = 0;

        if (Array.isArray(obj)) {
            for (const item of obj) {
                maxLen = Math.max(maxLen, findGlobalMaxKeyLength(item));
            }
        } else {
            for (const key of Object.keys(obj)) {
                maxLen = Math.max(maxLen, JSON.stringify(key).length);
                maxLen = Math.max(maxLen, findGlobalMaxKeyLength(obj[key]));
            }
        }

        return maxLen;
    }

    // Partition an array of (key, entry-string) pairs into ordered groups.
    // Keys not in any group boundary are appended as a final ungrouped section.
    function partitionIntoGroups(
    keys            : string[],
    entries         : string[],
    groupBoundaries : string[][],
    ): string[][] {
        const result: string[][] = [];
        const groupedKeys = new Set(groupBoundaries.flat());

        for (const boundary of groupBoundaries) {
            const group = entries.filter((_, i) => boundary.includes(keys[i]));
            if (group.length > 0) result.push(group);
        }

        const ungrouped = entries.filter((_, i) => !groupedKeys.has(keys[i]));
        if (ungrouped.length > 0) result.push(ungrouped);

        return result;
    }

    // Build the body of a JSON object: entries joined, with blank lines between groups
    // when groupBoundaries is non-empty.
    //
    // isRoot = true  → blank line after "{" opener and before "}" closer (root object only).
    // isRoot = false → compact nested objects, no extra blank lines.
    //
    // When groups are defined (and isRoot is true) a blank line is also placed between
    // each group.
    function buildObjectBody(
    keys            : string[],
    entries         : string[],
    indent          : string,
    tabWidth        : number,
    groupBoundaries : string[][],
    isRoot          : boolean,
    ): string {
        const innerIndent = indent + ' '.repeat(tabWidth);
        const sep         = ',\n' + innerIndent;

        if (isRoot && groupBoundaries.length > 0) {
            const groups = partitionIntoGroups(keys, entries, groupBoundaries);
            const groupStrings = groups.map((g) => g.join(sep));
            const body = groupStrings.join(
                ',\n' +
                indent + '\n' +      // blank line between groups
                innerIndent
            );
            return (
                '{\n' +
                indent + '\n' +      // blank line after opener
                innerIndent + body +
                '\n' +
                indent + '\n' +      // blank line before closer
                indent + '}'
            );
        }

        if (isRoot) {
            // No groups - single block with open/close blank lines only
            const body = entries.join(sep);
            return (
                '{\n' +
                indent + '\n' +      // blank line after opener
                innerIndent + body +
                '\n' +
                indent + '\n' +      // blank line before closer
                indent + '}'
            );
        }

        // Nested object - compact, no extra blank lines
        const body = entries.join(sep);
        return '{\n' + innerIndent + body + '\n' + indent + '}';
    }

    // Format JSON with aligned colons (table-like format).
    // Uses GLOBAL max key length but reduces padding by 2 spaces per nesting level.
    //
    // groupBoundaries - top-level key groups for this object (may be empty).
    // nestedTemplates - per-key group/order info for one level of nesting.
    // isRoot          - true only for the outermost call; controls blank-line open/close.
    function alignJson(
    obj             : any,
    indent          = '',
    tabWidth        = 2,
    globalMaxKeyLen?: number,
    groupBoundaries : string[][] = GENERIC_GROUPS,
    nestedTemplates : Record<string, NestedTemplate> | null = null,
    isRoot          = true,
    ): string {
        if (typeof obj !== 'object' || obj === null) {
            return JSON.stringify(obj);
        }

        // On first call, calculate global max key length
        if (globalMaxKeyLen === undefined) {
            globalMaxKeyLen = findGlobalMaxKeyLength(obj);
        }

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';

            const items = obj.map((item) =>
            alignJson(
                item,
                indent + ' '.repeat(tabWidth),
                tabWidth,
                globalMaxKeyLen,
                GENERIC_GROUPS,
                null,
                false,           // array items are never root
            )
            );

            // Keep on one line if short enough
            const oneLine = '[' + items.join(', ') + ']';
            if (oneLine.length < 80 && !oneLine.includes('\n')) {
                return oneLine;
            }

            return (
                '[\n' +
                indent + ' '.repeat(tabWidth) +
                items.join(',\n' + indent + ' '.repeat(tabWidth)) +
                '\n' +
                indent + ']'
            );
        }

        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';

        // Colon alignment: reduce target position by 2 per nesting level for visual hierarchy
        const nestingLevel   = indent.length / tabWidth;
        const levelReduction = nestingLevel * 2;
        const colonTargetPos = Math.max(2, globalMaxKeyLen! + 4 - levelReduction);

        const entries = keys.map((key) => {
            const value      = obj[key];
            const quotedKey  = JSON.stringify(key);
            const padding    = ' '.repeat(Math.max(2, colonTargetPos - quotedKey.length));

            let formattedValue: string;
            if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    formattedValue = alignJson(
                        value,
                        indent + ' '.repeat(tabWidth),
                        tabWidth,
                        globalMaxKeyLen,
                        GENERIC_GROUPS,
                        null,
                        false,
                    );
                } else {
                    // Check if this key has a nested template
                    const nested = nestedTemplates?.[key] ?? null;
                    formattedValue = alignJson(
                        value,
                        indent + ' '.repeat(tabWidth),
                        tabWidth,
                        globalMaxKeyLen,
                        nested?.groups ?? GENERIC_GROUPS,
                        null,        // nested templates don't recurse further
                        false,       // nested objects are never root
                    );
                }
            } else {
                formattedValue = JSON.stringify(value);
            }

            return quotedKey + padding + ': ' + formattedValue;
        });

        const result = buildObjectBody(keys, entries, indent, tabWidth, groupBoundaries, isRoot);

        // Strip trailing spaces from every line (root call only - covers the whole output)
        if (isRoot) {
            return result.split('\n').map((line) => line.trimEnd()).join('\n');
        }

        return result;
    }

    // ── Public result type ──────────────────────────────────────

    export interface JsonFormatResult {
        formatted : string;
        count     : number;  // number of auto-fixable issues corrected
    }

    // ── Public entry point ──────────────────────────────────────
    //
    // Accepts raw JSON source or a parsed object, plus an optional filename.
    // When filename matches a known template (package.json, tsconfig.json, …) the
    // formatter applies the canonical key order, nested-key ordering, and group
    // separators automatically.  All other files are sorted alphabetically and
    // aligned with no group separators.
    //
    // Returns { formatted, count } so callers can surface how many issues were
    // corrected without needing to pass any configuration.

    // Infer the file template from the object's content when the filename gives no signal.
    // package.json  → has both 'name' and 'version' at root
    // tsconfig.json → has 'compilerOptions' at root
    function inferTemplate(obj: any): FileTemplate | null {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
        const keys = Object.keys(obj);
        if (keys.includes('name') && keys.includes('version'))  return FILE_TEMPLATES['package.json'];
        if (keys.includes('compilerOptions'))                    return FILE_TEMPLATES['tsconfig.json'];
        return null;
    }

    export function formatJsonWithAlignment(
    src      : string | object,
    filename = '',
    ): JsonFormatResult {
        // eslint-disable-next-line no-useless-escape
        const basename = filename.split(/[\\\/]/).pop() || '';
        const obj = typeof src === 'string' ? JSON.parse(src) : src;

        // Filename-based lookup first; fall back to content-based inference so that
        // fixture files named 'input.json' (not 'package.json') still get the right template.
        const template = FILE_TEMPLATES[basename] ?? inferTemplate(obj);

        let reorderedObj = obj;
        if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
            reorderedObj = template
            ? reorderObject(obj, template.order, template.nested ?? null)
            : reorderObject(obj, null, null);
        }

        const groups    = template?.groups ?? GENERIC_GROUPS;
        const nested    = template?.nested ?? null;
        const formatted = alignJson(reorderedObj, '', 2, undefined, groups, nested);

        // Count fixes: 1 when the source needed reformatting, 0 when it was already clean.
        // For object inputs there is no raw source text to compare, so treat formatting
        // as applied whenever object input is provided.
        const count = typeof src === 'string'
        ? src.trim() !== formatted.trim() ? 1 : 0
        : 1;

        return { formatted, count };
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝