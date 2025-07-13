import { promises as fs } from 'node:fs';
import path from 'node:path';

import express from 'express';
import _ from 'lodash';
import { default as writeFileAtomic } from 'write-file-atomic';

import { SETTINGS_FILE } from '../constants.js';
import { getConfigValue, generateTimestamp, removeOldBackups } from '../util.js';
import { getAllUserHandles, getUserDirectories } from '../users.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';

let ENABLE_EXTENSIONS;
let ENABLE_EXTENSIONS_AUTO_UPDATE;
let ENABLE_ACCOUNTS;

// 10 minutes
const AUTOSAVE_INTERVAL = 10 * 60 * 1000;

/**
 * Map of functions to trigger settings autosave for a user.
 * @type {Map<string, function>}
 */
const AUTOSAVE_FUNCTIONS = new Map();

/**
 * Triggers autosave for a user every 10 minutes.
 * @param {string} handle User handle
 * @returns {void}
 */
function triggerAutoSave(handle) {
    if (!AUTOSAVE_FUNCTIONS.has(handle)) {
        const throttledAutoSave = _.throttle(() => backupUserSettings(handle, true), AUTOSAVE_INTERVAL);
        AUTOSAVE_FUNCTIONS.set(handle, throttledAutoSave);
    }

    const functionToCall = AUTOSAVE_FUNCTIONS.get(handle);
    if (functionToCall && typeof functionToCall === 'function') {
        functionToCall();
    }
}

/**
 * Reads and parses files from a directory.
 * @param {string} directoryPath Path to the directory
 * @param {string} fileExtension File extension
 * @returns {Promise<Array>} Parsed files
 */
async function readAndParseFromDirectory(directoryPath, fileExtension = '.json') {
    const files = (await fs.readdir(directoryPath))
        .filter(x => path.parse(x).ext == fileExtension)
        .sort();

    const parsedFiles = [];

    for (const item of files) {
        try {
            const file = await fs.readFile(path.join(directoryPath, item), 'utf-8');
            parsedFiles.push(fileExtension == '.json' ? JSON.parse(file) : file);
        }
        catch {
            // skip
        }
    }

    return parsedFiles;
}

/**
 * Gets a sort function for sorting strings.
 * @param {*} _
 * @returns {(a: string, b: string) => number} Sort function
 */
function sortByName(_) {
    return (a, b) => a.localeCompare(b);
}

/**
 * Gets backup file prefix for user settings.
 * @param {string} handle User handle
 * @returns {string} File prefix
 */
function getFilePrefix(handle) {
    return `settings_${handle}_`;
}

async function readPresetsFromDirectory(directoryPath, options = {}) {
    const {
        sortFunction,
        removeFileExtension = false,
        fileExtension = '.json',
    } = options;

    const files = (await fs.readdir(directoryPath)).sort(sortFunction).filter(x => path.parse(x).ext == fileExtension);
    const fileContents = [];
    const fileNames = [];

    for (const item of files) {
        try {
            const file = await fs.readFile(path.join(directoryPath, item), 'utf8');
            JSON.parse(file);
            fileContents.push(file);
            fileNames.push(removeFileExtension ? item.replace(/\.[^/.]+$/, '') : item);
        } catch {
            // skip
            console.warn(`${item} is not a valid JSON`);
        }
    }

    return { fileContents, fileNames };
}

async function backupSettings() {
    try {
        const userHandles = await getAllUserHandles();

        for (const handle of userHandles) {
            backupUserSettings(handle, true);
        }
    } catch (err) {
        console.error('Could not backup settings file', err);
    }
}

/**
 * Makes a backup of the user's settings file.
 * @param {string} handle User handle
 * @param {boolean} preventDuplicates Prevent duplicate backups
 * @returns {Promise<void>}
 */
async function backupUserSettings(handle, preventDuplicates) {
    const userDirectories = getUserDirectories(handle);
    const backupFile = path.join(userDirectories.backups, `${getFilePrefix(handle)}${generateTimestamp()}.json`);
    const sourceFile = path.join(userDirectories.root, SETTINGS_FILE);

    if (preventDuplicates && await isDuplicateBackup(handle, sourceFile)) {
        return;
    }

    try {
        await fs.access(sourceFile);
    } catch {
        return;
    }

    await fs.copyFile(sourceFile, backupFile);
    await removeOldBackups(userDirectories.backups, `settings_${handle}`);
}

/**
 * Checks if the backup would be a duplicate.
 * @param {string} handle User handle
 * @param {string} sourceFile Source file path
 * @returns {Promise<boolean>} True if the backup is a duplicate
 */
async function isDuplicateBackup(handle, sourceFile) {
    const latestBackup = await getLatestBackup(handle);
    if (!latestBackup) {
        return false;
    }
    return areFilesEqual(latestBackup, sourceFile);
}

/**
 * Returns true if the two files are equal.
 * @param {string} file1 File path
 * @param {string} file2 File path
 */
async function areFilesEqual(file1, file2) {
    try {
        await fs.access(file1);
        await fs.access(file2);
    } catch {
        return false;
    }

    const content1 = await fs.readFile(file1);
    const content2 = await fs.readFile(file2);
    return content1.toString() === content2.toString();
}

/**
 * Gets the latest backup file for a user.
 * @param {string} handle User handle
 * @returns {Promise<string|null>} Latest backup file. Null if no backup exists.
 */
async function getLatestBackup(handle) {
    const userDirectories = getUserDirectories(handle);
    const backupFiles = await Promise.all((await fs.readdir(userDirectories.backups))
        .filter(x => x.startsWith(getFilePrefix(handle)))
        .map(async x => ({ name: x, ctime: (await fs.stat(path.join(userDirectories.backups, x))).ctimeMs })));
    const latestBackup = backupFiles.sort((a, b) => b.ctime - a.ctime)[0]?.name;
    if (!latestBackup) {
        return null;
    }
    return path.join(userDirectories.backups, latestBackup);
}

export const router = express.Router();

router.post('/save', async function (request, response) {
    try {
        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        await writeFileAtomic(pathToSettings, JSON.stringify(request.body, null, 4), 'utf8');
        triggerAutoSave(request.user.profile.handle);
        response.send({ result: 'ok' });
    } catch (err) {
        console.error(err);
        response.send(err);
    }
});

// Wintermute's code
router.post('/get', async (request, response) => {
    let settings;
    try {
        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        settings = await fs.readFile(pathToSettings, 'utf8');
    } catch (e) {
        return response.sendStatus(500);
    }

    // NovelAI Settings
    const { fileContents: novelai_settings, fileNames: novelai_setting_names }
        = await readPresetsFromDirectory(request.user.directories.novelAI_Settings, {
            sortFunction: sortByName(request.user.directories.novelAI_Settings),
            removeFileExtension: true,
        });

    // OpenAI Settings
    const { fileContents: openai_settings, fileNames: openai_setting_names }
        = await readPresetsFromDirectory(request.user.directories.openAI_Settings, {
            sortFunction: sortByName(request.user.directories.openAI_Settings), removeFileExtension: true,
        });

    // TextGenerationWebUI Settings
    const { fileContents: textgenerationwebui_presets, fileNames: textgenerationwebui_preset_names }
        = await readPresetsFromDirectory(request.user.directories.textGen_Settings, {
            sortFunction: sortByName(request.user.directories.textGen_Settings), removeFileExtension: true,
        });

    //Kobold
    const { fileContents: koboldai_settings, fileNames: koboldai_setting_names }
        = await readPresetsFromDirectory(request.user.directories.koboldAI_Settings, {
            sortFunction: sortByName(request.user.directories.koboldAI_Settings), removeFileExtension: true,
        });

    const worldFiles = (await fs.readdir(request.user.directories.worlds))
        .filter(file => path.extname(file).toLowerCase() === '.json')
        .sort((a, b) => a.localeCompare(b));
    const world_names = worldFiles.map(item => path.parse(item).name);

    const themes = await readAndParseFromDirectory(request.user.directories.themes);
    const movingUIPresets = await readAndParseFromDirectory(request.user.directories.movingUI);
    const quickReplyPresets = await readAndParseFromDirectory(request.user.directories.quickreplies);

    const instruct = await readAndParseFromDirectory(request.user.directories.instruct);
    const context = await readAndParseFromDirectory(request.user.directories.context);
    const sysprompt = await readAndParseFromDirectory(request.user.directories.sysprompt);
    const reasoning = await readAndParseFromDirectory(request.user.directories.reasoning);

    ENABLE_EXTENSIONS = !!await getConfigValue('extensions.enabled', true, 'boolean');
    ENABLE_EXTENSIONS_AUTO_UPDATE = !!await getConfigValue('extensions.autoUpdate', true, 'boolean');
    ENABLE_ACCOUNTS = !!await getConfigValue('enableUserAccounts', false, 'boolean');
    response.send({
        settings,
        koboldai_settings,
        koboldai_setting_names,
        world_names,
        novelai_settings,
        novelai_setting_names,
        openai_settings,
        openai_setting_names,
        textgenerationwebui_presets,
        textgenerationwebui_preset_names,
        themes,
        movingUIPresets,
        quickReplyPresets,
        instruct,
        context,
        sysprompt,
        reasoning,
        enable_extensions: ENABLE_EXTENSIONS,
        enable_extensions_auto_update: ENABLE_EXTENSIONS_AUTO_UPDATE,
        enable_accounts: ENABLE_ACCOUNTS,
    });
});

router.post('/get-snapshots', async (request, response) => {
    try {
        const snapshots = await fs.readdir(request.user.directories.backups);
        const userFilesPattern = getFilePrefix(request.user.profile.handle);
        const userSnapshots = snapshots.filter(x => x.startsWith(userFilesPattern));

        const result = await Promise.all(userSnapshots.map(async x => {
            const stat = await fs.stat(path.join(request.user.directories.backups, x));
            return { date: stat.ctimeMs, name: x, size: stat.size };
        }));

        response.json(result);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/load-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const userFilesPattern = getFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        const snapshotPath = path.join(request.user.directories.backups, snapshotName);

        try {
            await fs.access(snapshotPath);
        } catch {
            return response.sendStatus(404);
        }

        const content = await fs.readFile(snapshotPath, 'utf8');

        response.send(content);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/make-snapshot', async (request, response) => {
    try {
        backupUserSettings(request.user.profile.handle, false);
        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

router.post('/restore-snapshot', getFileNameValidationFunction('name'), async (request, response) => {
    try {
        const userFilesPattern = getFilePrefix(request.user.profile.handle);

        if (!request.body.name || !request.body.name.startsWith(userFilesPattern)) {
            return response.status(400).send({ error: 'Invalid snapshot name' });
        }

        const snapshotName = request.body.name;
        const snapshotPath = path.join(request.user.directories.backups, snapshotName);

        try {
            await fs.access(snapshotPath);
        } catch {
            return response.sendStatus(404);
        }

        const pathToSettings = path.join(request.user.directories.root, SETTINGS_FILE);
        await fs.rm(pathToSettings, { force: true });
        await fs.copyFile(snapshotPath, pathToSettings);

        response.sendStatus(204);
    } catch (error) {
        console.error(error);
        response.sendStatus(500);
    }
});

/**
 * Initializes the settings endpoint
 */
export async function init() {
    await backupSettings();
}
