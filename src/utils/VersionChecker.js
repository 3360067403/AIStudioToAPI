/**
 * File: src/utils/VersionChecker.js
 * Description: Checks for new versions by querying GitHub Tags API
 *
 * Maintainers: iBenzene, bbbugg
 */

const axios = require("axios");

/**
 * VersionChecker
 * Checks GitHub for latest version and compares with current
 */
class VersionChecker {
    constructor(logger) {
        this.logger = logger;
        this.repoOwner = "iBenzene";
        this.repoName = "AIStudioToAPI";
    }

    /**
     * Get current app version from build-time injection or package.json
     */
    getCurrentVersion() {
        // Try environment variable first (set during Docker build)
        if (process.env.VERSION) {
            return process.env.VERSION;
        }
        // Fall back to package.json
        try {
            const packageJson = require("../../package.json");
            return packageJson.version;
        } catch {
            return "unknown";
        }
    }

    /**
     * Parse version string to comparable format
     * @param {string} version - Version like "v0.2.9" or "0.2.9"
     * @returns {number[]} Array of version parts [major, minor, patch]
     */
    parseVersion(version) {
        const cleaned = version.replace(/^v/, "");
        const parts = cleaned.split(".").map(p => parseInt(p, 10) || 0);
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }

    /**
     * Compare two versions
     * @returns {number} 1 if a > b, -1 if a < b, 0 if equal
     */
    compareVersions(a, b) {
        const [aMajor, aMinor, aPatch] = this.parseVersion(a);
        const [bMajor, bMinor, bPatch] = this.parseVersion(b);

        if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
        if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
        if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
        return 0;
    }

    /**
     * Fetch latest version tag from GitHub
     * @returns {Promise<{name: string, url: string} | null>}
     */
    async fetchLatestTag() {
        try {
            const response = await axios.get(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/tags`, {
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    "User-Agent": "AIStudioToAPI-VersionChecker",
                },
                timeout: 10000,
            });

            const tags = response.data || [];

            // Filter: only v* tags, exclude preview-*
            const versionTags = tags.filter(tag => tag.name.startsWith("v") && !tag.name.includes("preview"));

            if (versionTags.length === 0) {
                return null;
            }

            // Sort by version (descending)
            versionTags.sort((a, b) => this.compareVersions(b.name, a.name));

            const latest = versionTags[0];
            return {
                name: latest.name,
                url: `https://github.com/${this.repoOwner}/${this.repoName}/releases/tag/${latest.name}`,
            };
        } catch (error) {
            this.logger?.warn(`[VersionChecker] Failed to fetch tags: ${error.message}`);
            return null;
        }
    }

    /**
     * Check for updates
     * @returns {Promise<object>}
     */
    async checkForUpdates() {
        const current = this.getCurrentVersion();
        const latest = await this.fetchLatestTag();

        if (!latest) {
            return {
                current,
                error: "Unable to fetch latest version",
                hasUpdate: false,
                latest: null,
                releaseUrl: null,
            };
        }

        const hasUpdate = this.compareVersions(latest.name, current) > 0;

        if (hasUpdate) {
            this.logger?.info(`[VersionChecker] New version available: ${latest.name} (current: ${current})`);
        }

        return {
            current,
            hasUpdate,
            latest: latest.name,
            releaseUrl: latest.url,
        };
    }
}

module.exports = VersionChecker;
