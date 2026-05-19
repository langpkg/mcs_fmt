// src/fmt/ts/type_format.ts
//
// Made with ❤️ by Maysara.



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    const TYPE_OPEN_RE        = /^(\s*)\/\/ ╔(═+) TYPE (═+)╗\s*$/;
    const TYPE_CLOSE_RE       = /^(\s*)\/\/ ╚(═+)╝\s*$/;
    const PROPERTY_RE         = /^(\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(\?)?\s*:\s*(.*?)\s*\r?$/;
    const MODIFIER_PROP_RE    = /^(\s*)((?:public|private|protected|readonly)\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(\?)?\s*:\s*(.*?)\s*\r?$/;
    const MIN_GAP             = 1; // Minimum spaces between property name and colon

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TYPE ════════════════════════════════════════╗

    interface ParsedProperty {
        indent      : string;
        modifier    : string; // empty or "public " etc.
        name        : string;
        optional    : string; // empty or "?"
        colonSpaces : string; // original spaces before `:`
        type        : string;
        raw         : string; // original line
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    // ┌──────────────────────────────── PARSE ─────────────────────────────┐

        /**
        * Try to parse a line as a property declaration in a type/interface.
        * Matches: propertyName?: type or propertyName: type (handles irregular spacing)
        * Also matches: public propertyName?: type or similar with modifiers
        * Skips: method signatures, blank lines, comments, braces
        * Returns null for non-property lines.
        */
        function parsePropertyLine(line: string): ParsedProperty | null {
            const trimmed = line.trim();

            // Skip blank lines, closing braces, opening braces, comments
            if (!trimmed || trimmed.startsWith('}') || trimmed.startsWith('{') ||
            trimmed.startsWith('//') || trimmed.startsWith('*')) {
                return null;
            }

            // Try to match with modifiers first (public/private/protected/readonly)
            let m = line.match(MODIFIER_PROP_RE);
            if (m) {
                return {
                    indent      : m[1],
                    modifier    : m[2],
                    name        : m[3],
                    optional    : m[4] ? '?' : '',
                    colonSpaces : '',
                    type        : m[5],
                    raw         : line,
                };
            }

            // Try to match without modifiers
            m = line.match(PROPERTY_RE);
            if (m) {
                return {
                    indent      : m[1],
                    modifier    : '',
                    name        : m[2],
                    optional    : m[3] ? '?' : '',
                    colonSpaces : '',
                    type        : m[4],
                    raw         : line,
                };
            }

            return null;
        }

    // └────────────────────────────────────────────────────────────────────┘


    // ┌─────────────────────────────── FORMAT ─────────────────────────────┐

        /**
        * Find TYPE sections in `lines` (delimited by section markers), reformat property
        * declarations within them, and return the full file with sections replaced.
        * Returns original lines unchanged when no TYPE sections are found.
        */
        export function formatTypeSection(lines: string[]): string[] {
            // Find TYPE section boundaries
            let typeOpenIdx = -1;
            let typeCloseIdx = -1;
            let typeOpenIndent = '';

            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(TYPE_OPEN_RE);
                if (m) { typeOpenIdx = i; typeOpenIndent = m[1]; break; }
            }

            if (typeOpenIdx === -1) return lines; // No TYPE section found

            // Find matching close marker
            for (let i = typeOpenIdx + 1; i < lines.length; i++) {
                const m = lines[i].match(TYPE_CLOSE_RE);
                if (m && m[1] === typeOpenIndent) { typeCloseIdx = i; break; }
            }

            if (typeCloseIdx === -1) return lines; // Malformed section

            // Process the section body: find properties and align by indent level
            const sectionBody = lines.slice(typeOpenIdx + 1, typeCloseIdx);
            const formattedBody = formatTypeSectionBody(sectionBody);

            return [
                ...lines.slice(0, typeOpenIdx),
                lines[typeOpenIdx],
                ...formattedBody,
                lines[typeCloseIdx],
                ...lines.slice(typeCloseIdx + 1),
            ];
        }

        /**
        * Process the content between TYPE section markers:
        *   1. Find all alignable property declarations (excluding modifiers)
        *   2. Calculate global `:` column
        *   3. Format alignable properties, normalize others
        *   4. For multiline types, indent continuation lines to colonCol
        *   5. Return full section with formatted properties
        */
        function formatTypeSectionBody(lines: string[]): string[] {
            // First pass: find alignable properties and detect multiline types
            const alignableProperties: { idx: number; parsed: ParsedProperty; isMultiline: boolean }[] = [];
            const continuationLines = new Set<number>(); // Lines that are part of a multiline type

            for (let i = 0; i < lines.length; i++) {
                if (continuationLines.has(i)) continue; // Skip lines already marked as continuations

                const parsed = parsePropertyLine(lines[i]);
                if (parsed) {
                    // Check if this is a multiline type (next line starts with |)
                    const isMultiline = i + 1 < lines.length && lines[i + 1].trim().startsWith('|');
                    alignableProperties.push({ idx: i, parsed, isMultiline });

                    if (isMultiline) {
                        // Mark following lines as continuations until we hit a non-continuation
                        for (let j = i + 1; j < lines.length; j++) {
                            const trimmed = lines[j].trim();
                            if (!trimmed || trimmed.startsWith('}') || trimmed.startsWith('{') ||
                            trimmed.startsWith('//') || trimmed.startsWith('*')) {
                                break; // Stop at blank lines, braces, comments
                            }
                            if (!trimmed.startsWith('|')) break; // Stop if not a continuation
                            continuationLines.add(j);
                        }
                    }
                }
            }

            // If fewer than 2 alignable properties, apply normalization-only pass
            if (alignableProperties.length < 2) {
                const result = [...lines];
                for (let i = 0; i < result.length; i++) {
                    normalizePropertyLine(result, i);
                }
                return result;
            }

            // Calculate global colonCol from longest alignable prefix (including modifier)
            let maxPrefixLen = 0;
            for (const { parsed } of alignableProperties) {
                const prefixLen = parsed.indent.length + parsed.modifier.length + parsed.name.length + parsed.optional.length;
                if (prefixLen > maxPrefixLen) maxPrefixLen = prefixLen;
            }
            const colonCol = maxPrefixLen + MIN_GAP;

            // Second pass: format alignable properties, normalize others, handle multiline continuations
            const result = [...lines];
            const alignableIndices = new Set(alignableProperties.map(p => p.idx));
            const continuationIndent = ' '.repeat(colonCol); // Indent for continuation lines (aligns with colon)

            for (let i = 0; i < result.length; i++) {
                if (continuationLines.has(i)) {
                    // This is a continuation line of a multiline type - indent it properly
                    const hasCR = result[i].endsWith('\r');
                    const trimmed = result[i].trim();
                    result[i] = `${continuationIndent}${trimmed}${hasCR ? '\r' : ''}`;
                } else if (alignableIndices.has(i)) {
                    // Align this property to colonCol
                    const prop = alignableProperties.find(p => p.idx === i)!;
                    const parsed = prop.parsed;
                    const prefix = `${parsed.indent}${parsed.modifier}${parsed.name}${parsed.optional}`;
                    const padding = ' '.repeat(colonCol - prefix.length);
                    const hasCR = result[i].endsWith('\r');

                    if (prop.isMultiline) {
                        // For multiline types, just put the colon with no type content on this line
                        result[i] = `${prefix}${padding}:${hasCR ? '\r' : ''}`;
                    } else {
                        // For single-line types, include the type
                        result[i] = `${prefix}${padding}: ${parsed.type}${hasCR ? '\r' : ''}`;
                    }
                } else {
                    // Normalize spacing for non-aligned lines
                    normalizePropertyLine(result, i);
                }
            }

            return result;
        }

        /**
        * Normalize a single line's property declaration spacing (no alignment, just normalization)
        */
        function normalizePropertyLine(lines: string[], idx: number): void {
            const line = lines[idx];
            const hasCR = line.endsWith('\r');

            // Try to match as a property with modifiers first (public/private/protected/readonly)
            const modMatch = line.match(MODIFIER_PROP_RE);
            if (modMatch) {
                const indent = modMatch[1];
                const modifier = modMatch[2]; // e.g., "public "
                const name = modMatch[3];
                const optional = modMatch[4] ? '?' : '';
                const type = modMatch[5].trimEnd(); // Remove trailing whitespace and \r
                lines[idx] = `${indent}${modifier}${name}${optional} : ${type}${hasCR ? '\r' : ''}`;
                return;
            }

            // Try to match as a regular property
            const propMatch = line.match(PROPERTY_RE);
            if (propMatch) {
                const indent = propMatch[1];
                const name = propMatch[2];
                const optional = propMatch[3] ? '?' : '';
                const type = propMatch[4].trimEnd(); // Remove trailing whitespace and \r
                lines[idx] = `${indent}${name}${optional} : ${type}${hasCR ? '\r' : ''}`;
                return;
            }
        }

    // └────────────────────────────────────────────────────────────────────┘

// ╚══════════════════════════════════════════════════════════════════════════════════════╝


