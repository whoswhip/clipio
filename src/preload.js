const { contextBridge, ipcRenderer } = require('electron');
ipcRenderer.setMaxListeners(20);

contextBridge.exposeInMainWorld('electron', {
    scanFiles: (params) => ipcRenderer.send('scan-files', params),
    onScanFilesSuccess: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('scan-files-success', listener);
        };
        ipcRenderer.on('scan-files-success', listener);
    },
    onScanFilesError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('scan-files-error', listener);
        };
        ipcRenderer.on('scan-files-error', listener);
    },
    scanForNewFiles: () => ipcRenderer.send('scan-for-new'),
    onScanForNewFilesSuccess: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('scan-for-new-success', listener);
        };
        ipcRenderer.on('scan-for-new-success', listener);
    },
    onScanForNewFilesError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('scan-for-new-error', listener);
        };
        ipcRenderer.on('scan-for-new-error', listener);
    },
    getGames: () => ipcRenderer.send('get-games'),
    onGetGamesSuccess: (callback) => {
        const listener = (event, games) => {
            callback(games);
            ipcRenderer.removeListener('get-games-success', listener);
        };
        ipcRenderer.on('get-games-success', listener);
    },
    onGetGamesError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('get-games-error', listener);
        };
        ipcRenderer.on('get-games-error', listener);
    },
    openFileLocation: (filePath) => ipcRenderer.send('open-file-location', filePath),
    copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),
    getClipPath: () => ipcRenderer.send('get-clip-path'),
    onGetClipPathSuccess: (callback) => {
        const listener = (event, path) => {
            callback(path);
            ipcRenderer.removeListener('get-clip-path-success', listener);
        };
        ipcRenderer.on('get-clip-path-success', listener);
    },
    onGetClipPathError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('get-clip-path-error', listener);
        };
        ipcRenderer.on('get-clip-path-error', listener);
    },
    updateClipPath: (service, path) => ipcRenderer.send('update-clip-path', { service, path }),
    onUpdateClipPathSuccess: (callback) => {
        const listener = (event, path) => {
            callback(path);
            ipcRenderer.removeListener('update-clip-path-success', listener);
        };
        ipcRenderer.on('update-clip-path-success', listener);
    },
    onUpdateClipPathError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('update-clip-path-error', listener);
        };
        ipcRenderer.on('update-clip-path-error', listener);
    },
    openClip: (service) => ipcRenderer.send('open-clip', service),
    openDataFolder: () => ipcRenderer.send('open-data-folder'),
    getAppInfo: () => ipcRenderer.send('get-appinfo'),
    onGetAppInfo: (callback) => {
        const listener = (event, data) => {
            callback(data);
            ipcRenderer.removeListener('get-appinfo', listener);
        };
        ipcRenderer.on('get-appinfo', listener);
    },
    search: (query) => ipcRenderer.send('search', query),
    onSearchSuccess: (callback) => {
        const listener = (event, data) => {
            callback(data);
            ipcRenderer.removeListener('search-success', listener);
        };
        ipcRenderer.on('search-success', listener);
    },
    onSearchError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('search-error', listener);
        };
        ipcRenderer.on('search-error', listener);
    },
    updateApp: () => ipcRenderer.send('update-app'),
    onUpdateAvailable: (callback) => {
        const listener = (event) => {
            callback();
            ipcRenderer.removeListener('update-available', listener);
        };
        ipcRenderer.on('update-available', listener);
    },
    openUrl: (url) => ipcRenderer.send('open-external', url),
    deleteClip: (service) => ipcRenderer.send('delete-clip', service),
    onDeleteClipSuccess: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('delete-clip-success', listener);
        };
        ipcRenderer.on('delete-clip-success', listener);
    },
    onDeleteClipError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('delete-clip-error', listener);
        };
        ipcRenderer.on('delete-clip-error', listener);
    },
    copyClip: (service) => ipcRenderer.send('copy-clip-to-clipboard', service),
    onCopyClipSuccess: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('copy-clip-to-clipboard-success', listener);
        };
        ipcRenderer.on('copy-clip-to-clipboard-success', listener);
    },
    onCopyClipError: (callback) => {
        const listener = (event, message) => {
            callback(message);
            ipcRenderer.removeListener('copy-clip-to-clipboard-error', listener);
        };
        ipcRenderer.on('copy-clip-to-clipboard-error', listener);
    },
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
    removeEveryListenerOnEveryChannel: () => ipcRenderer.removeAllListeners(),
});