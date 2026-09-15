const { createBookClient } = require('../router/general');

async function main() {
  const client = createBookClient();
  for (const [task, result] of [
    ['Task 10: all books', await client.getAllBooks()],
    ['Task 11: ISBN 1', await client.getBookByISBN('1')],
    ['Task 12: author Unknown', await client.getBooksByAuthor('Unknown')],
    ['Task 13: title Things Fall Apart', await client.getBooksByTitle('Things Fall Apart')]
  ]) {
    console.log(task);
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error('Book request failed:', err.response?.data || err.message);
  process.exitCode = 1;
});
