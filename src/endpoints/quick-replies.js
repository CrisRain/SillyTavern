import { promises as fs } from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';
import { default as writeFileAtomic } from 'write-file-atomic';

export const router = express.Router();

router.post('/save', async (request, response) => {
    if (!request.body || !request.body.name) {
        return response.sendStatus(400);
    }

    const filename = path.join(request.user.directories.quickreplies, sanitize(request.body.name) + '.json');
    await writeFileAtomic(filename, JSON.stringify(request.body, null, 4), 'utf8');

    return response.sendStatus(200);
});

router.post('/delete', async (request, response) => {
    if (!request.body || !request.body.name) {
        return response.sendStatus(400);
    }

    const filename = path.join(request.user.directories.quickreplies, sanitize(request.body.name) + '.json');
    try {
        await fs.access(filename);
        await fs.unlink(filename);
    } catch {
        // ignore
    }

    return response.sendStatus(200);
});
