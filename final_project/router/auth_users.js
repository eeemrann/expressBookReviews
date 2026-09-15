const express = require('express');
const jwt = require('jsonwebtoken');
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { jwtSecret } = require('../config');
const books = require('./booksdb');
const regd_users = express.Router();

const users = [];
const deriveKey = promisify(scrypt);

const isValid = (username) => users.some((user) => user.username === username);
const validCredentials = (username, password) =>
  typeof username === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(username) &&
  typeof password === 'string' && password.trim().length > 0 && password.length <= 128;

async function registerUser(username, password) {
  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await deriveKey(password, salt, 64)).toString('hex');
  // Recheck after hashing to prevent simultaneous duplicate registrations.
  if (isValid(username)) return false;
  users.push({ username, salt, passwordHash });
  return true;
}

async function authenticatedUser(username, password) {
  const user = users.find((candidate) => candidate.username === username);
  if (!user) return false;
  const hash = await deriveKey(password, user.salt, 64);
  return timingSafeEqual(hash, Buffer.from(user.passwordHash, 'hex'));
}

// Task 7: store a signed identity token in a regenerated server-side session.
regd_users.post('/login', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!validCredentials(username, password)) {
    return res.status(400).json({ message: 'Provide a valid username and password.' });
  }
  try {
    if (!await authenticatedUser(username, password)) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.authorization = {
        accessToken: jwt.sign({ username }, jwtSecret, { algorithm: 'HS256', expiresIn: '1h' })
      };
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.json({ message: 'Customer successfully logged in.', username });
      });
    });
  } catch (err) { next(err); }
});

// Task 8: add or replace only the authenticated customer's review.
regd_users.put('/auth/review/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) return res.status(404).json({ message: 'Book not found.' });
  const { review } = req.query;
  if (typeof review !== 'string' || !review.trim() || review.length > 5000) {
    return res.status(400).json({ message: 'Provide one non-empty review query parameter (maximum 5000 characters).' });
  }
  const book = books[req.params.isbn];
  const existed = Object.hasOwn(book.reviews, req.username);
  // Safely support own properties even for usernames such as __proto__.
  Object.defineProperty(book.reviews, req.username, {
    value: review.trim(), writable: true, enumerable: true, configurable: true
  });
  return res.status(existed ? 200 : 201).json({
    message: existed ? 'Review updated.' : 'Review added.', reviews: book.reviews
  });
});

// Task 9: the verified JWT determines which review can be deleted.
regd_users.delete('/auth/review/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) return res.status(404).json({ message: 'Book not found.' });
  const book = books[req.params.isbn];
  if (!Object.hasOwn(book.reviews, req.username)) {
    return res.status(404).json({ message: 'You have no review for this book.' });
  }
  delete book.reviews[req.username];
  return res.json({ message: 'Review deleted.', reviews: book.reviews });
});

module.exports.authenticated = regd_users;
module.exports.isValid = isValid;
module.exports.users = users;
module.exports.validCredentials = validCredentials;
module.exports.registerUser = registerUser;
module.exports.authenticatedUser = authenticatedUser;
