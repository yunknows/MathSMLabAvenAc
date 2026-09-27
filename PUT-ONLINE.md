# Put the actual Math SM Lab website online

This is the same application as the localhost website, including login, the owner account, both admin panels, account controls, messages, and shared content. GitHub Pages cannot run its server. Moving index.html to the repository root will not make these features work.

## Deploy using Render

This option uses **paid hosting and a paid persistent disk**. Review the cost shown by Render before approving deployment. Nothing has been purchased or deployed for you.

1. Extract the ZIP. In your GitHub repository, upload the extracted files and the entire public folder. Put render.yaml, server.mjs, and package.json at the repository's top level. Do not upload your .env or data folder.
2. Open https://dashboard.render.com/ and sign in. Choose **New → Blueprint** and connect your GitHub repository.
3. Render reads render.yaml. Review the service and disk charges before deploying. The included configuration runs the real website and saves its database on a persistent disk.
4. After deployment succeeds, open the service's HTTPS URL shown by Render. This is your website address; use it instead of the github.io address or localhost.
5. Log in with yhyAdminQ and the password you originally supplied. Users can create accounts from the same website.

The application automatically uses Render's URL for login and form security. If you later add a custom domain, set APP_ORIGIN to its exact HTTPS origin.

This is a fresh online installation: it contains the built-in starter lessons. Local accounts, private messages, and content changes are not transferred by uploading code. To preserve those, the SQLite database needs a separate private migration; do not put it in your GitHub repository.

The AI solver still needs OPENAI_API_KEY in Render's Environment settings. The other features work without it.

See [Render Blueprints](https://render.com/docs/infrastructure-as-code) and [persistent disks](https://render.com/docs/disks).
