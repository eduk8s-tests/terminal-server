import * as express from "express";
import * as path from 'path';
import * as WebSocket from "ws";

const BASEDIR = path.dirname(path.dirname(__dirname));

console.log(`Running with base directory of ${BASEDIR}.`)

const PORT = 8080;

const app = express();

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}.`);
});

app.set("views", path.join(BASEDIR, "src/backend/views"));
app.set("view engine", "pug");

app.use('/static/styles/terminal.css', express.static(path.join(BASEDIR, "src/frontend/styles/terminal.css")));
app.use('/static/scripts/terminal.js', express.static(path.join(BASEDIR, "built/frontend/scripts/terminal.js")));

app.use('/static/styles/xterm.css', express.static(path.join(BASEDIR, 'node_modules/xterm/css/xterm.css')));
app.use('/static/scripts/xterm.js', express.static(path.join(BASEDIR, 'node_modules/xterm/lib/xterm.js')));
app.use('/static/scripts/xterm-addon-fit.js', express.static(path.join(BASEDIR, 'node_modules/xterm-addon-fit/lib/xterm-addon-fit.js')));

app.get("/", (req, res) => {
    res.render("terminal")
});