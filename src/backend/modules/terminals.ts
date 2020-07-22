import * as WebSocket from "ws"

import { v4 as uuidv4 } from "uuid"

import * as pty from "node-pty"
import { IPty } from "node-pty"

import { Server } from "http"
import { assert } from "console"

enum PacketType {
    HELLO,
    PING,
    DATA,
    RESIZE,
    ERROR
}

interface Packet {
    type: PacketType
    id: string
    args?: any
}

interface HelloPacketArgs {
    token: string
    cols: number
    rows: number
    seq: number
}

interface OutboundDataPacketArgs {
    data: string
    seq: number
}

interface InboundDataPacketArgs {
    data: string
}

interface ResizePacketArgs {
    cols: number
    rows: number
}

interface ErrorPacketArgs {
    reason: string
}

class TerminalSession {
    private sockets: WebSocket[] = []

    private terminal: IPty
    private buffer: OutboundDataPacketArgs[]
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
            // A incrementing sequence number is attached to each data
            // message sent so if a client needs to reconnect, it can
            // indicate what data it has seen previously so not replaying
            // data it has already seen.

            let args: OutboundDataPacketArgs = {
                data: data,
                seq: ++this.sequence
            }

            this.broadcast_message(PacketType.DATA, args)

            // We need to add the data onto the sub process data buffer
            // used to send data to new client connections. We don't want
            // this to exceed a certain amount, but we also can't just
            // cut it at an arbitrary point in the character stream as
            // that could be in the middle of terminal escape sequence.
            // Thus buffer in blocks, and discard whole blocks until we
            // are under allowed maximum, or if only one block left.

            this.buffer.push(args)
            this.buffer_size += data.length

            while (this.buffer.length > 1 && this.buffer_size > this.buffer_limit) {
                let item = this.buffer.shift()
                this.buffer_size -= item.data.length
            }
        })

        this.terminal.onExit(() => {
            // If the terminal process exits, clean things up so that
            // next time a connection is made to this session, a new
            // terminal process is created.

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

    close_connections() {
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
                if (this.terminal) {
                    let args: InboundDataPacketArgs = packet.args

                    this.terminal.write(args.data)
                }

                break
            }
            case PacketType.HELLO: {
                let args: HelloPacketArgs = packet.args

                if (args.token == SessionManager.instance.id) {
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
                    // was supplied with the HELLO message.

                    let data: string = this.buffer.filter((bucket) => {
                        return bucket.seq > packet.args.seq
                    }).map((bucket) => { return bucket.data }).join("")

                    let len: number = this.buffer.length
                    let seq: number = len ? this.buffer[len - 1].seq : packet.args.seq

                    let args: OutboundDataPacketArgs = {
                        data: data,
                        seq: seq
                    }

                    this.send_message(ws, PacketType.DATA, args)
                }
                else {
                    // Is expecting that the client sends in the HELLO
                    // message a token which identifies the terminal
                    // server. If they don't match, the session is rejected.

                    console.log("Rejecting terminal session", this.id)

                    let args: ErrorPacketArgs = { reason: "Forbidden" }

                    this.send_message(ws, PacketType.ERROR, args)

                    break
                }

                // This is intended to fall through in order to also trigger
                // an initial resize when connect based on size in HELLO
                // message.
            }
            case PacketType.RESIZE: {
                if (this.terminal) {
                    let args: ResizePacketArgs = packet.args

                    if (this.terminal.cols == args.cols && this.terminal.rows == args.rows) {
                        // The current and new size are the same, so we change
                        // size to be one row larger and then set back to the
                        // original size. This will trigger application to
                        // refresh screen at current size.

                        this.terminal.resize(args.cols, args.rows + 1)

                        // Devices will ignore resize request which is followed
                        // immediately by another, so need to wait a short
                        // period of time before sending resize with correct
                        // size again.

                        setTimeout(() => {
                            if (this.terminal)
                                this.terminal.resize(args.cols, args.rows)
                        }, 30);
                    }
                    else {
                        this.terminal.resize(args.cols, args.rows)
                    }
                }

                break
            }
        }
    }
}

class SessionManager {
    static instance: SessionManager

    id: string = uuidv4()

    private server: Server
    private socket_server: WebSocket.Server

    private sessions = new Map<String, TerminalSession>()

    private constructor(server: Server) {
        this.server = server
        this.socket_server = new WebSocket.Server({ server })

        this.configure_handlers()
    }

    static get_instance(server?: Server): SessionManager {
        if (!server)
            return SessionManager.instance
            
        if (SessionManager.instance)
            assert(server == SessionManager.instance.server)
        else
            SessionManager.instance = new SessionManager(server)

        return SessionManager.instance;
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

    close_all_sessions() {
        this.sessions.forEach((session: TerminalSession) => {
            session.close_connections()
        })
    }
}

export class TerminalServer {
    id: string

    constructor(server: Server) {
        this.id = SessionManager.get_instance(server).id
    }

    close_all_sessions() {
        SessionManager.get_instance().close_all_sessions()
    }
}