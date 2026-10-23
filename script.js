
const musicFiles = document.getElementById("musicFiles");
const songList = document.getElementById("songList");
const audioPlayer = document.getElementById("audioPlayer");
const songTitle = document.getElementById("songTitle");

const playPause = document.getElementById("playPause");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const progress = document.getElementById("progress");
const time = document.getElementById("time");

const searchSongs = document.getElementById("searchSongs");
const songCount = document.getElementById("songCount");
const showFavorites = document.getElementById("showFavorites");

const playlistName = document.getElementById("playlistName");
const createPlaylist = document.getElementById("createPlaylist");
const playlistSelect = document.getElementById("playlistSelect");

let songs = [];
let currentIndex = 0;
let showFavoritesOnly = false;
let favorites = [];
let playlists = {};

// Load saved data safely
try {
    favorites = JSON.parse(
        localStorage.getItem("musicFavorites") || "[]"
    );

    if (!Array.isArray(favorites)) {
        favorites = [];
    }
} catch (error) {
    favorites = [];
}

try {
    playlists = JSON.parse(
        localStorage.getItem("musicPlaylists") || "{}"
    );

    if (
        playlists === null ||
        Array.isArray(playlists) ||
        typeof playlists !== "object"
    ) {
        playlists = {};
    }
} catch (error) {
    playlists = {};
}

// Load selected music files
musicFiles.addEventListener("change", function () {
    songs = Array.from(musicFiles.files);
    currentIndex = 0;

    renderSongs();

    if (songs.length > 0) {
        playSong(0);
    } else {
        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        songTitle.textContent = "No song selected";
        playPause.textContent = "▶";
        progress.value = 0;
        time.textContent = "0:00 / 0:00";
    }
});

// Create a playlist
createPlaylist.addEventListener("click", function () {
    const name = playlistName.value.trim();

    if (name === "") {
        alert("Please enter a playlist name.");
        return;
    }

    if (Object.keys(playlists).includes(name)) {
        alert("A playlist with this name already exists.");
        return;
    }

    playlists[name] = [];

    savePlaylists();
    updatePlaylistOptions();

    playlistSelect.value = name;
    playlistName.value = "";

    renderSongs();
});

// Allow Enter to create a playlist
playlistName.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        createPlaylist.click();
    }
});

// Save playlists to browser storage
function savePlaylists() {
    localStorage.setItem(
        "musicPlaylists",
        JSON.stringify(playlists)
    );
}

// Update the playlist dropdown
function updatePlaylistOptions() {
    const selectedPlaylist = playlistSelect.value;

    playlistSelect.innerHTML =
        '<option value="">All Songs</option>';

    Object.keys(playlists).forEach(function (name) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;

        playlistSelect.appendChild(option);
    });

    if (Object.keys(playlists).includes(selectedPlaylist)) {
        playlistSelect.value = selectedPlaylist;
    }
}

// Change the displayed playlist
playlistSelect.addEventListener("change", renderSongs);

// Display songs based on search, favorites, and playlist
function renderSongs() {
    const searchText = searchSongs.value.toLowerCase();
    const selectedPlaylist = playlistSelect.value;

    const filteredSongs = songs
        .map(function (song, index) {
            return { song: song, index: index };
        })
        .filter(function (item) {
            const matchesSearch =
                item.song.name.toLowerCase().includes(searchText);

            const isFavorite =
                favorites.includes(item.song.name);

            const matchesFavorites =
                !showFavoritesOnly || isFavorite;

            const matchesPlaylist =
                selectedPlaylist === "" ||
                (
                    playlists[selectedPlaylist] &&
                    playlists[selectedPlaylist].includes(item.song.name)
                );

            return matchesSearch &&
                matchesFavorites &&
                matchesPlaylist;
        });

    songList.innerHTML = "";
    songCount.textContent = filteredSongs.length + " songs";

    if (filteredSongs.length === 0) {
        songList.innerHTML =
            '<p class="empty">No matching songs found.</p>';
        return;
    }

    filteredSongs.forEach(function (item) {
        const row = document.createElement("div");
        row.className = "song-row";

        // Song button
        const songButton = document.createElement("button");
        songButton.className = "song";
        songButton.textContent = item.song.name;

        if (item.index === currentIndex) {
            songButton.classList.add("active");
        }

        songButton.addEventListener("click", function () {
            playSong(item.index);
        });

        // Favorite button
        const favoriteButton = document.createElement("button");
        favoriteButton.className = "favorite-button";

        favoriteButton.textContent =
            favorites.includes(item.song.name) ? "⭐" : "☆";

        favoriteButton.title = "Toggle favorite";

        favoriteButton.addEventListener("click", function () {
            const name = item.song.name;

            if (favorites.includes(name)) {
                favorites = favorites.filter(function (favorite) {
                    return favorite !== name;
                });
            } else {
                favorites.push(name);
            }

            localStorage.setItem(
                "musicFavorites",
                JSON.stringify(favorites)
            );

            renderSongs();
        });

        // Add song to selected playlist
        const addButton = document.createElement("button");
        addButton.className = "add-playlist-button";
        addButton.textContent = "＋";
        addButton.title = "Add to selected playlist";

        addButton.addEventListener("click", function () {
            const selected = playlistSelect.value;

            if (selected === "") {
                alert("First select a playlist from the dropdown.");
                return;
            }

            const name = item.song.name;

            if (!playlists[selected].includes(name)) {
                playlists[selected].push(name);
                savePlaylists();
                renderSongs();
                alert("Song added to " + selected + "!");
            } else {
                alert("This song is already in that playlist.");
            }
        });

        row.appendChild(songButton);
        row.appendChild(favoriteButton);
        row.appendChild(addButton);

        songList.appendChild(row);
    });
}

// Search songs
searchSongs.addEventListener("input", renderSongs);

// Show favorites or all songs
showFavorites.addEventListener("click", function () {
    showFavoritesOnly = !showFavoritesOnly;

    showFavorites.textContent = showFavoritesOnly
        ? "🎵 Show All Songs"
        : "⭐ Show Favorites";

    renderSongs();
});

// Play a song
function playSong(index) {
    if (index < 0 || index >= songs.length) {
        return;
    }

    currentIndex = index;

    const song = songs[currentIndex];

    audioPlayer.src = URL.createObjectURL(song);
    songTitle.textContent = song.name;

    audioPlayer.play().catch(function (error) {
        console.log("Playback could not start:", error);
    });

    renderSongs();
}

// Play or pause
playPause.addEventListener("click", function () {
    if (songs.length === 0) {
        return;
    }

    if (audioPlayer.paused) {
        audioPlayer.play().catch(function (error) {
            console.log("Playback failed:", error);
        });
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

// Previous song
previous.addEventListener("click", function () {
    if (songs.length === 0) {
        return;
    }

    const index =
        (currentIndex - 1 + songs.length) % songs.length;

    playSong(index);
});

// Next song
next.addEventListener("click", function () {
    if (songs.length === 0) {
        return;
    }

    const index = (currentIndex + 1) % songs.length;

    playSong(index);
});

// Update progress and time
audioPlayer.addEventListener("timeupdate", function () {
    if (!Number.isFinite(audioPlayer.duration)) {
        return;
    }

    progress.value =
        (audioPlayer.currentTime / audioPlayer.duration) * 100;

    time.textContent =
        formatTime(audioPlayer.currentTime) +
        " / " +
        formatTime(audioPlayer.duration);
});

// Seek through a song
progress.addEventListener("input", function () {
    if (!Number.isFinite(audioPlayer.duration)) {
        return;
    }

    audioPlayer.currentTime =
        (progress.value / 100) * audioPlayer.duration;
});

// Reset progress for each new song
audioPlayer.addEventListener("loadedmetadata", function () {
    progress.value = 0;

    time.textContent =
        "0:00 / " + formatTime(audioPlayer.duration);
});

// Automatically play the next song
audioPlayer.addEventListener("ended", function () {
    next.click();
});

// Format time as minutes:seconds
function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return minutes + ":" +
        String(remainingSeconds).padStart(2, "0");
}

// Restore saved playlists in the dropdown
updatePlaylistOptions();
