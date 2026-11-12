// Vite names the built page after its source (app.html); hosts expect index.html.
import { renameSync } from 'node:fs';
renameSync(`${process.argv[2]}/app.html`, `${process.argv[2]}/index.html`);
