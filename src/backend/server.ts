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

let terminals = new TerminalServer(server)

app.set("views", path.join(BASEDIR, "src/backend/views"))
app.set("view engine", "pug")

app.use("/static/images", express.static(path.join(BASEDIR, "src/frontend/images")))
app.use("/static/styles", express.static(path.join(BASEDIR, "src/frontend/styles")))
app.use("/static/scripts", express.static(path.join(BASEDIR, "built/frontend/scripts")))

app.use("/static/styles", express.static(path.join(BASEDIR, "node_modules/xterm/css")))

app.use("/static/fonts", express.static(path.join(BASEDIR, "fonts/SourceCodePro"), { maxAge: 3600000 }))

app.get("/", function (req, res) {
    res.render("terminals", {endpoint_id: TerminalServer.id})
})

app.get("/terminal/session/:session_id", function (req, res) {
    let session_id = req.params.session_id || "1"

    // We don't activate a server side terminal session at this point, that
    // will be done when the initial websocket message is sent. The access
    // token will be used to validate access.

    res.render("terminal", {endpoint_id: TerminalServer.id, session_id: session_id})
})