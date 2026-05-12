import { type FileHandle } from "node:fs/promises";
export declare const isMissingFileError: (error: unknown) => boolean;
export declare const openVerifiedFile: (filePath: string, symlinkMessage: string) => Promise<FileHandle>;
//# sourceMappingURL=file-security.d.ts.map