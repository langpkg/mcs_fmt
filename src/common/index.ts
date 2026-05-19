// src/common/index.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { PkgError }    from './types';
    import * as path       from 'path';
    import * as fs         from 'fs';
    import process         from 'process';
    export *               from './types';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ FILE ════════════════════════════════════════╗

    export function resolvePath(filePath: string): string {
        return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    }

    export function isFileExists(filePath: string): boolean {
        try {
            return fs.existsSync(resolvePath(filePath));
        } catch {
            return false;
        }
    }

    export function isDirExists(dirPath: string): boolean {
        try {
            const resolved = resolvePath(dirPath);
            return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
        } catch {
            return false;
        }
    }

    export function readFile(filePath: string): string {
        const targetPath = resolvePath(filePath);

        if (!fs.existsSync(targetPath)) {
            throw new PkgError(`File not found: ${targetPath}`, 'FILE_NOT_FOUND', {
                path    : targetPath,
            });
        }

        try {
            return fs.readFileSync(targetPath, 'utf-8');
        } catch (error) {
            throw new PkgError(`Failed to read file: ${targetPath}`, 'FILE_READ_ERROR', {
                path    : targetPath,
                cause   : String(error),
            });
        }
    }

    export function writeFile(filePath: string, content: string): void {
        const targetPath    = resolvePath(filePath);
        const dir           = path.dirname(targetPath);

        try {
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
            fs.writeFileSync(targetPath, content, 'utf-8');
        } catch (error) {
            throw new PkgError(`Failed to write file: ${targetPath}`, 'FILE_WRITE_ERROR', {
                path    : targetPath,
                cause   : String(error),
            });
        }
    }

    export function readJsonFile<T = unknown>(filePath: string): T {
        const content = readFile(filePath);
        try {
            return JSON.parse(content) as T;
        } catch (error) {
            throw new PkgError(`Invalid JSON in file: ${filePath}`, 'JSON_PARSE_ERROR', {
                path    : filePath,
                cause   : String(error),
            });
        }
    }

    export function writeJsonFile(filePath: string, data: unknown, pretty = true): void {
        const content = pretty ? JSON.stringify(data, null, 4) : JSON.stringify(data);
        writeFile(filePath, content);
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ PROC ════════════════════════════════════════╗

    export function getCwd(): string {
        return process.cwd();
    }

    export function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    export function createDir(dirPath: string): void {
        const fullPath = path.resolve(getCwd(), dirPath);
        fs.mkdirSync(fullPath, { recursive: true });
    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝