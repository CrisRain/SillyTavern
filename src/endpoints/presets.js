import { promises as fs } from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';
import { default as writeFileAtomic } from 'write-file-atomic';

import { getDefaultPresetFile, getDefaultPresets } from './content-manager.js';

/**
 * Gets the folder and extension for the preset settings based on the API source ID.
 * @param {string} apiId API source ID
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {object} Object containing the folder and extension for the preset settings
 */
function getPresetSettingsByAPI(apiId, directories) {
    switch (apiId) {
        case 'kobold':
        case 'koboldhorde':
            return { folder: directories.koboldAI_Settings, extension: '.json' };
        case 'novel':
            return { folder: directories.novelAI_Settings, extension: '.json' };
        case 'textgenerationwebui':
            return { folder: directories.textGen_Settings, extension: '.json' };
        case 'openai':
            return { folder: directories.openAI_Settings, extension: '.json' };
        case 'instruct':
            return { folder: directories.instruct, extension: '.json' };
        case 'context':
            return { folder: directories.context, extension: '.json' };
        case 'sysprompt':
            return { folder: directories.sysprompt, extension: '.json' };
        case 'reasoning':
            return { folder: directories.reasoning, extension: '.json' };
        default:
            return { folder: null, extension: null };
    }
}

export const router = express.Router();

router.post('/save', async function (request, response) {
    const name = sanitize(request.body.name);
    if (!request.body.preset || !name) {
        return response.sendStatus(400);
    }

    const settings = getPresetSettingsByAPI(request.body.apiId, request.user.directories);
    const filename = name + settings.extension;

    if (!settings.folder) {
        return response.sendStatus(400);
    }

    const fullpath = path.join(settings.folder, filename);
    await writeFileAtomic(fullpath, JSON.stringify(request.body.preset, null, 4), 'utf-8');
    return response.send({ name });
});

router.post('/delete', async function (request, response) {
    const name = sanitize(request.body.name);
    if (!name) {
        return response.sendStatus(400);
    }

    const settings = getPresetSettingsByAPI(request.body.apiId, request.user.directories);
    const filename = name + settings.extension;

    if (!settings.folder) {
        return response.sendStatus(400);
    }

    const fullpath = path.join(settings.folder, filename);

    try {
        await fs.access(fullpath);
        await fs.unlink(fullpath);
        return response.sendStatus(200);
    } catch {
        return response.sendStatus(404);
    }
});

router.post('/restore', async function (request, response) {
    try {
        const settings = getPresetSettingsByAPI(request.body.apiId, request.user.directories);
        const name = sanitize(request.body.name);
        const defaultPresets = await getDefaultPresets(request.user.directories);

        const defaultPreset = defaultPresets.find(p => p.name === name && p.folder === settings.folder);

        const result = { isDefault: false, preset: {} };

        if (defaultPreset) {
            result.isDefault = true;
            result.preset = await getDefaultPresetFile(defaultPreset.filename) || {};
        }

        return response.send(result);
    } catch (error) {
        console.error(error);
        return response.sendStatus(500);
    }
});

// TODO: Merge with /api/presets/save
router.post('/save-openai', async function (request, response) {
    if (!request.body || typeof request.query.name !== 'string') return response.sendStatus(400);
    const name = sanitize(request.query.name);
    if (!name) return response.sendStatus(400);

    const filename = `${name}.json`;
    const fullpath = path.join(request.user.directories.openAI_Settings, filename);
    await writeFileAtomic(fullpath, JSON.stringify(request.body, null, 4), 'utf-8');
    return response.send({ name });
});

// TODO: Merge with /api/presets/delete
router.post('/delete-openai', async function (request, response) {
    if (!request.body || !request.body.name) {
        return response.sendStatus(400);
    }

    const name = request.body.name;
    const pathToFile = path.join(request.user.directories.openAI_Settings, `${name}.json`);

    try {
        await fs.access(pathToFile);
        await fs.unlink(pathToFile);
        return response.send({ ok: true });
    } catch {
        return response.send({ error: true });
    }
});
