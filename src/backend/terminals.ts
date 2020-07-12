import * as WebSocket from "ws"

import * as pty from 'node-pty';
import {IPty} from "node-pty";

import { Server } from 'http';

enum PacketType { HELLO, PING, DATA, RESIZE }

interface Packet {
    type: PacketType
    id: string
    data?: any
}

class TerminalSession {
    private sockets: WebSocket[] = []

    private subprocess: IPty

    constructor(public readonly id: string) {
        console.log('{CREATE}', id)

        this.subprocess = pty.spawn('/bin/bash', [], {
            name: 'xterm-color',
            cols: 80,
            rows: 25,
            cwd: process.cwd(),
            env: <any> process.env
        })

        this.configure_handlers()
    }

    private configure_handlers() {
        let self = this

        this.subprocess.onData(function (data) {
            let packet = {
                type: PacketType.DATA,
                id: self.id,
                data: data
            }

            self.send_message(packet)
        })

        this.subprocess.onExit(function () {
            console.log("{EXIT}", self.id)
        })
    }

    private send_message(packet: Packet) {
        let message = JSON.stringify(packet)
        this.sockets.forEach(function (ws) { ws.send(message) })
    }

    handle_message(ws: WebSocket, packet: Packet) {
        switch (packet.type) {
            case PacketType.HELLO: {
                if (this.sockets.indexOf(ws) == -1)
                    this.sockets.push(ws)
                break
            }
            case PacketType.DATA: {
                this.subprocess.write(packet.data)
                break
            }
            case PacketType.RESIZE: {
                this.subprocess.resize(packet.data.cols, packet.data.rows)
                break
            }
        }
    }
}

export class TerminalServer {
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