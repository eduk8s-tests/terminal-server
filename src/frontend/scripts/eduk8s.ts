import * as $ from "jquery"

import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"
import { WebLinksAddon } from "xterm-addon-web-links"

import { ResizeSensor } from "css-element-queries"

let FontFaceObserver = require('fontfaceobserver')

let _ = require("lodash")

var Split = require('split.js')

enum PacketType { HELLO, PING, DATA, RESIZE, ERROR }

interface Packet {
    type: PacketType
    id: string
    data?: any
}

class TerminalSession {
    private id: string
    private element: HTMLElement
    private endpoint: string
    private terminal: Terminal
    private fitter: FitAddon
    private sensor: ResizeSensor
    private socket: WebSocket

    constructor(id: string, element: HTMLElement, endpoint: string) {
        this.id = id
        this.element = element
        this.endpoint = endpoint

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

        let url = window.location.origin

        url = url.replace("https://", "wss://")
        url = url.replace("http://", "ws://")
        
        this.socket = new WebSocket(url)

        this.configure_handlers()
        this.configure_sensors()
    }

    private configure_handlers() {
        let self = this

        this.socket.onopen = function() {
            let data = {token: self.endpoint}
            self.send_message(PacketType.HELLO, data)
            self.resize_terminal()
            self.initiate_pings(self)
        }

        this.socket.onmessage = function (evt) {
            let packet: Packet = JSON.parse(evt.data)
            if (packet.id == self.id) {
                switch (packet.type) {
                    case (PacketType.DATA): {
                        self.terminal.write(packet.data)
                        break
                    }
                    case (PacketType.ERROR): {
                        self.terminal.write(`\r\n${packet.data.reason}\r\n`)
                        break
                    }
                }
            } else {
                console.warn("Client session " + self.id + " received message for session " + packet.id)
            }
        }

        this.socket.onclose = function(_evt: any) {
            self.write_output("\r\nClosed\r\n")
            $(self.element).addClass("dead")
        }

        this.terminal.onData(function(data) {
            self.send_message(PacketType.DATA, data)
        })
    }

    private configure_sensors() {
        console.log("Configure sensor", this.id)

        let self = this
        this.sensor = new ResizeSensor(this.element, _.throttle(function () {
            self.resize_terminal()
        }, 500))
    }

    private initiate_pings(self: TerminalSession) {
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

            let data = {cols: this.terminal.cols, rows: this.terminal.rows}
            this.send_message(PacketType.RESIZE, data)
        }
    }

    private send_message(type: PacketType, data?: any) : boolean {
        if (!this.socket)
            return false

        if (this.socket.readyState === WebSocket.OPEN) {
            let packet = {
                type: type,
                id: this.id
            }

            if (data !== undefined)
                packet["data"] = data

            this.socket.send(JSON.stringify(packet))

            return true
        }

        return false
    }

    write_output(data: string) {
        this.terminal.write(data)
    }

    write_input(data: string) {
        this.send_message(PacketType.DATA, data)
    }

    focus() {
        this.terminal.focus()
    }

    scrollToBottom() {
        this.terminal.scrollToBottom()
    }
}

class Dashboard {
    terminals: JQuery = $("#terminals")
    dashboard: JQuery = $("#dashboard")

    sessions: { [id: string]: TerminalSession } = {}

    constructor() {
        this.setup_dashboard()
        this.setup_terminals()
        this.setup_execute()
        this.setup_interrupt()
    }

    private setup_dashboard() {
        console.log("Setting up dashboard")

        if (this.dashboard) {
            Split(['#controls-pane', '#terminals-pane'], {
                gutterSize: 8,
                sizes: [20, 80],
                cursor: 'row-resize',
                snapOffset: 120,
                minSize: 0,
            })
        }
    }

    private setup_terminals() {
        // Check for "#terminals" first. If this occurs then we use it as a
        // container for hosting one or more terminals using iframes for each.
        // Can only be one such container since the ID must be unique.

        console.log("Setting up terminals")

        if (this.terminals != null) {
            // The number of terminals is dictated by the "terminal-layout"
            // data attribute present on the container.

            let layout: string = this.terminals.data("terminal-layout")
            let token: string = this.terminals.data("endpoint-id")

            if (layout == "split/2") {
                let grid: JQuery = $("<div>")

                $(this.terminals).append(grid)

                grid.append($("<div>", { id: "terminal-1", class: "terminal", "data-endpoint-id": token, "data-session-id": "1" }))
                grid.append($("<div>", { id: "terminal-2", class: "terminal", "data-endpoint-id": token, "data-session-id": "2" }))
                grid.append($("<div>", { id: "terminal-3", class: "terminal", "data-endpoint-id": token, "data-session-id": "3" }))

                Split(['#terminal-1', '#terminal-2', '#terminal-3'], {
                    gutterSize: 8,
                    sizes: [50, 25, 25],
                    direction: 'vertical'
                })
            }
            else if (layout == "split") {
                let grid: JQuery = $("<div>")

                $(this.terminals).append(grid)

                grid.append($("<div>", { id: "terminal-1", class: "terminal", "data-endpoint-id": token, "data-session-id": "1" }))
                grid.append($("<div>", { id: "terminal-2", class: "terminal", "data-endpoint-id": token, "data-session-id": "2" }))

                Split(['#terminal-1', '#terminal-2'], {
                    gutterSize: 8,
                    sizes: [60, 40],
                    direction: 'vertical'
                })
            }
            else {
                this.terminals.append($("<div>", { class: "terminal", "data-endpoint-id": token, "data-session-id": "1" }))
            }
        }

        // Now look for ".terminal". In this case we insert the actual
        // terminal directly into the page connected using a web socket.
        // Since using a class, there can be multiple instances. The id
        // of the terminal session being connected to is taken from the
        // "session-id" data attribute.

        let self = this

        $(".terminal").each(function (index: number, element: HTMLElement) {
            let id: string = $(element).data("session-id")
            let endpoint: string = $(element).data("endpoint-id")

            self.sessions[id] = new TerminalSession(id, element, endpoint)
        })
    }

    private setup_execute() {
        let self = this

        $(".execute").click(function (event) {
            let element = event.target
            let session_id = $(element).data("session-id")
            let input = $(element).data("input")

            let terminal = self.sessions[session_id]

            terminal.focus()
            terminal.scrollToBottom()
            terminal.write_input(input+"\n")
        })
    }

    private setup_interrupt() {
        let self = this

        $(".interrupt").click(function (event) {
            let element = event.target
            let session_id = $(element).data("session-id")

            let terminal = self.sessions[session_id]

            terminal.focus()
            terminal.scrollToBottom()
            terminal.write_input(String.fromCharCode(0x03))
        })
    }
}

function initialize_dashboard() {
    console.log("Initalizing dashboard")
    exports.dashboard = new Dashboard()
}

$(document).ready(function () {
    var font = new FontFaceObserver("SourceCodePro", {weight: 400});
       
    font.load().then(function () {
        console.log("Loaded fonts okay")
        initialize_dashboard()
    }), function () {
        console.log("Failed to load fonts")
        initialize_dashboard()
    }
})