# Book Review Application

## Run

Requires Node.js 20 or later and npm. From the repository root:

```sh
cd final_project
npm ci
npm start
```

The API listens on port 5000 (override with `PORT`). For automatic restarts,
use `npm run dev`. In a second terminal in `final_project`, run:

```sh
npm test
npm run client
npm run evidence
```

`npm test` starts an isolated HTTP server and checks public searches, validation,
registration, JWT/session authentication, review ownership, and Axios requests.
`npm run client` calls the running server for Tasks 10-13. Set `BOOK_API_URL` to
use a different server. All four Axios functions are in `router/general.js`.
`npm run evidence` needs cURL and starts its own fresh server on a free port,
saves actual commands and outputs to `submission/`, and then stops that server.

## Endpoints

| Task | Method | Path | Purpose |
| --- | --- | --- | --- |
| 1 | GET | `/` | All ten books, keyed by ISBN |
| 2 | GET | `/isbn/:isbn` | One book |
| 3 | GET | `/author/:author` | All books by an author |
| 4 | GET | `/title/:title` | All books with the title |
| 5 | GET | `/review/:isbn` | Reviews keyed by username |
| 6 | POST | `/register` | JSON body: username and password |
| 7 | POST | `/customer/login` | JSON body: username and password; sets session cookie |
| 8 | PUT | `/customer/auth/review/:isbn?review=...` | Add or update your review |
| 9 | DELETE | `/customer/auth/review/:isbn` | Delete your own review |

Author and title searches use case-insensitive exact matching; URL-encode spaces
and special characters. Unknown books or searches without matches return 404.
Usernames contain 1-64 letters, numbers, or underscores and are case-sensitive.
Passwords contain 1-128 characters and cannot be blank. Duplicate usernames
return 409; invalid inputs return 400. Reviews must be a single non-empty query
value with at most 5000 characters. New reviews return 201 and updates return 200.
Unauthenticated writes return 401. Deleting a nonexistent own review returns 404.

## cURL example

These commands use Bash/Git Bash. In PowerShell, use `curl.exe` and JSON files
with `--data-binary @filename.json` to avoid native argument quoting differences.

```sh
curl -s http://localhost:5000/
curl -s -X POST http://localhost:5000/register \
  -H 'Content-Type: application/json' -d '{"username":"alice","password":"demo-password"}'
curl -s -c cookies.txt -X POST http://localhost:5000/customer/login \
  -H 'Content-Type: application/json' -d '{"username":"alice","password":"demo-password"}'
curl -s -b cookies.txt -X PUT 'http://localhost:5000/customer/auth/review/1?review=Excellent'
curl -s http://localhost:5000/review/1
curl -s -b cookies.txt -X DELETE http://localhost:5000/customer/auth/review/1
```

## Sessions and data

Passwords are stored as salted scrypt hashes. Login regenerates the session ID
and stores a one-hour HS256 JWT containing the username in the server-side
session. The browser receives an HttpOnly, SameSite=Strict cookie. Protected
routes verify the JWT and use its identity for all review changes.

This lab stores users, reviews, and sessions in memory; restarting clears them.
Development secrets are generated at startup. Production mode requires
`JWT_SECRET`, `SESSION_SECRET`, and HTTPS for secure cookies. A deployed service
also needs persistent storage and a production session store; the bundled
MemoryStore is intended for this local lab.

## Submission (Option 1: text evidence)

The `submission/` folder contains the nine requested cURL evidence files,
`general-js-url.txt` for Tasks 10-13, and `githubrepo.txt` for Task 14.
The review evidence demonstrates an update, two separate users, and deletion
that preserves the other user's review. Cookie values are kept in temporary
files and are never included in submission output. The displayed commands use
POSIX-shell quoting; to replay against `npm start`, replace the captured port
with 5000 and run commands in task order.

Public repository: https://github.com/eeemrann/expressBookReviews

```sh
git add .
git commit -m "Complete book review final project"
git push origin main
curl -s https://api.github.com/repos/eeemrann/expressBookReviews | jq '.parent.full_name'
```

Expected parent: `ibm-developer-skills-network/expressBookReviews`.
