
const musicFiles = document.getElementById("musicFiles");
const songList = document.getElementById("songList");
const audioPlayer = document.getElementById("audioPlayer");
const songTitle = document.getElementById("songTitle");
const status = document.getElementById("status");

const playPause = document.getElementById("playPause");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const progress = document.getElementById("progress");
const currentTime = document.getElementById("currentTime");
const duration = document.getElementById("duration");

const searchSongs = document.getElementById("searchSongs");
const songCount = document.getElementById("songCount");
const showFavorites = document.getElementById("showFavorites");

const playlistName = document.getElementById("playlistName");
const createPlaylist = document.getElementById("createPlaylist");
const playlistSelect = document.getElementById("playlistSelect");

const albumCover = document.getElementById("albumCover");

let songs = [];
let currentIndex = -1;
let showFavoritesOnly = false;
let favorites = [];
let playlists = {};
let currentObjectURL = null;
let currentCoverURL = null;

// Load saved favorites and playlists
try {
    const savedFavorites = JSON.parse(
        localStorage.getItem("musicFavorites") || "[]"
    );

    favorites = Array.isArray(savedFavorites)
        ? savedFavorites.filter(name => typeof name === "string")
        : [];
} catch {
    favorites = [];
}

try {
    const savedPlaylists = JSON.parse(
        localStorage.getItem("musicPlaylists") || "{}"
    );

    if (
        savedPlaylists &&
        typeof savedPlaylists === "object" &&
        !Array.isArray(savedPlaylists)
    ) {
        Object.keys(savedPlaylists).forEach(function (name) {
            if (Array.isArray(savedPlaylists[name])) {
                playlists[name] = savedPlaylists[name].filter(
                    song => typeof song === "string"
                );
            }
        });
    }
} catch {
    playlists = {};
}

async function getEmbeddedCover(file) {
    const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());

    if (
        header.length < 10 ||
        header[0] !== 0x49 ||
        header[1] !== 0x44 ||
        header[2] !== 0x33 ||
        (header[3] !== 3 && header[3] !== 4) ||
        (header[5] & 0x80) !== 0
    ) {
        return null;
    }

    const tagSize = (
        (header[6] << 21) |
        (header[7] << 14) |
        (header[8] << 7) |
        header[9]
    );

    if (tagSize > file.size - 10) {
        return null;
    }

    const tag = new Uint8Array(
        await file.slice(10, 10 + tagSize).arrayBuffer()
    );
    const version = header[3];
    let fallbackCover = null;
    let offset = 0;

    if ((header[5] & 0x40) !== 0) {
        if (tag.length < 4) {
            return null;
        }

        const extendedHeaderSize = version === 4
            ? (
                (tag[0] << 21) |
                (tag[1] << 14) |
                (tag[2] << 7) |
                tag[3]
            )
            : (
                (tag[0] << 24) |
                (tag[1] << 16) |
                (tag[2] << 8) |
                tag[3]
            ) + 4;

        if (extendedHeaderSize > tag.length) {
            return null;
        }
        offset = extendedHeaderSize;
    }

    while (offset + 10 <= tag.length) {
        const frameId = String.fromCharCode(
            tag[offset],
            tag[offset + 1],
            tag[offset + 2],
            tag[offset + 3]
        );

        if (!/^[A-Z0-9]{4}$/.test(frameId)) {
            break;
        }

        const frameSize = version === 4
            ? (
                (tag[offset + 4] << 21) |
                (tag[offset + 5] << 14) |
                (tag[offset + 6] << 7) |
                tag[offset + 7]
            )
            : (
                (tag[offset + 4] << 24) |
                (tag[offset + 5] << 16) |
                (tag[offset + 6] << 8) |
                tag[offset + 7]
            );
        const frameFlags = tag[offset + 9];
        const dataStart = offset + 10;
        const dataEnd = dataStart + frameSize;

        if (frameSize === 0 || dataEnd > tag.length) {
            break;
        }

        if (
            frameId === "APIC" &&
            (frameFlags & (version === 4 ? 0x4f : 0xe0)) === 0
        ) {
            const encoding = tag[dataStart];
            let mimeEnd = dataStart + 1;

            while (
                mimeEnd < dataEnd &&
                mimeEnd - dataStart <= 255 &&
                tag[mimeEnd] !== 0
            ) {
                mimeEnd++;
            }

            const mime = mimeEnd < dataEnd && mimeEnd - dataStart <= 255
                ? String.fromCharCode(
                    ...tag.subarray(dataStart + 1, mimeEnd)
                )
                : "";
            const pictureType = tag[mimeEnd + 1];
            const descriptionStart = mimeEnd + 2;
            const terminatorWidth = encoding === 1 || encoding === 2 ? 2 : 1;
            let imageStart = descriptionStart;

            while (imageStart + terminatorWidth <= dataEnd) {
                const isTerminator = terminatorWidth === 1
                    ? tag[imageStart] === 0
                    : tag[imageStart] === 0 && tag[imageStart + 1] === 0;

                if (isTerminator) {
                    imageStart += terminatorWidth;
                    break;
                }
                imageStart += terminatorWidth;
            }

            if (
                mime.startsWith("image/") &&
                imageStart < dataEnd &&
                mime !== "image/"
            ) {
                const cover = new Blob(
                    [tag.slice(imageStart, dataEnd)],
                    { type: mime }
                );

                if (pictureType === 3) {
                    return cover;
                }
                fallbackCover = fallbackCover || cover;
            }
        }

        offset = dataEnd;
    }

    return fallbackCover;
}

function loadAlbumCover(song, index) {
    getEmbeddedCover(song)
        .then(function (cover) {
            if (
                !cover ||
                currentIndex !== index ||
                songs[index] !== song
            ) {
                return;
            }

            if (currentCoverURL) {
                URL.revokeObjectURL(currentCoverURL);
            }

            currentCoverURL = URL.createObjectURL(cover);
            albumCover.src = currentCoverURL;
            albumCover.alt = "Album artwork for " + song.name;
        })
        .catch(function (error) {
            console.error("Album artwork error:", error);
        });
}

// Select music files from the device
musicFiles.addEventListener("change", function () {
    const selectedFiles = Array.from(musicFiles.files);

    if (selectedFiles.length === 0) {
        return;
    }

    songs = selectedFiles;
    currentIndex = -1;

    status.textContent = songs.length + " music files loaded";

    renderSongs();
    playSong(0);
});

// Display songs according to search, favorites and playlist
function renderSongs() {
    const searchText = searchSongs.value.trim().toLowerCase();
    const selectedPlaylist = playlistSelect.value;

    const filteredSongs = songs
        .map(function (song, index) {
            return { song, index };
        })
        .filter(function (item) {
            const name = item.song.name;
            const matchesSearch = name.toLowerCase().includes(searchText);
            const matchesFavorites =
                !showFavoritesOnly || favorites.includes(name);

            const matchesPlaylist =
                selectedPlaylist === "" ||
                (
                    playlists[selectedPlaylist] &&
                    playlists[selectedPlaylist].includes(name)
                );

            return matchesSearch && matchesFavorites && matchesPlaylist;
        });

    songList.innerHTML = "";
    songCount.textContent = filteredSongs.length + " songs";

    if (filteredSongs.length === 0) {
        const message = document.createElement("p");
        message.className = "empty";
        message.textContent = songs.length === 0
            ? "Choose music files to get started."
            : "No matching songs found.";

        songList.appendChild(message);
        return;
    }

    filteredSongs.forEach(function (item) {
        const row = document.createElement("div");
        row.className = "song-row";

        const songButton = document.createElement("button");
        songButton.className = "song";
        songButton.textContent = item.song.name;

        if (item.index === currentIndex) {
            songButton.classList.add("active");
        }

        songButton.addEventListener("click", function () {
            playSong(item.index);
        });

        const favoriteButton = document.createElement("button");
        favoriteButton.className = "favorite-button";
        favoriteButton.setAttribute(
            "aria-label",
            favorites.includes(item.song.name)
                ? "Remove " + item.song.name + " from favorites"
                : "Add " + item.song.name + " to favorites"
        );
        favoriteButton.textContent =
            favorites.includes(item.song.name) ? "⭐" : "☆";
        favoriteButton.title = "Toggle favorite";

        favoriteButton.addEventListener("click", function () {
            const name = item.song.name;

            if (favorites.includes(name)) {
                favorites = favorites.filter(
                    favorite => favorite !== name
                );
            } else {
                favorites.push(name);
            }

            localStorage.setItem(
                "musicFavorites",
                JSON.stringify(favorites)
            );

            renderSongs();
        });

        const addButton = document.createElement("button");
        addButton.className = "add-playlist-button";
        addButton.setAttribute(
            "aria-label",
            "Add " + item.song.name + " to selected playlist"
        );
        addButton.textContent = "＋";
        addButton.title = "Add to selected playlist";

        addButton.addEventListener("click", function () {
            const selected = playlistSelect.value;

            if (!selected) {
                alert("Create and select a playlist first.");
                return;
            }

            const name = item.song.name;

            if (playlists[selected].includes(name)) {
                alert("This song is already in that playlist.");
                return;
            }

            playlists[selected].push(name);
            savePlaylists();
            renderSongs();

            status.textContent = "Added " + name + " to " + selected;
        });

        row.appendChild(songButton);
        row.appendChild(favoriteButton);
        row.appendChild(addButton);
        songList.appendChild(row);
    });
}

// Create playlist
createPlaylist.addEventListener("click", function () {
    const name = playlistName.value.trim();

    if (!name) {
        alert("Enter a playlist name.");
        return;
    }

    if (Object.prototype.hasOwnProperty.call(playlists, name)) {
        alert("That playlist already exists.");
        return;
    }

    playlists[name] = [];
    savePlaylists();
    updatePlaylistOptions();

    playlistSelect.value = name;
    playlistName.value = "";

    renderSongs();
    status.textContent = "Playlist created: " + name;
});

playlistName.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        createPlaylist.click();
    }
});

function savePlaylists() {
    localStorage.setItem(
        "musicPlaylists",
        JSON.stringify(playlists)
    );
}

// Update playlist dropdown
function updatePlaylistOptions() {
    const previousSelection = playlistSelect.value;

    playlistSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All Songs";
    playlistSelect.appendChild(allOption);

    Object.keys(playlists).forEach(function (name) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        playlistSelect.appendChild(option);
    });

    if (Object.prototype.hasOwnProperty.call(
        playlists,
        previousSelection
    )) {
        playlistSelect.value = previousSelection;
    } else {
        playlistSelect.value = "";
    }
}

playlistSelect.addEventListener("change", renderSongs);
searchSongs.addEventListener("input", renderSongs);

showFavorites.addEventListener("click", function () {
    showFavoritesOnly = !showFavoritesOnly;
    showFavorites.setAttribute("aria-pressed", String(showFavoritesOnly));

    showFavorites.textContent = showFavoritesOnly
        ? "🎵 Show All Songs"
        : "⭐ Show Favorites";

    renderSongs();
});

// Play selected song
async function playSong(index) {
    if (index < 0 || index >= songs.length) {
        return;
    }

    currentIndex = index;
    const song = songs[index];

    if (currentCoverURL) {
        URL.revokeObjectURL(currentCoverURL);
        currentCoverURL = null;
    }

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    currentObjectURL = URL.createObjectURL(song);
    audioPlayer.src = currentObjectURL;
    audioPlayer.load();

    songTitle.textContent = song.name;
    albumCover.src = "default-cover.svg";
    albumCover.alt = "Album artwork unavailable";
    status.textContent = "Loading song...";
    progress.value = 0;
    currentTime.textContent = "0:00";
    duration.textContent = "0:00";

    renderSongs();
    loadAlbumCover(song, index);

    try {
        await audioPlayer.play();
        status.textContent = "Now playing";
    } catch (error) {
        status.textContent =
            "Unable to play this file. Try another audio format.";

        console.error("Playback error:", error);
    }
}

// Play or pause
playPause.addEventListener("click", async function () {
    if (currentIndex === -1) {
        if (songs.length > 0) {
            playSong(0);
        } else {
            status.textContent = "Choose music files first.";
        }
        return;
    }

    if (audioPlayer.paused) {
        try {
            await audioPlayer.play();
        } catch (error) {
            status.textContent = "Playback failed.";
            console.error(error);
        }
    } else {
        audioPlayer.pause();
    }
});

audioPlayer.addEventListener("play", function () {
    playPause.textContent = "❚❚";
});

audioPlayer.addEventListener("pause", function () {
    playPause.textContent = "▶";
});

audioPlayer.addEventListener("ended", function () {
    if (currentIndex < songs.length - 1) {
        playSong(currentIndex + 1);
    } else {
        playPause.textContent = "▶";
        status.textContent = "Playlist finished.";
    }
});

// Previous song
previous.addEventListener("click", function () {
    if (songs.length === 0) return;

    const index =
        (currentIndex - 1 + songs.length) % songs.length;

    playSong(index);
});

// Next song
next.addEventListener("click", function () {
    if (songs.length === 0) return;

    const index = (currentIndex + 1) % songs.length;

    playSong(index);
});

// Update progress
audioPlayer.addEventListener("timeupdate", function () {
    if (!Number.isFinite(audioPlayer.duration)) return;

    progress.value =
        (audioPlayer.currentTime / audioPlayer.duration) * 100;

    currentTime.textContent = formatTime(audioPlayer.currentTime);
});

audioPlayer.addEventListener("loadedmetadata", function () {
    duration.textContent = formatTime(audioPlayer.duration);
});

audioPlayer.addEventListener("durationchange", function () {
    if (Number.isFinite(audioPlayer.duration)) {
        duration.textContent = formatTime(audioPlayer.duration);
    }
});

// Seek through the song
progress.addEventListener("input", function () {
    if (!Number.isFinite(audioPlayer.duration)) return;

    audioPlayer.currentTime =
        (Number(progress.value) / 100) * audioPlayer.duration;
});

audioPlayer.addEventListener("error", function () {
    if (currentIndex !== -1) {
        status.textContent =
            "Audio could not be loaded. Try an MP3 or WAV file.";
    }
});

// Format seconds as minutes:seconds
function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return minutes + ":" +
        String(remainingSeconds).padStart(2, "0");
}

// Initialize saved playlists and library
updatePlaylistOptions();
renderSongs();
