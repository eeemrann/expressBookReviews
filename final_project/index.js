const express = require('express');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const { jwtSecret, sessionSecret } = require('./config');
const { authenticated: customerRoutes, isValid } = require('./router/auth_users');
const { general: generalRoutes } = require('./router/general');

const app = express();
app.disable('x-powered-by');
app.set('json spaces', 2);
app.use(express.json({ limit: '16kb' }));
app.use('/customer', session({
  name: 'bookshop.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 3600000 }
}));

app.use('/customer/auth', function auth(req, res, next) {
  const token = req.session.authorization?.accessToken;
  if (!token) return res.status(401).json({ message: 'Please log in first.' });
  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload.username !== 'string' || !isValid(payload.username)) {
      return res.status(401).json({ message: 'Invalid session user. Please log in again.' });
    }
    req.username = payload.username;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
  }
});

app.use('/customer', customerRoutes);
app.use('/', generalRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' });
  if (err instanceof URIError) return res.status(400).json({ message: 'Invalid URL encoding.' });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error.' });
});

if (require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server is running on port ${port}`));
}

module.exports = app;
