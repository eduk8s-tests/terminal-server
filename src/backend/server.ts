import * as express from "express";
import * as path from "path";
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

app.use("/static/styles", express.static(path.join(BASEDIR, "src/frontend/styles")));
app.use("/static/scripts", express.static(path.join(BASEDIR, "built/frontend/scripts")));

app.use("/static/scripts/require.js", express.static(path.join(BASEDIR, "node_modules/requirejs/require.js")));

app.use("/static/scripts", express.static(path.join(BASEDIR, "node_modules/split-grid/dist")));

app.use("/static/styles", express.static(path.join(BASEDIR, "node_modules/xterm/css")));
app.use("/static/scripts", express.static(path.join(BASEDIR, "node_modules/xterm/lib")));

app.use("/static/scripts", express.static(path.join(BASEDIR, "node_modules/xterm-addon-fit/lib")));

app.get("/", (req, res) => {
    res.render("terminals-iframe");
});

app.get("/terminal/session/:id", (req, res) => {
    let session = req.params.id;

    res.render("terminal", {"session": session})
});