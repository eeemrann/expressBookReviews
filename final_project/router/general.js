const express = require('express');
const axios = require('axios');
const books = require('./booksdb');
const { isValid, validCredentials, registerUser } = require('./auth_users');
const public_users = express.Router();


// Task 6: register a unique user with a salted password hash.
public_users.post('/register', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!validCredentials(username, password)) {
    return res.status(400).json({ message: 'Username must contain 1-64 letters, numbers or underscores; password must contain 1-128 characters and cannot be blank.' });
  }
  try {
    if (isValid(username) || !await registerUser(username, password)) {
      return res.status(409).json({ message: 'Username already exists.' });
    }
    return res.status(201).json({ message: 'User successfully registered. You can now log in.' });
  } catch (err) { next(err); }
});

// Task 1: Express uses JSON.stringify with the app's two-space indentation.
public_users.get('/', (req, res) => {
  return res.json(books);
});

// Task 2: get book details based on ISBN.
public_users.get('/isbn/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) return res.status(404).json({ message: 'Book not found.' });
  return res.json(books[req.params.isbn]);
});

function findBooks(field, value) {
  return Object.fromEntries(Object.entries(books).filter(([, book]) =>
    book[field].toLowerCase() === value.toLowerCase()));
}

// Task 3: return every matching book, keyed by ISBN.
public_users.get('/author/:author', (req, res) => {
  const matches = findBooks('author', req.params.author);
  if (!Object.keys(matches).length) return res.status(404).json({ message: 'No books found for this author.' });
  return res.json(matches);
});

// Task 4: get all books based on title.
public_users.get('/title/:title', (req, res) => {
  const matches = findBooks('title', req.params.title);
  if (!Object.keys(matches).length) return res.status(404).json({ message: 'No books found for this title.' });
  return res.json(matches);
});

// Task 5: get book reviews.
public_users.get('/review/:isbn', (req, res) => {
  if (!Object.hasOwn(books, req.params.isbn)) return res.status(404).json({ message: 'Book not found.' });
  return res.json(books[req.params.isbn].reviews);
});

module.exports.general = public_users;

// Tasks 10-13: reusable Axios clients for the public API above.
// Run `npm run client` while the server is running. HTTP errors reject the
// returned promises and are handled by the caller (see scripts/client.js).
function createBookClient(baseURL = process.env.BOOK_API_URL || 'http://127.0.0.1:5000') {
  const api = axios.create({ baseURL, timeout: 5000, proxy: false });

  // Task 10: async/await with Axios to retrieve all books.
  async function getAllBooks() {
    const response = await api.get('/');
    return response.data;
  }

  // Task 11: a Promise callback with Axios to retrieve a book by ISBN.
  function getBookByISBN(isbn) {
    return api.get(`/isbn/${encodeURIComponent(isbn)}`).then((response) => response.data);
  }

  // Task 12: async/await with Axios to retrieve books by author.
  async function getBooksByAuthor(author) {
    const response = await api.get(`/author/${encodeURIComponent(author)}`);
    return response.data;
  }

  // Task 13: async/await with Axios to retrieve books by title.
  async function getBooksByTitle(title) {
    const response = await api.get(`/title/${encodeURIComponent(title)}`);
    return response.data;
  }

  return { getAllBooks, getBookByISBN, getBooksByAuthor, getBooksByTitle };
}

module.exports.createBookClient = createBookClient;
