// src/fmt/json/index.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { formatJsonWithAlignment }    from './json_format';
    import { FormatResult }               from '../../common/types';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    export function formatJSON(src: string, filename = 'package.json'): FormatResult {
        const { formatted, count } = formatJsonWithAlignment(src, filename);
        const result: FormatResult = {
            formatted,
            count,
            errors : [],
        };

        return result;
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝