import * as $ from "jquery"

import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"

import { ResizeSensor } from "css-element-queries"

let _ = require("lodash")

let Split = require("split-grid")

class TerminalSession {
    name: string
    element: HTMLElement
    terminal: Terminal
    fitter: FitAddon
    sensor: ResizeSensor

    constructor(name: string, element: HTMLElement) {
        this.name = name
        this.element = element

        this.terminal = new Terminal()
        this.fitter = new FitAddon()

        this.terminal.open(this.element)
        this.terminal.loadAddon(this.fitter)

        let self = this

        this.sensor = new ResizeSensor(element, _.throttle(function () {
            self.resize_terminal()
        }, 500))
    }

    resize_terminal() {
        this.fitter.fit()
    }

    write_message(data: string) {
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
                    snapOffset: 0,
                    onDrag: function () {
                        console.log($('.terminals-grid').css('grid-template-rows'))
                    }
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
                    snapOffset: 0,
                    onDrag: function () {
                        console.log($('.terminals-grid').css('grid-template-rows'))
                    }
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

            self.sessions[name].write_message("Hello from \\x1B[1;3;31mxterm.js\x1B[0m $ ")
        })
    }
}

exports.dashboard = new Dashboard()