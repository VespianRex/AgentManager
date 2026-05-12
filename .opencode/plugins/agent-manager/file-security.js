import fs from "node:fs/promises";
import { constants } from "node:fs";
import { logSecurityEvent } from "./security-logger.js";
const NOFOLLOW_READ_FLAGS = typeof constants.O_NOFOLLOW === "number"
    ? constants.O_RDONLY | constants.O_NOFOLLOW
    : constants.O_RDONLY;
const isErrorWithCode = (error) => (error instanceof Error || (typeof error === "object" && error !== null)) &&
    typeof error.code === "string";
export const isMissingFileError = (error) => isErrorWithCode(error) && error.code === "ENOENT";
const isSymlinkOpenError = (error) => isErrorWithCode(error) && (error.code === "ELOOP" || error.code === "EMLINK");
export const openVerifiedFile = async (filePath, symlinkMessage) => {
    // KISS: Always check for symlinks as defense-in-depth, even if O_NOFOLLOW is available.
    // This ensures symlinks are detected before we even attempt to open the file.
    // The O_NOFOLLOW flag provides one line of defense; this lstat check is a second.
    const stats = await fs.lstat(filePath);
    if (stats.isSymbolicLink()) {
        // Log security event
        logSecurityEvent("symlink_rejection", "warn", {
            filePath,
            reason: "config_file_symlink_rejected",
        }).catch(() => { });
        throw new Error(symlinkMessage);
    }
    try {
        return await fs.open(filePath, NOFOLLOW_READ_FLAGS);
    }
    catch (error) {
        if (isSymlinkOpenError(error)) {
            // Log security event
            logSecurityEvent("symlink_rejection", "warn", {
                filePath,
                reason: "symlink_loop_or_chained_symlink",
            }).catch(() => { });
            throw new Error(symlinkMessage);
        }
        throw error;
    }
};
//# sourceMappingURL=file-security.js.map