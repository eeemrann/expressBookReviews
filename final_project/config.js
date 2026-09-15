const { randomBytes } = require('node:crypto');

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.SESSION_SECRET)) {
  throw new Error('Set JWT_SECRET and SESSION_SECRET in production.');
}

module.exports = {
  jwtSecret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex')
};
