import * as express from "express"
import * as path from "path"
import * as WebSocket from "ws"

const BASEDIR = path.dirname(path.dirname(__dirname))

console.log(`Running with base directory of ${BASEDIR}.`)

const PORT = 8080

const app = express()

const server = app.listen(PORT, function () {
    console.log(`Server running on http://localhost:${PORT}.`)
})

const wss = new WebSocket.Server({ server })

enum PacketType { HELLO, PING, DATA, RESIZE }

interface Packet {
    type: PacketType
    session: string
    data?: any
}

wss.on("connection", function (ws: WebSocket) {
    ws.on("message", function (message: string) {
        const packet: Packet = JSON.parse(message)

        // XXX
        if (packet.type == PacketType.HELLO) {
            let reply = {
                type: PacketType.DATA,
                session: packet.session,
                data: "Hello there!\r\n"
            }

            ws.send(JSON.stringify(reply))
        }

        if (packet.type == PacketType.RESIZE) {
            let reply = {
                type: PacketType.DATA,
                session: packet.session,
                data: `Resized to ${JSON.stringify(packet.data)}\r\n`
            }

            ws.send(JSON.stringify(reply))
        }
        // XXX

        console.log("{PACKET}", packet.type, packet.session, packet.data)
    })

    ws.on("close", function (ws: WebSocket) {
        console.log("CLOSE", ws)
    })
})

app.set("views", path.join(BASEDIR, "src/backend/views"))
app.set("view engine", "pug")

app.use("/static/styles", express.static(path.join(BASEDIR, "src/frontend/styles")))
app.use("/static/scripts", express.static(path.join(BASEDIR, "built/frontend/scripts")))

app.use("/static/styles", express.static(path.join(BASEDIR, "node_modules/xterm/css")))

app.get("/", function (req, res) {
    res.render("terminals")
})

app.get("/terminal/session/:id", function (req, res) {
    let session = req.params.id

    res.render("terminal", {"session": session})
})