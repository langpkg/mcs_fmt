// src/fmt/ts/const_format.ts
//
// Made with ❤️ by Maysara.



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    const CONST_OPEN_RE          = /^(\s*)\/\/ ╔(═+) CONST (═+)╗\s*$/;
    const CONST_CLOSE_RE         = /^(\s*)\/\/ ╚(═+)╝\s*$/;
    // Matches: const name = value or const name : type = value
    // Group 1: indent, Group 2: keyword, Group 3: name, Group 4: optional type with leading/trailing spaces
    const VAR_DECL_RE            = /^(\s*)(const|let|var)\s+(\S+)(\s*:\s*[^=]+?)\s*=\s*(.*)$/;
    const VAR_DECL_NO_TYPE_RE    = /^(\s*)(const|let|var)\s+(\S+)\s*=\s*(.*)$/;
    const MIN_GAP                = 4;

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TYPE ════════════════════════════════════════╗

    interface ParsedVar {
        indent  : string;
        keyword : string;
        name    : string;
        type    : string; // empty string if no type annotation
        value   : string;
        raw     : string; // original line, used for non-var passthrough
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    // ┌──────────────────────────────── PARSE ─────────────────────────────┐

        /**
        * Try to parse a line as a const/let/var declaration.
        * Supports optional TypeScript type annotations: const name: type = value
        * Returns null for blank lines, comments, or anything else.
        */
        function parseVarLine(line: string): ParsedVar | null {
            // Try to match with type annotation first
            let m = line.match(VAR_DECL_RE);
            if (m) {
                // Extract type annotation and normalize to ": typename"
                // e.g., ": boolean " → ": boolean" or " : boolean " → ": boolean"
                const typeRaw = m[4];
                const typeName = typeRaw.replace(/^\s*:\s*/, '').trim();
                const typeWithSpace = `: ${typeName}`;
                return {
                    indent : m[1],
                    keyword: m[2],
                    name   : m[3],
                    type   : typeWithSpace,  // e.g., ": boolean"
                    value  : m[5],
                    raw    : line,
                };
            }

            // Try to match without type annotation
            m = line.match(VAR_DECL_NO_TYPE_RE);
            if (m) {
                return {
                    indent : m[1],
                    keyword: m[2],
                    name   : m[3],
                    type   : '',  // no type annotation
                    value  : m[4],
                    raw    : line,
                };
            }

            return null;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── FORMAT ─────────────────────────────┐

        /**
        * Full pipeline for a CONST section body:
        *   1. Parse - split lines into var-decls and other (preserved verbatim)
        *   2. Align - compute the `=` column so all var-decls line up
        *   3. Render - emit aligned declarations + verbatim other lines
        *
        * Alignment is skipped when fewer than 2 var-decls are present
        * (no neighbour to align with → plain passthrough).
        *
        * Non-var lines (function calls, comments, blank lines) are kept in
        * their original relative position among the var-decl block, but any
        * truly-other code that appears mixed in is left verbatim.
        *
        * IMPORTANT: When calculating the alignment column, we consider ALL
        * key-value pairs in the const body (both const declarations and nested
        * object properties) to find the longest prefix, so that even nested
        * properties align properly with the const declarations.
        */
        function formatConstBody(bodyLines: string[]): string[] {

            // ── Collect var-decls (ignore blanks when counting) ─────────
            const varDecls: ParsedVar[] = [];
            for (const line of bodyLines) {
                if (line.trim() === '') continue;
                const parsed = parseVarLine(line);
                if (parsed) varDecls.push(parsed);
            }

            // ── Count property lines (nested object properties) ─────────
            let propLineCount = 0;
            for (const line of bodyLines) {
                if (line.trim() === '') continue;
                // Skip if it's already a var declaration
                if (parseVarLine(line)) continue;
                // Check if it's a property line: indent + key + colon
                const propMatch = line.match(/^(\s*)(?:"([^"]*)"|(\w+))\s*:/);
                if (propMatch) propLineCount++;
            }

            // ── Skip alignment if only 1 const and no properties to align ─
            // (need at least 2 var-decls or properties to justify alignment)
            const hasAlignableItems = varDecls.length >= 2 || propLineCount >= 2;
            if (!hasAlignableItems) return bodyLines;

            // ── Compute the shared alignment column ─────────────────────
            // We need to consider both:
            // 1. var declaration prefixes: "indent + keyword + ' ' + name + type"
            // 2. property key prefixes: "indent + quoted_key"
            // to ensure all lines align properly together
            let maxPrefixLen = 0;

            // Check var declarations
            for (const v of varDecls) {
                const prefixLen = v.indent.length + v.keyword.length + 1 + v.name.length + v.type.length;
                if (prefixLen > maxPrefixLen) maxPrefixLen = prefixLen;
            }

            // Check property lines to find longest key
            // Properties have format: "key" : value or 'key' : value or key : value
            for (const line of bodyLines) {
                if (line.trim() === '') continue;
                // Match: indent + ("key" or 'key' or key, but not trailing spaces before colon)
                const propMatch = line.match(/^(\s*)(?:"[^"]*"|'[^']*'|\w+)\s*:/);
                if (propMatch) {
                    // This is a property line
                    const quotedPartMatch = line.match(/^(\s*)(?:"[^"]*"|'[^']*'|[^:\s]+)/);
                    if (quotedPartMatch) {
                        const quotedPart = quotedPartMatch[0];
                        // quotedPart is indent + quoted key (or unquoted key without trailing spaces)
                        const prefixLen = quotedPart.length;
                        if (prefixLen > maxPrefixLen) maxPrefixLen = prefixLen;
                    }
                }
            }

            const eqCol = maxPrefixLen + MIN_GAP; // column where `=` or `:` sits

            // ── Rebuild lines ───────────────────────────────────────────
            const result: string[] = [];
            let hasSeenVarDecl = false;  // Track if we've encountered a var declaration

            for (const line of bodyLines) {
                if (line.trim() === '') {
                    // Skip blank lines before the first var declaration
                    // (they're usually between comments and code)
                    if (!hasSeenVarDecl) {
                        continue;
                    }
                    // After first var declaration, preserve blank lines (they separate groups)
                    result.push(line);
                    continue;
                }

                const parsed = parseVarLine(line);
                if (parsed) {
                    hasSeenVarDecl = true;
                    // This is a const declaration - re-render with alignment
                    const prefix    = `${parsed.indent}${parsed.keyword} ${parsed.name}${parsed.type}`;
                    const padding   = ' '.repeat(eqCol - prefix.length);
                    result.push(`${prefix}${padding}= ${parsed.value}`);
                    continue;
                }

                // Check if this is a property line that needs alignment
                const propMatch = line.match(/^(\s*)(?:"[^"]*"|'[^']*'|\w+)\s*:/);
                if (propMatch) {
                    // This is a property line - re-render with alignment
                    const quotedKeyMatch = line.match(/^(\s*)(?:"[^"]*"|'[^']*'|[^:\s]+)/);
                    if (quotedKeyMatch) {
                        const quotedKey = quotedKeyMatch[0];
                        // Find where the colon is
                        const colonIdx = line.indexOf(':', quotedKey.length);
                        const restOfLine = line.substring(colonIdx);
                        const padding   = ' '.repeat(eqCol - quotedKey.length);
                        result.push(`${quotedKey}${padding}${restOfLine}`);
                    }
                    continue;
                }

                // Non-var, non-property line - preserve verbatim
                result.push(line);
            }

            return result;

        }

        /**
        * Find the CONST section in `lines`, reformat its body, and return the full
        * file with only that section replaced.
        * Returns original lines unchanged when no CONST section is found.
        */
        export function formatConstSection(lines: string[]): string[] {
            // Process every CONST section in the file, not just the first.
            let result = lines;
            let searchFrom = 0;

            while (true) {
                let openIdx    = -1;
                let openIndent = '';
                for (let i = searchFrom; i < result.length; i++) {
                    const m = result[i].match(CONST_OPEN_RE);
                    if (m) { openIdx = i; openIndent = m[1]; break; }
                }
                if (openIdx === -1) break;

                // Accept only a close marker at the SAME indent level as the open.
                // Prevents inner ╚╝ lines (e.g. inside CORE) from being mistaken for
                // the CONST section's own close and causing the body to be mis-sliced.
                let closeIdx = -1;
                for (let i = openIdx + 1; i < result.length; i++) {
                    const m = result[i].match(CONST_CLOSE_RE);
                    if (m && m[1] === openIndent) { closeIdx = i; break; }
                }
                if (closeIdx === -1) break;

                const bodyLines     = result.slice(openIdx + 1, closeIdx);
                const formattedBody = formatConstBody(bodyLines);

                // Strip leading/trailing blanks - we add exactly one after open and before close.
                let trimStart = 0;
                let trimEnd   = formattedBody.length;
                while (trimStart < trimEnd && formattedBody[trimStart]?.trim()   === '') trimStart++;
                while (trimEnd > trimStart && formattedBody[trimEnd - 1]?.trim() === '') trimEnd--;
                const trimmedBody = formattedBody.slice(trimStart, trimEnd);

                result = [
                    ...result.slice(0, openIdx),
                    result[openIdx],
                    '',
                    ...trimmedBody,
                    '',
                    result[closeIdx],
                    ...result.slice(closeIdx + 1),
                ];

                searchFrom = closeIdx + 1;
            }

            return result;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌───────────────────────────────── API ──────────────────────────────┐

        /**
        * Public entry point: apply CONST section var-declaration alignment to a
        * TypeScript file on disk.  Called AFTER the normal format phase.
        * Returns `true` if the file was changed, `false` otherwise.
        */
        export function formatConstDecls(
        filepath : string,
        readFile : (p: string) => string,
        writeFile: (p: string, c: string) => void,
        ): boolean {
            const original = readFile(filepath);
            const lines    = original.split('\n');
            const result   = formatConstSection(lines);
            const output   = result.join('\n');

            if (output === original) return false;

            writeFile(filepath, output);
            return true;
        }

    // └────────────────────────────────────────────────────────────────────┘

// ╚══════════════════════════════════════════════════════════════════════════════════════╝