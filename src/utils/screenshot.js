const path = require("path");
const fs = require("fs");
const config = require("../config");
const logger = require("./logger");

// Google Cloud Storage client (lazy init)
let storageClient = null;

/**
 * Initialize GCS client if credentials are available
 */
function initGCSClient() {
  if (storageClient) return storageClient;

  if (!config.gcs.bucketName || !config.gcs.keyFile || !config.gcs.projectId) {
    logger.debug("GCS not configured, using local storage only");
    return null;
  }

  try {
    const { Storage } = require("@google-cloud/storage");
    storageClient = new Storage({
      keyFilename: config.gcs.keyFile,
      projectId: config.gcs.projectId,
    });
    logger.info("GCS client initialized successfully");
    return storageClient;
  } catch (error) {
    logger.error("Failed to initialize GCS client:", error);
    return null;
  }
}

/**
 * Upload file to Google Cloud Storage
 * @param {string} localPath - Local file path
 * @param {string} filename - Destination filename in GCS
 * @returns {Promise<string|null>} Public URL or null
 */
async function uploadToGCS(localPath, filename) {
  const storage = initGCSClient();
  if (!storage) return null;

  try {
    const bucket = storage.bucket(config.gcs.bucketName);
    const blob = bucket.file(`${filename}`);

    await bucket.upload(localPath, {
      destination: `${filename}`,
      metadata: {
        contentType: "image/png",
      },
    });

    // Make file public
    await blob.makePublic();

    const publicUrl = `https://storage.googleapis.com/${config.gcs.bucketName}/${filename}`;
    logger.info(`Screenshot uploaded to GCS: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    logger.error("Failed to upload to GCS:", error);
    return null;
  }
}

/**
 * Generate a unique filename for screenshot
 * @returns {string} filename with timestamp
 */
function generateFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `screenshot_${timestamp}.png`;
}

/**
 * Ensure screenshot directory exists
 */
function ensureDirectoryExists() {
  if (!fs.existsSync(config.screenshots.path)) {
    fs.mkdirSync(config.screenshots.path, { recursive: true });
    logger.info(`Created screenshots directory: ${config.screenshots.path}`);
  }
}

/**
 * Save screenshot from Puppeteer page
 * @param {Page} page - Puppeteer page object
 * @param {string} filename - Optional custom filename
 * @returns {Promise<string>} Path to saved screenshot
 */
async function saveScreenshot(page, filename = null) {
  try {
    ensureDirectoryExists();

    const screenshotFilename = filename || generateFilename();
    const screenshotPath = path.join(
      config.screenshots.path,
      screenshotFilename
    );

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    logger.info(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    logger.error("Failed to save screenshot:", error);
    throw error;
  }
}

/**
 * Save screenshot on error with context and upload to GCS
 * @param {Page} page - Puppeteer page object
 * @param {Error} error - Error object
 * @param {string} context - Context description
 * @returns {Promise<Object|null>} Screenshot info with local path and GCS URL
 */
async function saveErrorScreenshot(page, error, context = "") {
  if (!config.screenshots.enabled) {
    return null;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const contextStr = context ? `_${context.replace(/\s+/g, "_")}` : "";
    const filename = `error${contextStr}_${timestamp}.png`;

    // Save locally
    const screenshotPath = await saveScreenshot(page, filename);

    // Upload to GCS if configured
    const gcsUrl = await uploadToGCS(screenshotPath, filename);

    const result = {
      localPath: screenshotPath,
      gcsUrl: gcsUrl,
      filename: filename,
    };

    logger.error(
      `Error screenshot captured - error: ${
        error.message
      }, context: ${context}, local: ${screenshotPath}, gcs: ${
        gcsUrl || "not uploaded"
      }`
    );

    return result;
  } catch (screenshotError) {
    logger.error("Failed to capture error screenshot:", screenshotError);
    return null;
  }
}

/**
 * Clean up old screenshots
 * @param {number} daysOld - Delete screenshots older than this many days
 */
function cleanupOldScreenshots(daysOld = 7) {
  try {
    if (!fs.existsSync(config.screenshots.path)) {
      return;
    }

    const files = fs.readdirSync(config.screenshots.path);
    const now = Date.now();
    const maxAge = daysOld * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    files.forEach((file) => {
      const filePath = path.join(config.screenshots.path, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old screenshot(s)`);
    }
  } catch (error) {
    logger.error("Failed to cleanup old screenshots:", error);
  }
}

module.exports = {
  saveScreenshot,
  saveErrorScreenshot,
  cleanupOldScreenshots,
  ensureDirectoryExists,
};
