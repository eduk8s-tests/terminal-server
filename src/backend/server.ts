import * as express from "express"
import * as path from "path"
import * as WebSocket from "ws"

import { TerminalServer } from "./terminals"

const BASEDIR = path.dirname(path.dirname(__dirname))

console.log(`Running with base directory of ${BASEDIR}.`)

const PORT = 8080

const app = express()

const server = app.listen(PORT, function () {
    console.log(`Server running on http://localhost:${PORT}.`)
})

let terminals = new TerminalServer(server);

app.set("views", path.join(BASEDIR, "src/backend/views"))
app.set("view engine", "pug")

app.use("/static/styles", express.static(path.join(BASEDIR, "src/frontend/styles")))
app.use("/static/scripts", express.static(path.join(BASEDIR, "built/frontend/scripts")))

app.use("/static/styles", express.static(path.join(BASEDIR, "node_modules/xterm/css")))

app.get("/", function (req, res) {
    res.render("terminals")
})

app.get("/terminal/session/:id", function (req, res) {
    let id = req.params.id || "1"
    let session = terminals.retrieve_session(id)
    res.render("terminal", {"session": session})
})