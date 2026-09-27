# Math SM Lab

**Want the same website online?** Follow [PUT-ONLINE.md](PUT-ONLINE.md). The included `render.yaml` configures a Node.js web service with persistent storage. This option is paid; it has not been deployed or purchased for you. GitHub Pages can display this README but cannot run the website's server.

A working website with a Node.js server and persistent SQLite database. No dependency installation is needed. Requires Node.js 24 or later.

## Lessons, searches, and message replies

- Open **Admin panel → Content management → Lesson categories** to create, rename, or remove lesson categories. A category must be empty before it can be deleted.
- Open **Lessons** in Content management, or use **Add lesson** in the public Lessons section. A title, category, and paragraph are required. Examples are optional. You may upload one PNG, JPEG, or WebP picture up to 2 MB; add a short description for accessibility. Pictures are stored in the SQLite database and survive restarts. Edit a lesson to replace or remove its picture.
- To link a trick to a lesson, edit the trick under **Content** and choose its **Linked lesson**. A trick links to one lesson, and a lesson can have multiple tricks. The lesson displays its related tricks, and the trick links back to the lesson. Deleting a lesson unlinks its tricks without deleting them.
- The **Math Tricks** and **Lessons** sections each have a search bar. Lessons also filter by category. Searches match titles and content, including examples or formulas.
- Users can **Reply** to a received private message. Admins receive replies in their own inbox and can reply again. **Sent** shows sent messages and replies; replies include the original message for context. Other accounts cannot read or reply to these messages. If a sender is banned or removed, replies to them are blocked.
- Upgrading keeps existing accounts, content, and messages; keep your `data/` folder and `.env`. Restart the server and refresh the browser after replacing files. Include the new `lessons.mjs` and `public/lessons-ui.js` files when uploading the update.

## Open the website

Run `node --env-file-if-exists=.env server.mjs` in this folder, then open http://localhost:3210. On Windows you can use `Start-Math-Lab.cmd`.

Admin username: **yhyAdminQ**. Use the password supplied in your request. Only the salted password hash is included in server code; it is never included in browser files.

Click **Log in**, then **Admin panel** in the left navigation. There are two main categories:

- **Content management:** the existing Content, Categories, and Feedback tools for publishing lessons, editing category names and introductions, and reviewing feedback.
- **User management:** all registered accounts, newest first. Ban/unban accounts, permanently remove accounts, make members admins, and send private messages. Users receive messages through **Private messages** in the navigation, with an unread count that refreshes every 10 seconds while the site is open.

**Original admin protection:** `yhyAdminQ` cannot be banned, removed, demoted, renamed, or otherwise changed through account management. Other admins can manage and promote regular members. Only `yhyAdminQ` can demote, ban, or remove another admin. No admin can modify their own account through this panel. These restrictions are enforced on the server, and the original account also has database protection.

Bans immediately revoke sessions and block login until the account is unbanned; public lessons remain accessible without login. Removing an account permanently deletes its sessions, feedback, and received messages. Messages it previously sent remain in recipients' inboxes with the sender name preserved. Private inboxes are accessible only by the recipient, including when the requester is an admin. Removing an account is not a permanent ban on future registration.

To upgrade an existing copy, stop the old server, replace the application files, keep its `data/` folder and `.env`, then restart. Database migrations preserve existing accounts and content. The ZIP does not include live accounts, messages, or sessions.

The sections are Math Tricks, Math Exercises, Math AI Solver, Credits, Feedback, Announcements, and Lessons. Visitors can read content. Registered users can check exercise answers, reply privately, and send private feedback. The admin can manage all categories. Admin status is checked by the server on every protected request.

## Shared updates

All clients of this server use the same database in `data/math.sqlite`. New content and category edits trigger live browser updates. When a user is filling a form, the page preserves their work and shows a notification; the new content appears on their next category visit. Content and accounts survive server restarts. Feedback is visible only to its author and the admin.

## Connect the AI solver

The solver interface and server integration are implemented, but an actual AI response requires your own OpenAI API key. Copy `.env.example` to `.env`, set `OPENAI_API_KEY`, optionally choose an available `OPENAI_MODEL`, and restart the server. Never place a key in `public/`. The integration uses the [OpenAI Responses API](https://developers.openai.com/api/docs/quickstart), sends the submitted problem only, and sets `store: false`. It allows 10 questions per user per hour and 100 total questions per day. AI requests may incur charges on the API account. Live AI responses have not been tested because no API key was provided.

## Public hosting

This deliverable currently runs locally; it has no public URL. Deploy the folder to a host supporting Node.js 24 with a persistent disk, HTTPS, and long-lived HTTP connections. Set `HOST=0.0.0.0`, `APP_ORIGIN=https://your-domain.example`, `SECURE_COOKIES=true`, and `DB_PATH` to a persistent disk path. Configure the proxy to forward event streams without buffering. Serve one application instance sharing this SQLite file, rather than independent ephemeral copies. Back up the database using SQLite's backup facilities. The site is not compatible with static-only hosting.

The provided admin account is seeded only if it does not already exist. Passwords use scrypt, sessions use random HttpOnly cookies stored as hashes, forms enforce same-origin requests, and login attempts are rate limited. No self-service password recovery or email verification is included.

## Verification

Run `node --test test.mjs` for an isolated integration test. It checks registration, login, rejected privilege escalation, case-insensitive username uniqueness, cross-origin rejection, protected admin actions, shared reads and live events, edit/delete, category updates, exercise checking, feedback privacy/replies, restart persistence, logout, and the unconfigured solver state. Test records are stored in a temporary database, not your live website database.
