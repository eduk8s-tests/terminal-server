import * as $ from "jquery"

let Split = require("split-grid")

class Dashboard {
    terminals: JQuery = $("#terminals")

    constructor() {
        this.setup_terminals()
    }

    setup_terminals() {
        if (this.terminals == null)
            return

        let layout: string = this.terminals.data("layout")

        if (layout == "split/2") {
            let grid: JQuery = $("<div>", { class: "terminals-grid" }).css("grid-template-rows", "2fr 8px 1fr 8px 1fr")

            $(this.terminals).append(grid)

            let gutter1: JQuery = $("<div>", { class: "terminals-horizontal-gutter-1" })
            let gutter2: JQuery = $("<div>", { class: "terminals-horizontal-gutter-2" })

            grid.append($("<div>").append($("<iframe>", { src: "/terminal/session/1" })))
            grid.append(gutter1)
            grid.append($("<div>").append($("<iframe>", { src: "/terminal/session/2" })))
            grid.append(gutter2)
            grid.append($("<div>").append($("<iframe>", { src: "/terminal/session/3" })))

            Split({
                rowGutters: [
                    { track: 1, element: gutter1.get(0) },
                    { track: 3, element: gutter2.get(0) }
                ],
                minSize: 150,
                snapOffset: 0,
                onDrag: function () {
                    console.log('xxx', $('.terminals-grid').css('grid-template-rows'));
                }
            });
        }
        else if (layout == "split") {
            let grid: JQuery = $("<div>", { class: "terminals-grid" }).css("grid-template-rows", "2fr 8px 1fr")

            $(this.terminals).append(grid)

            let gutter1: JQuery = $("<div>", { class: "terminals-horizontal-gutter-1" })

            grid.append($("<div>").append($("<iframe>", { src: "/terminal/session/1" })))
            grid.append(gutter1)
            grid.append($("<div>").append($("<iframe>", { src: "/terminal/session/2" })))

            Split({
                rowGutters: [
                    { track: 1, element: gutter1.get(0) }
                ],
                minSize: 150,
                snapOffset: 0,
                onDrag: function () {
                    console.log('xxx', $('.terminals-grid').css('grid-template-rows'))
                }
            })
        }
        else {
            $(this.terminals).append($("<iframe>", { src: "/terminal/session/1" }))
        }


    }
}

function setup_page_layout() {
    Split({
        rowGutters: [{
            track: 1,
            element: document.querySelector('.horizontal-gutter-1'),
        }],
        minSize: 150,
        snapOffset: 0,
        onDrag: function () {
            console.log('xxx', (<HTMLElement>document.querySelector('.grid')).style['grid-template-rows'])
        }
    })
}

exports.dashboard = new Dashboard()