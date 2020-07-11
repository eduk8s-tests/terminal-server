import * as express from 'express';
import * as WebSocket from "ws"
import { Server } from 'http';

enum PacketType { HELLO, PING, DATA, RESIZE }

interface Packet {
    type: PacketType
    session: string
    data?: any
}

class TerminalSession {
}

export class TerminalServer {
    private socket_server: WebSocket.Server

    constructor(server: Server) {
        this.socket_server = new WebSocket.Server({ server })

        this.configure_handlers()
    }

    private configure_handlers() {
        let self = this

        this.socket_server.on("connection", function (ws: WebSocket) {
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
    }
}