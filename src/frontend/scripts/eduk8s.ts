import * as $ from "jquery"

import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"

import { ResizeSensor } from "css-element-queries"

let _ = require("lodash")

let Split = require("split-grid")

enum PacketType { HELLO, PING, DATA, RESIZE }

interface Packet {
    type: PacketType
    session: string
    data?: any
}

class TerminalSession {
    name: string
    element: HTMLElement
    terminal: Terminal
    fitter: FitAddon
    sensor: ResizeSensor
    socket: WebSocket

    constructor(name: string, element: HTMLElement) {
        this.name = name
        this.element = element

        this.terminal = new Terminal({
            cursorBlink: true
        })

        this.fitter = new FitAddon()
        this.terminal.loadAddon(this.fitter)

        let self = this

        function wait_until_visible() {
            if (!self.element.offsetParent)
                setTimeout(wait_until_visible, 300)
            else
                self.configure_session()
          }
    
        wait_until_visible()
    }

    private configure_session() {
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
            self.send_message(PacketType.HELLO)
            self.resize_terminal()
            self.initiate_pings(self)
        }

        this.socket.onmessage = function (evt) {
            let packet: Packet = JSON.parse(evt.data)
            if (packet.session == self.name) {
                if (packet.type == PacketType.DATA)
                    self.terminal.write(packet.data)
            } else {
                console.warn("Client session " + self.name + " received message for session " + packet.session)
            }
        }

        this.socket.onclose = function(_evt: any) {
            self.terminal.write("\r\nClosed\r\n")
        }

        this.terminal.onData(function(data) {
            self.send_message(PacketType.DATA, data)
        })
    }

    private configure_sensors() {
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
        if (this.element.clientWidth > 0 && this.element.clientHeight > 0) {
            this.fitter.fit()

            let data = { cols: this.terminal.cols, rows: this.terminal.rows}
            this.send_message(PacketType.RESIZE, data)
        }
    }

    private send_message(type: PacketType, data?: any) : boolean {
        if (!this.socket)
            return false

        if (this.socket.readyState === WebSocket.OPEN) {
            let packet = {
                type: type,
                session: this.name
            }

            if (data !== undefined)
                packet["data"] = data

            this.socket.send(JSON.stringify(packet))

            return true
        }

        return false
    }

    write_text(data: string) {
        this.terminal.write(data)
    }
}

class Dashboard {
    terminals: JQuery = $("#terminals")

    sessions: { [id: string]: TerminalSession } = {}

    constructor() {
        this.setup_terminals()
    }

    setup_terminals() {
        // Check for "#terminals" first. If this occurs then we use it as a
        // container for hosting one or more terminals using iframes for each.
        // Can only be one such container since the ID must be unique.

        if (this.terminals != null) {
            // The number of terminals is dictated by the "layout" data
            // attribute present on the container.

            let layout: string = this.terminals.data("layout")

            if (layout == "split/2") {
                let grid: JQuery = $("<div>", { class: "terminals-grid" }).css("grid-template-rows", "2fr 8px 1fr 8px 1fr")

                $(this.terminals).append(grid)

                let gutter1: JQuery = $("<div>", { class: "terminals-horizontal-gutter-1" })
                let gutter2: JQuery = $("<div>", { class: "terminals-horizontal-gutter-2" })

                grid.append($("<div>", { class: "terminal", "data-session": "1" }))
                grid.append(gutter1)
                grid.append($("<div>", { class: "terminal", "data-session": "2" }))
                grid.append(gutter2)
                grid.append($("<div>", { class: "terminal", "data-session": "3" }))

                Split({
                    rowGutters: [
                        { track: 1, element: gutter1.get(0) },
                        { track: 3, element: gutter2.get(0) }
                    ],
                    minSize: 150,
                    snapOffset: 0
                })
            }
            else if (layout == "split") {
                let grid: JQuery = $("<div>", { class: "terminals-grid" }).css("grid-template-rows", "2fr 8px 1fr")

                $(this.terminals).append(grid)

                let gutter1: JQuery = $("<div>", { class: "terminals-horizontal-gutter-1" })

                grid.append($("<div>", { class: "terminal", "data-session": "1" }))
                grid.append(gutter1)
                grid.append($("<div>", { class: "terminal", "data-session": "2" }))

                Split({
                    rowGutters: [
                        { track: 1, element: gutter1.get(0) }
                    ],
                    minSize: 150,
                    snapOffset: 0
                })
            }
            else {
                this.terminals.append($("<div>", { class: "terminal", "data-session": "1" }))
            }
        }

        // Now look for ".terminal". In this case we insert the actual
        // terminal directly into the page connected using a web socket.
        // Since using a class, there can be multiple instances. The name
        // of the terminal session being connected to is taken from the
        // "session" data attribute.

        let self = this

        $(".terminal").each(function (index: number, element: HTMLElement) {
            let name: string = $(element).data("session")

            self.sessions[name] = new TerminalSession(name, element)
        })
    }
}

function initialize_dashboard() {
    exports.dashboard = new Dashboard()
}

$(document).ready(initialize_dashboard)