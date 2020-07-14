import * as WebSocket from "ws"

import { v4 as uuidv4 } from 'uuid'

import * as pty from "node-pty"
import {IPty} from "node-pty"

import { Server } from "http"
import { Terminal } from "xterm"

enum PacketType { HELLO, PING, DATA, RESIZE, ERROR }

interface Packet {
    type: PacketType
    id: string
    args?: any
}

class TerminalSession {
    private sockets: WebSocket[] = []

    private terminal: IPty
    private buffer: string[]
    private buffer_limit: number = 50000

    constructor(public readonly id: string) {
        console.log("{CREATE}", id)
    }

    private create_subprocess() {
        let self = this

        console.log("{SUBPROCESS}")

        this.terminal = pty.spawn("/bin/bash", ["-il"], {
            name: "xterm-color",
            cols: 80,
            rows: 25,
            cwd: process.cwd(),
            env: <any> process.env
        })

        this.buffer = []

        this.terminal.onData(function (data) {
            let args = {data: data}

            self.broadcast_message(PacketType.DATA, args)

            // We need to add the data onto the sub process data buffer
            // used to send data to new client connections. We don't want
            // this to exceed a certain amount, but we also can't just
            // cut it at an arbitrary point in the character stream as
            // that could be in the middle of terminal escape sequence.
            // Thus buffer in blocks, and discard whole blocks until we
            // are under allowed maximum, or if only one block left.

            self.buffer.push(data)

            let sizes = self.buffer.map((s) => s.length)
            let total = sizes.reduce((s, c) => s + c, 0)

            while (self.buffer.length > 1 && total > self.buffer_limit) {
                let item = self.buffer.shift()
                total -= item.length
            }
        })

        this.terminal.onExit(function () {
            console.log("{EXIT}", self.id)
            self.terminal = null
            self.buffer = []
            self.close_connections()
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

        this.sockets.forEach(function (ws) {
            if (ws.readyState === WebSocket.OPEN)
                ws.send(message)
        })
    }

    private close_connections() {
        this.sockets.forEach(function (ws) { ws.close() })
    }

    handle_message(ws: WebSocket, packet: Packet) {
        let self = this

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

                    this.broadcast_message(PacketType.ERROR, {reason: "Hijacked"})

                    if (this.sockets.indexOf(ws) == -1)
                        this.sockets.push(ws)

                    // Push out to the new client any residual content in the
                    // sub process output buffer. Note that this will be based
                    // on old terminal size, so may not look pretty when it
                    // is displayed. A subsequent resize event should with
                    // luck fix that up, although, if there are two active
                    // clients with different screen sizes then the resize
                    // event will break the existing one.

                    let data: string = this.buffer.join('')

                    let args = {data: data}

                    this.send_message(ws, PacketType.DATA, args)
                }
                else {
                    this.send_message(ws, PacketType.ERROR, {reason: "Forbidden"})
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

                        this.terminal.resize(packet.args.cols, packet.args.rows+1)

                        // Devices will ignore resize request which is followed
                        // immediately by another, so need to wait a short
                        // period of time before sending resize with correct
                        // size again.

                        setTimeout(function() {
                            if (self.terminal)
                                self.terminal.resize(packet.args.cols, packet.args.rows)
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
        let self = this

        this.socket_server.on("connection", function (ws: WebSocket) {
            ws.on("message", function (message: string) {
                let packet: Packet = JSON.parse(message)
                let session: TerminalSession = self.retrieve_session(packet.id)

                session.handle_message(ws, packet)
            })
        
            ws.on("close", function (ws: WebSocket) {
                console.log("{CLOSE}", ws)
            })
        })
    }

    retrieve_session(id: string): TerminalSession {
        let session: TerminalSession = this.sessions.get(id)

        if (!session) {
            session = new TerminalSession(id)
            this.sessions.set(id, session)
        }

        return session
    }
}