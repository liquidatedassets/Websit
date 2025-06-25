from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import json
import os
import uuid
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*")
# Store connected users and their cursor positions
connected_users = {}
# Your existing code
DATA_FILE = 'data/rankings.json'
ALL_MOVIES_FILE = 'data/movies.json'
TIERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F']
USERS = ['user1', 'user2', 'user3', 'user4']
# app.py modifications
# Update the load_rankings function to include average
def load_rankings():
    with open(DATA_FILE, 'r') as f:
        data = json.load(f)
    # Ensure average tierlist exists in the data
    if 'average' not in data:
        data['average'] = compute_average(data)
    return data
# Update the save_rankings function to preserve average
def save_rankings(rankings):
    # Preserve the average tierlist if it exists
    if 'average' in rankings:
        avg = rankings['average']
    else:
        avg = compute_average(rankings)
    
    # Save all data including average
    with open(DATA_FILE, 'w') as f:
        data_to_save = {**rankings}
        if 'average' not in data_to_save:
            data_to_save['average'] = avg
        json.dump(data_to_save, f, indent=4)
MOVIE_IMAGES_FOLDER = 'static/movies/'
def load_all_movies():
    if not os.path.exists(MOVIE_IMAGES_FOLDER):
        os.makedirs(MOVIE_IMAGES_FOLDER)
    movies = {}
    for filename in os.listdir(MOVIE_IMAGES_FOLDER):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
            movie_name = os.path.splitext(filename)[0]  # remove extension
            movies[movie_name] = filename  # save filename with extension
    return movies
# Save all movies
def save_all_movies(movies):
    with open(ALL_MOVIES_FILE, 'w') as f:
        json.dump(movies, f, indent=4)
# Compute average tierlist
def compute_average(rankings):
    scores = {'S': 7, 'A': 6, 'B': 5, 'C': 4, 'D': 3, 'E': 2, 'F': 1}
    movie_totals = {}
    movie_counts = {}
    for user in USERS:
        for tier, movies in rankings[user].items():
            for movie in movies:
                movie_totals[movie] = movie_totals.get(movie, 0) + scores[tier]
                movie_counts[movie] = movie_counts.get(movie, 0) + 1
    movie_averages = {movie: movie_totals[movie] / movie_counts[movie] for movie in movie_totals}
    avg_tierlist = {tier: [] for tier in TIERS}
    for movie, avg_score in movie_averages.items():
        if avg_score >= 6.5:
            avg_tierlist['S'].append(movie)
        elif avg_score >= 5.5:
            avg_tierlist['A'].append(movie)
        elif avg_score >= 4.5:
            avg_tierlist['B'].append(movie)
        elif avg_score >= 3.5:
            avg_tierlist['C'].append(movie)
        elif avg_score >= 2.5:
            avg_tierlist['D'].append(movie)
        elif avg_score >= 1.5:
            avg_tierlist['E'].append(movie)
        else:
            avg_tierlist['F'].append(movie)
    return avg_tierlist
@app.route('/')
def home():
    return render_template('index.html')
@app.route('/tierlist')
def tierlist():
    rankings = load_rankings()
    avg_tierlist = compute_average(rankings)
    all_movies = load_all_movies()
    unranked_movies = {}
    for user in USERS:
        ranked_movies = []
        for tier in TIERS:
            ranked_movies.extend(rankings[user][tier])
        unranked_movies[user] = [movie for movie in all_movies if movie not in ranked_movies]
    return render_template('tierlist.html',
                       users=USERS,
                       tiers=TIERS,
                       rankings=rankings,
                       average=avg_tierlist,
                       unranked_movies=unranked_movies,
                       movie_files=all_movies)
@app.route('/api/movie-files')
def get_movie_files():
    """API endpoint to get movie file mappings for JavaScript"""
    return jsonify(load_all_movies())
@app.route('/update', methods=['POST'])
def update():
    data = request.json
    user = data['user']
    new_rankings = data['rankings']
    rankings = load_rankings()
    rankings[user] = new_rankings
    save_rankings(rankings)
    # Compute the new averages
    avg_tierlist = compute_average(rankings)
    
    # Get unranked movies for all users
    all_movies = load_all_movies()
    unranked_movies = {}
    for u in USERS:
        ranked_movies = []
        for tier in TIERS:
            ranked_movies.extend(rankings[u][tier])
        unranked_movies[u] = [movie for movie in all_movies if movie not in ranked_movies]
    # Broadcast all data needed to update the UI (using the correct emit parameters)
    socketio.emit('update_ui', {
        'users': USERS,
        'tiers': TIERS,
        'rankings': rankings,
        'average': avg_tierlist,
        'unranked_movies': unranked_movies,
        'movie_files': all_movies
    }, to=None, include_self=True)  # Changed from broadcast=True
    
    return jsonify({"success": True})
# WebSocket events for cursor tracking
@socketio.on('connect')
def handle_connect():
    # Generate unique user ID
    user_id = str(uuid.uuid4())
    connected_users[request.sid] = {
        'id': user_id,
        'x': 0,
        'y': 0
    }
    
    # Send existing users to new client
    emit('existing_users', {
        'users': {sid: data for sid, data in connected_users.items() if sid != request.sid}
    })
    
    # Notify other clients about new user
    emit('user_joined', {
        'id': user_id,
        'sid': request.sid
    }, broadcast=True, include_self=False)
    
    print(f"User {user_id} connected")
@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in connected_users:
        user_id = connected_users[request.sid]['id']
        del connected_users[request.sid]
        
        # Notify other clients about user leaving
        emit('user_left', {
            'sid': request.sid
        }, broadcast=True, include_self=False)
        
        print(f"User {user_id} disconnected")
@socketio.on('cursor_move')
def handle_cursor_move(data):
    if request.sid in connected_users:
        # Update user's cursor position
        connected_users[request.sid]['x'] = data['x']
        connected_users[request.sid]['y'] = data['y']
        
        # Broadcast to all other clients
        emit('cursor_update', {
            'sid': request.sid,
            'x': data['x'],
            'y': data['y']
        }, broadcast=True, include_self=False)
if __name__ == '__main__':
    os.makedirs('data', exist_ok=True)
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)