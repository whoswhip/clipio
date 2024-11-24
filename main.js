const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
const ffmpegStatic = require('ffmpeg-static');

const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : ffmpegStatic;

const ffprobePath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffprobe.exe')
    : ffprobeStatic.path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

let win;
let _videoExtensions = ['.mp4', '.mkv', '.webm', '.mov', '.flv', '.m4v', '.ts',];

app.on('ready', () => {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        minHeight: 600,
        minWidth: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
        },
        icon: path.join(__dirname, 'build/icon-x16.png'),
    });
    win.setMenuBarVisibility(false);
    win.loadFile('web/index.html');
    //checkForUpdate();
});

const configPath = path.join(app.getPath('userData'), 'config.json');
const clipDatabasePath = path.join(app.getPath('userData'), 'clips.json');
const thumbnailCachePath = path.join(app.getPath('userData'), 'thumbnails');

if (!fs.existsSync(thumbnailCachePath)) {
    fs.mkdirSync(thumbnailCachePath);
}
if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, '{}');
}
if (!fs.existsSync(clipDatabasePath)) {
    fs.writeFileSync(clipDatabasePath, '[]');
}


// function checkForUpdate(){
//     const baseurl = 'https://clipio.whoswhip.top';
//     const { net } = require('electron');
//     const request = net.request(`${baseurl}/version.txt`);
//     request.on('response', (response) => {
//         response.on('data', (chunk) => {
//             const latestVersion = chunk.toString();
//             if (latestVersion !== app.getVersion()) {
//                 win.webContents.send('update-available', latestVersion);
//             }
//         });
//     });
// }
// function updateApp(){
//     const baseurl = 'https://clipio.whoswhip.top';
//     const { net } = require('electron');
//     const request = net.request(`${baseurl}/download`);
//     request.on('response', (response) => {
//         const filePath = path.join(app.getPath('downloads'), 'clipio-setup.exe');
//         const fileStream = fs.createWriteStream(filePath);
//         response.pipe(fileStream);
//         response.on('end', () => {
//             shell.openPath(filePath);
//         });
//     });
//     request.end();
// }


function scanFolder(folderPath, extensions, recursive = true) {
    let results = [];
    const items = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(folderPath, item.name);
        if (item.isDirectory() && recursive) {
            results = results.concat(scanFolder(fullPath, extensions));
        } else if (item.isFile()) {
            if (Array.isArray(extensions)) {
                if (extensions.some(ext => item.name.endsWith(ext))) {
                    results.push(fullPath);
                }
            } else if (item.name.endsWith(extensions)) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

function hasVideoStream(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.warn(`Warning: Could not probe file ${filePath}:`, err.message);
                resolve(false);
                return;
            }
            const hasVideo = metadata.streams.some(stream => stream.codec_type === 'video');
            resolve(hasVideo);
        });
    });
}

function generateThumbnail(filePath) {
    const thumbnailPath = path.join(thumbnailCachePath, `${path.basename(filePath, path.extname(filePath))}.jpg`);
    if (fs.existsSync(thumbnailPath)) {
        return Promise.resolve(thumbnailPath);
    }
    return new Promise((resolve) => {
        ffmpeg(filePath)
            .screenshots({
                count: 1,
                folder: thumbnailCachePath,
                filename: `${path.basename(filePath, path.extname(filePath))}.jpg`,
                size: '640x360',
            })
            .on('end', () => resolve(thumbnailPath))
            .on('error', (err) => {
                console.warn(`Warning: Could not generate thumbnail for ${filePath}:`, err.message);
                resolve(null);
            });
    });
}


async function updateClipDatabase(folderPath, service) {
    if (!fs.existsSync(folderPath)) {
        return [];
    }
    if (service === 'obs') {
        const files = scanFolder(folderPath, _videoExtensions, false);
        const clipData = [];
        for (const file of files) {
            const hasVideo = await hasVideoStream(file);
            if (hasVideo) {
                const thumbnail = await generateThumbnail(file);
                const game = path.basename(path.dirname(file));
                const date = new Date(fs.statSync(file).birthtime).toLocaleString();
                clipData.push({ file, thumbnail, game, date, service });
            }
        }
        fs.writeFileSync(clipDatabasePath, JSON.stringify(clipData, null, 2));
        return clipData;
    }
    const files = scanFolder(folderPath, '.mp4');
    const clipData = [];

    for (const file of files) {
        const hasVideo = await hasVideoStream(file);
        if (hasVideo) {
            const thumbnail = await generateThumbnail(file);
            const game = path.basename(path.dirname(file));
            const date = new Date(fs.statSync(file).birthtime).toLocaleString();
            clipData.push({ file, thumbnail, game, date, service });
        }
    }

    fs.writeFileSync(clipDatabasePath, JSON.stringify(clipData, null, 2));
    return clipData;
}
async function scanForNew() {
    try {
        const configData = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
        let clipData = [];
        if (await fs.promises.stat(clipDatabasePath).catch(() => false)) {
            const _data = await fs.promises.readFile(clipDatabasePath, 'utf-8');
            if (_data) {
                clipData = JSON.parse(_data);
            }
        }

        clipData.filter(clip => !fs.existsSync(clip.file));

        const paths = [
            { path: configData.medalPath, service: 'medal' },
            { path: configData.shadowplayPath, service: 'shadowplay' },
            { path: configData.reLivePath, service: 'reLive' },
            { path: configData.obsPath, service: 'obs' }
        ].filter(({ path }) => path);

        const allFiles = await Promise.all(
            paths.map(async ({ path, service }) => {
                if (service === 'obs') {
                    const files = scanFolder(path, _videoExtensions, false);
                    return files
                        .filter(file => !clipData.some(clip => clip.file === file))
                        .map(file => ({ file, service }));
                }
                const files = scanFolder(path, '.mp4');
                return files
                    .filter(file => !clipData.some(clip => clip.file === file))
                    .map(file => ({ file, service }));
            })
        );

        const newFiles = (
            await Promise.all(
                allFiles.flat().map(async ({ file, service }) => {
                    const hasVideo = await hasVideoStream(file);
                    if (hasVideo) {
                        const thumbnail = await generateThumbnail(file);
                        const game = path.basename(path.dirname(file));
                        const date = new Date((await fs.promises.stat(file)).birthtime).toLocaleString();
                        return { file, thumbnail, game, date, service };
                    }
                    return null;
                })
            )
        ).filter(Boolean);

        if (newFiles.length > 0) {
            clipData.push(...newFiles);
            await fs.promises.writeFile(clipDatabasePath, JSON.stringify(clipData, null, 2));
        }
    } catch (error) {
        console.error("Error scanning for new files:", error);
    }
}

ipcMain.on('scan-files', async (event, { start, count, sort, gamefilter }) => {
    try {
        const configData = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
        let clipData = await getOrInitializeClipData(configData);
        const originalData = clipData;

        if (sort === 'Newest') {
            clipData.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
        } else if (sort === 'Oldest') {
            clipData.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        } else if (['Shadowplay', 'Medal', 'ReLive', 'OBS'].includes(sort)) {
            console.log('sort:', sort);
            clipData = await filterByService(clipData, sort.toLowerCase(), configData);
        }

        if (gamefilter !== 'All') {
            clipData = clipData.filter(clip => clip.game === gamefilter);
        }


        const totalClips = clipData.length;
        const paginatedFiles = await processThumbnails(clipData.slice(start, start + count));
        for (const file of paginatedFiles) {
            if (!fs.existsSync(file.file)) {
                originalData.splice(originalData.findIndex(clip => clip.file === file.file), 1);
            }
        }

        await fs.promises.writeFile(clipDatabasePath, JSON.stringify(originalData, null, 2));

        event.reply('scan-files-success', { files: paginatedFiles, totalClips });
    } catch (error) {
        console.error("Error scanning files:", error);
        event.reply('scan-files-error', `Error scanning files: ${error.message}`);
    }
});

async function getOrInitializeClipData(configData) {
    try {
        if (await fs.promises.stat(clipDatabasePath).catch(() => false)) {
            const clipData = JSON.parse(await fs.promises.readFile(clipDatabasePath, 'utf-8'));
            if (clipData.length > 0) return clipData;
        }
        return await initializeClipData(configData);
    } catch {
        return await initializeClipData(configData);
    }
}

async function initializeClipData(configData) {
    const services = [
        { path: configData.medalPath, service: 'medal' },
        { path: configData.shadowplayPath, service: 'shadowplay' },
        { path: configData.reLivePath, service: 'reLive' },
        { path: configData.obsPath, service: 'obs' }
    ].filter(({ path }) => path);

    const clipData = (
        await Promise.all(
            services.map(({ path, service }) => updateClipDatabase(path, service))
        )
    ).flat();

    if (clipData.length === 0) {
        throw new Error('No clips found in the specified directories');
    }

    await fs.promises.writeFile(clipDatabasePath, JSON.stringify(clipData, null, 2));
    return clipData;
}

async function filterByService(clipData, service, configData) {
    let filteredData = clipData.filter(clip => clip.service.toLowerCase() === service);
    if (filteredData.length === 0) {
        const path = configData[`${service}Path`];
        const newData = await updateClipDatabase(path, service);
        filteredData = [...filteredData, ...newData];
        if (filteredData.length === 0) {
            throw new Error(`No clips found for ${service}`);
        }
        await fs.promises.writeFile(clipDatabasePath, JSON.stringify([...clipData, ...newData], null, 2));
    }
    return filteredData;
}

async function processThumbnails(files) {
    return Promise.all(
        files.map(async file => {
            if (!file.thumbnail) {
                file.thumbnail = await generateThumbnail(file.file);
                return file;
            }
            const thumbnailPath = path.join(thumbnailCachePath, path.basename(file.thumbnail));
            if (!(await fs.promises.stat(thumbnailPath).catch(() => false))) {
                file.thumbnail = await generateThumbnail(file.file);
            } else {
                file.thumbnail = thumbnailPath;
            }
            return file;
        })
    );
}


ipcMain.on('search', (event, query) => {
    try {
        const clipData = JSON.parse(fs.readFileSync(clipDatabasePath, 'utf-8'));
        const results = clipData.filter(clip => clip.game.toLowerCase().includes(query.toLowerCase()));
        event.reply('search-success', { files: results });
    } catch (error) {
        event.reply('search-error', `Error searching files: ${error.message}`);
    }
});
ipcMain.on('update-clip-path', async (event, { service, path }) => {
    try {
        let configData = {};
        if (fs.existsSync(configPath)) {
            const configFileContent = fs.readFileSync(configPath, 'utf-8');
            if (configFileContent) {
                configData = JSON.parse(configFileContent);
            }
        }
        configData[`${service}Path`] = path;
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
        event.reply('update-clip-path-success', 'Clip path updated successfully!');
    } catch (error) {
        console.error("Error updating clip path:", error);
        event.reply('update-clip-path-error', `Error updating clip path: ${error.message}`);
    }
});
ipcMain.on('get-clip-path', async (event) => {
    try {
        let configData = {};
        if (fs.existsSync(configPath)) {
            const configFileContent = fs.readFileSync(configPath, 'utf-8');
            if (configFileContent) {
                configData = JSON.parse(configFileContent);
            }
        }
        event.reply('get-clip-path', configData);
    } catch (error) {
        console.error("Error getting clip path:", error);
        event.reply('get-clip-path', { error: `Error getting clip path: ${error.message}` });
    }
});
ipcMain.on('scan-for-new', async (event) => {
    try {
        await scanForNew();
        event.reply('scan-for-new-success', 'Scan for new files completed successfully!');
    } catch (error) {
        console.error("Error scanning for new files:", error);
        event.reply('scan-for-new-error', `Error scanning for new files: ${error.message}`);
    }
});
ipcMain.on('get-games', async (event) => {
    try {
        const clipData = JSON.parse(fs.readFileSync(clipDatabasePath, 'utf-8'));
        const games = clipData.map(clip => clip.game);
        const uniqueGames = [...new Set(games)];
        event.reply('get-games-success', uniqueGames);
    } catch (error) {
        event.reply('get-games-error', `Error getting games: ${error.message}`);
    }
});
ipcMain.on('open-file-location', (event, filePath) => {
    if (filePath) {
        shell.showItemInFolder(filePath);
    } else {
        console.error("open-file-location event received with null filePath");
    }
});

ipcMain.on('copy-to-clipboard', (event, text) => {
    if (text) {
        clipboard.writeText(text);
    } else {
        console.error("copy-to-clipboard event received with null text");
    }
});
ipcMain.on('open-external', (event, url) => {
    if (url) {
        shell.openExternal(url);
    } else {
        console.error("open-external event received with null url");
    }
});
ipcMain.on('open-clip', (event, filePath) => {
    if (filePath) {
        shell.openPath(filePath);
    } else {
        console.error("open-clip event received with null filePath");
    }
});
ipcMain.on('open-data-folder', (event) => {
    shell.openPath(app.getPath('userData'));
});
ipcMain.on('get-appinfo', (event) => {
    event.reply('get-appinfo', {
        version: app.getVersion(),
        name: app.getName(),
    });
});