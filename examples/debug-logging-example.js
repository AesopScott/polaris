/**
 * Debug Logging Example — Demonstrating pushDebugLog() in generated code
 *
 * This example shows how newly-written features should include error reporting
 * so failures are visible in the debug panel without manual log inspection.
 *
 * Context: Feature writes data to a JSON file, with comprehensive error handling
 * and logging for each failure point (missing path, permission error, etc).
 */

const fs = require('fs');
const path = require('path');
const { pushDebugLog } = require('../lib/debugUtil.js');

/**
 * Write task data to a JSON file and log errors to debug panel
 * @param {string} filePath - Absolute path to save file
 * @param {object} taskData - Task object to serialize
 * @returns {object} - {success: boolean, message: string, data?: object}
 */
function writeTaskToFile(filePath, taskData) {
  try {
    // Validate inputs
    if (!filePath || typeof filePath !== 'string') {
      const msg = 'writeTaskToFile: invalid file path';
      pushDebugLog(msg, true);
      return { success: false, message: msg };
    }

    if (!taskData || typeof taskData !== 'object') {
      const msg = 'writeTaskToFile: invalid task data';
      pushDebugLog(msg, true);
      return { success: false, message: msg };
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        pushDebugLog(`Created directory: ${dir}`, false);
      } catch (mkdirError) {
        const msg = `writeTaskToFile: failed to create directory ${dir} — ${mkdirError.message}`;
        pushDebugLog(msg, true);
        return { success: false, message: msg };
      }
    }

    // Write file
    const json = JSON.stringify(taskData, null, 2);
    fs.writeFileSync(filePath, json, 'utf8');

    const msg = `Wrote task to file: ${filePath}`;
    pushDebugLog(msg, false);
    return { success: true, message: msg, data: taskData };
  } catch (error) {
    // Handle any unexpected errors (permissions, disk full, etc)
    const msg = `writeTaskToFile: ${error.code || error.name} — ${error.message}`;
    pushDebugLog(msg, true);
    return { success: false, message: msg };
  }
}

/**
 * Read task data from a JSON file and log errors to debug panel
 * @param {string} filePath - Absolute path to read from
 * @returns {object} - {success: boolean, message: string, data?: object}
 */
function readTaskFromFile(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      const msg = 'readTaskFromFile: invalid file path';
      pushDebugLog(msg, true);
      return { success: false, message: msg };
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      const msg = `readTaskFromFile: file not found — ${filePath}`;
      pushDebugLog(msg, true);
      return { success: false, message: msg };
    }

    // Read file
    const json = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(json);

    const msg = `Read task from file: ${filePath}`;
    pushDebugLog(msg, false);
    return { success: true, message: msg, data };
  } catch (error) {
    let msg;
    if (error instanceof SyntaxError) {
      msg = `readTaskFromFile: invalid JSON in ${filePath} — ${error.message}`;
    } else {
      msg = `readTaskFromFile: ${error.code || error.name} — ${error.message}`;
    }
    pushDebugLog(msg, true);
    return { success: false, message: msg };
  }
}

/**
 * Update a task field and persist to file
 * @param {string} filePath - Absolute path to task file
 * @param {string} fieldName - Field to update (e.g., "status", "priority")
 * @param {*} newValue - New field value
 * @returns {object} - {success: boolean, message: string, data?: object}
 */
function updateTaskField(filePath, fieldName, newValue) {
  try {
    // Read current task
    const readResult = readTaskFromFile(filePath);
    if (!readResult.success) {
      return readResult; // readTaskFromFile already logged the error
    }

    const task = readResult.data;

    // Validate field name
    if (!fieldName || typeof fieldName !== 'string') {
      const msg = 'updateTaskField: invalid field name';
      pushDebugLog(msg, true);
      return { success: false, message: msg };
    }

    // Update field
    const oldValue = task[fieldName];
    task[fieldName] = newValue;

    // Write back to file
    const writeResult = writeTaskToFile(filePath, task);
    if (!writeResult.success) {
      return writeResult; // writeTaskToFile already logged the error
    }

    const msg = `Updated ${fieldName} from ${JSON.stringify(oldValue)} to ${JSON.stringify(newValue)}`;
    pushDebugLog(msg, false);
    return { success: true, message: msg, data: task };
  } catch (error) {
    const msg = `updateTaskField: unexpected error — ${error.message}`;
    pushDebugLog(msg, true);
    return { success: false, message: msg };
  }
}

// Export functions for testing and use in generated code
module.exports = {
  writeTaskToFile,
  readTaskFromFile,
  updateTaskField
};
