import * as express from "express"
import * as path from "path"
import * as WebSocket from "ws"

import { TerminalServer } from "./modules/terminals"

const BASEDIR = path.dirname(path.dirname(__dirname))

const PORT = 8080

const app = express()

const server = app.listen(PORT, () => {
    console.log(`HTTP server running on http://localhost:${PORT}.`)
})

let terminals = new TerminalServer(server)

app.set("views", path.join(BASEDIR, "src/backend/views"))
app.set("view engine", "pug")

app.use("/static/images", express.static(path.join(BASEDIR, "src/frontend/images")))
app.use("/static/styles", express.static(path.join(BASEDIR, "src/frontend/styles")))
app.use("/static/scripts", express.static(path.join(BASEDIR, "build/frontend/scripts")))

app.use("/static/styles", express.static(path.join(BASEDIR, "node_modules/xterm/css")))
app.use("/static/styles", express.static(path.join(BASEDIR, "node_modules/bootstrap/dist/css")))

app.use("/static/fonts", express.static(path.join(BASEDIR, "fonts/SourceCodePro"), { maxAge: 3600000 }))

app.get("/", (req, res) => {
    res.redirect("/terminal/session/1")
})

app.get("/terminal/testing/", (req, res) => {
    res.render("testing/dashboard", { endpoint_id: terminals.id })
})

app.get("/terminal/session/:session_id", (req, res) => {
    let session_id = req.params.session_id || "1"

    res.render("terminal", { endpoint_id: terminals.id, session_id: session_id })
})

function handle_shutdown() {
    console.info('Starting shutdown.')
    console.log('Closing HTTP server.')
    server.close(() => {
        console.log('HTTP server closed.')
        process.exit(0)
    })
}

process.on('SIGTERM', handle_shutdown)
process.on('SIGINT', handle_shutdown)