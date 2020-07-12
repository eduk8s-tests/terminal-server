import * as express from 'express';
import * as WebSocket from "ws"

import { Server } from 'http';

enum PacketType { HELLO, PING, DATA, RESIZE }

interface Packet {
    type: PacketType
    id: string
    data?: any
}

class TerminalSession {
    private sockets: WebSocket[] = []

    constructor(public readonly id: string) {
        console.log('{CREATE}', id)
    }

    handle_message(ws: WebSocket, packet: Packet) {
        console.log("{PACKET}", packet.type, packet.id, packet.data)

        if (packet.type == PacketType.HELLO) {
            if (this.sockets.indexOf(ws) == -1)
                this.sockets.push(ws)

            let reply = {
                type: PacketType.DATA,
                id: packet.id,
                data: "Hello there!\r\n"
            }

            this.send_message(reply)
        }
        else if (packet.type == PacketType.RESIZE) {
            let reply = {
                type: PacketType.DATA,
                id: packet.id,
                data: `Resized to ${JSON.stringify(packet.data)}\r\n`
            }

            this.send_message(reply)
        }
    }

    private send_message(packet: Packet) {
        let message = JSON.stringify(packet)
        this.sockets.forEach(function (ws) { ws.send(message) })
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