const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const nodemailer = require('nodemailer');
const { swaggerUi, swaggerSpec } = require('./swagger');

let transporter;

nodemailer.createTestAccount().then(account => {
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: account.user,
      pass: account.pass
    }
  });

  console.log('Ethereal ready');
});
const app = express();

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/*function sendEmail(to, repo, tag) {
  console.log(`EMAIL → ${to}`);
  console.log(`Repo: ${repo}`);
  console.log(`Новий реліз: ${tag}`);
}*/

function sendEmail(to, repo, tag) {

  // якщо transporter буде undefined 
  if (!transporter) {
    console.log('Email ще не готовий');
    return;
  }

  const mailOptions = {
    from: 'test@example.com',
    to: to,
    subject: `Новий реліз ${repo}`,
    text: `Зʼявився новий реліз ${tag} у репозиторії ${repo}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Помилка email:', error.message);
    } else {
      console.log('Email відправлено');

      const previewUrl = require('nodemailer').getTestMessageUrl(info);
      console.log('Переглянути лист:', previewUrl);
    }
  });
}

// підключення бази
const db = new sqlite3.Database('./database.db');

db.serialize(() => {

  // 1. створюємо таблицю
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      repo TEXT
    )
  `);

  // 2. додаємо колонку
  db.run(`
    ALTER TABLE subscriptions ADD COLUMN last_seen_tag TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Помилка при міграції:', err.message);
    } else {
      console.log('Міграція виконана (last_seen_tag)');
    }
  });

});

// створення таблиці
db.run(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    repo TEXT,
    last_seen_tag TEXT
  )
`);

app.use(express.json());
/**
 * @swagger
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Check if server is running
 *     responses:
 *       200:
 *         description: Server is working
 */
// перевірка сервера
app.get('/', (req, res) => {
  res.send('Сервер працює');
});

/**
 * @swagger
 * /repos:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get all repositories
 *     responses:
 *       200:
 *         description: List of repositories
 */
app.get('/repos', (req, res) => {
  db.all("SELECT * FROM subscriptions", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

/**
 * @swagger
 * /subscribe:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Subscribe to repository
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - repo
 *             properties:
 *               email:
 *                 type: string
 *                 example: test@gmail.com
 *               repo:
 *                 type: string
 *                 example: facebook/react
 *     responses:
 *       200:
 *         description: Subscription added successfully
 */
// ДОДАВАННЯ ПІДПИСКИ
app.post('/subscribe', async (req, res) => {
  const { email, repo } = req.body;

  if (!email || !repo) {
    return res.status(400).json({ error: '400 - Email і repo обовʼязкові' });
  }
  // перевірка, що рядок має правильний формат
  if (!repo.includes('/')) {
    return res.status(400).json({ error: '400 - Невірний формат repo. Використовуй owner/repo' });
  }

  const parts = repo.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return res.status(400).json({ error: '400 - Невірний формат repo. Використовуй owner/repo' });
  }

  try {
    // перевірка GitHub
    await axios.get(`https://api.github.com/repos/${repo}`);

    // якщо repo існує → зберігаємо
    db.run(
      'INSERT INTO subscriptions (email, repo) VALUES (?, ?)',
      [email, repo],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Помилка бази' });
        }

        res.json({
          message: 'Підписка додана 🎉',
          id: this.lastID,
          data: { email, repo }
        });
      }
    );

  } catch (error) {
    if (error.response) {
      const status = error.response.status;

      if (status === 404) {
        return res.status(404).json({ error: '404 - Repo не знайдено' });
      }

      if (status === 429) {
        return res.status(429).json({ error: '429 - Забагато запитів до GitHub API' });
      }

      return res.status(500).json({ error: 'Помилка GitHub API' });
    }

    return res.status(500).json({ error: 'Сервер не зміг звʼязатися з GitHub' });
  }
});

// ОТРИМАТИ ВСІ ПІДПИСКИ
app.get('/subscriptions', (req, res) => {
  db.all('SELECT * FROM subscriptions', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Помилка бази' });
    }

    res.json(rows);
  });
});
// запуск Scanner
setInterval(async () => {
  console.log('Scanner працює...');

  db.all('SELECT * FROM subscriptions', [], async (err, rows) => {
    if (err) {
      console.error('Помилка при читанні з БД:', err.message);
      return;
    }

    for (const sub of rows) {

      try {

        const response = await axios.get(
          `https://api.github.com/repos/${sub.repo}/releases/latest`
        );

        const latestTag = response.data.tag_name;

        console.log(`${sub.repo} → latest: ${latestTag}`);

        // 1. перший запуск

        if (!sub.last_seen_tag) {

          console.log('Перший запуск — зберігаємо тег');

          db.run(
            'UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?',
            [latestTag, sub.id]
          );

          /*
            // 2.0 новий реліз тестимо на ethereal пошту
          } else if (true) {
            console.log('Новий реліз знайдено');
      
            db.run(
              'UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?',
              [latestTag, sub.id]
            );
      
            sendEmail(sub.email, sub.repo, latestTag);*/

          // 2.1 новий реліз

        } else if (sub.last_seen_tag !== latestTag) {

          console.log('Новий реліз знайдено');

          db.run(
            'UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?',
            [latestTag, sub.id]
          );

          sendEmail(sub.email, sub.repo, latestTag);

          // 3. нічого не змінилось

        } else {

          console.log(`Без змін (${sub.repo})`);

        }

      } catch (error) {
        console.log(`Помилка для ${sub.repo}:`, error.response?.status);
      }
    }

  });

}, 60000);

// запуск сервера
app.listen(3000, () => {
  console.log('http://localhost:3000');
});