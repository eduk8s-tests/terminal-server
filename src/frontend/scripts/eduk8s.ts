import * as $ from "jquery"

import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"
import { WebLinksAddon } from "xterm-addon-web-links"

import { ResizeSensor } from "css-element-queries"

let FontFaceObserver = require("fontfaceobserver")

let _ = require("lodash")

let Split = require("split.js")

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
    token: string,
    cols: number,
    rows: number,
    seq: number
}

interface InboundDataPacketArgs {
    data: string,
    seq: number
}

interface OutboundDataPacketArgs {
    data: string
}

interface ResizePacketArgs {
    cols: number,
    rows: number
}

interface ErrorPacketArgs {
    reason: string
}

/** Class representing client side of terminal session. */
class TerminalSession {
    /** The session ID for the terminal session. */
    private id: string

    private element: HTMLElement
    private endpoint: string
    private terminal: Terminal
    private fitter: FitAddon
    private sensor: ResizeSensor
    private socket: WebSocket
    private sequence: number

    private reconnecting: boolean
    private shutdown: boolean

    /**
     * Initializes client side endpoint of terminal session.
     * @param id The session ID for the terminal session.
     * @param element The HTML element to inject the terminal into.
     * @param endpoint The server side ID for terminal server.
     */
    constructor(id: string, element: HTMLElement, endpoint: string) {
        this.id = id
        this.element = element
        this.endpoint = endpoint
        this.sequence = -1

        this.shutdown = false
        this.reconnecting = false

        this.terminal = new Terminal({
            cursorBlink: true,
            fontFamily: "SourceCodePro"
        })

        this.fitter = new FitAddon()
        this.terminal.loadAddon(this.fitter)

        this.terminal.loadAddon(new WebLinksAddon())

        let self = this

        function wait_until_visible() {
            console.log("Checking if visible", self.id)
            if (!self.element.offsetParent)
                setTimeout(wait_until_visible, 300)
            else
                self.configure_session()
        }

        wait_until_visible()
    }

    private configure_session() {
        console.log("Configure terminal session", this.id)

        this.terminal.open(this.element)

        // We fit the window now. The size details will be sent with the
        // initial hello message sent to the terminal server.

        this.fitter.fit()

        let url = window.location.origin

        url = url.replace("https://", "wss://")
        url = url.replace("http://", "ws://")

        this.socket = new WebSocket(url)

        this.configure_handlers()
        this.configure_sensors()

        if (this.id == "1")
            this.focus()
    }

    private configure_handlers() {
        if (this.shutdown)
            return

        $(this.element).removeClass("notify-closed")

        this.socket.onopen = () => {
            this.reconnecting = false

            // We set the data chunk sequence number to 0, to indicate
            // we want all available buffered data.

            let args: HelloPacketArgs = {
                token: this.endpoint,
                cols: this.terminal.cols,
                rows: this.terminal.rows,
                seq: this.sequence
            }

            this.send_message(PacketType.HELLO, args)

            if (this.sequence == -1) {
                this.terminal.onData((data) => {
                    let args: OutboundDataPacketArgs = { data: data }
                    this.send_message(PacketType.DATA, args)
                })

                this.initiate_pings()
                this.sequence = 0
            }
        }

        this.socket.onmessage = (evt) => {
            let packet: Packet = JSON.parse(evt.data)
            if (packet.id == this.id) {
                switch (packet.type) {
                    case (PacketType.DATA): {
                        let args: InboundDataPacketArgs = packet.args
                        this.sequence = args.seq
                        this.terminal.write(args.data)
                        break
                    }
                    case (PacketType.ERROR): {
                        let args: ErrorPacketArgs = packet.args
                        $(this.element).addClass(`notify-${args.reason.toLowerCase()}`)
                        break
                    }
                }
            } else {
                console.warn("Client session " + this.id + " received message for session " + packet.id)
            }
        }

        this.socket.onclose = (_evt: any) => {
            let self = this

            this.socket.close()
            this.socket = null

            if (this.shutdown)
                return

            function connect() {
                if (this.shutdown)
                    return

                let url = window.location.origin

                url = url.replace("https://", "wss://")
                url = url.replace("http://", "ws://")

                self.socket = new WebSocket(url)

                self.configure_handlers()
            }

            this.reconnecting = true

            setTimeout(connect, 100)

            function terminate() {
                if (!self.reconnecting)
                    return

                self.reconnecting = false
                self.shutdown = true

                $(self.element).addClass("notify-closed")

                self.write("\r\nClosed\r\n")
            }

            setTimeout(terminate, 1000)
        }
    }

    private configure_sensors() {
        console.log("Configure sensor", this.id)

        this.sensor = new ResizeSensor(this.element, _.throttle(() => {
            this.resize_terminal()
        }, 500))
    }

    private initiate_pings() {
        let self = this

        function ping() {
            self.send_message(PacketType.PING)
            setTimeout(ping, 15000)
        }

        setTimeout(ping, 15000)
    }

    private resize_terminal() {
        console.log("Resize terminal", this.id)
        if (this.element.clientWidth > 0 && this.element.clientHeight > 0) {
            this.fitter.fit()

            let args: ResizePacketArgs = {
                cols: this.terminal.cols,
                rows: this.terminal.rows
            }

            this.send_message(PacketType.RESIZE, args)
        }
    }

    private send_message(type: PacketType, args?: any): boolean {
        if (!this.socket)
            return false

        if (this.socket.readyState === WebSocket.OPEN) {
            let packet = {
                type: type,
                id: this.id
            }

            if (args !== undefined)
                packet["args"] = args

            this.socket.send(JSON.stringify(packet))

            return true
        }

        return false
    }

    write(text: string) {
        this.terminal.write(text)
    }

    focus() {
        this.terminal.focus()
    }

    scrollToBottom() {
        this.terminal.scrollToBottom()
    }

    paste(text: string) {
        this.terminal.paste(text)
    }

    close() {
        if (this.socket)
            this.socket.close()
    }

    reconnect() {
        if (!this.shutdown)
            return

        this.shutdown = false
        this.sequence = 0

        // this.terminal.clear()

        let self = this

        function connect() {
            if (this.shutdown)
                return

            let url = window.location.origin

            url = url.replace("https://", "wss://")
            url = url.replace("http://", "ws://")

            self.socket = new WebSocket(url)

            self.configure_handlers()
        }

        this.reconnecting = true

        setTimeout(connect, 100)

        function terminate() {
            if (!self.reconnecting)
                return

            self.reconnecting = false
            self.shutdown = true
        }

        setTimeout(terminate, 1000)
    }
}

class Terminals {
    sessions: { [id: string]: TerminalSession } = {}

    constructor() {
        // Search for ".terminal". In this case we insert the actual
        // terminal directly into the page connected using a web socket.
        // Since using a class, there can be multiple instances. The id
        // of the terminal session being connected to is taken from the
        // "session-id" data attribute.

        $(".terminal").each((index: number, element: HTMLElement) => {
            let id: string = $(element).data("session-id")
            let endpoint: string = $(element).data("endpoint-id")

            this.sessions[id] = new TerminalSession(id, element, endpoint)
        })
    }

    paste_to_terminal(text: string, id: string = "1") {
        let terminal = this.sessions[id]

        if (terminal)
            terminal.paste(text)
    }

    paste_to_all_terminals(text: string) {
        for (let id in this.sessions)
            this.sessions[id].paste(text)
    }

    interrupt_terminal(id: string = "1") {
        let terminal = this.sessions[id]

        if (terminal) {
            terminal.focus()
            terminal.scrollToBottom()
            terminal.paste(String.fromCharCode(0x03))
        }
    }

    interrupt_all_terminals() {
        for (let id in this.sessions) {
            let terminal = this.sessions[id]

            terminal.focus()
            terminal.scrollToBottom()
            terminal.paste(String.fromCharCode(0x03))
        }
    }

    execute_in_terminal(command: string, id: string = "1") {
        if (command == "<ctrl-c>" || command == "<ctrl+c>")
            return this.interrupt_terminal(id)

        let terminal = this.sessions[id]

        if (terminal) {
            terminal.focus()
            terminal.scrollToBottom()
            terminal.paste(command + "\r")
        }
    }

    execute_in_all_terminals(command: string) {
        for (let id in this.sessions) {
            let terminal = this.sessions[id]

            terminal.focus()
            terminal.scrollToBottom()
            terminal.paste(command + "\r")
        }
    }

    disconnect_terminal(id: string = "1") {
        let terminal = this.sessions[id]

        if (terminal)
            terminal.close()
    }

    disconnect_all_terminals() {
        for (let id in this.sessions)
            this.sessions[id].close()
    }

    reconnect_terminal(id: string = "1") {
        let terminal = this.sessions[id]

        if (terminal)
            terminal.reconnect()
    }

    reconnect_all_terminals() {
        for (let id in this.sessions)
            this.sessions[id].reconnect()
    }
}

function initialize_terminals() {
    console.log("Initalizing terminals")
    exports.terminals = new Terminals()
}

$(document).ready(() => {
    var font = new FontFaceObserver("SourceCodePro", { weight: 400 });

    font.load().then(() => {
        console.log("Loaded fonts okay")
        initialize_terminals()
    }), () => {
        console.log("Failed to load fonts")
        initialize_terminals()
    }
})