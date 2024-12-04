const { app, BrowserWindow, ipcMain, shell, clipboard, Notification, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
const ffmpegStatic = require('ffmpeg-static');
const url = require('url');

app.name = 'Clipio';
app.setAppUserModelId('com.whoswhip.clipio');

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
            nodeIntegration: true,
        },
        icon: path.join(__dirname, 'build/icon-x16.png'),
    });
    win.setMenuBarVisibility(false);
    win.loadFile('web/index.html');
    autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
    app.quit();
});

Object.defineProperty(app, 'isPackaged', {
    get() {
        return true;
    }
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

autoUpdater.on('update-available', () => {
    win.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail: 'A new version has been downloaded. Restart the application to apply the updates.'
    };

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });
});

autoUpdater.on('error', (message) => {
    console.error('There was a problem updating the application');
    console.error(message);
});

ipcMain.on('update-app', () => {
    autoUpdater.quitAndInstall();
});


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
        const [configContent, clipContent] = await Promise.all([
            fs.promises.readFile(configPath, 'utf-8'),
            fs.promises.readFile(clipDatabasePath, 'utf-8').catch(() => '[]')
        ]);
        const configData = JSON.parse(configContent);
        let clipData = JSON.parse(clipContent);

        clipData = (await Promise.all(
            clipData.map(clip =>
                fs.promises.access(clip.file).then(() => clip).catch(() => null)
            )
        )).filter(Boolean);

        const paths = ['medalPath', 'shadowplayPath', 'reLivePath', 'obsPath']
            .map(key => ({ path: configData[key], service: key.replace('Path', '').toLowerCase() }))
            .filter(({ path }) => path);

        const allFiles = await Promise.all(
            paths.map(async ({ path, service }) => {
                const extensions = service === 'obs' ? _videoExtensions : ['.mp4'];
                const files = scanFolder(path, extensions, service !== 'obs');
                return files
                    .filter(file => !clipData.some(clip => clip.file === file))
                    .map(file => ({ file, service }));
            })
        );

        const newFiles = (await Promise.all(
            allFiles.flat().map(async ({ file, service }) => {
                if (await hasVideoStream(file)) {
                    const [thumbnail, stats] = await Promise.all([
                        generateThumbnail(file),
                        fs.promises.stat(file)
                    ]);
                    const game = path.basename(path.dirname(file));
                    const date = new Date(stats.birthtime).toISOString();
                    return { file, thumbnail, game, date, service };
                }
                return null;
            })
        )).filter(Boolean);

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
            clipData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } else if (sort === 'Oldest') {
            clipData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
        uniqueGames.sort();
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

ipcMain.on('delete-clip', (event, filePath) => {
    try {
        if (filePath.startsWith('file:')) {
            filePath = url.fileURLToPath(filePath);
        }
        console.log("Deleting clip:", filePath);

        fs.unlinkSync(filePath);
        let clipdata = JSON.parse(fs.readFileSync(clipDatabasePath, 'utf-8'));
        let thumbnailPath = path.join(thumbnailCachePath, path.basename(filePath, path.extname(filePath)) + '.jpg');
        clipdata = clipdata.filter(clip => clip.file !== filePath);
        fs.writeFileSync(clipDatabasePath, JSON.stringify(clipdata, null, 2));
        if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
        }

        event.reply('delete-clip-success', 'Clip deleted successfully!');
    } catch (error) {
        console.error("Error deleting clip:", error);
        event.reply('delete-clip-error', `Error deleting clip: ${error.message}`);
    }
});