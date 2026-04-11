const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { swaggerUi, swaggerSpec } = require('./swagger');
const db = require('./db');

let transporter;

// init email (Ethereal)
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

app.use(express.json());

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

function sendEmail(to, repo, tag) {
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
  try {
    const rows = db.prepare("SELECT * FROM subscriptions").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.post('/subscribe', async (req, res) => {
  const { email, repo } = req.body;

  if (!email || !repo) {
    return res.status(400).json({ error: '400 - Email і repo обовʼязкові' });
  }

  if (!repo.includes('/')) {
    return res.status(400).json({ error: '400 - Невірний формат repo. Використовуй owner/repo' });
  }

  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return res.status(400).json({ error: '400 - Невірний формат repo. Використовуй owner/repo' });
  }

  try {
    await axios.get(`https://api.github.com/repos/${repo}`);

    const result = db.prepare(
      'INSERT INTO subscriptions (email, repo) VALUES (?, ?)'
    ).run(email, repo);

    res.json({
      message: 'Підписка додана 🎉',
      id: result.lastInsertRowid,
      data: { email, repo }
    });

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

/**
 * @swagger
 * /subscriptions:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get all subscriptions
 *     responses:
 *       200:
 *         description: List of subscriptions
 */
app.get('/subscriptions', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM subscriptions').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Помилка бази' });
  }
});

// Scanner (every 60 sec)
setInterval(async () => {
  console.log('Scanner працює...');

  try {
    const rows = db.prepare('SELECT * FROM subscriptions').all();

    for (const sub of rows) {
      try {
        const response = await axios.get(
          `https://api.github.com/repos/${sub.repo}/releases/latest`
        );

        const latestTag = response.data.tag_name;

        if (!sub.last_seen_tag) {
          db.prepare(
            'UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?'
          ).run(latestTag, sub.id);

        } else if (sub.last_seen_tag !== latestTag) {

          db.prepare(
            'UPDATE subscriptions SET last_seen_tag = ? WHERE id = ?'
          ).run(latestTag, sub.id);

          sendEmail(sub.email, sub.repo, latestTag);
        }

      } catch (error) {
        console.log(`Помилка для ${sub.repo}:`, error.response?.status);
      }
    }

  } catch (err) {
    console.error('Помилка при читанні з БД:', err.message);
  }

}, 60000);

// start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});