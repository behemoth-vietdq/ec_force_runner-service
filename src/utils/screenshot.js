const path = require("path");
const fs = require("fs");
const config = require("../config");
const logger = require("./logger");
const { getErrorMessage } = require("./logger");
const { retryWithBackoff } = require("./retry");

// Google Cloud Storage client (lazy init)
let storageClient = null;

/**
 * Initialize GCS client if credentials available
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
 * Upload file to GCS with signed URL and retry protection
 */
async function uploadToGCS(localPath, filename) {
  const storage = initGCSClient();
  if (!storage) return null;

  try {
    // Execute upload with retry logic
    return await retryWithBackoff(async () => {
      const bucket = storage.bucket(config.gcs.bucketName);
      const blob = bucket.file(`${filename}`);

      await bucket.upload(localPath, {
        destination: `${filename}`,
        metadata: {
          contentType: "image/png",
        },
      });

      // Generate signed URL instead of making public
      const expiry = Date.now() + (config.gcs.signedUrlExpiry || 3600000);
      const [signedUrl] = await blob.getSignedUrl({
        action: 'read',
        expires: expiry,
      });

      logger.info(`Screenshot uploaded to GCS with signed URL (expires in ${Math.floor((config.gcs.signedUrlExpiry || 3600000) / 60000)} minutes)`);

      return signedUrl;
    }, {
      maxAttempts: 2,
      initialDelay: 1000,
      operationName: 'GCS upload'
    });
  } catch (error) {
    logger.error("Failed to upload to GCS:", error);
    return null;
  }
}

/**
 * Generate unique filename with timestamp
 */
function generateFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `screenshot_${timestamp}.png`;
}

/**
 * Ensure screenshot directory exists
 */
function ensureDirectoryExists() {
  const screenshotsDir = config.crawler.screenshotsDir || 'screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    logger.info(`Created screenshots directory: ${screenshotsDir}`);
  }
  return screenshotsDir;
}

/**
 * Save screenshot from Puppeteer page
 */
async function saveScreenshot(page, filename = null) {
  try {
    const screenshotsDir = ensureDirectoryExists();

    const screenshotFilename = filename || generateFilename();
    const screenshotPath = path.join(
      screenshotsDir,
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
 * Save error screenshot with context and upload to GCS
 */
async function saveErrorScreenshot(page, error, context = "") {
  if (!config.crawler.screenshotsEnabled) {
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
        getErrorMessage(error)
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
 * Clean up old screenshots (default: 7 days)
 */
function cleanupOldScreenshots(daysOld = 7) {
  try {
    const screenshotsDir = config.crawler.screenshotsDir || 'screenshots';
    if (!fs.existsSync(screenshotsDir)) {
      return;
    }

    const files = fs.readdirSync(screenshotsDir);
    const now = Date.now();
    const maxAge = daysOld * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    files.forEach((file) => {
      const filePath = path.join(screenshotsDir, file);
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
