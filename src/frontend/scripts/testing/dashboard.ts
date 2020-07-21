import * as $ from "jquery"

var Split = require('split.js')

declare var eduk8s: any

function initialize_dashboard() {
    console.log("Initalizing dashboard")

    let self = this

    let terminals: JQuery = $("#terminals")
    let dashboard: JQuery = $("#dashboard")

    if (dashboard) {
        Split(['#controls-pane', '#terminals-pane'], {
            gutterSize: 8,
            sizes: [20, 80],
            cursor: 'row-resize',
            snapOffset: 120,
            minSize: 0,
        })
    }

    if (terminals) {
        Split(['#terminal-1', '#terminal-2'], {
            gutterSize: 8,
            sizes: [60, 40],
            direction: 'vertical'
        })
    }

    $(".execute").click(function (event) {
        let element = event.target
        let session_id = $(element).data("session-id")
        let input = $(element).data("input")

        eduk8s.terminals.execute_in_terminal(input, session_id)
    })

    $(".disconnect").click(function (event) {
        let element = event.target
        let session_id = $(element).data("session-id")

        eduk8s.terminals.disconnect_terminal(session_id)
    })

    $(".reconnect").click(function (event) {
        let element = event.target
        let session_id = $(element).data("session-id")

        eduk8s.terminals.reconnect_terminal(session_id)
    })
}

$(document).ready(function () {
    initialize_dashboard()
})