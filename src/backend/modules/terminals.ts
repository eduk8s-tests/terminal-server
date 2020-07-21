import * as WebSocket from "ws"

import { v4 as uuidv4 } from "uuid"

import * as pty from "node-pty"
import { IPty } from "node-pty"

import { Server } from "http"
import { Terminal } from "xterm"

enum PacketType { HELLO, PING, DATA, RESIZE, ERROR }

interface Packet {
    type: PacketType
    id: string
    args?: any
}

interface Bucket {
    seq: number
    data: string
}

class TerminalSession {
    private sockets: WebSocket[] = []

    private terminal: IPty
    private buffer: Bucket[]
    private buffer_size: number
    private buffer_limit: number = 50000

    private sequence: number

    constructor(public readonly id: string) {
        console.log("Initializing terminal session", id)
    }

    private create_subprocess() {
        this.terminal = pty.spawn("/bin/bash", ["-il"], {
            name: "xterm-color",
            cols: 80,
            rows: 25,
            cwd: process.cwd(),
            env: <any>process.env
        })

        this.buffer = []
        this.buffer_size = 0
        this.sequence = 0

        this.terminal.onData((data) => {
            let args = { data: data }

            this.broadcast_message(PacketType.DATA, args)

            // We need to add the data onto the sub process data buffer
            // used to send data to new client connections. We don't want
            // this to exceed a certain amount, but we also can't just
            // cut it at an arbitrary point in the character stream as
            // that could be in the middle of terminal escape sequence.
            // Thus buffer in blocks, and discard whole blocks until we
            // are under allowed maximum, or if only one block left.

            let bucket = {
                seq: ++this.sequence,
                data: data
            }

            this.buffer.push(bucket)
            this.buffer_size += data.length

            while (this.buffer.length > 1 && this.buffer_size > this.buffer_limit) {
                let item = this.buffer.shift()
                this.buffer_size -= item.data.length
            }
        })

        this.terminal.onExit(() => {
            console.log("Closing terminal session", this.id)

            this.terminal = null
            this.buffer = []
            this.buffer_size = 0
            this.sequence = 0
            this.close_connections()
        })
    }

    private send_message(ws: WebSocket, type: PacketType, args?: any) {
        if (ws.readyState !== WebSocket.OPEN)
            return

        let packet = {
            type: type,
            id: this.id
        }

        if (args !== undefined)
            packet["args"] = args

        let message = JSON.stringify(packet)

        ws.send(message)
    }

    private broadcast_message(type: PacketType, args?: any) {
        let packet = {
            type: type,
            id: this.id
        }

        if (args !== undefined)
            packet["args"] = args

        let message = JSON.stringify(packet)

        this.sockets.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN)
                ws.send(message)
        })
    }

    private close_connections() {
        this.sockets.forEach((ws) => { ws.close() })
    }

    cleanup_connection(ws: WebSocket) {
        let index = this.sockets.indexOf(ws)
        if (index != -1)
            this.sockets.splice(index, 1)
    }

    handle_message(ws: WebSocket, packet: Packet) {
        switch (packet.type) {
            case PacketType.DATA: {
                if (this.terminal)
                    this.terminal.write(packet.args.data)

                break
            }
            case PacketType.HELLO: {
                if (packet.args.token == TerminalServer.id) {
                    if (!this.terminal)
                        this.create_subprocess()

                    // Send notification to any existing sessions that this
                    // session is being hijacked by new client connection.

                    this.broadcast_message(PacketType.ERROR, { reason: "Hijacked" })

                    if (this.sockets.indexOf(ws) == -1) {
                        console.log("Attaching terminal session", this.id)
                        this.sockets.push(ws)
                    }

                    // Push out to the new client any residual content in the
                    // sub process output buffer. Note that this will be based
                    // on old terminal size, so may not look pretty when it
                    // is displayed. A subsequent resize event should with
                    // luck fix that up, although, if there are two active
                    // clients with different screen sizes then the resize
                    // event will break the existing one. We also only send
                    // any buffered data from after the sequence number which
                    // was supplied with the hello message.

                    let data = this.buffer.filter((bucket) => {
                        return bucket.seq > packet.args.seq
                    }).map((bucket) => { return bucket.data }).join("")

                    let seq = this.buffer.length ? this.buffer[this.buffer.length - 1].seq : packet.args.seq

                    let args = { data: data, seq: seq }

                    this.send_message(ws, PacketType.DATA, args)
                }
                else {
                    this.send_message(ws, PacketType.ERROR, { reason: "Forbidden" })
                    break
                }

                // This is intended to fall through in order to also trigger
                // an initial resize when connect based on size in hello
                // message.
            }
            case PacketType.RESIZE: {
                if (this.terminal) {
                    if (this.terminal.cols == packet.args.cols && this.terminal.rows == packet.args.rows) {
                        // The current and new size are the same, so we change
                        // size to be one row larger and then set back to the
                        // original size. This will trigger application to
                        // refresh screen at current size.

                        this.terminal.resize(packet.args.cols, packet.args.rows + 1)

                        // Devices will ignore resize request which is followed
                        // immediately by another, so need to wait a short
                        // period of time before sending resize with correct
                        // size again.

                        setTimeout(() => {
                            if (this.terminal)
                                this.terminal.resize(packet.args.cols, packet.args.rows)
                        }, 30);
                    }
                    else {
                        this.terminal.resize(packet.args.cols, packet.args.rows)
                    }
                }
                break
            }
        }
    }
}

export class TerminalServer {
    static id: string = uuidv4()

    private socket_server: WebSocket.Server

    private sessions = new Map<String, TerminalSession>()

    constructor(server: Server) {
        this.socket_server = new WebSocket.Server({ server })

        this.configure_handlers()
    }

    private configure_handlers() {
        this.socket_server.on("connection", (ws: WebSocket) => {
            ws.on("message", (message: string) => {
                let packet: Packet = JSON.parse(message)
                let session: TerminalSession = this.retrieve_session(packet.id)

                session.handle_message(ws, packet)
            })

            ws.on("close", () => {
                this.cleanup_connection(ws)
            })
        })
    }

    private retrieve_session(id: string): TerminalSession {
        let session: TerminalSession = this.sessions.get(id)

        if (!session) {
            session = new TerminalSession(id)
            this.sessions.set(id, session)
        }

        return session
    }

    private cleanup_connection(ws: WebSocket) {
        this.sessions.forEach((session: TerminalSession) => {
            session.cleanup_connection(ws)
        })
    }
}