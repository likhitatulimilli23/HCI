const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();
const db = new sqlite3.Database('database.sqlite');

app.use(express.json());
app.use(cors());

// Initialize database and add dummy data
db.serialize(() => {
  // Create tables
  db.run(`CREATE TABLE IF NOT EXISTS professors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    department TEXT,
    university TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    professor_id INTEGER,
    name TEXT UNIQUE,
    FOREIGN KEY (professor_id) REFERENCES professors(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    professor_id INTEGER,
    course_id INTEGER,
    user_id TEXT,
    rating INTEGER,
    review TEXT,
    course_type TEXT,
    grade TEXT,
    email TEXT,
    date TEXT,
    FOREIGN KEY (professor_id) REFERENCES professors(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE,
    password TEXT,
    email TEXT UNIQUE
  )`);

  // New table for tags
  db.run(`CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    professor_id INTEGER,
    course_id INTEGER,
    tag TEXT,
    count INTEGER,
    FOREIGN KEY (professor_id) REFERENCES professors(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  )`);

  db.run(`INSERT OR IGNORE INTO professors (name, department, university) VALUES 
    ('John Doe', 'Computer Science', 'MIT'),
    ('Jane Smith', 'Physics', 'Harvard'),
    ('Bob Johnson', 'Mathematics', 'Stanford'),
    ('Alice Brown', 'Biology', 'CalTech'),
    ('Charlie Davis', 'Chemistry', 'Yale')`);

  db.run(`INSERT OR IGNORE INTO courses (professor_id, name) VALUES 
    (1, 'Introduction to Programming'),
    (1, 'Data Structures'),
    (1, 'Algorithms'),
    (2, 'Quantum Mechanics'),
    (2, 'Thermodynamics'),
    (3, 'Linear Algebra'),
    (3, 'Calculus'),
    (4, 'Molecular Biology'),
    (4, 'Genetics'),
    (5, 'Organic Chemistry'),
    (5, 'Inorganic Chemistry')`);

  db.run(`INSERT OR IGNORE INTO users (user_id, password, email) VALUES 
    ('user1', 'password1', 'user1@example.com'),
    ('user2', 'password2', 'user2@example.com'),
    ('user3', 'password3', 'user3@example.com'),
    ('user4', 'password4', 'user4@example.com'),
    ('user5', 'password5', 'user5@example.com'),
    ('user6', 'password6', 'user6@example.com')`);

  db.run(`INSERT OR IGNORE INTO ratings (professor_id, course_id, user_id, rating, review, course_type, grade, email, date) VALUES 
    (1, 1, 'user1', 5, 'Great professor!', 'offline', 'A', 'user1@example.com', '2023-05-01'),
    (1, 2, 'user2', 4, 'Very knowledgeable', 'online', 'B+', 'user2@example.com', '2023-04-15'),
    (2, 4, 'user3', 5, 'Excellent explanations', 'offline', 'A-', 'user3@example.com', '2023-05-10'),
    (3, 6, 'user4', 4, 'Challenging but rewarding', 'online', 'B', 'user4@example.com', '2023-05-05'),
    (4, 8, 'user5', 5, 'Inspiring lectures', 'offline', 'A+', 'user5@example.com', '2023-05-12'),
    (5, 10, 'user6', 4, 'Clear and concise', 'online', 'A-', 'user6@example.com', '2023-05-08')`);

  // Insert dummy tags
  db.run(`INSERT OR IGNORE INTO tags (professor_id, course_id, tag, count) VALUES 
    (1, NULL, 'Helpful', 10),
    (1, NULL, 'Clear explanations', 8),
    (1, NULL, 'Tough grader', 5),
    (1, 1, 'Engaging', 6),
    (1, 1, 'Challenging', 4),
    (2, NULL, 'Knowledgeable', 7),
    (2, NULL, 'Inspiring', 5),
    (2, 4, 'Complex topics', 3),
    (3, NULL, 'Patient', 6),
    (3, NULL, 'Approachable', 4)`);
});

// API Routes

// Get all professors with average rating
app.get('/api/professors', (req, res) => {
  const searchTerm = req.query.search ? req.query.search.toLowerCase() : '';

  db.all(`
    SELECT 
      p.id, 
      p.name, 
      p.department, 
      p.university, 
      COALESCE(AVG(r.rating), 0) as averageRating,
      COUNT(DISTINCT r.id) as numberOfRatings
    FROM 
      professors p
    LEFT JOIN 
      ratings r ON p.id = r.professor_id
    WHERE 
      LOWER(p.name) LIKE ?
    GROUP BY 
      p.id
  `, [`%${searchTerm}%`], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Ensure averageRating is always a number
    const processedRows = rows.map(row => ({
      ...row,
      averageRating: Number(row.averageRating)
    }));
    res.json(processedRows);
  });
});

// Get a specific professor
app.get('/api/professors/:id', (req, res) => {
  db.get('SELECT * FROM professors WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Professor not found' });
      return;
    }
    res.json(row);
  });
});

// Get courses for a professor
app.get('/api/professors/:id/courses', (req, res) => {
  db.all('SELECT * FROM courses WHERE professor_id = ?', [req.params.id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Updated route to get professor details including courses and average rating
app.get('/api/professors/:id/details', (req, res) => {
  const courseId = req.query.courseId;
  let query = `
    SELECT 
      p.*, 
      COALESCE(AVG(r.rating), 0) as averageRating,
      COUNT(DISTINCT r.id) as numberOfRatings
    FROM 
      professors p
    LEFT JOIN 
      ratings r ON p.id = r.professor_id
  `;
  let params = [req.params.id];

  if (courseId) {
    query += ' AND r.course_id = ?';
    params.push(courseId);
  }

  query += `
    WHERE 
      p.id = ?
    GROUP BY 
      p.id
  `;

  db.get(query, params, (err, professor) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!professor) {
      res.status(404).json({ error: 'Professor not found' });
      return;
    }
    db.all('SELECT * FROM courses WHERE professor_id = ?', [req.params.id], (err, courses) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      // Get top tags
      let tagQuery = `
        SELECT tag, SUM(count) as total_count
        FROM tags
        WHERE professor_id = ?
      `;
      let tagParams = [req.params.id];
      if (courseId) {
        tagQuery += ' AND course_id = ?';
        tagParams.push(courseId);
      } else {
        tagQuery += ' AND course_id IS NULL';
      }
      tagQuery += `
        GROUP BY tag
        ORDER BY total_count DESC
        LIMIT 5
      `;
      db.all(tagQuery, tagParams, (err, tags) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ 
          ...professor, 
          courses,
          averageRating: Number(professor.averageRating).toFixed(1),
          numberOfRatings: professor.numberOfRatings,
          topTags: tags.map(tag => tag.tag)
        });
      });
    });
  });
});

// Updated route to get ratings for a professor, optionally filtered by course
app.get('/api/professors/:id/ratings', (req, res) => {
  const courseId = req.query.courseId;
  let query = `
    SELECT r.*, c.name as course_name
    FROM ratings r
    LEFT JOIN courses c ON r.course_id = c.id
    WHERE r.professor_id = ?
  `;
  let params = [req.params.id];

  if (courseId) {
    query += ' AND r.course_id = ?';
    params.push(courseId);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// New route to get rating distribution for a professor, optionally filtered by course
app.get('/api/professors/:id/rating-distribution', (req, res) => {
  const courseId = req.query.courseId;
  let query = `
    SELECT 
      rating, 
      COUNT(*) as count
    FROM 
      ratings
    WHERE 
      professor_id = ?
  `;
  let params = [req.params.id];

  if (courseId) {
    query += ' AND course_id = ?';
    params.push(courseId);
  }

  query += ' GROUP BY rating';

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const distribution = {
      awesome: 0, great: 0, good: 0, ok: 0, awful: 0
    };
    rows.forEach(row => {
      switch(row.rating) {
        case 5: distribution.awesome = row.count; break;
        case 4: distribution.great = row.count; break;
        case 3: distribution.good = row.count; break;
        case 2: distribution.ok = row.count; break;
        case 1: distribution.awful = row.count; break;
      }
    });
    res.json(distribution);
  });
});

// Add a rating
app.post('/api/ratings', (req, res) => {
  const { professor_id, course_id, user_id, rating, review, course_type, grade, email } = req.body;
  const date = new Date().toISOString();
  db.run('INSERT INTO ratings (professor_id, course_id, user_id, rating, review, course_type, grade, email, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [professor_id, course_id, user_id, rating, review, course_type, grade, email, date],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID });
    }
  );
});

app.listen(3002, () => console.log('Server running on port 3002'));
