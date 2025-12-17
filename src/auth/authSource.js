/**
 * File: src/auth/authSource.js
 * Description: Authentication source manager that loads and validates authentication data from environment variables or config files
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const fs = require("fs");
const path = require("path");

/**
 * Authentication Source Management Module
 * Responsible for loading and managing authentication information from environment variables or file system
 */
class AuthSource {
    constructor(logger) {
        this.logger = logger;
        this.authMode = "file";
        this.availableIndices = [];
        this.initialIndices = [];
        this.accountNameMap = new Map();
        this.lastScannedIndices = "[]"; // Cache to track changes

        if (process.env.AUTH_JSON_0 || process.env.AUTH_JSON_1) {
            this.authMode = "env";
            this.logger.info(
                "[Auth] Detected AUTH_JSON_* environment variables, switching to environment variable authentication mode."
            );
        } else {
            this.logger.info(
                '[Auth] No environment variable authentication detected, will use files in "configs/auth/" directory.'
            );
        }

        this.reloadAuthSources(true); // Initial load

        if (this.availableIndices.length === 0) {
            this.logger.warn(
                `[Auth] No valid authentication sources found in '${this.authMode}' mode. The server will start in account binding mode.`
            );
        }
    }

    reloadAuthSources(isInitialLoad = false) {
        const oldIndices = this.lastScannedIndices;
        this._discoverAvailableIndices();
        const newIndices = JSON.stringify(this.initialIndices);

        // Only log verbosely if it's the first load or if the file list has actually changed.
        if (isInitialLoad || oldIndices !== newIndices) {
            this.logger.info(`[Auth] Auth file scan detected changes. Reloading and re-validating...`);
            this._preValidateAndFilter();
            this.logger.info(`[Auth] Reload complete. ${this.availableIndices.length} valid sources available: [${this.availableIndices.join(", ")}]`);
            this.lastScannedIndices = newIndices;
        }
    }

    removeAuth(index) {
        if (this.authMode !== "file") {
            throw new Error("Account deletion is only supported when using file-based auth.");
        }
        if (!Number.isInteger(index)) {
            throw new Error("Invalid account index.");
        }

        const authFilePath = path.join(process.cwd(), "configs", "auth", `auth-${index}.json`);
        if (!fs.existsSync(authFilePath)) {
            throw new Error(`Auth file for account #${index} does not exist.`);
        }

        try {
            fs.unlinkSync(authFilePath);
        } catch (error) {
            throw new Error(`Failed to delete auth file for account #${index}: ${error.message}`);
        }

        return {
            remainingAccounts: this.availableIndices.length,
            removedIndex: index,
        };
    }

    _discoverAvailableIndices() {
        let indices = [];
        if (this.authMode === "env") {
            const regex = /^AUTH_JSON_(\d+)$/;
            for (const key in process.env) {
                const match = key.match(regex);
                if (match && match[1]) {
                    indices.push(parseInt(match[1], 10));
                }
            }
        } else {
            const configDir = path.join(process.cwd(), "configs", "auth");
            if (!fs.existsSync(configDir)) {
                this.availableIndices = [];
                this.initialIndices = [];
                return;
            }
            try {
                const files = fs.readdirSync(configDir);
                const authFiles = files.filter(file => /^auth-\d+\.json$/.test(file));
                indices = authFiles.map(file =>
                    parseInt(file.match(/^auth-(\d+)\.json$/)[1], 10)
                );
            } catch (error) {
                this.logger.error(`[Auth] Failed to scan "configs/auth/" directory: ${error.message}`);
                this.availableIndices = [];
                this.initialIndices = [];
                return;
            }
        }

        this.initialIndices = [...new Set(indices)].sort((a, b) => a - b);
    }

    _preValidateAndFilter() {
        if (this.initialIndices.length === 0) {
            this.availableIndices = [];
            this.accountNameMap.clear();
            return;
        }

        const validIndices = [];
        const invalidSourceDescriptions = [];
        this.accountNameMap.clear(); // Clear old names before re-validating

        for (const index of this.initialIndices) { // Iterate over initial to check all, not just previously available
            const authContent = this._getAuthContent(index);
            if (authContent) {
                try {
                    const authData = JSON.parse(authContent);
                    validIndices.push(index);
                    this.accountNameMap.set(
                        index,
                        authData.accountName || "N/A (unnamed)"
                    );
                } catch (e) {
                    invalidSourceDescriptions.push(`auth-${index}`);
                }
            } else {
                invalidSourceDescriptions.push(`auth-${index} (unreadable)`);
            }
        }

        if (invalidSourceDescriptions.length > 0) {
            this.logger.warn(
                `⚠️ [Auth] Pre-validation found ${invalidSourceDescriptions.length
                } authentication sources with format errors or unreadable: [${invalidSourceDescriptions.join(
                    ", "
                )}], will be removed from available list.`
            );
        }

        this.availableIndices = validIndices.sort((a, b) => a - b);
    }

    _getAuthContent(index) {
        if (this.authMode === "env") {
            return process.env[`AUTH_JSON_${index}`];
        } else {
            const authFilePath = path.join(process.cwd(), "configs", "auth", `auth-${index}.json`);
            if (!fs.existsSync(authFilePath)) return null;
            try {
                return fs.readFileSync(authFilePath, "utf-8");
            } catch (e) {
                return null;
            }
        }
    }

    getAuth(index) {
        if (!this.availableIndices.includes(index)) {
            this.logger.error(`[Auth] Requested invalid or non-existent authentication index: ${index}`);
            return null;
        }

        const jsonString = this._getAuthContent(index);
        if (!jsonString) {
            this.logger.error(`[Auth] Unable to retrieve content for authentication source #${index} during read.`);
            return null;
        }

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            this.logger.error(
                `[Auth] Failed to parse JSON content from authentication source #${index}: ${e.message}`
            );
            return null;
        }
    }
}

module.exports = AuthSource;
