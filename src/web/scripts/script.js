let start = 0;
let isScanning = false;
let totalClips = 1;
let videos = [];
let gamefilter = 'All';
let searchTimeout;
let resizeTimeout;
let observer;

function calculateClipDimensions() {
    const tempClip = document.createElement('div');
    tempClip.className = 'clip';
    tempClip.style.display = 'inline-block';
    tempClip.style.width = '200px';
    tempClip.style.height = '150px';

    document.body.appendChild(tempClip);
    const computedStyle = window.getComputedStyle(tempClip);

    const clipWidth = parseFloat(computedStyle.width);
    const clipMargin = parseFloat(computedStyle.marginLeft) + parseFloat(computedStyle.marginRight);
    const totalWidth = clipWidth + clipMargin;

    const clipHeight = parseFloat(computedStyle.height);

    document.body.removeChild(tempClip);

    return { clipWidth: totalWidth, clipHeight };
}

function calculateCount() {
    const { clipWidth, clipHeight } = calculateClipDimensions();
    const clipsContainer = document.getElementsByClassName('clips')[0];
    const containerStyle = window.getComputedStyle(clipsContainer);
    const containerWidth = clipsContainer.clientWidth - parseFloat(containerStyle.paddingLeft) - parseFloat(containerStyle.paddingRight);
    const containerHeight = clipsContainer.clientHeight - parseFloat(containerStyle.paddingTop) - parseFloat(containerStyle.paddingBottom);

    const clipsPerRow = Math.max(1, Math.floor(containerWidth / clipWidth));
    const rowsPerPage = Math.max(1, Math.ceil(containerHeight / clipHeight) + 1);

    return clipsPerRow * rowsPerPage;
}

async function loadClips() {
    if (isScanning || start >= totalClips) {
        console.log('Already scanning or no more clips to load');
        console.log('Start:', start, 'Total:', totalClips);
        return;
    }

    isScanning = true;
    console.log('Loading clips');
    const clipsContainer = document.getElementsByClassName('clips')[0];
    const count = calculateCount();
    const sort = document.getElementById('sort-select').value;
    window.electron.scanFiles({ start, count, sort, gamefilter });
    getGames();

    const onScanFilesSuccess = ({ files, totalClips: total }) => {
        if (!files || files.length === 0) {
            console.error('No files received');
            isScanning = false;
            return;
        }
        totalClips = total;
        const fragment = document.createDocumentFragment();
        files.forEach(({ file, thumbnail, game, date, service }) => {
            if (videos.find(video => video.getAttribute('data-src') === file)) {
                return;
            }
            const clipContainer = document.createElement('div');
            clipContainer.classList.add('clip-container');

            const localdate = new Date(date).toLocaleDateString();

            const clip = document.createElement('video');
            clip.classList.add('clip');
            clip.setAttribute('data-src', file);
            clip.setAttribute('preload', 'none');
            clip.setAttribute('poster', thumbnail);
            clip.setAttribute('title', `${game} - ${localdate}`);
            clip.setAttribute('data-game', game);
            clip.setAttribute('data-date', date);
            clip.setAttribute('data-service', service);

            let overlayIcon;
            if (service === 'medal') {
                const template = document.getElementById('medal-svg-template');
                overlayIcon = template.content.cloneNode(true).querySelector('svg');
                overlayIcon.classList.add('overlay-icon');
            }
            else if (service === 'obs') {
                const template = document.getElementById('obs-svg-template');
                overlayIcon = template.content.cloneNode(true).querySelector('svg');
                overlayIcon.classList.add('overlay-icon');
            }
            else {
                const overlayIconService = service === 'shadowplay' ? 'bi-nvidia' : 'bi-amd';
                overlayIcon = document.createElement('i');
                overlayIcon.classList.add('bi', overlayIconService, 'overlay-icon');
            }

            clipContainer.appendChild(clip);
            clipContainer.appendChild(overlayIcon);
            fragment.appendChild(clipContainer);
            videos.push(clip);

            const modal = document.querySelector('.modal');
            const modalVideo = document.getElementById('modalVideo');
            clip.addEventListener('click', () => {
                modal.style.display = 'flex';
                modalVideo.src = clip.src;
                modalVideo.play();
            });

            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                    modalVideo.pause();
                }
            });
        });
        clipsContainer.appendChild(fragment);
        start = videos.length;
        observeClips();

        isScanning = false;
        window.electron.removeListener('scan-files-success', onScanFilesSuccess);
    };

    const onScanFilesError = (message) => {
        console.error('Error loading clips:', message);
        isScanning = false;
        window.electron.removeListener('scan-files-error', onScanFilesError);
    };

    window.electron.onScanFilesSuccess(onScanFilesSuccess);
    window.electron.onScanFilesError(onScanFilesError);
}

function handleScroll() {
    const clipsContainer = document.getElementsByClassName('clips')[0];
    if (clipsContainer.scrollTop + clipsContainer.clientHeight + 15 >= clipsContainer.scrollHeight && !isScanning) {
        loadClips();
    }
}

window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const clipsContainer = document.querySelector('.clips');
        const scrollTop = clipsContainer.scrollTop;
        const visibleclips = document.querySelectorAll('.clip');
        const numberOfClips = visibleclips.length;
        const { clipWidth, clipHeight } = calculateClipDimensions();
        const containerStyle = window.getComputedStyle(clipsContainer);
        const containerWidth = clipsContainer.clientWidth - parseFloat(containerStyle.paddingLeft) - parseFloat(containerStyle.paddingRight);
        const containerHeight = clipsContainer.clientHeight - parseFloat(containerStyle.paddingTop) - parseFloat(containerStyle.paddingBottom);
        const clipsPerRow = Math.max(1, Math.floor(containerWidth / clipWidth));

        if (numberOfClips + clipsPerRow > start) {
            loadClips();
        }
    }, 250);
});

function observeClips() {
    const clips = document.querySelectorAll('.clip');
    if (observer) {
        observer.disconnect();
    }
    observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            const clip = entry.target;
            const dataSrc = clip.getAttribute('data-src');

            if (!videos.includes(clip)) {
                return;
            }

            if (entry.isIntersecting) {
                if (dataSrc) {
                    clip.src = dataSrc;
                    clip.setAttribute('data-filepath', dataSrc);
                    clip.removeAttribute('data-src');
                }
            } else {
                if (!dataSrc) {
                    clip.setAttribute('data-src', clip.src);
                    clip.removeAttribute('src');
                }
            }
        });
    }, {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    });

    clips.forEach(clip => {
        observer.observe(clip);
        clip.addEventListener('contextmenu', (event) => {
            const filepath = clip.getAttribute('data-filepath') || clip.getAttribute('data-src');
            handleContextMenu(event, filepath);
        });
    });
}

document.addEventListener('click', () => {
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    scanForNewClips();
    const clipsContainer = document.getElementsByClassName('clips')[0];
    clipsContainer.addEventListener('scroll', handleScroll);
});

document.getElementById('search').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const search = document.getElementById('search').value;

        start = 0;
        totalClips = 1;
        videos = [];
        document.querySelector('.clips').innerHTML = '';
        if (search === '') {
            loadClips();
            return;
        }
        window.electron.search(search);

        window.electron.onSearchSuccess((results) => {
            const clips = document.querySelector('.clips');
            const fragment = document.createDocumentFragment();
            results.files.forEach(({ file, thumbnail, game, date, service }) => {
                console.log('Adding clip:', file);
                const clipContainer = document.createElement('div');
                clipContainer.classList.add('clip-container');

                const clip = document.createElement('video');
                clip.classList.add('clip');
                clip.setAttribute('data-src', file);
                clip.setAttribute('preload', 'none');
                clip.setAttribute('poster', thumbnail);
                clip.setAttribute('title', `${game} - ${date}`);
                clip.setAttribute('data-game', game);
                clip.setAttribute('data-date', date);
                clip.setAttribute('data-service', service);

                let overlayIcon;
                if (service === 'medal') {
                    const template = document.getElementById('medal-svg-template');
                    overlayIcon = template.content.cloneNode(true).querySelector('svg');
                    overlayIcon.classList.add('overlay-icon');
                }
                else {
                    const overlayIconService = service === 'shadowplay' ? 'bi-nvidia' : 'bi-amd';
                    overlayIcon = document.createElement('i');
                    overlayIcon.classList.add('bi', overlayIconService, 'overlay-icon');
                }

                clipContainer.appendChild(clip);
                clipContainer.appendChild(overlayIcon);
                fragment.appendChild(clipContainer);
                videos.push(clip);

                const modal = document.querySelector('.modal');
                const modalVideo = document.getElementById('modalVideo');
                clip.addEventListener('click', () => {
                    modal.style.display = 'flex';
                    modalVideo.src = clip.src;
                    modalVideo.play();
                });

                modal.addEventListener('click', (event) => {
                    if (event.target === modal) {
                        modal.style.display = 'none';
                        modalVideo.pause();
                    }
                    else if (event.target === modalVideo) {
                        if (modalVideo.paused) {
                            modalVideo.play();
                        }
                        else {
                            modalVideo.pause();
                        }
                    }
                });
            });
            clips.appendChild(fragment);
            observeClips();
        });

        window.electron.onSearchError((message) => {
            console.error('Search error:', message);
        });

    }, 500);
});

function scanForNewClips() {
    const clips = document.querySelector('.clips');
    getGames();

    window.electron.scanForNewFiles();
    clips.innerHTML = '';
    addSpinner();
    const onScanForNewSuccess = () => {
        start = 0;
        totalClips = 1;
        videos = [];
        document.querySelector('.clips').innerHTML = '';
        loadClips();
        window.electron.removeListener('scan-for-new-success', onScanForNewSuccess);
    };
    const onScanForNewError = (message) => {
        console.error(message);
        window.electron.removeListener('scan-for-new-error', onScanForNewError);
    };
    window.electron.onScanForNewFilesSuccess(onScanForNewSuccess);
    window.electron.onScanForNewFilesError(onScanForNewError);
}

function addSpinner() {
    const clips = document.querySelector('.clips');
    const spinner = document.createElement('div');
    spinner.classList.add('lds-roller');
    spinner.innerHTML = `
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
    <div></div>
`;
    clips.appendChild(spinner);
}

function getGames() {
    window.electron.getGames();
    const onGetGamesSuccess = (games) => {
        if (!games) {
            console.error('No games received');
            return;
        }
        const gameSelect = document.getElementById('game-select');
        gameSelect.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = 'All';
        allOption.textContent = 'All';
        gameSelect.appendChild(allOption);
        games.forEach(game => {
            const option = document.createElement('option');
            option.value = game;
            option.textContent = game;
            gameSelect.appendChild(option);
        });
        gameSelect.value = gamefilter;
        window.electron.removeListener('get-games-success', onGetGamesSuccess);
    };
    const onGetGamesError = (message) => {
        console.error(message);
        window.electron.removeListener('get-games-error', onGetGamesError);
    };
    window.electron.onGetGamesSuccess(onGetGamesSuccess);
    window.electron.onGetGamesError(onGetGamesError);
}

document.getElementById('sort').addEventListener('click', () => {
    const sortSelect = document.getElementById('sort-select');
    sortSelect.style.display = sortSelect.style.display === 'none' ? 'block' : 'none';
    const gameSelect = document.getElementById('game-select');
    gameSelect.style.display = 'none';
});

document.getElementById('sort-select').addEventListener('change', () => {
    start = 0;
    totalClips = 1;
    videos = [];
    document.querySelector('.clips').innerHTML = '';
    const sortSelect = document.getElementById('sort-select');
    sortSelect.style.display = sortSelect.style.display === 'none' ? 'block' : 'none';
    const gameSelect = document.getElementById('game-select');
    gameSelect.style.display = 'none';
    loadClips();
});

document.getElementById('game-sort').addEventListener('click', () => {
    const gameSelect = document.getElementById('game-select');
    gameSelect.style.display = gameSelect.style.display === 'none' ? 'block' : 'none';
    const sortSelect = document.getElementById('sort-select');
    sortSelect.style.display = 'none';
});

document.getElementById('game-select').addEventListener('change', () => {
    const gameSelect = document.getElementById('game-select');
    const game = gameSelect.value;
    gamefilter = game;
    start = 0;
    totalClips = 1;
    videos = [];
    document.querySelector('.clips').innerHTML = '';
    gameSelect.style.display = 'none';
    loadClips();
});

function createContextMenu(file) {
    const menu = document.createElement('div');
    menu.classList.add('context-menu');
    menu.innerHTML = `
    <ul>
        <li id="open-clip">Open Clip</li>
        <li id="delete-clip">Delete Clip</li>
        <li id="open-location">Open File Location</li>
        <li id="copy-path">Copy Full Path</li>
    </ul>
`;
    document.body.appendChild(menu);

    document.getElementById('open-location').addEventListener('click', () => {
        window.electron.openFileLocation(file);
        menu.remove();
    });

    document.getElementById('copy-path').addEventListener('click', () => {
        window.electron.copyToClipboard(file);
        menu.remove();
    });
    document.getElementById('open-clip').addEventListener('click', () => {
        window.electron.openClip(file);
        menu.remove();
    });
    document.getElementById('delete-clip').addEventListener('click', () => {
        if (!window.confirm('Are you sure you want to delete this clip?')) {
            return;
        }

        videos = videos.filter(video => video.getAttribute('data-src') !== file);
        const escapedFile = file.replace(/\\/g, '\\\\');
        const clip = document.querySelector(`video[data-filepath="${escapedFile}"]`);
        if (clip) {
            const container = clip.parentElement;
            container.remove();
            clip.remove();
            window.electron.deleteClip(file);
            console.log('Deleted clip:', file);
        } else {
            console.error('No video found with data-filepath:', file);
        }

        menu.remove();
    });

    return menu;
}

function handleContextMenu(event, file) {
    event.preventDefault();

    if (!file) {
        console.error('No file path available for context menu');
        return;
    }

    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = createContextMenu(file);
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const menuWidth = menu.clientWidth;
    const menuHeight = menu.clientHeight;

    let x = event.clientX;
    let y = event.clientY;

    if (x + menuWidth > windowWidth) {
        x = windowWidth - menuWidth - (menuWidth / 8);
    }

    if (y + menuHeight > windowHeight) {
        y = windowHeight - menuHeight - (menuHeight / 8);
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}