import path from 'node:path';
import { promises as fs } from 'node:fs';

import express from 'express';
import sanitize from 'sanitize-filename';
import { Jimp, JimpMime } from '../jimp.js';
import { default as writeFileAtomic } from 'write-file-atomic';

import { AVATAR_WIDTH, AVATAR_HEIGHT } from '../constants.js';
import { getImages, tryParse } from '../util.js';
import { getFileNameValidationFunction } from '../middleware/validateFileName.js';

export const router = express.Router();

router.post('/get', async function (request, response) {
    var images = await getImages(request.user.directories.avatars);
    response.send(JSON.stringify(images));
});

router.post('/delete', getFileNameValidationFunction('avatar'), async function (request, response) {
    if (!request.body) return response.sendStatus(400);

    if (request.body.avatar !== sanitize(request.body.avatar)) {
        console.error('Malicious avatar name prevented');
        return response.sendStatus(403);
    }

    const fileName = path.join(request.user.directories.avatars, sanitize(request.body.avatar));

    try {
        await fs.access(fileName);
        await fs.unlink(fileName);
        return response.send({ result: 'ok' });
    } catch {
        return response.sendStatus(404);
    }
});

router.post('/upload', async (request, response) => {
    if (!request.file) return response.sendStatus(400);

    try {
        const pathToUpload = path.join(request.file.destination, request.file.filename);
        const crop = tryParse(request.query.crop);
        const rawImg = await Jimp.read(pathToUpload);

        if (typeof crop == 'object' && [crop.x, crop.y, crop.width, crop.height].every(x => typeof x === 'number')) {
            rawImg.crop({ w: crop.width, h: crop.height, x: crop.x, y: crop.y });
        }

        rawImg.cover({ w: AVATAR_WIDTH, h: AVATAR_HEIGHT });
        const image = await rawImg.getBuffer(JimpMime.png);

        const filename = request.body.overwrite_name || `${Date.now()}.png`;
        const pathToNewFile = path.join(request.user.directories.avatars, filename);
        await writeFileAtomic(pathToNewFile, image);
        await fs.unlink(pathToUpload);
        return response.send({ path: filename });
    } catch (err) {
        return response.status(400).send('Is not a valid image');
    }
});
