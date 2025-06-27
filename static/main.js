const users = ['user1', 'user2', 'user3', 'user4'];
const tiers = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

users.forEach(user => {
    document.querySelectorAll(`.tierlist[data-user="${user}"] .movie-list`).forEach(list => {
        new Sortable(list, {
            group: user,
            animation: 150,
            onEnd: function () {
                saveTierlist(user);
            }
        });
    });
});

const socket = io();

// Function to move movie to specific tier
function moveMovieToTier(movieName, targetTier, user) {
    // Find the movie element in unranked section
    const userTierlist = document.querySelector(`.tierlist[data-user="${user}"]`);
    const unrankedSection = userTierlist.querySelector('.unranked-section .movie-list');
    const movieElement = Array.from(unrankedSection.children).find(li => 
        li.querySelector('.movie-name').textContent.trim() === movieName
    );
    
    if (!movieElement) {
        console.error('Movie not found in unranked section:', movieName);
        return;
    }
    
    // Find the target tier list
    const targetTierList = userTierlist.querySelector(`[data-tier="${targetTier}"] .movie-list`);
    
    if (!targetTierList) {
        console.error('Target tier not found:', targetTier);
        return;
    }
    
    // Remove tier buttons from the movie element since it's moving to a tier
    const tierButtons = movieElement.querySelector('.tier-buttons');
    if (tierButtons) {
        tierButtons.remove();
    }
    
    // Update movie element classes to match tier styling
    const movieNameElement = movieElement.querySelector('.movie-name');
    const movieImage = movieElement.querySelector('.movie-image');
    
    movieNameElement.className = 'movie-name tier wrap-text flex-row p8 pnotop gaybox';
    movieImage.className = 'movie-image tier flex-row';
    movieElement.className = 'movie-item m8 no minwidth';
    
    // Move the element to the target tier
    targetTierList.appendChild(movieElement);
    
    // Save the changes
    saveTierlist(user);
}

// Initialize all sortable lists
function initAllSortable() {
    users.forEach(user => {
        document.querySelectorAll(`.tierlist[data-user="${user}"] .movie-list`).forEach(list => {
            new Sortable(list, {
                group: user,
                animation: 150,
                onEnd: () => saveTierlist(user)
            });
        });
    });
}

// Save tierlist to server
function saveTierlist(user) {
    const tiers = {};
    document.querySelectorAll(`.tierlist[data-user="${user}"] .tier`).forEach(tierDiv => {
        const tier = tierDiv.dataset.tier;
        const movies = Array.from(tierDiv.querySelectorAll('.movie-item')).map(li => {
            return li.querySelector('.movie-name').textContent.trim();
        });
        tiers[tier] = movies;
    });
    fetch('/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: user, rankings: tiers })
    }).catch(err => console.error('Error saving:', err));
}

// Handle UI updates from server
socket.on('update_ui', (data) => {
    // Update all user tierlists
    data.users.forEach(user => {
        const tierlistDiv = document.querySelector(`.tierlist[data-user="${user}"]`);
        
        data.tiers.forEach(tier => {
            const tierDiv = tierlistDiv.querySelector(`[data-tier="${tier}"]`);
            const movieList = tierDiv.querySelector('.movie-list');
            movieList.innerHTML = '';
            
            data.rankings[user][tier].forEach(movie => {
                const imgPath = data.movie_files[movie] || 'default.jpg';
                movieList.appendChild(createMovieElement(movie, imgPath, false));
            });
        });
        
        // Update unranked movies
        const unrankedSection = tierlistDiv.querySelector('.unranked-section .movie-list');
        unrankedSection.innerHTML = '';
        data.unranked_movies[user].forEach(movie => {
            const imgPath = data.movie_files[movie] || 'default.jpg';
            unrankedSection.appendChild(createMovieElement(movie, imgPath, true, false, user));
        });
    });
    
    // Update average tierlist
    const avgTierlistDiv = document.querySelector('.tierlist.average');
    data.tiers.forEach(tier => {
        const tierDiv = avgTierlistDiv.querySelector(`[data-tier="${tier}"]`);
        const movieList = tierDiv.querySelector('.movie-list');
        movieList.innerHTML = '';
        
        data.average[tier].forEach(movie => {
            const imgPath = data.movie_files[movie] || 'default.jpg';
            movieList.appendChild(createMovieElement(movie, imgPath, false, true));
        });
    });
    
    // Reinitialize all sortable lists
    initAllSortable();
});

// Helper function to create movie elements
function createMovieElement(movie, imagePath, isUnranked = false, isAverage = false, user = null) {
    const li = document.createElement('li');
    
    // Set appropriate classes based on context
    if (isUnranked || isAverage) {
        li.className = 'movie-item inseter-panel m8 no minwidth';
    } else {
        li.className = 'movie-item m8 no minwidth';
    }
    
    // Create the basic structure
    let innerHTML = `
        <div class="movie-name ${isUnranked || isAverage ? '' : 'tier'} wrap-text flex-row ${isAverage ? 'p16' : isUnranked ? 'p16' : 'p8 pnotop'} gaybox">${movie}</div>
        <img src="/static/movies/${imagePath}" width="100" height="125" alt="${movie}" class="movie-image ${isUnranked || isAverage ? '' : 'tier flex-row'}" />
    `;
    
    // Add tier buttons only for unranked movies (not average)
    if (isUnranked && !isAverage && user) {
        innerHTML += `
            <div>
                ${tiers.map(tier => `
                    <button class="button ${tier.toLowerCase()}" 
                            data-movie="${movie}" 
                            data-tier="${tier}" 
                            data-user="${user}"
                            onclick="moveMovieToTier('${movie}', '${tier}', '${user}')">
                        ${tier}
                    </button>
                `).join('')}
            </div>
        `;
    }
    
    li.innerHTML = innerHTML;
    return li;
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initAllSortable();
    new CursorTracker();
});

// Initialize Sortable for a user
function initSortable(user) {
    document.querySelectorAll(`.tierlist[data-user="${user}"] .movie-list`).forEach(list => {
        new Sortable(list, {
            group: user,
            animation: 150,
            onEnd: () => saveTierlist(user)
        });
    });
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize sortable for all users
    users.forEach(user => initSortable(user));
    
    // Initialize cursor tracking
    new CursorTracker();
});

function updateAverage(average) {
    document.querySelectorAll('.movie-list.average').forEach(ul => {
        const tier = ul.parentElement.dataset.tier;
        ul.innerHTML = '';
        average[tier].forEach(movie => {
            const li = document.createElement('li');
            li.className = 'movie-item';
            li.innerText = movie;
            ul.appendChild(li);
        });
    });
}

function addMovie() {
    const nameInput = document.getElementById('new-movie-name');
    const movieName = nameInput.value.trim();
    if (movieName === '') {
        alert('Please enter a movie name');
        return;
    }
    fetch('/add_movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movie: movieName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.reload();
        } else {
            alert(data.error);
        }
    });
}

var coll = document.getElementsByClassName("collapsible");
var i;
for (i = 0; i < coll.length; i++) {
  coll[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var content = this.nextElementSibling;
    if (content.style.display === "block") {
      content.style.display = "none";
    } else {
      content.style.display = "block";
    }
  });
} 

class CursorTracker {
    constructor() {
        this.socket = null;
        this.cursors = new Map();
        this.colors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', 
            '#ffeaa7', '#dda0dd', '#98d8c8', '#f7dc6f',
            '#bb8fce', '#85c1e9', '#f8c471', '#82e0aa'
        ];
        this.userCount = 1;
        
        this.init();
    }
    
    init() {
        this.connect();
        this.setupMouseTracking();
        this.updateStatus('connecting');
    }
    
    connect() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateStatus('connected');
            console.log('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            this.updateStatus('disconnected');
            console.log('Disconnected from server');
        });
        
        this.socket.on('existing_users', (data) => {
            Object.entries(data.users).forEach(([sid, user]) => {
                this.addCursor(sid, user.x, user.y);
            });
            this.updateUserCount();
        });
        
        this.socket.on('user_joined', (data) => {
            this.addCursor(data.sid, 0, 0);
            this.userCount++;
            this.updateUserCount();
            console.log('User joined:', data.id);
        });
        
        this.socket.on('user_left', (data) => {
            this.removeCursor(data.sid);
            this.userCount--;
            this.updateUserCount();
            console.log('User left');
        });
        
        this.socket.on('cursor_update', (data) => {
            this.updateCursor(data.sid, data.x, data.y);
        });
        
        // Auto-reconnect
        this.socket.on('connect_error', () => {
            setTimeout(() => {
                this.socket.connect();
            }, 1000);
        });
    }
    
    setupMouseTracking() {
        let throttleTimer = null;
        
        document.addEventListener('mousemove', (e) => {
            if (throttleTimer) return;
            
            throttleTimer = setTimeout(() => {
                if (this.socket && this.socket.connected) {
                    // Use page coordinates instead of client coordinates
                    this.socket.emit('cursor_move', {
                        x: e.pageX,
                        y: e.pageY
                    });
                }
                throttleTimer = null;
            }, 16); // ~60fps
        });
    }
    
    addCursor(sid, x, y) {
        if (this.cursors.has(sid)) return;
        
        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        cursor.style.backgroundColor = this.getRandomColor();
        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';
        
        document.body.appendChild(cursor);
        this.cursors.set(sid, cursor);
    }
    
    updateCursor(sid, x, y) {
        const cursor = this.cursors.get(sid);
        if (cursor) {
            cursor.style.left = x + 'px';
            cursor.style.top = y + 'px';
        }
    }
    
    removeCursor(sid) {
        const cursor = this.cursors.get(sid);
        if (cursor) {
            cursor.remove();
            this.cursors.delete(sid);
        }
    }
    
    getRandomColor() {
        return this.colors[Math.floor(Math.random() * this.colors.length)];
    }
    
    updateStatus(status) {
        const statusEl = document.getElementById('status');
        const statusText = statusEl.querySelector('span');
        
        statusText.className = status === 'connected' ? 'connected' : 'disconnected';
        statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    updateUserCount() {
        const countEl = document.getElementById('userCount');
        countEl.textContent = `Users: ${this.userCount}`;
    }
}

// Initialize cursor tracking when page loads
document.addEventListener('DOMContentLoaded', () => {
    new CursorTracker();
});