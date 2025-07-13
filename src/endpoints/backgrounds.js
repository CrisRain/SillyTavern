// @ts-nocheck
import { promises as fs } from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';

import { invalidateThumbnail } from './thumbnails.js';
import { getImages } from '../util.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';

export const router = express.Router();

router.post('/all', async function (request, response) {
    var images = await getImages(request.user.directories.backgrounds);
    response.send(JSON.stringify(images));
});

router.post('/delete', getFileNameValidationFunction('bg'), async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    if (request.body.bg !== sanitize(request.body.bg)) {
        console.error('Malicious bg name prevented');
        return response.sendStatus(403);
    }

    const fileName = path.join(request.user.directories.backgrounds, sanitize(request.body.bg));

    try {
        await fs.access(fileName);
    } catch {
        console.error('BG file not found');
        return response.sendStatus(400);
    }

    await fs.unlink(fileName);
    invalidateThumbnail(request.user.directories, 'bg', request.body.bg);
    return response.send('ok');
});

router.post('/rename', async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    const oldFileName = path.join(request.user.directories.backgrounds, sanitize(request.body.old_bg));
    const newFileName = path.join(request.user.directories.backgrounds, sanitize(request.body.new_bg));

    try {
        await fs.access(oldFileName);
    } catch {
        console.error('BG file not found');
        return response.sendStatus(400);
    }

    try {
        await fs.access(newFileName);
        console.error('New BG file already exists');
        return response.sendStatus(400);
    } catch {
        // ignore
    }

    await fs.copyFile(oldFileName, newFileName);
    await fs.unlink(oldFileName);
    invalidateThumbnail(request.user.directories, 'bg', request.body.old_bg);
    return response.send('ok');
});

router.post('/upload', async function (request, response) {
    if (!request.body || !request.file) return response.sendStatus(400);

    const img_path = path.join(request.file.destination, request.file.filename);
    const filename = request.file.originalname;

    try {
        await fs.copyFile(img_path, path.join(request.user.directories.backgrounds, filename));
        await fs.unlink(img_path);
        invalidateThumbnail(request.user.directories, 'bg', filename);
        response.send(filename);
    } catch (err) {
        console.error(err);
        response.sendStatus(500);
    }
});
